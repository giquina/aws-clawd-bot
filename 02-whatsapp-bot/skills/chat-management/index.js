/**
 * Chat Management Skill - Register and manage chat contexts
 *
 * Provides commands to register chats for specific repos, companies, or HQ mode.
 * Enables multi-chat deployments with targeted notifications and context awareness.
 *
 * Commands:
 *   register chat for <repo>           - Register this chat for a repository
 *   register chat for company <code>   - Register this chat for a company
 *   register chat as hq                - Register as HQ (cross-repo access)
 *   unregister chat                    - Remove chat registration
 *   context                            - Show current chat context
 *   list chats                         - List all registered chats
 *   set notifications <level>          - Set notification level (all/critical/digest)
 *
 * @module skills/chat-management
 */

const BaseSkill = require('../base-skill');
const chatRegistry = require('../../lib/chat-registry');

class ChatManagementSkill extends BaseSkill {
  name = 'chat-management';
  description = 'Register and manage chat contexts for multi-chat deployments';
  priority = 90; // High priority for chat management commands

  commands = [
    {
      pattern: /^register( this)? chat (as |for )?(repo |project )?(.+)$/i,
      description: 'Register this chat for a repository',
      usage: 'register chat for aws-clawd-bot'
    },
    {
      pattern: /^register( this)? chat (as |for )?company (.+)$/i,
      description: 'Register this chat for a company',
      usage: 'register chat for company GMH'
    },
    {
      pattern: /^register( this)? chat as hq$/i,
      description: 'Register this chat as HQ (cross-repo access)',
      usage: 'register chat as hq'
    },
    {
      pattern: /^unregister( this)? chat$/i,
      description: 'Remove chat registration',
      usage: 'unregister chat'
    },
    {
      pattern: /^(chat |what('?s)? (this )?)?context$/i,
      description: 'Show current chat context',
      usage: 'context'
    },
    {
      pattern: /^list( registered)? chats$/i,
      description: 'List all registered chats',
      usage: 'list chats'
    },
    {
      pattern: /^set notifications? (all|critical|digest)$/i,
      description: 'Set notification level for this chat',
      usage: 'set notifications critical'
    },
    {
      pattern: /^chat stats$/i,
      description: 'Show chat registration statistics',
      usage: 'chat stats'
    }
  ];

  /**
   * Custom canHandle to support multiple patterns
   */
  canHandle(command, context = {}) {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const normalized = command.trim().toLowerCase();

    // Check all patterns
    return this.commands.some(cmd => cmd.pattern.test(normalized));
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const normalized = raw.toLowerCase().trim();
    const chatId = context.userId || context.chatId || context.from;

    if (!chatId) {
      return this.error('Unable to determine chat ID');
    }

    try {
      // Register as HQ
      if (/^register( this)? chat as hq$/i.test(normalized)) {
        return this.handleRegisterHQ(chatId, context);
      }

      // Register for company
      const companyMatch = raw.match(/^register( this)? chat (as |for )?company (.+)$/i);
      if (companyMatch) {
        const companyCode = companyMatch[3].trim();
        return this.handleRegisterCompany(chatId, companyCode, context);
      }

      // Register for repo
      const repoMatch = raw.match(/^register( this)? chat (as |for )?(repo |project )?(.+)$/i);
      if (repoMatch && !normalized.includes('hq') && !normalized.includes('company')) {
        const repoName = repoMatch[4].trim();
        return this.handleRegisterRepo(chatId, repoName, context);
      }

      // Unregister chat
      if (/^unregister( this)? chat$/i.test(normalized)) {
        return this.handleUnregister(chatId);
      }

      // Show context
      if (/^(chat |what('?s)? (this )?)?context$/i.test(normalized)) {
        return this.handleShowContext(chatId);
      }

      // List chats
      if (/^list( registered)? chats$/i.test(normalized)) {
        return this.handleListChats();
      }

      // Set notifications
      const notifMatch = raw.match(/^set notifications? (all|critical|digest)$/i);
      if (notifMatch) {
        const level = notifMatch[1].toLowerCase();
        return this.handleSetNotifications(chatId, level);
      }

      // Chat stats
      if (/^chat stats$/i.test(normalized)) {
        return this.handleChatStats();
      }

      return this.error('Command not recognized. Try "context" or "register chat for <repo>".');

    } catch (err) {
      this.log('error', 'Chat management command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * Register chat for a repository
   */
  handleRegisterRepo(chatId, repoName, context) {
    this.log('info', `Registering chat ${chatId} for repo: ${repoName}`);

    // Clean repo name (remove common prefixes)
    const cleanRepo = repoName
      .replace(/^(repo|project|repository)\s+/i, '')
      .replace(/^giquina\//i, '')
      .trim()
      .toLowerCase();

    if (!cleanRepo) {
      return this.error(
        'Please specify a repository name.\n\n' +
        'Usage: register chat for <repo-name>\n' +
        'Example: register chat for aws-clawd-bot'
      );
    }

    const registration = chatRegistry.registerForRepo(chatId, cleanRepo, {
      platform: context.platform || 'whatsapp',
      registeredBy: context.userId
    });

    return this.success(
      `*Chat Registered*\n\n` +
      `Repository: *${registration.repo}*\n` +
      `Notifications: ${registration.notifications}\n\n` +
      `This chat will now receive:\n` +
      `- GitHub events for ${registration.repo}\n` +
      `- Project status updates\n` +
      `- CI/CD notifications\n\n` +
      `_Use "context" to view | "unregister chat" to remove_`
    );
  }

  /**
   * Register chat for a company
   */
  handleRegisterCompany(chatId, companyCode, context) {
    this.log('info', `Registering chat ${chatId} for company: ${companyCode}`);

    // Validate company code
    const validCompanies = ['GMH', 'GACC', 'GCAP', 'GQCARS', 'GSPV'];
    const normalizedCode = companyCode.toUpperCase().trim();

    if (!validCompanies.includes(normalizedCode)) {
      return this.error(
        `Unknown company code: "${companyCode}"\n\n` +
        `Valid companies:\n` +
        validCompanies.map(c => `- ${c}`).join('\n') +
        `\n\nUsage: register chat for company GMH`
      );
    }

    const registration = chatRegistry.registerForCompany(chatId, normalizedCode, {
      platform: context.platform || 'whatsapp',
      registeredBy: context.userId
    });

    return this.success(
      `*Chat Registered*\n\n` +
      `Company: *${registration.company}*\n` +
      `Notifications: ${registration.notifications}\n\n` +
      `This chat will now receive:\n` +
      `- Deadline reminders for ${registration.company}\n` +
      `- Filing confirmations\n` +
      `- Company-specific alerts\n\n` +
      `_Use "context" to view | "unregister chat" to remove_`
    );
  }

  /**
   * Register chat as HQ
   */
  handleRegisterHQ(chatId, context) {
    this.log('info', `Registering chat ${chatId} as HQ`);

    const registration = chatRegistry.registerAsHQ(chatId, {
      platform: context.platform || 'whatsapp',
      registeredBy: context.userId
    });

    return this.success(
      `*Chat Registered as HQ*\n\n` +
      `Mode: *Cross-Repository Access*\n` +
      `Notifications: ${registration.notifications}\n\n` +
      `This chat will now receive:\n` +
      `- All GitHub events across repos\n` +
      `- All company notifications\n` +
      `- System-wide alerts\n\n` +
      `_Use "context" to view | "unregister chat" to remove_`
    );
  }

  /**
   * Unregister chat
   */
  handleUnregister(chatId) {
    this.log('info', `Unregistering chat ${chatId}`);

    const existing = chatRegistry.get(chatId);
    if (!existing) {
      return this.success(
        `*Chat Not Registered*\n\n` +
        `This chat has no active registration.\n\n` +
        `_Use "register chat for <repo>" to register_`
      );
    }

    const contextDesc = chatRegistry.formatContext(chatId);
    chatRegistry.unregister(chatId);

    return this.success(
      `*Chat Unregistered*\n\n` +
      `Removed: ${contextDesc}\n\n` +
      `This chat will no longer receive targeted notifications.\n\n` +
      `_Use "register chat for <repo>" to re-register_`
    );
  }

  /**
   * Show current chat context
   */
  handleShowContext(chatId) {
    const registration = chatRegistry.get(chatId);

    if (!registration) {
      return this.success(
        `*Chat Context*\n\n` +
        `Status: Not registered\n\n` +
        `This chat has no context registration.\n` +
        `All commands work, but no targeted notifications.\n\n` +
        `*Register with:*\n` +
        `- "register chat for <repo>" - Repository focus\n` +
        `- "register chat for company <code>" - Company focus\n` +
        `- "register chat as hq" - Cross-repo access`
      );
    }

    let output = `*Chat Context*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;

    // Context type and target
    output += `*Type:* ${this.capitalizeFirst(registration.type)}\n`;

    switch (registration.type) {
      case chatRegistry.CONTEXT_TYPES.REPO:
        output += `*Repository:* ${registration.repo}\n`;
        break;
      case chatRegistry.CONTEXT_TYPES.COMPANY:
        output += `*Company:* ${registration.company}\n`;
        break;
      case chatRegistry.CONTEXT_TYPES.HQ:
        output += `*Access:* All repositories & companies\n`;
        break;
    }

    output += `*Notifications:* ${registration.notifications}\n`;
    output += `*Platform:* ${registration.platform}\n`;

    // Registration info
    const regDate = new Date(registration.registeredAt);
    output += `\n*Registered:* ${this.formatDate(regDate)}\n`;

    if (registration.label) {
      output += `*Label:* ${registration.label}\n`;
    }

    output += `\n${''.padEnd(20, '\u2501')}\n`;
    output += `_"unregister chat" to remove | "set notifications <level>" to change_`;

    return this.success(output);
  }

  /**
   * List all registered chats
   */
  handleListChats() {
    const all = chatRegistry.getAll();

    if (all.length === 0) {
      return this.success(
        `*Registered Chats*\n\n` +
        `No chats registered yet.\n\n` +
        `_Use "register chat for <repo>" to register a chat_`
      );
    }

    let output = `*Registered Chats*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;
    output += `Total: ${all.length} chat(s)\n\n`;

    // Group by type
    const byType = {
      [chatRegistry.CONTEXT_TYPES.REPO]: [],
      [chatRegistry.CONTEXT_TYPES.COMPANY]: [],
      [chatRegistry.CONTEXT_TYPES.HQ]: []
    };

    for (const reg of all) {
      byType[reg.type].push(reg);
    }

    // HQ chats
    if (byType[chatRegistry.CONTEXT_TYPES.HQ].length > 0) {
      output += `*HQ Chats (${byType[chatRegistry.CONTEXT_TYPES.HQ].length}):*\n`;
      for (const reg of byType[chatRegistry.CONTEXT_TYPES.HQ]) {
        const label = reg.label || 'HQ';
        output += `- ${label} (${reg.platform})\n`;
      }
      output += '\n';
    }

    // Repo chats
    if (byType[chatRegistry.CONTEXT_TYPES.REPO].length > 0) {
      output += `*Repository Chats (${byType[chatRegistry.CONTEXT_TYPES.REPO].length}):*\n`;
      for (const reg of byType[chatRegistry.CONTEXT_TYPES.REPO]) {
        output += `- ${reg.repo} (${reg.platform})\n`;
      }
      output += '\n';
    }

    // Company chats
    if (byType[chatRegistry.CONTEXT_TYPES.COMPANY].length > 0) {
      output += `*Company Chats (${byType[chatRegistry.CONTEXT_TYPES.COMPANY].length}):*\n`;
      for (const reg of byType[chatRegistry.CONTEXT_TYPES.COMPANY]) {
        output += `- ${reg.company} (${reg.platform})\n`;
      }
    }

    return this.success(output);
  }

  /**
   * Set notification level
   */
  handleSetNotifications(chatId, level) {
    this.log('info', `Setting notifications for ${chatId} to: ${level}`);

    const existing = chatRegistry.get(chatId);
    if (!existing) {
      return this.error(
        `This chat is not registered.\n\n` +
        `Register first with: "register chat for <repo>"\n` +
        `Then set notifications.`
      );
    }

    const success = chatRegistry.setNotificationLevel(chatId, level);
    if (!success) {
      return this.error(`Failed to set notification level. Valid levels: all, critical, digest`);
    }

    const levelDescriptions = {
      all: 'All notifications (default)',
      critical: 'Only critical alerts (CI failures, errors)',
      digest: 'Daily digest only'
    };

    return this.success(
      `*Notification Level Updated*\n\n` +
      `Level: *${level}*\n` +
      `${levelDescriptions[level]}\n\n` +
      `Context: ${chatRegistry.formatContext(chatId)}`
    );
  }

  /**
   * Show chat registration statistics
   */
  handleChatStats() {
    const stats = chatRegistry.getStats();

    let output = `*Chat Registration Stats*\n`;
    output += `${''.padEnd(20, '\u2501')}\n\n`;

    output += `*Total Registered:* ${stats.total}\n\n`;

    output += `*By Type:*\n`;
    output += `- HQ Chats: ${stats.byType.hq}\n`;
    output += `- Repository Chats: ${stats.byType.repo}\n`;
    output += `- Company Chats: ${stats.byType.company}\n\n`;

    if (stats.repos.length > 0) {
      output += `*Repos (${stats.uniqueRepos}):*\n`;
      output += stats.repos.slice(0, 10).map(r => `- ${r}`).join('\n');
      if (stats.repos.length > 10) {
        output += `\n...and ${stats.repos.length - 10} more`;
      }
      output += '\n\n';
    }

    if (stats.companies.length > 0) {
      output += `*Companies (${stats.uniqueCompanies}):*\n`;
      output += stats.companies.map(c => `- ${c}`).join('\n');
    }

    return this.success(output);
  }

  // ============ Helper Methods ============

  /**
   * Capitalize first letter
   */
  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Format date for display
   */
  formatDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)} weeks ago`;
    } else {
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  }
}

module.exports = ChatManagementSkill;
