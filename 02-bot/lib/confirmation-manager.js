/**
 * Confirmation Manager
 * Manages pending actions that require user confirmation before execution.
 * Singleton module with automatic cleanup of expired pending actions.
 *
 * @module lib/confirmation-manager
 */

// Pending confirmation timeout (5 minutes)
const CONFIRMATION_TTL = 5 * 60 * 1000;

// Cleanup interval (1 minute)
const CLEANUP_INTERVAL = 60 * 1000;

// In-memory storage for pending confirmations per user
const pendingConfirmations = new Map();

/**
 * Pending confirmation entry
 * @typedef {Object} PendingConfirmation
 * @property {string} action - The action type (e.g., 'deploy', 'create-page')
 * @property {Object} params - Action parameters
 * @property {Object} context - Additional context (message, user info, etc.)
 * @property {number} createdAt - Timestamp when confirmation was requested
 * @property {string} confirmationMessage - The message shown to the user
 */

/**
 * Actions that ALWAYS require confirmation before execution
 * High-risk or irreversible operations
 */
const ACTIONS_REQUIRING_CONFIRMATION = new Set([
  // Deployment actions
  'deploy',
  'deploy-project',
  'git pull',
  'pm2 restart',
  'pm2 stop',
  'pm2 start',
  'npm install',
  'npm run dev',
  'npm start',

  // Creation actions
  'create-page',
  'create-feature',
  'create-component',
  'create-repo',
  'create-branch',

  // Financial/Legal actions
  'file-taxes',
  'submit-filing',
  'submit-accounts',
  'pay-invoice',
  'approve-payment',

  // Deletion actions (any delete operation)
  'delete',
  'delete-file',
  'delete-branch',
  'delete-task',
  'remove',

  // Send/Publish actions
  'send-email',
  'publish',
  'post',

  // Config changes
  'change-settings',
  'update-config',

  // AI Generation actions (cost money)
  'generate-image',
  'generate-logo'
]);

/**
 * Actions that do NOT require confirmation
 * Safe, read-only, or low-risk operations
 */
const ACTIONS_WITHOUT_CONFIRMATION = new Set([
  // Status/Check operations
  'check-status',
  'project-status',
  'git status',
  'pm2 status',
  'pm2 logs',
  'health-check',

  // Read operations
  'list',
  'view',
  'read',
  'show',
  'get',

  // Receipt/Logging operations
  'process-receipt',
  'log-receipt',
  'scan-receipt',

  // Deadline/Calendar checks
  'check-deadlines',
  'list-deadlines',
  'check-reminders',

  // Safe commands
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run build',
  'npm ci',
  'git log',
  'git branch',
  'ls',
  'pwd',
  'uptime'
]);

/**
 * Patterns for yes/no confirmation responses
 */
const CONFIRMATION_PATTERNS = {
  yes: /^(yes|y|yeah|yep|yup|confirm|confirmed|ok|okay|sure|go|do it|proceed|approve|👍)$/i,
  no: /^(no|n|nah|nope|cancel|stop|abort|don't|dont|nevermind|never mind|👎)$/i
};

/**
 * Set a pending confirmation for a user
 * @param {string} userId - User identifier (e.g., phone number)
 * @param {string} action - The action type awaiting confirmation
 * @param {Object} params - Parameters for the action
 * @param {Object} [context={}] - Additional context
 * @returns {PendingConfirmation} The stored pending confirmation
 */
function setPending(userId, action, params, context = {}) {
  const pending = {
    action,
    params: params || {},
    context: context || {},
    createdAt: Date.now(),
    confirmationMessage: formatConfirmationRequest(action, params)
  };

  pendingConfirmations.set(userId, pending);

  console.log(`[ConfirmationManager] Pending set for ${userId}: ${action}`);
  return pending;
}

/**
 * Get pending confirmation for a user
 * @param {string} userId - User identifier
 * @returns {PendingConfirmation|null} Pending confirmation or null if none/expired
 */
function getPending(userId) {
  const pending = pendingConfirmations.get(userId);

  if (!pending) {
    return null;
  }

  // Check if expired
  if (Date.now() - pending.createdAt > CONFIRMATION_TTL) {
    console.log(`[ConfirmationManager] Pending expired for ${userId}: ${pending.action}`);
    pendingConfirmations.delete(userId);
    return null;
  }

  return pending;
}

/**
 * User confirmed - return and clear the pending action
 * @param {string} userId - User identifier
 * @returns {PendingConfirmation|null} The confirmed pending action or null
 */
function confirm(userId) {
  const pending = getPending(userId);

  if (!pending) {
    console.log(`[ConfirmationManager] No pending action to confirm for ${userId}`);
    return null;
  }

  pendingConfirmations.delete(userId);
  console.log(`[ConfirmationManager] Confirmed for ${userId}: ${pending.action}`);
  return pending;
}

/**
 * User cancelled - clear the pending action
 * @param {string} userId - User identifier
 * @returns {boolean} True if there was a pending action to cancel
 */
function cancel(userId) {
  const pending = getPending(userId);

  if (!pending) {
    console.log(`[ConfirmationManager] No pending action to cancel for ${userId}`);
    return false;
  }

  pendingConfirmations.delete(userId);
  console.log(`[ConfirmationManager] Cancelled for ${userId}: ${pending.action}`);
  return true;
}

/**
 * Check if user has a pending confirmation
 * @param {string} userId - User identifier
 * @returns {boolean} True if user has a non-expired pending confirmation
 */
function hasPending(userId) {
  return getPending(userId) !== null;
}

/**
 * Check if a message is a confirmation response (yes/no)
 * @param {string} message - The user's message
 * @returns {'yes'|'no'|null} 'yes' if confirming, 'no' if cancelling, null if neither
 */
function isConfirmation(message) {
  const normalized = (message || '').trim();

  if (CONFIRMATION_PATTERNS.yes.test(normalized)) {
    return 'yes';
  }

  if (CONFIRMATION_PATTERNS.no.test(normalized)) {
    return 'no';
  }

  return null;
}

/**
 * Check if an action requires confirmation
 * @param {string} action - The action type
 * @returns {boolean} True if action requires confirmation
 */
function requiresConfirmation(action) {
  const normalizedAction = (action || '').toLowerCase().trim();

  // Check explicit no-confirmation list first
  if (ACTIONS_WITHOUT_CONFIRMATION.has(normalizedAction)) {
    return false;
  }

  // Check explicit confirmation-required list
  if (ACTIONS_REQUIRING_CONFIRMATION.has(normalizedAction)) {
    return true;
  }

  // Check if action contains any delete keyword
  if (/delete|remove|destroy|drop|purge|wipe/i.test(normalizedAction)) {
    return true;
  }

  // Check if action starts with a confirmation-required prefix
  for (const prefix of ['deploy', 'create', 'delete', 'remove', 'send', 'publish', 'submit', 'file', 'pay']) {
    if (normalizedAction.startsWith(prefix)) {
      return true;
    }
  }

  // Default: no confirmation required for unknown safe actions
  return false;
}

/**
 * Format a confirmation request message
 * @param {string} action - The action type
 * @param {Object} params - Action parameters
 * @returns {string} Formatted confirmation message
 */
function formatConfirmationRequest(action, params = {}) {
  const normalizedAction = (action || '').toLowerCase();
  const target = params.target || params.repo || params.project || params.name || '';

  // Header - visual alert
  const header = '⚠️ **APPROVAL NEEDED**\n\n';

  // Footer - clear instructions with timeout warning
  const footer = '\n\n**Reply "yes" to proceed or "no" to cancel**\n⏱️ Expires in 5 minutes';

  // Action-specific messages
  const messageTemplates = {
    'deploy': `**Deploy ${target || 'this project'}?**\nThis will update the live server.`,
    'deploy-project': `**Deploy ${target || 'this project'}?**\nThis will update the live server.`,
    'git pull': `**Git pull for ${target || 'this project'}?**\nThis will fetch and merge remote changes.`,
    'pm2 restart': `**Restart ${target || 'the application'}?**\nThis may cause brief downtime.`,
    'pm2 stop': `**Stop ${target || 'the application'}?**\nThe service will be unavailable until started.`,
    'create-page': `**Create new page "${params.pageName || target}"?**\nThis will add files to the project.`,
    'create-feature': `**Create new feature "${params.featureName || target}"?**\nThis will scaffold new files.`,
    'create-repo': `**Create new repository "${target}"?**\nThis will create a new GitHub repo.`,
    'file-taxes': `**File taxes for ${params.company || target}?**\nThis is a formal submission.`,
    'submit-filing': `**Submit filing for ${params.company || target}?**\nThis cannot be undone.`,
    'delete': `**Delete ${target}?**\nThis action cannot be undone.`,
    'delete-file': `**Delete file "${params.filename || target}"?**\nThis action cannot be undone.`,
    'delete-branch': `**Delete branch "${params.branch || target}"?**\nThis action cannot be undone.`,
    'send-email': `**Send email to ${params.recipient || target}?**\nThis will be sent immediately.`,
    'publish': `**Publish ${target || 'this content'}?**\nIt will become publicly visible.`,
    'npm install': `**Run npm install for ${target || 'this project'}?**\nThis will modify node_modules.`,
    'generate-image': `**Generate image?**\nPrompt: "${params.prompt || target}"\nEstimated cost: $${params.estimatedCost || '0.02'}`,
    'generate-logo': `**Generate logo?**\nDescription: "${params.prompt || target}"\nEstimated cost: $${params.estimatedCost || '0.02'}`
  };

  // Build complete message with header and footer
  let message;
  if (messageTemplates[normalizedAction]) {
    message = messageTemplates[normalizedAction];
  } else if (target) {
    // Generic confirmation message
    message = `**Confirm ${action} for ${target}?**`;
  } else {
    message = `**Confirm ${action}?**`;
  }

  return header + message + footer;
}

/**
 * Get time remaining before pending confirmation expires
 * @param {string} userId - User identifier
 * @returns {number|null} Milliseconds remaining, or null if no pending
 */
function getTimeRemaining(userId) {
  const pending = pendingConfirmations.get(userId);

  if (!pending) {
    return null;
  }

  const elapsed = Date.now() - pending.createdAt;
  const remaining = CONFIRMATION_TTL - elapsed;

  return remaining > 0 ? remaining : 0;
}

/**
 * Get all pending confirmations (for debugging/admin)
 * @returns {Object} Object mapping userIds to their pending confirmations
 */
function getAllPending() {
  const result = {};
  const now = Date.now();

  for (const [userId, pending] of pendingConfirmations.entries()) {
    // Skip expired entries
    if (now - pending.createdAt > CONFIRMATION_TTL) {
      continue;
    }

    result[userId] = {
      action: pending.action,
      params: pending.params,
      createdAt: pending.createdAt,
      minutesRemaining: Math.round((CONFIRMATION_TTL - (now - pending.createdAt)) / 60000)
    };
  }

  return result;
}

/**
 * Clean up expired pending confirmations
 * @returns {number} Number of expired entries removed
 */
function cleanupExpired() {
  const now = Date.now();
  let removed = 0;

  for (const [userId, pending] of pendingConfirmations.entries()) {
    if (now - pending.createdAt > CONFIRMATION_TTL) {
      pendingConfirmations.delete(userId);
      console.log(`[ConfirmationManager] Auto-expired: ${userId} (${pending.action})`);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[ConfirmationManager] Cleaned up ${removed} expired confirmations`);
  }

  return removed;
}

/**
 * Clear all pending confirmations (for testing/reset)
 * @returns {number} Number of confirmations cleared
 */
function clearAll() {
  const count = pendingConfirmations.size;
  pendingConfirmations.clear();
  console.log(`[ConfirmationManager] Cleared all ${count} pending confirmations`);
  return count;
}

/**
 * Get the confirmation TTL in milliseconds
 * @returns {number} TTL in milliseconds
 */
function getTTL() {
  return CONFIRMATION_TTL;
}

// Start automatic cleanup interval
let cleanupIntervalId = null;

function startCleanupInterval() {
  if (cleanupIntervalId) {
    return; // Already running
  }

  cleanupIntervalId = setInterval(cleanupExpired, CLEANUP_INTERVAL);
  console.log('[ConfirmationManager] Cleanup interval started');
}

function stopCleanupInterval() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('[ConfirmationManager] Cleanup interval stopped');
  }
}

// Auto-start cleanup on module load
startCleanupInterval();

module.exports = {
  // Core methods
  setPending,
  getPending,
  confirm,
  cancel,
  hasPending,
  isConfirmation,
  requiresConfirmation,
  formatConfirmationRequest,

  // Utility methods
  getTimeRemaining,
  getAllPending,
  cleanupExpired,
  clearAll,
  getTTL,

  // Interval control
  startCleanupInterval,
  stopCleanupInterval,

  // Constants (exported for testing/extension)
  ACTIONS_REQUIRING_CONFIRMATION,
  ACTIONS_WITHOUT_CONFIRMATION,
  CONFIRMATION_PATTERNS
};
