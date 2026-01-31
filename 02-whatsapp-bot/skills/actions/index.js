/**
 * GitHub Actions Skill for ClawdBot
 *
 * Manage GitHub Actions workflows from WhatsApp.
 *
 * Commands:
 *   workflows <repo>              - List all workflows
 *   runs <repo>                   - Show recent workflow runs
 *   run workflow <repo> <name>    - Trigger a workflow
 *   run status <repo> <run-id>    - Get status of a specific run
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');

class ActionsSkill extends BaseSkill {
  name = 'actions';
  description = 'GitHub Actions - trigger workflows, view runs';
  priority = 15;

  commands = [
    {
      pattern: /^workflows\s+(\S+)$/i,
      description: 'List all workflows in a repository',
      usage: 'workflows <repo>'
    },
    {
      pattern: /^runs\s+(\S+)$/i,
      description: 'Show recent workflow runs',
      usage: 'runs <repo>'
    },
    {
      pattern: /^run\s+workflow\s+(\S+)\s+(.+)$/i,
      description: 'Trigger a workflow',
      usage: 'run workflow <repo> <workflow-name>'
    },
    {
      pattern: /^run\s+status\s+(\S+)\s+(\d+)$/i,
      description: 'Get status of a workflow run',
      usage: 'run status <repo> <run-id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.username = process.env.GITHUB_USERNAME;
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // List workflows
      if (/^workflows\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^workflows\s+(\S+)$/i);
        return await this.listWorkflows(match[1]);
      }

      // List runs
      if (/^runs\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^runs\s+(\S+)$/i);
        return await this.listRuns(match[1]);
      }

      // Trigger workflow
      if (/^run\s+workflow\s+/i.test(raw)) {
        const match = raw.match(/^run\s+workflow\s+(\S+)\s+(.+)$/i);
        if (match) {
          return await this.triggerWorkflow(match[1], match[2].trim());
        }
      }

      // Run status
      if (/^run\s+status\s+/i.test(raw)) {
        const match = raw.match(/^run\s+status\s+(\S+)\s+(\d+)$/i);
        if (match) {
          return await this.getRunStatus(match[1], parseInt(match[2]));
        }
      }

      return this.error('Unknown command. Try: workflows <repo>, runs <repo>');
    } catch (err) {
      return this.error(`Actions error: ${err.message}`);
    }
  }

  async listWorkflows(repoName) {
    this.log('info', `Listing workflows for ${repoName}`);

    try {
      const response = await this.octokit.actions.listRepoWorkflows({
        owner: this.username,
        repo: repoName
      });

      const workflows = response.data.workflows;

      if (workflows.length === 0) {
        return this.success(`No workflows found in ${repoName}\n\n_Add .github/workflows/*.yml to create workflows_`);
      }

      let output = `⚙️ *Workflows: ${repoName}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      workflows.forEach((wf, i) => {
        const state = wf.state === 'active' ? '✅' : '⏸️';
        output += `${i + 1}. ${state} *${wf.name}*\n`;
        output += `   File: \`${wf.path.replace('.github/workflows/', '')}\`\n\n`;
      });

      output += `_Use "run workflow ${repoName} <name>" to trigger_`;

      return this.success(output);
    } catch (err) {
      if (err.status === 404) {
        return this.error(`Repository ${repoName} not found or no Actions access`);
      }
      throw err;
    }
  }

  async listRuns(repoName) {
    this.log('info', `Listing runs for ${repoName}`);

    try {
      const response = await this.octokit.actions.listWorkflowRunsForRepo({
        owner: this.username,
        repo: repoName,
        per_page: 10
      });

      const runs = response.data.workflow_runs;

      if (runs.length === 0) {
        return this.success(`No workflow runs found in ${repoName}`);
      }

      let output = `🏃 *Recent Runs: ${repoName}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      runs.forEach((run, i) => {
        const status = this.getStatusEmoji(run.status, run.conclusion);
        const time = this.formatTime(run.created_at);
        output += `${status} *${run.name}*\n`;
        output += `   #${run.run_number} • ${run.conclusion || run.status} • ${time}\n`;
        output += `   Branch: ${run.head_branch}\n\n`;
      });

      return this.success(output);
    } catch (err) {
      if (err.status === 404) {
        return this.error(`Repository ${repoName} not found`);
      }
      throw err;
    }
  }

  async triggerWorkflow(repoName, workflowName) {
    this.log('info', `Triggering workflow ${workflowName} in ${repoName}`);

    try {
      // First, find the workflow by name
      const listResponse = await this.octokit.actions.listRepoWorkflows({
        owner: this.username,
        repo: repoName
      });

      const workflow = listResponse.data.workflows.find(
        wf => wf.name.toLowerCase() === workflowName.toLowerCase() ||
              wf.path.toLowerCase().includes(workflowName.toLowerCase())
      );

      if (!workflow) {
        const available = listResponse.data.workflows.map(w => w.name).join(', ');
        return this.error(`Workflow "${workflowName}" not found.\n\nAvailable: ${available || 'none'}`);
      }

      // Get default branch
      const repoResponse = await this.octokit.repos.get({
        owner: this.username,
        repo: repoName
      });
      const defaultBranch = repoResponse.data.default_branch;

      // Trigger the workflow
      await this.octokit.actions.createWorkflowDispatch({
        owner: this.username,
        repo: repoName,
        workflow_id: workflow.id,
        ref: defaultBranch
      });

      return this.success(
        `✅ *Workflow Triggered!*\n\n` +
        `Workflow: ${workflow.name}\n` +
        `Repository: ${repoName}\n` +
        `Branch: ${defaultBranch}\n\n` +
        `_Use "runs ${repoName}" to check status_`
      );
    } catch (err) {
      if (err.status === 404) {
        return this.error(`Cannot trigger workflow. Make sure it has "workflow_dispatch" trigger enabled.`);
      }
      throw err;
    }
  }

  async getRunStatus(repoName, runId) {
    this.log('info', `Getting run status ${runId} in ${repoName}`);

    try {
      const response = await this.octokit.actions.getWorkflowRun({
        owner: this.username,
        repo: repoName,
        run_id: runId
      });

      const run = response.data;
      const status = this.getStatusEmoji(run.status, run.conclusion);

      let output = `${status} *Run #${run.run_number}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `Workflow: ${run.name}\n`;
      output += `Status: ${run.conclusion || run.status}\n`;
      output += `Branch: ${run.head_branch}\n`;
      output += `Commit: \`${run.head_sha.substring(0, 7)}\`\n`;
      output += `Started: ${this.formatTime(run.created_at)}\n`;

      if (run.conclusion) {
        output += `Finished: ${this.formatTime(run.updated_at)}\n`;
      }

      output += `\n${run.html_url}`;

      return this.success(output);
    } catch (err) {
      if (err.status === 404) {
        return this.error(`Run #${runId} not found in ${repoName}`);
      }
      throw err;
    }
  }

  getStatusEmoji(status, conclusion) {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return '✅';
        case 'failure': return '❌';
        case 'cancelled': return '⏹️';
        case 'skipped': return '⏭️';
        default: return '❓';
      }
    }
    switch (status) {
      case 'queued': return '⏳';
      case 'in_progress': return '🔄';
      case 'waiting': return '⏸️';
      default: return '❓';
    }
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}

module.exports = ActionsSkill;
