/**
 * SkillLoader - Auto-discovery and loading of skills from filesystem
 *
 * Scans a directory for skill folders, loads them, and registers with the registry.
 * Each skill folder should contain an index.js that exports a skill class or instance.
 *
 * @example
 * const loader = require('./skill-loader');
 * const skills = await loader.loadSkills('./skills');
 */
const fs = require('fs');
const path = require('path');
const registry = require('./skill-registry');

/**
 * Default configuration for skill loading
 */
const DEFAULT_CONFIG = {
  // Files to ignore when scanning
  ignoreFiles: ['base-skill.js', 'skill-registry.js', 'skill-loader.js', 'skills.json', 'index.js'],
  // Directories to ignore
  ignoreDirs: ['node_modules', '.git', '__tests__', 'test'],
  // Entry point filename to look for in skill directories
  entryPoint: 'index.js'
};

/**
 * Load skills configuration from skills.json
 * @param {string} skillsDir - Directory containing skills.json
 * @returns {Object} - Skills configuration
 */
function loadConfig(skillsDir) {
  const configPath = path.join(skillsDir, 'skills.json');

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('[SkillLoader] Error reading skills.json:', error.message);
  }

  // Return default config
  return {
    enabled: [],
    disabled: [],
    config: {}
  };
}

/**
 * Check if a skill is enabled based on configuration
 * @param {string} skillName - Name of the skill
 * @param {Object} config - Skills configuration
 * @returns {boolean}
 */
function isSkillEnabled(skillName, config) {
  // If disabled list contains the skill, it's disabled
  if (config.disabled && config.disabled.includes(skillName)) {
    return false;
  }

  // If enabled list is specified and non-empty, skill must be in it
  if (config.enabled && config.enabled.length > 0) {
    return config.enabled.includes(skillName);
  }

  // Default: enabled
  return true;
}

/**
 * Discover skill directories in the given path
 * @param {string} skillsDir - Directory to scan
 * @param {Object} options - Discovery options
 * @returns {string[]} - Array of skill directory paths
 */
function discoverSkillDirs(skillsDir, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const skillDirs = [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip ignored files and non-directories
      if (!entry.isDirectory()) {
        continue;
      }

      // Skip ignored directories
      if (config.ignoreDirs.includes(entry.name)) {
        continue;
      }

      // Check if directory has an entry point
      const entryPath = path.join(skillsDir, entry.name, config.entryPoint);
      if (fs.existsSync(entryPath)) {
        skillDirs.push(path.join(skillsDir, entry.name));
      }
    }
  } catch (error) {
    console.error('[SkillLoader] Error scanning skills directory:', error.message);
  }

  return skillDirs;
}

/**
 * Load a single skill from its directory
 * @param {string} skillDir - Path to skill directory
 * @param {Object} context - Shared context for the skill
 * @param {Object} skillConfig - Configuration specific to this skill
 * @returns {BaseSkill|null} - Loaded skill instance or null
 */
function loadSkill(skillDir, context = {}, skillConfig = {}) {
  const entryPath = path.join(skillDir, 'index.js');
  const skillName = path.basename(skillDir);

  try {
    // Clear require cache for hot-reloading
    delete require.cache[require.resolve(entryPath)];

    const SkillModule = require(entryPath);

    let skill;

    // Handle different export patterns
    if (typeof SkillModule === 'function') {
      // Exported a class - instantiate it
      skill = new SkillModule({ ...context, config: { ...context.config, ...skillConfig } });
    } else if (typeof SkillModule === 'object' && SkillModule !== null) {
      // Exported an instance or object with create function
      if (typeof SkillModule.create === 'function') {
        skill = SkillModule.create({ ...context, config: { ...context.config, ...skillConfig } });
      } else if (SkillModule.name && typeof SkillModule.execute === 'function') {
        // Already an instance
        skill = SkillModule;
        // Inject context
        skill.memory = skill.memory || context.memory;
        skill.ai = skill.ai || context.ai;
        skill.config = { ...skill.config, ...skillConfig };
        skill.logger = skill.logger || context.logger;
      } else {
        console.error(`[SkillLoader] Invalid skill export in "${skillName}": must be class, instance, or have create() method`);
        return null;
      }
    } else {
      console.error(`[SkillLoader] Invalid skill export in "${skillName}": got ${typeof SkillModule}`);
      return null;
    }

    // Validate skill has required properties
    if (!skill.name) {
      skill.name = skillName;
    }

    if (typeof skill.execute !== 'function') {
      console.error(`[SkillLoader] Skill "${skillName}" missing execute() method`);
      return null;
    }

    if (typeof skill.canHandle !== 'function') {
      console.error(`[SkillLoader] Skill "${skillName}" missing canHandle() method`);
      return null;
    }

    console.log(`[SkillLoader] Loaded skill: ${skill.name} from ${skillDir}`);
    return skill;

  } catch (error) {
    console.error(`[SkillLoader] Failed to load skill "${skillName}":`, error.message);
    return null;
  }
}

/**
 * Load all skills from a directory
 * @param {string} skillsDir - Directory containing skill folders
 * @param {Object} context - Shared context for skills
 * @param {Object} options - Loading options
 * @param {boolean} options.autoRegister - Automatically register with registry (default: true)
 * @returns {Promise<BaseSkill[]>} - Array of loaded skill instances
 */
async function loadSkills(skillsDir, context = {}, options = {}) {
  const { autoRegister = true } = options;

  // Resolve absolute path
  const absoluteDir = path.isAbsolute(skillsDir)
    ? skillsDir
    : path.resolve(process.cwd(), skillsDir);

  if (!fs.existsSync(absoluteDir)) {
    console.error(`[SkillLoader] Skills directory not found: ${absoluteDir}`);
    return [];
  }

  console.log(`[SkillLoader] Loading skills from: ${absoluteDir}`);

  // Load configuration
  const config = loadConfig(absoluteDir);

  // Discover skill directories
  const skillDirs = discoverSkillDirs(absoluteDir);
  console.log(`[SkillLoader] Found ${skillDirs.length} skill director${skillDirs.length === 1 ? 'y' : 'ies'}`);

  const loadedSkills = [];

  for (const skillDir of skillDirs) {
    const skillName = path.basename(skillDir);

    // Check if skill is enabled
    if (!isSkillEnabled(skillName, config)) {
      console.log(`[SkillLoader] Skipping disabled skill: ${skillName}`);
      continue;
    }

    // Get skill-specific config
    const skillConfig = (config.config && config.config[skillName]) || {};

    // Load the skill
    const skill = loadSkill(skillDir, context, skillConfig);

    if (skill) {
      loadedSkills.push(skill);

      // Auto-register with registry
      if (autoRegister) {
        registry.register(skill);
      }
    }
  }

  console.log(`[SkillLoader] Successfully loaded ${loadedSkills.length} skill(s)`);
  return loadedSkills;
}

/**
 * Reload a single skill by name
 * @param {string} skillName - Name of skill to reload
 * @param {string} skillsDir - Directory containing skill folders
 * @param {Object} context - Shared context for the skill
 * @returns {Promise<BaseSkill|null>} - Reloaded skill instance or null
 */
async function reloadSkill(skillName, skillsDir, context = {}) {
  const absoluteDir = path.isAbsolute(skillsDir)
    ? skillsDir
    : path.resolve(process.cwd(), skillsDir);

  const skillDir = path.join(absoluteDir, skillName);

  if (!fs.existsSync(skillDir)) {
    console.error(`[SkillLoader] Skill directory not found: ${skillDir}`);
    return null;
  }

  // Unregister existing skill
  if (registry.hasSkill(skillName)) {
    await registry.unregister(skillName);
  }

  // Load configuration
  const config = loadConfig(absoluteDir);
  const skillConfig = (config.config && config.config[skillName]) || {};

  // Reload the skill
  const skill = loadSkill(skillDir, context, skillConfig);

  if (skill) {
    registry.register(skill);
    console.log(`[SkillLoader] Reloaded skill: ${skillName}`);
  }

  return skill;
}

/**
 * Watch for changes in skills directory and reload automatically
 * @param {string} skillsDir - Directory to watch
 * @param {Object} context - Shared context for skills
 * @returns {fs.FSWatcher} - File system watcher
 */
function watchSkills(skillsDir, context = {}) {
  const absoluteDir = path.isAbsolute(skillsDir)
    ? skillsDir
    : path.resolve(process.cwd(), skillsDir);

  console.log(`[SkillLoader] Watching for changes in: ${absoluteDir}`);

  const watcher = fs.watch(absoluteDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;

    // Extract skill name from path
    const parts = filename.split(path.sep);
    const skillName = parts[0];

    // Ignore non-skill files
    if (DEFAULT_CONFIG.ignoreFiles.includes(skillName)) {
      return;
    }

    // Only reload on change events for .js files
    if (eventType === 'change' && filename.endsWith('.js')) {
      console.log(`[SkillLoader] Detected change in: ${filename}`);

      // Debounce rapid changes
      setTimeout(async () => {
        try {
          await reloadSkill(skillName, absoluteDir, context);
        } catch (error) {
          console.error(`[SkillLoader] Error reloading skill "${skillName}":`, error.message);
        }
      }, 100);
    }
  });

  return watcher;
}

module.exports = {
  loadSkills,
  loadSkill,
  reloadSkill,
  watchSkills,
  discoverSkillDirs,
  loadConfig
};
