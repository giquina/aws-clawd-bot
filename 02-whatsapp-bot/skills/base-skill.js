/**
 * BaseSkill - Abstract base class for all ClawdBot skills
 *
 * All skills must extend this class and implement the required methods.
 * Skills are modular command handlers that can be loaded/unloaded dynamically.
 *
 * @example
 * class MySkill extends BaseSkill {
 *   name = 'myskill'
 *   description = 'Does something useful'
 *   commands = [
 *     { pattern: /^do something/i, description: 'Do something useful' }
 *   ]
 *
 *   async execute(command, context) {
 *     return { success: true, message: 'Done!' }
 *   }
 * }
 */
class BaseSkill {
  /**
   * Unique name identifier for this skill
   * @type {string}
   */
  name = 'base';

  /**
   * Human-readable description of what this skill does
   * @type {string}
   */
  description = '';

  /**
   * Array of command patterns this skill can handle
   * Each command should have: { pattern: RegExp, description: string, usage?: string }
   * @type {Array<{pattern: RegExp, description: string, usage?: string}>}
   */
  commands = [];

  /**
   * Priority for command routing (higher = checked first)
   * Default is 0, use higher values for skills that should take precedence
   * @type {number}
   */
  priority = 0;

  /**
   * Whether this skill requires authentication
   * @type {boolean}
   */
  requiresAuth = false;

  /**
   * Create a new skill instance
   * @param {Object} context - Shared context object
   * @param {Object} context.memory - Memory manager instance
   * @param {Object} context.ai - AI handler instance
   * @param {Object} context.config - Configuration object
   * @param {Object} context.logger - Logger instance
   */
  constructor(context = {}) {
    this.memory = context.memory || null;
    this.ai = context.ai || null;
    this.config = context.config || {};
    this.logger = context.logger || console;
    this._initialized = false;
  }

  /**
   * Check if this skill can handle the given command
   * Override this for custom matching logic
   * @param {string} command - The command string to check
   * @returns {boolean} - True if this skill can handle the command
   */
  canHandle(command) {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const normalizedCommand = command.trim().toLowerCase();

    return this.commands.some(cmd => {
      if (cmd.pattern instanceof RegExp) {
        return cmd.pattern.test(normalizedCommand);
      }
      if (typeof cmd.pattern === 'string') {
        return normalizedCommand.startsWith(cmd.pattern.toLowerCase());
      }
      return false;
    });
  }

  /**
   * Execute the command and return a response
   * Must be implemented by subclasses
   * @param {string} command - The command string to execute
   * @param {Object} context - Execution context
   * @param {string} context.from - Phone number of sender
   * @param {string} context.messageId - Unique message ID
   * @param {Date} context.timestamp - Message timestamp
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  async execute(command, context) {
    throw new Error(`Skill "${this.name}" must implement execute() method`);
  }

  /**
   * Initialize the skill (called when skill is loaded)
   * Override this for setup tasks like loading state, connecting to services, etc.
   * @returns {Promise<void>}
   */
  async initialize() {
    this._initialized = true;
    this.log('info', `Skill "${this.name}" initialized`);
  }

  /**
   * Shutdown the skill (called when skill is unloaded)
   * Override this for cleanup tasks like saving state, closing connections, etc.
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._initialized = false;
    this.log('info', `Skill "${this.name}" shut down`);
  }

  /**
   * Check if the skill is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  // ============ Helper Methods ============

  /**
   * Parse a command string into parts
   * @param {string} command - The command string
   * @returns {{command: string, args: string[], raw: string, match: RegExpMatchArray|null}}
   */
  parseCommand(command) {
    if (!command || typeof command !== 'string') {
      return { command: '', args: [], raw: '', match: null };
    }

    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);

    // Find which pattern matched
    let match = null;
    for (const cmd of this.commands) {
      if (cmd.pattern instanceof RegExp) {
        match = trimmed.match(cmd.pattern);
        if (match) break;
      }
    }

    return {
      command: parts[0] || '',
      args: parts.slice(1),
      raw: trimmed,
      match
    };
  }

  /**
   * Format data for WhatsApp response
   * Handles common formatting patterns
   * @param {any} data - Data to format
   * @param {Object} options - Formatting options
   * @param {string} options.title - Optional title/header
   * @param {string} options.format - 'list', 'code', 'plain' (default: 'plain')
   * @returns {string}
   */
  formatResponse(data, options = {}) {
    const { title, format = 'plain' } = options;
    let result = '';

    if (title) {
      result += `*${title}*\n\n`;
    }

    if (format === 'list' && Array.isArray(data)) {
      result += data.map((item, i) => `${i + 1}. ${item}`).join('\n');
    } else if (format === 'code') {
      result += '```\n' + String(data) + '\n```';
    } else if (typeof data === 'object') {
      result += Object.entries(data)
        .map(([key, value]) => `• *${key}:* ${value}`)
        .join('\n');
    } else {
      result += String(data);
    }

    return result;
  }

  /**
   * Create a success response
   * @param {string} message - Success message
   * @param {any} data - Optional data payload
   * @returns {{success: true, message: string, data?: any}}
   */
  success(message, data = null) {
    const response = { success: true, message };
    if (data !== null) {
      response.data = data;
    }
    return response;
  }

  /**
   * Create an error response
   * @param {string} message - Error message
   * @param {Error|string} error - Optional error object
   * @returns {{success: false, message: string, error?: string}}
   */
  error(message, error = null) {
    const response = { success: false, message };
    if (error) {
      response.error = error instanceof Error ? error.message : String(error);
    }
    return response;
  }

  /**
   * Log a message with skill context
   * @param {'info'|'warn'|'error'|'debug'} level - Log level
   * @param {string} message - Message to log
   * @param {any} data - Optional data to include
   */
  log(level, message, data = null) {
    const prefix = `[Skill:${this.name}]`;
    const logFn = this.logger[level] || this.logger.log || console.log;

    if (data) {
      logFn.call(this.logger, prefix, message, data);
    } else {
      logFn.call(this.logger, prefix, message);
    }
  }

  /**
   * Get skill metadata for help/documentation
   * @returns {{name: string, description: string, commands: Array, priority: number}}
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      commands: this.commands.map(cmd => ({
        pattern: cmd.pattern.toString(),
        description: cmd.description,
        usage: cmd.usage || null
      })),
      priority: this.priority,
      requiresAuth: this.requiresAuth
    };
  }
}

module.exports = BaseSkill;
