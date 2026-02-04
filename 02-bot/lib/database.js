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

  -- Pomodoro Timer sessions
  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_pomodoro_user ON pomodoro_sessions(user_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_status ON pomodoro_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro_sessions(date(started_at));

  -- Database backups
  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);

  -- Secrets (encrypted)
  CREATE TABLE IF NOT EXISTS secrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    value_encrypted TEXT NOT NULL,
    encryption_key_id TEXT NOT NULL,
    last_rotated DATETIME DEFAULT CURRENT_TIMESTAMP,
    accessed_count INTEGER DEFAULT 0,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name);
  CREATE INDEX IF NOT EXISTS idx_secrets_created_by ON secrets(created_by);

  -- Secrets audit log
  CREATE TABLE IF NOT EXISTS secrets_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id INTEGER NOT NULL,
    secret_name TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    platform TEXT DEFAULT 'telegram',
    success BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_secrets_audit_secret ON secrets_audit(secret_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_secrets_audit_user ON secrets_audit(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_secrets_audit_date ON secrets_audit(date(created_at));

  -- Invoices
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'GBP',
    status TEXT DEFAULT 'draft',
    due_date DATE,
    pdf_path TEXT,
    sent_at DATETIME,
    paid_at DATETIME,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

  -- Budgets
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'GBP',
    period TEXT DEFAULT 'monthly',
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);

  -- Recurring Expenses
  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'GBP',
    frequency TEXT NOT NULL,
    next_date DATE NOT NULL,
    category TEXT,
    user_id TEXT NOT NULL,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_expenses(user_id, active);
  CREATE INDEX IF NOT EXISTS idx_recurring_next_date ON recurring_expenses(next_date);

  -- Meetings
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    transcript TEXT,
    summary TEXT,
    action_items TEXT,
    participants TEXT,
    duration_minutes INTEGER,
    audio_file_path TEXT,
    status TEXT DEFAULT 'active',
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

  -- Document Analyses
  CREATE TABLE IF NOT EXISTS document_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT,
    summary TEXT,
    extracted_data TEXT,
    user_id TEXT NOT NULL,
    chat_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_document_analyses_user ON document_analyses(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_document_analyses_chat ON document_analyses(chat_id, created_at DESC);
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
// Pomodoro Sessions
// ---------------------------------------------------------------------------

/**
 * Save a new Pomodoro session.
 * @param {string} userId
 * @param {{ sessionId: string, duration: number }} data
 * @returns {{ id: number } | null}
 */
function savePomodoroSession(userId, { sessionId, duration }) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO pomodoro_sessions (session_id, user_id, duration_minutes) VALUES (?, ?, ?)'
    );
    const info = stmt.run(sessionId, String(userId), duration);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] savePomodoroSession error:', err.message);
    return null;
  }
}

/**
 * Update a Pomodoro session status.
 * @param {string} sessionId
 * @param {string} status - 'active', 'completed', or 'stopped'
 * @returns {number} rows changed (0 or 1)
 */
function updatePomodoroSessionStatus(sessionId, status) {
  if (!db) return 0;
  try {
    const stmt = db.prepare(
      'UPDATE pomodoro_sessions SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE session_id = ?'
    );
    return stmt.run(status, sessionId).changes;
  } catch (err) {
    console.error('[Database] updatePomodoroSessionStatus error:', err.message);
    return 0;
  }
}

/**
 * Get daily Pomodoro session count for a user.
 * @param {string} userId
 * @param {string} [status='completed']
 * @returns {number}
 */
function getPomodoroSessionCountToday(userId, status = 'completed') {
  if (!db) return 0;
  try {
    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM pomodoro_sessions
       WHERE user_id = ? AND status = ? AND date(started_at) = date('now')`
    );
    const result = stmt.get(String(userId), status);
    return result?.count || 0;
  } catch (err) {
    console.error('[Database] getPomodoroSessionCountToday error:', err.message);
    return 0;
  }
}

/**
 * Get daily Pomodoro statistics for a user.
 * @param {string} userId
 * @returns {Object} { completed: number, stopped: number, totalMinutes: number, avgDuration: number, longestSession: number }
 */
function getPomodoroStatisticsToday(userId) {
  if (!db) {
    return { completed: 0, stopped: 0, totalMinutes: 0, avgDuration: 0, longestSession: 0 };
  }
  try {
    const stmt = db.prepare(
      `SELECT
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped,
        SUM(CASE WHEN status IN ('completed', 'stopped') THEN duration_minutes ELSE 0 END) as total_minutes,
        MAX(duration_minutes) as longest_session
       FROM pomodoro_sessions
       WHERE user_id = ? AND date(started_at) = date('now')`
    );
    const result = stmt.get(String(userId));

    const completed = result?.completed || 0;
    const totalMinutes = result?.total_minutes || 0;

    return {
      completed,
      stopped: result?.stopped || 0,
      totalMinutes,
      avgDuration: completed > 0 ? Math.round(totalMinutes / completed) : 0,
      longestSession: result?.longest_session || 0
    };
  } catch (err) {
    console.error('[Database] getPomodoroStatisticsToday error:', err.message);
    return { completed: 0, stopped: 0, totalMinutes: 0, avgDuration: 0, longestSession: 0 };
  }
}

/**
 * Get recent Pomodoro sessions for a user.
 * @param {string} userId
 * @param {number} [limit=10]
 * @returns {Array}
 */
function getRecentPomodoroSessions(userId, limit = 10) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM pomodoro_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?'
    );
    return stmt.all(String(userId), limit);
  } catch (err) {
    console.error('[Database] getRecentPomodoroSessions error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Database Backups
// ---------------------------------------------------------------------------

/**
 * Save a backup record.
 * @param {string} filename
 * @param {string} filePath
 * @param {number} sizeBytes
 * @returns {{ id: number } | null}
 */
function saveBackup(filename, filePath, sizeBytes) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO backups (filename, file_path, size_bytes) VALUES (?, ?, ?)'
    );
    const info = stmt.run(filename, filePath, sizeBytes);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveBackup error:', err.message);
    return null;
  }
}

/**
 * Get all backups, ordered by created_at DESC.
 * @param {number} [limit=20]
 * @returns {Array<{ id: number, filename: string, file_path: string, size_bytes: number, created_at: string }>}
 */
function listBackups(limit = 20) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM backups ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(limit);
  } catch (err) {
    console.error('[Database] listBackups error:', err.message);
    return [];
  }
}

/**
 * Get a backup by ID.
 * @param {number} backupId
 * @returns {object|null}
 */
function getBackup(backupId) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM backups WHERE id = ?');
    return stmt.get(backupId) || null;
  } catch (err) {
    console.error('[Database] getBackup error:', err.message);
    return null;
  }
}

/**
 * Delete old backups older than N days.
 * @param {number} [retentionDays=7]
 * @returns {Array<string>} file paths of deleted backups
 */
function deleteOldBackups(retentionDays = 7) {
  if (!db) return [];
  try {
    // First get the file paths to delete
    const selectStmt = db.prepare(
      `SELECT file_path FROM backups WHERE created_at < datetime('now', '-' || ? || ' days')`
    );
    const oldBackups = selectStmt.all(retentionDays);

    // Then delete from database
    const deleteStmt = db.prepare(
      `DELETE FROM backups WHERE created_at < datetime('now', '-' || ? || ' days')`
    );
    deleteStmt.run(retentionDays);

    return oldBackups.map(b => b.file_path);
  } catch (err) {
    console.error('[Database] deleteOldBackups error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

/**
 * Save an encrypted secret.
 * @param {string} name - Secret name (unique identifier)
 * @param {string} encryptedValue - Encrypted secret value
 * @param {string} encryptionKeyId - Key ID used for encryption
 * @param {string} userId - User ID who created the secret
 * @returns {{ id: number } | null}
 */
function saveSecret(name, encryptedValue, encryptionKeyId, userId) {
  if (!db) return null;
  try {
    // Check if secret already exists
    const existing = db.prepare('SELECT id FROM secrets WHERE name = ?').get(name);

    if (existing) {
      // Update existing secret
      const stmt = db.prepare(
        'UPDATE secrets SET value_encrypted = ?, encryption_key_id = ?, last_rotated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE name = ?'
      );
      stmt.run(encryptedValue, encryptionKeyId, name);
      return { id: existing.id };
    } else {
      // Insert new secret
      const stmt = db.prepare(
        'INSERT INTO secrets (name, value_encrypted, encryption_key_id, created_by) VALUES (?, ?, ?, ?)'
      );
      const info = stmt.run(name, encryptedValue, encryptionKeyId, String(userId));
      return { id: Number(info.lastInsertRowid) };
    }
  } catch (err) {
    console.error('[Database] saveSecret error:', err.message);
    return null;
  }
}

/**
 * Get an encrypted secret by name.
 * @param {string} name - Secret name
 * @returns {{ id: number, name: string, value_encrypted: string, encryption_key_id: string, last_rotated: string, accessed_count: number } | null}
 */
function getSecret(name) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM secrets WHERE name = ?');
    return stmt.get(name) || null;
  } catch (err) {
    console.error('[Database] getSecret error:', err.message);
    return null;
  }
}

/**
 * List all secrets (without encrypted values).
 * @returns {Array<{ id: number, name: string, last_rotated: string, accessed_count: number, created_by: string, created_at: string }>}
 */
function listSecrets() {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT id, name, last_rotated, accessed_count, created_by, created_at FROM secrets ORDER BY name ASC'
    );
    return stmt.all();
  } catch (err) {
    console.error('[Database] listSecrets error:', err.message);
    return [];
  }
}

/**
 * Delete a secret by name.
 * @param {string} name - Secret name
 * @returns {number} rows deleted (0 or 1)
 */
function deleteSecret(name) {
  if (!db) return 0;
  try {
    const stmt = db.prepare('DELETE FROM secrets WHERE name = ?');
    return stmt.run(name).changes;
  } catch (err) {
    console.error('[Database] deleteSecret error:', err.message);
    return 0;
  }
}

/**
 * Increment the access count for a secret.
 * @param {string} name - Secret name
 * @returns {number} rows changed (0 or 1)
 */
function incrementSecretAccess(name) {
  if (!db) return 0;
  try {
    const stmt = db.prepare(
      'UPDATE secrets SET accessed_count = accessed_count + 1 WHERE name = ?'
    );
    return stmt.run(name).changes;
  } catch (err) {
    console.error('[Database] incrementSecretAccess error:', err.message);
    return 0;
  }
}

/**
 * Log a secrets audit event.
 * @param {number} secretId - Secret ID
 * @param {string} secretName - Secret name
 * @param {'get'|'set'|'rotate'|'delete'} action - Action performed
 * @param {string} userId - User ID who performed the action
 * @param {string} [platform='telegram'] - Platform used
 * @param {boolean} [success=true] - Whether the action succeeded
 * @returns {{ id: number } | null}
 */
function logSecretAudit(secretId, secretName, action, userId, platform = 'telegram', success = true) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO secrets_audit (secret_id, secret_name, action, user_id, platform, success) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(secretId, secretName, action, String(userId), platform, success ? 1 : 0);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] logSecretAudit error:', err.message);
    return null;
  }
}

/**
 * Get audit history for a secret.
 * @param {string} secretName - Secret name
 * @param {number} [limit=20] - Maximum number of entries to return
 * @returns {Array<{ id: number, action: string, user_id: string, platform: string, success: boolean, created_at: string }>}
 */
function getSecretAuditHistory(secretName, limit = 20) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT id, action, user_id, platform, success, created_at FROM secrets_audit WHERE secret_name = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(secretName, limit);
  } catch (err) {
    console.error('[Database] getSecretAuditHistory error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * Generate a unique invoice number in format INV-YYYYMM-NNN.
 * @param {string} userId
 * @returns {string}
 */
function generateInvoiceNumber(userId) {
  if (!db) return `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-001`;

  try {
    const yearMonth = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM
    const prefix = `INV-${yearMonth}-`;

    // Get the highest invoice number for this month
    const lastInvoice = db.prepare(
      "SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1"
    ).get(`${prefix}%`);

    if (!lastInvoice) {
      return `${prefix}001`;
    }

    // Extract the sequence number and increment
    const lastSeq = parseInt(lastInvoice.invoice_number.split('-')[2]);
    const nextSeq = String(lastSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
  } catch (err) {
    console.error('[Database] generateInvoiceNumber error:', err.message);
    return `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-001`;
  }
}

/**
 * Save a new invoice.
 * @param {string} userId
 * @param {{ clientName: string, amount: number, currency?: string, dueDate?: string }} data
 * @returns {{ id: number, invoiceNumber: string } | null}
 */
function saveInvoice(userId, { clientName, amount, currency = 'GBP', dueDate = null }) {
  if (!db) return null;
  try {
    const invoiceNumber = generateInvoiceNumber(userId);

    // If no due date provided, default to 30 days from now
    const calculatedDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const stmt = db.prepare(
      'INSERT INTO invoices (invoice_number, client_name, amount, currency, due_date, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(invoiceNumber, clientName, amount, currency, calculatedDueDate, String(userId));
    return { id: Number(info.lastInsertRowid), invoiceNumber };
  } catch (err) {
    console.error('[Database] saveInvoice error:', err.message);
    return null;
  }
}

/**
 * Get an invoice by ID or invoice number.
 * @param {number|string} idOrNumber - Invoice ID or invoice number
 * @returns {object|null}
 */
function getInvoice(idOrNumber) {
  if (!db) return null;
  try {
    if (typeof idOrNumber === 'number') {
      return db.prepare('SELECT * FROM invoices WHERE id = ?').get(idOrNumber) || null;
    } else {
      return db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(idOrNumber) || null;
    }
  } catch (err) {
    console.error('[Database] getInvoice error:', err.message);
    return null;
  }
}

/**
 * List invoices for a user, optionally filtered by status.
 * @param {string} userId
 * @param {string|null} [status=null] - Filter by status (draft, sent, paid)
 * @param {number} [limit=50]
 * @returns {Array<{ id: number, invoice_number: string, client_name: string, amount: number, currency: string, status: string, due_date: string, created_at: string }>}
 */
function listInvoices(userId, status = null, limit = 50) {
  if (!db) return [];
  try {
    if (status) {
      return db.prepare(
        'SELECT * FROM invoices WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
      ).all(String(userId), status, limit);
    }
    return db.prepare(
      'SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(String(userId), limit);
  } catch (err) {
    console.error('[Database] listInvoices error:', err.message);
    return [];
  }
}

/**
 * Update an invoice status.
 * @param {number|string} idOrNumber - Invoice ID or invoice number
 * @param {'draft'|'sent'|'paid'|'cancelled'} status
 * @param {{ pdfPath?: string }} [options={}]
 * @returns {number} rows changed (0 or 1)
 */
function updateInvoiceStatus(idOrNumber, status, options = {}) {
  if (!db) return 0;
  try {
    const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];

    // Set sent_at when status changes to sent
    if (status === 'sent' && options.sentAt !== false) {
      sets.push('sent_at = CURRENT_TIMESTAMP');
    }

    // Set paid_at when status changes to paid
    if (status === 'paid') {
      sets.push('paid_at = CURRENT_TIMESTAMP');
    }

    // Add PDF path if provided
    if (options.pdfPath) {
      sets.push('pdf_path = ?');
      params.push(options.pdfPath);
    }

    // Determine if we're using ID or invoice number
    if (typeof idOrNumber === 'number') {
      params.push(idOrNumber);
      return db.prepare(`UPDATE invoices SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes;
    } else {
      params.push(idOrNumber);
      return db.prepare(`UPDATE invoices SET ${sets.join(', ')} WHERE invoice_number = ?`).run(...params).changes;
    }
  } catch (err) {
    console.error('[Database] updateInvoiceStatus error:', err.message);
    return 0;
  }
}

/**
 * Delete an invoice.
 * @param {number|string} idOrNumber - Invoice ID or invoice number
 * @returns {number} rows deleted (0 or 1)
 */
function deleteInvoice(idOrNumber) {
  if (!db) return 0;
  try {
    if (typeof idOrNumber === 'number') {
      return db.prepare('DELETE FROM invoices WHERE id = ?').run(idOrNumber).changes;
    } else {
      return db.prepare('DELETE FROM invoices WHERE invoice_number = ?').run(idOrNumber).changes;
    }
  } catch (err) {
    console.error('[Database] deleteInvoice error:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Save or update a budget for a category.
 * @param {string} userId
 * @param {string} category
 * @param {number} amount
 * @param {string} [currency='GBP']
 * @param {string} [period='monthly']
 * @returns {{ id: number } | null}
 */
function saveBudget(userId, category, amount, currency = 'GBP', period = 'monthly') {
  if (!db) return null;
  try {
    // Check if budget already exists for this user/category/period
    const existing = db.prepare(
      'SELECT id FROM budgets WHERE user_id = ? AND category = ? AND period = ?'
    ).get(String(userId), category, period);

    if (existing) {
      // Update existing budget
      db.prepare(
        'UPDATE budgets SET amount = ?, currency = ? WHERE id = ?'
      ).run(amount, currency, existing.id);
      return { id: existing.id };
    } else {
      // Insert new budget
      const stmt = db.prepare(
        'INSERT INTO budgets (user_id, category, amount, currency, period) VALUES (?, ?, ?, ?, ?)'
      );
      const info = stmt.run(String(userId), category, amount, currency, period);
      return { id: Number(info.lastInsertRowid) };
    }
  } catch (err) {
    console.error('[Database] saveBudget error:', err.message);
    return null;
  }
}

/**
 * Get all budgets for a user.
 * @param {string} userId
 * @param {string} [period=null] - Filter by period (monthly, yearly, etc.)
 * @returns {Array<{ id: number, category: string, amount: number, currency: string, period: string, created_at: string }>}
 */
function getBudgets(userId, period = null) {
  if (!db) return [];
  try {
    if (period) {
      return db.prepare(
        'SELECT * FROM budgets WHERE user_id = ? AND period = ? ORDER BY category ASC'
      ).all(String(userId), period);
    }
    return db.prepare(
      'SELECT * FROM budgets WHERE user_id = ? ORDER BY period ASC, category ASC'
    ).all(String(userId));
  } catch (err) {
    console.error('[Database] getBudgets error:', err.message);
    return [];
  }
}

/**
 * Get a specific budget for a user and category.
 * @param {string} userId
 * @param {string} category
 * @param {string} [period='monthly']
 * @returns {object|null}
 */
function getBudget(userId, category, period = 'monthly') {
  if (!db) return null;
  try {
    return db.prepare(
      'SELECT * FROM budgets WHERE user_id = ? AND category = ? AND period = ?'
    ).get(String(userId), category, period) || null;
  } catch (err) {
    console.error('[Database] getBudget error:', err.message);
    return null;
  }
}

/**
 * Delete a budget.
 * @param {number} budgetId
 * @returns {number} rows deleted (0 or 1)
 */
function deleteBudget(budgetId) {
  if (!db) return 0;
  try {
    return db.prepare('DELETE FROM budgets WHERE id = ?').run(budgetId).changes;
  } catch (err) {
    console.error('[Database] deleteBudget error:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Recurring Expenses
// ---------------------------------------------------------------------------

/**
 * Save a recurring expense.
 * @param {string} userId
 * @param {{ description: string, amount: number, currency?: string, frequency: string, nextDate: string, category?: string }} data
 * @returns {{ id: number } | null}
 */
function saveRecurringExpense(userId, { description, amount, currency = 'GBP', frequency, nextDate, category = null }) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO recurring_expenses (user_id, description, amount, currency, frequency, next_date, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(userId), description, amount, currency, frequency, nextDate, category);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveRecurringExpense error:', err.message);
    return null;
  }
}

/**
 * Get all active recurring expenses for a user.
 * @param {string} userId
 * @returns {Array}
 */
function getRecurringExpenses(userId) {
  if (!db) return [];
  try {
    return db.prepare(
      'SELECT * FROM recurring_expenses WHERE user_id = ? AND active = 1 ORDER BY next_date ASC'
    ).all(String(userId));
  } catch (err) {
    console.error('[Database] getRecurringExpenses error:', err.message);
    return [];
  }
}

/**
 * Get recurring expenses due before a certain date.
 * @param {string} userId
 * @param {string} beforeDate - ISO date string (YYYY-MM-DD)
 * @returns {Array}
 */
function getDueRecurringExpenses(userId, beforeDate) {
  if (!db) return [];
  try {
    return db.prepare(
      'SELECT * FROM recurring_expenses WHERE user_id = ? AND active = 1 AND next_date <= ? ORDER BY next_date ASC'
    ).all(String(userId), beforeDate);
  } catch (err) {
    console.error('[Database] getDueRecurringExpenses error:', err.message);
    return [];
  }
}

/**
 * Update the next date for a recurring expense.
 * @param {number} expenseId
 * @param {string} nextDate - ISO date string (YYYY-MM-DD)
 * @returns {number} rows changed (0 or 1)
 */
function updateRecurringExpenseNextDate(expenseId, nextDate) {
  if (!db) return 0;
  try {
    return db.prepare(
      'UPDATE recurring_expenses SET next_date = ? WHERE id = ?'
    ).run(nextDate, expenseId).changes;
  } catch (err) {
    console.error('[Database] updateRecurringExpenseNextDate error:', err.message);
    return 0;
  }
}

/**
 * Deactivate a recurring expense (soft delete).
 * @param {number} expenseId
 * @returns {number} rows changed (0 or 1)
 */
function deactivateRecurringExpense(expenseId) {
  if (!db) return 0;
  try {
    return db.prepare(
      'UPDATE recurring_expenses SET active = 0 WHERE id = ?'
    ).run(expenseId).changes;
  } catch (err) {
    console.error('[Database] deactivateRecurringExpense error:', err.message);
    return 0;
  }
}

/**
 * Delete a recurring expense.
 * @param {number} expenseId
 * @returns {number} rows deleted (0 or 1)
 */
function deleteRecurringExpense(expenseId) {
  if (!db) return 0;
  try {
    return db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(expenseId).changes;
  } catch (err) {
    console.error('[Database] deleteRecurringExpense error:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

/**
 * Save a new meeting record.
 * @param {string} userId
 * @param {{ title?: string, audioFilePath?: string }} data
 * @returns {{ id: number } | null}
 */
function saveMeeting(userId, { title = null, audioFilePath = null } = {}) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO meetings (user_id, title, audio_file_path) VALUES (?, ?, ?)'
    );
    const info = stmt.run(String(userId), title, audioFilePath);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveMeeting error:', err.message);
    return null;
  }
}

/**
 * Get a meeting by ID.
 * @param {number} meetingId
 * @returns {object|null}
 */
function getMeeting(meetingId) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM meetings WHERE id = ?');
    return stmt.get(meetingId) || null;
  } catch (err) {
    console.error('[Database] getMeeting error:', err.message);
    return null;
  }
}

/**
 * List meetings for a user.
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Array<{ id: number, title: string, summary: string, duration_minutes: number, created_at: string }>}
 */
function listMeetings(userId, limit = 20) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT * FROM meetings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(String(userId), limit);
  } catch (err) {
    console.error('[Database] listMeetings error:', err.message);
    return [];
  }
}

/**
 * Update a meeting with transcript, summary, and action items.
 * @param {number} meetingId
 * @param {{ transcript?: string, summary?: string, actionItems?: string, participants?: string, durationMinutes?: number, status?: string }} updates
 * @returns {number} rows changed (0 or 1)
 */
function updateMeeting(meetingId, updates) {
  if (!db) return 0;
  try {
    const { transcript, summary, actionItems, participants, durationMinutes, status } = updates;
    const sets = [];
    const params = [];

    if (transcript !== undefined) { sets.push('transcript = ?'); params.push(transcript); }
    if (summary !== undefined) { sets.push('summary = ?'); params.push(summary); }
    if (actionItems !== undefined) { sets.push('action_items = ?'); params.push(actionItems); }
    if (participants !== undefined) { sets.push('participants = ?'); params.push(participants); }
    if (durationMinutes !== undefined) { sets.push('duration_minutes = ?'); params.push(durationMinutes); }
    if (status !== undefined) {
      sets.push('status = ?');
      params.push(status);
      if (status === 'completed') {
        sets.push('completed_at = CURRENT_TIMESTAMP');
      }
    }

    if (sets.length === 0) return 0;

    params.push(meetingId);
    const stmt = db.prepare(`UPDATE meetings SET ${sets.join(', ')} WHERE id = ?`);
    return stmt.run(...params).changes;
  } catch (err) {
    console.error('[Database] updateMeeting error:', err.message);
    return 0;
  }
}

/**
 * Delete a meeting.
 * @param {number} meetingId
 * @returns {number} rows deleted (0 or 1)
 */
function deleteMeeting(meetingId) {
  if (!db) return 0;
  try {
    return db.prepare('DELETE FROM meetings WHERE id = ?').run(meetingId).changes;
  } catch (err) {
    console.error('[Database] deleteMeeting error:', err.message);
    return 0;
  }
}

/**
 * Get the most recent active meeting for a user.
 * @param {string} userId
 * @returns {object|null}
 */
function getActiveMeeting(userId) {
  if (!db) return null;
  try {
    return db.prepare(
      "SELECT * FROM meetings WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).get(String(userId)) || null;
  } catch (err) {
    console.error('[Database] getActiveMeeting error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Document Analyses
// ---------------------------------------------------------------------------

/**
 * Save a document analysis result.
 * @param {string} userId
 * @param {string} chatId
 * @param {{ filename: string, filePath?: string, summary?: string, extractedData?: string }} data
 * @returns {{ id: number } | null}
 */
function saveDocumentAnalysis(userId, chatId, { filename, filePath = null, summary = null, extractedData = null }) {
  if (!db) return null;
  try {
    const stmt = db.prepare(
      'INSERT INTO document_analyses (user_id, chat_id, filename, file_path, summary, extracted_data) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(userId), String(chatId), filename, filePath, summary, extractedData);
    return { id: Number(info.lastInsertRowid) };
  } catch (err) {
    console.error('[Database] saveDocumentAnalysis error:', err.message);
    return null;
  }
}

/**
 * Get a document analysis by ID.
 * @param {number} analysisId
 * @returns {object|null}
 */
function getDocumentAnalysis(analysisId) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM document_analyses WHERE id = ?');
    return stmt.get(analysisId) || null;
  } catch (err) {
    console.error('[Database] getDocumentAnalysis error:', err.message);
    return null;
  }
}

/**
 * Get all document analyses for a user.
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Array<{ id: number, filename: string, summary: string, created_at: string }>}
 */
function getDocumentAnalyses(userId, limit = 20) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT id, filename, summary, created_at FROM document_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(String(userId), limit);
  } catch (err) {
    console.error('[Database] getDocumentAnalyses error:', err.message);
    return [];
  }
}

/**
 * Get recent document analyses for a chat.
 * @param {string} chatId
 * @param {number} [limit=10]
 * @returns {Array<{ id: number, filename: string, summary: string, created_at: string }>}
 */
function getDocumentAnalysesByChat(chatId, limit = 10) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT id, filename, summary, created_at FROM document_analyses WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(String(chatId), limit);
  } catch (err) {
    console.error('[Database] getDocumentAnalysesByChat error:', err.message);
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

  // Pomodoro Sessions
  savePomodoroSession,
  updatePomodoroSessionStatus,
  getPomodoroSessionCountToday,
  getPomodoroStatisticsToday,
  getRecentPomodoroSessions,

  // Backups
  saveBackup,
  listBackups,
  getBackup,
  deleteOldBackups,

  // Secrets
  saveSecret,
  getSecret,
  listSecrets,
  deleteSecret,
  incrementSecretAccess,
  logSecretAudit,
  getSecretAuditHistory,

  // Invoices
  generateInvoiceNumber,
  saveInvoice,
  getInvoice,
  listInvoices,
  updateInvoiceStatus,
  deleteInvoice,

  // Budgets
  saveBudget,
  getBudgets,
  getBudget,
  deleteBudget,

  // Recurring Expenses
  saveRecurringExpense,
  getRecurringExpenses,
  getDueRecurringExpenses,
  updateRecurringExpenseNextDate,
  deactivateRecurringExpense,
  deleteRecurringExpense,

  // Meetings
  saveMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  deleteMeeting,
  getActiveMeeting,

  // Document Analyses
  saveDocumentAnalysis,
  getDocumentAnalysis,
  getDocumentAnalyses,
  getDocumentAnalysesByChat,

  // Utility
  getDb,
  close,
};
