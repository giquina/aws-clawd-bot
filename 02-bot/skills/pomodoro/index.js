/**
 * Pomodoro Timer Skill - Time management with focused work sessions
 *
 * Implements the Pomodoro Technique: 25-minute focused work sessions with breaks.
 * Tracks daily session count and sends alerts when a session completes.
 *
 * Commands:
 *   pomodoro start [minutes]    - Start a new Pomodoro session (default: 25 minutes)
 *   pomodoro stop               - Stop the current session
 *   pomodoro status             - Show current session status and daily count
 *   pomodoro stats              - Show daily statistics
 *
 * @example
 * pomodoro start
 * pomodoro start 50
 * pomodoro stop
 * pomodoro status
 * pomodoro stats
 */

const BaseSkill = require('../base-skill');

class PomodoroSkill extends BaseSkill {
  name = 'pomodoro';
  description = 'Time management with Pomodoro focused work sessions';
  priority = 18;

  commands = [
    {
      pattern: /^pomodoro\s+start\s*(\d+)?$/i,
      description: 'Start a new Pomodoro session',
      usage: 'pomodoro start [minutes]'
    },
    {
      pattern: /^pomodoro\s+stop$/i,
      description: 'Stop the current Pomodoro session',
      usage: 'pomodoro stop'
    },
    {
      pattern: /^pomodoro\s+status$/i,
      description: 'Show current session status and daily count',
      usage: 'pomodoro status'
    },
    {
      pattern: /^pomodoro\s+stats$/i,
      description: 'Show Pomodoro statistics for today',
      usage: 'pomodoro stats'
    }
  ];

  constructor(context = {}) {
    super(context);
    // In-memory store for active sessions per user
    // Structure: { userId: { sessionId, startTime, duration, startedAt } }
    this.activeSessions = new Map();
    this.activeTimeouts = new Map(); // Store timeout IDs for cleanup
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Pomodoro skill initialized with in-memory session tracking');
  }

  /**
   * Execute Pomodoro commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "pomodoro start [minutes]"
    if (lowerCommand.startsWith('pomodoro start')) {
      const match = parsed.raw.match(/^pomodoro\s+start\s*(\d+)?$/i);
      if (match) {
        const durationMinutes = match[1] ? parseInt(match[1]) : 25;
        return await this.handleStartSession(userId, durationMinutes, context);
      }
    }

    // Handle "pomodoro stop"
    if (lowerCommand === 'pomodoro stop') {
      return await this.handleStopSession(userId);
    }

    // Handle "pomodoro status"
    if (lowerCommand === 'pomodoro status') {
      return await this.handleStatus(userId);
    }

    // Handle "pomodoro stats"
    if (lowerCommand === 'pomodoro stats') {
      return await this.handleStats(userId);
    }

    return this.error('Unknown pomodoro command. Try: start, stop, status, or stats');
  }

  /**
   * Handle "pomodoro start [minutes]"
   */
  async handleStartSession(userId, durationMinutes, context) {
    try {
      // Validate duration
      if (durationMinutes <= 0) {
        return this.error('Duration must be a positive number of minutes.');
      }

      if (durationMinutes > 180) {
        return this.error('Maximum session duration is 180 minutes (3 hours).');
      }

      // Check if already have active session
      if (this.activeSessions.has(userId)) {
        return this.error(
          'You already have an active Pomodoro session.\n' +
          'Use "pomodoro stop" to end it first.'
        );
      }

      // Create session
      const sessionId = `pomo_${userId}_${Date.now()}`;
      const startTime = new Date();
      const durationMs = durationMinutes * 60 * 1000;

      // Store session in memory
      this.activeSessions.set(userId, {
        sessionId,
        startTime,
        duration: durationMinutes,
        startedAt: startTime.toISOString()
      });

      // Save to database
      await this._saveSession(userId, {
        sessionId,
        duration: durationMinutes,
        startedAt: startTime.toISOString()
      });

      // Schedule completion alert
      await this._scheduleCompletion(userId, sessionId, durationMs, durationMinutes, context);

      // Return success response
      let response = `✓ Pomodoro session started!\n\n`;
      response += `Duration: ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}\n`;
      response += `Started: ${this._formatTime(startTime)}\n`;
      response += `Ends at: ${this._formatTime(new Date(startTime.getTime() + durationMs))}\n\n`;
      response += `Focus mode activated. Good luck! 🍅`;

      this.log('info', `Pomodoro session started for user ${userId}: ${durationMinutes} minutes`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error starting Pomodoro session', error);
      return this.error('Failed to start Pomodoro session. Please try again.');
    }
  }

  /**
   * Handle "pomodoro stop"
   */
  async handleStopSession(userId) {
    try {
      // Check if session exists
      if (!this.activeSessions.has(userId)) {
        return this.error(
          'No active Pomodoro session.\n\n' +
          'Start one with: pomodoro start'
        );
      }

      const session = this.activeSessions.get(userId);

      // Clear timeout if exists
      if (this.activeTimeouts.has(session.sessionId)) {
        clearTimeout(this.activeTimeouts.get(session.sessionId));
        this.activeTimeouts.delete(session.sessionId);
      }

      // Calculate elapsed time
      const elapsed = new Date() - session.startTime;
      const elapsedMinutes = Math.floor(elapsed / 60000);
      const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);

      // Remove from active sessions
      this.activeSessions.delete(userId);

      // Update database (mark as stopped)
      await this._updateSessionStatus(userId, session.sessionId, 'stopped', {
        elapsedMinutes,
        elapsedSeconds
      });

      // Return response
      let response = `✓ Pomodoro session stopped\n\n`;
      response += `Elapsed: ${elapsedMinutes}m ${elapsedSeconds}s\n`;
      response += `Planned: ${session.duration}m\n`;
      response += `Progress: ${Math.round((elapsedMinutes / session.duration) * 100)}%`;

      this.log('info', `Pomodoro session stopped for user ${userId} after ${elapsedMinutes}m ${elapsedSeconds}s`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error stopping Pomodoro session', error);
      return this.error('Failed to stop Pomodoro session. Please try again.');
    }
  }

  /**
   * Handle "pomodoro status"
   */
  async handleStatus(userId) {
    try {
      let response = '*Pomodoro Status*\n\n';

      // Show active session if exists
      if (this.activeSessions.has(userId)) {
        const session = this.activeSessions.get(userId);
        const elapsed = new Date() - session.startTime;
        const elapsedMinutes = Math.floor(elapsed / 60000);
        const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);
        const remaining = session.duration - elapsedMinutes;

        response += `Active Session:\n`;
        response += `  Duration: ${session.duration}m\n`;
        response += `  Elapsed: ${elapsedMinutes}m ${elapsedSeconds}s\n`;
        response += `  Remaining: ${Math.max(0, remaining)}m\n`;
        response += `  Progress: ${Math.round((elapsedMinutes / session.duration) * 100)}%\n\n`;
      } else {
        response += `No active session\n\n`;
      }

      // Show daily count
      const dailyCount = await this._getDailyCount(userId);
      response += `Today's sessions: ${dailyCount}\n`;

      this.log('info', `Status requested by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting status', error);
      return this.error('Failed to get Pomodoro status. Please try again.');
    }
  }

  /**
   * Handle "pomodoro stats"
   */
  async handleStats(userId) {
    try {
      const stats = await this._getDailyStats(userId);

      let response = `*Pomodoro Statistics (Today)*\n\n`;
      response += `Sessions completed: ${stats.completed}\n`;
      response += `Sessions interrupted: ${stats.interrupted}\n`;
      response += `Total focused time: ${stats.totalMinutes}m\n`;
      response += `Average session: ${stats.avgDuration}m\n`;

      if (stats.longestSession > 0) {
        response += `Longest session: ${stats.longestSession}m\n`;
      }

      this.log('info', `Stats requested by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting stats', error);
      return this.error('Failed to get Pomodoro statistics. Please try again.');
    }
  }

  // ==================== Private Helpers ====================

  /**
   * Schedule a session completion alert
   * @private
   */
  async _scheduleCompletion(userId, sessionId, durationMs, durationMinutes, context) {
    const sendMessage = this.config.sendMessage;

    if (sendMessage) {
      const timeout = setTimeout(async () => {
        try {
          // Mark as completed in database
          await this._updateSessionStatus(userId, sessionId, 'completed', {
            elapsedMinutes: durationMinutes
          });

          // Remove from active sessions
          if (this.activeSessions.has(userId)) {
            this.activeSessions.delete(userId);
          }

          // Build alert message
          const alertMessage = `🍅 *Pomodoro Complete!*\n\n` +
            `${durationMinutes}-minute session finished.\n\n` +
            `Great work! Take a break. 😊`;

          // Send alert
          await sendMessage(alertMessage);
          this.log('info', `Pomodoro session completed and alert sent for user ${userId}`);
        } catch (error) {
          this.log('error', 'Error sending Pomodoro completion alert', error);
        }
      }, durationMs);

      // Store timeout reference for cleanup
      this.activeTimeouts.set(sessionId, timeout);
      this.log('debug', `Scheduled Pomodoro completion alert for session ${sessionId}`);
    }
  }

  /**
   * Save a Pomodoro session to database
   * @private
   */
  async _saveSession(userId, session) {
    // Try to use database module if available
    try {
      // First check if we need to initialize the database schema
      const db = require('../../lib/database');
      if (!db) return;

      // The database might not have the pomodoro_sessions table yet
      // We'll create a helper method in database.js for this
      // For now, we'll store this in the database if the schema exists
      const rawDb = db.getDb();
      if (rawDb) {
        try {
          const stmt = rawDb.prepare(`
            INSERT INTO pomodoro_sessions
            (session_id, user_id, duration_minutes, started_at, status)
            VALUES (?, ?, ?, ?, ?)
          `);
          stmt.run(
            session.sessionId,
            String(userId),
            session.duration,
            session.startedAt,
            'active'
          );
          this.log('debug', `Saved session to database: ${session.sessionId}`);
        } catch (err) {
          if (err.message.includes('no such table')) {
            // Table doesn't exist yet, skip for now
            this.log('debug', 'pomodoro_sessions table does not exist yet');
          } else {
            this.log('warn', 'Could not save session to database', err.message);
          }
        }
      }
    } catch (error) {
      this.log('debug', 'Database not available for session storage');
    }
  }

  /**
   * Update session status in database
   * @private
   */
  async _updateSessionStatus(userId, sessionId, status, metadata = {}) {
    try {
      const db = require('../../lib/database');
      if (!db) return;

      const rawDb = db.getDb();
      if (rawDb) {
        try {
          const stmt = rawDb.prepare(`
            UPDATE pomodoro_sessions
            SET status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE session_id = ? AND user_id = ?
          `);
          stmt.run(status, sessionId, String(userId));
          this.log('debug', `Updated session status: ${sessionId} -> ${status}`);
        } catch (err) {
          if (!err.message.includes('no such table')) {
            this.log('warn', 'Could not update session in database', err.message);
          }
        }
      }
    } catch (error) {
      this.log('debug', 'Database not available for session update');
    }
  }

  /**
   * Get daily session count for a user
   * @private
   */
  async _getDailyCount(userId) {
    try {
      const db = require('../../lib/database');
      if (!db) return 0;

      const rawDb = db.getDb();
      if (rawDb) {
        try {
          const stmt = rawDb.prepare(`
            SELECT COUNT(*) as count FROM pomodoro_sessions
            WHERE user_id = ?
            AND date(started_at) = date('now')
            AND status = 'completed'
          `);
          const result = stmt.get(String(userId));
          return result?.count || 0;
        } catch (err) {
          if (!err.message.includes('no such table')) {
            this.log('warn', 'Could not query daily count', err.message);
          }
        }
      }
    } catch (error) {
      this.log('debug', 'Database not available for count query');
    }
    return 0;
  }

  /**
   * Get daily statistics for a user
   * @private
   */
  async _getDailyStats(userId) {
    const defaultStats = {
      completed: 0,
      interrupted: 0,
      totalMinutes: 0,
      avgDuration: 0,
      longestSession: 0
    };

    try {
      const db = require('../../lib/database');
      if (!db) return defaultStats;

      const rawDb = db.getDb();
      if (rawDb) {
        try {
          const stmt = rawDb.prepare(`
            SELECT
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
              COUNT(CASE WHEN status = 'stopped' THEN 1 END) as interrupted,
              SUM(CASE WHEN status IN ('completed', 'stopped') THEN duration_minutes ELSE 0 END) as total_minutes,
              MAX(duration_minutes) as longest_session
            FROM pomodoro_sessions
            WHERE user_id = ? AND date(started_at) = date('now')
          `);

          const result = stmt.get(String(userId));

          const completed = result?.completed || 0;
          const totalMinutes = result?.total_minutes || 0;

          return {
            completed,
            interrupted: result?.interrupted || 0,
            totalMinutes,
            avgDuration: completed > 0 ? Math.round(totalMinutes / completed) : 0,
            longestSession: result?.longest_session || 0
          };
        } catch (err) {
          if (!err.message.includes('no such table')) {
            this.log('warn', 'Could not query daily stats', err.message);
          }
        }
      }
    } catch (error) {
      this.log('debug', 'Database not available for stats query');
    }

    return defaultStats;
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
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      activeSessions: this.activeSessions.size,
      dataType: 'pomodoro-sessions'
    };
  }

  /**
   * Shutdown the skill - clear all active sessions
   */
  async shutdown() {
    // Clear all active timeouts
    for (const [sessionId, timeout] of this.activeTimeouts) {
      clearTimeout(timeout);
      this.log('debug', `Cleared timeout for session ${sessionId}`);
    }
    this.activeTimeouts.clear();
    this.activeSessions.clear();

    await super.shutdown();
  }
}

module.exports = PomodoroSkill;
