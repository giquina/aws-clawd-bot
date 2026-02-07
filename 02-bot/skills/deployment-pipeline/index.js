/**
 * Deployment Pipeline Skill for ClawdBot
 *
 * Combined test -> deploy -> verify pipeline with deployment history tracking.
 * Orchestrates the full deployment lifecycle in a single command, aborting
 * early if any stage fails (tests fail = no deploy, deploy fails = no verify).
 *
 * Commands:
 *   pipeline deploy <repo>      - Run full pipeline: test -> deploy -> verify
 *   pipeline <repo>             - Alias for pipeline deploy
 *   pipeline status             - Show recent deployments across all repos
 *   deploy history              - Alias for pipeline status
 *   pipeline rollback <repo>    - Rollback last deployment (redeploy previous version)
 *
 * @module skills/deployment-pipeline
 */

const BaseSkill = require('../base-skill');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Known project paths on EC2
const PROJECT_PATHS = {
  'judo': '/opt/projects/JUDO',
  'lusotown': '/opt/projects/LusoTown',
  'armora': '/opt/projects/armora',
  'gqcars-manager': '/opt/projects/gqcars-manager',
  'gq-cars-driver-app': '/opt/projects/gq-cars-driver-app',
  'giquina-accountancy-direct-filing': '/opt/projects/giquina-accountancy-direct-filing',
  'aws-clawd-bot': '/opt/clawd-bot',
  'clawd-bot': '/opt/clawd-bot',
};

// Health endpoints for post-deploy verification
const HEALTH_ENDPOINTS = {
  'aws-clawd-bot': 'http://localhost:3000/health',
  'clawd-bot': 'http://localhost:3000/health',
};

class DeploymentPipelineSkill extends BaseSkill {
  name = 'deployment-pipeline';
  description = 'Combined test -> deploy -> verify pipeline with deployment history';
  priority = 22;

  commands = [
    {
      pattern: /^pipeline\s+deploy\s+(\S+)$/i,
      description: 'Run full deployment pipeline (test -> deploy -> verify)',
      usage: 'pipeline deploy <repo>'
    },
    {
      pattern: /^pipeline\s+(?!status|rollback|deploy)(\S+)$/i,
      description: 'Shorthand for pipeline deploy',
      usage: 'pipeline <repo>'
    },
    {
      pattern: /^(?:pipeline\s+status|deploy\s+history)$/i,
      description: 'Show recent deployment history across all repos',
      usage: 'pipeline status'
    },
    {
      pattern: /^pipeline\s+rollback\s+(\S+)$/i,
      description: 'Rollback last deployment for a repo',
      usage: 'pipeline rollback <repo>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.deployHistory = [];
    this.maxHistory = 50;
    this.activePipelines = new Map(); // repo -> boolean, prevents concurrent deploys
    this.isEC2 = process.platform === 'linux';
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Pipeline status / deploy history
      if (/^(?:pipeline\s+status|deploy\s+history)$/i.test(raw)) {
        return this.showHistory();
      }

      // Pipeline rollback <repo>
      if (/^pipeline\s+rollback\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^pipeline\s+rollback\s+(\S+)$/i);
        return this.handleRollback(match[1], context);
      }

      // Pipeline deploy <repo> or pipeline <repo>
      const deployMatch = raw.match(/^pipeline\s+(?:deploy\s+)?(\S+)$/i);
      if (deployMatch) {
        const repo = deployMatch[1];
        // Guard against matching sub-commands
        if (['status', 'rollback', 'deploy'].includes(repo.toLowerCase())) {
          return this.error('Missing repo name', null, {
            suggestion: 'Usage: pipeline deploy <repo> or pipeline <repo>'
          });
        }
        return this.handlePipelineDeploy(repo, context);
      }

      return this.error('Unknown pipeline command', null, {
        suggestion: 'Try: pipeline deploy <repo>, pipeline status, pipeline rollback <repo>'
      });
    } catch (err) {
      this.log('error', 'Pipeline error', err);
      return this.error('Pipeline failed unexpectedly', err);
    }
  }

  // ============ Pipeline Deploy ============

  /**
   * Initiate a pipeline deploy with confirmation
   */
  handlePipelineDeploy(repoName, context) {
    const repo = repoName.toLowerCase();
    const projectPath = this.resolveProjectPath(repo);

    if (!projectPath) {
      const knownRepos = Object.keys(PROJECT_PATHS).filter(k => k !== 'clawd-bot').join(', ');
      return this.error(`Unknown repo: ${repoName}`, null, {
        suggestion: `Known repos: ${knownRepos}`
      });
    }

    if (this.activePipelines.get(repo)) {
      return this.error(`Pipeline already running for ${repoName}`, null, {
        suggestion: 'Wait for the current pipeline to finish or check pipeline status'
      });
    }

    return this.warning(`Deploy ${repoName} to production`, {
      cost: 'Vercel deployment credits',
      risk: 'medium',
      details: `Pipeline: test -> deploy -> verify\nRepo: ${repoName}\nPath: ${projectPath}`,
      action: "Reply 'yes' to proceed",
      data: { action: 'pipeline-deploy', repo, repoName, projectPath, context }
    });
  }

  /**
   * Execute the full pipeline after confirmation.
   * Called from the confirmation manager or directly for testing.
   */
  async executePipeline(repo, repoName, projectPath, context) {
    const pipelineStart = Date.now();
    const stages = { test: null, deploy: null, verify: null };
    let pipelineSuccess = true;
    let failedStage = null;

    this.activePipelines.set(repo, true);
    this.log('info', `Pipeline started for ${repoName}`);

    try {
      // ---- Stage 1: Test ----
      const testStart = Date.now();
      stages.test = { status: 'running', startTime: testStart };

      const testResult = await this.executeCommand('npm test', projectPath, 120000);
      const testDuration = ((Date.now() - testStart) / 1000).toFixed(1);
      const testSummary = this.parseTestOutput(testResult.output || testResult.error || '');

      if (!testResult.success) {
        stages.test = {
          status: 'failed',
          duration: testDuration,
          summary: testSummary,
          output: testResult.error
        };
        pipelineSuccess = false;
        failedStage = 'test';

        const entry = this.recordHistory(repoName, stages, pipelineStart, false);
        return this.formatPipelineResult(repoName, stages, pipelineStart, false, failedStage, entry);
      }

      stages.test = {
        status: 'passed',
        duration: testDuration,
        summary: testSummary,
        output: testResult.output
      };

      // ---- Stage 2: Deploy ----
      const deployStart = Date.now();
      stages.deploy = { status: 'running', startTime: deployStart };

      const deployCmd = this.buildDeployCommand(projectPath);
      const deployResult = await this.executeCommand(deployCmd, projectPath, 180000);
      const deployDuration = ((Date.now() - deployStart) / 1000).toFixed(1);

      // Extract Vercel URL from output if present
      let deployUrl = null;
      if (deployResult.output) {
        const urlMatch = deployResult.output.match(/(https:\/\/[^\s]+\.vercel\.app)/);
        if (urlMatch) deployUrl = urlMatch[1];
      }

      if (!deployResult.success) {
        stages.deploy = {
          status: 'failed',
          duration: deployDuration,
          output: deployResult.error,
          url: null
        };
        pipelineSuccess = false;
        failedStage = 'deploy';

        const entry = this.recordHistory(repoName, stages, pipelineStart, false);
        return this.formatPipelineResult(repoName, stages, pipelineStart, false, failedStage, entry);
      }

      stages.deploy = {
        status: 'passed',
        duration: deployDuration,
        output: deployResult.output,
        url: deployUrl
      };

      // ---- Stage 3: Verify ----
      const verifyStart = Date.now();
      stages.verify = { status: 'running', startTime: verifyStart };

      const verifyResult = await this.runVerification(repo, deployUrl);
      const verifyDuration = ((Date.now() - verifyStart) / 1000).toFixed(1);

      stages.verify = {
        status: verifyResult.success ? 'passed' : 'warning',
        duration: verifyDuration,
        message: verifyResult.message
      };

      // Verify warnings don't fail the pipeline
      if (!verifyResult.success) {
        this.log('warn', `Verification warning for ${repoName}: ${verifyResult.message}`);
      }

      // Record to outcome tracker if available
      this.trackOutcome(repoName, pipelineSuccess, stages, pipelineStart);

      const entry = this.recordHistory(repoName, stages, pipelineStart, true);
      return this.formatPipelineResult(repoName, stages, pipelineStart, true, null, entry);

    } catch (err) {
      this.log('error', `Pipeline error for ${repoName}`, err);
      const entry = this.recordHistory(repoName, stages, pipelineStart, false);
      return this.error(`Pipeline failed for ${repoName}`, err, {
        attempted: failedStage || 'unknown stage',
        suggestion: 'Check logs and try again'
      });
    } finally {
      this.activePipelines.delete(repo);
    }
  }

  // ============ Rollback ============

  /**
   * Handle rollback with confirmation
   */
  handleRollback(repoName, context) {
    const repo = repoName.toLowerCase();
    const projectPath = this.resolveProjectPath(repo);

    if (!projectPath) {
      return this.error(`Unknown repo: ${repoName}`);
    }

    // Find last successful deploy in history
    const lastDeploy = this.deployHistory.find(
      h => h.repo.toLowerCase() === repo && h.deploySuccess
    );

    if (!lastDeploy) {
      return this.error(`No successful deployment found for ${repoName}`, null, {
        suggestion: 'Cannot rollback without a prior successful deployment'
      });
    }

    return this.warning(`Rollback ${repoName} to previous version`, {
      cost: 'Vercel deployment credits',
      risk: 'high',
      details: `This will revert to HEAD~1 and redeploy\nRepo: ${repoName}\nLast deploy: ${new Date(lastDeploy.timestamp).toLocaleString()}`,
      action: "Reply 'yes' to proceed",
      data: { action: 'pipeline-rollback', repo, repoName, projectPath, context }
    });
  }

  /**
   * Execute rollback after confirmation
   */
  async executeRollback(repo, repoName, projectPath, context) {
    const rollbackStart = Date.now();

    this.log('info', `Rolling back ${repoName}`);

    // Step 1: Revert to previous commit
    const revertResult = await this.executeCommand('git checkout HEAD~1', projectPath, 30000);
    if (!revertResult.success) {
      return this.error(`Rollback failed for ${repoName}`, revertResult.error, {
        attempted: 'git checkout HEAD~1',
        suggestion: 'Check git status manually'
      });
    }

    // Step 2: Redeploy
    const deployCmd = this.buildDeployCommand(projectPath);
    const deployResult = await this.executeCommand(deployCmd, projectPath, 180000);
    const duration = ((Date.now() - rollbackStart) / 1000).toFixed(1);

    if (!deployResult.success) {
      // Revert the revert
      await this.executeCommand('git checkout -', projectPath, 10000);
      return this.error(`Rollback deploy failed for ${repoName}`, deployResult.error, {
        attempted: 'git checkout HEAD~1 && vercel --prod',
        suggestion: 'Original version restored. Check deploy logs.'
      });
    }

    // Extract URL
    let deployUrl = null;
    if (deployResult.output) {
      const urlMatch = deployResult.output.match(/(https:\/\/[^\s]+\.vercel\.app)/);
      if (urlMatch) deployUrl = urlMatch[1];
    }

    // Record rollback in history
    this.addHistoryEntry({
      repo: repoName,
      timestamp: Date.now(),
      duration: parseFloat(duration),
      testsPassed: null,
      deploySuccess: true,
      verifySuccess: null,
      url: deployUrl,
      isRollback: true
    });

    let response = `*Rollback Complete: ${repoName}*\n`;
    response += `\n`;
    response += `Reverted to previous version\n`;
    response += `Redeployed successfully\n`;
    if (deployUrl) {
      response += `URL: ${deployUrl}\n`;
    }
    response += `\nDuration: ${duration}s`;

    return this.success(response);
  }

  // ============ History ============

  /**
   * Show deployment history across all repos
   */
  showHistory() {
    if (this.deployHistory.length === 0) {
      return this.success('*Deployment History*\n\nNo deployments recorded yet.\nUse `pipeline deploy <repo>` to start a pipeline.');
    }

    const recent = this.deployHistory.slice(0, 10);
    const totalDeploys = this.deployHistory.length;
    const successCount = this.deployHistory.filter(h => h.deploySuccess).length;
    const successRate = totalDeploys > 0
      ? ((successCount / totalDeploys) * 100).toFixed(0)
      : 0;

    let response = `*Deployment History*\n`;
    response += `\n`;
    response += `Total: ${totalDeploys} | Success rate: ${successRate}%\n\n`;

    recent.forEach((entry, i) => {
      const testIcon = entry.testsPassed === true ? 'pass'
        : entry.testsPassed === false ? 'FAIL'
        : 'skip';
      const deployIcon = entry.deploySuccess ? 'pass' : 'FAIL';
      const verifyIcon = entry.verifySuccess === true ? 'pass'
        : entry.verifySuccess === false ? 'warn'
        : 'skip';

      const rollbackTag = entry.isRollback ? ' [ROLLBACK]' : '';
      const timeAgo = this.formatTimeAgo(entry.timestamp);

      response += `${i + 1}. *${entry.repo}*${rollbackTag} - ${timeAgo}\n`;
      response += `   Test: ${testIcon} | Deploy: ${deployIcon} | Verify: ${verifyIcon}\n`;
      response += `   Duration: ${entry.duration}s`;
      if (entry.url) {
        response += ` | ${entry.url}`;
      }
      response += `\n\n`;
    });

    if (totalDeploys > 10) {
      response += `_Showing 10 of ${totalDeploys} deployments_`;
    }

    return this.success(response);
  }

  // ============ Helper Methods ============

  /**
   * Resolve repo name to EC2 project path (case-insensitive)
   */
  resolveProjectPath(repo) {
    const lower = repo.toLowerCase();
    return PROJECT_PATHS[lower] || null;
  }

  /**
   * Build the deploy command for a project
   */
  buildDeployCommand(projectPath) {
    if (process.env.VERCEL_TOKEN) {
      return `git pull && vercel --prod --token ${process.env.VERCEL_TOKEN} --yes`;
    }
    return 'git pull && npm run build';
  }

  /**
   * Run post-deploy verification
   */
  async runVerification(repo, deployUrl) {
    // Try health endpoint first
    const healthUrl = HEALTH_ENDPOINTS[repo];
    if (healthUrl) {
      const result = await this.executeCommand(
        `curl -sf -o /dev/null -w "%{http_code}" ${healthUrl}`,
        '/tmp',
        15000
      );
      if (result.success && result.output && result.output.trim().startsWith('2')) {
        return { success: true, message: `Health check passed (${result.output.trim()})` };
      }
      return { success: false, message: `Health check returned ${result.output || 'no response'}` };
    }

    // Try Vercel URL if available
    if (deployUrl) {
      // Wait briefly for deploy to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));
      const result = await this.executeCommand(
        `curl -sf -o /dev/null -w "%{http_code}" ${deployUrl}`,
        '/tmp',
        15000
      );
      if (result.success && result.output && result.output.trim().startsWith('2')) {
        return { success: true, message: `URL responding (${result.output.trim()})` };
      }
      return { success: false, message: `URL check: ${result.output || 'no response'}` };
    }

    // No verification endpoint available
    return { success: true, message: 'No health endpoint configured - skipped' };
  }

  /**
   * Execute a command with timeout
   */
  async executeCommand(command, cwd, timeout = 30000) {
    if (!this.isEC2) {
      this.log('warn', `[DEV MODE] Would execute: ${command} in ${cwd}`);
      return {
        success: true,
        output: `[DEV MODE] Simulated: ${command}`,
        simulated: true
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      return {
        success: true,
        output: stdout || stderr || 'Command completed successfully'
      };
    } catch (err) {
      if (err.killed) {
        return { success: false, error: `Timed out after ${timeout / 1000}s` };
      }
      return { success: false, error: err.stderr || err.stdout || err.message };
    }
  }

  /**
   * Parse test output for pass/fail counts
   */
  parseTestOutput(output) {
    const passedMatch = output.match(/(\d+)\s+(?:passing|passed)/i);
    const failedMatch = output.match(/(\d+)\s+(?:failing|failed)/i);

    if (passedMatch || failedMatch) {
      const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
      return { passed, failed, total: passed + failed };
    }
    return { passed: null, failed: null, total: null };
  }

  /**
   * Record a deployment in history
   */
  recordHistory(repoName, stages, startTime, success) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const entry = {
      repo: repoName,
      timestamp: Date.now(),
      duration: parseFloat(duration),
      testsPassed: stages.test?.status === 'passed',
      deploySuccess: stages.deploy?.status === 'passed',
      verifySuccess: stages.verify?.status === 'passed' || stages.verify?.status === 'warning',
      url: stages.deploy?.url || null,
      isRollback: false
    };

    this.addHistoryEntry(entry);
    return entry;
  }

  /**
   * Add entry to history with max size enforcement
   */
  addHistoryEntry(entry) {
    this.deployHistory.unshift(entry);
    if (this.deployHistory.length > this.maxHistory) {
      this.deployHistory.pop();
    }
  }

  /**
   * Track outcome via outcome-tracker if available
   */
  trackOutcome(repoName, success, stages, startTime) {
    try {
      const outcomeTracker = require('../../lib/outcome-tracker');
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      if (outcomeTracker && typeof outcomeTracker.completeAction === 'function') {
        outcomeTracker.completeAction(
          `pipeline-deploy-${repoName}`,
          success ? 'success' : 'failed',
          {
            repo: repoName,
            duration: `${duration}s`,
            testsPassed: stages.test?.status === 'passed',
            deploySuccess: stages.deploy?.status === 'passed',
            url: stages.deploy?.url
          }
        );
      }
    } catch (err) {
      // Outcome tracker not available - not critical
      this.log('warn', 'Outcome tracker not available', err.message);
    }
  }

  /**
   * Format the full pipeline result for Telegram
   */
  formatPipelineResult(repoName, stages, startTime, success, failedStage, entry) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    let response = success
      ? `*Pipeline Complete: ${repoName}*\n`
      : `*Pipeline Failed: ${repoName}*\n`;
    response += `\n`;

    // Stage 1: Tests
    if (stages.test) {
      const icon = stages.test.status === 'passed' ? 'PASS' : 'FAIL';
      response += `*1. Tests* [${icon}] (${stages.test.duration}s)\n`;
      if (stages.test.summary && stages.test.summary.total !== null) {
        response += `   Passed: ${stages.test.summary.passed}/${stages.test.summary.total}`;
        if (stages.test.summary.failed > 0) {
          response += ` | Failed: ${stages.test.summary.failed}`;
        }
        response += `\n`;
      }
      if (stages.test.status === 'failed' && stages.test.output) {
        response += `\`\`\`\n${this.truncateOutput(stages.test.output, 800)}\n\`\`\`\n`;
      }
    }

    // Stage 2: Deploy
    if (stages.deploy) {
      const icon = stages.deploy.status === 'passed' ? 'PASS' : 'FAIL';
      response += `*2. Deploy* [${icon}] (${stages.deploy.duration}s)\n`;
      if (stages.deploy.url) {
        response += `   URL: ${stages.deploy.url}\n`;
      }
      if (stages.deploy.status === 'failed' && stages.deploy.output) {
        response += `\`\`\`\n${this.truncateOutput(stages.deploy.output, 800)}\n\`\`\`\n`;
      }
    } else if (failedStage === 'test') {
      response += `*2. Deploy* [SKIP] - aborted (tests failed)\n`;
    }

    // Stage 3: Verify
    if (stages.verify) {
      const icon = stages.verify.status === 'passed' ? 'PASS'
        : stages.verify.status === 'warning' ? 'WARN' : 'FAIL';
      response += `*3. Verify* [${icon}] (${stages.verify.duration}s)\n`;
      if (stages.verify.message) {
        response += `   ${stages.verify.message}\n`;
      }
    } else if (failedStage === 'test' || failedStage === 'deploy') {
      response += `*3. Verify* [SKIP] - aborted (${failedStage} failed)\n`;
    }

    response += `\nTotal duration: ${totalDuration}s`;

    // Success rate from history
    if (this.deployHistory.length > 1) {
      const repoHistory = this.deployHistory.filter(
        h => h.repo.toLowerCase() === repoName.toLowerCase()
      );
      if (repoHistory.length > 1) {
        const repoSuccessCount = repoHistory.filter(h => h.deploySuccess).length;
        const rate = ((repoSuccessCount / repoHistory.length) * 100).toFixed(0);
        response += `\n${repoName} success rate: ${rate}% (${repoHistory.length} deploys)`;
      }
    }

    if (success) {
      return this.success(response, null, { time: `${totalDuration}s` });
    } else {
      return this.error(response);
    }
  }

  /**
   * Truncate long output, removing ANSI codes
   */
  truncateOutput(output, maxLength = 1500) {
    if (!output) return '';
    const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '');
    if (cleaned.length <= maxLength) return cleaned;
    const half = Math.floor(maxLength / 2) - 15;
    return cleaned.substring(0, half) + '\n... truncated ...\n' + cleaned.substring(cleaned.length - half);
  }

  /**
   * Format a timestamp as relative time ago
   */
  formatTimeAgo(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}

module.exports = DeploymentPipelineSkill;
