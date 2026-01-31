/**
 * GitHub Full Integration Skill for ClawdBot
 *
 * Provides complete GitHub repository management through WhatsApp commands.
 * Wraps both github-handler.js (basic ops) and code-analyzer.js (advanced ops).
 *
 * Commands:
 *   list repos                         - List monitored repositories
 *   analyze [repo]                     - Analyze repo stats and structure
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
  description = 'Full GitHub repository management - list, analyze, create PRs/branches/issues, comment';
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

  // ============ Command Handlers ============

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
        `Branch created successfully!\n\n` +
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
        `Issue created!\n\n` +
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

      return this.success(`Issue #${issueNumber} closed in ${repoName}`);
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
      return this.success(`Comment added to #${issueNumber} in ${repoName}`);
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
