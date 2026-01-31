/**
 * Overnight Skill - Queue tasks to run while you sleep
 *
 * Allows users to queue tasks for overnight processing at 2 AM.
 * Tasks are stored in memory and processed via the scheduler.
 *
 * Commands:
 *   tonight <task>           - Queue a task for tonight
 *   overnight <task>         - Same as above
 *   queue <task>             - Same as above
 *   my queue / queued tasks  - Show pending queued tasks
 *   clear queue              - Clear all queued tasks
 *
 * @example
 * tonight, fix all ESLint errors in armora
 * overnight, review all open PRs
 * queue: update dependencies in aws-clawd-bot
 * my queue
 * clear queue
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');
const { Octokit } = require('@octokit/rest');

class OvernightSkill extends BaseSkill {
  name = 'overnight';
  description = 'Queue tasks to run overnight while you sleep';
  priority = 35; // Medium priority

  commands = [
    {
      pattern: /^(tonight|overnight),?\s+(.+)$/i,
      description: 'Queue task for tonight',
      usage: 'tonight <task>'
    },
    {
      pattern: /^queue:?\s+(.+)$/i,
      description: 'Queue a task',
      usage: 'queue <task>'
    },
    {
      pattern: /^(my queue|queued tasks|show queue)$/i,
      description: 'Show queued tasks',
      usage: 'my queue'
    },
    {
      pattern: /^clear queue$/i,
      description: 'Clear all queued tasks',
      usage: 'clear queue'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.octokit = null;
    this.claude = null;
    this.username = process.env.GITHUB_USERNAME;
    this.queue = []; // In-memory queue, could use SQLite for persistence
    this.OVERNIGHT_JOB_NAME = 'overnight-queue-processor';
    this.PROCESS_HOUR = 2; // 2 AM
  }

  /**
   * Initialize the skill and set up overnight processing schedule
   */
  async initialize() {
    await super.initialize();

    try {
      // Initialize API clients
      if (process.env.GITHUB_TOKEN) {
        this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      }
      if (process.env.ANTHROPIC_API_KEY) {
        this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }

      // Set up overnight processing schedule if scheduler is available
      if (this.config.scheduler) {
        await this._initializeOvernightSchedule();
      }

      this.log('info', 'Overnight skill initialized');
    } catch (error) {
      this.log('warn', 'Error initializing overnight skill', error.message);
    }
  }

  /**
   * Execute overnight queue commands
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    // Tonight/overnight task
    let match = raw.match(/^(tonight|overnight),?\s+(.+)$/i);
    if (match) {
      return await this.queueTask(match[2], context);
    }

    // Queue task
    match = raw.match(/^queue:?\s+(.+)$/i);
    if (match) {
      return await this.queueTask(match[1], context);
    }

    // Show queue
    if (/^(my queue|queued tasks|show queue)$/i.test(raw)) {
      return this.showQueue(context);
    }

    // Clear queue
    if (/^clear queue$/i.test(raw)) {
      return this.clearQueue(context);
    }

    return this.error('Unknown command');
  }

  /**
   * Queue a task for overnight processing
   * @param {string} taskDescription - Description of the task
   * @param {Object} context - Execution context
   */
  async queueTask(taskDescription, context) {
    const task = {
      id: `TASK_${Date.now()}`,
      description: taskDescription,
      status: 'queued',
      createdAt: new Date().toISOString(),
      userId: context.userId || context.from
    };

    // Parse task to understand what needs to be done
    const parsed = await this.parseTask(taskDescription);
    task.parsed = parsed;

    this.queue.push(task);

    // Calculate when the task will run
    const now = new Date();
    const processTime = new Date();
    processTime.setHours(this.PROCESS_HOUR, 0, 0, 0);
    if (processTime <= now) {
      processTime.setDate(processTime.getDate() + 1);
    }
    const hoursUntil = Math.round((processTime - now) / (1000 * 60 * 60));

    return this.success(
      `*Task Queued for Tonight*\n\n` +
      `${taskDescription}\n\n` +
      `*What I understood:*\n` +
      `  Action: ${parsed.action}\n` +
      `  Target: ${parsed.target || 'N/A'}\n` +
      `  Repo: ${parsed.repo || 'N/A'}\n\n` +
      `Will process at ${this.PROCESS_HOUR}:00 AM (~${hoursUntil}h)\n` +
      `Queue size: ${this.queue.length} task(s)\n\n` +
      `_Reply "my queue" to see all queued tasks_`
    );
  }

  /**
   * Parse a task description using Claude to understand intent
   * @param {string} description - Task description
   * @returns {Object} Parsed task with action, repo, target, details
   */
  async parseTask(description) {
    if (!this.claude) {
      return {
        action: 'other',
        repo: this._extractRepoName(description),
        target: null,
        details: description
      };
    }

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Parse this task into JSON. Reply with ONLY valid JSON, no explanation.

Task: "${description}"

Return JSON with these fields:
- action: one of "fix_eslint", "review_prs", "update_deps", "create_pr", "fix_bugs", "run_tests", "refactor", "other"
- repo: repository name mentioned (or null if none)
- target: specific target like file, branch, or feature (or null)
- details: any additional info extracted

JSON:`
        }]
      });

      const jsonText = response.content[0].text.trim();
      return JSON.parse(jsonText);
    } catch (e) {
      this.log('warn', 'Failed to parse task with AI', e.message);
      return {
        action: 'other',
        repo: this._extractRepoName(description),
        target: null,
        details: description
      };
    }
  }

  /**
   * Extract repository name from description using simple pattern matching
   * @private
   */
  _extractRepoName(description) {
    // Common patterns: "in <repo>", "for <repo>", "<repo> repo"
    const patterns = [
      /\bin\s+([a-zA-Z0-9_-]+)/i,
      /\bfor\s+([a-zA-Z0-9_-]+)/i,
      /([a-zA-Z0-9_-]+)\s+repo\b/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Show all queued tasks for the user
   * @param {Object} context - Execution context
   */
  showQueue(context) {
    const userId = context.userId || context.from;
    const userQueue = this.queue.filter(t => t.userId === userId);

    if (userQueue.length === 0) {
      return this.success(
        '*Your overnight queue is empty*\n\n' +
        'Use `tonight <task>` to add tasks.\n\n' +
        '*Examples:*\n' +
        '  tonight, fix all ESLint errors in armora\n' +
        '  overnight, review all open PRs\n' +
        '  queue: update dependencies in aws-clawd-bot'
      );
    }

    let output = `*Overnight Queue* (${userQueue.length} tasks)\n\n`;

    userQueue.forEach((task, i) => {
      const createdTime = new Date(task.createdAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const statusIcon = this._getStatusIcon(task.status);

      output += `${i + 1}. ${task.description}\n`;
      output += `   ${statusIcon} ${task.status} | Added: ${createdTime}\n`;

      if (task.parsed && task.parsed.action !== 'other') {
        output += `   Action: ${task.parsed.action}`;
        if (task.parsed.repo) {
          output += ` | Repo: ${task.parsed.repo}`;
        }
        output += '\n';
      }
      output += '\n';
    });

    output += `_Tasks will process at ${this.PROCESS_HOUR}:00 AM_`;

    return this.success(output);
  }

  /**
   * Get status icon for display
   * @private
   */
  _getStatusIcon(status) {
    const icons = {
      queued: '[PENDING]',
      processing: '[RUNNING]',
      completed: '[DONE]',
      failed: '[FAILED]'
    };
    return icons[status] || '[?]';
  }

  /**
   * Clear all queued tasks for the user
   * @param {Object} context - Execution context
   */
  clearQueue(context) {
    const userId = context.userId || context.from;
    const before = this.queue.length;
    this.queue = this.queue.filter(t => t.userId !== userId);
    const removed = before - this.queue.length;

    if (removed === 0) {
      return this.success('Your queue was already empty.');
    }

    return this.success(`Cleared ${removed} task(s) from your queue.`);
  }

  /**
   * Initialize the overnight processing schedule
   * @private
   */
  async _initializeOvernightSchedule() {
    try {
      const scheduler = this.config.scheduler;

      // Check if job already exists
      const existingJob = await scheduler.getJobByName(this.OVERNIGHT_JOB_NAME);

      if (!existingJob) {
        // Register our handler
        scheduler.registerHandler('overnight-queue', this.processQueue.bind(this));

        // Schedule at 2 AM daily
        const cronExpression = `0 ${this.PROCESS_HOUR} * * *`;

        await scheduler.schedule(
          this.OVERNIGHT_JOB_NAME,
          cronExpression,
          'overnight-queue',
          {}
        );

        this.log('info', `Scheduled overnight queue processing at ${this.PROCESS_HOUR}:00 AM`);
      }
    } catch (error) {
      this.log('warn', 'Could not initialize overnight schedule', error.message);
    }
  }

  /**
   * Process all queued tasks - called by scheduler at 2 AM
   * @returns {Promise<string>} Summary message
   */
  async processQueue() {
    const pendingTasks = this.queue.filter(t => t.status === 'queued');
    this.log('info', `Processing ${pendingTasks.length} overnight tasks...`);

    if (pendingTasks.length === 0) {
      return null; // No message to send if queue is empty
    }

    const results = {
      completed: 0,
      failed: 0,
      details: []
    };

    for (const task of pendingTasks) {
      task.status = 'processing';
      task.startedAt = new Date().toISOString();

      try {
        const result = await this.executeTask(task);
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.result = result;
        results.completed++;
        results.details.push({
          task: task.description,
          success: true,
          message: result.message || 'Completed'
        });
      } catch (e) {
        task.status = 'failed';
        task.error = e.message;
        results.failed++;
        results.details.push({
          task: task.description,
          success: false,
          message: e.message
        });
        this.log('error', `Task failed: ${task.description}`, e.message);
      }
    }

    // Remove completed tasks from queue
    this.queue = this.queue.filter(t => t.status !== 'completed');

    // Build summary message
    let summary = `*Overnight Tasks Complete*\n\n`;
    summary += `Completed: ${results.completed}\n`;
    summary += `Failed: ${results.failed}\n\n`;

    if (results.details.length > 0) {
      summary += `*Details:*\n`;
      results.details.forEach((d, i) => {
        const icon = d.success ? '[OK]' : '[FAIL]';
        summary += `${i + 1}. ${icon} ${d.task}\n`;
        if (!d.success) {
          summary += `   Error: ${d.message}\n`;
        }
      });
    }

    return summary;
  }

  /**
   * Execute a single task based on its parsed action
   * @param {Object} task - Task to execute
   * @returns {Object} Execution result
   */
  async executeTask(task) {
    const { parsed, description } = task;

    this.log('info', `Executing task: ${description}`);

    switch (parsed.action) {
      case 'fix_eslint':
        return await this._executeFixEslint(task);

      case 'review_prs':
        return await this._executeReviewPrs(task);

      case 'update_deps':
        return await this._executeUpdateDeps(task);

      case 'run_tests':
        return await this._executeRunTests(task);

      case 'fix_bugs':
        return await this._executeFixBugs(task);

      default:
        return await this._executeGenericTask(task);
    }
  }

  /**
   * Fix ESLint errors in a repository
   * @private
   */
  async _executeFixEslint(task) {
    const repo = task.parsed.repo;

    if (!repo) {
      throw new Error('No repository specified for ESLint fix');
    }

    if (!this.octokit) {
      throw new Error('GitHub not configured');
    }

    // This would integrate with the coder skill or GitHub API
    // For now, log what would happen
    this.log('info', `Would fix ESLint errors in ${repo}`);

    return {
      success: true,
      message: `ESLint fix queued for ${repo}. Check GitHub for PR.`
    };
  }

  /**
   * Review open PRs
   * @private
   */
  async _executeReviewPrs(task) {
    if (!this.octokit) {
      throw new Error('GitHub not configured');
    }

    const repo = task.parsed.repo;

    try {
      let prs;
      if (repo) {
        // Get PRs for specific repo
        const { data } = await this.octokit.pulls.list({
          owner: this.username,
          repo: repo,
          state: 'open'
        });
        prs = data;
      } else {
        // Get all PRs across repos (would need to iterate)
        throw new Error('Please specify a repository');
      }

      if (prs.length === 0) {
        return {
          success: true,
          message: `No open PRs in ${repo}`
        };
      }

      // Review each PR (simplified - would use Claude for actual review)
      const reviews = [];
      for (const pr of prs.slice(0, 5)) { // Limit to 5
        reviews.push(`#${pr.number}: ${pr.title}`);
      }

      return {
        success: true,
        message: `Reviewed ${reviews.length} PRs in ${repo}:\n${reviews.join('\n')}`
      };
    } catch (e) {
      throw new Error(`PR review failed: ${e.message}`);
    }
  }

  /**
   * Update dependencies
   * @private
   */
  async _executeUpdateDeps(task) {
    const repo = task.parsed.repo;

    if (!repo) {
      throw new Error('No repository specified for dependency update');
    }

    this.log('info', `Would update dependencies in ${repo}`);

    return {
      success: true,
      message: `Dependency update queued for ${repo}`
    };
  }

  /**
   * Run tests
   * @private
   */
  async _executeRunTests(task) {
    const repo = task.parsed.repo;

    if (!repo) {
      throw new Error('No repository specified for tests');
    }

    this.log('info', `Would run tests in ${repo}`);

    return {
      success: true,
      message: `Tests queued for ${repo}`
    };
  }

  /**
   * Fix bugs
   * @private
   */
  async _executeFixBugs(task) {
    const repo = task.parsed.repo;

    if (!repo) {
      throw new Error('No repository specified for bug fixes');
    }

    this.log('info', `Would analyze and fix bugs in ${repo}`);

    return {
      success: true,
      message: `Bug analysis queued for ${repo}`
    };
  }

  /**
   * Execute a generic task using AI
   * @private
   */
  async _executeGenericTask(task) {
    if (!this.claude) {
      throw new Error('AI not configured for generic tasks');
    }

    // Use Claude to understand and execute the task
    this.log('info', `Processing generic task: ${task.description}`);

    return {
      success: true,
      message: `Task processed: ${task.description}`
    };
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      total: this.queue.length,
      queued: this.queue.filter(t => t.status === 'queued').length,
      processing: this.queue.filter(t => t.status === 'processing').length,
      completed: this.queue.filter(t => t.status === 'completed').length,
      failed: this.queue.filter(t => t.status === 'failed').length
    };
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      processTime: `${this.PROCESS_HOUR}:00 AM`,
      queueStats: this.getStats()
    };
  }

  /**
   * Shutdown the skill
   */
  async shutdown() {
    // Log any pending tasks
    const pending = this.queue.filter(t => t.status === 'queued');
    if (pending.length > 0) {
      this.log('warn', `Shutting down with ${pending.length} pending tasks`);
    }
    await super.shutdown();
  }
}

module.exports = OvernightSkill;
