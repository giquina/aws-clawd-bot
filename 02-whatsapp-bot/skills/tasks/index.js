/**
 * Tasks Skill - Manage personal tasks via WhatsApp
 *
 * Allows users to create, view, complete, and delete tasks.
 * Uses the MemoryManager for persistent SQLite storage.
 *
 * Commands:
 *   add task [title]                    - Create a new task
 *   add task [title] priority [level]   - Create task with priority (high/medium/low)
 *   my tasks | list tasks               - Show all pending tasks
 *   complete task [number]              - Mark a task as complete
 *   delete task [number]                - Delete a task
 *   clear completed                     - Remove all completed tasks
 *
 * @example
 * add task Review pull request #123
 * add task Fix bug in login priority high
 * my tasks
 * complete task 1
 * delete task 2
 * clear completed
 */
const BaseSkill = require('../base-skill');

class TasksSkill extends BaseSkill {
  name = 'tasks';
  description = 'Create and manage your personal tasks';
  priority = 55; // Slightly higher than memory skill

  commands = [
    {
      pattern: /^add\s+task\s+(.+?)(?:\s+priority\s+(high|medium|low))?$/i,
      description: 'Create a new task',
      usage: 'add task <title> [priority high/medium/low]'
    },
    {
      pattern: /^(my\s+tasks|list\s+tasks)$/i,
      description: 'Show all your pending tasks',
      usage: 'my tasks'
    },
    {
      pattern: /^complete\s+task\s+(\d+)$/i,
      description: 'Mark a task as complete',
      usage: 'complete task <number>'
    },
    {
      pattern: /^delete\s+task\s+(\d+)$/i,
      description: 'Delete a task',
      usage: 'delete task <number>'
    },
    {
      pattern: /^clear\s+completed$/i,
      description: 'Remove all completed tasks',
      usage: 'clear completed'
    }
  ];

  // Priority icons for display
  priorityIcons = {
    urgent: '🔴',
    high: '🔴',
    medium: '🟡',
    low: '⚪'
  };

  // Status icons for display
  statusIcons = {
    pending: '⬜',
    in_progress: '🔄',
    completed: '✅',
    cancelled: '❌'
  };

  /**
   * Execute task commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    // Ensure memory manager is available
    if (!this.memory) {
      return this.error('Task system not initialized. Please try again.');
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "add task" command
    if (lowerCommand.startsWith('add task ')) {
      return this.handleAddTaskCommand(userId, parsed.raw);
    }

    // Handle "my tasks" or "list tasks"
    if (lowerCommand === 'my tasks' || lowerCommand === 'list tasks') {
      return this.handleListTasksCommand(userId);
    }

    // Handle "complete task [number]"
    if (lowerCommand.startsWith('complete task ')) {
      const match = parsed.raw.match(/complete\s+task\s+(\d+)/i);
      if (match) {
        return this.handleCompleteTaskCommand(userId, parseInt(match[1], 10));
      }
    }

    // Handle "delete task [number]"
    if (lowerCommand.startsWith('delete task ')) {
      const match = parsed.raw.match(/delete\s+task\s+(\d+)/i);
      if (match) {
        return this.handleDeleteTaskCommand(userId, parseInt(match[1], 10));
      }
    }

    // Handle "clear completed"
    if (lowerCommand === 'clear completed') {
      return this.handleClearCompletedCommand(userId);
    }

    return this.error('Unknown task command');
  }

  /**
   * Handle "add task [title] priority [level]" - Create a new task
   */
  handleAddTaskCommand(userId, rawCommand) {
    // Parse command: "add task [title] priority [level]"
    const match = rawCommand.match(/^add\s+task\s+(.+?)(?:\s+priority\s+(high|medium|low))?$/i);

    if (!match) {
      return this.error(
        'Invalid task format.\n\n' +
        'Usage: add task <title> [priority high/medium/low]\n\n' +
        'Example: add task Review PR #123 priority high'
      );
    }

    const title = match[1].trim();
    const priority = match[2] ? match[2].toLowerCase() : 'medium';

    if (!title || title.length === 0) {
      return this.error('Please provide a task title.');
    }

    try {
      const taskId = this.memory.createTask(userId, title, '', priority);
      const icon = this.priorityIcons[priority];

      const response = (
        `${this.statusIcons.pending} *Task Created!*\n\n` +
        `${icon} ${title}\n\n` +
        `Priority: ${this.formatPriority(priority)}\n` +
        `Task #${taskId}\n\n` +
        '_Use "my tasks" to see all tasks_'
      );

      this.log('info', `Created task for user ${userId}:`, { title, priority, taskId });
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error creating task', error);
      return this.error('Failed to create the task. Please try again.');
    }
  }

  /**
   * Handle "my tasks" or "list tasks" - Show pending tasks
   */
  handleListTasksCommand(userId) {
    try {
      // Get pending tasks (not completed or cancelled)
      const pendingTasks = this.memory.getTasks(userId, 'pending');
      const inProgressTasks = this.memory.getTasks(userId, 'in_progress');
      const completedTasks = this.memory.getTasks(userId, 'completed');

      const activeTasks = [...pendingTasks, ...inProgressTasks];

      if (activeTasks.length === 0 && completedTasks.length === 0) {
        return this.success(
          '📋 *No tasks yet!*\n\n' +
          'Create your first task:\n' +
          'add task <title>\n\n' +
          'Example: add task Review PR #123'
        );
      }

      let message = '📋 *Your Tasks*\n';
      message += '━━━━━━━━━━━━━━━━━━━━━\n\n';

      // Show active tasks
      if (activeTasks.length > 0) {
        message += '*Active Tasks:*\n\n';

        activeTasks.forEach((task, index) => {
          const priorityIcon = this.priorityIcons[task.priority] || '⚪';
          const statusIcon = this.statusIcons[task.status] || '⬜';
          const dateStr = this.formatDate(task.created_at);

          message += `${index + 1}. ${statusIcon} ${priorityIcon} ${task.title}\n`;
          message += `   _${this.formatPriority(task.priority)} • ${dateStr}_\n\n`;
        });
      }

      // Show completed tasks count
      if (completedTasks.length > 0) {
        message += `*Completed:* ${completedTasks.length} task(s)\n`;
        message += '_Use "clear completed" to remove_\n\n';
      }

      message += '━━━━━━━━━━━━━━━━━━━━━\n';
      message += `_${activeTasks.length} active, ${completedTasks.length} completed_\n\n`;
      message += '*Commands:*\n';
      message += '• complete task <number>\n';
      message += '• delete task <number>';

      this.log('info', `Listed tasks for user ${userId}: ${activeTasks.length} active`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error retrieving tasks', error);
      return this.error('Failed to retrieve your tasks. Please try again.');
    }
  }

  /**
   * Handle "complete task [number]" - Mark task as complete
   */
  handleCompleteTaskCommand(userId, taskNumber) {
    if (!taskNumber || taskNumber < 1) {
      return this.error('Please provide a valid task number.');
    }

    try {
      // Get active tasks to find the one at this index
      const pendingTasks = this.memory.getTasks(userId, 'pending');
      const inProgressTasks = this.memory.getTasks(userId, 'in_progress');
      const activeTasks = [...pendingTasks, ...inProgressTasks];

      if (taskNumber > activeTasks.length) {
        return this.error(
          `Task #${taskNumber} not found.\n\n` +
          `You have ${activeTasks.length} active task(s).\n` +
          '_Use "my tasks" to see the list._'
        );
      }

      const task = activeTasks[taskNumber - 1];
      const updated = this.memory.updateTaskStatus(task.id, 'completed');

      if (!updated) {
        return this.error('Failed to complete the task. Please try again.');
      }

      const response = (
        `${this.statusIcons.completed} *Task Completed!*\n\n` +
        `~~${task.title}~~\n\n` +
        '_Great job! Use "my tasks" to see remaining tasks._'
      );

      this.log('info', `Completed task ${task.id} for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error completing task', error);
      return this.error('Failed to complete the task. Please try again.');
    }
  }

  /**
   * Handle "delete task [number]" - Delete a task
   */
  handleDeleteTaskCommand(userId, taskNumber) {
    if (!taskNumber || taskNumber < 1) {
      return this.error('Please provide a valid task number.');
    }

    try {
      // Get all tasks (active) to find the one at this index
      const pendingTasks = this.memory.getTasks(userId, 'pending');
      const inProgressTasks = this.memory.getTasks(userId, 'in_progress');
      const activeTasks = [...pendingTasks, ...inProgressTasks];

      if (taskNumber > activeTasks.length) {
        return this.error(
          `Task #${taskNumber} not found.\n\n` +
          `You have ${activeTasks.length} active task(s).\n` +
          '_Use "my tasks" to see the list._'
        );
      }

      const task = activeTasks[taskNumber - 1];
      const deleted = this.memory.deleteTask(userId, task.id);

      if (!deleted) {
        return this.error('Failed to delete the task. Please try again.');
      }

      const response = (
        `🗑️ *Task Deleted*\n\n` +
        `Removed: ${task.title}\n\n` +
        '_Use "my tasks" to see remaining tasks._'
      );

      this.log('info', `Deleted task ${task.id} for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error deleting task', error);
      return this.error('Failed to delete the task. Please try again.');
    }
  }

  /**
   * Handle "clear completed" - Remove all completed tasks
   */
  handleClearCompletedCommand(userId) {
    try {
      const completedTasks = this.memory.getTasks(userId, 'completed');

      if (completedTasks.length === 0) {
        return this.success(
          '📋 *No completed tasks to clear.*\n\n' +
          '_All done! Use "my tasks" to see active tasks._'
        );
      }

      let deletedCount = 0;
      completedTasks.forEach(task => {
        try {
          if (this.memory.deleteTask(userId, task.id)) {
            deletedCount++;
          }
        } catch (e) {
          this.log('warn', `Failed to delete completed task ${task.id}`, e);
        }
      });

      const response = (
        `🧹 *Cleared Completed Tasks*\n\n` +
        `Removed ${deletedCount} completed task(s).\n\n` +
        '_Use "my tasks" to see active tasks._'
      );

      this.log('info', `Cleared ${deletedCount} completed tasks for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error clearing completed tasks', error);
      return this.error('Failed to clear completed tasks. Please try again.');
    }
  }

  /**
   * Helper: Format priority for display
   */
  formatPriority(priority) {
    const labels = {
      urgent: 'Urgent',
      high: 'High Priority',
      medium: 'Medium Priority',
      low: 'Low Priority'
    };
    return labels[priority] || 'Medium Priority';
  }

  /**
   * Helper: Format date to readable string
   */
  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch (e) {
      return 'unknown date';
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Tasks skill ready for use');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'tasks',
      provider: 'MemoryManager'
    };
  }
}

module.exports = TasksSkill;
