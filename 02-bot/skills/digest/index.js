/**
 * Daily Digest Skill - Comprehensive daily summary for ClawdBot
 *
 * Provides a comprehensive daily summary including:
 * - Upcoming deadlines (next 7 days)
 * - Pending tasks
 * - Recent GitHub activity (commits, PRs, issues)
 * - Expense summary (if any today)
 * - Quote of the day (optional)
 *
 * Commands:
 *   daily digest | morning digest  - Get full summary
 *   digest                         - Short version
 *   today | whats today            - Quick today summary
 *
 * @example
 * daily digest
 * morning digest
 * digest
 * today
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');

class DigestSkill extends BaseSkill {
  name = 'digest';
  description = 'Daily digest with deadlines, tasks, and activity summary';
  priority = 32;

  commands = [
    {
      pattern: /^(daily\s*)?digest$/i,
      description: 'Get daily digest',
      usage: 'digest'
    },
    {
      pattern: /^morning\s*(digest|brief|summary)$/i,
      description: 'Morning summary',
      usage: 'morning digest'
    },
    {
      pattern: /^(whats\s*)?today$/i,
      description: 'Quick today summary',
      usage: 'today'
    }
  ];

  // Company data for deadlines (synced with deadlines skill)
  companies = {
    'GMH': {
      name: 'Giquina Management Holdings Ltd',
      number: '15425137',
      incorporated: '2024-08-14',
      shortName: 'GMH'
    },
    'GACC': {
      name: 'Giquina Accountancy Ltd',
      number: '16396650',
      incorporated: '2025-04-23',
      shortName: 'GACC'
    },
    'GCAP': {
      name: 'Giquina Capital Ltd',
      number: '16360342',
      incorporated: '2025-04-08',
      shortName: 'GCAP'
    },
    'GQCARS': {
      name: 'GQ Cars Ltd',
      number: '15389347',
      incorporated: '2024-08-02',
      shortName: 'GQCARS'
    },
    'GSPV': {
      name: 'Giquina Structured Asset SPV Ltd',
      number: '16369465',
      incorporated: '2025-04-11',
      shortName: 'GSPV'
    }
  };

  constructor(context = {}) {
    super(context);
    this.octokit = null;
    this.username = process.env.GITHUB_USERNAME || '';

    // Initialize Octokit if token is available
    if (process.env.GITHUB_TOKEN) {
      this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    }
  }

  /**
   * Execute digest commands
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Quick today summary
      if (/^(whats\s*)?today$/i.test(raw)) {
        return await this.getQuickDigest(context);
      }

      // Full digest (daily digest, morning digest, digest)
      return await this.getFullDigest(context);
    } catch (err) {
      this.log('error', 'Digest command failed', err);
      return this.error(`Failed to generate digest: ${err.message}`);
    }
  }

  /**
   * Generate full daily digest
   */
  async getFullDigest(context) {
    const now = new Date();
    const greeting = this.getGreeting();

    let digest = `${greeting}\n\n`;
    digest += `*DAILY DIGEST*\n`;
    digest += `${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    digest += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Deadlines section
    const deadlines = this.getUpcomingDeadlines();
    digest += `*DEADLINES (Next 7 Days)*\n`;
    if (deadlines.length > 0) {
      deadlines.slice(0, 5).forEach(d => {
        digest += `${d.icon} ${d.company}: ${d.type} - ${d.daysText}\n`;
      });
    } else {
      digest += `No urgent deadlines\n`;
    }
    digest += `\n`;

    // GitHub Activity section
    const activity = await this.getGitHubActivity();
    digest += `*GITHUB ACTIVITY*\n`;
    digest += `${activity.commits} commits today\n`;
    digest += `${activity.openPRs} open PRs\n`;
    digest += `${activity.openIssues} open issues\n`;
    if (activity.recentCommit) {
      const truncated = activity.recentCommit.length > 40
        ? activity.recentCommit.slice(0, 40) + '...'
        : activity.recentCommit;
      digest += `Latest: "${truncated}"\n`;
    }
    digest += `\n`;

    // Tasks section (from memory if available)
    const tasks = await this.getPendingTasks(context);
    digest += `*TASKS*\n`;
    if (tasks.length > 0) {
      tasks.slice(0, 3).forEach(t => {
        digest += `${t}\n`;
      });
      if (tasks.length > 3) {
        digest += `_...and ${tasks.length - 3} more_\n`;
      }
    } else {
      digest += `No pending tasks\n`;
    }
    digest += `\n`;

    // Quick actions footer
    digest += `*QUICK ACTIONS*\n`;
    digest += `"deadlines" - View all deadlines\n`;
    digest += `"list repos" - See your repos\n`;
    digest += `"my tasks" - View all tasks\n`;

    return this.success(digest);
  }

  /**
   * Generate quick today summary
   */
  async getQuickDigest(context) {
    const now = new Date();
    const deadlines = this.getUpcomingDeadlines();
    const urgent = deadlines.filter(d => d.days <= 3);

    let digest = `*${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}*\n\n`;

    // Urgent deadlines
    if (urgent.length > 0) {
      digest += `${urgent.length} urgent deadline(s)\n`;
    } else {
      digest += `No urgent deadlines\n`;
    }

    // GitHub summary
    const activity = await this.getGitHubActivity();
    digest += `${activity.commits} commits, ${activity.openPRs} PRs open\n`;

    // Tasks count
    const tasks = await this.getPendingTasks(context);
    if (tasks.length > 0) {
      digest += `${tasks.length} pending task(s)\n`;
    }

    digest += `\n_"digest" for full summary_`;

    return this.success(digest);
  }

  /**
   * Get time-appropriate greeting
   */
  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning!';
    if (hour < 18) return 'Good afternoon!';
    return 'Good evening!';
  }

  /**
   * Calculate upcoming deadlines (next 7 days)
   */
  getUpcomingDeadlines() {
    const now = new Date();
    const deadlines = [];

    for (const [code, company] of Object.entries(this.companies)) {
      const incDate = new Date(company.incorporated);

      // CS01 deadline - due 14 days after incorporation anniversary
      const cs01Due = this.getNextCS01Due(incDate, now);
      const days = Math.ceil((cs01Due - now) / (24 * 60 * 60 * 1000));

      if (days <= 30) {
        let icon = '';
        let daysText = '';

        if (days <= 0) {
          icon = 'OVERDUE';
          daysText = 'OVERDUE';
        } else if (days <= 7) {
          icon = 'URGENT';
          daysText = `${days} days`;
        } else {
          icon = 'OK';
          daysText = `${days} days`;
        }

        deadlines.push({
          company: code,
          type: 'CS01',
          days,
          daysText,
          icon
        });
      }

      // Annual accounts deadline - 21 months from incorporation for first accounts
      // then 9 months after year end
      const accountsDue = this.getNextAccountsDue(company, now);
      const accountsDays = Math.ceil((accountsDue - now) / (24 * 60 * 60 * 1000));

      if (accountsDays <= 90 && accountsDays > 0) {
        let icon = '';
        let daysText = `${accountsDays} days`;

        if (accountsDays <= 7) {
          icon = 'URGENT';
        } else if (accountsDays <= 30) {
          icon = 'SOON';
        } else {
          icon = 'OK';
        }

        deadlines.push({
          company: code,
          type: 'Accounts',
          days: accountsDays,
          daysText,
          icon
        });
      }
    }

    // Sort by days remaining (most urgent first)
    return deadlines.sort((a, b) => a.days - b.days);
  }

  /**
   * Get next CS01 due date
   */
  getNextCS01Due(incDate, fromDate) {
    const now = new Date(fromDate);
    let anniversary = new Date(now.getFullYear(), incDate.getMonth(), incDate.getDate());

    // If we've passed this year's anniversary, use next year
    if (anniversary < now) {
      anniversary.setFullYear(anniversary.getFullYear() + 1);
    }

    // CS01 due 14 days after anniversary
    anniversary.setDate(anniversary.getDate() + 14);
    return anniversary;
  }

  /**
   * Get next annual accounts due date
   */
  getNextAccountsDue(company, fromDate) {
    const incDate = new Date(company.incorporated);
    const now = new Date(fromDate);

    // First accounts: 21 months from incorporation
    const firstAccountsDue = new Date(incDate);
    firstAccountsDue.setMonth(firstAccountsDue.getMonth() + 21);

    if (now < firstAccountsDue) {
      return firstAccountsDue;
    }

    // Subsequent: 9 months after financial year end
    // Year end is typically last day of incorporation month
    let yearEnd = new Date(now.getFullYear(), incDate.getMonth() + 1, 0);

    if (yearEnd < now) {
      yearEnd = new Date(now.getFullYear() + 1, incDate.getMonth() + 1, 0);
    }

    const accountsDue = new Date(yearEnd);
    accountsDue.setMonth(accountsDue.getMonth() + 9);
    return accountsDue;
  }

  /**
   * Get GitHub activity summary
   */
  async getGitHubActivity() {
    const activity = {
      commits: 0,
      openPRs: 0,
      openIssues: 0,
      recentCommit: null
    };

    // Return empty activity if Octokit not configured
    if (!this.octokit || !this.username) {
      return activity;
    }

    const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
    const today = new Date().toISOString().split('T')[0];

    for (const repo of repos.slice(0, 5)) {
      const repoName = repo.trim();
      if (!repoName) continue;

      try {
        // Get today's commits
        const { data: commits } = await this.octokit.repos.listCommits({
          owner: this.username,
          repo: repoName,
          since: today + 'T00:00:00Z',
          per_page: 10
        });
        activity.commits += commits.length;

        // Store most recent commit message
        if (commits[0] && !activity.recentCommit) {
          activity.recentCommit = commits[0].commit.message.split('\n')[0];
        }

        // Get open PRs
        const { data: prs } = await this.octokit.pulls.list({
          owner: this.username,
          repo: repoName,
          state: 'open',
          per_page: 10
        });
        activity.openPRs += prs.length;

        // Get open issues (excluding PRs)
        const { data: issues } = await this.octokit.issues.listForRepo({
          owner: this.username,
          repo: repoName,
          state: 'open',
          per_page: 10
        });
        activity.openIssues += issues.filter(i => !i.pull_request).length;
      } catch (e) {
        // Skip errors for individual repos (might not exist, no access, etc.)
        this.log('debug', `Failed to get activity for ${repoName}: ${e.message}`);
      }
    }

    return activity;
  }

  /**
   * Get pending tasks from memory manager
   */
  async getPendingTasks(context) {
    // Try to get from memory manager
    if (this.memory && typeof this.memory.getTasks === 'function') {
      try {
        const userId = context.from || context.userId || 'system';
        const tasks = this.memory.getTasks(userId, 'pending');
        return tasks.map(t => {
          const priority = t.priority === 'high' ? '' : '';
          return `${priority} ${t.title || t.description || t.text || t}`.trim();
        });
      } catch (e) {
        this.log('debug', 'Failed to get tasks from memory', e.message);
        return [];
      }
    }
    return [];
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    // Verify Octokit setup
    if (!this.octokit) {
      this.log('warn', 'GitHub token not configured - GitHub activity will be unavailable');
    }

    this.log('info', `Digest skill initialized with ${Object.keys(this.companies).length} companies`);
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      companies: Object.keys(this.companies),
      hasGitHub: !!this.octokit,
      hasMemory: !!this.memory
    };
  }
}

module.exports = DigestSkill;
