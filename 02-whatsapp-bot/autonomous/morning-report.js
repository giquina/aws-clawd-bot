/**
 * Morning Report Generator (Phase 4 - Proactive Intelligence)
 *
 * Generates the "surprise progress" report sent each morning after nightly
 * autonomous work. Creates exciting summaries of what ClawdBot accomplished
 * while the user slept.
 *
 * Enhanced features (v2.2):
 * - TODO.md status across all projects
 * - CI/CD failure detection
 * - PRs awaiting review
 * - Urgent company deadlines
 * - Smart prioritization recommendations
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

// Try to load optional lib modules (graceful degradation)
let projectManager = null;
let todoParser = null;
try {
    projectManager = require('../lib/project-manager');
} catch (e) {
    console.log('[MorningReport] project-manager not available:', e.message);
}
try {
    todoParser = require('../lib/todo-parser');
} catch (e) {
    console.log('[MorningReport] todo-parser not available:', e.message);
}

// Try to load GitHub automation for API access
let GitHubAutomation = null;
try {
    GitHubAutomation = require('../../03-github-automation/code-analyzer');
} catch (e) {
    console.log('[MorningReport] GitHub automation not available:', e.message);
}

// Try to load deadlines skill for company deadline data
let DeadlinesSkill = null;
try {
    DeadlinesSkill = require('../skills/deadlines');
} catch (e) {
    console.log('[MorningReport] Deadlines skill not available:', e.message);
}

// Data directory for storing reports
const DATA_DIR = path.join(__dirname, '..', 'data', 'morning-reports');

// Cache for TODO data to avoid hammering GitHub API
const todoCache = {
  data: null,
  timestamp: null,
  TTL_MS: 30 * 60 * 1000  // 30 minutes cache
};

/**
 * Generate a structured morning report from nightly work results
 *
 * Enhanced to include:
 * - TODO.md status for all projects
 * - CI/CD build status
 * - PRs awaiting review
 * - Urgent company deadlines
 * - Smart prioritization recommendations
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

  // Get repos from environment or provided results
  const reposEnv = process.env.REPOS_TO_MONITOR || '';
  const repos = reposEnv.split(',').map(r => r.trim()).filter(Boolean);

  // Fetch enhanced data in parallel (with graceful degradation)
  let todoSummary = [];
  let cicdStatus = [];
  let prsAwaitingReview = [];
  let urgentDeadlines = [];

  try {
    const [todoData, cicdData, prData, deadlineData] = await Promise.allSettled([
      getProjectTodoSummary(repos),
      checkCiCdStatus(repos),
      getPrsAwaitingReview(repos),
      getUrgentDeadlines()
    ]);

    if (todoData.status === 'fulfilled') todoSummary = todoData.value;
    if (cicdData.status === 'fulfilled') cicdStatus = cicdData.value;
    if (prData.status === 'fulfilled') prsAwaitingReview = prData.value;
    if (deadlineData.status === 'fulfilled') urgentDeadlines = deadlineData.value;
  } catch (err) {
    console.log('[MorningReport] Error fetching enhanced data:', err.message);
  }

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
    stats: _calculateStats(nightlyResults),
    // Phase 4: Proactive Intelligence additions
    todoSummary,
    cicdStatus,
    prsAwaitingReview,
    urgentDeadlines,
    priorityRecommendation: getPriorityRecommendation(todoSummary, cicdStatus, urgentDeadlines, prsAwaitingReview)
  };

  return report;
}

/**
 * Get TODO summary for all repos
 * Fetches and parses TODO.md files from each repository
 *
 * @param {string[]} repos - Array of repository names
 * @returns {Promise<Array>} Array of {repo, notStarted, inProgress, completed}
 */
async function getProjectTodoSummary(repos) {
  // Check cache first
  if (todoCache.data && todoCache.timestamp &&
      (Date.now() - todoCache.timestamp) < todoCache.TTL_MS) {
    console.log('[MorningReport] Using cached TODO data');
    return todoCache.data;
  }

  if (!GitHubAutomation || !repos || repos.length === 0) {
    return [];
  }

  const github = new GitHubAutomation();
  const summaries = [];

  for (const repoName of repos) {
    try {
      // Try to fetch TODO.md
      const response = await github.octokit.repos.getContent({
        owner: github.username,
        repo: repoName,
        path: 'TODO.md'
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      const parsed = parseTodoContent(content);

      summaries.push({
        repo: repoName,
        notStarted: parsed.notStarted,
        inProgress: parsed.inProgress,
        completed: parsed.completed,
        totalIncomplete: parsed.notStarted + parsed.inProgress
      });
    } catch (err) {
      // TODO.md doesn't exist or fetch failed - skip silently
      if (err.status !== 404) {
        console.log(`[MorningReport] Error fetching TODO for ${repoName}:`, err.message);
      }
    }
  }

  // Update cache
  todoCache.data = summaries;
  todoCache.timestamp = Date.now();

  return summaries;
}

/**
 * Parse TODO.md content to extract task counts
 * Supports checkbox syntax: [ ] not started, [x] or [X] completed, [-] or [~] in progress
 *
 * @param {string} content - Raw TODO.md content
 * @returns {Object} {notStarted, inProgress, completed}
 */
function parseTodoContent(content) {
  const lines = content.split('\n');
  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match checkbox patterns
    if (/^\s*[-*]\s*\[\s*\]/.test(trimmed) || /^\s*[-*]\s*\[ \]/.test(trimmed)) {
      // [ ] or [ ] - not started
      notStarted++;
    } else if (/^\s*[-*]\s*\[[xX]\]/.test(trimmed)) {
      // [x] or [X] - completed
      completed++;
    } else if (/^\s*[-*]\s*\[[-~]\]/.test(trimmed) || /^\s*[-*]\s*\[WIP\]/i.test(trimmed)) {
      // [-] or [~] or [WIP] - in progress
      inProgress++;
    }
  }

  return { notStarted, inProgress, completed };
}

/**
 * Check CI/CD status for repositories
 * Looks for failed workflow runs in the last 24 hours
 *
 * @param {string[]} repos - Array of repository names
 * @returns {Promise<Array>} Array of failed builds {repo, workflow, failedAt, url}
 */
async function checkCiCdStatus(repos) {
  if (!GitHubAutomation || !repos || repos.length === 0) {
    return [];
  }

  const github = new GitHubAutomation();
  const failures = [];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const repoName of repos) {
    try {
      // Get recent workflow runs
      const response = await github.octokit.actions.listWorkflowRunsForRepo({
        owner: github.username,
        repo: repoName,
        per_page: 10,
        status: 'failure'
      });

      for (const run of response.data.workflow_runs) {
        const runDate = new Date(run.created_at);
        if (runDate >= oneDayAgo) {
          failures.push({
            repo: repoName,
            workflow: run.name || 'Unknown workflow',
            failedAt: run.created_at,
            url: run.html_url,
            branch: run.head_branch
          });
        }
      }
    } catch (err) {
      // Actions might not be enabled or no permission - skip silently
      if (err.status !== 404 && err.status !== 403) {
        console.log(`[MorningReport] Error checking CI/CD for ${repoName}:`, err.message);
      }
    }
  }

  return failures;
}

/**
 * Get PRs that are awaiting review
 *
 * @param {string[]} repos - Array of repository names
 * @returns {Promise<Array>} Array of PRs {repo, number, title, author, createdAt, url}
 */
async function getPrsAwaitingReview(repos) {
  if (!GitHubAutomation || !repos || repos.length === 0) {
    return [];
  }

  const github = new GitHubAutomation();
  const prs = [];

  for (const repoName of repos) {
    try {
      const response = await github.octokit.pulls.list({
        owner: github.username,
        repo: repoName,
        state: 'open',
        per_page: 10
      });

      for (const pr of response.data) {
        // Check if PR has no reviews or is waiting for review
        try {
          const reviews = await github.octokit.pulls.listReviews({
            owner: github.username,
            repo: repoName,
            pull_number: pr.number
          });

          // Consider PR as "awaiting review" if no reviews or last review requested changes
          const hasApproval = reviews.data.some(r => r.state === 'APPROVED');
          const lastReview = reviews.data[reviews.data.length - 1];
          const needsReview = reviews.data.length === 0 ||
                             (lastReview && lastReview.state === 'CHANGES_REQUESTED');

          if (!hasApproval && needsReview) {
            prs.push({
              repo: repoName,
              number: pr.number,
              title: pr.title,
              author: pr.user.login,
              createdAt: pr.created_at,
              url: pr.html_url,
              daysSinceCreated: Math.floor((Date.now() - new Date(pr.created_at)) / (1000 * 60 * 60 * 24))
            });
          }
        } catch (reviewErr) {
          // If we can't get reviews, add the PR anyway
          prs.push({
            repo: repoName,
            number: pr.number,
            title: pr.title,
            author: pr.user.login,
            createdAt: pr.created_at,
            url: pr.html_url,
            daysSinceCreated: Math.floor((Date.now() - new Date(pr.created_at)) / (1000 * 60 * 60 * 24))
          });
        }
      }
    } catch (err) {
      if (err.status !== 404) {
        console.log(`[MorningReport] Error fetching PRs for ${repoName}:`, err.message);
      }
    }
  }

  return prs;
}

/**
 * Get urgent company deadlines (due within 7 days)
 *
 * @returns {Promise<Array>} Array of deadlines {company, type, dueDate, daysRemaining}
 */
async function getUrgentDeadlines() {
  if (!DeadlinesSkill) {
    return [];
  }

  try {
    const skill = new DeadlinesSkill();
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const urgentDeadlines = [];

    // Calculate deadlines for each company
    for (const [code, company] of Object.entries(skill.companies)) {
      const deadlines = skill.calculateCompanyDeadlines(company, now);

      for (const deadline of deadlines) {
        if (deadline.dueDate <= sevenDaysFromNow && deadline.dueDate >= now) {
          const daysRemaining = Math.ceil((deadline.dueDate - now) / (1000 * 60 * 60 * 24));
          urgentDeadlines.push({
            company: code,
            companyName: company.name,
            type: deadline.type,
            dueDate: deadline.dueDate.toISOString().split('T')[0],
            daysRemaining
          });
        }
      }
    }

    // Sort by due date (earliest first)
    urgentDeadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return urgentDeadlines;
  } catch (err) {
    console.log('[MorningReport] Error getting deadlines:', err.message);
    return [];
  }
}

/**
 * Get priority recommendation based on all available data
 * Analyzes TODO status, failures, deadlines and provides actionable guidance
 *
 * @param {Array} todoSummary - TODO status for each project
 * @param {Array} failures - CI/CD failures
 * @param {Array} deadlines - Urgent company deadlines
 * @param {Array} prs - PRs awaiting review
 * @returns {string|null} Priority recommendation or null
 */
function getPriorityRecommendation(todoSummary, failures, deadlines, prs) {
  // Priority order:
  // 1. CI/CD failures (blocking)
  // 2. Company deadlines within 3 days
  // 3. PRs waiting > 3 days
  // 4. In-progress TODO items
  // 5. High-count TODO projects

  // Check for CI/CD failures first
  if (failures && failures.length > 0) {
    const mostRecent = failures[0];
    return `Fix build failure on ${mostRecent.repo} (${mostRecent.workflow})`;
  }

  // Check for urgent deadlines (3 days or less)
  if (deadlines && deadlines.length > 0) {
    const urgent = deadlines.filter(d => d.daysRemaining <= 3);
    if (urgent.length > 0) {
      const first = urgent[0];
      return `${first.company} ${first.type} due in ${first.daysRemaining} day(s)`;
    }
  }

  // Check for stale PRs
  if (prs && prs.length > 0) {
    const stalePRs = prs.filter(pr => pr.daysSinceCreated >= 3);
    if (stalePRs.length > 0) {
      const oldest = stalePRs[0];
      return `Review PR #${oldest.number} on ${oldest.repo} (${oldest.daysSinceCreated} days old)`;
    }
  }

  // Check for in-progress TODO items
  if (todoSummary && todoSummary.length > 0) {
    const withInProgress = todoSummary.filter(t => t.inProgress > 0);
    if (withInProgress.length > 0) {
      // Find repo with most in-progress items
      withInProgress.sort((a, b) => b.inProgress - a.inProgress);
      const top = withInProgress[0];
      return `Continue work on ${top.repo} (${top.inProgress} task(s) in progress)`;
    }

    // Otherwise recommend the project with most incomplete tasks
    const withTasks = todoSummary.filter(t => t.totalIncomplete > 0);
    if (withTasks.length > 0) {
      withTasks.sort((a, b) => b.totalIncomplete - a.totalIncomplete);
      const top = withTasks[0];
      return `Start with ${top.repo} (${top.totalIncomplete} task(s) remaining)`;
    }
  }

  // Check for any PRs that need review
  if (prs && prs.length > 0) {
    return `Review PR #${prs[0].number} on ${prs[0].repo}`;
  }

  return null;
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
 * Enhanced with TODO status, CI/CD alerts, and smart recommendations
 * Keeps message under 1500 characters for reliable delivery
 *
 * @param {Object} report - Structured report from generateReport()
 * @returns {string} WhatsApp-formatted message
 */
function formatForWhatsApp(report) {
  const lines = [];
  const stats = report.stats;

  // New exciting header with date
  const dateFormatted = _formatReportDate(report.date);
  lines.push(`*MORNING BRIEF - ${dateFormatted}*`);
  lines.push('');

  // PROJECT STATUS section (new in Phase 4)
  if (report.todoSummary && report.todoSummary.length > 0) {
    lines.push('*PROJECT STATUS:*');
    report.todoSummary.forEach(project => {
      if (project.totalIncomplete === 0) {
        lines.push(`• ${project.repo.toUpperCase()}: All done!`);
      } else if (project.inProgress > 0) {
        lines.push(`• ${project.repo.toUpperCase()}: ${project.totalIncomplete} tasks (${project.inProgress} in progress)`);
      } else {
        lines.push(`• ${project.repo.toUpperCase()}: ${project.notStarted} tasks left`);
      }
    });
    lines.push('');
  }

  // ATTENTION NEEDED section (new in Phase 4) - CI failures, PRs, deadlines
  const attentionItems = [];

  // Add CI/CD failures
  if (report.cicdStatus && report.cicdStatus.length > 0) {
    report.cicdStatus.slice(0, 2).forEach(failure => {
      const time = _formatTime(failure.failedAt);
      attentionItems.push(`Build failed on ${failure.repo} at ${time}`);
    });
  }

  // Add PRs awaiting review
  if (report.prsAwaitingReview && report.prsAwaitingReview.length > 0) {
    report.prsAwaitingReview.slice(0, 2).forEach(pr => {
      attentionItems.push(`PR #${pr.number} on ${pr.repo} needs review`);
    });
  }

  // Add urgent deadlines
  if (report.urgentDeadlines && report.urgentDeadlines.length > 0) {
    report.urgentDeadlines.slice(0, 2).forEach(deadline => {
      if (deadline.daysRemaining <= 3) {
        attentionItems.push(`${deadline.company} ${deadline.type} due in ${deadline.daysRemaining} day(s)`);
      }
    });
  }

  if (attentionItems.length > 0) {
    lines.push('*ATTENTION NEEDED:*');
    attentionItems.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }

  // OVERNIGHT section - what was accomplished
  if (stats.totalTasksCompleted > 0 || stats.prsCreated > 0 || stats.commitsMade > 0) {
    lines.push('*OVERNIGHT:*');
    if (stats.totalTasksCompleted > 0) {
      lines.push(`• Completed: ${stats.totalTasksCompleted} task(s)`);
    }
    if (stats.commitsMade > 0) {
      lines.push(`• Commits: ${stats.commitsMade}`);
    }
    if (stats.prsCreated > 0) {
      lines.push(`• PRs created: ${stats.prsCreated}`);
    }

    // Show top 2 completed tasks
    if (report.tasksCompleted.length > 0) {
      report.tasksCompleted.slice(0, 2).forEach(task => {
        const icon = _getTaskIcon(task.type);
        lines.push(`  ${icon} ${task.description}`);
      });
    }
    lines.push('');
  }

  // Queued tasks needing approval (top 2 max)
  if (report.tasksQueued.length > 0) {
    lines.push('*NEEDS APPROVAL:*');
    const displayQueued = report.tasksQueued.slice(0, 2);
    displayQueued.forEach(task => {
      lines.push(`• ${task.description}`);
    });
    if (report.tasksQueued.length > 2) {
      lines.push(`  _+${report.tasksQueued.length - 2} more pending..._`);
    }
    lines.push('');
  }

  // Key insights (if any)
  if (report.insights.length > 0) {
    lines.push('*DISCOVERED:*');
    report.insights.slice(0, 2).forEach(insight => {
      lines.push(`• ${insight}`);
    });
    lines.push('');
  }

  // Blockers (if any)
  if (report.blockers.length > 0) {
    lines.push('*BLOCKERS:*');
    report.blockers.slice(0, 2).forEach(blocker => {
      lines.push(`• ${blocker}`);
    });
    lines.push('');
  }

  // RECOMMENDATION section (enhanced with smart prioritization)
  const recommendation = report.priorityRecommendation || (report.recommendations && report.recommendations[0]);
  if (recommendation) {
    lines.push('*RECOMMENDATION:*');
    lines.push(recommendation);
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
 * Format date for report header
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date like "Feb 1, 2025"
 * @private
 */
function _formatReportDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format time for display
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted time like "2:14 AM"
 * @private
 */
function _formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
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
  // Core report functions
  generateReport,
  formatForWhatsApp,
  saveReport,
  getLastReport,
  getReportByDate,
  getReportsInRange,
  cleanupOldReports,
  DATA_DIR,

  // Phase 4: Proactive Intelligence functions (for testing/external use)
  getProjectTodoSummary,
  checkCiCdStatus,
  getPrsAwaitingReview,
  getUrgentDeadlines,
  getPriorityRecommendation,
  parseTodoContent,

  // Cache control
  clearTodoCache: () => {
    todoCache.data = null;
    todoCache.timestamp = null;
  }
};
