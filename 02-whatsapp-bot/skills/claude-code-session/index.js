const BaseSkill = require('../base-skill');
const database = require('../../lib/database');
const taskQueue = require('../../lib/task-queue');
const monitor = require('../../lib/claude-code-monitor');
const confirmationManager = require('../../lib/confirmation-manager');
const path = require('path');

class ClaudeCodeSessionSkill extends BaseSkill {
  name = 'claude-code-session';
  description = 'Run autonomous Claude Code sessions for coding tasks';
  priority = 25;

  commands = [
    {
      pattern: /^(start\s+)?claude\s+code\s+session\s+(.+)$/i,
      description: 'Start a Claude Code session with a task',
      usage: 'claude code session <task description>'
    },
    {
      pattern: /^claude\s+code\s+status$/i,
      description: 'Get status of active Claude Code session',
      usage: 'claude code status'
    },
    {
      pattern: /^(cancel|stop)\s+claude\s+code$/i,
      description: 'Cancel the active Claude Code session',
      usage: 'cancel claude code'
    }
  ];

  /**
   * Main execute handler
   */
  async execute(command, context) {
    const { raw, match } = this.parseCommand(command);

    // Route to appropriate handler
    if (/^claude\s+code\s+status$/i.test(raw)) {
      return await this.getStatus(context);
    }

    if (/^(cancel|stop)\s+claude\s+code$/i.test(raw)) {
      return await this.cancelSession(context);
    }

    // Start session command
    const taskMatch = raw.match(/claude\s+code\s+session\s+(.+)$/i);
    if (taskMatch) {
      const taskDesc = taskMatch[1].trim();
      return await this.startSession(taskDesc, context);
    }

    return this.error('Unknown Claude Code command');
  }

  /**
   * Start a new Claude Code session
   */
  async startSession(taskDesc, context) {
    const { userId, chatId, autoRepo, sendProgress } = context;

    // Check if repo is specified
    if (!autoRepo) {
      return this.error('No project specified', null, {
        suggestion: 'Register this chat to a project or specify repo'
      });
    }

    // Check if there's already an active session
    const active = database.getActiveClaudeCodeSession(chatId);
    if (active) {
      return this.error('Session already active', null, {
        attempted: active.task,
        suggestion: 'Use "claude code status" to check progress or "cancel claude code" to stop it'
      });
    }

    // Create confirmation
    const sessionId = this.generateSessionId();

    confirmationManager.setPending(
      userId,
      'claude_code_session',
      { sessionId, repo: autoRepo, task: taskDesc },
      context
    );

    return this.warning('Start Claude Code session', {
      cost: '$0.50-2.00 (estimated)',
      risk: 'low',
      action: `This will run for 5-15 minutes and create a PR.\nReply 'yes' to proceed.`,
      data: { sessionId, repo: autoRepo, task: taskDesc }
    });
  }

  /**
   * Execute confirmed session
   */
  async executeSession(sessionId, repo, taskDesc, context) {
    const { userId, chatId, sendProgress } = context;

    // Save to database
    database.saveClaudeCodeSession(chatId, userId, { sessionId, repo, task: taskDesc });

    // Determine repo path
    const repoPath = this.getRepoPath(repo);
    if (!repoPath) {
      return this.error(`Unknown repo: ${repo}`);
    }

    // Log path
    const logPath = `/tmp/claude-code-${sessionId}.log`;

    // Update status to active
    database.updateClaudeCodeSession(sessionId, { status: 'active' });

    // Add to task queue
    const taskId = await taskQueue.addTask('claude_code_session', {
      sessionId,
      repo,
      task: taskDesc,
      repoPath,
      logPath
    }, {
      sendProgress: sendProgress || (() => {})
    });

    // Get PID after process starts (wait a moment)
    setTimeout(async () => {
      const session = database.getActiveClaudeCodeSession(chatId);
      if (session && session.pid) {
        // Start monitoring
        await monitor.startMonitoring(sessionId, session.pid, logPath, sendProgress);

        // Set timeout (30 minutes)
        setTimeout(() => {
          if (database.getActiveClaudeCodeSession(chatId)) {
            taskQueue.cancelTask(taskId);
            database.updateClaudeCodeSession(sessionId, { status: 'timeout' });
            if (sendProgress) {
              sendProgress('❌ Claude Code session timed out after 30 minutes');
            }
          }
        }, 30 * 60 * 1000);
      }
    }, 2000);

    return this.success(`Claude Code session started for ${repo}\nTask: ${taskDesc}\n\nI'll send updates as it progresses.`);
  }

  /**
   * Get session status
   */
  async getStatus(context) {
    const { chatId } = context;

    const active = database.getActiveClaudeCodeSession(chatId);

    if (!active) {
      // Get recent history
      const history = database.getClaudeCodeSessionHistory(chatId, 3);

      if (history.length === 0) {
        return this.success('No Claude Code sessions yet');
      }

      let response = '📊 *Recent Claude Code Sessions*\n\n';
      for (const sess of history) {
        const status = this.statusEmoji(sess.status);
        const date = new Date(sess.created_at).toLocaleDateString();
        response += `${status} ${sess.task.substring(0, 50)}...\n`;
        response += `   ${date} | ${sess.repo}\n`;
        if (sess.pr_url) {
          response += `   PR: ${sess.pr_url}\n`;
        }
        response += '\n';
      }

      return this.success(response);
    }

    // Active session
    const runtime = this.calculateRuntime(active.started_at || active.created_at);

    return this.success(
      `🔄 *Active Claude Code Session*\n\n` +
      `Task: ${active.task}\n` +
      `Repo: ${active.repo}\n` +
      `Runtime: ${runtime}\n` +
      `Status: ${active.status}\n\n` +
      `Use "cancel claude code" to stop it.`
    );
  }

  /**
   * Cancel active session
   */
  async cancelSession(context) {
    const { chatId, userId, sendProgress } = context;

    const active = database.getActiveClaudeCodeSession(chatId);

    if (!active) {
      return this.error('No active session to cancel');
    }

    // Stop monitoring
    monitor.stopMonitoring(active.session_id);

    // Cancel task in queue
    await taskQueue.cancelTask(active.session_id);

    // Update database
    database.updateClaudeCodeSession(active.session_id, { status: 'cancelled' });

    if (sendProgress) {
      await sendProgress('🛑 Claude Code session cancelled');
    }

    return this.success(`Cancelled Claude Code session: ${active.task}`);
  }

  /**
   * Get repo path on EC2
   */
  getRepoPath(repo) {
    const knownRepos = {
      'aws-clawd-bot': '/opt/clawd-bot',
      'JUDO': '/opt/projects/JUDO',
      'LusoTown': '/opt/projects/LusoTown',
      'armora': '/opt/projects/armora',
      'gqcars-manager': '/opt/projects/gqcars-manager',
      'gq-cars-driver-app': '/opt/projects/gq-cars-driver-app',
      'giquina-accountancy-direct-filing': '/opt/projects/giquina-accountancy-direct-filing'
    };

    return knownRepos[repo] || null;
  }

  statusEmoji(status) {
    const emojis = {
      'completed': '✅',
      'failed': '❌',
      'cancelled': '🛑',
      'timeout': '⏱️',
      'active': '🔄',
      'pending': '⏳'
    };
    return emojis[status] || '❓';
  }

  calculateRuntime(startTime) {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diff = Math.floor((now - start) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  }

  generateSessionId() {
    return `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  }
}

module.exports = ClaudeCodeSessionSkill;
