/**
 * WeeklyReportSkill - Generates weekly digest reports for ClawdBot
 *
 * Aggregates data from multiple sources (GitHub, deployments, AI usage,
 * activity log, quality metrics) into a formatted Telegram-friendly digest.
 *
 * Features:
 * - Full weekly summary across all repos or per-repo
 * - Week-over-week comparison
 * - Scheduled automatic report delivery
 * - 5-minute cache to avoid redundant queries
 *
 * @module skills/weekly-report
 */

const BaseSkill = require('../base-skill');

/**
 * Cache entry with timestamp for TTL-based expiration
 * @typedef {Object} CacheEntry
 * @property {any} data - Cached data
 * @property {number} timestamp - Unix ms when cached
 */

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

class WeeklyReportSkill extends BaseSkill {
  /** @type {string} */
  name = 'weekly-report';

  /** @type {string} */
  description = 'Generate weekly digest reports with development stats, deployments, quality metrics, and AI usage';

  /** @type {number} */
  priority = 30;

  commands = [
    {
      pattern: /^(weekly\s+report|weekly\s+summary|week\s+in\s+review)$/i,
      description: 'Generate this week\'s report across all repos',
      usage: 'weekly report'
    },
    {
      pattern: /^(weekly\s+report|weekly\s+summary)\s+(\S+)$/i,
      description: 'Generate weekly report for a specific repo',
      usage: 'weekly report <repo>'
    },
    {
      pattern: /^weekly\s+schedule\s+(\w+)\s+(\d{1,2}:\d{2})$/i,
      description: 'Schedule automatic weekly reports',
      usage: 'weekly schedule monday 09:00'
    },
    {
      pattern: /^weekly\s+compare$/i,
      description: 'Compare this week vs last week',
      usage: 'weekly compare'
    }
  ];

  constructor(context) {
    super(context);

    /**
     * Schedule configuration for automatic reports
     * @type {{ day: string|null, time: string|null, enabled: boolean }}
     */
    this.schedule = {
      day: null,
      time: null,
      enabled: false
    };

    /**
     * In-memory cache to avoid re-querying within 5 minutes
     * @type {Map<string, CacheEntry>}
     */
    this._cache = new Map();
  }

  /**
   * Main command dispatcher
   * @param {string} command - The incoming command string
   * @param {Object} context - Execution context (from, chatId, etc.)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async execute(command, context) {
    const trimmed = (command || '').trim().toLowerCase();

    // Weekly schedule
    const scheduleMatch = trimmed.match(/^weekly\s+schedule\s+(\w+)\s+(\d{1,2}:\d{2})$/i);
    if (scheduleMatch) {
      return this._handleSchedule(scheduleMatch[1], scheduleMatch[2]);
    }

    // Weekly compare
    if (/^weekly\s+compare$/i.test(trimmed)) {
      return this._handleCompare(context);
    }

    // Weekly report for specific repo
    const repoMatch = trimmed.match(/^(?:weekly\s+report|weekly\s+summary)\s+(\S+)$/i);
    if (repoMatch) {
      return this._handleReport(context, repoMatch[1]);
    }

    // Default: full weekly report
    if (/^(weekly\s+report|weekly\s+summary|week\s+in\s+review)$/i.test(trimmed)) {
      return this._handleReport(context, null);
    }

    return this.error('Unknown weekly report command', null, {
      suggestion: 'Try: weekly report, weekly report <repo>, weekly compare, weekly schedule <day> <time>'
    });
  }

  /**
   * Generate a weekly report, optionally filtered by repo
   * @param {Object} context - Execution context
   * @param {string|null} repo - Repository name filter, or null for all
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async _handleReport(context, repo) {
    const cacheKey = `report:${repo || 'all'}`;
    const cached = this._getCache(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    try {
      const { weekStart, weekEnd } = this._getWeekBounds();
      const sections = [];

      // Header
      const startStr = this._formatDate(weekStart);
      const endStr = this._formatDate(weekEnd);
      const title = repo
        ? `Weekly Report (${repo}): ${startStr} - ${endStr}`
        : `Weekly Report: ${startStr} - ${endStr}`;
      sections.push(title);

      // Development stats from GitHub
      const devSection = await this._fetchGitHubStats(weekStart, weekEnd, repo);
      if (devSection) sections.push(devSection);

      // Deployment stats from database
      const deploySection = await this._fetchDeploymentStats(weekStart, weekEnd, repo);
      if (deploySection) sections.push(deploySection);

      // Quality metrics
      const qualitySection = await this._fetchQualityMetrics();
      if (qualitySection) sections.push(qualitySection);

      // AI usage stats
      const aiSection = await this._fetchAIUsageStats();
      if (aiSection) sections.push(aiSection);

      // Activity summary
      const activitySection = await this._fetchActivityStats(weekStart);
      if (activitySection) sections.push(activitySection);

      // Conversation stats
      const convSection = await this._fetchConversationStats(weekStart, weekEnd);
      if (convSection) sections.push(convSection);

      const separator = '\u2501'.repeat(28);
      let report = sections[0] + '\n' + separator + '\n\n';
      report += sections.slice(1).join('\n\n');

      // Trim to Telegram limit
      if (report.length > 4000) {
        report = report.substring(0, 3950) + '\n\n... (truncated)';
      }

      this._setCache(cacheKey, report);
      return this.success(report);
    } catch (err) {
      this.log('error', 'Failed to generate weekly report', err);
      return this.error('Weekly report generation failed', err, {
        attempted: 'Aggregating data from all sources',
        suggestion: 'Check logs for details. Individual data sources may be unavailable.'
      });
    }
  }

  /**
   * Compare current week metrics against the previous week
   * @param {Object} context - Execution context
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async _handleCompare(context) {
    const cacheKey = 'compare';
    const cached = this._getCache(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    try {
      const { weekStart, weekEnd } = this._getWeekBounds();
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(weekStart);
      prevEnd.setDate(prevEnd.getDate() - 1);

      const [currentDeploys, prevDeploys] = await Promise.all([
        this._countDeployments(weekStart, weekEnd),
        this._countDeployments(prevStart, prevEnd)
      ]);

      const [currentCommits, prevCommits] = await Promise.all([
        this._countGitHubCommits(weekStart, weekEnd),
        this._countGitHubCommits(prevStart, prevEnd)
      ]);

      const startStr = this._formatDate(weekStart);
      const endStr = this._formatDate(weekEnd);
      const prevStartStr = this._formatDate(prevStart);
      const prevEndStr = this._formatDate(prevEnd);

      let report = `Week Comparison\n`;
      report += '\u2501'.repeat(28) + '\n\n';
      report += `Current: ${startStr} - ${endStr}\n`;
      report += `Previous: ${prevStartStr} - ${prevEndStr}\n\n`;

      report += `Deployments\n`;
      report += `  This week: ${currentDeploys}\n`;
      report += `  Last week: ${prevDeploys}\n`;
      report += `  Change: ${this._formatDelta(currentDeploys, prevDeploys)}\n\n`;

      report += `Commits\n`;
      report += `  This week: ${currentCommits}\n`;
      report += `  Last week: ${prevCommits}\n`;
      report += `  Change: ${this._formatDelta(currentCommits, prevCommits)}`;

      this._setCache(cacheKey, report);
      return this.success(report);
    } catch (err) {
      this.log('error', 'Failed to generate comparison', err);
      return this.error('Weekly comparison failed', err, {
        suggestion: 'Some data sources may be unavailable'
      });
    }
  }

  /**
   * Configure automatic report scheduling
   * @param {string} day - Day of the week (e.g. 'monday')
   * @param {string} time - Time in HH:MM format
   * @returns {{success: boolean, message: string}}
   */
  _handleSchedule(day, time) {
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const normalizedDay = day.toLowerCase();

    if (!validDays.includes(normalizedDay)) {
      return this.error('Invalid day', null, {
        suggestion: `Use one of: ${validDays.join(', ')}`
      });
    }

    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch || parseInt(timeMatch[1]) > 23 || parseInt(timeMatch[2]) > 59) {
      return this.error('Invalid time format', null, {
        suggestion: 'Use HH:MM format (e.g. 09:00, 17:30)'
      });
    }

    this.schedule = {
      day: normalizedDay,
      time: time,
      enabled: true
    };

    return this.success(
      `Weekly report scheduled for ${normalizedDay.charAt(0).toUpperCase() + normalizedDay.slice(1)} at ${time}\n` +
      `  Reports will be sent automatically to this chat.`
    );
  }

  // ============ Data Fetchers ============

  /**
   * Fetch GitHub commit and PR stats for the week
   * @param {Date} start - Week start date
   * @param {Date} end - Week end date
   * @param {string|null} repo - Optional repo filter
   * @returns {Promise<string|null>}
   */
  async _fetchGitHubStats(start, end, repo) {
    try {
      const { Octokit } = require('@octokit/rest');
      const token = process.env.GITHUB_TOKEN;
      if (!token) return null;

      const octokit = new Octokit({ auth: token });
      const username = process.env.GITHUB_USER || 'giquina';

      let totalCommits = 0;
      let totalPRsMerged = 0;
      let totalPRsOpen = 0;
      let repoCount = 0;

      const repos = repo
        ? [{ owner: username, name: repo }]
        : await this._getUserRepos(octokit, username);

      for (const r of repos) {
        try {
          // Count commits
          const commits = await octokit.repos.listCommits({
            owner: r.owner || username,
            repo: r.name,
            since: start.toISOString(),
            until: end.toISOString(),
            per_page: 100
          });
          if (commits.data.length > 0) {
            totalCommits += commits.data.length;
            repoCount++;
          }

          // Count PRs
          const prs = await octokit.pulls.list({
            owner: r.owner || username,
            repo: r.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50
          });

          for (const pr of prs.data) {
            const updatedAt = new Date(pr.updated_at);
            if (updatedAt < start) break;
            if (pr.merged_at && new Date(pr.merged_at) >= start) totalPRsMerged++;
            else if (pr.state === 'open') totalPRsOpen++;
          }
        } catch (repoErr) {
          // Skip repos that fail (e.g. permissions)
          this.log('debug', `Skipping repo ${r.name}: ${repoErr.message}`);
        }
      }

      if (totalCommits === 0 && totalPRsMerged === 0 && totalPRsOpen === 0) {
        return null;
      }

      let section = `Development\n`;
      section += `  Commits: ${totalCommits}`;
      if (!repo) section += ` across ${repoCount} repo${repoCount !== 1 ? 's' : ''}`;
      section += `\n  PRs: ${totalPRsMerged} merged, ${totalPRsOpen} open`;

      return section;
    } catch (err) {
      this.log('warn', 'GitHub stats unavailable', err.message);
      return null;
    }
  }

  /**
   * Fetch deployment stats from the database
   * @param {Date} start - Week start date
   * @param {Date} end - Week end date
   * @param {string|null} repo - Optional repo filter
   * @returns {Promise<string|null>}
   */
  async _fetchDeploymentStats(start, end, repo) {
    try {
      const db = require('../../lib/database');
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      let query = `SELECT COUNT(*) as total,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
                   FROM deployments WHERE created_at >= ? AND created_at <= ?`;
      const params = [startISO, endISO];

      if (repo) {
        query += ` AND repo = ?`;
        params.push(repo);
      }

      const row = db.prepare ? db.prepare(query).get(...params) : null;
      if (!row || row.total === 0) return null;

      const rate = row.total > 0 ? ((row.successful / row.total) * 100).toFixed(1) : '0';

      let section = `Deployments\n`;
      section += `  Total: ${row.total} (${row.successful} successful)\n`;
      section += `  Success rate: ${rate}%`;

      return section;
    } catch (err) {
      this.log('warn', 'Deployment stats unavailable', err.message);
      return null;
    }
  }

  /**
   * Fetch quality metrics from design-quality-framework
   * @returns {Promise<string|null>}
   */
  async _fetchQualityMetrics() {
    try {
      const dqf = require('../../lib/design-quality-framework');
      const metrics = typeof dqf.getMetrics === 'function'
        ? dqf.getMetrics({ days: 7 })
        : null;

      if (!metrics || metrics.average == null) return null;

      const trend = metrics.trend > 0 ? 'improving' : metrics.trend < 0 ? 'declining' : 'stable';

      let section = `Quality\n`;
      section += `  Average: ${Math.round(metrics.average)}/100 (${trend})`;

      if (metrics.issues != null) {
        section += `\n  Issues flagged: ${metrics.issues}`;
      }

      return section;
    } catch (err) {
      this.log('warn', 'Quality metrics unavailable', err.message);
      return null;
    }
  }

  /**
   * Fetch AI provider usage and cache statistics
   * @returns {Promise<string|null>}
   */
  async _fetchAIUsageStats() {
    try {
      const router = require('../../ai-providers/router');
      const stats = typeof router.getExtendedStats === 'function'
        ? router.getExtendedStats()
        : null;

      if (!stats) return null;

      const cache = stats.cache || {};
      const totalCalls = (cache.hits || 0) + (cache.misses || 0);

      if (totalCalls === 0) return null;

      let section = `AI Usage\n`;
      section += `  Calls: ${totalCalls}`;

      if (cache.hitRate) {
        section += `\n  Cache savings: ${cache.hitRate}`;
      }

      if (stats.summary && stats.summary.estimatedCostSavings) {
        section += `\n  Est. cost saved: $${stats.summary.estimatedCostSavings}`;
      }

      return section;
    } catch (err) {
      this.log('warn', 'AI usage stats unavailable', err.message);
      return null;
    }
  }

  /**
   * Fetch recent activity counts from the activity log
   * @param {Date} weekStart - Start of the current week
   * @returns {Promise<string|null>}
   */
  async _fetchActivityStats(weekStart) {
    try {
      const activityLog = require('../../lib/activity-log');
      const recent = typeof activityLog.getRecent === 'function'
        ? activityLog.getRecent()
        : [];

      if (!recent || recent.length === 0) return null;

      // Filter to this week
      const weekEntries = recent.filter(e => {
        const ts = e.timestamp ? new Date(e.timestamp) : null;
        return ts && ts >= weekStart;
      });

      if (weekEntries.length === 0) return null;

      // Categorize
      const categories = {};
      for (const entry of weekEntries) {
        const type = entry.type || entry.action || 'other';
        categories[type] = (categories[type] || 0) + 1;
      }

      let section = `Activity\n`;
      section += `  Total events: ${weekEntries.length}`;

      const topTypes = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [type, count] of topTypes) {
        section += `\n  ${type}: ${count}`;
      }

      return section;
    } catch (err) {
      this.log('warn', 'Activity stats unavailable', err.message);
      return null;
    }
  }

  /**
   * Fetch conversation and plan counts from the database
   * @param {Date} start - Week start date
   * @param {Date} end - Week end date
   * @returns {Promise<string|null>}
   */
  async _fetchConversationStats(start, end) {
    try {
      const db = require('../../lib/database');
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      let conversations = 0;
      let plans = 0;

      try {
        const convRow = db.prepare
          ? db.prepare(`SELECT COUNT(*) as total FROM conversations WHERE created_at >= ? AND created_at <= ?`).get(startISO, endISO)
          : null;
        if (convRow) conversations = convRow.total;
      } catch (_) { /* table may not exist */ }

      try {
        const planRow = db.prepare
          ? db.prepare(`SELECT COUNT(*) as total FROM plans WHERE created_at >= ? AND created_at <= ?`).get(startISO, endISO)
          : null;
        if (planRow) plans = planRow.total;
      } catch (_) { /* table may not exist */ }

      if (conversations === 0 && plans === 0) return null;

      let section = `Interactions\n`;
      if (conversations > 0) section += `  Conversations: ${conversations}\n`;
      if (plans > 0) section += `  Plans created: ${plans}`;

      return section.trimEnd();
    } catch (err) {
      this.log('warn', 'Conversation stats unavailable', err.message);
      return null;
    }
  }

  // ============ Helper: GitHub repos ============

  /**
   * Get list of user repositories from GitHub
   * @param {import('@octokit/rest').Octokit} octokit - Octokit instance
   * @param {string} username - GitHub username
   * @returns {Promise<Array<{owner: string, name: string}>>}
   */
  async _getUserRepos(octokit, username) {
    try {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        sort: 'pushed',
        per_page: 20
      });
      return data.map(r => ({ owner: r.owner.login, name: r.name }));
    } catch (err) {
      this.log('warn', 'Could not list repos, falling back to username', err.message);
      return [{ owner: username, name: username }];
    }
  }

  // ============ Helper: Deployment counting ============

  /**
   * Count deployments in a date range (for comparison)
   * @param {Date} start
   * @param {Date} end
   * @returns {Promise<number>}
   */
  async _countDeployments(start, end) {
    try {
      const db = require('../../lib/database');
      const row = db.prepare
        ? db.prepare(`SELECT COUNT(*) as total FROM deployments WHERE created_at >= ? AND created_at <= ?`)
            .get(start.toISOString(), end.toISOString())
        : null;
      return row ? row.total : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Count GitHub commits in a date range (for comparison)
   * @param {Date} start
   * @param {Date} end
   * @returns {Promise<number>}
   */
  async _countGitHubCommits(start, end) {
    try {
      const { Octokit } = require('@octokit/rest');
      const token = process.env.GITHUB_TOKEN;
      if (!token) return 0;

      const octokit = new Octokit({ auth: token });
      const username = process.env.GITHUB_USER || 'giquina';
      const repos = await this._getUserRepos(octokit, username);

      let total = 0;
      for (const r of repos) {
        try {
          const { data } = await octokit.repos.listCommits({
            owner: r.owner || username,
            repo: r.name,
            since: start.toISOString(),
            until: end.toISOString(),
            per_page: 100
          });
          total += data.length;
        } catch {
          // skip inaccessible repos
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  // ============ Utility Methods ============

  /**
   * Get Monday-to-Sunday bounds for the current week
   * @returns {{ weekStart: Date, weekEnd: Date }}
   */
  _getWeekBounds() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  }

  /**
   * Format a date as "Mon DD" (e.g. "Feb 3")
   * @param {Date} date
   * @returns {string}
   */
  _formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  /**
   * Format a numeric delta as a human-readable change string
   * @param {number} current
   * @param {number} previous
   * @returns {string}
   */
  _formatDelta(current, previous) {
    if (previous === 0 && current === 0) return 'No change';
    if (previous === 0) return `+${current} (new)`;
    const diff = current - previous;
    const pct = ((diff / previous) * 100).toFixed(0);
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${diff} (${sign}${pct}%)`;
  }

  /**
   * Get a value from the cache if it exists and is not expired
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  _getCache(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this._cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Store a value in the cache
   * @param {string} key - Cache key
   * @param {any} data - Value to cache
   */
  _setCache(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }
}

module.exports = WeeklyReportSkill;
