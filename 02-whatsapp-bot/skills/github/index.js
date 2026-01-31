/**
 * GitHub Full Integration Skill for ClawdBot
 *
 * Provides complete GitHub repository management through WhatsApp commands.
 * Wraps both github-handler.js (basic ops) and code-analyzer.js (advanced ops).
 *
 * Commands:
 *   list repos                         - List monitored repositories
 *   analyze [repo]                     - Analyze repo stats and structure
 *   read file [repo] [path]            - Read file contents from repo
 *   search [repo] [query]              - Search code in repo
 *   view pr [repo] #[n]                - View PR details and diff summary
 *   list branches [repo]               - List all branches
 *   commits [repo]                     - Show recent commits
 *   create pr [repo] [title]           - Create a pull request
 *   create branch [repo] [name]        - Create a new branch from main
 *   create branch [repo] [name] from [base] - Create branch from specific base
 *   create issue [repo] [title]        - Create a new issue
 *   close issue [repo] #[n]            - Close an issue
 *   comment [repo] #[n] [message]      - Add comment to issue/PR
 */

const BaseSkill = require('../base-skill');

// Import existing handlers
const githubHandler = require('../../github-handler');
const GitHubAutomation = require('../../../03-github-automation/code-analyzer');

class GitHubSkill extends BaseSkill {
  name = 'github';
  description = 'Full GitHub repo management - read files, search code, PRs, branches, issues';
  priority = 10; // Higher priority for explicit GitHub commands

  commands = [
    {
      pattern: /^list\s*repos?$/i,
      description: 'List all monitored repositories',
      usage: 'list repos'
    },
    {
      pattern: /^analyze\s+(\S+)$/i,
      description: 'Analyze repository statistics and structure',
      usage: 'analyze <repo>'
    },
    {
      pattern: /^read\s+file\s+(\S+)\s+(.+)$/i,
      description: 'Read file contents from a repository',
      usage: 'read file <repo> <path>'
    },
    {
      pattern: /^search\s+(\S+)\s+(.+)$/i,
      description: 'Search code in a repository',
      usage: 'search <repo> <query>'
    },
    {
      pattern: /^view\s+pr\s+(\S+)\s+#?(\d+)$/i,
      description: 'View pull request details',
      usage: 'view pr <repo> #<number>'
    },
    {
      pattern: /^list\s+branches\s+(\S+)$/i,
      description: 'List all branches in a repository',
      usage: 'list branches <repo>'
    },
    {
      pattern: /^commits\s+(\S+)$/i,
      description: 'Show recent commits',
      usage: 'commits <repo>'
    },
    {
      pattern: /^create\s+pr\s+(\S+)\s+(.+)$/i,
      description: 'Create a pull request',
      usage: 'create pr <repo> <title>'
    },
    {
      pattern: /^create\s+branch\s+(\S+)\s+(\S+)(?:\s+from\s+(\S+))?$/i,
      description: 'Create a new branch',
      usage: 'create branch <repo> <name> [from <base>]'
    },
    {
      pattern: /^create\s+issue\s+(\S+)\s+(.+)$/i,
      description: 'Create a new issue',
      usage: 'create issue <repo> <title>'
    },
    {
      pattern: /^close\s+issue\s+(\S+)\s+#?(\d+)$/i,
      description: 'Close an issue',
      usage: 'close issue <repo> #<number>'
    },
    {
      pattern: /^comment\s+(\S+)\s+#?(\d+)\s+(.+)$/i,
      description: 'Add comment to an issue or PR',
      usage: 'comment <repo> #<number> <message>'
    }
  ];

  constructor(context = {}) {
    super(context);
    // Initialize the advanced GitHub automation instance
    this.automation = new GitHubAutomation();
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw, match } = this.parseCommand(command);
    const normalized = raw.toLowerCase();

    try {
      // Route to appropriate handler based on command pattern
      if (/^list\s*repos?$/i.test(normalized)) {
        return await this.handleListRepos();
      }

      if (/^analyze\s+(\S+)$/i.test(raw)) {
        const repoMatch = raw.match(/^analyze\s+(\S+)$/i);
        return await this.handleAnalyze(repoMatch[1]);
      }

      // NEW: Read file from repo
      if (/^read\s+file\s+/i.test(raw)) {
        const readMatch = raw.match(/^read\s+file\s+(\S+)\s+(.+)$/i);
        if (readMatch) {
          return await this.handleReadFile(readMatch[1], readMatch[2]);
        }
      }

      // NEW: Search code in repo
      if (/^search\s+(\S+)\s+/i.test(raw)) {
        const searchMatch = raw.match(/^search\s+(\S+)\s+(.+)$/i);
        if (searchMatch) {
          return await this.handleSearchCode(searchMatch[1], searchMatch[2]);
        }
      }

      // NEW: View PR details
      if (/^view\s+pr\s+/i.test(raw)) {
        const prMatch = raw.match(/^view\s+pr\s+(\S+)\s+#?(\d+)$/i);
        if (prMatch) {
          return await this.handleViewPR(prMatch[1], parseInt(prMatch[2]));
        }
      }

      // NEW: List branches
      if (/^list\s+branches\s+/i.test(raw)) {
        const branchMatch = raw.match(/^list\s+branches\s+(\S+)$/i);
        if (branchMatch) {
          return await this.handleListBranches(branchMatch[1]);
        }
      }

      // NEW: Recent commits
      if (/^commits\s+/i.test(raw)) {
        const commitMatch = raw.match(/^commits\s+(\S+)$/i);
        if (commitMatch) {
          return await this.handleCommits(commitMatch[1]);
        }
      }

      if (/^create\s+pr\s+/i.test(raw)) {
        const prMatch = raw.match(/^create\s+pr\s+(\S+)\s+(.+)$/i);
        if (prMatch) {
          return await this.handleCreatePR(prMatch[1], prMatch[2]);
        }
      }

      if (/^create\s+branch\s+/i.test(raw)) {
        const branchMatch = raw.match(/^create\s+branch\s+(\S+)\s+(\S+)(?:\s+from\s+(\S+))?$/i);
        if (branchMatch) {
          return await this.handleCreateBranch(branchMatch[1], branchMatch[2], branchMatch[3]);
        }
      }

      if (/^create\s+issue\s+/i.test(raw)) {
        const issueMatch = raw.match(/^create\s+issue\s+(\S+)\s+(.+)$/i);
        if (issueMatch) {
          return await this.handleCreateIssue(issueMatch[1], issueMatch[2]);
        }
      }

      if (/^close\s+issue\s+/i.test(raw)) {
        const closeMatch = raw.match(/^close\s+issue\s+(\S+)\s+#?(\d+)$/i);
        if (closeMatch) {
          return await this.handleCloseIssue(closeMatch[1], parseInt(closeMatch[2]));
        }
      }

      if (/^comment\s+/i.test(raw)) {
        const commentMatch = raw.match(/^comment\s+(\S+)\s+#?(\d+)\s+(.+)$/i);
        if (commentMatch) {
          return await this.handleAddComment(commentMatch[1], parseInt(commentMatch[2]), commentMatch[3]);
        }
      }

      return this.error('Command not recognized. Try "list repos" for available commands.');

    } catch (err) {
      this.log('error', 'GitHub command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  // ============ NEW Command Handlers ============

  /**
   * Read file contents from a repository
   */
  async handleReadFile(repoName, filePath) {
    this.log('info', `Reading file: ${repoName}/${filePath}`);

    try {
      const response = await this.automation.octokit.repos.getContent({
        owner: this.automation.username,
        repo: repoName,
        path: filePath.trim()
      });

      // Check if it's a file
      if (response.data.type !== 'file') {
        return this.error(`"${filePath}" is a directory, not a file.`);
      }

      // Decode content from base64
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');

      // Truncate if too long for WhatsApp
      const maxLength = 3000;
      let displayContent = content;
      let truncated = false;

      if (content.length > maxLength) {
        displayContent = content.substring(0, maxLength);
        truncated = true;
      }

      let output = `📄 *${filePath}*\n`;
      output += `Repository: ${repoName}\n`;
      output += `Size: ${response.data.size} bytes\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += '```\n' + displayContent + '\n```';

      if (truncated) {
        output += `\n\n_...truncated (${content.length - maxLength} more chars)_`;
      }

      return this.success(output);
    } catch (err) {
      if (err.status === 404) {
        return this.error(`File not found: ${filePath} in ${repoName}`);
      }
      return this.error(`Failed to read file: ${err.message}`);
    }
  }

  /**
   * Search code in a repository
   */
  async handleSearchCode(repoName, query) {
    this.log('info', `Searching in ${repoName}: ${query}`);

    try {
      const response = await this.automation.octokit.search.code({
        q: `${query} repo:${this.automation.username}/${repoName}`,
        per_page: 10
      });

      if (response.data.total_count === 0) {
        return this.success(`No results for "${query}" in ${repoName}`);
      }

      let output = `🔍 *Search: "${query}"*\n`;
      output += `Repository: ${repoName}\n`;
      output += `Found: ${response.data.total_count} matches\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      response.data.items.slice(0, 10).forEach((item, i) => {
        output += `${i + 1}. \`${item.path}\`\n`;
        // Show text matches if available
        if (item.text_matches && item.text_matches.length > 0) {
          const match = item.text_matches[0];
          if (match.fragment) {
            const fragment = match.fragment.substring(0, 100).replace(/\n/g, ' ');
            output += `   ...${fragment}...\n`;
          }
        }
        output += '\n';
      });

      output += `\n_Use "read file ${repoName} <path>" to view a file_`;

      return this.success(output);
    } catch (err) {
      return this.error(`Search failed: ${err.message}`);
    }
  }

  /**
   * View PR details
   */
  async handleViewPR(repoName, prNumber) {
    this.log('info', `Viewing PR #${prNumber} in ${repoName}`);

    try {
      // Get PR details
      const pr = await this.automation.octokit.pulls.get({
        owner: this.automation.username,
        repo: repoName,
        pull_number: prNumber
      });

      // Get PR files changed
      const files = await this.automation.octokit.pulls.listFiles({
        owner: this.automation.username,
        repo: repoName,
        pull_number: prNumber,
        per_page: 10
      });

      const data = pr.data;
      let output = `🔀 *PR #${prNumber}: ${data.title}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `Status: ${data.state} ${data.merged ? '(merged)' : ''}\n`;
      output += `Author: ${data.user.login}\n`;
      output += `Branch: ${data.head.ref} → ${data.base.ref}\n`;
      output += `Commits: ${data.commits} | +${data.additions} -${data.deletions}\n`;
      output += `Created: ${this.formatDate(data.created_at)}\n\n`;

      if (data.body) {
        const body = data.body.substring(0, 300);
        output += `*Description:*\n${body}${data.body.length > 300 ? '...' : ''}\n\n`;
      }

      output += `*Files changed (${files.data.length}):*\n`;
      files.data.slice(0, 8).forEach(file => {
        const status = file.status === 'added' ? '➕' : file.status === 'removed' ? '➖' : '📝';
        output += `${status} \`${file.filename}\` (+${file.additions}/-${file.deletions})\n`;
      });

      if (files.data.length > 8) {
        output += `...and ${files.data.length - 8} more files\n`;
      }

      output += `\n${data.html_url}`;

      return this.success(output);
    } catch (err) {
      if (err.status === 404) {
        return this.error(`PR #${prNumber} not found in ${repoName}`);
      }
      return this.error(`Failed to get PR: ${err.message}`);
    }
  }

  /**
   * List all branches
   */
  async handleListBranches(repoName) {
    this.log('info', `Listing branches for ${repoName}`);

    try {
      const response = await this.automation.octokit.repos.listBranches({
        owner: this.automation.username,
        repo: repoName,
        per_page: 30
      });

      // Get default branch
      const repo = await this.automation.octokit.repos.get({
        owner: this.automation.username,
        repo: repoName
      });

      const defaultBranch = repo.data.default_branch;

      let output = `🌿 *Branches: ${repoName}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      response.data.forEach(branch => {
        const isDefault = branch.name === defaultBranch;
        output += `${isDefault ? '⭐' : '•'} ${branch.name}${isDefault ? ' (default)' : ''}\n`;
      });

      output += `\n_Total: ${response.data.length} branches_`;

      return this.success(output);
    } catch (err) {
      return this.error(`Failed to list branches: ${err.message}`);
    }
  }

  /**
   * Show recent commits
   */
  async handleCommits(repoName) {
    this.log('info', `Getting commits for ${repoName}`);

    try {
      const response = await this.automation.octokit.repos.listCommits({
        owner: this.automation.username,
        repo: repoName,
        per_page: 10
      });

      let output = `📝 *Recent Commits: ${repoName}*\n`;
      output += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      response.data.forEach((commit, i) => {
        const sha = commit.sha.substring(0, 7);
        const message = commit.commit.message.split('\n')[0].substring(0, 50);
        const author = commit.commit.author.name;
        const date = this.formatDate(commit.commit.author.date);

        output += `${i + 1}. \`${sha}\` ${message}\n`;
        output += `   by ${author} • ${date}\n\n`;
      });

      return this.success(output);
    } catch (err) {
      return this.error(`Failed to get commits: ${err.message}`);
    }
  }

  // ============ Existing Command Handlers ============

  /**
   * List all monitored repositories
   */
  async handleListRepos() {
    this.log('info', 'Listing repositories');
    const result = await githubHandler.listRepos();
    return this.success(result);
  }

  /**
   * Analyze a repository (combines basic stats with code structure)
   */
  async handleAnalyze(repoName) {
    this.log('info', `Analyzing repository: ${repoName}`);

    // Get basic repo analysis from github-handler
    const basicAnalysis = await githubHandler.analyzeRepo(repoName);

    // Attempt to get code structure analysis (may fail for large repos)
    let structureInfo = '';
    try {
      const structure = await this.automation.analyzeCodeStructure(repoName);
      if (!structure.error) {
        structureInfo = this.formatCodeStructure(structure);
      }
    } catch (err) {
      this.log('warn', 'Code structure analysis skipped', err.message);
    }

    const fullAnalysis = basicAnalysis + (structureInfo ? '\n\n' + structureInfo : '');
    return this.success(fullAnalysis);
  }

  /**
   * Create a pull request
   * Note: Requires head branch to already exist with commits
   */
  async handleCreatePR(repoName, title) {
    this.log('info', `Creating PR in ${repoName}: ${title}`);

    // For now, we'll need the user to specify branches
    // Default: feature branch -> main
    const message = `To create a PR, I need more details:\n\n` +
      `Reply with:\n` +
      `*pr ${repoName} "${title}" head:<branch> base:<branch>*\n\n` +
      `Example:\n` +
      `pr ${repoName} "${title}" head:feature-branch base:main`;

    return this.success(message);
  }

  /**
   * Create a new branch
   */
  async handleCreateBranch(repoName, branchName, fromBranch = 'main') {
    this.log('info', `Creating branch ${branchName} in ${repoName} from ${fromBranch}`);

    const result = await this.automation.createBranch(repoName, branchName, fromBranch);

    if (result.success) {
      return this.success(
        `✅ Branch created!\n\n` +
        `Repository: ${repoName}\n` +
        `New branch: ${branchName}\n` +
        `Based on: ${fromBranch}`
      );
    } else {
      return this.error(`Failed to create branch: ${result.error}`);
    }
  }

  /**
   * Create a new issue
   */
  async handleCreateIssue(repoName, title) {
    this.log('info', `Creating issue in ${repoName}: ${title}`);

    try {
      const response = await this.automation.octokit.issues.create({
        owner: this.automation.username,
        repo: repoName,
        title: title,
        body: `Created via ClawdBot WhatsApp`
      });

      return this.success(
        `✅ Issue created!\n\n` +
        `#${response.data.number}: ${title}\n` +
        `${response.data.html_url}`
      );
    } catch (err) {
      return this.error(`Failed to create issue: ${err.message}`);
    }
  }

  /**
   * Close an issue
   */
  async handleCloseIssue(repoName, issueNumber) {
    this.log('info', `Closing issue #${issueNumber} in ${repoName}`);

    try {
      await this.automation.octokit.issues.update({
        owner: this.automation.username,
        repo: repoName,
        issue_number: issueNumber,
        state: 'closed'
      });

      return this.success(`✅ Issue #${issueNumber} closed in ${repoName}`);
    } catch (err) {
      return this.error(`Failed to close issue: ${err.message}`);
    }
  }

  /**
   * Add a comment to an issue or PR
   */
  async handleAddComment(repoName, issueNumber, message) {
    this.log('info', `Adding comment to #${issueNumber} in ${repoName}`);

    const result = await this.automation.addComment(repoName, issueNumber, message);

    if (result.success) {
      return this.success(`✅ Comment added to #${issueNumber} in ${repoName}`);
    } else {
      return this.error(`Failed to add comment: ${result.error}`);
    }
  }

  // ============ Helper Methods ============

  /**
   * Format code structure analysis for WhatsApp
   */
  formatCodeStructure(structure) {
    if (!structure || structure.error) return '';

    let output = `*Code Structure:*\n`;
    output += `Total files: ${structure.files.length}\n`;
    output += `Total lines: ${structure.totalLines.toLocaleString()}\n\n`;

    // Show top 5 languages
    const langs = Object.entries(structure.languages)
      .filter(([ext]) => ext) // Filter out empty extensions
      .sort((a, b) => b[1].lines - a[1].lines)
      .slice(0, 5);

    if (langs.length > 0) {
      output += `*Languages:*\n`;
      langs.forEach(([ext, data]) => {
        const langName = this.getLanguageName(ext);
        output += `${langName}: ${data.files} files, ${data.lines.toLocaleString()} lines\n`;
      });
    }

    return output;
  }

  /**
   * Format date to readable string
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  /**
   * Map file extension to language name
   */
  getLanguageName(ext) {
    const langMap = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.php': 'PHP',
      '.html': 'HTML',
      '.css': 'CSS',
      '.json': 'JSON',
      '.md': 'Markdown',
      '.yml': 'YAML',
      '.yaml': 'YAML',
      '.sh': 'Shell',
      '.ps1': 'PowerShell',
      '.sql': 'SQL'
    };
    return langMap[ext] || ext.replace('.', '').toUpperCase();
  }
}

module.exports = GitHubSkill;
