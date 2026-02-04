/**
 * Wellness Reminders Skill - Health and wellness reminders
 *
 * Provides automatic wellness reminders for breaks, water intake, and stretching.
 * Reminders are smart: they respect DND hours, user activity, and preferences.
 *
 * Commands:
 *   wellness on                     - Enable wellness reminders (default: 2 hours)
 *   wellness off                    - Disable wellness reminders
 *   wellness status                 - Check current wellness settings
 *   wellness config [interval]      - Configure reminder interval in minutes
 *
 * Features:
 *   - Break reminders every 2 hours (configurable)
 *   - Water intake reminders
 *   - Stretch reminders
 *   - Respects DND hours (23:00-07:00)
 *   - Skips if user is active (sent message recently)
 *   - Rotates reminder types
 *
 * @example
 * wellness on
 * wellness off
 * wellness status
 * wellness config 90
 */

const BaseSkill = require('../base-skill');

class WellnessSkill extends BaseSkill {
  name = 'wellness';
  description = 'Automatic health and wellness reminders for breaks, water, and stretching';
  priority = 14;

  commands = [
    {
      pattern: /^wellness\s+on$/i,
      description: 'Enable wellness reminders',
      usage: 'wellness on'
    },
    {
      pattern: /^wellness\s+off$/i,
      description: 'Disable wellness reminders',
      usage: 'wellness off'
    },
    {
      pattern: /^wellness\s+status$/i,
      description: 'Check wellness reminder settings',
      usage: 'wellness status'
    },
    {
      pattern: /^wellness\s+config\s+(\d+)$/i,
      description: 'Configure reminder interval in minutes',
      usage: 'wellness config <minutes>'
    }
  ];

  // Reminder types with messages
  REMINDER_TYPES = [
    {
      type: 'break',
      icon: '🧘',
      message: 'Take a 5-minute break! You\'ve been working hard.'
    },
    {
      type: 'water',
      icon: '💧',
      message: 'Time to hydrate! Drink some water.'
    },
    {
      type: 'stretch',
      icon: '🤸',
      message: 'Stand up and stretch for 30 seconds. Your body will thank you!'
    },
    {
      type: 'eyes',
      icon: '👀',
      message: 'Rest your eyes! Look away from the screen for 20 seconds (20-20-20 rule).'
    },
    {
      type: 'posture',
      icon: '🪑',
      message: 'Check your posture! Sit up straight and adjust your chair if needed.'
    }
  ];

  // DND hours (23:00 to 07:00)
  DND_START_HOUR = 23;
  DND_END_HOUR = 7;

  // Default interval: 2 hours (120 minutes)
  DEFAULT_INTERVAL_MINUTES = 120;

  // Consider user "recently active" if they sent a message in the last 10 minutes
  RECENT_ACTIVITY_THRESHOLD_MS = 10 * 60 * 1000;

  constructor(context = {}) {
    super(context);
    this.activeIntervals = new Map(); // Store interval IDs per user
    this.lastReminderType = new Map(); // Track last reminder type per user
    this.lastUserActivity = new Map(); // Track last message timestamp per user
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    // Restore wellness settings from database for all users
    await this._restoreWellnessSettings();

    this.log('info', 'Wellness skill initialized');
  }

  /**
   * Execute wellness commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    // Track user activity (they just sent a message)
    this._trackUserActivity(userId);

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "wellness on"
    if (lowerCommand === 'wellness on') {
      return await this.handleEnableWellness(userId, context);
    }

    // Handle "wellness off"
    if (lowerCommand === 'wellness off') {
      return await this.handleDisableWellness(userId);
    }

    // Handle "wellness status"
    if (lowerCommand === 'wellness status') {
      return await this.handleStatus(userId);
    }

    // Handle "wellness config <minutes>"
    const configMatch = parsed.raw.match(/^wellness\s+config\s+(\d+)$/i);
    if (configMatch) {
      const intervalMinutes = parseInt(configMatch[1]);
      return await this.handleConfigureInterval(userId, intervalMinutes, context);
    }

    return this.error('Unknown wellness command. Try: on, off, status, or config');
  }

  /**
   * Handle "wellness on"
   */
  async handleEnableWellness(userId, context) {
    try {
      // Get existing settings or use defaults
      const settings = await this._getWellnessSettings(userId);
      const intervalMinutes = settings?.interval || this.DEFAULT_INTERVAL_MINUTES;

      // Enable in database
      await this._saveWellnessSetting(userId, 'enabled', 'true');
      await this._saveWellnessSetting(userId, 'interval', intervalMinutes.toString());

      // Start the reminder interval
      await this._startWellnessInterval(userId, intervalMinutes, context);

      let response = `✓ Wellness reminders enabled!\n\n`;
      response += `📋 *Settings:*\n`;
      response += `• Interval: ${intervalMinutes} minutes (${this._formatHours(intervalMinutes)})\n`;
      response += `• Types: Break, Water, Stretch, Eyes, Posture\n`;
      response += `• DND Mode: 23:00-07:00 (no reminders)\n`;
      response += `• Smart Skipping: If you're actively using the bot\n\n`;
      response += `You'll receive your first reminder in ${intervalMinutes} minutes.\n\n`;
      response += `To adjust: \`wellness config <minutes>\``;

      this.log('info', `Enabled wellness reminders for user ${userId} with ${intervalMinutes}min interval`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error enabling wellness', error);
      return this.error('Failed to enable wellness reminders. Please try again.');
    }
  }

  /**
   * Handle "wellness off"
   */
  async handleDisableWellness(userId) {
    try {
      // Disable in database
      await this._saveWellnessSetting(userId, 'enabled', 'false');

      // Stop the reminder interval
      this._stopWellnessInterval(userId);

      let response = `✓ Wellness reminders disabled.\n\n`;
      response += `You can re-enable them anytime with \`wellness on\`.`;

      this.log('info', `Disabled wellness reminders for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error disabling wellness', error);
      return this.error('Failed to disable wellness reminders. Please try again.');
    }
  }

  /**
   * Handle "wellness status"
   */
  async handleStatus(userId) {
    try {
      const settings = await this._getWellnessSettings(userId);
      const enabled = settings?.enabled === 'true';
      const intervalMinutes = settings?.interval ? parseInt(settings.interval) : this.DEFAULT_INTERVAL_MINUTES;
      const lastReminder = settings?.lastReminder ? new Date(settings.lastReminder) : null;

      let response = `*Wellness Reminders Status*\n\n`;

      if (!enabled) {
        response += `Status: ❌ *Disabled*\n\n`;
        response += `Enable with \`wellness on\` to start receiving reminders.`;
        return this.success(response);
      }

      response += `Status: ✅ *Enabled*\n\n`;
      response += `📋 *Settings:*\n`;
      response += `• Interval: ${intervalMinutes} minutes (${this._formatHours(intervalMinutes)})\n`;
      response += `• DND Mode: 23:00-07:00\n`;
      response += `• Smart Skipping: Active\n\n`;

      if (lastReminder) {
        const timeAgo = this._formatTimeAgo(lastReminder);
        response += `📬 Last Reminder: ${timeAgo}\n\n`;
      }

      const nextReminderTime = this._calculateNextReminderTime(lastReminder, intervalMinutes);
      if (nextReminderTime) {
        response += `⏰ Next Reminder: ${this._formatNextReminder(nextReminderTime)}\n\n`;
      }

      response += `To disable: \`wellness off\`\n`;
      response += `To adjust: \`wellness config <minutes>\``;

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting wellness status', error);
      return this.error('Failed to retrieve wellness status. Please try again.');
    }
  }

  /**
   * Handle "wellness config <minutes>"
   */
  async handleConfigureInterval(userId, intervalMinutes, context) {
    try {
      // Validate interval
      if (intervalMinutes < 30) {
        return this.error('Minimum interval is 30 minutes. Wellness needs time to work!');
      }

      if (intervalMinutes > 480) {
        return this.error('Maximum interval is 480 minutes (8 hours). Try a shorter interval.');
      }

      // Check if wellness is enabled
      const settings = await this._getWellnessSettings(userId);
      const enabled = settings?.enabled === 'true';

      // Save new interval
      await this._saveWellnessSetting(userId, 'interval', intervalMinutes.toString());

      // If enabled, restart with new interval
      if (enabled) {
        this._stopWellnessInterval(userId);
        await this._startWellnessInterval(userId, intervalMinutes, context);
      }

      let response = `✓ Wellness interval updated!\n\n`;
      response += `New interval: ${intervalMinutes} minutes (${this._formatHours(intervalMinutes)})\n\n`;

      if (enabled) {
        response += `Reminders are *active* with the new interval.\n`;
        response += `Next reminder in ${intervalMinutes} minutes.`;
      } else {
        response += `Reminders are *disabled*.\n`;
        response += `Enable with \`wellness on\` to start.`;
      }

      this.log('info', `Updated wellness interval for user ${userId} to ${intervalMinutes} minutes`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error configuring wellness interval', error);
      return this.error('Failed to update interval. Please try again.');
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Start wellness reminder interval for a user
   * @private
   */
  async _startWellnessInterval(userId, intervalMinutes, context) {
    // Stop any existing interval first
    this._stopWellnessInterval(userId);

    const intervalMs = intervalMinutes * 60 * 1000;
    const sendMessage = this.config.sendMessage || context.sendMessage;

    if (!sendMessage) {
      this.log('warn', 'No sendMessage function available, cannot start wellness interval');
      return;
    }

    // Set up interval
    const intervalId = setInterval(async () => {
      await this._sendWellnessReminder(userId, sendMessage);
    }, intervalMs);

    // Store interval reference
    this.activeIntervals.set(userId, intervalId);
    this.log('debug', `Started wellness interval for user ${userId}: ${intervalMinutes} minutes`);
  }

  /**
   * Stop wellness reminder interval for a user
   * @private
   */
  _stopWellnessInterval(userId) {
    if (this.activeIntervals.has(userId)) {
      clearInterval(this.activeIntervals.get(userId));
      this.activeIntervals.delete(userId);
      this.log('debug', `Stopped wellness interval for user ${userId}`);
    }
  }

  /**
   * Send a wellness reminder to a user
   * @private
   */
  async _sendWellnessReminder(userId, sendMessage) {
    try {
      // Check if in DND hours
      if (this._isInDNDHours()) {
        this.log('debug', `Skipping wellness reminder for user ${userId}: DND hours`);
        return;
      }

      // Check if user is recently active
      if (this._isUserRecentlyActive(userId)) {
        this.log('debug', `Skipping wellness reminder for user ${userId}: recently active`);
        return;
      }

      // Get next reminder type (rotate through types)
      const reminder = this._getNextReminderType(userId);

      // Send the reminder
      const message = `${reminder.icon} *Wellness Reminder*\n\n${reminder.message}`;
      await sendMessage(message);

      // Update last reminder timestamp
      await this._saveWellnessSetting(userId, 'lastReminder', new Date().toISOString());

      // Track outcome
      try {
        const outcomeTracker = require('../../lib/outcome-tracker');
        await outcomeTracker.startAction('wellness_reminder', userId, {
          reminderType: reminder.type,
          timestamp: new Date().toISOString()
        });
        await outcomeTracker.completeAction('wellness_reminder', 'success', {
          message: 'Wellness reminder sent'
        });
      } catch (e) {
        // Outcome tracker is optional
      }

      this.log('info', `Sent wellness reminder to user ${userId}: ${reminder.type}`);
    } catch (error) {
      this.log('error', `Error sending wellness reminder to user ${userId}`, error);
    }
  }

  /**
   * Get next reminder type (rotate through types)
   * @private
   */
  _getNextReminderType(userId) {
    const lastType = this.lastReminderType.get(userId);
    let nextIndex = 0;

    if (lastType !== undefined) {
      const lastIndex = this.REMINDER_TYPES.findIndex(r => r.type === lastType);
      nextIndex = (lastIndex + 1) % this.REMINDER_TYPES.length;
    }

    const reminder = this.REMINDER_TYPES[nextIndex];
    this.lastReminderType.set(userId, reminder.type);

    return reminder;
  }

  /**
   * Check if current time is in DND hours (23:00-07:00)
   * @private
   */
  _isInDNDHours() {
    const now = new Date();
    const hour = now.getHours();

    // DND from 23:00 to 07:00
    if (hour >= this.DND_START_HOUR || hour < this.DND_END_HOUR) {
      return true;
    }

    return false;
  }

  /**
   * Track user activity (they sent a message)
   * @private
   */
  _trackUserActivity(userId) {
    this.lastUserActivity.set(userId, Date.now());
  }

  /**
   * Check if user sent a message recently (within threshold)
   * @private
   */
  _isUserRecentlyActive(userId) {
    const lastActivity = this.lastUserActivity.get(userId);
    if (!lastActivity) return false;

    const timeSinceActivity = Date.now() - lastActivity;
    return timeSinceActivity < this.RECENT_ACTIVITY_THRESHOLD_MS;
  }

  /**
   * Get wellness settings for a user from database
   * @private
   */
  async _getWellnessSettings(userId) {
    if (!this.memory) return null;

    try {
      const facts = await this.memory.query('facts', {
        where: {
          user_id: userId,
          category: 'wellness'
        }
      }) || [];

      // Convert array of facts to object
      const settings = {};
      facts.forEach(fact => {
        // Parse fact like "enabled: true"
        const match = fact.fact.match(/^(\w+):\s*(.+)$/);
        if (match) {
          settings[match[1]] = match[2];
        }
      });

      return settings;
    } catch (error) {
      this.log('warn', 'Could not query wellness settings from database', error.message);
      return null;
    }
  }

  /**
   * Save a wellness setting to database
   * @private
   */
  async _saveWellnessSetting(userId, key, value) {
    if (!this.memory) return;

    try {
      // Check if fact already exists
      const existing = await this.memory.query('facts', {
        where: {
          user_id: userId,
          category: 'wellness',
          fact: new RegExp(`^${key}:`)
        }
      });

      const factText = `${key}: ${value}`;

      if (existing && existing.length > 0) {
        // Update existing
        await this.memory.update('facts', { id: existing[0].id }, { fact: factText });
      } else {
        // Insert new
        await this.memory.insert('facts', {
          user_id: userId,
          fact: factText,
          category: 'wellness',
          created_at: new Date().toISOString()
        });
      }
    } catch (error) {
      this.log('warn', 'Could not save wellness setting to database', error.message);
    }
  }

  /**
   * Restore wellness settings from database on startup
   * @private
   */
  async _restoreWellnessSettings() {
    if (!this.memory) return;

    try {
      // Get all users with wellness enabled
      const facts = await this.memory.query('facts', {
        where: {
          category: 'wellness',
          fact: /^enabled: true$/
        }
      }) || [];

      // Start intervals for each enabled user
      for (const fact of facts) {
        const userId = fact.user_id;
        const settings = await this._getWellnessSettings(userId);
        const intervalMinutes = settings?.interval ? parseInt(settings.interval) : this.DEFAULT_INTERVAL_MINUTES;

        // Note: We need context.sendMessage which we don't have here
        // The interval will be started when the user sends their first message
        this.log('info', `Found enabled wellness for user ${userId}, will start on first message`);
      }
    } catch (error) {
      this.log('warn', 'Could not restore wellness settings', error.message);
    }
  }

  /**
   * Format minutes to hours/minutes
   * @private
   */
  _formatHours(minutes) {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${mins}m`;
  }

  /**
   * Format time ago
   * @private
   */
  _formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    return date.toLocaleString();
  }

  /**
   * Calculate next reminder time
   * @private
   */
  _calculateNextReminderTime(lastReminder, intervalMinutes) {
    if (!lastReminder) {
      return new Date(Date.now() + intervalMinutes * 60 * 1000);
    }

    const nextTime = new Date(lastReminder.getTime() + intervalMinutes * 60 * 1000);
    const now = new Date();

    // If next time is in the past, calculate from now
    if (nextTime < now) {
      return new Date(now.getTime() + intervalMinutes * 60 * 1000);
    }

    return nextTime;
  }

  /**
   * Format next reminder time
   * @private
   */
  _formatNextReminder(nextTime) {
    const now = new Date();
    const diffMs = nextTime - now;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'in less than a minute';
    if (diffMins === 1) return 'in 1 minute';
    if (diffMins < 60) return `in ${diffMins} minutes`;

    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours === 1) return 'in 1 hour';

    return `in ${diffHours} hours`;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      activeUsers: this.activeIntervals.size,
      reminderTypes: this.REMINDER_TYPES.length,
      dndHours: `${this.DND_START_HOUR}:00-${this.DND_END_HOUR}:00`
    };
  }

  /**
   * Shutdown the skill - clear all intervals
   */
  async shutdown() {
    // Clear all active intervals
    for (const [userId, intervalId] of this.activeIntervals) {
      clearInterval(intervalId);
      this.log('debug', `Cleared wellness interval for user ${userId}`);
    }
    this.activeIntervals.clear();

    await super.shutdown();
  }
}

module.exports = WellnessSkill;
