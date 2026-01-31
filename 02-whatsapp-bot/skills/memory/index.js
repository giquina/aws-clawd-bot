/**
 * Memory Skill - Manage user facts and persistent memory
 *
 * Allows users to save, retrieve, and manage facts about themselves.
 * Uses the MemoryManager for persistent SQLite storage.
 *
 * Commands:
 *   remember [fact]          - Save a fact about yourself
 *   my facts | what do you know about me  - List all stored facts
 *   forget [topic]           - Search and delete facts containing a topic
 *   clear memory             - Clear conversation history (with confirmation)
 *
 * @example
 * remember I work as a software engineer at TechCorp
 * my facts
 * forget TechCorp
 * clear memory
 */
const BaseSkill = require('../base-skill');

class MemorySkill extends BaseSkill {
  name = 'memory';
  description = 'Save and retrieve facts about yourself';
  priority = 50; // Medium priority, after help but before general AI

  commands = [
    {
      pattern: /^remember\s+(.+)$/i,
      description: 'Save a fact about yourself',
      usage: 'remember <fact>'
    },
    {
      pattern: /^(my\s+facts|what\s+do\s+you\s+know\s+about\s+me)$/i,
      description: 'List all facts you\'ve shared with me',
      usage: 'my facts'
    },
    {
      pattern: /^forget\s+(.+)$/i,
      description: 'Delete facts containing a topic',
      usage: 'forget <topic>'
    },
    {
      pattern: /^clear\s+memory$/i,
      description: 'Clear conversation history',
      usage: 'clear memory'
    }
  ];

  /**
   * Execute memory commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    // Ensure memory manager is available
    if (!this.memory) {
      return this.error('Memory system not initialized. Please try again.');
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "remember" command
    if (lowerCommand.startsWith('remember ')) {
      return this.handleRememberCommand(userId, parsed.args.join(' '));
    }

    // Handle "my facts" or "what do you know about me"
    if (lowerCommand === 'my facts' || lowerCommand === 'what do you know about me') {
      return this.handleListFactsCommand(userId);
    }

    // Handle "forget" command
    if (lowerCommand.startsWith('forget ')) {
      const topic = parsed.args.join(' ');
      return this.handleForgetCommand(userId, topic);
    }

    // Handle "clear memory" command
    if (lowerCommand === 'clear memory') {
      return this.handleClearMemoryCommand(userId);
    }

    return this.error('Unknown memory command');
  }

  /**
   * Handle "remember [fact]" - Save a fact
   */
  handleRememberCommand(userId, fact) {
    if (!fact || fact.trim().length === 0) {
      return this.error('Please tell me what you\'d like me to remember.');
    }

    try {
      const factId = this.memory.saveFact(userId, fact, 'general', 'user_stated');

      const response = (
        '✅ *Remembered!*\n\n' +
        `I'll remember that you: ${fact}\n\n` +
        `_Fact #${factId} saved_`
      );

      this.log('info', `Saved fact for user ${userId}:`, fact);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error saving fact', error);
      return this.error('Failed to save the fact. Please try again.');
    }
  }

  /**
   * Handle "my facts" or "what do you know about me"
   */
  handleListFactsCommand(userId) {
    try {
      const facts = this.memory.getFacts(userId);

      if (facts.length === 0) {
        return this.success(
          '📝 *You haven\'t shared any facts with me yet.*\n\n' +
          'Try: remember <something about yourself>'
        );
      }

      let message = '📚 *Facts About You*\n';
      message += '━━━━━━━━━━━━━━━━━━━━━\n\n';

      facts.forEach((fact, index) => {
        const dateStr = this.formatDate(fact.updated_at);
        message += `${index + 1}. ${fact.fact}\n`;
        message += `   _${dateStr}_\n\n`;
      });

      message += '━━━━━━━━━━━━━━━━━━━━━\n';
      message += `_${facts.length} fact(s) stored_\n\n`;
      message += 'To forget something: forget <topic>';

      this.log('info', `Retrieved ${facts.length} facts for user ${userId}`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error retrieving facts', error);
      return this.error('Failed to retrieve your facts. Please try again.');
    }
  }

  /**
   * Handle "forget [topic]" - Delete facts containing a topic
   */
  handleForgetCommand(userId, topic) {
    if (!topic || topic.trim().length === 0) {
      return this.error('What would you like me to forget?');
    }

    try {
      const facts = this.memory.getFacts(userId);

      // Find facts matching the topic (case-insensitive)
      const matchingFacts = facts.filter(fact =>
        fact.fact.toLowerCase().includes(topic.toLowerCase())
      );

      if (matchingFacts.length === 0) {
        return this.success(
          `🤔 *No facts found about "${topic}"*\n\n` +
          'Try: forget <topic>\n' +
          'Or: my facts (to see all your facts)'
        );
      }

      // Delete matching facts
      let deletedCount = 0;
      matchingFacts.forEach(fact => {
        try {
          if (this.memory.deleteFact(userId, fact.id)) {
            deletedCount++;
          }
        } catch (e) {
          this.log('warn', `Failed to delete fact ${fact.id}`, e);
        }
      });

      let message = `🗑️ *Forgotten*\n\n`;
      message += `I've deleted ${deletedCount} fact(s) about "${topic}":\n\n`;

      matchingFacts.slice(0, 5).forEach((fact, idx) => {
        message += `${idx + 1}. ${fact.fact}\n`;
      });

      if (matchingFacts.length > 5) {
        message += `\n_...and ${matchingFacts.length - 5} more_`;
      }

      this.log('info', `Deleted ${deletedCount} facts for user ${userId}`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error deleting facts', error);
      return this.error('Failed to delete the facts. Please try again.');
    }
  }

  /**
   * Handle "clear memory" - Clear conversation history with confirmation
   * Note: In a real implementation, you might want two-step confirmation
   * For now, we provide the capability with a warning
   */
  handleClearMemoryCommand(userId) {
    try {
      const historySize = this.memory.getConversationHistory(userId, 1000).length;

      if (historySize === 0) {
        return this.success(
          '💭 *Conversation history already empty.*\n\n' +
          'There\'s nothing to clear.'
        );
      }

      // Clear the history
      const deleted = this.memory.clearHistory(userId);

      let message = '🧹 *Conversation history cleared*\n\n';
      message += `Deleted ${deleted} message(s) from our conversation.\n\n`;
      message += '⚠️ _This action cannot be undone._\n\n';
      message += '_Your stored facts remain intact._';

      this.log('info', `Cleared ${deleted} messages for user ${userId}`);
      return this.success(message);
    } catch (error) {
      this.log('error', 'Error clearing history', error);
      return this.error('Failed to clear memory. Please try again.');
    }
  }

  /**
   * Helper: Format date to readable string
   */
  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch (e) {
      return 'unknown date';
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Memory skill ready for use');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'facts',
      provider: 'MemoryManager'
    };
  }
}

module.exports = MemorySkill;
