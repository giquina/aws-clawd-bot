/**
 * Reminders Skill - Set and manage reminders and alerts
 *
 * Allows users to set one-time reminders that are delivered via WhatsApp
 * at the specified time. Uses the scheduler for timing and persistence.
 *
 * Commands:
 *   remind me [message] in [X] minutes/hours  - Set a reminder with delay
 *   remind me [message] at [HH:MM]            - Set reminder for specific time
 *   my reminders | list reminders             - Show pending reminders
 *   cancel reminder [number]                  - Cancel a reminder by number
 *
 * @example
 * remind me to call John in 30 minutes
 * remind me standup meeting at 10:00
 * my reminders
 * cancel reminder 1
 */
const BaseSkill = require('../base-skill');

class RemindersSkill extends BaseSkill {
  name = 'reminders';
  description = 'Set and manage reminders and alerts';
  priority = 60; // Higher priority for time-sensitive commands

  commands = [
    {
      pattern: /^remind\s+me\s+(.+?)\s+in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)$/i,
      description: 'Set a reminder with a time delay',
      usage: 'remind me <message> in <X> minutes/hours'
    },
    {
      pattern: /^remind\s+me\s+(.+?)\s+at\s+(\d{1,2}):(\d{2})$/i,
      description: 'Set a reminder for a specific time (24-hour format)',
      usage: 'remind me <message> at HH:MM'
    },
    {
      pattern: /^(my\s+reminders|list\s+reminders)$/i,
      description: 'List all your pending reminders',
      usage: 'my reminders'
    },
    {
      pattern: /^cancel\s+reminder\s+(\d+)$/i,
      description: 'Cancel a reminder by its number',
      usage: 'cancel reminder <number>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.scheduler = null;
    this.HANDLER_NAME = 'reminder';
    this.activeTimeouts = new Map(); // For in-memory one-time reminders
  }

  /**
   * Initialize the skill and register the reminder handler
   */
  async initialize() {
    await super.initialize();

    try {
      // Get scheduler from context config if available
      if (this.config.scheduler) {
        this.scheduler = this.config.scheduler;

        // Register our reminder handler with the scheduler
        this.scheduler.registerHandler(this.HANDLER_NAME, this.handleReminderTrigger.bind(this));
        this.log('info', 'Registered reminder handler with scheduler');
      }

      this.log('info', 'Reminders skill initialized');
    } catch (error) {
      this.log('warn', 'Error initializing reminders skill', error.message);
    }
  }

  /**
   * Execute reminder commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "remind me [message] in [X] minutes/hours"
    const delayMatch = parsed.raw.match(/^remind\s+me\s+(.+?)\s+in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)$/i);
    if (delayMatch) {
      const message = delayMatch[1].trim();
      const amount = parseInt(delayMatch[2]);
      const unit = delayMatch[3].toLowerCase();
      return await this.handleSetDelayReminder(userId, message, amount, unit);
    }

    // Handle "remind me [message] at HH:MM"
    const timeMatch = parsed.raw.match(/^remind\s+me\s+(.+?)\s+at\s+(\d{1,2}):(\d{2})$/i);
    if (timeMatch) {
      const message = timeMatch[1].trim();
      const hours = parseInt(timeMatch[2]);
      const minutes = parseInt(timeMatch[3]);
      return await this.handleSetTimeReminder(userId, message, hours, minutes);
    }

    // Handle "my reminders" or "list reminders"
    if (lowerCommand === 'my reminders' || lowerCommand === 'list reminders') {
      return await this.handleListReminders(userId);
    }

    // Handle "cancel reminder [number]"
    const cancelMatch = parsed.raw.match(/^cancel\s+reminder\s+(\d+)$/i);
    if (cancelMatch) {
      const reminderNumber = parseInt(cancelMatch[1]);
      return await this.handleCancelReminder(userId, reminderNumber);
    }

    return this.error('Unknown reminder command');
  }

  /**
   * Handle "remind me [message] in [X] minutes/hours"
   */
  async handleSetDelayReminder(userId, message, amount, unit) {
    try {
      // Validate amount
      if (amount <= 0) {
        return this.error('Please specify a positive number for the delay.');
      }

      if (amount > 1440) { // Max 24 hours in minutes
        return this.error('Reminders can be set for up to 24 hours in advance.');
      }

      // Convert to milliseconds
      let delayMs;
      const unitLower = unit.toLowerCase();

      if (unitLower.startsWith('h')) {
        delayMs = amount * 60 * 60 * 1000;
        if (amount > 24) {
          return this.error('Maximum delay is 24 hours.');
        }
      } else {
        delayMs = amount * 60 * 1000;
        if (amount > 1440) {
          return this.error('Maximum delay is 1440 minutes (24 hours).');
        }
      }

      // Calculate trigger time
      const triggerTime = new Date(Date.now() + delayMs);
      const triggerTimeStr = this._formatTime(triggerTime);

      // Create unique reminder ID
      const reminderId = `reminder_${userId}_${Date.now()}`;

      // Store reminder in database if available
      if (this.memory) {
        await this._saveReminder(userId, {
          id: reminderId,
          message,
          triggerAt: triggerTime.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'pending'
        });
      }

      // Set up the timeout for triggering
      await this._scheduleReminder(userId, reminderId, message, delayMs);

      // Format confirmation message
      const unitDisplay = unitLower.startsWith('h') ?
        (amount === 1 ? 'hour' : 'hours') :
        (amount === 1 ? 'minute' : 'minutes');

      let response = `Reminder set!\n\n`;
      response += `"${message}"\n\n`;
      response += `I'll remind you in ${amount} ${unitDisplay} (at ${triggerTimeStr}).`;

      this.log('info', `Set reminder for user ${userId}: "${message}" in ${amount} ${unitDisplay}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error setting delay reminder', error);
      return this.error('Failed to set reminder. Please try again.');
    }
  }

  /**
   * Handle "remind me [message] at HH:MM"
   */
  async handleSetTimeReminder(userId, message, hours, minutes) {
    try {
      // Validate time
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return this.error(
          'Invalid time format.\n\n' +
          'Use 24-hour format (HH:MM)\n' +
          'Examples: 09:30, 14:00, 22:15'
        );
      }

      // Calculate trigger time (today or tomorrow if time has passed)
      const now = new Date();
      const triggerTime = new Date();
      triggerTime.setHours(hours, minutes, 0, 0);

      // If time has already passed today, set for tomorrow
      if (triggerTime <= now) {
        triggerTime.setDate(triggerTime.getDate() + 1);
      }

      const delayMs = triggerTime.getTime() - now.getTime();

      // Check if more than 24 hours away
      if (delayMs > 24 * 60 * 60 * 1000) {
        return this.error('Reminders can only be set for up to 24 hours in advance.');
      }

      const triggerTimeStr = this._formatTime(triggerTime);
      const timeInputStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      // Create unique reminder ID
      const reminderId = `reminder_${userId}_${Date.now()}`;

      // Store reminder in database if available
      if (this.memory) {
        await this._saveReminder(userId, {
          id: reminderId,
          message,
          triggerAt: triggerTime.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'pending'
        });
      }

      // Set up the timeout for triggering
      await this._scheduleReminder(userId, reminderId, message, delayMs);

      // Format confirmation message
      const isToday = triggerTime.getDate() === now.getDate();
      const dayStr = isToday ? 'today' : 'tomorrow';

      let response = `Reminder set!\n\n`;
      response += `"${message}"\n\n`;
      response += `I'll remind you at ${timeInputStr} ${dayStr} (${triggerTimeStr}).`;

      this.log('info', `Set reminder for user ${userId}: "${message}" at ${timeInputStr}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error setting time reminder', error);
      return this.error('Failed to set reminder. Please try again.');
    }
  }

  /**
   * Handle "my reminders" or "list reminders"
   */
  async handleListReminders(userId) {
    try {
      const reminders = await this._getReminders(userId);

      if (reminders.length === 0) {
        return this.success(
          '*No pending reminders*\n\n' +
          'Set one with:\n' +
          '- remind me <message> in <X> minutes\n' +
          '- remind me <message> at HH:MM'
        );
      }

      let response = '*Your Pending Reminders*\n';
      response += '\n';

      reminders.forEach((reminder, index) => {
        const triggerTime = new Date(reminder.triggerAt);
        const timeStr = this._formatTime(triggerTime);
        const timeUntil = this._formatTimeUntil(triggerTime);

        response += `${index + 1}. "${reminder.message}"\n`;
        response += `   At: ${timeStr} (${timeUntil})\n\n`;
      });

      response += '\n';
      response += `${reminders.length} reminder(s) pending\n\n`;
      response += 'To cancel: cancel reminder <number>';

      this.log('info', `Listed ${reminders.length} reminders for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error listing reminders', error);
      return this.error('Failed to retrieve reminders. Please try again.');
    }
  }

  /**
   * Handle "cancel reminder [number]"
   */
  async handleCancelReminder(userId, reminderNumber) {
    try {
      const reminders = await this._getReminders(userId);

      if (reminders.length === 0) {
        return this.error('You don\'t have any pending reminders to cancel.');
      }

      if (reminderNumber < 1 || reminderNumber > reminders.length) {
        return this.error(
          `Invalid reminder number.\n\n` +
          `You have ${reminders.length} reminder(s). ` +
          `Use a number between 1 and ${reminders.length}.`
        );
      }

      const reminderToCancel = reminders[reminderNumber - 1];

      // Cancel the timeout if it exists
      if (this.activeTimeouts.has(reminderToCancel.id)) {
        clearTimeout(this.activeTimeouts.get(reminderToCancel.id));
        this.activeTimeouts.delete(reminderToCancel.id);
      }

      // Cancel in scheduler if using scheduler-based approach
      if (this.scheduler) {
        try {
          await this.scheduler.cancelByName(reminderToCancel.id);
        } catch (e) {
          // May not be in scheduler, that's okay
        }
      }

      // Mark as cancelled in database
      await this._cancelReminder(userId, reminderToCancel.id);

      let response = `*Reminder cancelled*\n\n`;
      response += `"${reminderToCancel.message}"\n\n`;
      response += `This reminder has been cancelled.`;

      this.log('info', `Cancelled reminder ${reminderNumber} for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error cancelling reminder', error);
      return this.error('Failed to cancel reminder. Please try again.');
    }
  }

  /**
   * Handler called when a reminder triggers
   * This is registered with the scheduler
   */
  async handleReminderTrigger(params = {}) {
    const { message, userId, reminderId } = params;

    this.log('info', `Reminder triggered for user ${userId}: "${message}"`);

    // Mark reminder as completed
    if (this.memory && reminderId) {
      await this._completeReminder(userId, reminderId);
    }

    // Clean up timeout reference
    if (reminderId && this.activeTimeouts.has(reminderId)) {
      this.activeTimeouts.delete(reminderId);
    }

    // Return the reminder message to be sent
    return `*Reminder*\n\n${message}`;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Schedule a reminder to trigger after a delay
   * @private
   */
  async _scheduleReminder(userId, reminderId, message, delayMs) {
    // Get sendMessage callback from context if available
    const sendMessage = this.config.sendMessage;

    if (sendMessage) {
      // Use setTimeout for one-time reminders (more reliable for short delays)
      const timeout = setTimeout(async () => {
        try {
          const reminderMessage = await this.handleReminderTrigger({
            message,
            userId,
            reminderId
          });

          await sendMessage(reminderMessage);
          this.log('info', `Sent reminder to user ${userId}: "${message}"`);
        } catch (error) {
          this.log('error', 'Error sending reminder', error);
        }
      }, delayMs);

      // Store timeout reference for cancellation
      this.activeTimeouts.set(reminderId, timeout);
      this.log('debug', `Scheduled reminder ${reminderId} to trigger in ${delayMs}ms`);
    } else if (this.scheduler) {
      // Fallback: Use scheduler for longer delays or if no sendMessage available
      // Convert delay to a one-time cron expression (approximation)
      const triggerTime = new Date(Date.now() + delayMs);
      const minute = triggerTime.getMinutes();
      const hour = triggerTime.getHours();
      const day = triggerTime.getDate();
      const month = triggerTime.getMonth() + 1;
      const cronExpression = `${minute} ${hour} ${day} ${month} *`;

      await this.scheduler.schedule(
        reminderId,
        cronExpression,
        this.HANDLER_NAME,
        { message, userId, reminderId }
      );
    }
  }

  /**
   * Save a reminder to storage
   * @private
   */
  async _saveReminder(userId, reminder) {
    if (!this.memory) return;

    try {
      // Store as a scheduled job entry
      await this.memory.insert('scheduled_jobs', {
        id: reminder.id,
        name: reminder.id,
        handler: this.HANDLER_NAME,
        params: JSON.stringify({
          message: reminder.message,
          userId,
          reminderId: reminder.id
        }),
        enabled: true,
        user_id: userId,
        trigger_at: reminder.triggerAt,
        created_at: reminder.createdAt,
        status: 'pending'
      });
    } catch (error) {
      this.log('warn', 'Could not save reminder to database', error.message);
    }
  }

  /**
   * Get all pending reminders for a user
   * @private
   */
  async _getReminders(userId) {
    if (!this.memory) {
      // Return from active timeouts if no database
      return Array.from(this.activeTimeouts.keys())
        .filter(id => id.includes(userId))
        .map(id => ({ id, message: 'Unknown', triggerAt: new Date().toISOString() }));
    }

    try {
      const jobs = await this.memory.query('scheduled_jobs', {
        where: {
          handler: this.HANDLER_NAME,
          user_id: userId,
          status: 'pending'
        }
      }) || [];

      return jobs.map(job => {
        const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
        return {
          id: job.id,
          message: params.message || 'No message',
          triggerAt: job.trigger_at || job.created_at,
          createdAt: job.created_at
        };
      }).filter(r => new Date(r.triggerAt) > new Date()) // Only future reminders
        .sort((a, b) => new Date(a.triggerAt) - new Date(b.triggerAt));
    } catch (error) {
      this.log('warn', 'Could not query reminders from database', error.message);
      return [];
    }
  }

  /**
   * Cancel a reminder
   * @private
   */
  async _cancelReminder(userId, reminderId) {
    if (!this.memory) return;

    try {
      await this.memory.update('scheduled_jobs', { id: reminderId }, { status: 'cancelled' });
    } catch (error) {
      this.log('warn', 'Could not update reminder status in database', error.message);
    }
  }

  /**
   * Mark a reminder as completed
   * @private
   */
  async _completeReminder(userId, reminderId) {
    if (!this.memory) return;

    try {
      await this.memory.update('scheduled_jobs', { id: reminderId }, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    } catch (error) {
      this.log('warn', 'Could not mark reminder as completed', error.message);
    }
  }

  /**
   * Format a date object to HH:MM format
   * @private
   */
  _formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format time until a future date
   * @private
   */
  _formatTimeUntil(futureDate) {
    const now = new Date();
    const diffMs = futureDate - now;

    if (diffMs <= 0) return 'now';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'less than a minute';
    if (diffMins === 1) return 'in 1 minute';
    if (diffMins < 60) return `in ${diffMins} minutes`;
    if (diffHours === 1) return `in 1 hour`;
    return `in ${diffHours} hours`;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'scheduled-reminders',
      provider: 'Scheduler + MemoryManager',
      activeReminders: this.activeTimeouts.size
    };
  }

  /**
   * Shutdown the skill - clear all active timeouts
   */
  async shutdown() {
    // Clear all active timeouts
    for (const [id, timeout] of this.activeTimeouts) {
      clearTimeout(timeout);
      this.log('debug', `Cleared timeout for reminder ${id}`);
    }
    this.activeTimeouts.clear();

    await super.shutdown();
  }
}

module.exports = RemindersSkill;
