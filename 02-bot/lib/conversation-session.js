/**
 * Conversation Session Manager
 * Tracks active design/planning/coding sessions per chat.
 * Sessions persist across messages so the bot remembers context like
 * "we're building a task tracker with React + localStorage".
 *
 * Uses in-memory Map (fast) + SQLite (survive restarts).
 *
 * @module lib/conversation-session
 */

'use strict';

// Session TTL: 2 hours of inactivity
const SESSION_TTL = 2 * 60 * 60 * 1000;

// Cleanup interval: every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// In-memory session store
const sessions = new Map();

// Lazy-load database to avoid circular imports
let _db = null;
function getDb() {
  if (!_db) {
    try { _db = require('./database'); } catch (e) { _db = false; }
  }
  return _db || null;
}

// Valid session modes
const MODES = ['idle', 'designing', 'planning', 'coding', 'iterating'];

/**
 * Ensure the conversation_sessions table exists in SQLite
 */
let _schemaReady = false;
function ensureSchema() {
  if (_schemaReady) return;
  const db = getDb();
  if (!db || !db.getDb || !db.getDb()) return;

  try {
    db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'idle',
        project_name TEXT,
        repo TEXT,
        context_json TEXT,
        last_pr_url TEXT,
        last_branch TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_chat ON conversation_sessions(chat_id, ended_at);
    `);
    _schemaReady = true;
    console.log('[ConversationSession] Schema ready');
  } catch (e) {
    console.warn('[ConversationSession] Schema init failed:', e.message);
  }
}

/**
 * Start or update a session for a chat
 * @param {string} chatId
 * @param {string} mode - 'designing' | 'planning' | 'coding' | 'iterating'
 * @param {Object} [initialContext={}] - Session context
 * @returns {Object} The session object
 */
function startSession(chatId, mode, initialContext = {}) {
  if (!MODES.includes(mode)) {
    console.warn(`[ConversationSession] Invalid mode "${mode}", defaulting to "designing"`);
    mode = 'designing';
  }

  const existing = sessions.get(String(chatId));
  const now = Date.now();

  const session = {
    chatId: String(chatId),
    mode,
    projectName: initialContext.projectName || existing?.projectName || null,
    repo: initialContext.repo || existing?.repo || null,
    context: {
      description: initialContext.description || initialContext.originalInstruction || existing?.context?.description || '',
      scope: initialContext.scope || existing?.context?.scope || '',
      techStack: initialContext.techStack || existing?.context?.techStack || '',
      decisions: initialContext.decisions || existing?.context?.decisions || [],
      lastAction: initialContext.lastAction || existing?.context?.lastAction || '',
      ...(initialContext || {}),
    },
    lastPrUrl: initialContext.lastPrUrl || existing?.lastPrUrl || null,
    lastBranch: initialContext.lastBranch || existing?.lastBranch || null,
    startedAt: existing?.startedAt || now,
    lastActivityAt: now,
  };

  sessions.set(String(chatId), session);
  persistSession(session);

  console.log(`[ConversationSession] ${existing ? 'Updated' : 'Started'} session for ${chatId}: mode=${mode}`);
  return session;
}

/**
 * Get active session for a chat (returns null if expired or none)
 * @param {string} chatId
 * @returns {Object|null}
 */
function getSession(chatId) {
  const key = String(chatId);
  let session = sessions.get(key);

  // Try loading from database if not in memory
  if (!session) {
    session = loadSession(key);
    if (session) {
      sessions.set(key, session);
    }
  }

  if (!session) return null;

  // Check TTL
  if (Date.now() - session.lastActivityAt > SESSION_TTL) {
    console.log(`[ConversationSession] Session expired for ${chatId} (inactive ${Math.round((Date.now() - session.lastActivityAt) / 60000)} min)`);
    endSession(chatId);
    return null;
  }

  return session;
}

/**
 * Update session with partial data
 * @param {string} chatId
 * @param {Object} updates - Partial updates to merge
 * @returns {Object|null} Updated session or null
 */
function updateSession(chatId, updates) {
  const session = getSession(chatId);
  if (!session) return null;

  // Merge updates
  if (updates.mode) session.mode = updates.mode;
  if (updates.projectName) session.projectName = updates.projectName;
  if (updates.repo) session.repo = updates.repo;
  if (updates.lastPrUrl) session.lastPrUrl = updates.lastPrUrl;
  if (updates.lastBranch) session.lastBranch = updates.lastBranch;

  // Merge context
  if (updates.context) {
    session.context = { ...session.context, ...updates.context };
  }

  // Add decisions (append, don't replace)
  if (updates.decisions && Array.isArray(updates.decisions)) {
    session.context.decisions = [
      ...(session.context.decisions || []),
      ...updates.decisions
    ];
    // Deduplicate
    session.context.decisions = [...new Set(session.context.decisions)];
  }

  session.lastActivityAt = Date.now();
  sessions.set(String(chatId), session);
  persistSession(session);

  return session;
}

/**
 * Touch session (update lastActivityAt without changing content)
 * @param {string} chatId
 */
function touchSession(chatId) {
  const session = sessions.get(String(chatId));
  if (session) {
    session.lastActivityAt = Date.now();
  }
}

/**
 * End a session
 * @param {string} chatId
 * @returns {boolean}
 */
function endSession(chatId) {
  const key = String(chatId);
  const existed = sessions.delete(key);

  // Mark ended in database
  ensureSchema();
  const db = getDb();
  if (db && db.getDb && db.getDb()) {
    try {
      db.getDb().prepare(
        'UPDATE conversation_sessions SET ended_at = CURRENT_TIMESTAMP WHERE chat_id = ? AND ended_at IS NULL'
      ).run(key);
    } catch (e) { /* ignore */ }
  }

  if (existed) {
    console.log(`[ConversationSession] Ended session for ${chatId}`);
  }
  return existed;
}

/**
 * Check if chat has an active session
 * @param {string} chatId
 * @returns {boolean}
 */
function isActive(chatId) {
  return getSession(chatId) !== null;
}

/**
 * Get current mode for a chat
 * @param {string} chatId
 * @returns {string|null}
 */
function getMode(chatId) {
  const session = getSession(chatId);
  return session?.mode || null;
}

/**
 * Get time since last activity (for resume detection)
 * @param {string} chatId
 * @returns {number|null} Milliseconds since last activity, or null
 */
function getInactivityMs(chatId) {
  const session = getSession(chatId);
  if (!session) return null;
  return Date.now() - session.lastActivityAt;
}

/**
 * Build formatted session context for system prompt injection
 * @param {string} chatId
 * @returns {string} Formatted context string
 */
function buildSessionContext(chatId) {
  const session = getSession(chatId);
  if (!session || session.mode === 'idle') return '';

  const lines = [];
  lines.push(`\n🔄 ACTIVE SESSION: ${session.mode.toUpperCase()}`);

  if (session.projectName) {
    lines.push(`   Project: "${session.projectName}"`);
  }
  if (session.repo) {
    lines.push(`   Repository: ${session.repo}`);
  }
  if (session.context.description) {
    lines.push(`   Description: ${session.context.description.substring(0, 100)}`);
  }
  if (session.context.scope) {
    lines.push(`   Scope: ${session.context.scope}`);
  }
  if (session.context.techStack) {
    lines.push(`   Tech Stack: ${session.context.techStack}`);
  }
  if (session.context.decisions && session.context.decisions.length > 0) {
    lines.push(`   Decisions made:`);
    session.context.decisions.forEach(d => lines.push(`   - ${d}`));
  }
  if (session.lastPrUrl) {
    lines.push(`   Last PR: ${session.lastPrUrl}`);
  }
  if (session.context.lastAction) {
    lines.push(`   Last action: ${session.context.lastAction}`);
  }

  // Add mode-specific instructions
  lines.push('');
  switch (session.mode) {
    case 'designing':
      lines.push('   YOUR ROLE: Pair-programming partner in a design conversation.');
      lines.push('   - Ask ONE clarifying question at a time');
      lines.push('   - Be opinionated — suggest tech choices, don\'t just ask');
      lines.push('   - Track decisions: "Got it — React + localStorage for MVP."');
      lines.push('   - When scope is clear, suggest: "Want me to scaffold this?"');
      break;
    case 'planning':
      lines.push('   YOUR ROLE: Planning the implementation.');
      lines.push('   - Break work into concrete steps');
      lines.push('   - Propose file structure and approach');
      lines.push('   - Ask for confirmation before executing');
      break;
    case 'coding':
      lines.push('   YOUR ROLE: Actively building the project.');
      lines.push('   - Report progress on what you\'re doing');
      lines.push('   - After completing work, suggest next step');
      break;
    case 'iterating':
      lines.push('   YOUR ROLE: Iterating on existing code.');
      lines.push('   - User can say "change X" to amend the last PR');
      lines.push('   - Suggest improvements proactively');
      lines.push('   - Ask "anything else to tweak?" after changes');
      break;
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SQLite persistence
// ---------------------------------------------------------------------------

function persistSession(session) {
  ensureSchema();
  const db = getDb();
  if (!db || !db.getDb || !db.getDb()) return;

  try {
    const rawDb = db.getDb();
    // Upsert: delete old active session for this chat, insert new one
    rawDb.prepare(
      'UPDATE conversation_sessions SET ended_at = CURRENT_TIMESTAMP WHERE chat_id = ? AND ended_at IS NULL'
    ).run(session.chatId);

    rawDb.prepare(`
      INSERT INTO conversation_sessions (chat_id, mode, project_name, repo, context_json, last_pr_url, last_branch, started_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime(? / 1000, 'unixepoch'), datetime(? / 1000, 'unixepoch'))
    `).run(
      session.chatId,
      session.mode,
      session.projectName,
      session.repo,
      JSON.stringify(session.context),
      session.lastPrUrl,
      session.lastBranch,
      session.startedAt,
      session.lastActivityAt
    );
  } catch (e) {
    console.warn('[ConversationSession] Persist error:', e.message);
  }
}

function loadSession(chatId) {
  ensureSchema();
  const db = getDb();
  if (!db || !db.getDb || !db.getDb()) return null;

  try {
    const row = db.getDb().prepare(
      'SELECT * FROM conversation_sessions WHERE chat_id = ? AND ended_at IS NULL ORDER BY last_activity_at DESC LIMIT 1'
    ).get(String(chatId));

    if (!row) return null;

    return {
      chatId: row.chat_id,
      mode: row.mode,
      projectName: row.project_name,
      repo: row.repo,
      context: row.context_json ? JSON.parse(row.context_json) : {},
      lastPrUrl: row.last_pr_url,
      lastBranch: row.last_branch,
      startedAt: new Date(row.started_at).getTime(),
      lastActivityAt: new Date(row.last_activity_at).getTime(),
    };
  } catch (e) {
    console.warn('[ConversationSession] Load error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session Resume — detect when user returns after inactivity
// ---------------------------------------------------------------------------

// Resume threshold: 1 hour of inactivity triggers a welcome back message
const RESUME_THRESHOLD = 60 * 60 * 1000;

/**
 * Check if a session needs a resume message (user returning after inactivity).
 * Returns a formatted resume message or null.
 * @param {string} chatId
 * @returns {string|null} Resume message or null
 */
function checkResume(chatId) {
  const session = getSession(chatId);
  if (!session || session.mode === 'idle') return null;

  const inactivityMs = Date.now() - session.lastActivityAt;
  if (inactivityMs < RESUME_THRESHOLD) return null;

  const hours = Math.floor(inactivityMs / (1000 * 60 * 60));
  const minutes = Math.floor((inactivityMs % (1000 * 60 * 60)) / (1000 * 60));
  const timeAgo = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const parts = [`Welcome back! (${timeAgo} since last activity)`];

  if (session.projectName || session.context?.description) {
    parts.push(`We were working on: *${session.projectName || session.context.description.substring(0, 60)}*`);
  }
  parts.push(`Mode: ${session.mode}`);

  if (session.context?.decisions && session.context.decisions.length > 0) {
    parts.push(`Decisions so far: ${session.context.decisions.join(', ')}`);
  }
  if (session.lastPrUrl) {
    parts.push(`Last PR: ${session.lastPrUrl}`);
  }

  parts.push('\nWant to continue, or start something new?');

  // Touch the session so we don't re-trigger resume
  touchSession(chatId);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Decision Extraction — auto-track choices from conversation
// ---------------------------------------------------------------------------

/**
 * Extract decisions from a user message + AI response pair.
 * Uses lightweight pattern matching (no AI call) to detect decisions.
 * @param {string} chatId
 * @param {string} userMessage
 * @param {string} aiResponse
 * @returns {string[]} Extracted decisions (may be empty)
 */
function extractAndSaveDecisions(chatId, userMessage, aiResponse) {
  const session = getSession(chatId);
  if (!session || session.mode === 'idle') return [];

  const newDecisions = [];
  const combined = `${userMessage} ${aiResponse}`.toLowerCase();

  // Pattern-based decision extraction (fast, no API call)
  const decisionPatterns = [
    // Tech stack choices
    { pattern: /\b(react|vue|angular|svelte|next\.?js|nuxt|astro|remix)\b/i, category: 'frontend' },
    { pattern: /\b(express|fastify|nest\.?js|hono|koa)\b/i, category: 'backend' },
    { pattern: /\b(tailwind|css modules|styled-components|sass|bootstrap)\b/i, category: 'styling' },
    { pattern: /\b(postgres|mysql|sqlite|mongodb|supabase|firebase|prisma)\b/i, category: 'database' },
    { pattern: /\b(typescript|javascript)\b/i, category: 'language' },
    // Storage choices
    { pattern: /\b(local\s*storage|session\s*storage|indexeddb|cloud sync)\b/i, category: 'storage' },
    // Scope choices
    { pattern: /\b(mvp|minimum viable|v1|prototype|production|full app)\b/i, category: 'scope' },
    // Auth choices
    { pattern: /\b(no auth|oauth|jwt|session auth|magic link|passkey)\b/i, category: 'auth' },
  ];

  // Only extract from user messages that contain decision-like language
  const userLower = userMessage.toLowerCase();
  const isDecisionMessage = /\b(let's use|i want|go with|prefer|use|stick with|for now|yes|sounds good)\b/i.test(userLower);

  if (isDecisionMessage) {
    for (const { pattern, category } of decisionPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        const decision = `${category}: ${match[0]}`;
        // Don't duplicate existing decisions
        if (!session.context?.decisions?.some(d => d.toLowerCase().includes(match[0].toLowerCase()))) {
          newDecisions.push(decision);
        }
      }
    }
  }

  // Also detect scope/approach decisions from AI confirmation patterns
  const scopeMatch = aiResponse.match(/(?:got it|understood|okay)[^.]*?(?:—|-)([^.!?]{10,60})/i);
  if (scopeMatch && scopeMatch[1]) {
    const scopeDecision = scopeMatch[1].trim();
    if (scopeDecision.length < 60 && !session.context?.decisions?.some(d => d === scopeDecision)) {
      newDecisions.push(scopeDecision);
    }
  }

  // Save to session
  if (newDecisions.length > 0) {
    updateSession(chatId, { decisions: newDecisions });
    console.log(`[ConversationSession] Extracted ${newDecisions.length} decision(s): ${newDecisions.join(', ')}`);
  }

  return newDecisions;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

let cleanupIntervalId = null;

function cleanupExpired() {
  const now = Date.now();
  let removed = 0;

  for (const [chatId, session] of sessions.entries()) {
    if (now - session.lastActivityAt > SESSION_TTL) {
      sessions.delete(chatId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[ConversationSession] Cleaned up ${removed} expired session(s)`);
  }
}

function startCleanup() {
  if (cleanupIntervalId) return;
  cleanupIntervalId = setInterval(cleanupExpired, CLEANUP_INTERVAL);
}

function stopCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Auto-start cleanup
startCleanup();

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  startSession,
  getSession,
  updateSession,
  touchSession,
  endSession,
  isActive,
  getMode,
  getInactivityMs,
  buildSessionContext,
  checkResume,
  extractAndSaveDecisions,
  cleanupExpired,
  startCleanup,
  stopCleanup,
  MODES,
  SESSION_TTL,
  RESUME_THRESHOLD,
};
