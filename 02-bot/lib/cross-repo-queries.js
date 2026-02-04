/**
 * Cross-Repo Queries - Aggregated data access across all repositories
 *
 * Provides methods for querying TODO.md, CI status, and other data
 * across all monitored repositories. Used by HQ commands skill and
 * aggregated morning briefs.
 *
 * @module lib/cross-repo-queries
 */

const projectManager = require('./project-manager');
const todoParser = require('./todo-parser');
const { Octokit } = require('@octokit/rest');

// Initialize Octokit
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Cache for cross-repo data
const cache = {
  data: {},
  set(key, value, ttlMinutes = 30) {
    this.data[key] = {
      value,
      expires: Date.now() + (ttlMinutes * 60 * 1000)
    };
  },
  get(key) {
    const item = this.data[key];
    if (!item) return null;
    if (Date.now() > item.expires) {
      delete this.data[key];
      return null;
    }
    return item.value;
  },
  clear() {
    this.data = {};
  }
};

/**
 * Cross-Repo Queries API
 */
class CrossRepoQueries {
  constructor() {
    this.username = process.env.GITHUB_USERNAME || 'giquina';
  }

  /**
   * Get list of monitored repos from environment
   * @returns {string[]} Array of repo names
   */
  getMonitoredRepos() {
    const reposEnv = process.env.REPOS_TO_MONITOR || '';
    return reposEnv.split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);
  }

  /**
   * Get the most urgent task across all repos
   * Priority order: in-progress > not-started (by section order)
   *
   * @returns {Promise<Object|null>} Most urgent task with repo name
   */
  async getMostUrgentTask() {
    const repos = this.getMonitoredRepos();
    if (repos.length === 0) return null;

    // Check cache
    const cached = cache.get('most-urgent-task');
    if (cached) return cached;

    let mostUrgent = null;

    for (const repo of repos) {
      try {
        const todoContent = await projectManager.fetchTodoMd(this.username, repo);
        if (!todoContent) continue;

        const parsed = todoParser.parseTodoMd(todoContent);
        const tasks = parsed.tasks;

        // Find in-progress tasks first (highest priority)
        const inProgress = tasks.filter(t => t.status === todoParser.TaskStatus.IN_PROGRESS);
        if (inProgress.length > 0) {
          mostUrgent = {
            repo,
            task: inProgress[0],
            priority: 'in_progress',
            totalPending: parsed.stats.not_started + parsed.stats.in_progress
          };
          break; // In-progress is highest priority, no need to continue
        }

        // Otherwise track not-started tasks
        const notStarted = tasks.filter(t => t.status === todoParser.TaskStatus.NOT_STARTED);
        if (notStarted.length > 0 && !mostUrgent) {
          mostUrgent = {
            repo,
            task: notStarted[0],
            priority: 'not_started',
            totalPending: parsed.stats.not_started + parsed.stats.in_progress
          };
        }
      } catch (err) {
        console.log(`[CrossRepoQueries] Error fetching TODO for ${repo}:`, err.message);
      }
    }

    // Cache for 15 minutes
    if (mostUrgent) {
      cache.set('most-urgent-task', mostUrgent, 15);
    }

    return mostUrgent;
  }

  /**
   * Get summary of all projects with task counts
   *
   * @returns {Promise<Array>} Array of project summaries
   */
  async getAllProjectsSummary() {
    const repos = this.getMonitoredRepos();
    if (repos.length === 0) return [];

    // Check cache
    const cached = cache.get('all-projects-summary');
    if (cached) return cached;

    const summaries = [];

    // Fetch in parallel with Promise.allSettled for resilience
    const promises = repos.map(async (repo) => {
      try {
        // Fetch TODO.md
        const todoContent = await projectManager.fetchTodoMd(this.username, repo);

        // Fetch repo info for last activity
        let lastActivity = null;
        try {
          const repoInfo = await octokit.repos.get({
            owner: this.username,
            repo
          });
          lastActivity = repoInfo.data.pushed_at;
        } catch (e) {
          // Ignore - repo info not critical
        }

        if (todoContent) {
          const parsed = todoParser.parseTodoMd(todoContent);
          return {
            repo,
            completedTasks: parsed.stats.completed,
            pendingTasks: parsed.stats.not_started + parsed.stats.in_progress,
            inProgressTasks: parsed.stats.in_progress,
            totalTasks: parsed.stats.total,
            percentComplete: parsed.stats.total > 0
              ? Math.round((parsed.stats.completed / parsed.stats.total) * 100)
              : 0,
            lastActivity,
            hasTodo: true
          };
        } else {
          return {
            repo,
            completedTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0,
            totalTasks: 0,
            percentComplete: 0,
            lastActivity,
            hasTodo: false
          };
        }
      } catch (err) {
        console.log(`[CrossRepoQueries] Error processing ${repo}:`, err.message);
        return {
          repo,
          error: err.message,
          hasTodo: false
        };
      }
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        summaries.push(result.value);
      }
    }

    // Sort by pending tasks (most first), then by in-progress
    summaries.sort((a, b) => {
      // Prioritize repos with in-progress tasks
      if (a.inProgressTasks !== b.inProgressTasks) {
        return b.inProgressTasks - a.inProgressTasks;
      }
      // Then by pending tasks
      return b.pendingTasks - a.pendingTasks;
    });

    // Cache for 30 minutes
    cache.set('all-projects-summary', summaries, 30);

    return summaries;
  }

  /**
   * Search for tasks by keyword across all repos
   *
   * @param {string} keyword - Search keyword
   * @returns {Promise<Array>} Array of matching tasks with repo
   */
  async searchTasks(keyword) {
    const repos = this.getMonitoredRepos();
    if (repos.length === 0) return [];

    const normalizedKeyword = keyword.toLowerCase().trim();
    const matches = [];

    for (const repo of repos) {
      try {
        const todoContent = await projectManager.fetchTodoMd(this.username, repo);
        if (!todoContent) continue;

        const parsed = todoParser.parseTodoMd(todoContent);

        for (const task of parsed.tasks) {
          if (task.text.toLowerCase().includes(normalizedKeyword)) {
            matches.push({
              repo,
              task: task.text,
              status: task.status,
              section: task.section
            });
          }
        }
      } catch (err) {
        console.log(`[CrossRepoQueries] Error searching ${repo}:`, err.message);
      }
    }

    return matches;
  }

  /**
   * Get aggregated data for morning brief
   *
   * @returns {Promise<Object>} Aggregated brief data
   */
  async getAggregatedBrief() {
    const [
      projectSummaries,
      urgentTask,
      urgentItems
    ] = await Promise.all([
      this.getAllProjectsSummary(),
      this.getMostUrgentTask(),
      this.getUrgentItems()
    ]);

    // Calculate aggregated stats
    const totalPending = projectSummaries.reduce((sum, p) => sum + p.pendingTasks, 0);
    const totalInProgress = projectSummaries.reduce((sum, p) => sum + p.inProgressTasks, 0);
    const totalCompleted = projectSummaries.reduce((sum, p) => sum + p.completedTasks, 0);
    const activeProjects = projectSummaries.filter(p => p.pendingTasks > 0 || p.inProgressTasks > 0);

    return {
      date: new Date().toISOString().split('T')[0],
      stats: {
        totalProjects: projectSummaries.length,
        activeProjects: activeProjects.length,
        totalPending,
        totalInProgress,
        totalCompleted
      },
      projectSummaries,
      urgentTask,
      urgentItems,
      recommendation: this.generateRecommendation(urgentTask, urgentItems, projectSummaries)
    };
  }

  /**
   * Get all urgent items (overdue, failed CI, PRs waiting)
   *
   * @returns {Promise<Object>} Urgent items by category
   */
  async getUrgentItems() {
    const repos = this.getMonitoredRepos();

    // Check cache
    const cached = cache.get('urgent-items');
    if (cached) return cached;

    const urgentItems = {
      ciFailures: [],
      stalePRs: [],
      urgentTasks: []
    };

    // Check CI status for each repo
    for (const repo of repos) {
      try {
        // Get recent workflow runs
        const runs = await octokit.actions.listWorkflowRunsForRepo({
          owner: this.username,
          repo,
          per_page: 5,
          status: 'failure'
        });

        // Only include failures from last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        for (const run of runs.data.workflow_runs || []) {
          const runDate = new Date(run.created_at);
          if (runDate >= oneDayAgo) {
            urgentItems.ciFailures.push({
              repo,
              workflow: run.name,
              branch: run.head_branch,
              failedAt: run.created_at,
              url: run.html_url
            });
          }
        }
      } catch (err) {
        // Actions might not be enabled - ignore
        if (err.status !== 404 && err.status !== 403) {
          console.log(`[CrossRepoQueries] Error checking CI for ${repo}:`, err.message);
        }
      }

      // Check for stale PRs (older than 3 days)
      try {
        const prs = await octokit.pulls.list({
          owner: this.username,
          repo,
          state: 'open',
          per_page: 10
        });

        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        for (const pr of prs.data) {
          const prDate = new Date(pr.created_at);
          if (prDate < threeDaysAgo) {
            urgentItems.stalePRs.push({
              repo,
              number: pr.number,
              title: pr.title,
              author: pr.user.login,
              daysOld: Math.floor((Date.now() - prDate) / (1000 * 60 * 60 * 24)),
              url: pr.html_url
            });
          }
        }
      } catch (err) {
        if (err.status !== 404) {
          console.log(`[CrossRepoQueries] Error checking PRs for ${repo}:`, err.message);
        }
      }

      // Check for tasks marked urgent in TODO
      try {
        const todoContent = await projectManager.fetchTodoMd(this.username, repo);
        if (todoContent) {
          const parsed = todoParser.parseTodoMd(todoContent);
          for (const task of parsed.tasks) {
            // Look for urgent markers
            if (task.status !== todoParser.TaskStatus.COMPLETED &&
                (task.text.toLowerCase().includes('urgent') ||
                 task.text.toLowerCase().includes('asap') ||
                 task.text.toLowerCase().includes('critical') ||
                 task.section.toLowerCase().includes('urgent'))) {
              urgentItems.urgentTasks.push({
                repo,
                task: task.text,
                section: task.section,
                status: task.status
              });
            }
          }
        }
      } catch (err) {
        // Ignore TODO fetch errors
      }
    }

    // Cache for 15 minutes
    cache.set('urgent-items', urgentItems, 15);

    return urgentItems;
  }

  /**
   * Generate a priority recommendation based on data
   *
   * @param {Object} urgentTask - Most urgent task
   * @param {Object} urgentItems - Urgent items
   * @param {Array} summaries - Project summaries
   * @returns {string|null} Recommendation text
   */
  generateRecommendation(urgentTask, urgentItems, summaries) {
    // Priority 1: CI failures
    if (urgentItems.ciFailures && urgentItems.ciFailures.length > 0) {
      const failure = urgentItems.ciFailures[0];
      return `Fix CI failure on ${failure.repo} (${failure.workflow})`;
    }

    // Priority 2: Urgent tasks
    if (urgentItems.urgentTasks && urgentItems.urgentTasks.length > 0) {
      const task = urgentItems.urgentTasks[0];
      return `Urgent task on ${task.repo}: ${task.task.substring(0, 50)}...`;
    }

    // Priority 3: Stale PRs
    if (urgentItems.stalePRs && urgentItems.stalePRs.length > 0) {
      const pr = urgentItems.stalePRs[0];
      return `Review PR #${pr.number} on ${pr.repo} (${pr.daysOld} days old)`;
    }

    // Priority 4: In-progress task
    if (urgentTask && urgentTask.priority === 'in_progress') {
      return `Continue work on ${urgentTask.repo}: ${urgentTask.task.text.substring(0, 50)}...`;
    }

    // Priority 5: Project with most pending tasks
    if (summaries && summaries.length > 0) {
      const topProject = summaries.find(s => s.pendingTasks > 0);
      if (topProject) {
        return `Focus on ${topProject.repo} (${topProject.pendingTasks} tasks pending)`;
      }
    }

    return null;
  }

  /**
   * Get task completion rate across all repos
   *
   * @returns {Promise<Object>} Completion rate stats
   */
  async getCompletionRate() {
    const summaries = await this.getAllProjectsSummary();

    const totalTasks = summaries.reduce((sum, p) => sum + p.totalTasks, 0);
    const completedTasks = summaries.reduce((sum, p) => sum + p.completedTasks, 0);

    return {
      totalTasks,
      completedTasks,
      pendingTasks: totalTasks - completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      projectCount: summaries.length,
      activeProjects: summaries.filter(p => p.pendingTasks > 0).length
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    cache.clear();
    console.log('[CrossRepoQueries] Cache cleared');
  }

  /**
   * Format summary for WhatsApp
   *
   * @param {Array} summaries - Project summaries
   * @returns {string} Formatted message
   */
  formatSummaryForWhatsApp(summaries) {
    if (!summaries || summaries.length === 0) {
      return 'No project data available.';
    }

    let output = '*ALL PROJECTS STATUS*\n';
    output += '\u2501'.repeat(20) + '\n\n';

    // Stats header
    const totalPending = summaries.reduce((sum, p) => sum + p.pendingTasks, 0);
    const totalInProgress = summaries.reduce((sum, p) => sum + p.inProgressTasks, 0);
    const activeCount = summaries.filter(p => p.pendingTasks > 0 || p.inProgressTasks > 0).length;

    output += `*Overview:*\n`;
    output += `Projects: ${summaries.length} | Active: ${activeCount}\n`;
    output += `Pending: ${totalPending} | In Progress: ${totalInProgress}\n\n`;

    // Project list
    for (const project of summaries) {
      if (!project.hasTodo) {
        output += `\u25CB ${project.repo}: No TODO.md\n`;
        continue;
      }

      const icon = project.inProgressTasks > 0 ? '\uD83D\uDFE1' :
                   project.pendingTasks > 0 ? '\u2B1C' : '\u2705';

      output += `${icon} *${project.repo}*\n`;
      output += `   ${project.pendingTasks} pending | ${project.inProgressTasks} in progress | ${project.percentComplete}% done\n`;
    }

    return output;
  }
}

module.exports = new CrossRepoQueries();
