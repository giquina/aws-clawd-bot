/**
 * Autonomous Configuration Manager
 *
 * Manages preferences and settings for autonomous operation of ClawdBot.
 * Includes config for nightly runs, safe mode, AI routing, and notifications.
 *
 * Usage:
 *   const config = require('./autonomous/config');
 *   const settings = config.getConfig();
 *   config.setConfig('autonomous.safeMode', false);
 *   config.saveConfig();
 */

const fs = require('fs');
const path = require('path');

// Path to persisted config file
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'autonomous-config.json');

// Default configuration
const DEFAULT_CONFIG = {
  autonomous: {
    enabled: true,
    nightlyRun: {
      enabled: true,
      time: '02:00',
      timezone: 'Europe/London'
    },
    safeMode: true,  // Only docs/tests, no code changes
    maxTasksPerNight: 5,
    requireApproval: ['refactor', 'delete', 'breaking'],
    autoApprove: ['docs', 'tests', 'formatting']
  },
  memory: {
    sessionMemory: true,
    memoryFlush: true,
    sources: ['memory', 'sessions']
  },
  aiRouting: {
    planningModel: 'opus',
    codingModel: 'sonnet',
    defaultMode: 'balanced'
  },
  notifications: {
    morningReport: true,
    morningReportTime: '07:00',
    alertOnError: true,
    alertOnCompletion: false
  }
};

// Current in-memory config
let currentConfig = null;

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot notation path (e.g., 'autonomous.safeMode')
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Set a nested value in an object using dot notation
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot notation path (e.g., 'autonomous.safeMode')
 * @param {*} value - Value to set
 * @returns {Object} Modified object
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const result = deepClone(obj);
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * Parse a string value to its appropriate type
 * @param {string} value - String value to parse
 * @returns {*} Parsed value (boolean, number, array, or string)
 */
function parseValue(value) {
  // Boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Number
  if (!isNaN(value) && value.trim() !== '') {
    return Number(value);
  }

  // Array (comma-separated)
  if (value.includes(',')) {
    return value.split(',').map(v => v.trim());
  }

  // String
  return value;
}

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  const dataDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Load configuration from file or use defaults
 * @returns {Object} Loaded configuration
 */
function loadConfig() {
  try {
    ensureDataDir();

    if (fs.existsSync(CONFIG_FILE)) {
      const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      // Merge with defaults to handle new keys
      currentConfig = deepMerge(deepClone(DEFAULT_CONFIG), savedConfig);
      console.log('[AutoConfig] Loaded configuration from file');
    } else {
      currentConfig = deepClone(DEFAULT_CONFIG);
      console.log('[AutoConfig] Using default configuration');
    }
  } catch (error) {
    console.error('[AutoConfig] Error loading config:', error.message);
    currentConfig = deepClone(DEFAULT_CONFIG);
  }

  return currentConfig;
}

/**
 * Save current configuration to file
 * @returns {boolean} Success status
 */
function saveConfig() {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
    console.log('[AutoConfig] Configuration saved');
    return true;
  } catch (error) {
    console.error('[AutoConfig] Error saving config:', error.message);
    return false;
  }
}

/**
 * Get current configuration
 * @param {string} [path] - Optional dot notation path to get specific value
 * @returns {Object|*} Full config or specific value
 */
function getConfig(path = null) {
  if (!currentConfig) {
    loadConfig();
  }

  if (path) {
    return getNestedValue(currentConfig, path);
  }

  return deepClone(currentConfig);
}

/**
 * Set a configuration value
 * @param {string} path - Dot notation path (e.g., 'autonomous.safeMode')
 * @param {*} value - Value to set
 * @returns {boolean} Success status
 */
function setConfig(path, value) {
  if (!currentConfig) {
    loadConfig();
  }

  // Validate path exists in defaults
  const defaultValue = getNestedValue(DEFAULT_CONFIG, path);
  if (defaultValue === undefined) {
    console.warn(`[AutoConfig] Unknown config path: ${path}`);
  }

  currentConfig = setNestedValue(currentConfig, path, value);
  return true;
}

/**
 * Reset configuration to defaults
 * @param {boolean} [save=true] - Whether to save after reset
 * @returns {Object} Reset configuration
 */
function resetConfig(save = true) {
  currentConfig = deepClone(DEFAULT_CONFIG);
  console.log('[AutoConfig] Configuration reset to defaults');

  if (save) {
    saveConfig();
  }

  return currentConfig;
}

/**
 * Check if autonomous mode is enabled
 * @returns {boolean}
 */
function isAutonomousEnabled() {
  return getConfig('autonomous.enabled') === true;
}

/**
 * Check if safe mode is enabled
 * @returns {boolean}
 */
function isSafeModeEnabled() {
  return getConfig('autonomous.safeMode') === true;
}

/**
 * Check if a task type requires approval
 * @param {string} taskType - Type of task to check
 * @returns {boolean}
 */
function requiresApproval(taskType) {
  const requireList = getConfig('autonomous.requireApproval') || [];
  return requireList.includes(taskType);
}

/**
 * Check if a task type is auto-approved
 * @param {string} taskType - Type of task to check
 * @returns {boolean}
 */
function isAutoApproved(taskType) {
  const autoList = getConfig('autonomous.autoApprove') || [];
  return autoList.includes(taskType);
}

/**
 * Format config for WhatsApp display
 * @returns {string} Formatted config string
 */
function formatConfigForDisplay() {
  const cfg = getConfig();

  const lines = [
    '*Autonomous Configuration*',
    '',
    '*Autonomous Mode*',
    `  Enabled: ${cfg.autonomous.enabled ? 'Yes' : 'No'}`,
    `  Safe Mode: ${cfg.autonomous.safeMode ? 'Yes' : 'No'}`,
    `  Nightly Run: ${cfg.autonomous.nightlyRun.enabled ? cfg.autonomous.nightlyRun.time : 'Disabled'}`,
    `  Max Tasks/Night: ${cfg.autonomous.maxTasksPerNight}`,
    '',
    '*AI Routing*',
    `  Planning: ${cfg.aiRouting.planningModel}`,
    `  Coding: ${cfg.aiRouting.codingModel}`,
    `  Default Mode: ${cfg.aiRouting.defaultMode}`,
    '',
    '*Notifications*',
    `  Morning Report: ${cfg.notifications.morningReport ? cfg.notifications.morningReportTime : 'Disabled'}`,
    `  Alert on Error: ${cfg.notifications.alertOnError ? 'Yes' : 'No'}`,
    `  Alert on Completion: ${cfg.notifications.alertOnCompletion ? 'Yes' : 'No'}`,
    '',
    '*Memory*',
    `  Session Memory: ${cfg.memory.sessionMemory ? 'Yes' : 'No'}`,
    `  Memory Flush: ${cfg.memory.memoryFlush ? 'Yes' : 'No'}`,
    `  Sources: ${cfg.memory.sources.join(', ')}`
  ];

  return lines.join('\n');
}

/**
 * Handle WhatsApp config commands
 * @param {string} command - The command string
 * @returns {{handled: boolean, message: string}} Result
 */
function handleCommand(command) {
  const cmd = command.toLowerCase().trim();

  // Toggle autonomous mode
  if (cmd === 'autonomous on') {
    setConfig('autonomous.enabled', true);
    saveConfig();
    return { handled: true, message: 'Autonomous mode enabled.' };
  }

  if (cmd === 'autonomous off') {
    setConfig('autonomous.enabled', false);
    saveConfig();
    return { handled: true, message: 'Autonomous mode disabled.' };
  }

  // Toggle safe mode
  if (cmd === 'safe mode on' || cmd === 'safemode on') {
    setConfig('autonomous.safeMode', true);
    saveConfig();
    return { handled: true, message: 'Safe mode enabled. Only docs/tests changes allowed.' };
  }

  if (cmd === 'safe mode off' || cmd === 'safemode off') {
    setConfig('autonomous.safeMode', false);
    saveConfig();
    return { handled: true, message: 'Safe mode disabled. Full code changes allowed.' };
  }

  // Show config
  if (cmd === 'config show' || cmd === 'config') {
    return { handled: true, message: formatConfigForDisplay() };
  }

  // Reset config
  if (cmd === 'config reset') {
    resetConfig();
    return { handled: true, message: 'Configuration reset to defaults.' };
  }

  // Set config value: "config set <path> <value>"
  // Use original command to preserve path case (camelCase matters)
  const setMatch = command.trim().match(/^config\s+set\s+([^\s]+)\s+(.+)$/i);
  if (setMatch) {
    const [, configPath, rawValue] = setMatch;
    const value = parseValue(rawValue);

    // Check if path is valid
    const currentValue = getConfig(configPath);
    if (currentValue === undefined) {
      return {
        handled: true,
        message: `Unknown config path: ${configPath}\n\nUse "config show" to see available settings.`
      };
    }

    setConfig(configPath, value);
    saveConfig();

    return {
      handled: true,
      message: `Config updated:\n${configPath} = ${JSON.stringify(value)}`
    };
  }

  return { handled: false, message: '' };
}

// Auto-load config on module require
loadConfig();

module.exports = {
  // Core functions
  getConfig,
  setConfig,
  saveConfig,
  loadConfig,
  resetConfig,

  // Convenience functions
  isAutonomousEnabled,
  isSafeModeEnabled,
  requiresApproval,
  isAutoApproved,

  // Display/command handling
  formatConfigForDisplay,
  handleCommand,

  // Export defaults for reference
  DEFAULT_CONFIG,
  CONFIG_FILE
};
