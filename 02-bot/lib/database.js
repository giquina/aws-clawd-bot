/**
 * ClawdBot SQLite Persistent Memory Module
 *
 * Replaces in-memory storage with persistent SQLite via better-sqlite3.
 * Provides conversation history, user facts, plan tracking, and deployment history.
 *
 * DB location: /opt/clawd-bot/data/clawdbot.db (EC2) or ./data/clawdbot.db (local)
 * Uses WAL mode for concurrent read performance.
 * Exports a singleton — all methods are synchronous.
 */

const path = require('path');
const fs = require('fs');

let db = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Determine DB path: EC2 production path first, then local fallback
// ---------------------------------------------------------------------------
function resolveDbPath() {
  const ec2Path = '/opt/clawd-bot/data';
  const localPath = path.join(__dirname, '..', 'data');

  // Prefer EC2 path if it exists (or its parent does and we can create it)
  if (process.platform !== 'win32') {
    try {
      if (fs.existsSync('/opt/clawd-bot')) {
        if (!fs.existsSync(ec2Path)) {
          fs.mkdirSync(ec2Path, { recursive: true });
        }
        return path.join(ec2Path, 'clawdbot.db');
      }
    } catch (_) {
      // Fall through to local
    }
  }

  // Local fallback
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  return path.join(localPath, 'clawdbot.db');
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const SCHEMA = `
  -- Conversation history per chat
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    platform TEXT DEFAULT 'telegram',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_conv_chat ON conversations(chat_id, created_at DESC);

  -- User facts / preferences (persistent memory)
  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_id);

  -- Plan / PR history
  CREATE TABLE IF NOT EXISTS plan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    transcript TEXT,
    plan TEXT,
    result TEXT,
    pr_url TEXT,
    repo TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_plans_chat ON plan_history(chat_id, created_at DESC);

  -- Deployment history
  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    platform TEXT DEFAULT 'vercel',
    url TEXT,
    status TEXT DEFAULT 'pending',
    triggered_by TEXT,
    chat_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_deploy_repo ON deployments(repo, created_at DESC);

  -- Claude Code session tracking
  CREATE TABLE IF NOT EXISTS claude_code_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    repo TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    output_summary TEXT,
    pr_url TEXT,
    session_log_path TEXT,
    pid INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_claude_sessions_chat ON claude_code_sessions(chat_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_claude_sessions_status ON claude_code_sessions(status);
`;

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------
function init() {
  if (initialized) return;

  try {
    const Database = require('better-sqlite3');
    const dbPath = resolveDbPath();

    db = new Database(dbPath);

    // Performance pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    // Run schema inside a transaction
    db.exec(SCHEMA);

    // Count tables for the init log
    const tableCount = db
      .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get().cnt;

    console.log(`[Database] SQLite initialized: ${dbPath} (${tableCount} tables)`);
    initialized = true;
  } catch (err) {
    console.warn(`[Database] Failed to initialize SQLite: ${err.message}`);
    console.warn('[Database] Running with no-op fallback — data will NOT be persisted.');
    db = null;
    initialized = true; // prevent retry loops
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Save a message to conversation history.
 * @param {string} chatId
 * @param {string} userId
 * @param {string} role - 'user' or 'assistant'
 * @param {string} message
 * @param {string} [platform='telegram']
 * @returns {{ id: number } | null}
 */
function saveMessage(chatId, userId, role, message, platform = 'telegram') {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO conversations (chat_id, user_id, role, message, platform) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(chatId), String(userId), role, message, platform);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveMessage error:', err.message);
    return null;
  }
}

/**
 * Get the last N messages for a chat, ordered oldest-first.
 * @param {string} chatId
 * @param {number} [limit=20]
 * @returns {Array<{ id: number, chat_id: string, user_id: string, role: string, message: string, platform: string, created_at: string }>}
 */
function getHistory(chatId, limit = 20) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT * FROM (
        SELECT * FROM conversations WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?
      ) sub ORDER BY created_at ASC`
    );
    return stmt.all(String(chatId), limit);
  } catch (err) {
    console.error('[Database] getHistory error:', err.message);
    return [];
  }
}

/**
 * Delete all conversation history for a chat.
 * @param {string} chatId
 * @returns {number} rows deleted
 */
function clearHistory(chatId) {
  if (!db) return 0;
  try {
    const stmt = db.prepare('DELETE FROM conversations WHERE chat_id = ?');
    return stmt.run(String(chatId)).changes;
  } catch (err) {
    console.error('[Database] clearHistory error:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/**
 * Save a fact about a user.
 * @param {string} userId
 * @param {string} fact
 * @param {string} [category='general'] - general, preference, project, personal
 * @returns {{ id: number } | null}
 */
function saveFact(userId, fact, category = 'general') {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO facts (user_id, fact, category) VALUES (?, ?, ?)'
    );
    const info = stmt.run(String(userId), fact, category);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveFact error:', err.message);
    return null;
  }
}

/**
 * Get all facts for a user, optionally filtered by category.
 * @param {string} userId
 * @param {string|null} [category=null]
 * @returns {Array<{ id: number, user_id: string, fact: string, category: string, created_at: string }>}
 */
function getFacts(userId, category = null) {
  if (!db) return [];
  try {
    if (category) {
      const stmt = db.prepare(
        'SELECT * FROM facts WHERE user_id = ? AND category = ? ORDER BY created_at DESC'
      );
      return stmt.all(String(userId), category);
    }
    const stmt = db.prepare(
      'SELECT * FROM facts WHERE user_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(String(userId));
  } catch (err) {
    console.error('[Database] getFacts error:', err.message);
    return [];
  }
}

/**
 * Delete a fact by ID.
 * @param {number} factId
 * @returns {number} rows deleted (0 or 1)
 */
function deleteFact(factId) {
  if (!db) return 0;
  try {
    const stmt = db.prepare('DELETE FROM facts WHERE id = ?');
    return stmt.run(factId).changes;
  } catch (err) {
    console.error('[Database] deleteFact error:', err.message);
    return 0;
  }
}

/**
 * Search facts by keyword (case-insensitive LIKE).
 * @param {string} userId
 * @param {string} query
 * @returns {Array<{ id: number, user_id: string, fact: string, category: string, created_at: string }>}
 */
function searchFacts(userId, query) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM facts WHERE user_id = ? AND fact LIKE ? ORDER BY created_at DESC'
    );
    return stmt.all(String(userId), `%${query}%`);
  } catch (err) {
    console.error('[Database] searchFacts error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * Save a new plan.
 * @param {string} chatId
 * @param {string} userId
 * @param {{ transcript?: string, plan?: string, repo?: string }} data
 * @returns {{ id: number } | null}
 */
function savePlan(chatId, userId, { transcript = null, plan = null, repo = null } = {}) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO plan_history (chat_id, user_id, transcript, plan, repo) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(chatId), String(userId), transcript, plan, repo);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] savePlan error:', err.message);
    return null;
  }
}

/**
 * Update an existing plan.
 * @param {number} planId
 * @param {{ status?: string, result?: string, prUrl?: string }} data
 * @returns {number} rows changed (0 or 1)
 */
function updatePlan(planId, { status, result, prUrl } = {}) {
  if (!db) return 0;
  try {
    const sets = [];
    const params = [];

    if (status !== undefined) {
      sets.push('status = ?');
      params.push(status);
      if (status === 'completed' || status === 'failed') {
        sets.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (result !== undefined) {
      sets.push('result = ?');
      params.push(result);
    }
    if (prUrl !== undefined) {
      sets.push('pr_url = ?');
      params.push(prUrl);
    }

    if (sets.length === 0) return 0;

    params.push(planId);
    const stmt = db.prepare(`UPDATE plan_history SET ${sets.join(', ')} WHERE id = ?`);
    return stmt.run(...params).changes;
  } catch (err) {
    console.error('[Database] updatePlan error:', err.message);
    return 0;
  }
}

/**
 * Get recent plans for a chat.
 * @param {string} chatId
 * @param {number} [limit=5]
 * @returns {Array}
 */
function getRecentPlans(chatId, limit = 5) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM plan_history WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(String(chatId), limit);
  } catch (err) {
    console.error('[Database] getRecentPlans error:', err.message);
    return [];
  }
}

/**
 * Get a single plan by ID.
 * @param {number} planId
 * @returns {object|null}
 */
function getPlanById(planId) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM plan_history WHERE id = ?');
    return stmt.get(planId) || null;
  } catch (err) {
    console.error('[Database] getPlanById error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

/**
 * Save a new deployment record.
 * @param {string} repo
 * @param {{ platform?: string, url?: string, status?: string, triggeredBy?: string, chatId?: string }} data
 * @returns {{ id: number } | null}
 */
function saveDeployment(repo, { platform = 'vercel', url = null, status = 'pending', triggeredBy = null, chatId = null } = {}) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO deployments (repo, platform, url, status, triggered_by, chat_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(repo, platform, url, status, triggeredBy, chatId ? String(chatId) : null);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveDeployment error:', err.message);
    return null;
  }
}

/**
 * Update a deployment record.
 * @param {number} deployId
 * @param {{ status?: string, url?: string }} data
 * @returns {number} rows changed (0 or 1)
 */
function updateDeployment(deployId, { status, url } = {}) {
  if (!db) return 0;
  try {
    const sets = [];
    const params = [];

    if (status !== undefined) {
      sets.push('status = ?');
      params.push(status);
    }
    if (url !== undefined) {
      sets.push('url = ?');
      params.push(url);
    }

    if (sets.length === 0) return 0;

    params.push(deployId);
    const stmt = db.prepare(`UPDATE deployments SET ${sets.join(', ')} WHERE id = ?`);
    return stmt.run(...params).changes;
  } catch (err) {
    console.error('[Database] updateDeployment error:', err.message);
    return 0;
  }
}

/**
 * Get the most recent deployment for a repo (optionally filtered by platform).
 * @param {string} repo
 * @param {string|null} [platform=null]
 * @returns {object|null}
 */
function getLastDeployment(repo, platform = null) {
  if (!db) return null;
  try {
    if (platform) {
      const stmt = db.prepare(
        'SELECT * FROM deployments WHERE repo = ? AND platform = ? ORDER BY created_at DESC LIMIT 1'
      );
      return stmt.get(repo, platform) || null;
    }
    const stmt = db.prepare(
      'SELECT * FROM deployments WHERE repo = ? ORDER BY created_at DESC LIMIT 1'
    );
    return stmt.get(repo) || null;
  } catch (err) {
    console.error('[Database] getLastDeployment error:', err.message);
    return null;
  }
}

/**
 * Get deployment history for a repo.
 * @param {string} repo
 * @param {number} [limit=10]
 * @returns {Array}
 */
function getDeploymentHistory(repo, limit = 10) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM deployments WHERE repo = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(repo, limit);
  } catch (err) {
    console.error('[Database] getDeploymentHistory error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Claude Code Sessions
// ---------------------------------------------------------------------------

/**
 * Save a new Claude Code session.
 * @param {string} chatId
 * @param {string} userId
 * @param {{ sessionId: string, repo: string, task: string }} data
 * @returns {{ id: number } | null}
 */
function saveClaudeCodeSession(chatId, userId, { sessionId, repo, task }) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO claude_code_sessions (chat_id, user_id, session_id, repo, task) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(chatId), String(userId), sessionId, repo, task);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveClaudeCodeSession error:', err.message);
    return null;
  }
}

/**
 * Update an existing Claude Code session.
 * @param {string} sessionId
 * @param {{ status?: string, outputSummary?: string, prUrl?: string, durationSeconds?: number, pid?: number }} updates
 * @returns {number} rows changed (0 or 1)
 */
function updateClaudeCodeSession(sessionId, updates) {
  if (!db) return 0;
  try {
    const { status, outputSummary, prUrl, durationSeconds, pid } = updates;
    const sets = ['status = ?'];
    const params = [status];

    if (status === 'active') sets.push('started_at = CURRENT_TIMESTAMP');
    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
      sets.push('completed_at = CURRENT_TIMESTAMP');
    }
    if (outputSummary !== undefined) { sets.push('output_summary = ?'); params.push(outputSummary); }
    if (prUrl !== undefined) { sets.push('pr_url = ?'); params.push(prUrl); }
    if (durationSeconds !== undefined) { sets.push('duration_seconds = ?'); params.push(durationSeconds); }
    if (pid !== undefined) { sets.push('pid = ?'); params.push(pid); }

    params.push(sessionId);
    const stmt = db.prepare(`UPDATE claude_code_sessions SET ${sets.join(', ')} WHERE session_id = ?`);
    return stmt.run(...params).changes;
  } catch (err) {
    console.error('[Database] updateClaudeCodeSession error:', err.message);
    return 0;
  }
}

/**
 * Get the active Claude Code session for a chat.
 * @param {string} chatId
 * @returns {object|null}
 */
function getActiveClaudeCodeSession(chatId) {
  if (!db) return null;
  try {
    return db.prepare(
      "SELECT * FROM claude_code_sessions WHERE chat_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).get(String(chatId)) || null;
  } catch (err) {
    console.error('[Database] getActiveClaudeCodeSession error:', err.message);
    return null;
  }
}

/**
 * Get recent Claude Code sessions for a chat.
 * @param {string} chatId
 * @param {number} [limit=5]
 * @returns {Array}
 */
function getClaudeCodeSessionHistory(chatId, limit = 5) {
  if (!db) return [];
  try {
    return db.prepare(
      'SELECT * FROM claude_code_sessions WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(String(chatId), limit);
  } catch (err) {
    console.error('[Database] getClaudeCodeSessionHistory error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Return the raw better-sqlite3 Database instance for advanced queries.
 * @returns {import('better-sqlite3').Database | null}
 */
function getDb() {
  return db;
}

/**
 * Close the database connection gracefully.
 */
function close() {
  if (db) {
    try {
      db.close();
      console.log('[Database] Connection closed.');
    } catch (err) {
      console.error('[Database] Error closing connection:', err.message);
    }
    db = null;
    initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-initialise on require
// ---------------------------------------------------------------------------
init();

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Conversations
  saveMessage,
  getHistory,
  clearHistory,

  // Facts
  saveFact,
  getFacts,
  deleteFact,
  searchFacts,

  // Plans
  savePlan,
  updatePlan,
  getRecentPlans,
  getPlanById,

  // Deployments
  saveDeployment,
  updateDeployment,
  getLastDeployment,
  getDeploymentHistory,

  // Claude Code Sessions
  saveClaudeCodeSession,
  updateClaudeCodeSession,
  getActiveClaudeCodeSession,
  getClaudeCodeSessionHistory,

  // Utility
  getDb,
  close,
};
