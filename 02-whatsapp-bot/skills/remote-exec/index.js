/**
 * Remote Exec Skill for ClawdBot
 *
 * Executes safe commands on EC2 for project management.
 * All commands are whitelisted and project-scoped for security.
 *
 * Commands:
 *   run tests <repo>              - Run npm test in project directory
 *   test <repo>                   - Alias for run tests
 *   deploy <repo>                 - Run deploy script
 *   deploy <repo> to production   - Run deploy with production flag
 *   check logs <repo>             - Tail PM2 logs (last 50 lines)
 *   logs <repo>                   - Alias for check logs
 *   restart <repo>                - pm2 restart the service
 *   build <repo>                  - Run npm run build
 *   install <repo>                - Run npm install
 *   exec <repo> <command>         - Run whitelisted command
 *   remote status                 - Show all known projects and their status
 *   remote commands               - List all allowed commands
 *
 * @module skills/remote-exec
 */

const BaseSkill = require('../base-skill');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

const {
  isCommandAllowed,
  getAllowedCommandsDetailed,
  requiresConfirmation,
  getCommandTimeout,
  getProjectPath,
  sanitizeArgument
} = require('../../lib/command-whitelist');

// Pending confirmations storage
const pendingConfirmations = new Map();

// Execution audit log
const auditLog = [];

class RemoteExecSkill extends BaseSkill {
  name = 'remote-exec';
  description = 'Execute safe commands on EC2 - tests, deploys, logs, restarts';
  priority = 30; // High priority for explicit exec commands

  commands = [
    {
      pattern: /^(?:run\s+)?tests?\s+(\S+)$/i,
      description: 'Run npm test in project directory',
      usage: 'test <repo>'
    },
    {
      pattern: /^deploy\s+(\S+)(?:\s+to\s+production)?$/i,
      description: 'Run deploy script for a project',
      usage: 'deploy <repo>'
    },
    {
      pattern: /^(?:check\s+)?logs?\s+(\S+)$/i,
      description: 'Tail PM2 logs for a project',
      usage: 'logs <repo>'
    },
    {
      pattern: /^restart\s+(\S+)$/i,
      description: 'Restart PM2 process',
      usage: 'restart <repo>'
    },
    {
      pattern: /^build\s+(\S+)$/i,
      description: 'Run npm run build',
      usage: 'build <repo>'
    },
    {
      pattern: /^install\s+(\S+)$/i,
      description: 'Run npm install',
      usage: 'install <repo>'
    },
    {
      pattern: /^exec\s+(\S+)\s+(.+)$/i,
      description: 'Run a whitelisted command in project directory',
      usage: 'exec <repo> <command>'
    },
    {
      pattern: /^remote\s+status$/i,
      description: 'Show all projects and PM2 status',
      usage: 'remote status'
    },
    {
      pattern: /^remote\s+commands$/i,
      description: 'List all allowed commands',
      usage: 'remote commands'
    },
    {
      pattern: /^vercel\s+deploy\s+(\S+)$/i,
      description: 'Deploy project to Vercel production',
      usage: 'vercel deploy <repo>'
    },
    {
      pattern: /^vercel\s+preview\s+(\S+)$/i,
      description: 'Deploy project to Vercel preview',
      usage: 'vercel preview <repo>'
    },
    {
      pattern: /^confirm\s+(\S+)$/i,
      description: 'Confirm a pending operation',
      usage: 'confirm <id>'
    },
    {
      pattern: /^cancel\s+(\S+)$/i,
      description: 'Cancel a pending operation',
      usage: 'cancel <id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.isEC2 = process.platform === 'linux'; // Only actually execute on EC2
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Run tests
      if (/^(?:run\s+)?tests?\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^(?:run\s+)?tests?\s+(\S+)$/i);
        return await this.runTests(match[1], context);
      }

      // Deploy
      if (/^deploy\s+(\S+)/i.test(raw)) {
        const match = raw.match(/^deploy\s+(\S+)(?:\s+to\s+production)?$/i);
        const isProduction = /to\s+production$/i.test(raw);
        return await this.deploy(match[1], isProduction, context);
      }

      // Check logs
      if (/^(?:check\s+)?logs?\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^(?:check\s+)?logs?\s+(\S+)$/i);
        return await this.checkLogs(match[1], context);
      }

      // Restart
      if (/^restart\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^restart\s+(\S+)$/i);
        return await this.restart(match[1], context);
      }

      // Build
      if (/^build\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^build\s+(\S+)$/i);
        return await this.build(match[1], context);
      }

      // Install
      if (/^install\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^install\s+(\S+)$/i);
        return await this.install(match[1], context);
      }

      // Vercel deploy (production)
      if (/^vercel\s+deploy\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^vercel\s+deploy\s+(\S+)$/i);
        return await this.vercelDeploy(match[1], true, context);
      }

      // Vercel preview
      if (/^vercel\s+preview\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^vercel\s+preview\s+(\S+)$/i);
        return await this.vercelDeploy(match[1], false, context);
      }

      // Generic exec
      if (/^exec\s+(\S+)\s+(.+)$/i.test(raw)) {
        const match = raw.match(/^exec\s+(\S+)\s+(.+)$/i);
        return await this.execCommand(match[1], match[2], context);
      }

      // Remote status
      if (/^remote\s+status$/i.test(raw)) {
        return await this.showStatus();
      }

      // Remote commands
      if (/^remote\s+commands$/i.test(raw)) {
        return this.showAllowedCommands();
      }

      // Confirm pending
      if (/^confirm\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^confirm\s+(\S+)$/i);
        return await this.confirmPending(match[1], context);
      }

      // Cancel pending
      if (/^cancel\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^cancel\s+(\S+)$/i);
        return this.cancelPending(match[1]);
      }

      return this.error('Unknown remote-exec command. Try: test <repo>, deploy <repo>, logs <repo>');
    } catch (err) {
      this.log('error', 'Remote exec error', err);
      return this.error(`Execution failed: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * Run tests for a project
   */
  async runTests(repoName, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    this.log('info', `Running tests for ${repo}`);

    const startTime = Date.now();
    const result = await this.executeCommand('npm test', projectPath.path, 60000);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      // Parse test output for summary
      const testSummary = this.parseTestOutput(result.output);

      let response = `🧪 *Tests: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (testSummary.passed !== undefined) {
        response += `✅ Tests passed: ${testSummary.passed}/${testSummary.total}\n`;
        if (testSummary.failed > 0) {
          response += `❌ Tests failed: ${testSummary.failed}\n`;
        }
      } else {
        response += `✅ Tests completed\n`;
      }

      response += `\n⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.output, 2000)}\n\`\`\``;

      this.logAudit('test', repo, 'success', context);
      return this.success(response);
    } else {
      let response = `❌ *Tests Failed: ${repo}*\n\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.error, 2000)}\n\`\`\``;

      this.logAudit('test', repo, 'failed', context);
      return this.error(response);
    }
  }

  /**
   * Deploy a project
   */
  async deploy(repoName, isProduction, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    // Deployments always require confirmation
    const confirmId = this.createPendingConfirmation({
      action: 'deploy',
      repo,
      projectPath: projectPath.path,
      isProduction,
      context
    });

    let response = `🚀 *Deploy ${repo}${isProduction ? ' to PRODUCTION' : ''}*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `⚠️ This will deploy the latest code.\n\n`;
    response += `Project: ${projectPath.path}\n`;
    response += `Environment: ${isProduction ? 'PRODUCTION' : 'staging'}\n\n`;
    response += `To proceed, reply:\n`;
    response += `\`confirm ${confirmId}\`\n\n`;
    response += `To cancel:\n`;
    response += `\`cancel ${confirmId}\``;

    return this.success(response);
  }

  /**
   * Actually execute the deploy after confirmation
   */
  async executeDeployment(pending) {
    const { repo, projectPath, isProduction, context } = pending;

    this.log('info', `Deploying ${repo}${isProduction ? ' to production' : ''}`);

    const startTime = Date.now();

    // Check for deploy script
    const deployScript = await this.findDeployScript(projectPath);

    let result;
    if (deployScript) {
      result = await this.executeCommand(`bash ${deployScript}`, projectPath, 180000);
    } else {
      // Standard deploy: pull, install, build, restart
      const commands = [
        'git pull',
        'npm ci',
        'npm run build',
        `pm2 restart ${repo}`
      ];

      let output = '';
      for (const cmd of commands) {
        const cmdResult = await this.executeCommand(cmd, projectPath, 120000);
        output += `\n$ ${cmd}\n${cmdResult.output || cmdResult.error}\n`;
        if (!cmdResult.success && !cmd.includes('build')) {
          result = { success: false, error: output };
          break;
        }
      }
      if (!result) {
        result = { success: true, output };
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Health check
    let healthCheck = null;
    if (result.success) {
      healthCheck = await this.runHealthCheck(repo);
    }

    if (result.success) {
      let response = `🚀 *Deployment Complete: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `✅ Code pulled\n`;
      response += `✅ Dependencies installed\n`;
      response += `✅ Built successfully\n`;
      response += `✅ Service restarted\n`;

      if (healthCheck) {
        response += healthCheck.success
          ? `✅ Health check passed\n`
          : `⚠️ Health check: ${healthCheck.message}\n`;
      }

      response += `\n⏱️ Completed in ${duration}s`;

      this.logAudit('deploy', repo, 'success', context);
      return this.success(response);
    } else {
      let response = `❌ *Deployment Failed: ${repo}*\n\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.error, 2000)}\n\`\`\``;

      this.logAudit('deploy', repo, 'failed', context);
      return this.error(response);
    }
  }

  /**
   * Deploy a project to Vercel
   */
  async vercelDeploy(repoName, isProduction, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    if (!process.env.VERCEL_TOKEN) {
      return this.error('Vercel token not configured. Set VERCEL_TOKEN in environment.');
    }

    if (isProduction) {
      // Production deploys require confirmation
      const confirmId = this.createPendingConfirmation({
        action: 'vercel-deploy',
        repo,
        projectPath: projectPath.path,
        isProduction,
        context
      });

      let response = `🔺 *Vercel Deploy: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `⚠️ This will deploy to **production**.\n\n`;
      response += `Project: ${projectPath.path}\n`;
      response += `Environment: production\n\n`;
      response += `To proceed, reply:\n`;
      response += `\`confirm ${confirmId}\`\n\n`;
      response += `To cancel:\n`;
      response += `\`cancel ${confirmId}\``;

      return this.success(response);
    }

    // Preview deploys don't need confirmation
    return await this.executeVercelDeploy({ repo, projectPath: projectPath.path, isProduction, context });
  }

  /**
   * Execute the Vercel deploy
   */
  async executeVercelDeploy(pending) {
    const { repo, projectPath, isProduction, context } = pending;

    this.log('info', `Deploying ${repo} to Vercel${isProduction ? ' (production)' : ' (preview)'}`);

    const startTime = Date.now();
    const prodFlag = isProduction ? ' --prod' : '';
    const cmd = `vercel${prodFlag} --token ${process.env.VERCEL_TOKEN} --yes`;

    const result = await this.executeCommand(cmd, projectPath, 180000);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      // Extract URL from Vercel output
      const urlMatch = result.output.match(/(https:\/\/[^\s]+\.vercel\.app)/);
      const deployUrl = urlMatch ? urlMatch[1] : null;

      let response = `🔺 *Vercel Deploy Complete: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `✅ Deployed to ${isProduction ? 'production' : 'preview'}\n`;
      if (deployUrl) {
        response += `🔗 URL: ${deployUrl}\n`;
      }
      response += `⏱️ Completed in ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.output, 1500)}\n\`\`\``;

      this.logAudit('vercel-deploy', repo, 'success', context);
      return this.success(response);
    } else {
      let response = `❌ *Vercel Deploy Failed: ${repo}*\n\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.error, 2000)}\n\`\`\``;

      this.logAudit('vercel-deploy', repo, 'failed', context);
      return this.error(response);
    }
  }

  /**
   * Check PM2 logs for a project
   */
  async checkLogs(repoName, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    this.log('info', `Fetching logs for ${repo}`);

    // Get PM2 process name (often same as repo or configured name)
    const pm2Name = this.getPM2Name(repo);
    const result = await this.executeCommand(`pm2 logs ${pm2Name} --lines 50 --nostream`, '/tmp', 10000);

    if (result.success) {
      let response = `📋 *Logs: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `\`\`\`\n${this.truncateOutput(result.output, 2500)}\n\`\`\``;

      return this.success(response);
    } else {
      // Try to get logs from file directly
      const logPath = `/root/.pm2/logs/${pm2Name}-out.log`;
      const fallbackResult = await this.executeCommand(`tail -50 ${logPath}`, '/tmp', 5000);

      if (fallbackResult.success) {
        let response = `📋 *Logs: ${repo}* (from file)\n`;
        response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        response += `\`\`\`\n${this.truncateOutput(fallbackResult.output, 2500)}\n\`\`\``;

        return this.success(response);
      }

      return this.error(`Could not fetch logs for ${repo}: ${result.error}`);
    }
  }

  /**
   * Restart a PM2 process
   */
  async restart(repoName, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    // Create confirmation
    const confirmId = this.createPendingConfirmation({
      action: 'restart',
      repo,
      projectPath: projectPath.path,
      context
    });

    let response = `🔄 *Restart ${repo}*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `This will restart the PM2 process.\n`;
    response += `Service may be briefly unavailable.\n\n`;
    response += `To proceed, reply:\n`;
    response += `\`confirm ${confirmId}\``;

    return this.success(response);
  }

  /**
   * Execute restart after confirmation
   */
  async executeRestart(pending) {
    const { repo, context } = pending;
    const pm2Name = this.getPM2Name(repo);

    this.log('info', `Restarting ${repo}`);

    const result = await this.executeCommand(`pm2 restart ${pm2Name}`, '/tmp', 30000);

    if (result.success) {
      // Wait a moment then health check
      await new Promise(resolve => setTimeout(resolve, 2000));
      const health = await this.runHealthCheck(repo);

      let response = `✅ *Restarted: ${repo}*\n\n`;
      if (health) {
        response += health.success
          ? `Health check: ✅ Passed`
          : `Health check: ⚠️ ${health.message}`;
      }

      this.logAudit('restart', repo, 'success', context);
      return this.success(response);
    } else {
      this.logAudit('restart', repo, 'failed', context);
      return this.error(`Failed to restart ${repo}: ${result.error}`);
    }
  }

  /**
   * Run npm run build
   */
  async build(repoName, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    this.log('info', `Building ${repo}`);

    const startTime = Date.now();
    const result = await this.executeCommand('npm run build', projectPath.path, 120000);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      let response = `🔨 *Build Complete: ${repo}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `✅ Built successfully\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.output, 1500)}\n\`\`\``;

      this.logAudit('build', repo, 'success', context);
      return this.success(response);
    } else {
      let response = `❌ *Build Failed: ${repo}*\n\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.error, 2000)}\n\`\`\``;

      this.logAudit('build', repo, 'failed', context);
      return this.error(response);
    }
  }

  /**
   * Run npm install
   */
  async install(repoName, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    // Create confirmation
    const confirmId = this.createPendingConfirmation({
      action: 'install',
      repo,
      projectPath: projectPath.path,
      context
    });

    let response = `📦 *Install Dependencies: ${repo}*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `This will run npm install.\n\n`;
    response += `To proceed, reply:\n`;
    response += `\`confirm ${confirmId}\``;

    return this.success(response);
  }

  /**
   * Execute install after confirmation
   */
  async executeInstall(pending) {
    const { repo, projectPath, context } = pending;

    this.log('info', `Installing dependencies for ${repo}`);

    const startTime = Date.now();
    const result = await this.executeCommand('npm install', projectPath, 120000);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      let response = `✅ *Install Complete: ${repo}*\n`;
      response += `⏱️ Duration: ${duration}s\n`;
      response += `\n\`\`\`\n${this.truncateOutput(result.output, 1500)}\n\`\`\``;

      this.logAudit('install', repo, 'success', context);
      return this.success(response);
    } else {
      this.logAudit('install', repo, 'failed', context);
      return this.error(`Install failed: ${result.error}`);
    }
  }

  /**
   * Execute a whitelisted command
   */
  async execCommand(repoName, command, context) {
    const repo = sanitizeArgument(repoName);
    const projectPath = getProjectPath(repo);

    if (!projectPath.valid) {
      return this.error(projectPath.error);
    }

    // Check if command is allowed
    const allowed = isCommandAllowed(command, repo);

    if (!allowed.allowed) {
      return this.error(`Command not allowed: ${allowed.reason}`);
    }

    this.log('info', `Executing command in ${repo}: ${command}`);

    // Check if confirmation needed
    if (allowed.config.requiresConfirmation) {
      const confirmId = this.createPendingConfirmation({
        action: 'exec',
        repo,
        command,
        projectPath: projectPath.path,
        timeout: allowed.config.timeout,
        context
      });

      let response = `⚠️ *Confirm Execution*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `Command: \`${command}\`\n`;
      response += `Project: ${repo}\n`;
      response += `Description: ${allowed.config.description}\n\n`;
      response += `To proceed, reply:\n`;
      response += `\`confirm ${confirmId}\``;

      return this.success(response);
    }

    // Execute directly
    const result = await this.executeCommand(command, projectPath.path, allowed.config.timeout);

    if (result.success) {
      let response = `✅ *Executed: ${command}*\n`;
      response += `Project: ${repo}\n\n`;
      response += `\`\`\`\n${this.truncateOutput(result.output, 2500)}\n\`\`\``;

      this.logAudit('exec', repo, 'success', context, { command });
      return this.success(response);
    } else {
      this.logAudit('exec', repo, 'failed', context, { command });
      return this.error(`Command failed: ${result.error}`);
    }
  }

  /**
   * Execute generic command after confirmation
   */
  async executeGenericCommand(pending) {
    const { repo, command, projectPath, timeout, context } = pending;

    const result = await this.executeCommand(command, projectPath, timeout);

    if (result.success) {
      let response = `✅ *Executed: ${command}*\n`;
      response += `Project: ${repo}\n\n`;
      response += `\`\`\`\n${this.truncateOutput(result.output, 2500)}\n\`\`\``;

      this.logAudit('exec', repo, 'success', context, { command });
      return this.success(response);
    } else {
      this.logAudit('exec', repo, 'failed', context, { command });
      return this.error(`Command failed: ${result.error}`);
    }
  }

  /**
   * Show status of all projects
   */
  async showStatus() {
    this.log('info', 'Showing remote status');

    let response = `📊 *Remote Status*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Get PM2 status
    const pm2Result = await this.executeCommand('pm2 jlist', '/tmp', 10000);

    if (pm2Result.success) {
      try {
        const processes = JSON.parse(pm2Result.output);

        if (processes.length === 0) {
          response += `No PM2 processes running\n`;
        } else {
          processes.forEach(proc => {
            const status = proc.pm2_env.status === 'online' ? '🟢' : '🔴';
            const mem = Math.round((proc.monit?.memory || 0) / 1024 / 1024);
            const cpu = proc.monit?.cpu || 0;

            response += `${status} *${proc.name}*\n`;
            response += `   Status: ${proc.pm2_env.status}\n`;
            response += `   Memory: ${mem}MB | CPU: ${cpu}%\n`;
            response += `   Restarts: ${proc.pm2_env.restart_time}\n\n`;
          });
        }
      } catch {
        response += `PM2 status: Unable to parse\n`;
        response += `\`\`\`\n${this.truncateOutput(pm2Result.output, 1000)}\n\`\`\``;
      }
    } else {
      response += `⚠️ Could not fetch PM2 status\n`;
    }

    // Show disk and memory
    const dfResult = await this.executeCommand('df -h /', '/tmp', 5000);
    const freeResult = await this.executeCommand('free -h', '/tmp', 5000);

    if (dfResult.success) {
      response += `\n*Disk Usage:*\n`;
      response += `\`\`\`\n${dfResult.output}\n\`\`\`\n`;
    }

    if (freeResult.success) {
      response += `*Memory:*\n`;
      response += `\`\`\`\n${freeResult.output}\n\`\`\``;
    }

    return this.success(response);
  }

  /**
   * Show all allowed commands
   */
  showAllowedCommands() {
    const commands = getAllowedCommandsDetailed();

    let response = `📋 *Allowed Remote Commands*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Group by type
    const npmCmds = commands.filter(c => c.name.startsWith('npm'));
    const pm2Cmds = commands.filter(c => c.name.startsWith('pm2'));
    const gitCmds = commands.filter(c => c.name.startsWith('git'));
    const otherCmds = commands.filter(c =>
      !c.name.startsWith('npm') && !c.name.startsWith('pm2') && !c.name.startsWith('git')
    );

    response += `*NPM Commands:*\n`;
    npmCmds.forEach(c => {
      response += `• \`${c.name}\` ${c.requiresConfirmation ? '⚠️' : ''}\n`;
    });

    response += `\n*PM2 Commands:*\n`;
    pm2Cmds.forEach(c => {
      response += `• \`${c.name}\` ${c.requiresConfirmation ? '⚠️' : ''}\n`;
    });

    response += `\n*Git Commands:*\n`;
    gitCmds.forEach(c => {
      response += `• \`${c.name}\` ${c.requiresConfirmation ? '⚠️' : ''}\n`;
    });

    response += `\n*Other Commands:*\n`;
    otherCmds.forEach(c => {
      response += `• \`${c.name}\` ${c.requiresConfirmation ? '⚠️' : ''}\n`;
    });

    response += `\n_⚠️ = requires confirmation_`;

    return this.success(response);
  }

  // ============ Confirmation System ============

  /**
   * Create a pending confirmation
   */
  createPendingConfirmation(data) {
    const id = Math.random().toString(36).substring(2, 8);
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minute expiry

    pendingConfirmations.set(id, {
      ...data,
      id,
      expiry,
      createdAt: new Date().toISOString()
    });

    // Clean up expired confirmations
    this.cleanupExpiredConfirmations();

    return id;
  }

  /**
   * Confirm and execute a pending operation
   */
  async confirmPending(confirmId, context) {
    const pending = pendingConfirmations.get(confirmId);

    if (!pending) {
      return this.error(`No pending operation found with ID: ${confirmId}`);
    }

    if (Date.now() > pending.expiry) {
      pendingConfirmations.delete(confirmId);
      return this.error('Confirmation expired. Please start the operation again.');
    }

    // Remove from pending
    pendingConfirmations.delete(confirmId);

    // Execute based on action type
    switch (pending.action) {
      case 'deploy':
        return await this.executeDeployment(pending);
      case 'vercel-deploy':
        return await this.executeVercelDeploy(pending);
      case 'restart':
        return await this.executeRestart(pending);
      case 'install':
        return await this.executeInstall(pending);
      case 'exec':
        return await this.executeGenericCommand(pending);
      default:
        return this.error(`Unknown action type: ${pending.action}`);
    }
  }

  /**
   * Cancel a pending operation
   */
  cancelPending(confirmId) {
    if (pendingConfirmations.has(confirmId)) {
      pendingConfirmations.delete(confirmId);
      return this.success(`✅ Operation ${confirmId} cancelled.`);
    } else {
      return this.error(`No pending operation found with ID: ${confirmId}`);
    }
  }

  /**
   * Clean up expired confirmations
   */
  cleanupExpiredConfirmations() {
    const now = Date.now();
    for (const [id, pending] of pendingConfirmations.entries()) {
      if (now > pending.expiry) {
        pendingConfirmations.delete(id);
      }
    }
  }

  // ============ Helper Methods ============

  /**
   * Execute a command with timeout
   */
  async executeCommand(command, cwd, timeout = 30000) {
    // On non-EC2 (Windows dev), simulate success
    if (!this.isEC2) {
      this.log('warn', `[DEV MODE] Would execute: ${command} in ${cwd}`);
      return {
        success: true,
        output: `[DEV MODE] Simulated execution of: ${command}`,
        simulated: true
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      return {
        success: true,
        output: stdout || stderr || 'Command completed successfully'
      };
    } catch (err) {
      // Check if it's a timeout
      if (err.killed) {
        return {
          success: false,
          error: `Command timed out after ${timeout / 1000}s`
        };
      }

      return {
        success: false,
        error: err.stderr || err.stdout || err.message
      };
    }
  }

  /**
   * Truncate output for WhatsApp
   */
  truncateOutput(output, maxLength = 3000) {
    if (!output) return '';

    // Remove ANSI color codes
    const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '');

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Keep start and end
    const halfLength = Math.floor(maxLength / 2) - 20;
    return cleaned.substring(0, halfLength) +
           '\n\n... truncated ...\n\n' +
           cleaned.substring(cleaned.length - halfLength);
  }

  /**
   * Parse test output for summary
   */
  parseTestOutput(output) {
    // Try to parse Jest/Mocha style output
    const passedMatch = output.match(/(\d+)\s+(?:passing|passed)/i);
    const failedMatch = output.match(/(\d+)\s+(?:failing|failed)/i);

    if (passedMatch || failedMatch) {
      const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

      return {
        passed,
        failed,
        total: passed + failed
      };
    }

    return {};
  }

  /**
   * Get PM2 process name for a repo
   */
  getPM2Name(repo) {
    // Map repo names to PM2 process names
    const pm2Names = {
      'aws-clawd-bot': 'clawd-bot',
      'clawd-bot': 'clawd-bot',
      'giquina-website': 'giquina-website',
      'gq-cars': 'gq-cars',
      'giquina-portal': 'giquina-portal',
      'moltbook': 'moltbook'
    };

    return pm2Names[repo.toLowerCase()] || repo;
  }

  /**
   * Find deploy script in project
   */
  async findDeployScript(projectPath) {
    const possibleScripts = ['deploy.sh', 'scripts/deploy.sh', '.scripts/deploy.sh'];

    for (const script of possibleScripts) {
      try {
        const fullPath = path.join(projectPath, script);
        await fs.access(fullPath);
        return script;
      } catch {
        // Script not found, continue
      }
    }

    return null;
  }

  /**
   * Run health check for a service
   */
  async runHealthCheck(repo) {
    const healthEndpoints = {
      'aws-clawd-bot': 'http://localhost:3000/health',
      'clawd-bot': 'http://localhost:3000/health',
      'giquina-website': 'http://localhost:3001/api/health',
      'gq-cars': 'http://localhost:3002/health'
    };

    const endpoint = healthEndpoints[repo.toLowerCase()];

    if (!endpoint) {
      return null;
    }

    const result = await this.executeCommand(`curl -s ${endpoint}`, '/tmp', 10000);

    return {
      success: result.success && result.output && !result.output.includes('error'),
      message: result.success ? 'Service responding' : 'Service not responding'
    };
  }

  /**
   * Log audit entry
   */
  logAudit(action, repo, status, context, extra = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      repo,
      status,
      from: context?.from || 'unknown',
      ...extra
    };

    auditLog.push(entry);
    this.log('info', `AUDIT: ${action} ${repo} - ${status}`, extra);

    // Keep only last 100 entries
    if (auditLog.length > 100) {
      auditLog.shift();
    }
  }
}

module.exports = RemoteExecSkill;
