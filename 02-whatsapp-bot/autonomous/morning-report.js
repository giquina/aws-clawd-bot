/**
 * Morning Report Generator
 *
 * Generates the "surprise progress" report sent each morning after nightly
 * autonomous work. Creates exciting summaries of what ClawdBot accomplished
 * while the user slept.
 *
 * @example
 * const { generateReport, formatForWhatsApp, saveReport, getLastReport } = require('./morning-report');
 *
 * const report = await generateReport(nightlyResults);
 * const message = formatForWhatsApp(report);
 * await saveReport(report);
 */

const fs = require('fs').promises;
const path = require('path');

// Data directory for storing reports
const DATA_DIR = path.join(__dirname, '..', 'data', 'morning-reports');

/**
 * Generate a structured morning report from nightly work results
 *
 * @param {Object} nightlyResults - Results from overnight autonomous work
 * @param {string[]} nightlyResults.reposScanned - Repositories that were analyzed
 * @param {Object[]} nightlyResults.tasksCompleted - Tasks that were executed
 * @param {Object[]} nightlyResults.tasksQueued - Tasks identified but needing approval
 * @param {string[]} nightlyResults.insights - Observations and findings
 * @param {string[]} nightlyResults.blockers - Issues preventing progress
 * @param {string[]} nightlyResults.recommendations - Suggested actions for the day
 * @returns {Object} Structured report object
 */
async function generateReport(nightlyResults = {}) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Default structure with provided values
  const report = {
    date: dateStr,
    startTime: nightlyResults.startTime || null,
    endTime: nightlyResults.endTime || now.toISOString(),
    reposScanned: nightlyResults.reposScanned || [],
    tasksCompleted: (nightlyResults.tasksCompleted || []).map(task => ({
      type: task.type || 'general',
      repo: task.repo || null,
      description: task.description || 'Task completed',
      commit: task.commit || null,
      pr: task.pr || null,
      duration: task.duration || null
    })),
    tasksQueued: (nightlyResults.tasksQueued || []).map(task => ({
      type: task.type || 'general',
      repo: task.repo || null,
      description: task.description || 'Pending task',
      reason: task.reason || 'Requires approval',
      priority: task.priority || 'medium'
    })),
    insights: nightlyResults.insights || [],
    blockers: nightlyResults.blockers || [],
    recommendations: nightlyResults.recommendations || [],
    stats: _calculateStats(nightlyResults)
  };

  return report;
}

/**
 * Calculate summary statistics from nightly results
 * @private
 */
function _calculateStats(results) {
  const tasksCompleted = results.tasksCompleted || [];
  const tasksQueued = results.tasksQueued || [];
  const reposScanned = results.reposScanned || [];

  // Count by task type
  const completedByType = {};
  tasksCompleted.forEach(task => {
    const type = task.type || 'general';
    completedByType[type] = (completedByType[type] || 0) + 1;
  });

  // Calculate duration if available
  let totalDurationMs = 0;
  if (results.startTime && results.endTime) {
    totalDurationMs = new Date(results.endTime) - new Date(results.startTime);
  }

  return {
    totalReposScanned: reposScanned.length,
    totalTasksCompleted: tasksCompleted.length,
    totalTasksQueued: tasksQueued.length,
    totalInsights: (results.insights || []).length,
    totalBlockers: (results.blockers || []).length,
    completedByType,
    durationMinutes: Math.round(totalDurationMs / 60000),
    commitsMade: tasksCompleted.filter(t => t.commit).length,
    prsCreated: tasksCompleted.filter(t => t.pr).length
  };
}

/**
 * Format report for WhatsApp message with exciting tone
 * Keeps message under 1500 characters for reliable delivery
 *
 * @param {Object} report - Structured report from generateReport()
 * @returns {string} WhatsApp-formatted message
 */
function formatForWhatsApp(report) {
  const lines = [];
  const stats = report.stats;

  // Exciting header
  lines.push(_getExcitingHeader(report));
  lines.push('');

  // Quick stats summary
  if (stats.totalTasksCompleted > 0 || stats.totalReposScanned > 0) {
    lines.push(_getQuickStats(stats));
    lines.push('');
  }

  // Completed tasks (top 3 max)
  if (report.tasksCompleted.length > 0) {
    lines.push('*Completed:*');
    const displayTasks = report.tasksCompleted.slice(0, 3);
    displayTasks.forEach(task => {
      const icon = _getTaskIcon(task.type);
      let line = `${icon} ${task.description}`;
      if (task.repo) line += ` (${task.repo})`;
      if (task.commit) line += ` [${task.commit.slice(0, 7)}]`;
      lines.push(line);
    });
    if (report.tasksCompleted.length > 3) {
      lines.push(`   _+${report.tasksCompleted.length - 3} more..._`);
    }
    lines.push('');
  }

  // Queued tasks needing approval (top 2 max)
  if (report.tasksQueued.length > 0) {
    lines.push('*Needs Your Approval:*');
    const displayQueued = report.tasksQueued.slice(0, 2);
    displayQueued.forEach(task => {
      lines.push(`  ${task.description}`);
      lines.push(`  _Reason: ${task.reason}_`);
    });
    if (report.tasksQueued.length > 2) {
      lines.push(`   _+${report.tasksQueued.length - 2} more pending..._`);
    }
    lines.push('');
  }

  // Key insights (top 2 max)
  if (report.insights.length > 0) {
    lines.push('*Discovered:*');
    report.insights.slice(0, 2).forEach(insight => {
      lines.push(`  ${insight}`);
    });
    lines.push('');
  }

  // Blockers (if any)
  if (report.blockers.length > 0) {
    lines.push('*Blockers:*');
    report.blockers.slice(0, 2).forEach(blocker => {
      lines.push(`  ${blocker}`);
    });
    lines.push('');
  }

  // Top recommendation
  if (report.recommendations.length > 0) {
    lines.push('*Recommended Today:*');
    lines.push(`  ${report.recommendations[0]}`);
    lines.push('');
  }

  // Footer
  lines.push(_getFooter(report));

  // Join and truncate if necessary
  let message = lines.join('\n');

  // Ensure under 1500 chars
  if (message.length > 1500) {
    message = _truncateMessage(message, 1500);
  }

  return message;
}

/**
 * Get exciting header based on work done
 * @private
 */
function _getExcitingHeader(report) {
  const stats = report.stats;
  const dayName = new Date(report.date).toLocaleDateString('en-GB', { weekday: 'long' });

  // Choose header based on accomplishments
  if (stats.totalTasksCompleted >= 5) {
    return `*Good morning! While you slept, I was BUSY*`;
  } else if (stats.totalTasksCompleted >= 3) {
    return `*Rise and shine! I've been productive*`;
  } else if (stats.totalTasksCompleted >= 1) {
    return `*Good morning! I got some work done*`;
  } else if (stats.totalReposScanned > 0) {
    return `*Morning! I did some research overnight*`;
  } else if (stats.totalTasksQueued > 0) {
    return `*Good morning! Found some things for you*`;
  } else {
    return `*Good ${dayName} morning!*`;
  }
}

/**
 * Get quick stats line
 * @private
 */
function _getQuickStats(stats) {
  const parts = [];

  if (stats.totalReposScanned > 0) {
    parts.push(`${stats.totalReposScanned} repos scanned`);
  }
  if (stats.commitsMade > 0) {
    parts.push(`${stats.commitsMade} commits`);
  }
  if (stats.prsCreated > 0) {
    parts.push(`${stats.prsCreated} PRs`);
  }
  if (stats.totalTasksCompleted > 0 && !stats.commitsMade) {
    parts.push(`${stats.totalTasksCompleted} tasks done`);
  }
  if (stats.durationMinutes > 0) {
    parts.push(`${stats.durationMinutes}min runtime`);
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join(' | ');
}

/**
 * Get icon for task type
 * @private
 */
function _getTaskIcon(type) {
  const icons = {
    docs: '[DOCS]',
    refactor: '[CODE]',
    fix: '[FIX]',
    feature: '[NEW]',
    test: '[TEST]',
    deps: '[DEPS]',
    review: '[REVIEW]',
    analysis: '[SCAN]',
    cleanup: '[CLEAN]',
    security: '[SEC]',
    general: '[TASK]'
  };
  return icons[type] || '[TASK]';
}

/**
 * Get footer message
 * @private
 */
function _getFooter(report) {
  if (report.tasksQueued.length > 0) {
    return `_Reply "approve all" or review individually_`;
  }
  if (report.recommendations.length > 1) {
    return `_${report.recommendations.length} recommendations total - ask for more_`;
  }
  return `_Ready to help when you are!_`;
}

/**
 * Truncate message to fit character limit
 * @private
 */
function _truncateMessage(message, maxLength) {
  if (message.length <= maxLength) {
    return message;
  }

  // Find last complete line that fits
  const lines = message.split('\n');
  let result = '';
  let truncated = false;

  for (const line of lines) {
    if ((result + line + '\n').length < maxLength - 30) {
      result += line + '\n';
    } else {
      truncated = true;
      break;
    }
  }

  if (truncated) {
    result += '\n_...more in full report_';
  }

  return result.trim();
}

/**
 * Save report to disk
 * Creates the data directory if it doesn't exist
 *
 * @param {Object} report - Report object to save
 * @returns {Promise<string>} Path to saved file
 */
async function saveReport(report) {
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const filename = `${report.date}.json`;
  const filepath = path.join(DATA_DIR, filename);

  // Add metadata
  const reportWithMeta = {
    ...report,
    savedAt: new Date().toISOString(),
    version: '1.0'
  };

  await fs.writeFile(filepath, JSON.stringify(reportWithMeta, null, 2), 'utf8');

  return filepath;
}

/**
 * Get the most recent morning report
 *
 * @returns {Promise<Object|null>} Most recent report or null if none exist
 */
async function getLastReport() {
  try {
    // Ensure directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });

    // List all report files
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first (YYYY-MM-DD sorts correctly)

    if (jsonFiles.length === 0) {
      return null;
    }

    // Read the most recent file
    const latestFile = path.join(DATA_DIR, jsonFiles[0]);
    const content = await fs.readFile(latestFile, 'utf8');

    return JSON.parse(content);
  } catch (error) {
    // Directory might not exist yet or be empty
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Get report by specific date
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>} Report for that date or null
 */
async function getReportByDate(dateStr) {
  try {
    const filepath = path.join(DATA_DIR, `${dateStr}.json`);
    const content = await fs.readFile(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Get all reports within a date range
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object[]>} Array of reports
 */
async function getReportsInRange(startDate, endDate) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const files = await fs.readdir(DATA_DIR);
    const reports = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const dateStr = file.replace('.json', '');
      if (dateStr >= startDate && dateStr <= endDate) {
        const filepath = path.join(DATA_DIR, file);
        const content = await fs.readFile(filepath, 'utf8');
        reports.push(JSON.parse(content));
      }
    }

    return reports.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete old reports (cleanup utility)
 *
 * @param {number} keepDays - Number of days to keep (default: 30)
 * @returns {Promise<number>} Number of reports deleted
 */
async function cleanupOldReports(keepDays = 30) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const files = await fs.readdir(DATA_DIR);
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const dateStr = file.replace('.json', '');
      if (dateStr < cutoffStr) {
        await fs.unlink(path.join(DATA_DIR, file));
        deleted++;
      }
    }

    return deleted;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

// Export all functions
module.exports = {
  generateReport,
  formatForWhatsApp,
  saveReport,
  getLastReport,
  getReportByDate,
  getReportsInRange,
  cleanupOldReports,
  DATA_DIR
};
