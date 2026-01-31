/**
 * Morning Brief Skill - Manage and trigger morning briefings
 *
 * Provides commands to trigger, configure, and manage the daily morning brief.
 * Uses the scheduler to set up recurring briefings and the memory manager
 * to pull task/activity data.
 *
 * Commands:
 *   morning brief | brief      - Trigger a manual morning brief
 *   set brief time [HH:MM]     - Change the scheduled brief time (24-hour format)
 *   brief settings             - Show current brief configuration
 *
 * @example
 * morning brief
 * set brief time 07:30
 * brief settings
 */
const BaseSkill = require('../base-skill');
const { getScheduler, CRON } = require('../../scheduler');

class MorningBriefSkill extends BaseSkill {
  name = 'morning-brief';
  description = 'Manage and trigger your daily morning brief';
  priority = 40; // Medium-high priority

  commands = [
    {
      pattern: /^(morning\s+brief|brief)$/i,
      description: 'Trigger a morning brief immediately',
      usage: 'morning brief'
    },
    {
      pattern: /^set\s+brief\s+time\s+(\d{1,2}):(\d{2})$/i,
      description: 'Set the scheduled time for daily brief (24-hour format)',
      usage: 'set brief time HH:MM'
    },
    {
      pattern: /^brief\s+settings$/i,
      description: 'Show current brief configuration',
      usage: 'brief settings'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.scheduler = null;
    this.DEFAULT_BRIEF_TIME = '08:00'; // 8 AM
    this.JOB_NAME = 'daily-morning-brief';
    this.CONFIG_KEY = 'morning_brief_settings';
  }

  /**
   * Initialize the skill and set up default morning brief schedule
   */
  async initialize() {
    await super.initialize();

    try {
      // Try to get scheduler instance if available
      if (this.config.scheduler) {
        this.scheduler = this.config.scheduler;
      }

      // Initialize default brief schedule if not already configured
      if (this.memory && this.scheduler) {
        await this._initializeDefaultSchedule();
      }

      this.log('info', 'Morning brief skill initialized');
    } catch (error) {
      this.log('warn', 'Error initializing morning brief skill', error.message);
      // Continue anyway - skill can still handle manual commands
    }
  }

  /**
   * Execute morning brief commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    if (!this.memory) {
      return this.error('Memory system not initialized. Cannot generate brief.');
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "morning brief" or "brief" command
    if (lowerCommand === 'morning brief' || lowerCommand === 'brief') {
      return await this.handleMorningBriefCommand(userId);
    }

    // Handle "set brief time HH:MM" command
    if (lowerCommand.startsWith('set brief time ')) {
      const match = parsed.raw.match(/set\s+brief\s+time\s+(\d{1,2}):(\d{2})/i);
      if (match) {
        const hours = match[1].padStart(2, '0');
        const minutes = match[2];
        return await this.handleSetBriefTimeCommand(userId, `${hours}:${minutes}`);
      }
    }

    // Handle "brief settings" command
    if (lowerCommand === 'brief settings') {
      return await this.handleBriefSettingsCommand(userId);
    }

    return this.error('Unknown morning brief command');
  }

  /**
   * Handle "morning brief" command - Generate and send brief immediately
   */
  async handleMorningBriefCommand(userId) {
    try {
      this.log('info', `Generating morning brief for user ${userId}`);

      // Generate the brief using the scheduler's handler
      let briefMessage = '';

      try {
        // Get time-appropriate greeting
        const hour = new Date().getHours();
        const greeting = this._getTimeGreeting(hour);

        briefMessage = `${greeting}\n\n`;

        // Get pending tasks
        briefMessage += await this._formatTasksSummary(userId);

        // Get activity stats
        briefMessage += await this._formatActivityStats(userId);

        // Get quick motivational message
        briefMessage += this._getMotivationalMessage();
      } catch (error) {
        this.log('error', 'Error generating brief content', error.message);
        briefMessage = `⚠️ Unable to generate full brief:\n${error.message}`;
      }

      return this.success(briefMessage.trim());
    } catch (error) {
      this.log('error', 'Error handling morning brief command', error);
      return this.error('Failed to generate morning brief. Please try again.');
    }
  }

  /**
   * Handle "set brief time HH:MM" command
   */
  async handleSetBriefTimeCommand(userId, timeStr) {
    try {
      // Validate time format
      const [hours, minutes] = timeStr.split(':');
      const hour = parseInt(hours);
      const min = parseInt(minutes);

      if (hour < 0 || hour > 23 || min < 0 || min > 59) {
        return this.error(
          '❌ *Invalid time format*\n\n' +
          'Use 24-hour format (HH:MM)\n' +
          'Examples: 07:30, 08:00, 14:30'
        );
      }

      // Generate cron expression for the new time
      const cronExpression = `${min} ${hour} * * *`;

      // Save settings to memory (facts)
      this.memory.saveFact(
        userId,
        `Brief scheduled at ${timeStr} daily`,
        'settings',
        'system'
      );

      // Update scheduler if available
      if (this.scheduler) {
        try {
          // Cancel existing job if it exists
          await this.scheduler.cancelByName(this.JOB_NAME);
        } catch (e) {
          // Job might not exist yet, that's okay
        }

        try {
          // Schedule new job
          await this.scheduler.schedule(
            this.JOB_NAME,
            cronExpression,
            'morning-brief',
            { userId }
          );
        } catch (error) {
          this.log('warn', 'Could not update scheduler', error.message);
        }
      }

      let message = '✅ *Brief schedule updated*\n\n';
      message += `📅 New time: ${timeStr} (daily)\n`;
      message += `🔔 You'll get your brief at that time every day\n\n`;
      message += '_To trigger manually, say: morning brief_';

      this.log('info', `Updated brief time for user ${userId}: ${timeStr}`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error setting brief time', error);
      return this.error('Failed to update brief schedule. Please try again.');
    }
  }

  /**
   * Handle "brief settings" command
   */
  async handleBriefSettingsCommand(userId) {
    try {
      // Try to find the current brief time setting
      const facts = this.memory.getFacts(userId, 'settings');
      const briefFact = facts.find(f => f.fact.includes('Brief scheduled'));

      let message = '⚙️ *Morning Brief Settings*\n';
      message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      if (briefFact) {
        // Extract time from fact
        const match = briefFact.fact.match(/(\d{1,2}:\d{2})/);
        const briefTime = match ? match[1] : this.DEFAULT_BRIEF_TIME;

        message += `📅 *Scheduled Time:* ${briefTime} (daily)\n`;
        message += `📊 *Status:* Enabled ✅\n\n`;
      } else {
        message += `📅 *Scheduled Time:* ${this.DEFAULT_BRIEF_TIME} (daily)\n`;
        message += `📊 *Status:* Default schedule\n\n`;
      }

      // Get quick stats about what's in the brief
      const stats = this.memory.getStats(userId);
      message += '📈 *Your Data:*\n';
      message += `  • Messages: ${stats.totalMessages || 0}\n`;
      message += `  • Stored facts: ${stats.totalFacts || 0}\n`;
      message += `  • Pending tasks: ${stats.pendingTasks || 0}\n`;
      message += `  • Completed tasks: ${stats.completedTasks || 0}\n\n`;

      message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      message += '*Commands:*\n';
      message += '• `morning brief` - Get brief now\n';
      message += '• `set brief time HH:MM` - Change time\n';

      this.log('info', `Retrieved brief settings for user ${userId}`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error retrieving brief settings', error);
      return this.error('Failed to retrieve brief settings. Please try again.');
    }
  }

  /**
   * Initialize default morning brief schedule on first use
   * @private
   */
  async _initializeDefaultSchedule() {
    try {
      // Check if the default job is already scheduled
      const existingJob = await this.scheduler.getJobByName(this.JOB_NAME);

      if (!existingJob) {
        // Create default schedule (8:00 AM daily)
        const cronExpression = `0 8 * * *`;

        await this.scheduler.schedule(
          this.JOB_NAME,
          cronExpression,
          'morning-brief',
          {}
        );

        this.log('info', `Created default morning brief schedule at 08:00`);
      }
    } catch (error) {
      this.log('warn', 'Could not initialize default schedule', error.message);
    }
  }

  /**
   * Get time-appropriate greeting
   * @private
   */
  _getTimeGreeting(hour) {
    const dayOfWeek = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

    if (hour < 6) {
      return `🌅 Good early morning! Happy ${dayOfWeek}!`;
    } else if (hour < 9) {
      return `🌄 Good morning! Happy ${dayOfWeek}!`;
    } else if (hour < 12) {
      return `☀️ Morning! Hope your ${dayOfWeek} is going well.`;
    } else if (hour < 17) {
      return `🌤️ Good afternoon! Here's your ${dayOfWeek} brief.`;
    } else if (hour < 21) {
      return `🌆 Good evening! Here's your ${dayOfWeek} summary.`;
    } else {
      return `🌙 Good night! Daily summary for ${dayOfWeek}.`;
    }
  }

  /**
   * Format pending tasks summary
   * @private
   */
  async _formatTasksSummary(userId) {
    let section = '📋 *Pending Tasks*\n';
    section += '━━━━━━━━━━━━━━━\n';

    try {
      const pendingTasks = this.memory.getTasks(userId, 'pending');

      if (pendingTasks.length === 0) {
        section += '✅ No pending tasks - great job!\n\n';
        return section;
      }

      // Group by priority
      const urgent = pendingTasks.filter(t => t.priority === 'urgent');
      const high = pendingTasks.filter(t => t.priority === 'high');
      const medium = pendingTasks.filter(t => t.priority === 'medium');
      const low = pendingTasks.filter(t => t.priority === 'low');

      if (urgent.length > 0) {
        section += `🔴 *Urgent (${urgent.length}):*\n`;
        urgent.slice(0, 3).forEach(t => {
          section += `   • ${t.title}\n`;
        });
        if (urgent.length > 3) {
          section += `   _...and ${urgent.length - 3} more_\n`;
        }
      }

      if (high.length > 0) {
        section += `🟠 *High (${high.length}):*\n`;
        high.slice(0, 2).forEach(t => {
          section += `   • ${t.title}\n`;
        });
        if (high.length > 2) {
          section += `   _...and ${high.length - 2} more_\n`;
        }
      }

      if (medium.length > 0) {
        section += `🟡 *Medium (${medium.length}):*\n`;
        medium.slice(0, 2).forEach(t => {
          section += `   • ${t.title}\n`;
        });
        if (medium.length > 2) {
          section += `   _...and ${medium.length - 2} more_\n`;
        }
      }

      if (low.length > 0) {
        section += `⚪ *Low (${low.length}):*\n`;
        low.slice(0, 1).forEach(t => {
          section += `   • ${t.title}\n`;
        });
        if (low.length > 1) {
          section += `   _...and ${low.length - 1} more_\n`;
        }
      }

      section += '\n';
      return section;
    } catch (error) {
      this.log('warn', 'Error formatting tasks summary', error.message);
      section += '_Unable to retrieve tasks._\n\n';
      return section;
    }
  }

  /**
   * Format activity statistics
   * @private
   */
  async _formatActivityStats(userId) {
    let section = '📊 *Quick Stats*\n';
    section += '━━━━━━━━━━━━━━━\n';

    try {
      const stats = this.memory.getStats(userId);

      section += `💬 Messages: ${stats.totalMessages || 0}\n`;
      section += `📝 Stored facts: ${stats.totalFacts || 0}\n`;
      section += `✅ Completed tasks: ${stats.completedTasks || 0}\n`;
      section += `⏳ Pending tasks: ${stats.pendingTasks || 0}\n\n`;

      return section;
    } catch (error) {
      this.log('warn', 'Error formatting stats', error.message);
      return section + '_Stats unavailable._\n\n';
    }
  }

  /**
   * Get motivational closing message
   * @private
   */
  _getMotivationalMessage() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    let message = '💪 *You got this!*\n';
    message += '━━━━━━━━━━━━━━━\n';

    if (isWeekend) {
      const messages = [
        'Enjoy your weekend - you\'ve earned it!',
        'Time to recharge and relax!',
        'Hope you have a great weekend!',
        'Make the most of your time off!'
      ];
      message += messages[now.getDate() % messages.length];
    } else {
      const messages = [
        'Let\'s make today productive! 🚀',
        'You\'re ready to tackle today! 💯',
        'Time to get things done! ⚡',
        'Ready to conquer the day? 🎯',
        'One task at a time, you\'ve got this! 📈'
      ];
      message += messages[now.getDate() % messages.length];
    }

    return message;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'scheduled-events',
      provider: 'Scheduler + MemoryManager',
      defaultTime: this.DEFAULT_BRIEF_TIME
    };
  }

  /**
   * Shutdown the skill
   */
  async shutdown() {
    // Nothing special to clean up for this skill
    await super.shutdown();
  }
}

module.exports = MorningBriefSkill;
