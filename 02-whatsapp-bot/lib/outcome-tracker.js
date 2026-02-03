/**
 * Outcome Tracker - Records results of every bot action
 *
 * After every action (deploy, PR created, plan executed, command run),
 * tracks what was requested, what happened, and whether it succeeded.
 * Feeds back into the context engine so Claude learns from history.
 *
 * Uses SQLite (via database.js) for persistence.
 *
 * @module lib/outcome-tracker
 */

'use strict';

let _db = null;
let _initialized = false;

function getDb() {
  if (!_db) {
    try {
      _db = require('./database');
    } catch (e) {
      _db = false;
    }
  }
  return _db && _db.getDb ? _db.getDb() : null;
}

/**
 * Initialize the outcomes table
 */
function init() {
  if (_initialized) return;

  const db = getDb();
  if (!db) {
    _initialized = true;
    return;
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_detail TEXT,
        repo TEXT,
        result TEXT NOT NULL DEFAULT 'pending',
        result_detail TEXT,
        pr_url TEXT,
        deploy_url TEXT,
        user_feedback TEXT,
        feedback_sentiment TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_outcomes_chat ON outcomes(chat_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_outcomes_repo ON outcomes(repo, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_outcomes_type ON outcomes(action_type, created_at DESC);
    `);
    _initialized = true;
    console.log('[OutcomeTracker] Initialized');
  } catch (e) {
    console.warn('[OutcomeTracker] Init failed:', e.message);
    _initialized = true;
  }
}

/**
 * Record the start of an action.
 *
 * @param {Object} params
 * @param {string} params.chatId
 * @param {string} params.userId
 * @param {string} params.actionType - 'deploy', 'pr_created', 'plan_executed', 'command', 'code_edit', 'issue_created'
 * @param {string} [params.actionDetail] - human-readable description
 * @param {string} [params.repo] - which repo this affects
 * @returns {number|null} outcome ID for later update
 */
function startAction({ chatId, userId, actionType, actionDetail = null, repo = null }) {
  init();
  const db = getDb();
  if (!db) return null;

  try {
    const stmt = db.prepare(
      'INSERT INTO outcomes (chat_id, user_id, action_type, action_detail, repo) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(String(chatId), String(userId), actionType, actionDetail, repo);
    return Number(info.lastInsertRowid);
  } catch (e) {
    console.error('[OutcomeTracker] startAction error:', e.message);
    return null;
  }
}

/**
 * Record the result of an action.
 *
 * @param {number} outcomeId
 * @param {Object} params
 * @param {string} params.result - 'success' | 'failed' | 'cancelled' | 'partial'
 * @param {string} [params.resultDetail] - what happened
 * @param {string} [params.prUrl] - PR URL if applicable
 * @param {string} [params.deployUrl] - deployment URL if applicable
 * @param {number} [params.durationMs] - how long it took
 */
function completeAction(outcomeId, { result, resultDetail = null, prUrl = null, deployUrl = null, durationMs = null } = {}) {
  if (!outcomeId) return;

  const db = getDb();
  if (!db) return;

  try {
    const sets = ['result = ?', 'completed_at = CURRENT_TIMESTAMP'];
    const params = [result];

    if (resultDetail) { sets.push('result_detail = ?'); params.push(resultDetail); }
    if (prUrl) { sets.push('pr_url = ?'); params.push(prUrl); }
    if (deployUrl) { sets.push('deploy_url = ?'); params.push(deployUrl); }
    if (durationMs != null) { sets.push('duration_ms = ?'); params.push(durationMs); }

    params.push(outcomeId);
    db.prepare(`UPDATE outcomes SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  } catch (e) {
    console.error('[OutcomeTracker] completeAction error:', e.message);
  }
}

/**
 * Record user feedback about an action outcome.
 *
 * @param {number} outcomeId
 * @param {string} feedback - what the user said
 * @param {string} [sentiment] - 'positive' | 'negative' | 'neutral'
 */
function recordFeedback(outcomeId, feedback, sentiment = 'neutral') {
  if (!outcomeId) return;

  const db = getDb();
  if (!db) return;

  try {
    db.prepare('UPDATE outcomes SET user_feedback = ?, feedback_sentiment = ? WHERE id = ?')
      .run(feedback, sentiment, outcomeId);
  } catch (e) {
    console.error('[OutcomeTracker] recordFeedback error:', e.message);
  }
}

/**
 * Get recent outcomes for a chat (for context injection).
 *
 * @param {string} chatId
 * @param {number} [limit=5]
 * @returns {Array}
 */
function getRecentOutcomes(chatId, limit = 5) {
  init();
  const db = getDb();
  if (!db) return [];

  try {
    return db.prepare(
      'SELECT * FROM outcomes WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(String(chatId), limit);
  } catch (e) {
    console.error('[OutcomeTracker] getRecentOutcomes error:', e.message);
    return [];
  }
}

/**
 * Get recent outcomes for a specific repo.
 *
 * @param {string} repo
 * @param {number} [limit=5]
 * @returns {Array}
 */
function getRepoOutcomes(repo, limit = 5) {
  init();
  const db = getDb();
  if (!db) return [];

  try {
    return db.prepare(
      'SELECT * FROM outcomes WHERE repo = ? ORDER BY created_at DESC LIMIT ?'
    ).all(repo, limit);
  } catch (e) {
    console.error('[OutcomeTracker] getRepoOutcomes error:', e.message);
    return [];
  }
}

/**
 * Get success rate for a specific action type (for learning).
 *
 * @param {string} actionType
 * @returns {{ total: number, succeeded: number, failed: number, rate: number }}
 */
function getSuccessRate(actionType) {
  init();
  const db = getDb();
  if (!db) return { total: 0, succeeded: 0, failed: 0, rate: 0 };

  try {
    const total = db.prepare(
      'SELECT COUNT(*) as cnt FROM outcomes WHERE action_type = ? AND result != ?'
    ).get(actionType, 'pending');

    const succeeded = db.prepare(
      'SELECT COUNT(*) as cnt FROM outcomes WHERE action_type = ? AND result = ?'
    ).get(actionType, 'success');

    const t = total?.cnt || 0;
    const s = succeeded?.cnt || 0;

    return {
      total: t,
      succeeded: s,
      failed: t - s,
      rate: t > 0 ? Math.round((s / t) * 100) : 0,
    };
  } catch (e) {
    console.error('[OutcomeTracker] getSuccessRate error:', e.message);
    return { total: 0, succeeded: 0, failed: 0, rate: 0 };
  }
}

/**
 * Get the last outcome for a specific action type and repo.
 * Useful for "last time you deployed JUDO, it succeeded at <url>".
 *
 * @param {string} actionType
 * @param {string} repo
 * @returns {Object|null}
 */
function getLastOutcome(actionType, repo) {
  init();
  const db = getDb();
  if (!db) return null;

  try {
    return db.prepare(
      'SELECT * FROM outcomes WHERE action_type = ? AND repo = ? ORDER BY created_at DESC LIMIT 1'
    ).get(actionType, repo) || null;
  } catch (e) {
    console.error('[OutcomeTracker] getLastOutcome error:', e.message);
    return null;
  }
}

/**
 * Format recent outcomes for system prompt injection.
 *
 * @param {string} chatId
 * @returns {string}
 */
function formatForContext(chatId) {
  const outcomes = getRecentOutcomes(chatId, 5);
  if (!outcomes || outcomes.length === 0) return '';

  const lines = outcomes.map(o => {
    const icon = o.result === 'success' ? '✅' : o.result === 'failed' ? '❌' : '⏳';
    const detail = o.action_detail ? `: ${o.action_detail.substring(0, 60)}` : '';
    const url = o.pr_url || o.deploy_url || '';
    return `  ${icon} ${o.action_type}${detail}${url ? ` → ${url}` : ''} (${o.result})`;
  });

  return `\n📊 Recent action outcomes:\n${lines.join('\n')}`;
}

module.exports = {
  startAction,
  completeAction,
  recordFeedback,
  getRecentOutcomes,
  getRepoOutcomes,
  getSuccessRate,
  getLastOutcome,
  formatForContext,
  init,
};
