/**
 * Stats Skill for ClawdBot
 *
 * Repository and project statistics via WhatsApp.
 *
 * Commands:
 *   stats <repo>           - Get comprehensive repo stats
 *   contributors <repo>    - List top contributors
 *   activity <repo>        - Recent activity summary
 *   languages <repo>       - Language breakdown
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');

class StatsSkill extends BaseSkill {
  name = 'stats';
  description = 'Repository statistics and analytics';
  priority = 12;

  commands = [
    {
      pattern: /^stats\s+(\S+)$/i,
      description: 'Get comprehensive repo statistics',
      usage: 'stats <repo>'
    },
    {
      pattern: /^contributors\s+(\S+)$/i,
      description: 'List top contributors',
      usage: 'contributors <repo>'
    },
    {
      pattern: /^activity\s+(\S+)$/i,
      description: 'Recent activity summary',
      usage: 'activity <repo>'
    },
    {
      pattern: /^languages\s+(\S+)$/i,
      description: 'Language breakdown',
      usage: 'languages <repo>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.username = process.env.GITHUB_USERNAME;
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      if (/^stats\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^stats\s+(\S+)$/i);
        return await this.getStats(match[1]);
      }

      if (/^contributors\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^contributors\s+(\S+)$/i);
        return await this.getContributors(match[1]);
      }

      if (/^activity\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^activity\s+(\S+)$/i);
        return await this.getActivity(match[1]);
      }

      if (/^languages\s+(\S+)$/i.test(raw)) {
        const match = raw.match(/^languages\s+(\S+)$/i);
        return await this.getLanguages(match[1]);
      }

      return this.error('Unknown command');
    } catch (err) {
      return this.error(`Stats error: ${err.message}`);
    }
  }

  async getStats(repoName) {
    const [repo, commits, issues, prs] = await Promise.all([
      this.octokit.repos.get({ owner: this.username, repo: repoName }),
      this.octokit.repos.listCommits({ owner: this.username, repo: repoName, per_page: 1 }),
      this.octokit.issues.listForRepo({ owner: this.username, repo: repoName, state: 'open', per_page: 1 }),
      this.octokit.pulls.list({ owner: this.username, repo: repoName, state: 'open', per_page: 1 })
    ]);

    const r = repo.data;
    let output = `📊 *Stats: ${repoName}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `⭐ Stars: ${r.stargazers_count}\n`;
    output += `🍴 Forks: ${r.forks_count}\n`;
    output += `👁️ Watchers: ${r.watchers_count}\n`;
    output += `📝 Open Issues: ${r.open_issues_count}\n`;
    output += `🔀 Open PRs: ${prs.data.length}\n`;
    output += `💾 Size: ${(r.size / 1024).toFixed(1)} MB\n`;
    output += `🔧 Language: ${r.language || 'N/A'}\n`;
    output += `📅 Created: ${new Date(r.created_at).toLocaleDateString()}\n`;
    output += `🔄 Updated: ${this.timeAgo(r.updated_at)}\n`;

    if (r.description) {
      output += `\n_${r.description}_`;
    }

    return this.success(output);
  }

  async getContributors(repoName) {
    const contributors = await this.octokit.repos.listContributors({
      owner: this.username,
      repo: repoName,
      per_page: 10
    });

    let output = `👥 *Contributors: ${repoName}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    contributors.data.forEach((c, i) => {
      output += `${i + 1}. *${c.login}* - ${c.contributions} commits\n`;
    });

    return this.success(output);
  }

  async getActivity(repoName) {
    const [commits, issues, prs] = await Promise.all([
      this.octokit.repos.listCommits({ owner: this.username, repo: repoName, per_page: 5 }),
      this.octokit.issues.listForRepo({ owner: this.username, repo: repoName, state: 'all', per_page: 5, sort: 'updated' }),
      this.octokit.pulls.list({ owner: this.username, repo: repoName, state: 'all', per_page: 5, sort: 'updated' })
    ]);

    let output = `📈 *Recent Activity: ${repoName}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    output += `*Latest Commits:*\n`;
    commits.data.slice(0, 3).forEach(c => {
      const msg = c.commit.message.split('\n')[0].substring(0, 40);
      output += `• ${msg} (${this.timeAgo(c.commit.author.date)})\n`;
    });

    output += `\n*Recent Issues:*\n`;
    issues.data.filter(i => !i.pull_request).slice(0, 3).forEach(i => {
      const status = i.state === 'open' ? '🟢' : '🔴';
      output += `${status} #${i.number}: ${i.title.substring(0, 30)}\n`;
    });

    output += `\n*Recent PRs:*\n`;
    prs.data.slice(0, 3).forEach(p => {
      const status = p.state === 'open' ? '🟢' : p.merged_at ? '🟣' : '🔴';
      output += `${status} #${p.number}: ${p.title.substring(0, 30)}\n`;
    });

    return this.success(output);
  }

  async getLanguages(repoName) {
    const languages = await this.octokit.repos.listLanguages({
      owner: this.username,
      repo: repoName
    });

    const total = Object.values(languages.data).reduce((a, b) => a + b, 0);

    let output = `💻 *Languages: ${repoName}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    Object.entries(languages.data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([lang, bytes]) => {
        const pct = ((bytes / total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
        output += `${lang}: ${pct}%\n${bar}\n\n`;
      });

    return this.success(output);
  }

  timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}

module.exports = StatsSkill;
