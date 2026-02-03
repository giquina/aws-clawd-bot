/**
 * Chat Registry
 * Maps Telegram/WhatsApp chat IDs to repos, companies, or HQ for alert routing.
 * Persists to disk and supports notification levels.
 *
 * @module lib/chat-registry
 */

const fs = require('fs');
const path = require('path');

// Storage file path (in config folder as per spec)
const REGISTRY_FILE = path.join(__dirname, '..', '..', 'config', 'chat-registry.json');

/**
 * Context types for chat registration
 * @constant {Object}
 */
const CONTEXT_TYPES = {
  REPO: 'repo',
  COMPANY: 'company',
  HQ: 'hq'
};

/**
 * Notification levels
 * @constant {Object}
 */
const NOTIFICATION_LEVELS = {
  ALL: 'all',           // Every alert
  CRITICAL: 'critical', // Only failures/errors
  DIGEST: 'digest'      // Daily summary only
};

/**
 * Giquina Group company codes (from CLAUDE.md)
 * @constant {Object}
 */
const COMPANY_CODES = {
  GMH: { name: 'Giquina Management Holdings Ltd', number: '15425137' },
  GACC: { name: 'Giquina Accountancy Ltd', number: '16396650' },
  GCAP: { name: 'Giquina Capital Ltd', number: '16360342' },
  GQCARS: { name: 'GQ Cars Ltd', number: '15389347' },
  GSPV: { name: 'Giquina Structured Asset SPV Ltd', number: '16369465' }
};

/**
 * Chat registration structure
 * @typedef {Object} ChatRegistration
 * @property {string} chatId - The chat identifier
 * @property {string} platform - Platform (whatsapp/telegram)
 * @property {string} type - Context type (repo/company/hq)
 * @property {string|null} value - Repo name, company code, or null for HQ
 * @property {string} notificationLevel - Notification level (all/critical/digest)
 * @property {string|null} name - Display name for the chat
 * @property {boolean} isDefault - Whether this is from env vars
 * @property {string} registeredAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * In-memory cache of registrations
 * @type {Map<string, ChatRegistration>}
 */
let registrations = new Map();

/**
 * Indexes for fast lookups
 */
let indexes = {
  byRepo: {},      // repoName -> chatId
  byCompany: {},   // companyCode -> chatId
  hqChats: []      // array of HQ chat IDs
};

/**
 * Detect platform from chat ID format
 * @param {string} chatId - The chat ID
 * @returns {string} 'telegram' | 'whatsapp' | 'unknown'
 */
function detectPlatform(chatId) {
  if (!chatId) return 'unknown';
  const chatStr = String(chatId);

  // Telegram chat IDs are numeric (can be negative for groups)
  if (/^-?\d+$/.test(chatStr)) {
    return 'telegram';
  }

  // WhatsApp numbers typically include country code or 'whatsapp:'
  if (/^\+?\d{10,15}$/.test(chatStr) || chatStr.includes('whatsapp')) {
    return 'whatsapp';
  }

  return 'unknown';
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  const configDir = path.dirname(REGISTRY_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Rebuild indexes from registrations
 */
function rebuildIndexes() {
  indexes = { byRepo: {}, byCompany: {}, hqChats: [] };

  for (const [chatId, reg] of registrations.entries()) {
    if (reg.type === CONTEXT_TYPES.REPO && reg.value) {
      indexes.byRepo[reg.value.toLowerCase()] = chatId;
    } else if (reg.type === CONTEXT_TYPES.COMPANY && reg.value) {
      indexes.byCompany[reg.value.toUpperCase()] = chatId;
    } else if (reg.type === CONTEXT_TYPES.HQ) {
      if (!indexes.hqChats.includes(chatId)) {
        indexes.hqChats.push(chatId);
      }
    }
  }
}

/**
 * Add entry to indexes
 * @param {string} chatId - Chat ID
 * @param {Object} reg - Registration entry
 */
function addToIndexes(chatId, reg) {
  if (reg.type === CONTEXT_TYPES.REPO && reg.value) {
    indexes.byRepo[reg.value.toLowerCase()] = chatId;
  } else if (reg.type === CONTEXT_TYPES.COMPANY && reg.value) {
    indexes.byCompany[reg.value.toUpperCase()] = chatId;
  } else if (reg.type === CONTEXT_TYPES.HQ) {
    if (!indexes.hqChats.includes(chatId)) {
      indexes.hqChats.push(chatId);
    }
  }
}

/**
 * Remove entry from indexes
 * @param {string} chatId - Chat ID
 * @param {Object} reg - Registration entry
 */
function removeFromIndexes(chatId, reg) {
  if (reg.type === CONTEXT_TYPES.REPO && reg.value) {
    delete indexes.byRepo[reg.value.toLowerCase()];
  } else if (reg.type === CONTEXT_TYPES.COMPANY && reg.value) {
    delete indexes.byCompany[reg.value.toUpperCase()];
  } else if (reg.type === CONTEXT_TYPES.HQ) {
    const idx = indexes.hqChats.indexOf(chatId);
    if (idx !== -1) {
      indexes.hqChats.splice(idx, 1);
    }
  }
}

/**
 * Register default HQ chats from environment variables
 */
function registerDefaultHQChats() {
  // Telegram HQ
  const telegramHQ = process.env.TELEGRAM_HQ_CHAT_ID;
  if (telegramHQ && !registrations.has(telegramHQ)) {
    const entry = {
      chatId: telegramHQ,
      platform: 'telegram',
      type: CONTEXT_TYPES.HQ,
      value: null,
      notificationLevel: NOTIFICATION_LEVELS.ALL,
      name: 'Telegram HQ',
      isDefault: true,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    registrations.set(telegramHQ, entry);
    addToIndexes(telegramHQ, entry);
    console.log(`[ChatRegistry] Auto-registered Telegram HQ: ${telegramHQ}`);
  }

  // WhatsApp HQ — critical only (saves daily message quota for important alerts)
  const whatsappHQ = process.env.YOUR_WHATSAPP;
  if (whatsappHQ && !registrations.has(whatsappHQ)) {
    const entry = {
      chatId: whatsappHQ,
      platform: 'whatsapp',
      type: CONTEXT_TYPES.HQ,
      value: null,
      notificationLevel: NOTIFICATION_LEVELS.CRITICAL,
      name: 'WhatsApp HQ',
      isDefault: true,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    registrations.set(whatsappHQ, entry);
    addToIndexes(whatsappHQ, entry);
    console.log(`[ChatRegistry] Auto-registered WhatsApp HQ (critical only): ${whatsappHQ}`);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load registry from disk
 * @returns {boolean} Success status
 */
function load() {
  try {
    ensureConfigDir();

    if (fs.existsSync(REGISTRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      registrations = new Map(Object.entries(data.registrations || {}));
      rebuildIndexes();
      console.log(`[ChatRegistry] Loaded ${registrations.size} registrations from disk`);
    } else {
      console.log('[ChatRegistry] No existing registry file, starting fresh');
    }

    // Auto-register default HQ chats from env vars
    registerDefaultHQChats();

    return true;
  } catch (error) {
    console.error('[ChatRegistry] Failed to load from disk:', error.message);
    registerDefaultHQChats();
    return false;
  }
}

/**
 * Save registry to disk
 * @returns {boolean} Success status
 */
function save() {
  try {
    ensureConfigDir();

    const data = {
      version: '1.0',
      description: 'Chat Registry - Maps chat IDs to repos, companies, or HQ',
      lastUpdated: new Date().toISOString(),
      registrations: Object.fromEntries(registrations)
    };

    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
    console.log(`[ChatRegistry] Saved ${registrations.size} registrations to disk`);
    return true;
  } catch (error) {
    console.error('[ChatRegistry] Failed to save to disk:', error.message);
    return false;
  }
}

/**
 * Register a chat with a context
 * @param {string} chatId - The chat ID (Telegram or WhatsApp)
 * @param {string} contextType - 'repo' | 'company' | 'hq'
 * @param {string|null} contextValue - Repo name, company code, or null for HQ
 * @param {Object} options - Additional options
 * @param {string} [options.notificationLevel='all'] - 'all' | 'critical' | 'digest'
 * @param {string} [options.name] - Display name for the chat
 * @param {string} [options.platform] - 'telegram' | 'whatsapp'
 * @returns {Object} The registered chat entry
 */
function registerChat(chatId, contextType, contextValue, options = {}) {
  // Validate context type
  if (!Object.values(CONTEXT_TYPES).includes(contextType)) {
    throw new Error(`Invalid context type: ${contextType}. Must be one of: ${Object.values(CONTEXT_TYPES).join(', ')}`);
  }

  // Validate notification level
  const notificationLevel = options.notificationLevel || NOTIFICATION_LEVELS.ALL;
  if (!Object.values(NOTIFICATION_LEVELS).includes(notificationLevel)) {
    throw new Error(`Invalid notification level: ${notificationLevel}. Must be one of: ${Object.values(NOTIFICATION_LEVELS).join(', ')}`);
  }

  // Normalize context value based on type
  let normalizedValue = contextValue;
  if (contextType === CONTEXT_TYPES.COMPANY && contextValue) {
    normalizedValue = contextValue.toUpperCase();
    if (!COMPANY_CODES[normalizedValue]) {
      throw new Error(`Invalid company code: ${contextValue}. Must be one of: ${Object.keys(COMPANY_CODES).join(', ')}`);
    }
  } else if (contextType === CONTEXT_TYPES.REPO && contextValue) {
    normalizedValue = contextValue.toLowerCase();
  } else if (contextType === CONTEXT_TYPES.HQ) {
    normalizedValue = null;
  }

  // Remove from old indexes if chat already exists
  const existingReg = registrations.get(chatId);
  if (existingReg) {
    removeFromIndexes(chatId, existingReg);
  }

  // Create registration entry
  const registration = {
    chatId,
    platform: options.platform || detectPlatform(chatId),
    type: contextType,
    value: normalizedValue,
    notificationLevel,
    name: options.name || null,
    isDefault: false,
    registeredAt: existingReg?.registeredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Store in registry
  registrations.set(chatId, registration);

  // Update indexes
  addToIndexes(chatId, registration);

  // Auto-save
  save();

  console.log(`[ChatRegistry] Registered chat ${chatId} as ${contextType}${normalizedValue ? `: ${normalizedValue}` : ''}`);

  return registration;
}

/**
 * Get context for a chat
 * @param {string} chatId - The chat ID
 * @returns {Object|null} Context object { type, value, notificationLevel, name } or null
 */
function getContext(chatId) {
  const reg = registrations.get(chatId);
  if (!reg) return null;

  return {
    type: reg.type,
    value: reg.value,
    notificationLevel: reg.notificationLevel,
    name: reg.name
  };
}

/**
 * Get chat ID for a repo (for routing alerts)
 * @param {string} repoName - Repository name
 * @returns {string|null} Chat ID or null
 */
function getChatForRepo(repoName) {
  if (!repoName) return null;
  return indexes.byRepo[repoName.toLowerCase()] || null;
}

/**
 * Get chat ID for a company (for routing alerts)
 * @param {string} companyCode - Company code (GMH, GACC, etc.)
 * @returns {string|null} Chat ID or null
 */
function getChatForCompany(companyCode) {
  if (!companyCode) return null;
  return indexes.byCompany[companyCode.toUpperCase()] || null;
}

/**
 * Get HQ chat (primary/first HQ chat)
 * @returns {string|null} Chat ID or null
 */
function getHQChat() {
  return indexes.hqChats.length > 0 ? indexes.hqChats[0] : null;
}

/**
 * List all registered chats
 * @returns {Object} Object mapping chatIds to their registrations
 */
function listChats() {
  return Object.fromEntries(registrations);
}

/**
 * Unregister/remove a chat
 * @param {string} chatId - The chat ID to remove
 * @returns {boolean} True if chat was removed
 */
function unregisterChat(chatId) {
  const reg = registrations.get(chatId);
  if (!reg) {
    console.log(`[ChatRegistry] Chat not found: ${chatId}`);
    return false;
  }

  // Remove from indexes
  removeFromIndexes(chatId, reg);

  // Remove from registrations
  registrations.delete(chatId);

  // Auto-save
  save();

  console.log(`[ChatRegistry] Unregistered chat: ${chatId}`);
  return true;
}

/**
 * Check if a chat is registered
 * @param {string} chatId - The chat ID
 * @returns {boolean} True if registered
 */
function isRegistered(chatId) {
  return registrations.has(chatId);
}

/**
 * Get all chats by notification level
 * @param {string} level - 'all' | 'critical' | 'digest'
 * @returns {Object} Object mapping chatIds to their registrations
 */
function getChatsByNotificationLevel(level) {
  const result = {};

  for (const [chatId, reg] of registrations.entries()) {
    if (reg.notificationLevel === level) {
      result[chatId] = { ...reg };
    }
  }

  return result;
}

// ============================================================================
// ADDITIONAL HELPER METHODS
// ============================================================================

/**
 * Get all HQ chats
 * @returns {string[]} Array of HQ chat IDs
 */
function getHQChats() {
  return [...indexes.hqChats];
}

/**
 * Get all chats registered for a specific repo
 * @param {string} repoName - Repository name
 * @returns {Object[]} Array of registration entries
 */
function getChatsForRepo(repoName) {
  const results = [];
  const normalizedRepo = repoName.toLowerCase();

  for (const reg of registrations.values()) {
    if (reg.type === CONTEXT_TYPES.REPO && reg.value === normalizedRepo) {
      results.push({ ...reg });
    }
  }

  return results;
}

/**
 * Get all chats registered for a specific company
 * @param {string} companyCode - Company code
 * @returns {Object[]} Array of registration entries
 */
function getChatsForCompany(companyCode) {
  const results = [];
  const normalizedCode = companyCode.toUpperCase();

  for (const reg of registrations.values()) {
    if (reg.type === CONTEXT_TYPES.COMPANY && reg.value === normalizedCode) {
      results.push({ ...reg });
    }
  }

  return results;
}

/**
 * Get chats that should receive notifications for a repo event
 * @param {string} repoName - Repository name
 * @param {boolean} isCritical - Whether this is a critical notification
 * @returns {string[]} Array of chat IDs to notify
 */
function getNotificationTargets(repoName, isCritical = false) {
  const targets = [];
  const normalizedRepo = repoName.toLowerCase();

  for (const [chatId, reg] of registrations.entries()) {
    // Check if chat should receive this notification based on level
    const shouldReceive =
      reg.notificationLevel === NOTIFICATION_LEVELS.ALL ||
      (isCritical && reg.notificationLevel === NOTIFICATION_LEVELS.CRITICAL);

    if (!shouldReceive) continue;

    // HQ chats get all notifications
    if (reg.type === CONTEXT_TYPES.HQ) {
      targets.push(reg);
      continue;
    }

    // Repo chats only get notifications for their repo
    if (reg.type === CONTEXT_TYPES.REPO && reg.value === normalizedRepo) {
      targets.push(reg);
    }
  }

  return targets;
}

/**
 * Set notification level for a chat
 * @param {string} chatId - Chat identifier
 * @param {string} level - Notification level (all/critical/digest)
 * @returns {boolean} Success status
 */
function setNotificationLevel(chatId, level) {
  const reg = registrations.get(chatId);
  if (!reg) return false;

  if (!Object.values(NOTIFICATION_LEVELS).includes(level)) {
    return false;
  }

  reg.notificationLevel = level;
  reg.updatedAt = new Date().toISOString();
  registrations.set(chatId, reg);
  save();

  console.log(`[ChatRegistry] Set notification level for ${chatId} to: ${level}`);
  return true;
}

/**
 * Get company info by code
 * @param {string} code - Company code
 * @returns {Object|null} Company info or null
 */
function getCompanyInfo(code) {
  if (!code) return null;
  return COMPANY_CODES[code.toUpperCase()] || null;
}

/**
 * Get registration stats
 * @returns {Object} Stats object
 */
function getStats() {
  let repoCount = 0;
  let companyCount = 0;
  let hqCount = 0;
  const repos = new Set();
  const companies = new Set();
  const byLevel = { all: 0, critical: 0, digest: 0 };
  const byPlatform = { telegram: 0, whatsapp: 0, unknown: 0 };

  for (const reg of registrations.values()) {
    switch (reg.type) {
      case CONTEXT_TYPES.REPO:
        repoCount++;
        if (reg.value) repos.add(reg.value);
        break;
      case CONTEXT_TYPES.COMPANY:
        companyCount++;
        if (reg.value) companies.add(reg.value);
        break;
      case CONTEXT_TYPES.HQ:
        hqCount++;
        break;
    }

    byLevel[reg.notificationLevel]++;
    byPlatform[reg.platform || 'unknown']++;
  }

  return {
    total: registrations.size,
    byType: {
      repo: repoCount,
      company: companyCount,
      hq: hqCount
    },
    byLevel,
    byPlatform,
    uniqueRepos: repos.size,
    uniqueCompanies: companies.size,
    repos: Array.from(repos),
    companies: Array.from(companies)
  };
}

/**
 * Format registry for display (WhatsApp/Telegram)
 * @returns {string} Formatted string
 */
function formatForDisplay() {
  const lines = ['*Chat Registry*', ''];

  if (registrations.size === 0) {
    lines.push('No chats registered.');
    return lines.join('\n');
  }

  // Group by type
  const hqList = [];
  const repoList = [];
  const companyList = [];

  for (const reg of registrations.values()) {
    const entry = {
      chatId: reg.chatId,
      name: reg.name || reg.chatId.substring(0, 12) + '...',
      level: reg.notificationLevel,
      platform: reg.platform
    };

    if (reg.type === CONTEXT_TYPES.HQ) {
      hqList.push(entry);
    } else if (reg.type === CONTEXT_TYPES.REPO) {
      entry.repo = reg.value;
      repoList.push(entry);
    } else if (reg.type === CONTEXT_TYPES.COMPANY) {
      entry.company = reg.value;
      companyList.push(entry);
    }
  }

  if (hqList.length > 0) {
    lines.push('*HQ Chats*');
    for (const c of hqList) {
      lines.push(`  ${c.name} (${c.platform}) [${c.level}]`);
    }
    lines.push('');
  }

  if (repoList.length > 0) {
    lines.push('*Repo Chats*');
    for (const c of repoList) {
      lines.push(`  ${c.repo} -> ${c.name} [${c.level}]`);
    }
    lines.push('');
  }

  if (companyList.length > 0) {
    lines.push('*Company Chats*');
    for (const c of companyList) {
      const companyInfo = COMPANY_CODES[c.company];
      lines.push(`  ${c.company} (${companyInfo?.name || 'Unknown'}) -> ${c.name} [${c.level}]`);
    }
    lines.push('');
  }

  lines.push(`Total: ${registrations.size} chat(s)`);

  return lines.join('\n');
}

/**
 * Get full registration entry
 * @param {string} chatId - Chat identifier
 * @returns {Object|null} Full registration or null
 */
function get(chatId) {
  return registrations.get(chatId) || null;
}

/**
 * Get all registrations as array
 * @returns {Object[]} Array of all registrations
 */
function getAll() {
  return Array.from(registrations.values());
}

/**
 * Get registration count
 * @returns {number}
 */
function count() {
  return registrations.size;
}

/**
 * Check if chat is HQ
 * @param {string} chatId - Chat identifier
 * @returns {boolean}
 */
function isHQ(chatId) {
  const reg = registrations.get(chatId);
  return reg && reg.type === CONTEXT_TYPES.HQ;
}

/**
 * Clear all registrations (use with caution)
 * @returns {number} Number of registrations cleared
 */
function clearAll() {
  const count = registrations.size;
  registrations.clear();
  indexes = { byRepo: {}, byCompany: {}, hqChats: [] };
  save();
  console.log(`[ChatRegistry] Cleared all ${count} registrations`);
  return count;
}

/**
 * Get the default chat for proactive outbound messages
 * Prefers Telegram HQ chat, falls back to WhatsApp if no Telegram configured
 * @returns {Object|null} Chat object { chatId, platform, type } or null
 */
function getDefaultChat() {
  // First try to find a Telegram HQ chat from registry
  for (const reg of registrations.values()) {
    if (reg.type === CONTEXT_TYPES.HQ && reg.platform === 'telegram') {
      return { chatId: reg.chatId, platform: 'telegram', type: 'hq' };
    }
  }

  // Fall back to TELEGRAM_HQ_CHAT_ID env var
  const telegramHQ = process.env.TELEGRAM_HQ_CHAT_ID;
  if (telegramHQ) {
    return { chatId: telegramHQ, platform: 'telegram', type: 'hq' };
  }

  // Fall back to WhatsApp only if no Telegram configured
  for (const reg of registrations.values()) {
    if (reg.type === CONTEXT_TYPES.HQ && reg.platform === 'whatsapp') {
      return { chatId: reg.chatId, platform: 'whatsapp', type: 'hq' };
    }
  }

  // Last resort: YOUR_WHATSAPP env var
  const whatsappNumber = process.env.YOUR_WHATSAPP;
  if (whatsappNumber) {
    return { chatId: whatsappNumber, platform: 'whatsapp', type: 'hq' };
  }

  return null;
}

// Initialize on module load
load();

// Export singleton
module.exports = {
  // Core methods (from spec)
  registerChat,
  getContext,
  getChatForRepo,
  getChatForCompany,
  getHQChat,
  listChats,
  unregisterChat,
  isRegistered,
  getChatsByNotificationLevel,
  save,
  load,

  // Additional helper methods
  get,
  getAll,
  count,
  isHQ,
  getHQChats,
  getChatsForRepo,
  getChatsForCompany,
  getNotificationTargets,
  setNotificationLevel,
  getCompanyInfo,
  getStats,
  formatForDisplay,
  detectPlatform,
  clearAll,

  // Platform priority (Telegram first, WhatsApp backup)
  getDefaultChat,

  // Constants
  CONTEXT_TYPES,
  NOTIFICATION_LEVELS,
  COMPANY_CODES,
  REGISTRY_FILE
};
