/**
 * Multi-Repo Skill for ClawdBot
 *
 * Provides operations across ALL monitored repositories simultaneously.
 * Great for searching, comparing, and finding patterns across your codebase.
 *
 * Commands:
 *   search all <query>     - Search for code/text across all repos
 *   compare repos          - Compare stats and activity across all repos
 *   compare activity       - Same as compare repos
 *   todo all               - Find TODO comments across all repos
 *   search all TODO        - Same as todo all
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');

class MultiRepoSkill extends BaseSkill {
  name = 'multi-repo';
  description = 'Search, compare and analyze across ALL your monitored repositories';
  priority = 25; // Higher than single-repo github skill (10)

  commands = [
    {
      pattern: /^search all (.+)$/i,
      description: 'Search for code/text across all monitored repos',
      usage: 'search all <query>'
    },
    {
      pattern: /^compare (repos|activity)$/i,
      description: 'Compare stats and activity across all repos',
      usage: 'compare repos'
    },
    {
      pattern: /^todo all$/i,
      description: 'Find TODO comments across all repos',
      usage: 'todo all'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    this.username = process.env.GITHUB_USERNAME;
  }

  /**
   * Get the list of monitored repos from environment
   */
  getMonitoredRepos() {
    const reposEnv = process.env.REPOS_TO_MONITOR || '';
    return reposEnv.split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Check for repos first
      const repos = this.getMonitoredRepos();
      if (repos.length === 0) {
        return this.error(
          '⚠️ No repos configured!\n\n' +
          'Set REPOS_TO_MONITOR in your env file.\n' +
          'Example: REPOS_TO_MONITOR=repo1,repo2,repo3'
        );
      }

      // Route to appropriate handler
      if (/^search all (.+)$/i.test(raw)) {
        const match = raw.match(/^search all (.+)$/i);
        return await this.handleSearchAll(match[1], repos);
      }

      if (/^compare (repos|activity)$/i.test(raw)) {
        return await this.handleCompareRepos(repos);
      }

      if (/^todo all$/i.test(raw)) {
        return await this.handleSearchAll('TODO', repos);
      }

      return this.error('Command not recognized. Try "search all <query>" or "compare repos".');

    } catch (err) {
      this.log('error', 'Multi-repo command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  /**
   * Search for text/code across all monitored repos
   */
  async handleSearchAll(query, repos) {
    this.log('info', `Searching "${query}" across ${repos.length} repos`);

    const results = [];
    const errors = [];
    const maxResultsPerRepo = 5;
    const maxTotalResults = 20;

    // Search each repo in parallel
    const searchPromises = repos.map(async (repoName) => {
      try {
        const response = await this.octokit.search.code({
          q: `${query} repo:${this.username}/${repoName}`,
          per_page: maxResultsPerRepo
        });

        return {
          repo: repoName,
          count: response.data.total_count,
          items: response.data.items.slice(0, maxResultsPerRepo)
        };
      } catch (err) {
        // GitHub rate limits or repo not found
        if (err.status === 403) {
          errors.push(`${repoName}: Rate limited`);
        } else if (err.status === 404) {
          errors.push(`${repoName}: Not found`);
        } else {
          errors.push(`${repoName}: ${err.message}`);
        }
        return null;
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Filter out failed searches and aggregate results
    for (const result of searchResults) {
      if (result && result.count > 0) {
        results.push(result);
      }
    }

    // Build response
    let output = `🔍 *Search: "${query}"*\n`;
    output += `Searched ${repos.length} repos\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (results.length === 0) {
      output += `No matches found across any repos.`;
      if (errors.length > 0) {
        output += `\n\n⚠️ *Errors:*\n${errors.join('\n')}`;
      }
      return this.success(output);
    }

    // Sort by match count (most matches first)
    results.sort((a, b) => b.count - a.count);

    let totalShown = 0;
    for (const result of results) {
      if (totalShown >= maxTotalResults) {
        output += `\n_...and more in other repos_`;
        break;
      }

      output += `📁 *${result.repo}* (${result.count} match${result.count !== 1 ? 'es' : ''})\n`;

      for (const item of result.items) {
        if (totalShown >= maxTotalResults) break;

        output += `   • \`${item.path}\`\n`;
        totalShown++;
      }
      output += '\n';
    }

    // Summary stats
    const totalMatches = results.reduce((sum, r) => sum + r.count, 0);
    output += `\n📊 *Total:* ${totalMatches} matches in ${results.length} repos`;

    if (errors.length > 0) {
      output += `\n\n⚠️ *Errors (${errors.length}):*\n${errors.slice(0, 3).join('\n')}`;
      if (errors.length > 3) {
        output += `\n...and ${errors.length - 3} more`;
      }
    }

    output += `\n\n_Use "search <repo> ${query}" for details_`;

    return this.success(output);
  }

  /**
   * Compare stats and activity across all repos
   */
  async handleCompareRepos(repos) {
    this.log('info', `Comparing ${repos.length} repos`);

    const repoStats = [];
    const errors = [];

    // Fetch stats for each repo in parallel
    const statPromises = repos.map(async (repoName) => {
      try {
        // Get repo info
        const repoInfo = await this.octokit.repos.get({
          owner: this.username,
          repo: repoName
        });

        // Get recent commits (last week)
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const commits = await this.octokit.repos.listCommits({
          owner: this.username,
          repo: repoName,
          since: oneWeekAgo.toISOString(),
          per_page: 100
        });

        // Get open issues/PRs count
        const issues = await this.octokit.issues.listForRepo({
          owner: this.username,
          repo: repoName,
          state: 'open',
          per_page: 1
        });

        // Get open PRs count
        const prs = await this.octokit.pulls.list({
          owner: this.username,
          repo: repoName,
          state: 'open',
          per_page: 1
        });

        return {
          name: repoName,
          stars: repoInfo.data.stargazers_count,
          forks: repoInfo.data.forks_count,
          size: repoInfo.data.size, // in KB
          language: repoInfo.data.language || 'Unknown',
          openIssues: repoInfo.data.open_issues_count,
          openPRs: prs.data.length > 0 ? repoInfo.data.open_issues_count : 0, // Approximation
          commitsThisWeek: commits.data.length,
          lastPush: repoInfo.data.pushed_at,
          defaultBranch: repoInfo.data.default_branch
        };
      } catch (err) {
        if (err.status === 404) {
          errors.push(`${repoName}: Not found`);
        } else {
          errors.push(`${repoName}: ${err.message}`);
        }
        return null;
      }
    });

    const statsResults = await Promise.all(statPromises);

    // Filter successful results
    for (const stat of statsResults) {
      if (stat) {
        repoStats.push(stat);
      }
    }

    if (repoStats.length === 0) {
      return this.error(
        '❌ Could not fetch stats for any repos.\n\n' +
        `Errors:\n${errors.join('\n')}`
      );
    }

    // Build comparison output
    let output = `📊 *Repository Comparison*\n`;
    output += `${repoStats.length} of ${repos.length} repos\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Sort by recent activity (commits this week)
    repoStats.sort((a, b) => b.commitsThisWeek - a.commitsThisWeek);

    // Activity section
    output += `🔥 *Activity (Last 7 days):*\n`;
    for (const stat of repoStats) {
      const activity = stat.commitsThisWeek > 0 ? '🟢' : '⚪';
      output += `${activity} ${stat.name}: ${stat.commitsThisWeek} commit${stat.commitsThisWeek !== 1 ? 's' : ''}\n`;
    }

    output += `\n`;

    // Size comparison
    output += `📦 *Size:*\n`;
    const sortedBySize = [...repoStats].sort((a, b) => b.size - a.size);
    for (const stat of sortedBySize) {
      const sizeStr = this.formatSize(stat.size);
      output += `• ${stat.name}: ${sizeStr}\n`;
    }

    output += `\n`;

    // Languages
    output += `💻 *Languages:*\n`;
    const langCounts = {};
    for (const stat of repoStats) {
      langCounts[stat.language] = (langCounts[stat.language] || 0) + 1;
    }
    for (const [lang, count] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
      output += `• ${lang}: ${count} repo${count !== 1 ? 's' : ''}\n`;
    }

    output += `\n`;

    // Open issues/PRs
    const totalOpenIssues = repoStats.reduce((sum, s) => sum + s.openIssues, 0);
    if (totalOpenIssues > 0) {
      output += `📝 *Open Issues:* ${totalOpenIssues} total\n`;
      const withIssues = repoStats.filter(s => s.openIssues > 0).sort((a, b) => b.openIssues - a.openIssues);
      for (const stat of withIssues.slice(0, 5)) {
        output += `   • ${stat.name}: ${stat.openIssues}\n`;
      }
      output += `\n`;
    }

    // Most recently updated
    const mostRecent = [...repoStats].sort((a, b) =>
      new Date(b.lastPush) - new Date(a.lastPush)
    )[0];
    output += `⏰ *Most recent:* ${mostRecent.name}\n`;
    output += `   Last push: ${this.formatDate(mostRecent.lastPush)}`;

    if (errors.length > 0) {
      output += `\n\n⚠️ *Couldn't fetch:* ${errors.length} repo${errors.length !== 1 ? 's' : ''}`;
    }

    return this.success(output);
  }

  /**
   * Format file size from KB to human-readable
   */
  formatSize(sizeKB) {
    if (sizeKB < 1024) {
      return `${sizeKB} KB`;
    } else if (sizeKB < 1024 * 1024) {
      return `${(sizeKB / 1024).toFixed(1)} MB`;
    } else {
      return `${(sizeKB / (1024 * 1024)).toFixed(1)} GB`;
    }
  }

  /**
   * Format date to relative time
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
    } else {
      return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
    }
  }
}

module.exports = MultiRepoSkill;
