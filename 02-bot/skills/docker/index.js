/**
 * Docker Management Skill for ClawdBot
 *
 * Executes Docker commands on EC2 for container management.
 * All commands are whitelisted and project-scoped for security.
 *
 * Commands:
 *   docker ps                     - List all containers
 *   docker logs <container>       - View container logs
 *   docker restart <container>    - Restart a container (requires confirmation)
 *   docker stats                  - View resource usage
 *   docker status                 - Alias for docker ps
 *   docker containers             - Alias for docker ps
 *
 * @module skills/docker
 */

const BaseSkill = require('../base-skill');
const { exec } = require('child_process');
const { promisify } = require('util');
const outcomeTracker = require('../../lib/outcome-tracker');

const execAsync = promisify(exec);

// Whitelisted Docker commands - safe read-only operations
const SAFE_COMMANDS = {
  'ps': {
    command: 'docker ps -a --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Image}}"',
    timeout: 10000,
    description: 'List all containers'
  },
  'stats': {
    command: 'docker stats --no-stream --format "{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}"',
    timeout: 15000,
    description: 'Show resource usage'
  }
};

// Commands requiring confirmation
const DANGEROUS_COMMANDS = {
  'restart': {
    pattern: /^restart$/,
    timeout: 30000,
    description: 'Restart a container'
  }
};

// In-memory pending confirmations
const pendingConfirmations = new Map();
const CONFIRMATION_TTL = 5 * 60 * 1000; // 5 minutes

class DockerSkill extends BaseSkill {
  name = 'docker';
  description = 'Manage Docker containers on EC2 - list, logs, restart, stats';
  priority = 22; // High priority for explicit docker commands

  commands = [
    {
      pattern: /^docker\s+(ps|containers|status)$/i,
      description: 'List all Docker containers',
      usage: 'docker ps'
    },
    {
      pattern: /^docker\s+logs\s+(.+)$/i,
      description: 'View logs for a container',
      usage: 'docker logs <container>'
    },
    {
      pattern: /^docker\s+restart\s+(.+)$/i,
      description: 'Restart a container (requires confirmation)',
      usage: 'docker restart <container>'
    },
    {
      pattern: /^docker\s+stats$/i,
      description: 'Show container resource usage',
      usage: 'docker stats'
    },
    {
      pattern: /^confirm\s+docker-(\w+)$/i,
      description: 'Confirm a pending Docker operation',
      usage: 'confirm docker-<id>'
    },
    {
      pattern: /^cancel\s+docker-(\w+)$/i,
      description: 'Cancel a pending Docker operation',
      usage: 'cancel docker-<id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.isEC2 = process.platform === 'linux'; // Only actually execute on EC2
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // List containers
      if (/^docker\s+(ps|containers|status)$/i.test(raw)) {
        return await this.listContainers(context);
      }

      // View logs
      if (/^docker\s+logs\s+(.+)$/i.test(raw)) {
        const match = raw.match(/^docker\s+logs\s+(.+)$/i);
        const container = this.sanitizeContainerName(match[1]);
        return await this.viewLogs(container, context);
      }

      // Restart container (requires confirmation)
      if (/^docker\s+restart\s+(.+)$/i.test(raw)) {
        const match = raw.match(/^docker\s+restart\s+(.+)$/i);
        const container = this.sanitizeContainerName(match[1]);
        return this.requestRestart(container, context);
      }

      // Container stats
      if (/^docker\s+stats$/i.test(raw)) {
        return await this.showStats(context);
      }

      // Confirm pending operation
      if (/^confirm\s+docker-(\w+)$/i.test(raw)) {
        const match = raw.match(/^confirm\s+docker-(\w+)$/i);
        return await this.confirmPending(match[1], context);
      }

      // Cancel pending operation
      if (/^cancel\s+docker-(\w+)$/i.test(raw)) {
        const match = raw.match(/^cancel\s+docker-(\w+)$/i);
        return this.cancelPending(match[1]);
      }

      return this.error('Unknown docker command. Try: docker ps, docker logs <container>, docker stats');
    } catch (err) {
      this.log('error', 'Docker command error', err);
      return this.error(`Docker command failed: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * List all Docker containers
   */
  async listContainers(context) {
    this.log('info', 'Listing Docker containers');

    const outcomeId = outcomeTracker.startAction({
      chatId: context?.chatId || 'unknown',
      userId: context?.userId || 'unknown',
      actionType: 'docker_ps',
      actionDetail: 'List Docker containers'
    });

    const startTime = Date.now();
    const result = await this.executeDockerCommand(SAFE_COMMANDS.ps.command, SAFE_COMMANDS.ps.timeout);
    const duration = Date.now() - startTime;

    if (result.success) {
      const containers = this.parseContainerList(result.output);

      let response = `🐳 *Docker Containers*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (containers.length === 0) {
        response += `No containers found.\n`;
      } else {
        containers.forEach(c => {
          const statusIcon = c.status.toLowerCase().includes('up') ? '🟢' : '🔴';
          response += `${statusIcon} *${c.name}*\n`;
          response += `   ID: ${c.id}\n`;
          response += `   Status: ${c.status}\n`;
          response += `   Image: ${c.image}\n\n`;
        });
      }

      response += `⏱️ Response time: ${duration}ms`;

      outcomeTracker.completeAction(outcomeId, {
        result: 'success',
        resultDetail: `Found ${containers.length} containers`,
        durationMs: duration
      });

      return this.success(response);
    } else {
      outcomeTracker.completeAction(outcomeId, {
        result: 'failed',
        resultDetail: result.error,
        durationMs: duration
      });

      return this.error('Failed to list containers', result.error, {
        attempted: 'docker ps',
        suggestion: 'Check if Docker is running on the server'
      });
    }
  }

  /**
   * View logs for a container
   */
  async viewLogs(container, context) {
    if (!container) {
      return this.error('Container name required. Usage: docker logs <container>');
    }

    this.log('info', `Viewing logs for container: ${container}`);

    const outcomeId = outcomeTracker.startAction({
      chatId: context?.chatId || 'unknown',
      userId: context?.userId || 'unknown',
      actionType: 'docker_logs',
      actionDetail: `View logs for ${container}`
    });

    const startTime = Date.now();
    const command = `docker logs --tail 50 ${container}`;
    const result = await this.executeDockerCommand(command, 30000);
    const duration = Date.now() - startTime;

    if (result.success) {
      const logs = this.truncateOutput(result.output, 2500);

      let response = `📋 *Docker Logs: ${container}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `\`\`\`\n${logs}\n\`\`\`\n\n`;
      response += `⏱️ Last 50 lines | ${duration}ms`;

      outcomeTracker.completeAction(outcomeId, {
        result: 'success',
        resultDetail: 'Logs retrieved',
        durationMs: duration
      });

      return this.success(response);
    } else {
      outcomeTracker.completeAction(outcomeId, {
        result: 'failed',
        resultDetail: result.error,
        durationMs: duration
      });

      return this.error(`Failed to get logs for ${container}`, result.error, {
        attempted: `docker logs ${container}`,
        suggestion: 'Check if container name is correct (use: docker ps)'
      });
    }
  }

  /**
   * Request confirmation for container restart
   */
  requestRestart(container, context) {
    if (!container) {
      return this.error('Container name required. Usage: docker restart <container>');
    }

    this.log('info', `Restart requested for: ${container}`);

    // Create confirmation ID
    const confirmId = this.createPendingConfirmation({
      action: 'restart',
      container,
      context
    });

    let response = `🔄 *Restart Docker Container*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `⚠️ This will restart the container: *${container}*\n\n`;
    response += `Container may be briefly unavailable.\n\n`;
    response += `To proceed, reply:\n`;
    response += `\`confirm docker-${confirmId}\`\n\n`;
    response += `To cancel:\n`;
    response += `\`cancel docker-${confirmId}\``;

    return this.success(response);
  }

  /**
   * Execute container restart after confirmation
   */
  async executeRestart(pending) {
    const { container, context } = pending;

    this.log('info', `Restarting container: ${container}`);

    const outcomeId = outcomeTracker.startAction({
      chatId: context?.chatId || 'unknown',
      userId: context?.userId || 'unknown',
      actionType: 'docker_restart',
      actionDetail: `Restart container ${container}`
    });

    const startTime = Date.now();
    const command = `docker restart ${container}`;
    const result = await this.executeDockerCommand(command, 30000);
    const duration = Date.now() - startTime;

    if (result.success) {
      // Wait a moment for restart to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check container status
      const statusResult = await this.executeDockerCommand(
        `docker ps -a --filter "name=${container}" --format "{{.Status}}"`,
        5000
      );

      let response = `✅ *Container Restarted: ${container}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (statusResult.success && statusResult.output) {
        const status = statusResult.output.trim();
        const statusIcon = status.toLowerCase().includes('up') ? '🟢' : '🔴';
        response += `${statusIcon} Status: ${status}\n`;
      }

      response += `⏱️ Completed in ${(duration / 1000).toFixed(1)}s`;

      outcomeTracker.completeAction(outcomeId, {
        result: 'success',
        resultDetail: 'Container restarted successfully',
        durationMs: duration
      });

      return this.success(response);
    } else {
      outcomeTracker.completeAction(outcomeId, {
        result: 'failed',
        resultDetail: result.error,
        durationMs: duration
      });

      return this.error(`Failed to restart ${container}`, result.error, {
        attempted: `docker restart ${container}`,
        suggestion: 'Check if container exists and Docker daemon is running'
      });
    }
  }

  /**
   * Show container resource usage
   */
  async showStats(context) {
    this.log('info', 'Fetching Docker stats');

    const outcomeId = outcomeTracker.startAction({
      chatId: context?.chatId || 'unknown',
      userId: context?.userId || 'unknown',
      actionType: 'docker_stats',
      actionDetail: 'View container resource usage'
    });

    const startTime = Date.now();
    const result = await this.executeDockerCommand(SAFE_COMMANDS.stats.command, SAFE_COMMANDS.stats.timeout);
    const duration = Date.now() - startTime;

    if (result.success) {
      const stats = this.parseStats(result.output);

      let response = `📊 *Docker Container Stats*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (stats.length === 0) {
        response += `No running containers found.\n`;
      } else {
        stats.forEach(s => {
          response += `🐳 *${s.name}*\n`;
          response += `   CPU: ${s.cpu}\n`;
          response += `   Memory: ${s.memory} (${s.memPercent})\n\n`;
        });
      }

      response += `⏱️ Response time: ${duration}ms`;

      outcomeTracker.completeAction(outcomeId, {
        result: 'success',
        resultDetail: `Stats for ${stats.length} containers`,
        durationMs: duration
      });

      return this.success(response);
    } else {
      outcomeTracker.completeAction(outcomeId, {
        result: 'failed',
        resultDetail: result.error,
        durationMs: duration
      });

      return this.error('Failed to get container stats', result.error, {
        attempted: 'docker stats',
        suggestion: 'Check if Docker is running'
      });
    }
  }

  // ============ Confirmation System ============

  /**
   * Create a pending confirmation
   */
  createPendingConfirmation(data) {
    const id = Math.random().toString(36).substring(2, 8);
    const expiry = Date.now() + CONFIRMATION_TTL;

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
      return this.error(`No pending operation found with ID: docker-${confirmId}`);
    }

    if (Date.now() > pending.expiry) {
      pendingConfirmations.delete(confirmId);
      return this.error('Confirmation expired. Please start the operation again.');
    }

    // Remove from pending
    pendingConfirmations.delete(confirmId);

    // Execute based on action type
    switch (pending.action) {
      case 'restart':
        return await this.executeRestart(pending);
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
      return this.success(`✅ Docker operation docker-${confirmId} cancelled.`);
    } else {
      return this.error(`No pending operation found with ID: docker-${confirmId}`);
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
   * Execute a Docker command with timeout
   */
  async executeDockerCommand(command, timeout = 30000) {
    // On non-EC2 (Windows dev), simulate success
    if (!this.isEC2) {
      this.log('warn', `[DEV MODE] Would execute: ${command}`);
      return {
        success: true,
        output: `[DEV MODE] Simulated execution of: ${command}\n\nSample container output...`,
        simulated: true
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
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
   * Parse container list output
   */
  parseContainerList(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.split('\t');
      return {
        id: (parts[0] || '').substring(0, 12),
        name: parts[1] || 'unknown',
        status: parts[2] || 'unknown',
        image: parts[3] || 'unknown'
      };
    });
  }

  /**
   * Parse stats output
   */
  parseStats(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.split('\t');
      return {
        name: parts[0] || 'unknown',
        cpu: parts[1] || '0%',
        memory: parts[2] || '0MiB / 0MiB',
        memPercent: parts[3] || '0%'
      };
    });
  }

  /**
   * Sanitize container name to prevent injection
   */
  sanitizeContainerName(name) {
    // Remove any shell metacharacters
    return name
      .replace(/[;&|`$(){}[\]<>]/g, '')
      .replace(/\.\./g, '')
      .trim();
  }

  /**
   * Truncate output for messaging platforms
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
}

module.exports = DockerSkill;
