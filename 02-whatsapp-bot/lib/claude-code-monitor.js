/**
 * Claude Code Monitor
 * Polls session logs and reports progress milestones
 */

const fs = require('fs').promises;
const database = require('./database');

// Lazy import to avoid circular dependency
let outcomeTracker = null;

class ClaudeCodeMonitor {
  constructor() {
    this.activeMonitors = new Map();  // sessionId → intervalId
  }

  /**
   * Start monitoring a Claude Code session
   */
  async startMonitoring(sessionId, pid, logPath, sendProgress) {
    let lastPosition = 0;
    let lastUpdate = Date.now();

    const interval = setInterval(async () => {
      try {
        // Check if process still alive
        if (!this.isProcessAlive(pid)) {
          clearInterval(interval);
          this.activeMonitors.delete(sessionId);
          await this.handleCompletion(sessionId, logPath, sendProgress);
          return;
        }

        // Read new log content
        const newContent = await this.readLogSince(logPath, lastPosition);
        if (newContent) {
          lastPosition += newContent.length;

          // Parse for milestones
          const milestone = this.parseMilestone(newContent);
          if (milestone) {
            await sendProgress(`🔄 ${milestone}`);
            lastUpdate = Date.now();
          }
        }

        // Send periodic "still working" update every 2 minutes
        if (Date.now() - lastUpdate > 120000) {
          const runtime = this.getRuntime(sessionId);
          await sendProgress(`⏳ Still working... (${runtime})`);
          lastUpdate = Date.now();
        }

      } catch (err) {
        console.error('[ClaudeCodeMonitor] Error:', err);
      }
    }, 30000);  // Poll every 30 seconds

    this.activeMonitors.set(sessionId, interval);
    console.log(`[ClaudeCodeMonitor] Started monitoring ${sessionId}`);
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(sessionId) {
    const interval = this.activeMonitors.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.activeMonitors.delete(sessionId);
      console.log(`[ClaudeCodeMonitor] Stopped monitoring ${sessionId}`);
    }
  }

  /**
   * Read log file from last position
   */
  async readLogSince(logPath, lastPosition) {
    try {
      const stat = await fs.stat(logPath);
      if (stat.size <= lastPosition) {
        return '';  // No new content
      }

      const handle = await fs.open(logPath, 'r');
      const buffer = Buffer.alloc(stat.size - lastPosition);
      await handle.read(buffer, 0, buffer.length, lastPosition);
      await handle.close();

      return buffer.toString('utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[ClaudeCodeMonitor] Error reading log:', err);
      }
      return '';
    }
  }

  /**
   * Parse log content for milestones
   */
  parseMilestone(logContent) {
    const phases = [
      { pattern: /Reading.*files/i, message: 'Reading project files' },
      { pattern: /Planning.*changes/i, message: 'Planning changes' },
      { pattern: /Creating.*files/i, message: 'Creating files' },
      { pattern: /Modifying.*files/i, message: 'Modifying files' },
      { pattern: /Running.*tests/i, message: 'Running tests' },
      { pattern: /Creating.*PR/i, message: 'Creating pull request' },
      { pattern: /Error:/i, message: 'ERROR detected' }
    ];

    for (const phase of phases) {
      if (phase.pattern.test(logContent)) {
        return phase.message;
      }
    }
    return null;
  }

  /**
   * Handle session completion
   */
  async handleCompletion(sessionId, logPath, sendProgress) {
    console.log(`[ClaudeCodeMonitor] Session ${sessionId} completed`);

    // Read final log output
    const log = await this.readFullLog(logPath);

    // Detect success/failure
    const success = /PR created|Task complete|Successfully/i.test(log);
    const prUrl = this.extractPRUrl(log);
    const error = success ? null : this.extractError(log);

    // Calculate duration
    const session = database.getActiveClaudeCodeSession(sessionId);
    const duration = session ? Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000) : null;

    // Update database
    database.updateClaudeCodeSession(sessionId, {
      status: success ? 'completed' : 'failed',
      outputSummary: log.substring(0, 500),
      prUrl: prUrl || null,
      durationSeconds: duration
    });

    // Send completion message
    if (success && prUrl) {
      await sendProgress(`✅ Claude Code session complete!\n\nPR: ${prUrl}\nDuration: ${this.formatDuration(duration)}`);
    } else if (success) {
      await sendProgress(`✅ Claude Code session complete!\nDuration: ${this.formatDuration(duration)}`);
    } else {
      await sendProgress(`❌ Session failed: ${error || 'Unknown error'}\nCheck logs for details`);
    }

    // Update outcome tracker
    if (!outcomeTracker) {
      outcomeTracker = require('./outcome-tracker');
    }

    outcomeTracker.completeAction(sessionId, {
      result: success ? 'success' : 'failed',
      resultDetail: success ? 'Claude Code session completed' : error || 'Session failed',
      prUrl: prUrl || undefined
    });
  }

  /**
   * Read full log file
   */
  async readFullLog(logPath) {
    try {
      return await fs.readFile(logPath, 'utf8');
    } catch (err) {
      console.error('[ClaudeCodeMonitor] Error reading full log:', err);
      return '';
    }
  }

  /**
   * Extract PR URL from log
   */
  extractPRUrl(log) {
    const match = log.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
    return match ? match[0] : null;
  }

  /**
   * Extract error message from log
   */
  extractError(log) {
    const match = log.match(/Error: (.+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Check if process is alive
   */
  isProcessAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Format duration for display
   */
  formatDuration(seconds) {
    if (!seconds) return 'unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  /**
   * Get runtime of a session
   */
  getRuntime(sessionId) {
    // Would need to track start time, simplified for now
    return '...';
  }
}

module.exports = new ClaudeCodeMonitor();  // Singleton
