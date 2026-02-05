/**
 * Skills Framework for ClawdBot
 *
 * A modular skill system that allows easy addition of new commands
 * by creating a folder with an index.js file.
 *
 * @example
 * const { registry, loadSkills, BaseSkill } = require('./skills');
 *
 * // Load all skills from directory
 * await loadSkills(__dirname + '/skills', context);
 *
 * // Route a command
 * const result = await registry.route('help', { from: '+1234567890' });
 *
 * // Create a custom skill
 * class MySkill extends BaseSkill {
 *   name = 'myskill';
 *   commands = [{ pattern: /^mycommand/i, description: 'Does something' }];
 *   async execute(cmd, ctx) { return this.success('Done!'); }
 * }
 */

const BaseSkill = require('./base-skill');
const registry = require('./skill-registry');
const {
  loadSkills,
  loadSkill,
  reloadSkill,
  watchSkills,
  discoverSkillDirs,
  discoverSkills,
  loadConfig,
  SKILL_PATHS
} = require('./skill-loader');

module.exports = {
  // Core exports
  BaseSkill,
  registry,

  // Loader functions
  loadSkills,
  loadSkill,
  reloadSkill,
  watchSkills,
  discoverSkillDirs,
  discoverSkills,
  loadConfig,
  SKILL_PATHS,

  // Convenience: initialize the full skills system
  async initialize(context = {}, options = {}) {
    const {
      skillsDir = __dirname,
      watch = false
    } = options;

    // Load all skills
    const skills = await loadSkills(skillsDir, context);

    // Initialize registry with context
    await registry.initialize(context);

    // Optionally watch for changes
    let watcher = null;
    if (watch && process.env.NODE_ENV !== 'production') {
      watcher = watchSkills(skillsDir, context);
    }

    return {
      registry,
      skills,
      watcher,

      // Shorthand for routing commands
      route: (command, ctx) => registry.route(command, ctx),

      // Shutdown helper
      async shutdown() {
        if (watcher) {
          watcher.close();
        }
        await registry.shutdown();
      }
    };
  }
};
