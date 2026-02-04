/**
 * TODO.md Parser
 * Parses TODO.md markdown into structured task data
 */

/**
 * Task status enum
 * @readonly
 * @enum {string}
 */
const TaskStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};

/**
 * Task object structure
 * @typedef {Object} Task
 * @property {string} text - Task description
 * @property {TaskStatus} status - Task status
 * @property {string} section - Section header the task belongs to
 * @property {string} [completedDate] - Date when task was completed (if detected)
 */

/**
 * Task stats structure
 * @typedef {Object} TaskStats
 * @property {number} not_started - Count of not started tasks
 * @property {number} in_progress - Count of in progress tasks
 * @property {number} completed - Count of completed tasks
 * @property {number} total - Total task count
 */

/**
 * Parsed TODO result
 * @typedef {Object} ParsedTodo
 * @property {Task[]} tasks - Array of parsed tasks
 * @property {TaskStats} stats - Task statistics
 */

/**
 * Detect task status from line content
 * @param {string} line - Line to parse
 * @returns {{status: TaskStatus, text: string}|null} Status and cleaned text, or null if not a task
 */
function detectTaskStatus(line) {
  const trimmed = line.trim();

  // Skip empty lines and headers
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  // Check for completed tasks
  // ✅ marker
  if (trimmed.startsWith('✅')) {
    return {
      status: TaskStatus.COMPLETED,
      text: trimmed.replace(/^✅\s*/, '').trim()
    };
  }
  // [x] or [X] checkbox
  if (/^[-*]\s*\[x\]/i.test(trimmed)) {
    return {
      status: TaskStatus.COMPLETED,
      text: trimmed.replace(/^[-*]\s*\[x\]\s*/i, '').trim()
    };
  }

  // Check for in-progress tasks
  // 🟡 marker
  if (trimmed.startsWith('🟡')) {
    return {
      status: TaskStatus.IN_PROGRESS,
      text: trimmed.replace(/^🟡\s*/, '').trim()
    };
  }
  // [-] checkbox
  if (/^[-*]\s*\[-\]/.test(trimmed)) {
    return {
      status: TaskStatus.IN_PROGRESS,
      text: trimmed.replace(/^[-*]\s*\[-\]\s*/, '').trim()
    };
  }

  // Check for not started tasks
  // ⬜ marker
  if (trimmed.startsWith('⬜')) {
    return {
      status: TaskStatus.NOT_STARTED,
      text: trimmed.replace(/^⬜\s*/, '').trim()
    };
  }
  // [ ] checkbox
  if (/^[-*]\s*\[\s*\]/.test(trimmed)) {
    return {
      status: TaskStatus.NOT_STARTED,
      text: trimmed.replace(/^[-*]\s*\[\s*\]\s*/, '').trim()
    };
  }

  // Regular bullet point without checkbox = not started
  if (/^[-*]\s+/.test(trimmed)) {
    return {
      status: TaskStatus.NOT_STARTED,
      text: trimmed.replace(/^[-*]\s+/, '').trim()
    };
  }

  return null;
}

/**
 * Parse TODO.md content into structured task data
 * @param {string} content - Raw TODO.md file content
 * @returns {ParsedTodo} Parsed tasks and statistics
 */
function parseTodoMd(content) {
  if (!content) {
    return {
      tasks: [],
      stats: {
        not_started: 0,
        in_progress: 0,
        completed: 0,
        total: 0
      }
    };
  }

  const lines = content.split('\n');
  const tasks = [];
  let currentSection = 'Uncategorized';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers (## Header)
    if (trimmed.startsWith('##')) {
      currentSection = trimmed.replace(/^#+\s*/, '').trim();
      continue;
    }

    // Try to parse as task
    const taskInfo = detectTaskStatus(line);
    if (taskInfo) {
      // Try to extract completion date (common patterns)
      let completedDate = null;
      if (taskInfo.status === TaskStatus.COMPLETED) {
        // Look for date patterns like (2024-01-15), [Jan 15], etc.
        const dateMatch = taskInfo.text.match(/\((\d{4}-\d{2}-\d{2})\)|\[([A-Z][a-z]{2}\s+\d{1,2})\]/i);
        if (dateMatch) {
          completedDate = dateMatch[1] || dateMatch[2];
        }
      }

      tasks.push({
        text: taskInfo.text,
        status: taskInfo.status,
        section: currentSection,
        ...(completedDate && { completedDate })
      });
    }
  }

  return {
    tasks,
    stats: getTaskStats(tasks)
  };
}

/**
 * Get task statistics by status
 * @param {Task[]} tasks - Array of tasks
 * @returns {TaskStats} Task counts by status
 */
function getTaskStats(tasks) {
  const stats = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    total: tasks.length
  };

  for (const task of tasks) {
    if (stats[task.status] !== undefined) {
      stats[task.status]++;
    }
  }

  return stats;
}

/**
 * Filter tasks by status
 * @param {Task[]} tasks - Array of tasks
 * @param {TaskStatus} status - Status to filter by
 * @returns {Task[]} Filtered tasks
 */
function filterByStatus(tasks, status) {
  return tasks.filter(task => task.status === status);
}

/**
 * Get tasks completed recently
 * @param {Task[]} tasks - Array of tasks
 * @param {number} [days=7] - Number of days to look back
 * @returns {Task[]} Recently completed tasks
 */
function getRecentlyCompleted(tasks, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return tasks.filter(task => {
    if (task.status !== TaskStatus.COMPLETED) return false;
    if (!task.completedDate) return false;

    try {
      const completedDate = new Date(task.completedDate);
      return completedDate >= cutoffDate;
    } catch {
      return false;
    }
  });
}

/**
 * Format tasks for WhatsApp message
 * @param {Task[]|ParsedTodo} tasksOrParsed - Array of tasks or parsed TODO object
 * @param {number} [maxLength=3500] - Maximum message length
 * @returns {string} Formatted message
 */
function formatTasksForWhatsApp(tasksOrParsed, maxLength = 3500) {
  let tasks, stats;

  if (Array.isArray(tasksOrParsed)) {
    tasks = tasksOrParsed;
    stats = getTaskStats(tasks);
  } else {
    tasks = tasksOrParsed.tasks;
    stats = tasksOrParsed.stats;
  }

  if (tasks.length === 0) {
    return 'No tasks found in TODO.md';
  }

  const statusEmoji = {
    [TaskStatus.NOT_STARTED]: '⬜',
    [TaskStatus.IN_PROGRESS]: '🟡',
    [TaskStatus.COMPLETED]: '✅'
  };

  let output = [];

  // Add summary header
  output.push(`📋 *Task Summary*`);
  output.push(`Total: ${stats.total} | ⬜ ${stats.not_started} | 🟡 ${stats.in_progress} | ✅ ${stats.completed}`);
  output.push('');

  // Group tasks by section
  const sections = {};
  for (const task of tasks) {
    if (!sections[task.section]) {
      sections[task.section] = [];
    }
    sections[task.section].push(task);
  }

  // Format each section
  for (const [section, sectionTasks] of Object.entries(sections)) {
    output.push(`*${section}*`);

    for (const task of sectionTasks) {
      const emoji = statusEmoji[task.status];
      const line = `${emoji} ${task.text}`;
      output.push(line);
    }

    output.push('');
  }

  let result = output.join('\n').trim();

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.substring(0, maxLength - 50);
    // Find last complete line
    const lastNewline = result.lastIndexOf('\n');
    if (lastNewline > 0) {
      result = result.substring(0, lastNewline);
    }
    result += '\n\n... (truncated)';
  }

  return result;
}

module.exports = {
  parseTodoMd,
  getTaskStats,
  formatTasksForWhatsApp,
  filterByStatus,
  getRecentlyCompleted,
  TaskStatus
};
