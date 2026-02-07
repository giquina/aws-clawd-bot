/**
 * Changelog Skill for ClawdBot
 *
 * Auto-generates human-friendly release notes from git commit history.
 * Leverages conventional commit format (feat:, fix:, docs:, etc.).
 *
 * Commands:
 *   changelog <repo>              - Generate changelog from recent commits (7 days)
 *   release notes <repo>          - Alias for changelog
 *   changelog <repo> <days>       - Generate changelog for last N days
 *   changelog <repo> <from>..<to> - Changelog between two refs (tags/commits)
 *   changelog all                 - Changelog across all managed repos (past week)
 */

const BaseSkill = require('../base-skill');

const COMMIT_TYPES = {
  'feat':     { emoji: '\u2728', label: 'New Features', order: 1 },
  'fix':      { emoji: '\uD83D\uDC1B', label: 'Bug Fixes', order: 2 },
  'perf':     { emoji: '\u26A1', label: 'Performance', order: 3 },
  'refactor': { emoji: '\u267B\uFE0F', label: 'Improvements', order: 4 },
  'docs':     { emoji: '\uD83D\uDCDD', label: 'Documentation', order: 5 },
  'test':     { emoji: '\uD83E\uDDEA', label: 'Testing', order: 6 },
  'chore':    { emoji: '\uD83D\uDD27', label: 'Maintenance', order: 7 },
  'ci':       { emoji: '\u2699\uFE0F', label: 'CI/CD', order: 8 },
  'style':    { emoji: '\uD83C\uDFA8', label: 'Styling', order: 9 },
};

const MAX_TELEGRAM_LENGTH = 4000; // Leave buffer under 4096

class ChangelogSkill extends BaseSkill {
  name = 'changelog';
  description = 'Auto-generate release notes from git commit history';
  priority = 18;

  commands = [
    {
      pattern: /^changelog\s+all$/i,
      description: 'Changelog across all managed repos (past week)',
      usage: 'changelog all'
    },
    {
      pattern: /^(?:changelog|release\s*notes)\s+(\S+)\s+(\S+\.\.\S+)$/i,
      description: 'Changelog between two refs (tags or commits)',
      usage: 'changelog <repo> <from>..<to>'
    },
    {
      pattern: /^(?:changelog|release\s*notes)\s+(\S+)\s+(\d+)$/i,
      description: 'Changelog for last N days',
      usage: 'changelog <repo> <days>'
    },
    {
      pattern: /^(?:changelog|release\s*notes)\s+(\S+)$/i,
      description: 'Generate changelog from recent commits (7 days)',
      usage: 'changelog <repo>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.username = process.env.GITHUB_USER || 'giquina';
  }

  /**
   * Lazy-load Octokit to avoid circular deps and startup cost
   */
  getOctokit() {
    if (!this._octokit) {
      const { Octokit } = require('@octokit/rest');
      this._octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    }
    return this._octokit;
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Resolve repo from chat context if not specified
      const autoRepo = context.autoRepo || null;

      // changelog all
      if (/^changelog\s+all$/i.test(raw)) {
        return await this.changelogAll();
      }

      // changelog <repo> <from>..<to>
      const refMatch = raw.match(/^(?:changelog|release\s*notes)\s+(\S+)\s+(\S+)\.\.(\S+)$/i);
      if (refMatch) {
        return await this.changelogBetweenRefs(refMatch[1], refMatch[2], refMatch[3]);
      }

      // changelog <repo> <days>
      const daysMatch = raw.match(/^(?:changelog|release\s*notes)\s+(\S+)\s+(\d+)$/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[2], 10);
        return await this.changelogForDays(daysMatch[1], days);
      }

      // changelog <repo>
      const repoMatch = raw.match(/^(?:changelog|release\s*notes)\s+(\S+)$/i);
      if (repoMatch) {
        return await this.changelogForDays(repoMatch[1], 7);
      }

      // If no repo arg but we have autoRepo context, use that
      if (/^(?:changelog|release\s*notes)$/i.test(raw.trim()) && autoRepo) {
        return await this.changelogForDays(autoRepo, 7);
      }

      return this.error('Usage: changelog <repo> [days] or changelog all');
    } catch (err) {
      this.log('error', `Changelog failed: ${err.message}`, err);
      return this.error('Changelog generation failed', err, {
        suggestion: 'Check the repo name and ensure GITHUB_TOKEN is set'
      });
    }
  }

  /**
   * Generate changelog for a single repo over N days
   */
  async changelogForDays(repoName, days) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const commits = await this.fetchCommitsSince(repoName, sinceDate);
    if (commits.length === 0) {
      return this.success(`No commits in ${repoName} for the last ${days} day${days !== 1 ? 's' : ''}.`);
    }

    const untilDate = new Date();
    const header = this.formatDateRange(sinceDate, untilDate);
    const output = this.formatChangelog(repoName, commits, header);
    return this.success(output);
  }

  /**
   * Generate changelog between two git refs (tags, SHAs, branches)
   */
  async changelogBetweenRefs(repoName, fromRef, toRef) {
    const octokit = this.getOctokit();

    const { data } = await octokit.repos.compareCommits({
      owner: this.username,
      repo: repoName,
      base: fromRef,
      head: toRef,
    });

    const commits = data.commits.map(c => ({
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      sha: c.sha.substring(0, 7),
    }));

    if (commits.length === 0) {
      return this.success(`No commits between ${fromRef} and ${toRef} in ${repoName}.`);
    }

    const header = `${fromRef} .. ${toRef}`;
    const output = this.formatChangelog(repoName, commits, header);
    return this.success(output);
  }

  /**
   * Changelog across all managed repos for the past 7 days
   */
  async changelogAll() {
    const registry = this.loadProjectRegistry();
    const projects = Object.keys(registry);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 7);
    const header = this.formatDateRange(sinceDate, new Date());

    let output = `Changelog: All Repos\n${header}\n`;
    output += '\u2501'.repeat(28) + '\n';

    let totalCommits = 0;

    for (const projectKey of projects) {
      const repoFull = registry[projectKey].repo;
      const repoName = repoFull.split('/').pop();

      try {
        const commits = await this.fetchCommitsSince(repoName, sinceDate);
        if (commits.length === 0) continue;

        totalCommits += commits.length;
        const grouped = this.groupByType(commits);
        output += `\n${repoName} (${commits.length} commits)\n`;

        for (const [type, items] of grouped) {
          const typeInfo = COMMIT_TYPES[type] || { label: 'Other Changes', emoji: '\uD83D\uDD39' };
          output += `  ${typeInfo.label}\n`;
          for (const commit of items) {
            output += `    - ${commit.humanized}\n`;
          }
        }
      } catch (err) {
        this.log('warn', `Skipping ${repoName}: ${err.message}`);
      }

      // Truncate if approaching Telegram limit
      if (output.length > MAX_TELEGRAM_LENGTH - 200) {
        output += '\n...(truncated - too many repos)\n';
        break;
      }
    }

    if (totalCommits === 0) {
      return this.success('No commits across any managed repos in the last 7 days.');
    }

    output += `\nTotal: ${totalCommits} commits across all repos`;
    return this.success(output);
  }

  // ============ GitHub API ============

  /**
   * Fetch commits from a repo since a given date
   */
  async fetchCommitsSince(repoName, sinceDate) {
    const octokit = this.getOctokit();

    const { data } = await octokit.repos.listCommits({
      owner: this.username,
      repo: repoName,
      since: sinceDate.toISOString(),
      per_page: 100,
    });

    return data.map(c => ({
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      sha: c.sha.substring(0, 7),
    }));
  }

  // ============ Parsing & Formatting ============

  /**
   * Parse a conventional commit message type
   */
  parseCommitType(message) {
    const match = message.match(/^(feat|fix|docs|chore|refactor|perf|test|ci|style)(\([^)]*\))?:/i);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Humanize a commit message by stripping conventional prefix and cleaning up
   */
  humanizeCommit(message) {
    const scopeMatch = message.match(/^\w+\(([^)]+)\):/);
    const scope = scopeMatch ? scopeMatch[1] : null;

    let cleaned = message.replace(/^(feat|fix|docs|chore|refactor|perf|test|ci|style)(\([^)]*\))?:\s*/i, '');
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    if (scope) {
      cleaned += ` (${scope})`;
    }

    return cleaned;
  }

  /**
   * Group commits by conventional type, sorted by type order
   * Returns a sorted array of [type, commits[]] pairs
   */
  groupByType(commits) {
    const groups = {};

    for (const commit of commits) {
      const type = this.parseCommitType(commit.message) || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push({
        ...commit,
        humanized: this.humanizeCommit(commit.message),
      });
    }

    // Sort groups by defined order (unknown types go last)
    return Object.entries(groups).sort((a, b) => {
      const orderA = COMMIT_TYPES[a[0]] ? COMMIT_TYPES[a[0]].order : 99;
      const orderB = COMMIT_TYPES[b[0]] ? COMMIT_TYPES[b[0]].order : 99;
      return orderA - orderB;
    });
  }

  /**
   * Format the full changelog output for a single repo
   */
  formatChangelog(repoName, commits, dateHeader) {
    let output = `Changelog: ${repoName}\n`;
    output += `${dateHeader} (${commits.length} commit${commits.length !== 1 ? 's' : ''})\n`;
    output += '\u2501'.repeat(28) + '\n';

    const grouped = this.groupByType(commits);

    for (const [type, items] of grouped) {
      const typeInfo = COMMIT_TYPES[type] || { label: 'Other Changes', emoji: '\uD83D\uDD39' };
      output += `\n${typeInfo.label}\n`;
      for (const commit of items) {
        output += `  - ${commit.humanized}\n`;
      }
    }

    // Truncate if too long for Telegram
    if (output.length > MAX_TELEGRAM_LENGTH) {
      output = output.substring(0, MAX_TELEGRAM_LENGTH - 50);
      output += '\n\n...(truncated)';
    }

    return output;
  }

  /**
   * Format a date range as "Feb 1-7, 2026"
   */
  formatDateRange(from, to) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fromMonth = months[from.getMonth()];
    const toMonth = months[to.getMonth()];
    const fromDay = from.getDate();
    const toDay = to.getDate();
    const year = to.getFullYear();

    if (fromMonth === toMonth) {
      return `${fromMonth} ${fromDay}-${toDay}, ${year}`;
    }
    return `${fromMonth} ${fromDay} - ${toMonth} ${toDay}, ${year}`;
  }

  /**
   * Load the project registry for "changelog all"
   */
  loadProjectRegistry() {
    try {
      const path = require('path');
      const fs = require('fs');
      const registryPath = path.resolve(__dirname, '../../../config/project-registry.json');
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      return data.projects || {};
    } catch (err) {
      this.log('warn', `Failed to load project registry: ${err.message}`);
      return {};
    }
  }
}

module.exports = ChangelogSkill;
