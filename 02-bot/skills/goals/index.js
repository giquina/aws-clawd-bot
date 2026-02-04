/**
 * Goals Skill - Track and achieve your goals with progress monitoring
 *
 * Set personal and professional goals, track progress, and get reminders.
 * Supports goals with numeric targets, deadlines, and progress visualization.
 *
 * Commands:
 *   goal set <description> [target <value> <unit>] [by <date>]  - Create a new goal
 *   goal list                                                    - View all active goals
 *   goal progress                                                - Alias for goal list
 *   goal update <id> <value>                                     - Update progress
 *   goal complete <id>                                           - Mark goal as complete
 *   goal delete <id>                                             - Delete a goal
 *   goal stats                                                   - View goal statistics
 *
 * @example
 * goal set Read 12 books target 12 books by 2025-12-31
 * goal set Launch new feature by 2025-03-15
 * goal update 1 8
 * goal complete 2
 * goal list
 * goal stats
 */

const BaseSkill = require('../base-skill');
const db = require('../../lib/database');

class GoalsSkill extends BaseSkill {
  name = 'goals';
  description = 'Track and achieve personal and professional goals';
  priority = 16;

  commands = [
    {
      pattern: /^goal\s+set\s+.+$/i,
      description: 'Create a new goal',
      usage: 'goal set <description> [target <value> <unit>] [by <date>]'
    },
    {
      pattern: /^goal\s+(list|progress)$/i,
      description: 'View all active goals with progress',
      usage: 'goal list | goal progress'
    },
    {
      pattern: /^goal\s+update\s+\d+\s+[\d.]+$/i,
      description: 'Update goal progress',
      usage: 'goal update <id> <value>'
    },
    {
      pattern: /^goal\s+complete\s+\d+$/i,
      description: 'Mark a goal as complete',
      usage: 'goal complete <id>'
    },
    {
      pattern: /^goal\s+delete\s+\d+$/i,
      description: 'Delete a goal',
      usage: 'goal delete <id>'
    },
    {
      pattern: /^goal\s+stats$/i,
      description: 'View goal statistics',
      usage: 'goal stats'
    }
  ];

  /**
   * Execute goal commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "goal set <description> [target <value> <unit>] [by <date>]"
    if (lowerCommand.startsWith('goal set ')) {
      return await this.handleSetGoal(userId, parsed.raw);
    }

    // Handle "goal list" or "goal progress"
    if (lowerCommand === 'goal list' || lowerCommand === 'goal progress') {
      return await this.handleListGoals(userId);
    }

    // Handle "goal update <id> <value>"
    if (lowerCommand.startsWith('goal update ')) {
      const match = parsed.raw.match(/^goal\s+update\s+(\d+)\s+([\d.]+)$/i);
      if (match) {
        const goalId = parseInt(match[1]);
        const value = parseFloat(match[2]);
        return await this.handleUpdateProgress(userId, goalId, value);
      }
      return this.error('Invalid syntax. Use: goal update <id> <value>');
    }

    // Handle "goal complete <id>"
    if (lowerCommand.startsWith('goal complete ')) {
      const match = parsed.raw.match(/^goal\s+complete\s+(\d+)$/i);
      if (match) {
        const goalId = parseInt(match[1]);
        return await this.handleCompleteGoal(userId, goalId);
      }
      return this.error('Invalid syntax. Use: goal complete <id>');
    }

    // Handle "goal delete <id>"
    if (lowerCommand.startsWith('goal delete ')) {
      const match = parsed.raw.match(/^goal\s+delete\s+(\d+)$/i);
      if (match) {
        const goalId = parseInt(match[1]);
        return await this.handleDeleteGoal(userId, goalId);
      }
      return this.error('Invalid syntax. Use: goal delete <id>');
    }

    // Handle "goal stats"
    if (lowerCommand === 'goal stats') {
      return await this.handleStats(userId);
    }

    return this.error('Unknown goal command. Try: set, list, update, complete, delete, or stats');
  }

  /**
   * Handle "goal set <description> [target <value> <unit>] [by <date>]"
   */
  async handleSetGoal(userId, commandText) {
    try {
      // Remove "goal set " prefix
      const content = commandText.substring(9).trim();

      // Parse target value: "target <value> <unit>"
      let targetValue = null;
      let unit = null;
      let description = content;
      let deadline = null;

      // Extract target if present
      const targetMatch = content.match(/target\s+([\d.]+)\s+(\w+)/i);
      if (targetMatch) {
        targetValue = parseFloat(targetMatch[1]);
        unit = targetMatch[2];
        // Remove target from description
        description = content.replace(/target\s+[\d.]+\s+\w+/i, '').trim();
      }

      // Extract deadline if present: "by YYYY-MM-DD"
      const deadlineMatch = content.match(/by\s+(\d{4}-\d{2}-\d{2})/i);
      if (deadlineMatch) {
        deadline = deadlineMatch[1];
        // Remove deadline from description
        description = description.replace(/by\s+\d{4}-\d{2}-\d{2}/i, '').trim();
      }

      if (!description) {
        return this.error('Goal description cannot be empty');
      }

      // Save to database
      const result = db.saveGoal(userId, {
        description,
        targetValue,
        unit,
        deadline
      });

      if (!result) {
        return this.error('Failed to save goal to database');
      }

      // Build success message
      let message = `Goal created: ${description}`;
      if (targetValue && unit) {
        message += `\nTarget: ${targetValue} ${unit}`;
      }
      if (deadline) {
        const daysUntil = this._calculateDaysUntil(deadline);
        message += `\nDeadline: ${deadline} (${daysUntil} days away)`;
      }
      message += `\n\nUse "goal update ${result.id} <value>" to track progress.`;

      return this.success(message);
    } catch (err) {
      return this.error('Failed to create goal', err);
    }
  }

  /**
   * Handle "goal list" or "goal progress"
   */
  async handleListGoals(userId) {
    try {
      const goals = db.listGoals(userId, 'active');

      if (goals.length === 0) {
        return {
          success: true,
          message: 'No active goals found.\n\nUse "goal set <description>" to create your first goal!'
        };
      }

      let message = `*Active Goals (${goals.length})*\n\n`;

      for (const goal of goals) {
        message += `ID ${goal.id}: ${goal.description}\n`;

        // Show progress if target is set
        if (goal.target_value) {
          const progress = Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
          const progressBar = this._renderProgressBar(progress);
          message += `${progressBar} ${progress}% (${goal.current_value}/${goal.target_value} ${goal.unit || ''})\n`;
        }

        // Show deadline if set
        if (goal.deadline) {
          const daysUntil = this._calculateDaysUntil(goal.deadline);
          const deadlineStr = daysUntil > 0
            ? `${daysUntil} days remaining`
            : daysUntil === 0
              ? 'Due TODAY'
              : `${Math.abs(daysUntil)} days overdue`;

          const deadlineIcon = daysUntil < 0 ? '⚠' : daysUntil <= 7 ? '⏰' : '📅';
          message += `${deadlineIcon} ${goal.deadline} (${deadlineStr})\n`;
        }

        message += '\n';
      }

      message += `Use "goal update <id> <value>" to update progress.`;

      return {
        success: true,
        message
      };
    } catch (err) {
      return this.error('Failed to list goals', err);
    }
  }

  /**
   * Handle "goal update <id> <value>"
   */
  async handleUpdateProgress(userId, goalId, value) {
    try {
      // Get the goal
      const goal = db.getGoal(goalId);

      if (!goal) {
        return this.error(`Goal ID ${goalId} not found`);
      }

      if (goal.user_id !== String(userId)) {
        return this.error('You can only update your own goals');
      }

      if (goal.status !== 'active') {
        return this.error(`Goal is ${goal.status}. Cannot update progress.`);
      }

      // Validate value
      if (value < 0) {
        return this.error('Progress value cannot be negative');
      }

      // Update progress
      const result = db.updateGoalProgress(goalId, value);

      if (result === 0) {
        return this.error('Failed to update goal progress');
      }

      // Calculate percentage if target is set
      let message = `Progress updated: ${goal.description}\n`;
      if (goal.target_value) {
        const progress = Math.min(100, Math.round((value / goal.target_value) * 100));
        const progressBar = this._renderProgressBar(progress);
        message += `${progressBar} ${progress}% (${value}/${goal.target_value} ${goal.unit || ''})\n`;

        // Check if goal is complete
        if (value >= goal.target_value) {
          message += '\n🎉 Congratulations! You\'ve reached your target!\n';
          message += `Use "goal complete ${goalId}" to mark it as complete.`;
        }
      } else {
        message += `Current value: ${value}`;
      }

      return this.success(message);
    } catch (err) {
      return this.error('Failed to update goal progress', err);
    }
  }

  /**
   * Handle "goal complete <id>"
   */
  async handleCompleteGoal(userId, goalId) {
    try {
      // Get the goal
      const goal = db.getGoal(goalId);

      if (!goal) {
        return this.error(`Goal ID ${goalId} not found`);
      }

      if (goal.user_id !== String(userId)) {
        return this.error('You can only complete your own goals');
      }

      if (goal.status === 'completed') {
        return this.error('Goal is already completed');
      }

      // Mark as complete
      const result = db.completeGoal(goalId);

      if (result === 0) {
        return this.error('Failed to mark goal as complete');
      }

      let message = `🎉 Goal completed: ${goal.description}`;

      // Show final progress if target was set
      if (goal.target_value) {
        const finalProgress = Math.round((goal.current_value / goal.target_value) * 100);
        message += `\nFinal progress: ${finalProgress}%`;
      }

      return this.success(message);
    } catch (err) {
      return this.error('Failed to complete goal', err);
    }
  }

  /**
   * Handle "goal delete <id>"
   */
  async handleDeleteGoal(userId, goalId) {
    try {
      // Get the goal to verify ownership
      const goal = db.getGoal(goalId);

      if (!goal) {
        return this.error(`Goal ID ${goalId} not found`);
      }

      if (goal.user_id !== String(userId)) {
        return this.error('You can only delete your own goals');
      }

      // Delete the goal
      const result = db.deleteGoal(goalId);

      if (result === 0) {
        return this.error('Failed to delete goal');
      }

      return this.success(`Goal deleted: ${goal.description}`);
    } catch (err) {
      return this.error('Failed to delete goal', err);
    }
  }

  /**
   * Handle "goal stats"
   */
  async handleStats(userId) {
    try {
      const activeGoals = db.listGoals(userId, 'active');
      const completedGoals = db.listGoals(userId, 'completed');
      const allGoals = db.listGoals(userId);

      // Calculate stats
      const totalGoals = allGoals.length;
      const activeCount = activeGoals.length;
      const completedCount = completedGoals.length;
      const completionRate = totalGoals > 0 ? Math.round((completedCount / totalGoals) * 100) : 0;

      // Calculate approaching deadlines
      const approachingDeadlines = db.getGoalsApproachingDeadline(userId, 7);
      const overdueGoals = activeGoals.filter(g => {
        if (!g.deadline) return false;
        return this._calculateDaysUntil(g.deadline) < 0;
      });

      // Calculate average progress for active goals with targets
      const goalsWithTargets = activeGoals.filter(g => g.target_value);
      const avgProgress = goalsWithTargets.length > 0
        ? Math.round(
            goalsWithTargets.reduce((sum, g) => {
              return sum + Math.min(100, (g.current_value / g.target_value) * 100);
            }, 0) / goalsWithTargets.length
          )
        : 0;

      let message = `*Goal Statistics*\n\n`;
      message += `📊 Overview:\n`;
      message += `• Total goals: ${totalGoals}\n`;
      message += `• Active: ${activeCount}\n`;
      message += `• Completed: ${completedCount}\n`;
      message += `• Completion rate: ${completionRate}%\n\n`;

      if (goalsWithTargets.length > 0) {
        message += `📈 Progress:\n`;
        message += `• Average progress: ${avgProgress}%\n`;
        message += this._renderProgressBar(avgProgress) + '\n\n';
      }

      if (approachingDeadlines.length > 0) {
        message += `⏰ Upcoming Deadlines (7 days):\n`;
        for (const goal of approachingDeadlines.slice(0, 3)) {
          const daysUntil = this._calculateDaysUntil(goal.deadline);
          message += `• ${goal.description} (${daysUntil} days)\n`;
        }
        message += '\n';
      }

      if (overdueGoals.length > 0) {
        message += `⚠ Overdue Goals: ${overdueGoals.length}\n`;
      }

      return {
        success: true,
        message
      };
    } catch (err) {
      return this.error('Failed to calculate statistics', err);
    }
  }

  /**
   * Render a progress bar using Unicode blocks
   * @param {number} percentage - Progress percentage (0-100)
   * @returns {string} Progress bar string
   */
  _renderProgressBar(percentage) {
    const blocks = 10;
    const filled = Math.round((percentage / 100) * blocks);
    const empty = blocks - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Calculate days until a deadline
   * @param {string} deadline - ISO date string (YYYY-MM-DD)
   * @returns {number} Days until deadline (negative if overdue)
   */
  _calculateDaysUntil(deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = GoalsSkill;
