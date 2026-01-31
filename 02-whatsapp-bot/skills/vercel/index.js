/**
 * Vercel Deployment Skill for ClawdBot
 *
 * Provides Vercel deployment management through WhatsApp commands.
 * Uses the Vercel API (https://api.vercel.com) for all operations.
 *
 * Commands:
 *   deploy [project]              - Trigger a deployment for a project
 *   deploy status [project]       - Check deployment status
 *   list deployments [project]    - List recent deployments
 *   vercel projects               - List all Vercel projects
 *
 * Requires VERCEL_TOKEN environment variable.
 */

const BaseSkill = require('../base-skill');

class VercelSkill extends BaseSkill {
  name = 'vercel';
  description = 'Vercel deployment management - deploy, check status, list projects';
  priority = 10;

  commands = [
    {
      pattern: /^deploy\s+status\s+(\S+)$/i,
      description: 'Check deployment status for a project',
      usage: 'deploy status <project>'
    },
    {
      pattern: /^deploy\s+(\S+)$/i,
      description: 'Trigger a deployment for a project',
      usage: 'deploy <project>'
    },
    {
      pattern: /^list\s+deployments?\s+(\S+)$/i,
      description: 'List recent deployments for a project',
      usage: 'list deployments <project>'
    },
    {
      pattern: /^vercel\s+projects?$/i,
      description: 'List all Vercel projects',
      usage: 'vercel projects'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.apiBase = 'https://api.vercel.com';
    this.token = process.env.VERCEL_TOKEN || '';
  }

  /**
   * Check if Vercel token is configured
   */
  hasToken() {
    return !!this.token;
  }

  /**
   * Get missing token message
   */
  getMissingTokenMessage() {
    return (
      `Vercel token not configured.\n\n` +
      `To set up:\n` +
      `1. Go to vercel.com/account/tokens\n` +
      `2. Create a new token\n` +
      `3. Add VERCEL_TOKEN to your .env file\n` +
      `4. Restart the bot`
    );
  }

  /**
   * Make authenticated API request to Vercel
   */
  async apiRequest(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    // Check for token first
    if (!this.hasToken()) {
      return this.error(this.getMissingTokenMessage());
    }

    const { raw } = this.parseCommand(command);

    try {
      // Route to appropriate handler based on command pattern
      // Check deploy status first (more specific pattern)
      if (/^deploy\s+status\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^deploy\s+status\s+(\S+)$/i);
        return await this.handleDeployStatus(match[1]);
      }

      // Deploy a project
      if (/^deploy\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^deploy\s+(\S+)$/i);
        return await this.handleDeploy(match[1]);
      }

      // List deployments
      if (/^list\s+deployments?\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^list\s+deployments?\s+(\S+)$/i);
        return await this.handleListDeployments(match[1]);
      }

      // List projects
      if (/^vercel\s+projects?$/i.test(raw)) {
        return await this.handleListProjects();
      }

      return this.error('Command not recognized. Try "vercel projects" to see available projects.');

    } catch (err) {
      this.log('error', 'Vercel command failed', err);
      return this.error(`Vercel error: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * List all Vercel projects
   */
  async handleListProjects() {
    this.log('info', 'Listing Vercel projects');

    const data = await this.apiRequest('/v9/projects');
    const projects = data.projects || [];

    if (projects.length === 0) {
      return this.success('No projects found in your Vercel account.');
    }

    const projectList = projects.slice(0, 10).map(p => {
      const framework = p.framework || 'unknown';
      return `- ${p.name} (${framework})`;
    }).join('\n');

    const total = projects.length;
    const shown = Math.min(total, 10);
    const message = `*Vercel Projects (${shown}/${total}):*\n\n${projectList}`;

    return this.success(message);
  }

  /**
   * Trigger a deployment for a project
   */
  async handleDeploy(projectName) {
    this.log('info', `Triggering deployment for: ${projectName}`);

    // First, find the project to get its ID and linked repo
    const projectData = await this.apiRequest(`/v9/projects/${projectName}`);

    if (!projectData.id) {
      return this.error(`Project "${projectName}" not found.`);
    }

    // Get the linked Git repository
    const link = projectData.link;
    if (!link || !link.type) {
      return this.error(
        `Project "${projectName}" has no linked Git repo.\n` +
        `Deploy from Vercel dashboard or link a repo first.`
      );
    }

    // Create a deployment using the project's production branch
    const deployData = await this.apiRequest('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        project: projectData.id,
        target: 'production',
        gitSource: {
          type: link.type,
          ref: link.productionBranch || 'main',
          repoId: link.repoId
        }
      })
    });

    const status = deployData.status || 'queued';
    const url = deployData.url ? `https://${deployData.url}` : 'pending';

    return this.success(
      `Deployment triggered!\n\n` +
      `Project: ${projectName}\n` +
      `Status: ${status}\n` +
      `URL: ${url}\n\n` +
      `Use "deploy status ${projectName}" to check progress.`
    );
  }

  /**
   * Check deployment status for a project
   */
  async handleDeployStatus(projectName) {
    this.log('info', `Checking deployment status for: ${projectName}`);

    // Get latest deployment for the project
    const data = await this.apiRequest(
      `/v6/deployments?projectId=${projectName}&limit=1&target=production`
    );

    const deployments = data.deployments || [];

    if (deployments.length === 0) {
      return this.success(`No deployments found for "${projectName}".`);
    }

    const latest = deployments[0];
    const status = this.formatDeploymentStatus(latest.state || latest.readyState);
    const url = latest.url ? `https://${latest.url}` : 'N/A';
    const created = this.formatTimestamp(latest.created || latest.createdAt);

    return this.success(
      `*Latest Deployment:*\n\n` +
      `Project: ${projectName}\n` +
      `Status: ${status}\n` +
      `URL: ${url}\n` +
      `Created: ${created}`
    );
  }

  /**
   * List recent deployments for a project
   */
  async handleListDeployments(projectName) {
    this.log('info', `Listing deployments for: ${projectName}`);

    const data = await this.apiRequest(
      `/v6/deployments?projectId=${projectName}&limit=5`
    );

    const deployments = data.deployments || [];

    if (deployments.length === 0) {
      return this.success(`No deployments found for "${projectName}".`);
    }

    const deployList = deployments.map(d => {
      const status = this.formatDeploymentStatus(d.state || d.readyState);
      const created = this.formatTimestamp(d.created || d.createdAt);
      const target = d.target || 'preview';
      return `- ${status} (${target}) - ${created}`;
    }).join('\n');

    return this.success(
      `*Recent Deployments for ${projectName}:*\n\n${deployList}`
    );
  }

  // ============ Helper Methods ============

  /**
   * Format deployment status with emoji indicators
   */
  formatDeploymentStatus(state) {
    const statusMap = {
      'READY': 'Ready',
      'BUILDING': 'Building...',
      'QUEUED': 'Queued',
      'INITIALIZING': 'Initializing',
      'ERROR': 'Failed',
      'CANCELED': 'Cancelled'
    };
    return statusMap[state] || state || 'Unknown';
  }

  /**
   * Format timestamp for WhatsApp display
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';

    const date = new Date(typeof timestamp === 'number' ? timestamp : timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  }
}

module.exports = VercelSkill;
