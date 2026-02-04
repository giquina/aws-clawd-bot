/**
 * Project Context Skill for ClawdBot
 *
 * Provides project awareness across ALL GitHub repos with TODO.md parsing,
 * README summarization, file listing, and active project context management.
 *
 * Commands:
 *   project status <repo>      - Show TODO.md tasks
 *   status <repo>              - Alias for project status
 *   what's left on <repo>      - Parse TODO.md, summarize incomplete tasks
 *   whats left <repo>          - Alias for what's left
 *   show readme <repo>         - Fetch and summarize README
 *   readme <repo>              - Alias for show readme
 *   project files <repo>       - List key files in repo
 *   files <repo>               - Alias for project files
 *   my repos                   - Lists ALL user's GitHub repos
 *   all repos                  - Alias for my repos
 *   switch to <repo>           - Sets active project context
 *   use <repo>                 - Alias for switch to
 *   active project             - Shows current active project
 *   current project            - Alias for active project
 */

const BaseSkill = require('../base-skill');
const GitHubAutomation = require('../../../03-github-automation/code-analyzer');

// Simple in-memory cache with TTL
const cache = {
  data: {},
  set(key, value, ttlMinutes = 60) {
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
  clear(pattern) {
    if (pattern) {
      Object.keys(this.data).forEach(key => {
        if (key.includes(pattern)) delete this.data[key];
      });
    } else {
      this.data = {};
    }
  }
};

// Active project context (in-memory, persists during runtime)
let activeProject = null;

class ProjectContextSkill extends BaseSkill {
  name = 'project-context';
  description = 'Project awareness with TODO.md parsing, README summary, file listing, and active project context';
  priority = 25; // Higher than github skill (10)

  commands = [
    {
      pattern: /^(?:project\s+)?status(?:\s+(.+))?$/i,
      description: 'Show TODO.md tasks for a project',
      usage: 'project status <repo> OR status <repo>'
    },
    {
      pattern: /^what'?s?\s+left(?:\s+(?:on\s+)?(.+))?$/i,
      description: 'Parse TODO.md and summarize incomplete tasks',
      usage: "what's left on <repo> OR whats left <repo>"
    },
    {
      pattern: /^(?:show\s+)?readme(?:\s+(.+))?$/i,
      description: 'Fetch and summarize README',
      usage: 'show readme <repo> OR readme <repo>'
    },
    {
      pattern: /^(?:project\s+)?files(?:\s+(.+))?$/i,
      description: 'List key files in repo',
      usage: 'project files <repo> OR files <repo>'
    },
    {
      pattern: /^(?:my\s+repos|all\s+repos|list\s+all\s+repos)$/i,
      description: 'Lists ALL user GitHub repositories',
      usage: 'my repos OR all repos'
    },
    {
      pattern: /^(?:switch\s+to|use)\s+(.+)$/i,
      description: 'Set active project context',
      usage: 'switch to <repo> OR use <repo>'
    },
    {
      pattern: /^(?:active\s+project|current\s+project)$/i,
      description: 'Show current active project',
      usage: 'active project OR current project'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.automation = new GitHubAutomation();

    // Common repo name aliases for fuzzy matching
    this.repoAliases = {
      'clawd': 'aws-clawd-bot',
      'clawdbot': 'aws-clawd-bot',
      'bot': 'aws-clawd-bot',
      'judo': 'judo-website',
      'judoclub': 'judo-website',
      'giquina': 'giquina-website'
    };
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const normalized = raw.toLowerCase().trim();

    try {
      // My repos / All repos
      if (/^(?:my\s+repos|all\s+repos|list\s+all\s+repos)$/i.test(normalized)) {
        return await this.handleListAllRepos();
      }

      // Active project / Current project
      if (/^(?:active\s+project|current\s+project)$/i.test(normalized)) {
        return await this.handleActiveProject();
      }

      // Switch to / Use
      const switchMatch = raw.match(/^(?:switch\s+to|use)\s+(.+)$/i);
      if (switchMatch) {
        return await this.handleSwitchProject(switchMatch[1].trim());
      }

      // Project status / Status
      const statusMatch = raw.match(/^(?:project\s+)?status(?:\s+(.+))?$/i);
      if (statusMatch) {
        const repoName = statusMatch[1]?.trim() || activeProject;
        return await this.handleProjectStatus(repoName);
      }

      // What's left
      const leftMatch = raw.match(/^what'?s?\s+left(?:\s+(?:on\s+)?(.+))?$/i);
      if (leftMatch) {
        const repoName = leftMatch[1]?.trim() || activeProject;
        return await this.handleWhatsLeft(repoName);
      }

      // Show readme / Readme
      const readmeMatch = raw.match(/^(?:show\s+)?readme(?:\s+(.+))?$/i);
      if (readmeMatch) {
        const repoName = readmeMatch[1]?.trim() || activeProject;
        return await this.handleShowReadme(repoName);
      }

      // Project files / Files
      const filesMatch = raw.match(/^(?:project\s+)?files(?:\s+(.+))?$/i);
      if (filesMatch) {
        const repoName = filesMatch[1]?.trim() || activeProject;
        return await this.handleProjectFiles(repoName);
      }

      return this.error('Command not recognized. Try "my repos" or "project status <repo>".');

    } catch (err) {
      this.log('error', 'Project context command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * List ALL user's GitHub repos (not just monitored)
   */
  async handleListAllRepos() {
    this.log('info', 'Listing all user repos');

    // Check cache first
    const cacheKey = 'all-repos';
    const cached = cache.get(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    try {
      const response = await this.automation.octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: 'updated',
        direction: 'desc'
      });

      const repos = response.data;

      let output = `*All GitHub Repositories*\n`;
      output += `Total: ${repos.length} repos\n`;
      output += `${''.padEnd(20, '\u2501')}\n\n`;

      // Group by visibility
      const publicRepos = repos.filter(r => !r.private);
      const privateRepos = repos.filter(r => r.private);

      if (publicRepos.length > 0) {
        output += `*Public (${publicRepos.length}):*\n`;
        publicRepos.slice(0, 15).forEach(repo => {
          const updated = this.formatDate(repo.updated_at);
          const star = repo.stargazers_count > 0 ? ` [${repo.stargazers_count}]` : '';
          output += `${repo.name}${star} - ${updated}\n`;
        });
        if (publicRepos.length > 15) {
          output += `...and ${publicRepos.length - 15} more\n`;
        }
        output += '\n';
      }

      if (privateRepos.length > 0) {
        output += `*Private (${privateRepos.length}):*\n`;
        privateRepos.slice(0, 10).forEach(repo => {
          const updated = this.formatDate(repo.updated_at);
          output += `${repo.name} - ${updated}\n`;
        });
        if (privateRepos.length > 10) {
          output += `...and ${privateRepos.length - 10} more\n`;
        }
      }

      output += `\n_Use "switch to <repo>" to set active project_`;

      // Cache for 60 minutes
      cache.set(cacheKey, output, 60);

      return this.success(output);

    } catch (err) {
      return this.error(`Failed to list repos: ${err.message}`);
    }
  }

  /**
   * Show/set active project
   */
  async handleActiveProject() {
    if (activeProject) {
      return this.success(
        `*Active Project:* ${activeProject}\n\n` +
        `You can now use commands without specifying repo:\n` +
        `- "status" / "what's left" / "readme" / "files"\n\n` +
        `_Use "switch to <repo>" to change_`
      );
    } else {
      return this.success(
        `*No active project set*\n\n` +
        `Set one with: "switch to <repo>" or "use <repo>"\n\n` +
        `Or use "my repos" to see all repositories.`
      );
    }
  }

  /**
   * Switch active project
   */
  async handleSwitchProject(repoName) {
    this.log('info', `Switching to project: ${repoName}`);

    // Resolve repo name with fuzzy matching
    const resolvedRepo = await this.resolveRepoName(repoName);
    if (!resolvedRepo) {
      return this.error(
        `Repository "${repoName}" not found.\n\n` +
        `Use "my repos" to see available repositories.`
      );
    }

    activeProject = resolvedRepo;

    return this.success(
      `*Switched to:* ${resolvedRepo}\n\n` +
      `You can now use these without specifying repo:\n` +
      `- "status" - Show TODO.md tasks\n` +
      `- "what's left" - Incomplete tasks\n` +
      `- "readme" - Show README\n` +
      `- "files" - List key files`
    );
  }

  /**
   * Show project status (TODO.md tasks)
   */
  async handleProjectStatus(repoName) {
    if (!repoName) {
      return this.error(
        `No repo specified and no active project.\n\n` +
        `Use: "project status <repo>"\n` +
        `Or: "switch to <repo>" first`
      );
    }

    this.log('info', `Getting project status for: ${repoName}`);

    // Resolve repo name
    const resolvedRepo = await this.resolveRepoName(repoName);
    if (!resolvedRepo) {
      return this.error(`Repository "${repoName}" not found.`);
    }

    // Check cache
    const cacheKey = `status-${resolvedRepo}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    // Fetch TODO.md
    const todoContent = await this.fetchFileContent(resolvedRepo, 'TODO.md');

    if (!todoContent) {
      // Try alternative locations
      const altContent = await this.fetchFileContent(resolvedRepo, 'docs/TODO.md') ||
                         await this.fetchFileContent(resolvedRepo, '.github/TODO.md');

      if (!altContent) {
        return this.success(
          `*${resolvedRepo.toUpperCase()} PROJECT STATUS*\n\n` +
          `No TODO.md found in this repository.\n\n` +
          `_Try "readme ${resolvedRepo}" for project overview_`
        );
      }
      return this.formatProjectStatus(resolvedRepo, altContent);
    }

    const output = this.formatProjectStatus(resolvedRepo, todoContent);
    cache.set(cacheKey, output, 60);
    return this.success(output);
  }

  /**
   * Parse TODO.md and summarize incomplete tasks
   */
  async handleWhatsLeft(repoName) {
    if (!repoName) {
      return this.error(
        `No repo specified and no active project.\n\n` +
        `Use: "what's left on <repo>"\n` +
        `Or: "switch to <repo>" first`
      );
    }

    this.log('info', `Getting incomplete tasks for: ${repoName}`);

    // Resolve repo name
    const resolvedRepo = await this.resolveRepoName(repoName);
    if (!resolvedRepo) {
      return this.error(`Repository "${repoName}" not found.`);
    }

    // Fetch TODO.md
    const todoContent = await this.fetchFileContent(resolvedRepo, 'TODO.md') ||
                        await this.fetchFileContent(resolvedRepo, 'docs/TODO.md');

    if (!todoContent) {
      return this.success(
        `*What's Left on ${resolvedRepo}*\n\n` +
        `No TODO.md found - can't determine remaining tasks.\n\n` +
        `_Check "readme ${resolvedRepo}" for project info_`
      );
    }

    // Parse and show only incomplete tasks
    const tasks = this.parseTodoContent(todoContent);
    const incomplete = [...tasks.notStarted, ...tasks.inProgress];

    if (incomplete.length === 0) {
      return this.success(
        `*What's Left on ${resolvedRepo}*\n\n` +
        `All tasks complete! Nothing remaining.\n\n` +
        `Completed: ${tasks.completed.length} tasks`
      );
    }

    let output = `*What's Left on ${resolvedRepo}*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;

    output += `*Remaining: ${incomplete.length} tasks*\n\n`;

    if (tasks.notStarted.length > 0) {
      output += `Not Started (${tasks.notStarted.length}):\n`;
      tasks.notStarted.slice(0, 10).forEach(task => {
        output += `- ${task}\n`;
      });
      if (tasks.notStarted.length > 10) {
        output += `...and ${tasks.notStarted.length - 10} more\n`;
      }
      output += '\n';
    }

    if (tasks.inProgress.length > 0) {
      output += `In Progress (${tasks.inProgress.length}):\n`;
      tasks.inProgress.forEach(task => {
        output += `- ${task}\n`;
      });
      output += '\n';
    }

    output += `\nCompleted: ${tasks.completed.length} tasks`;

    return this.success(this.truncateForWhatsApp(output));
  }

  /**
   * Fetch and summarize README
   */
  async handleShowReadme(repoName) {
    if (!repoName) {
      return this.error(
        `No repo specified and no active project.\n\n` +
        `Use: "readme <repo>"\n` +
        `Or: "switch to <repo>" first`
      );
    }

    this.log('info', `Fetching README for: ${repoName}`);

    // Resolve repo name
    const resolvedRepo = await this.resolveRepoName(repoName);
    if (!resolvedRepo) {
      return this.error(`Repository "${repoName}" not found.`);
    }

    // Check cache
    const cacheKey = `readme-${resolvedRepo}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    // Try different README locations
    const readmeContent = await this.fetchFileContent(resolvedRepo, 'README.md') ||
                          await this.fetchFileContent(resolvedRepo, 'readme.md') ||
                          await this.fetchFileContent(resolvedRepo, 'Readme.md');

    if (!readmeContent) {
      return this.success(
        `*${resolvedRepo} README*\n\n` +
        `No README.md found in this repository.`
      );
    }

    // Summarize README (extract key sections)
    const output = this.summarizeReadme(resolvedRepo, readmeContent);
    cache.set(cacheKey, output, 60);
    return this.success(output);
  }

  /**
   * List key files in repo
   */
  async handleProjectFiles(repoName) {
    if (!repoName) {
      return this.error(
        `No repo specified and no active project.\n\n` +
        `Use: "files <repo>"\n` +
        `Or: "switch to <repo>" first`
      );
    }

    this.log('info', `Listing files for: ${repoName}`);

    // Resolve repo name
    const resolvedRepo = await this.resolveRepoName(repoName);
    if (!resolvedRepo) {
      return this.error(`Repository "${repoName}" not found.`);
    }

    // Check cache
    const cacheKey = `files-${resolvedRepo}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return this.success(cached);
    }

    try {
      const response = await this.automation.octokit.repos.getContent({
        owner: this.automation.username,
        repo: resolvedRepo,
        path: ''
      });

      // Separate directories and files
      const dirs = response.data.filter(item => item.type === 'dir');
      const files = response.data.filter(item => item.type === 'file');

      let output = `*${resolvedRepo} - Project Files*\n`;
      output += `${''.padEnd(20, '\u2501')}\n\n`;

      // Key files first
      const keyFiles = ['package.json', 'README.md', 'TODO.md', 'CLAUDE.md',
                        'index.js', 'index.ts', 'main.py', 'app.py',
                        'Dockerfile', '.env.example', 'requirements.txt'];

      const foundKeyFiles = files.filter(f => keyFiles.includes(f.name));
      if (foundKeyFiles.length > 0) {
        output += `*Key Files:*\n`;
        foundKeyFiles.forEach(file => {
          output += `- ${file.name}\n`;
        });
        output += '\n';
      }

      // Directories
      if (dirs.length > 0) {
        output += `*Directories:*\n`;
        dirs.slice(0, 15).forEach(dir => {
          output += `/ ${dir.name}\n`;
        });
        if (dirs.length > 15) {
          output += `...and ${dirs.length - 15} more\n`;
        }
        output += '\n';
      }

      // Other files
      const otherFiles = files.filter(f => !keyFiles.includes(f.name));
      if (otherFiles.length > 0) {
        output += `*Other Files:*\n`;
        otherFiles.slice(0, 10).forEach(file => {
          output += `- ${file.name}\n`;
        });
        if (otherFiles.length > 10) {
          output += `...and ${otherFiles.length - 10} more\n`;
        }
      }

      output += `\n_Use "read file ${resolvedRepo} <path>" to view a file_`;

      cache.set(cacheKey, output, 60);
      return this.success(output);

    } catch (err) {
      if (err.status === 404) {
        return this.error(`Repository "${resolvedRepo}" not found or empty.`);
      }
      return this.error(`Failed to list files: ${err.message}`);
    }
  }

  // ============ Helper Methods ============

  /**
   * Resolve repo name using fuzzy matching
   */
  async resolveRepoName(input) {
    if (!input) return null;

    const normalizedInput = input.toLowerCase().trim();

    // Check aliases first
    if (this.repoAliases[normalizedInput]) {
      return this.repoAliases[normalizedInput];
    }

    // Get all repos (with caching)
    let repos = cache.get('repo-list');
    if (!repos) {
      try {
        const response = await this.automation.octokit.repos.listForAuthenticatedUser({
          per_page: 100,
          sort: 'updated'
        });
        repos = response.data.map(r => r.name);
        cache.set('repo-list', repos, 60);
      } catch (err) {
        this.log('error', 'Failed to fetch repos for matching', err);
        return input; // Return original input as fallback
      }
    }

    // Exact match
    const exactMatch = repos.find(r => r.toLowerCase() === normalizedInput);
    if (exactMatch) return exactMatch;

    // Contains match
    const containsMatch = repos.find(r =>
      r.toLowerCase().includes(normalizedInput) ||
      normalizedInput.includes(r.toLowerCase())
    );
    if (containsMatch) return containsMatch;

    // Fuzzy match (start of word)
    const fuzzyMatch = repos.find(r =>
      r.toLowerCase().startsWith(normalizedInput) ||
      r.toLowerCase().split('-').some(part => part.startsWith(normalizedInput))
    );
    if (fuzzyMatch) return fuzzyMatch;

    // No match found
    return null;
  }

  /**
   * Fetch file content from repo
   */
  async fetchFileContent(repoName, filePath) {
    try {
      const response = await this.automation.octokit.repos.getContent({
        owner: this.automation.username,
        repo: repoName,
        path: filePath
      });

      if (response.data.type !== 'file') return null;
      return Buffer.from(response.data.content, 'base64').toString('utf8');

    } catch (err) {
      return null; // File not found
    }
  }

  /**
   * Parse TODO.md content into categorized tasks
   */
  parseTodoContent(content) {
    const tasks = {
      notStarted: [],
      inProgress: [],
      completed: []
    };

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip headers and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;

      // Check for emoji status markers
      if (trimmed.startsWith('\u2B1C') || trimmed.startsWith(':white_large_square:')) {
        // Not started
        tasks.notStarted.push(trimmed.replace(/^[\u2B1C:white_large_square:]\s*/, ''));
      } else if (trimmed.startsWith('\uD83D\uDFE1') || trimmed.startsWith(':yellow_circle:')) {
        // In progress
        tasks.inProgress.push(trimmed.replace(/^[\uD83D\uDFE1:yellow_circle:]\s*/, ''));
      } else if (trimmed.startsWith('\u2705') || trimmed.startsWith(':white_check_mark:')) {
        // Completed
        tasks.completed.push(trimmed.replace(/^[\u2705:white_check_mark:]\s*/, ''));
      }
      // Check for markdown checkboxes
      else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('* [ ]')) {
        tasks.notStarted.push(trimmed.replace(/^[-*]\s*\[\s*\]\s*/, ''));
      } else if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]') ||
                 trimmed.startsWith('* [x]') || trimmed.startsWith('* [X]')) {
        tasks.completed.push(trimmed.replace(/^[-*]\s*\[[xX]\]\s*/, ''));
      }
      // Bullet points without status (treat as not started)
      else if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('\u2022')) {
        // Only add if it looks like a task (not too long, not a description)
        const taskText = trimmed.replace(/^[-*\u2022]\s*/, '');
        if (taskText.length < 100 && !taskText.includes(':')) {
          tasks.notStarted.push(taskText);
        }
      }
    }

    return tasks;
  }

  /**
   * Format project status output
   */
  formatProjectStatus(repoName, todoContent) {
    const tasks = this.parseTodoContent(todoContent);
    const total = tasks.notStarted.length + tasks.inProgress.length + tasks.completed.length;

    let output = `*${repoName.toUpperCase()} PROJECT STATUS*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;

    if (total === 0) {
      output += `No tasks found in TODO.md\n\n`;
      output += `_The file may use a different format_`;
      return output;
    }

    // Not started
    if (tasks.notStarted.length > 0) {
      output += `\u2B1C *Not Started (${tasks.notStarted.length}):*\n`;
      tasks.notStarted.slice(0, 8).forEach(task => {
        output += `- ${task}\n`;
      });
      if (tasks.notStarted.length > 8) {
        output += `...and ${tasks.notStarted.length - 8} more\n`;
      }
      output += '\n';
    }

    // In progress
    if (tasks.inProgress.length > 0) {
      output += `\uD83D\uDFE1 *In Progress (${tasks.inProgress.length}):*\n`;
      tasks.inProgress.forEach(task => {
        output += `- ${task}\n`;
      });
      output += '\n';
    }

    // Completed (summarized)
    if (tasks.completed.length > 0) {
      output += `\u2705 *Completed (${tasks.completed.length}):*\n`;
      tasks.completed.slice(0, 5).forEach(task => {
        output += `- ${task}\n`;
      });
      if (tasks.completed.length > 5) {
        output += `...and ${tasks.completed.length - 5} more\n`;
      }
    }

    output += `\n_Total: ${total} tasks | ${Math.round((tasks.completed.length / total) * 100)}% complete_`;

    return this.truncateForWhatsApp(output);
  }

  /**
   * Summarize README content
   */
  summarizeReadme(repoName, content) {
    let output = `*${repoName} README*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;

    // Extract title (first H1)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      output += `*${titleMatch[1]}*\n\n`;
    }

    // Extract description (first paragraph after title)
    const paragraphs = content.split(/\n\n+/);
    const descPara = paragraphs.find(p =>
      !p.startsWith('#') &&
      !p.startsWith('```') &&
      p.trim().length > 20 &&
      p.trim().length < 500
    );
    if (descPara) {
      output += `${descPara.trim().substring(0, 300)}\n\n`;
    }

    // Extract key sections
    const sections = ['Installation', 'Usage', 'Getting Started', 'Quick Start',
                      'Features', 'Requirements', 'Setup'];

    const foundSections = [];
    for (const section of sections) {
      const regex = new RegExp(`^##?\\s+${section}[\\s\\S]*?(?=^##|$)`, 'mi');
      const match = content.match(regex);
      if (match) {
        foundSections.push(section);
      }
    }

    if (foundSections.length > 0) {
      output += `*Sections:* ${foundSections.join(', ')}\n`;
    }

    // Character count
    output += `\n_README: ${content.length.toLocaleString()} chars_`;

    return this.truncateForWhatsApp(output);
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
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  /**
   * Truncate message for WhatsApp (max ~4000 chars)
   */
  truncateForWhatsApp(message, maxLength = 3800) {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '\n\n_...message truncated_';
  }
}

module.exports = ProjectContextSkill;
