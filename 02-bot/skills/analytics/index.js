/**
 * Analytics Dashboard Skill - Business insights from ClawdBot data
 *
 * Provides analytics on:
 * - ClawdBot usage (messages, sessions, skills)
 * - Deployments and development activity
 * - GitHub stats (PRs, commits)
 * - Pomodoro productivity tracking
 * - Expense tracking and budgets
 * - Plan execution success rates
 *
 * Commands:
 *   analytics                - Overall dashboard summary
 *   analytics usage          - Bot usage stats (messages, skills)
 *   analytics deployments    - Deployment history and success rate
 *   analytics productivity   - Pomodoro and task completion
 *   analytics expenses       - Expense and budget overview
 *   analytics github         - GitHub activity stats
 *   analytics <project>      - Project-specific metrics
 *
 * Features:
 * - Unicode bar charts for visual appeal
 * - Trend analysis (growth %, comparisons)
 * - 5-minute cache for expensive queries
 * - Time-based comparisons (this week vs last week)
 *
 * @example
 * analytics
 * -> Shows overall dashboard with key metrics
 *
 * analytics deployments
 * -> Deployment success rate, frequency, recent deployments
 *
 * analytics productivity
 * -> Pomodoro sessions, completion rate, focus time
 */
const BaseSkill = require('../base-skill');

class AnalyticsSkill extends BaseSkill {
  name = 'analytics';
  description = 'Business analytics and insights dashboard';
  priority = 18;

  // Cache for expensive queries (5 minutes)
  cache = new Map();
  cacheTTL = 5 * 60 * 1000;

  commands = [
    {
      pattern: /^analytics$/i,
      description: 'Show overall analytics dashboard',
      usage: 'analytics'
    },
    {
      pattern: /^analytics (usage|activity)$/i,
      description: 'Bot usage statistics',
      usage: 'analytics usage'
    },
    {
      pattern: /^analytics (deployments|deploys)$/i,
      description: 'Deployment history and success rate',
      usage: 'analytics deployments'
    },
    {
      pattern: /^analytics (productivity|pomodoro|focus)$/i,
      description: 'Productivity and focus tracking',
      usage: 'analytics productivity'
    },
    {
      pattern: /^analytics (expenses|spending|budget)$/i,
      description: 'Expense tracking and budget status',
      usage: 'analytics expenses'
    },
    {
      pattern: /^analytics (github|git|prs)$/i,
      description: 'GitHub activity statistics',
      usage: 'analytics github'
    },
    {
      pattern: /^analytics (JUDO|LusoTown|armora|gqcars-manager|gq-cars-driver-app|giquina-accountancy-direct-filing)$/i,
      description: 'Project-specific analytics',
      usage: 'analytics <project>'
    }
  ];

  async initialize() {
    await super.initialize();

    // Load database module
    try {
      this.db = require('../../lib/database');
      this.log('info', 'Database connection initialized');
    } catch (err) {
      this.log('error', 'Failed to load database', err);
    }

    // Load outcome tracker
    try {
      this.outcomeTracker = require('../../lib/outcome-tracker');
    } catch (err) {
      this.log('warn', 'Outcome tracker not available');
    }
  }

  async execute(command, context) {
    if (!this.db) {
      return this.error('Analytics unavailable', 'Database not initialized');
    }

    const { args, raw } = this.parseCommand(command);

    // Route to specific analytics
    if (/^analytics$/i.test(raw)) {
      return this.showDashboard(context);
    }

    if (/usage|activity/i.test(args[0])) {
      return this.showUsageStats(context);
    }

    if (/deployments|deploys/i.test(args[0])) {
      return this.showDeploymentStats(context);
    }

    if (/productivity|pomodoro|focus/i.test(args[0])) {
      return this.showProductivityStats(context);
    }

    if (/expenses|spending|budget/i.test(args[0])) {
      return this.showExpenseStats(context);
    }

    if (/github|git|prs/i.test(args[0])) {
      return this.showGitHubStats(context);
    }

    // Project-specific
    const projectMatch = raw.match(/analytics (JUDO|LusoTown|armora|gqcars-manager|gq-cars-driver-app|giquina-accountancy-direct-filing)/i);
    if (projectMatch) {
      return this.showProjectStats(projectMatch[1], context);
    }

    return this.error('Unknown analytics command', null, {
      suggestion: 'Try: analytics, analytics usage, analytics deployments, etc.'
    });
  }

  /**
   * Overall dashboard - top-level metrics
   */
  async showDashboard(context) {
    const cacheKey = 'dashboard';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const now = new Date();
      const today = this.formatDate(now);
      const weekAgo = this.formatDate(new Date(now - 7 * 24 * 60 * 60 * 1000));

      // Messages this week
      const messages = dbInstance.prepare(
        `SELECT COUNT(*) as count FROM conversations WHERE created_at >= ?`
      ).get(weekAgo);

      // Deployments this week
      const deployments = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as successful
         FROM deployments WHERE created_at >= ?`
      ).get(weekAgo);

      // Plans this week
      const plans = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
         FROM plan_history WHERE created_at >= ?`
      ).get(weekAgo);

      // Pomodoro sessions today
      const pomodoro = dbInstance.prepare(
        `SELECT COUNT(*) as count FROM pomodoro_sessions WHERE date(started_at) = date('now')`
      ).get();

      // Active projects (with deployments in last 30 days)
      const activeProjects = dbInstance.prepare(
        `SELECT COUNT(DISTINCT repo) as count FROM deployments
         WHERE created_at >= datetime('now', '-30 days')`
      ).get();

      let output = `📊 *ClawdBot Analytics Dashboard*\n\n`;
      output += `*This Week (${weekAgo} to ${today})*\n`;
      output += `💬 Messages: ${messages.count}\n`;
      output += `🚀 Deployments: ${deployments.total} (${deployments.successful} successful)\n`;
      output += `📝 Plans: ${plans.total} (${plans.completed} completed)\n`;
      output += `⏱️ Pomodoro Today: ${pomodoro.count} sessions\n`;
      output += `📦 Active Projects: ${activeProjects.count}\n\n`;

      // Success rates
      const deploySuccessRate = deployments.total > 0
        ? Math.round((deployments.successful / deployments.total) * 100)
        : 0;
      const planSuccessRate = plans.total > 0
        ? Math.round((plans.completed / plans.total) * 100)
        : 0;

      output += `*Success Rates*\n`;
      output += `Deployments: ${this.renderBar(deploySuccessRate)} ${deploySuccessRate}%\n`;
      output += `Plans: ${this.renderBar(planSuccessRate)} ${planSuccessRate}%\n\n`;

      output += `_Use 'analytics usage', 'analytics deployments', etc. for details_`;

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Dashboard error', err);
      return this.error('Failed to generate dashboard', err);
    }
  }

  /**
   * Bot usage statistics
   */
  async showUsageStats(context) {
    const cacheKey = 'usage';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const now = new Date();
      const weekAgo = this.formatDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
      const twoWeeksAgo = this.formatDate(new Date(now - 14 * 24 * 60 * 60 * 1000));

      // Messages this week vs last week
      const thisWeek = dbInstance.prepare(
        `SELECT COUNT(*) as count FROM conversations WHERE created_at >= ?`
      ).get(weekAgo);

      const lastWeek = dbInstance.prepare(
        `SELECT COUNT(*) as count FROM conversations WHERE created_at >= ? AND created_at < ?`
      ).get(twoWeeksAgo, weekAgo);

      // Messages by day (last 7 days)
      const byDay = dbInstance.prepare(
        `SELECT date(created_at) as day, COUNT(*) as count
         FROM conversations WHERE created_at >= ?
         GROUP BY date(created_at) ORDER BY day DESC LIMIT 7`
      ).all(weekAgo);

      // Claude Code sessions
      const sessions = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
         FROM claude_code_sessions WHERE created_at >= ?`
      ).get(weekAgo);

      // Most active chat
      const topChat = dbInstance.prepare(
        `SELECT chat_id, COUNT(*) as count FROM conversations
         WHERE created_at >= ?
         GROUP BY chat_id ORDER BY count DESC LIMIT 1`
      ).get(weekAgo);

      let output = `📈 *Bot Usage Statistics*\n\n`;
      output += `*Messages*\n`;
      output += `This week: ${thisWeek.count}\n`;
      output += `Last week: ${lastWeek.count}\n`;

      // Growth calculation
      if (lastWeek.count > 0) {
        const growth = Math.round(((thisWeek.count - lastWeek.count) / lastWeek.count) * 100);
        const trend = growth > 0 ? '📈' : growth < 0 ? '📉' : '➡️';
        output += `Growth: ${trend} ${growth > 0 ? '+' : ''}${growth}%\n\n`;
      } else {
        output += '\n';
      }

      // Daily breakdown
      output += `*Daily Activity (Last 7 Days)*\n`;
      const maxCount = Math.max(...byDay.map(d => d.count), 1);
      byDay.reverse().forEach(day => {
        const bar = this.renderBarCustom(day.count, maxCount);
        const date = day.day.substring(5); // MM-DD
        output += `${date}: ${bar} ${day.count}\n`;
      });

      output += `\n*Claude Code Sessions*\n`;
      output += `Total: ${sessions.total}\n`;
      output += `Completed: ${sessions.completed}\n`;
      if (sessions.total > 0) {
        const successRate = Math.round((sessions.completed / sessions.total) * 100);
        output += `Success rate: ${successRate}%\n`;
      }

      if (topChat && topChat.count > 0) {
        output += `\n*Most Active Chat*\n`;
        output += `Chat ID: ${topChat.chat_id}\n`;
        output += `Messages: ${topChat.count}\n`;
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Usage stats error', err);
      return this.error('Failed to generate usage stats', err);
    }
  }

  /**
   * Deployment statistics
   */
  async showDeploymentStats(context) {
    const cacheKey = 'deployments';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const now = new Date();
      const weekAgo = this.formatDate(new Date(now - 7 * 24 * 60 * 60 * 1000));

      // Overall stats
      const overall = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as successful,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
         FROM deployments WHERE created_at >= ?`
      ).get(weekAgo);

      // By repo
      const byRepo = dbInstance.prepare(
        `SELECT repo, COUNT(*) as count,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as successful
         FROM deployments WHERE created_at >= ?
         GROUP BY repo ORDER BY count DESC LIMIT 5`
      ).all(weekAgo);

      // Recent deployments
      const recent = dbInstance.prepare(
        `SELECT repo, status, created_at FROM deployments
         ORDER BY created_at DESC LIMIT 5`
      ).all();

      let output = `🚀 *Deployment Statistics*\n\n`;
      output += `*This Week*\n`;
      output += `Total: ${overall.total}\n`;
      output += `✅ Successful: ${overall.successful}\n`;
      output += `❌ Failed: ${overall.failed}\n`;

      if (overall.total > 0) {
        const successRate = Math.round((overall.successful / overall.total) * 100);
        output += `Success rate: ${this.renderBar(successRate)} ${successRate}%\n\n`;
      } else {
        output += '\n';
      }

      // By repo
      if (byRepo.length > 0) {
        output += `*Deployments by Project*\n`;
        byRepo.forEach(r => {
          const rate = r.count > 0 ? Math.round((r.successful / r.count) * 100) : 0;
          output += `${r.repo}: ${r.count} (${rate}% success)\n`;
        });
        output += '\n';
      }

      // Recent deployments
      if (recent.length > 0) {
        output += `*Recent Deployments*\n`;
        recent.forEach(d => {
          const status = d.status === 'completed' ? '✅' : d.status === 'failed' ? '❌' : '⏳';
          const date = new Date(d.created_at).toLocaleDateString();
          output += `${status} ${d.repo} - ${date}\n`;
        });
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Deployment stats error', err);
      return this.error('Failed to generate deployment stats', err);
    }
  }

  /**
   * Productivity statistics (Pomodoro)
   */
  async showProductivityStats(context) {
    const cacheKey = `productivity-${context.from}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const userId = context.from || context.chatId;

      // Today's stats
      const today = dbInstance.prepare(
        `SELECT COUNT(*) as sessions,
                SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END) as total_minutes,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) as stopped
         FROM pomodoro_sessions
         WHERE user_id = ? AND date(started_at) = date('now')`
      ).get(userId);

      // This week
      const week = dbInstance.prepare(
        `SELECT COUNT(*) as sessions,
                SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END) as total_minutes
         FROM pomodoro_sessions
         WHERE user_id = ? AND started_at >= datetime('now', '-7 days')`
      ).get(userId);

      // Daily trend (last 7 days)
      const daily = dbInstance.prepare(
        `SELECT date(started_at) as day,
                COUNT(*) as sessions,
                SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END) as minutes
         FROM pomodoro_sessions
         WHERE user_id = ? AND started_at >= datetime('now', '-7 days')
         GROUP BY date(started_at) ORDER BY day DESC LIMIT 7`
      ).all(userId);

      let output = `⏱️ *Productivity Analytics*\n\n`;
      output += `*Today*\n`;
      output += `🍅 Sessions: ${today.sessions}\n`;
      output += `✅ Completed: ${today.completed}\n`;
      output += `⏸️ Stopped: ${today.stopped}\n`;
      output += `⏳ Focus time: ${today.total_minutes || 0} min\n`;

      if (today.sessions > 0) {
        const completionRate = Math.round((today.completed / today.sessions) * 100);
        output += `Completion rate: ${this.renderBar(completionRate)} ${completionRate}%\n`;
      }

      output += `\n*This Week*\n`;
      output += `Sessions: ${week.sessions}\n`;
      output += `Focus time: ${week.total_minutes || 0} min (${this.formatHours(week.total_minutes || 0)})\n\n`;

      // Daily chart
      if (daily.length > 0) {
        output += `*Daily Sessions (Last 7 Days)*\n`;
        const maxSessions = Math.max(...daily.map(d => d.sessions), 1);
        daily.reverse().forEach(day => {
          const bar = this.renderBarCustom(day.sessions, maxSessions);
          const date = day.day.substring(5); // MM-DD
          output += `${date}: ${bar} ${day.sessions} (${day.minutes}m)\n`;
        });
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Productivity stats error', err);
      return this.error('Failed to generate productivity stats', err);
    }
  }

  /**
   * Expense and budget statistics
   */
  async showExpenseStats(context) {
    const cacheKey = 'expenses';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const fs = require('fs');
      const path = require('path');
      const receiptsPath = path.join(__dirname, '..', '..', 'data', 'receipts.json');

      // Check if receipts file exists
      if (!fs.existsSync(receiptsPath)) {
        return this.success('No expense data available yet.\nUse the receipts skill to track expenses.');
      }

      let receipts = JSON.parse(fs.readFileSync(receiptsPath, 'utf8'));

      // Handle empty or invalid receipts file
      if (!Array.isArray(receipts)) {
        receipts = [];
      }

      if (receipts.length === 0) {
        return this.success('No expense data available yet.\nUse the receipts skill to track expenses.');
      }

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Filter receipts for current month
      const thisMonth = receipts.filter(r => {
        const date = new Date(r.date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });

      // Filter receipts for last month
      const lastMonth = receipts.filter(r => {
        const date = new Date(r.date);
        const month = currentMonth === 0 ? 11 : currentMonth - 1;
        const year = currentMonth === 0 ? currentYear - 1 : currentYear;
        return date.getMonth() === month && date.getFullYear() === year;
      });

      // Calculate totals
      const thisMonthTotal = thisMonth.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
      const thisMonthVAT = thisMonth.reduce((sum, r) => sum + parseFloat(r.vat || 0), 0);
      const lastMonthTotal = lastMonth.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

      // By category
      const byCategory = {};
      thisMonth.forEach(r => {
        const cat = r.category || 'Uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + parseFloat(r.amount || 0);
      });

      let output = `💰 *Expense Analytics*\n\n`;
      output += `*This Month*\n`;
      output += `Total spent: £${thisMonthTotal.toFixed(2)}\n`;
      output += `VAT: £${thisMonthVAT.toFixed(2)}\n`;
      output += `Receipts: ${thisMonth.length}\n\n`;

      output += `*Last Month*\n`;
      output += `Total spent: £${lastMonthTotal.toFixed(2)}\n`;
      output += `Receipts: ${lastMonth.length}\n`;

      // Month-over-month comparison
      if (lastMonthTotal > 0) {
        const change = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
        const trend = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        output += `Change: ${trend} ${change > 0 ? '+' : ''}${change.toFixed(1)}%\n`;
      }

      // By category
      if (Object.keys(byCategory).length > 0) {
        output += `\n*By Category (This Month)*\n`;
        const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        const max = Math.max(...sorted.map(([_, amt]) => amt));

        sorted.forEach(([cat, amt]) => {
          const bar = this.renderBarCustom(amt, max);
          output += `${cat}: ${bar} £${amt.toFixed(2)}\n`;
        });
      }

      // Check budgets
      const dbInstance = this.db.getDb();
      const budgets = dbInstance.prepare(
        `SELECT category, amount FROM budgets WHERE period = 'monthly'`
      ).all();

      if (budgets.length > 0) {
        output += `\n*Budget Status*\n`;
        budgets.forEach(budget => {
          const spent = byCategory[budget.category] || 0;
          const percentage = (spent / budget.amount) * 100;
          const status = percentage > 100 ? '🔴' : percentage > 80 ? '🟡' : '🟢';
          output += `${status} ${budget.category}: £${spent.toFixed(2)} / £${budget.amount.toFixed(2)} (${percentage.toFixed(0)}%)\n`;
        });
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Expense stats error', err);
      return this.error('Failed to generate expense stats', err);
    }
  }

  /**
   * GitHub statistics
   */
  async showGitHubStats(context) {
    const cacheKey = 'github';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const weekAgo = this.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      // Plans (PRs) created
      const plans = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN pr_url IS NOT NULL THEN 1 ELSE 0 END), 0) as with_pr,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
         FROM plan_history WHERE created_at >= ?`
      ).get(weekAgo);

      // By repo
      const byRepo = dbInstance.prepare(
        `SELECT repo, COUNT(*) as count FROM plan_history
         WHERE created_at >= ? AND repo IS NOT NULL
         GROUP BY repo ORDER BY count DESC`
      ).all(weekAgo);

      // Recent PRs
      const recentPRs = dbInstance.prepare(
        `SELECT repo, pr_url, status, created_at FROM plan_history
         WHERE pr_url IS NOT NULL ORDER BY created_at DESC LIMIT 5`
      ).all();

      let output = `🐙 *GitHub Activity*\n\n`;
      output += `*This Week*\n`;
      output += `Plans created: ${plans.total}\n`;
      output += `PRs opened: ${plans.with_pr}\n`;
      output += `Completed: ${plans.completed}\n`;

      if (plans.total > 0) {
        const successRate = Math.round((plans.completed / plans.total) * 100);
        output += `Success rate: ${this.renderBar(successRate)} ${successRate}%\n\n`;
      } else {
        output += '\n';
      }

      // By repo
      if (byRepo.length > 0) {
        output += `*Activity by Repo*\n`;
        byRepo.forEach(r => {
          output += `${r.repo}: ${r.count} plans\n`;
        });
        output += '\n';
      }

      // Recent PRs
      if (recentPRs.length > 0) {
        output += `*Recent PRs*\n`;
        recentPRs.forEach(pr => {
          const status = pr.status === 'completed' ? '✅' : '⏳';
          const date = new Date(pr.created_at).toLocaleDateString();
          output += `${status} ${pr.repo} - ${date}\n`;
        });
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'GitHub stats error', err);
      return this.error('Failed to generate GitHub stats', err);
    }
  }

  /**
   * Project-specific statistics
   */
  async showProjectStats(project, context) {
    const cacheKey = `project-${project}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const dbInstance = this.db.getDb();
      const weekAgo = this.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      // Deployments for this project
      const deployments = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as successful
         FROM deployments WHERE repo = ? AND created_at >= ?`
      ).get(project, weekAgo);

      // Plans for this project
      const plans = dbInstance.prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
         FROM plan_history WHERE repo = ? AND created_at >= ?`
      ).get(project, weekAgo);

      // Recent activity
      const recentActivity = dbInstance.prepare(
        `SELECT 'deployment' as type, status, created_at FROM deployments WHERE repo = ?
         UNION ALL
         SELECT 'plan' as type, status, created_at FROM plan_history WHERE repo = ?
         ORDER BY created_at DESC LIMIT 10`
      ).all(project, project);

      let output = `📊 *${project} Analytics*\n\n`;
      output += `*This Week*\n`;
      output += `🚀 Deployments: ${deployments.total} (${deployments.successful} successful)\n`;
      output += `📝 Plans: ${plans.total} (${plans.completed} completed)\n\n`;

      // Success rates
      if (deployments.total > 0) {
        const rate = Math.round((deployments.successful / deployments.total) * 100);
        output += `Deploy success: ${this.renderBar(rate)} ${rate}%\n`;
      }
      if (plans.total > 0) {
        const rate = Math.round((plans.completed / plans.total) * 100);
        output += `Plan success: ${this.renderBar(rate)} ${rate}%\n`;
      }

      // Recent activity
      if (recentActivity.length > 0) {
        output += `\n*Recent Activity*\n`;
        recentActivity.forEach(a => {
          const icon = a.type === 'deployment' ? '🚀' : '📝';
          const status = a.status === 'completed' ? '✅' : a.status === 'failed' ? '❌' : '⏳';
          const date = new Date(a.created_at).toLocaleDateString();
          output += `${icon} ${status} ${date}\n`;
        });
      }

      const response = this.success(output);
      this.setCache(cacheKey, response);
      return response;
    } catch (err) {
      this.log('error', 'Project stats error', err);
      return this.error(`Failed to generate stats for ${project}`, err);
    }
  }

  // ============ Helper Methods ============

  /**
   * Render a percentage bar chart
   */
  renderBar(percentage) {
    const blocks = ['░', '▒', '▓', '█'];
    const barLength = 10;
    const filled = Math.round((percentage / 100) * barLength);
    return blocks[3].repeat(filled) + blocks[0].repeat(barLength - filled);
  }

  /**
   * Render a bar chart with custom max value
   */
  renderBarCustom(value, maxValue) {
    const blocks = ['░', '▒', '▓', '█'];
    const barLength = 10;
    const percentage = maxValue > 0 ? (value / maxValue) : 0;
    const filled = Math.round(percentage * barLength);
    return blocks[3].repeat(filled) + blocks[0].repeat(barLength - filled);
  }

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format minutes as hours
   */
  formatHours(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  /**
   * Get cached result
   */
  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  /**
   * Set cached result
   */
  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    // Clean old cache entries (keep last 20)
    if (this.cache.size > 20) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}

module.exports = AnalyticsSkill;
