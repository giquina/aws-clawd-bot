/**
 * HQ Commands Skill for ClawdBot
 *
 * Cross-repo commands for HQ channel - aggregated queries and commands
 * that work across ALL monitored repositories.
 *
 * Commands:
 *   urgent / what's urgent     - Most urgent task across all repos
 *   all projects / all repos   - Summary of all projects
 *   search tasks <query>       - Search tasks across repos
 *   global brief / global digest - Aggregated morning brief
 *   hq status                  - Show HQ channel status
 *   switch to hq               - Enter HQ mode
 *   switch to repo <name>      - Focus on specific repo
 *
 * This skill has priority 95 (high) but checks chat context
 * to only handle commands in HQ mode.
 */

const BaseSkill = require('../base-skill');
const crossRepo = require('../../lib/cross-repo-queries');
const chatRegistry = require('../../lib/chat-registry');

class HQCommandsSkill extends BaseSkill {
  name = 'hq-commands';
  description = 'Cross-repo commands for HQ channel - aggregated queries across all repos';
  priority = 95; // High priority, but below help (100)

  commands = [
    {
      pattern: /^(?:what'?s?\s+)?urgent$/i,
      description: 'Most urgent task across all repos',
      usage: 'urgent OR whats urgent'
    },
    {
      pattern: /^all (?:projects?|repos?)(?:\s+status)?$/i,
      description: 'Summary of all projects',
      usage: 'all projects OR all repos status'
    },
    {
      pattern: /^search tasks?\s+(.+)$/i,
      description: 'Search tasks across repos',
      usage: 'search tasks <keyword>'
    },
    {
      pattern: /^global\s+(?:brief|digest|summary)$/i,
      description: 'Aggregated morning brief data',
      usage: 'global brief'
    },
    {
      pattern: /^hq\s+status$/i,
      description: 'Show HQ channel status',
      usage: 'hq status'
    },
    {
      pattern: /^switch\s+to\s+hq$/i,
      description: 'Enter HQ mode for cross-repo access',
      usage: 'switch to hq'
    },
    {
      pattern: /^switch\s+to\s+repo\s+(.+)$/i,
      description: 'Focus on a specific repository',
      usage: 'switch to repo <name>'
    },
    {
      pattern: /^completion\s+(?:rate|stats?)$/i,
      description: 'Task completion rate across all repos',
      usage: 'completion rate'
    },
    {
      pattern: /^urgent\s+items$/i,
      description: 'All urgent items (CI failures, stale PRs, urgent tasks)',
      usage: 'urgent items'
    }
  ];

  constructor(context = {}) {
    super(context);
  }

  /**
   * Check if this skill should handle the command
   * Handles commands in HQ mode OR mode-switching commands
   */
  canHandle(command, context = {}) {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const normalizedCommand = command.trim().toLowerCase();

    // Always handle mode-switching commands regardless of current mode
    if (/^switch\s+to\s+(hq|repo\s+.+)$/i.test(normalizedCommand)) {
      return true;
    }

    // Always handle hq status command
    if (/^hq\s+status$/i.test(normalizedCommand)) {
      return true;
    }

    // For other commands, check if in HQ mode
    const userId = context.from || context.userId;
    if (userId) {
      const chatContext = chatRegistry.get(userId);

      // If explicitly in repo mode, let repo-specific skills handle
      if (chatContext && chatContext.type === chatRegistry.CONTEXT_TYPES.REPO) {
        return false;
      }
    }

    // Check if command matches our patterns
    return super.canHandle(command, context);
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const userId = context.from || context.userId;

    try {
      // Mode switching - switch to hq
      if (/^switch\s+to\s+hq$/i.test(raw)) {
        return await this.handleSwitchToHQ(userId);
      }

      // Mode switching - switch to repo
      const repoMatch = raw.match(/^switch\s+to\s+repo\s+(.+)$/i);
      if (repoMatch) {
        return await this.handleSwitchToRepo(userId, repoMatch[1].trim());
      }

      // HQ status
      if (/^hq\s+status$/i.test(raw)) {
        return await this.handleHQStatus(userId);
      }

      // What's urgent
      if (/^(?:what'?s?\s+)?urgent$/i.test(raw)) {
        return await this.handleWhatsUrgent();
      }

      // All projects
      if (/^all (?:projects?|repos?)(?:\s+status)?$/i.test(raw)) {
        return await this.handleAllProjects();
      }

      // Search tasks
      const searchMatch = raw.match(/^search tasks?\s+(.+)$/i);
      if (searchMatch) {
        return await this.handleSearchTasks(searchMatch[1].trim());
      }

      // Global brief
      if (/^global\s+(?:brief|digest|summary)$/i.test(raw)) {
        return await this.handleGlobalBrief();
      }

      // Completion rate
      if (/^completion\s+(?:rate|stats?)$/i.test(raw)) {
        return await this.handleCompletionRate();
      }

      // Urgent items
      if (/^urgent\s+items$/i.test(raw)) {
        return await this.handleUrgentItems();
      }

      return this.error('Command not recognized. Try "urgent", "all projects", or "search tasks <keyword>".');

    } catch (err) {
      this.log('error', 'HQ command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * Switch to HQ mode
   */
  async handleSwitchToHQ(userId) {
    if (!userId) {
      return this.error('Unable to identify user for mode switch.');
    }

    chatRegistry.registerAsHQ(userId, {
      platform: 'whatsapp',
      registeredBy: userId
    });

    return this.success(
      '*Switched to HQ Mode*\n\n' +
      'You now have cross-repo access.\n\n' +
      '*Available commands:*\n' +
      '- `urgent` - Most urgent task across all repos\n' +
      '- `all projects` - Summary of all projects\n' +
      '- `search tasks <keyword>` - Search across repos\n' +
      '- `global brief` - Aggregated daily brief\n' +
      '- `urgent items` - CI failures, stale PRs\n' +
      '- `completion rate` - Overall progress\n\n' +
      '_Use "switch to repo <name>" to focus on a specific project_'
    );
  }

  /**
   * Switch to repo-specific mode
   */
  async handleSwitchToRepo(userId, repoName) {
    if (!userId) {
      return this.error('Unable to identify user for mode switch.');
    }

    // Validate repo exists in monitored repos
    const repos = crossRepo.getMonitoredRepos();
    const normalizedName = repoName.toLowerCase();

    // Fuzzy match
    const matchedRepo = repos.find(r =>
      r.toLowerCase() === normalizedName ||
      r.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(r.toLowerCase())
    );

    if (!matchedRepo && repos.length > 0) {
      return this.error(
        `Repository "${repoName}" not found in monitored repos.\n\n` +
        `*Available repos:*\n${repos.slice(0, 10).map(r => `- ${r}`).join('\n')}` +
        (repos.length > 10 ? `\n...and ${repos.length - 10} more` : '')
      );
    }

    const finalRepoName = matchedRepo || repoName;

    chatRegistry.registerForRepo(userId, finalRepoName, {
      platform: 'whatsapp',
      registeredBy: userId
    });

    return this.success(
      `*Switched to Repo Mode: ${finalRepoName}*\n\n` +
      `Commands will now focus on this repository.\n\n` +
      '_Use "switch to hq" to return to cross-repo mode_'
    );
  }

  /**
   * Show HQ status
   */
  async handleHQStatus(userId) {
    const context = userId ? chatRegistry.get(userId) : null;
    const stats = chatRegistry.getStats();

    let output = '*HQ STATUS*\n';
    output += '\u2501'.repeat(20) + '\n\n';

    // Current context
    output += '*Your Mode:* ';
    if (!context) {
      output += 'Default (HQ)\n';
    } else if (context.type === chatRegistry.CONTEXT_TYPES.HQ) {
      output += 'HQ (cross-repo)\n';
    } else if (context.type === chatRegistry.CONTEXT_TYPES.REPO) {
      output += `Repo (${context.repo})\n`;
    } else if (context.type === chatRegistry.CONTEXT_TYPES.COMPANY) {
      output += `Company (${context.company})\n`;
    }

    output += '\n*Registry Stats:*\n';
    output += `- Total registrations: ${stats.total}\n`;
    output += `- HQ chats: ${stats.byType.hq}\n`;
    output += `- Repo chats: ${stats.byType.repo}\n`;
    output += `- Company chats: ${stats.byType.company}\n`;

    // Monitored repos
    const repos = crossRepo.getMonitoredRepos();
    output += `\n*Monitored Repos:* ${repos.length}\n`;
    if (repos.length > 0) {
      output += repos.slice(0, 5).map(r => `- ${r}`).join('\n');
      if (repos.length > 5) {
        output += `\n...and ${repos.length - 5} more`;
      }
    }

    return this.success(output);
  }

  /**
   * Get most urgent task across all repos
   */
  async handleWhatsUrgent() {
    this.log('info', 'Getting most urgent task');

    const urgent = await crossRepo.getMostUrgentTask();

    if (!urgent) {
      return this.success(
        '*URGENT TASK*\n\n' +
        '\u2705 No urgent tasks found across all repos!\n\n' +
        '_All clear - great job!_'
      );
    }

    let output = '*MOST URGENT TASK*\n';
    output += '\u2501'.repeat(20) + '\n\n';

    const icon = urgent.priority === 'in_progress' ? '\uD83D\uDFE1' : '\u2B1C';
    const status = urgent.priority === 'in_progress' ? 'In Progress' : 'Not Started';

    output += `${icon} *${urgent.repo}*\n`;
    output += `Task: ${urgent.task.text}\n`;
    output += `Status: ${status}\n`;
    output += `Section: ${urgent.task.section}\n`;
    output += `\n_${urgent.totalPending} total pending tasks in this repo_`;

    return this.success(output);
  }

  /**
   * Get summary of all projects
   */
  async handleAllProjects() {
    this.log('info', 'Getting all projects summary');

    const summaries = await crossRepo.getAllProjectsSummary();

    if (summaries.length === 0) {
      return this.error(
        'No projects found.\n\n' +
        'Check that REPOS_TO_MONITOR is configured in your environment.'
      );
    }

    const output = crossRepo.formatSummaryForWhatsApp(summaries);
    return this.success(output);
  }

  /**
   * Search tasks across all repos
   */
  async handleSearchTasks(keyword) {
    this.log('info', `Searching tasks for: ${keyword}`);

    if (keyword.length < 2) {
      return this.error('Search keyword must be at least 2 characters.');
    }

    const matches = await crossRepo.searchTasks(keyword);

    if (matches.length === 0) {
      return this.success(
        `*SEARCH: "${keyword}"*\n\n` +
        `No matching tasks found across any repos.`
      );
    }

    let output = `*SEARCH: "${keyword}"*\n`;
    output += `Found ${matches.length} matching task(s)\n`;
    output += '\u2501'.repeat(20) + '\n\n';

    // Group by repo
    const byRepo = {};
    for (const match of matches) {
      if (!byRepo[match.repo]) {
        byRepo[match.repo] = [];
      }
      byRepo[match.repo].push(match);
    }

    for (const [repo, tasks] of Object.entries(byRepo)) {
      output += `*${repo}:*\n`;
      for (const task of tasks.slice(0, 3)) {
        const icon = task.status === 'completed' ? '\u2705' :
                     task.status === 'in_progress' ? '\uD83D\uDFE1' : '\u2B1C';
        output += `${icon} ${task.task.substring(0, 60)}${task.task.length > 60 ? '...' : ''}\n`;
      }
      if (tasks.length > 3) {
        output += `   _+${tasks.length - 3} more in this repo_\n`;
      }
      output += '\n';
    }

    return this.success(this.truncateForWhatsApp(output));
  }

  /**
   * Get aggregated global brief
   */
  async handleGlobalBrief() {
    this.log('info', 'Generating global brief');

    const briefData = await crossRepo.getAggregatedBrief();

    let output = '*GLOBAL BRIEF*\n';
    output += `Date: ${briefData.date}\n`;
    output += '\u2501'.repeat(20) + '\n\n';

    // Stats
    output += '*Overview:*\n';
    output += `- Projects: ${briefData.stats.totalProjects} (${briefData.stats.activeProjects} active)\n`;
    output += `- Tasks: ${briefData.stats.totalPending} pending, ${briefData.stats.totalInProgress} in progress\n`;
    output += `- Completed: ${briefData.stats.totalCompleted}\n\n`;

    // Urgent items
    const urgent = briefData.urgentItems;
    if (urgent.ciFailures.length > 0 || urgent.stalePRs.length > 0 || urgent.urgentTasks.length > 0) {
      output += '*Attention Needed:*\n';

      for (const failure of urgent.ciFailures.slice(0, 2)) {
        output += `\u26A0\uFE0F CI failed on ${failure.repo}\n`;
      }

      for (const pr of urgent.stalePRs.slice(0, 2)) {
        output += `\uD83D\uDCDD PR #${pr.number} on ${pr.repo} (${pr.daysOld}d old)\n`;
      }

      for (const task of urgent.urgentTasks.slice(0, 2)) {
        output += `\u203C\uFE0F ${task.repo}: ${task.task.substring(0, 40)}...\n`;
      }
      output += '\n';
    }

    // Recommendation
    if (briefData.recommendation) {
      output += `*Recommendation:*\n${briefData.recommendation}\n`;
    }

    return this.success(output);
  }

  /**
   * Get completion rate stats
   */
  async handleCompletionRate() {
    this.log('info', 'Getting completion rate');

    const rate = await crossRepo.getCompletionRate();

    let output = '*COMPLETION RATE*\n';
    output += '\u2501'.repeat(20) + '\n\n';

    // Progress bar visualization
    const filled = Math.round(rate.completionRate / 10);
    const empty = 10 - filled;
    const progressBar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

    output += `${progressBar} ${rate.completionRate}%\n\n`;

    output += `*Stats:*\n`;
    output += `- Total tasks: ${rate.totalTasks}\n`;
    output += `- Completed: ${rate.completedTasks}\n`;
    output += `- Pending: ${rate.pendingTasks}\n`;
    output += `- Projects: ${rate.projectCount} (${rate.activeProjects} with pending tasks)\n`;

    return this.success(output);
  }

  /**
   * Get all urgent items
   */
  async handleUrgentItems() {
    this.log('info', 'Getting urgent items');

    const items = await crossRepo.getUrgentItems();

    let output = '*URGENT ITEMS*\n';
    output += '\u2501'.repeat(20) + '\n\n';

    const hasItems = items.ciFailures.length > 0 ||
                     items.stalePRs.length > 0 ||
                     items.urgentTasks.length > 0;

    if (!hasItems) {
      output += '\u2705 No urgent items!\n\n';
      output += '_All CI passing, no stale PRs, no urgent tasks_';
      return this.success(output);
    }

    // CI Failures
    if (items.ciFailures.length > 0) {
      output += `*CI Failures (${items.ciFailures.length}):*\n`;
      for (const failure of items.ciFailures.slice(0, 3)) {
        output += `\u26A0\uFE0F ${failure.repo}: ${failure.workflow} (${failure.branch})\n`;
      }
      output += '\n';
    }

    // Stale PRs
    if (items.stalePRs.length > 0) {
      output += `*Stale PRs (${items.stalePRs.length}):*\n`;
      for (const pr of items.stalePRs.slice(0, 3)) {
        output += `\uD83D\uDCDD #${pr.number} ${pr.repo}: ${pr.title.substring(0, 30)}... (${pr.daysOld}d)\n`;
      }
      output += '\n';
    }

    // Urgent Tasks
    if (items.urgentTasks.length > 0) {
      output += `*Urgent Tasks (${items.urgentTasks.length}):*\n`;
      for (const task of items.urgentTasks.slice(0, 3)) {
        output += `\u203C\uFE0F ${task.repo}: ${task.task.substring(0, 40)}...\n`;
      }
    }

    return this.success(output);
  }

  // ============ Helper Methods ============

  /**
   * Truncate message for WhatsApp (max ~4000 chars)
   */
  truncateForWhatsApp(message, maxLength = 3800) {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '\n\n_...message truncated_';
  }
}

module.exports = HQCommandsSkill;
