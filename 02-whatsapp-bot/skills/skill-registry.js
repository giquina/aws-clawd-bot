/**
 * SkillRegistry - Central registry for managing ClawdBot skills
 *
 * Handles skill registration, routing commands to appropriate skills,
 * and lifecycle management. Exported as a singleton.
 *
 * @example
 * const registry = require('./skill-registry');
 *
 * registry.register(mySkill);
 * const result = await registry.route('help', context);
 */
const EventEmitter = require('events');

class SkillRegistry extends EventEmitter {
  constructor() {
    super();
    /**
     * Map of registered skills by name
     * @type {Map<string, BaseSkill>}
     */
    this.skills = new Map();

    /**
     * Shared context passed to all skills
     * @type {Object}
     */
    this.context = {
      memory: null,
      ai: null,
      config: {},
      logger: console
    };

    /**
     * Whether the registry has been initialized
     * @type {boolean}
     */
    this._initialized = false;
  }

  /**
   * Initialize the registry with shared context
   * @param {Object} context - Shared context for all skills
   * @param {Object} context.memory - Memory manager instance
   * @param {Object} context.ai - AI handler instance
   * @param {Object} context.config - Configuration object
   * @param {Object} context.logger - Logger instance
   */
  async initialize(context = {}) {
    this.context = {
      ...this.context,
      ...context
    };

    // Initialize all registered skills
    for (const [name, skill] of this.skills) {
      try {
        await skill.initialize();
        this.emit('skillInitialized', { name, skill });
      } catch (error) {
        console.error(`[Registry] Failed to initialize skill "${name}":`, error);
        this.emit('skillError', { name, error, phase: 'initialize' });
      }
    }

    this._initialized = true;
    this.emit('initialized');
    console.log(`[Registry] Initialized with ${this.skills.size} skill(s)`);
  }

  /**
   * Register a skill with the registry
   * @param {BaseSkill} skill - Skill instance to register
   * @returns {boolean} - True if registration successful
   */
  register(skill) {
    if (!skill || !skill.name) {
      console.error('[Registry] Cannot register skill without a name');
      return false;
    }

    if (this.skills.has(skill.name)) {
      console.warn(`[Registry] Skill "${skill.name}" already registered, replacing`);
      this.unregister(skill.name);
    }

    // Inject shared context if not already set
    if (!skill.memory && this.context.memory) {
      skill.memory = this.context.memory;
    }
    if (!skill.ai && this.context.ai) {
      skill.ai = this.context.ai;
    }
    if (!skill.config || Object.keys(skill.config).length === 0) {
      skill.config = this.context.config;
    }
    if (skill.logger === console && this.context.logger) {
      skill.logger = this.context.logger;
    }

    this.skills.set(skill.name, skill);
    this.emit('skillRegistered', { name: skill.name, skill });
    console.log(`[Registry] Registered skill: ${skill.name}`);

    // Initialize if registry is already initialized
    if (this._initialized && !skill.isInitialized()) {
      skill.initialize().catch(err => {
        console.error(`[Registry] Failed to initialize skill "${skill.name}":`, err);
        this.emit('skillError', { name: skill.name, error: err, phase: 'initialize' });
      });
    }

    return true;
  }

  /**
   * Unregister a skill by name
   * @param {string} skillName - Name of the skill to unregister
   * @returns {boolean} - True if unregistration successful
   */
  async unregister(skillName) {
    if (!this.skills.has(skillName)) {
      console.warn(`[Registry] Skill "${skillName}" not found`);
      return false;
    }

    const skill = this.skills.get(skillName);

    try {
      await skill.shutdown();
    } catch (error) {
      console.error(`[Registry] Error shutting down skill "${skillName}":`, error);
      this.emit('skillError', { name: skillName, error, phase: 'shutdown' });
    }

    this.skills.delete(skillName);
    this.emit('skillUnregistered', { name: skillName });
    console.log(`[Registry] Unregistered skill: ${skillName}`);

    return true;
  }

  /**
   * Get a skill by name
   * @param {string} skillName - Name of the skill
   * @returns {BaseSkill|null}
   */
  getSkill(skillName) {
    return this.skills.get(skillName) || null;
  }

  /**
   * Check if a skill is registered
   * @param {string} skillName - Name of the skill
   * @returns {boolean}
   */
  hasSkill(skillName) {
    return this.skills.has(skillName);
  }

  /**
   * Route a command to the appropriate skill and execute it
   * @param {string} command - Command string to route
   * @param {Object} context - Execution context (from, messageId, timestamp, etc.)
   * @returns {Promise<{success: boolean, message: string, skill?: string, data?: any}>}
   */
  async route(command, context = {}) {
    if (!command || typeof command !== 'string') {
      return {
        success: false,
        message: 'Invalid command',
        skill: null
      };
    }

    const normalizedCommand = command.trim();

    // Get skills sorted by priority (highest first)
    const sortedSkills = Array.from(this.skills.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Find the first skill that can handle this command
    for (const skill of sortedSkills) {
      try {
        if (skill.canHandle(normalizedCommand)) {
          // Check if skill is initialized
          if (!skill.isInitialized()) {
            console.warn(`[Registry] Skill "${skill.name}" not initialized, initializing now`);
            await skill.initialize();
          }

          // Execute the skill
          this.emit('beforeExecute', { skill: skill.name, command: normalizedCommand, context });

          const result = await skill.execute(normalizedCommand, context);

          this.emit('afterExecute', {
            skill: skill.name,
            command: normalizedCommand,
            context,
            result
          });

          return {
            ...result,
            skill: skill.name
          };
        }
      } catch (error) {
        console.error(`[Registry] Error executing skill "${skill.name}":`, error);
        this.emit('skillError', { name: skill.name, error, phase: 'execute', command: normalizedCommand });

        return {
          success: false,
          message: `Error executing command: ${error.message}`,
          skill: skill.name,
          error: error.message
        };
      }
    }

    // No skill found to handle the command
    return {
      success: false,
      message: 'No skill available to handle this command',
      skill: null
    };
  }

  /**
   * List all registered skills
   * @returns {Array<{name: string, description: string, commands: Array, priority: number}>}
   */
  listSkills() {
    return Array.from(this.skills.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map(skill => skill.getMetadata());
  }

  /**
   * Get all registered skill names
   * @returns {string[]}
   */
  getSkillNames() {
    return Array.from(this.skills.keys());
  }

  /**
   * Find all skills that can handle a command
   * (useful for debugging command conflicts)
   * @param {string} command - Command to check
   * @returns {Array<{name: string, priority: number}>}
   */
  findMatchingSkills(command) {
    return Array.from(this.skills.values())
      .filter(skill => skill.canHandle(command))
      .map(skill => ({ name: skill.name, priority: skill.priority || 0 }))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Shutdown all skills and clear the registry
   */
  async shutdown() {
    console.log('[Registry] Shutting down all skills...');

    for (const [name, skill] of this.skills) {
      try {
        await skill.shutdown();
      } catch (error) {
        console.error(`[Registry] Error shutting down skill "${name}":`, error);
      }
    }

    this.skills.clear();
    this._initialized = false;
    this.emit('shutdown');
    console.log('[Registry] All skills shut down');
  }

  /**
   * Get registry status
   * @returns {{initialized: boolean, skillCount: number, skills: string[]}}
   */
  getStatus() {
    return {
      initialized: this._initialized,
      skillCount: this.skills.size,
      skills: this.getSkillNames()
    };
  }
}

// Export singleton instance
const registry = new SkillRegistry();
module.exports = registry;

// Also export the class for testing
module.exports.SkillRegistry = SkillRegistry;
