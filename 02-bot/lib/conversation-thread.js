/**
 * Conversation Thread — Pronoun Resolution & Context Carryover
 *
 * Tracks entity mentions per chat so that follow-up messages using pronouns
 * ("it", "them", "there", "again") resolve to the correct target. Designed
 * to sit BEFORE SmartRouter in the message processing pipeline.
 *
 * Example:
 *   User: "deploy JUDO"          → records lastRepo = "JUDO"
 *   User: "now run tests on it"  → resolves to "now run tests on JUDO"
 *
 * Usage:
 *   const conversationThread = require('./lib/conversation-thread');
 *   conversationThread.recordMention(chatId, 'repo', 'JUDO');
 *   const resolved = conversationThread.resolvePronouns(chatId, 'run tests on it');
 *   // → "run tests on JUDO"
 *
 * @module lib/conversation-thread
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Thread state TTL: 30 minutes of inactivity */
const THREAD_TTL = 30 * 60 * 1000;

/** Maximum number of active threads (LRU eviction beyond this) */
const MAX_THREADS = 500;

/** Cleanup interval: every 5 minutes */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/** Maximum entries in the per-thread mentions ring buffer */
const MAX_MENTIONS = 5;

/**
 * Known repository names (case-insensitive matching).
 * Values are stored in their canonical casing.
 * @type {Map<string, string>}
 */
const KNOWN_REPOS = new Map([
  ['judo', 'JUDO'],
  ['lusotown', 'LusoTown'],
  ['armora', 'armora'],
  ['gqcars-manager', 'gqcars-manager'],
  ['gq-cars-driver-app', 'gq-cars-driver-app'],
  ['giquina-accountancy-direct-filing', 'giquina-accountancy-direct-filing'],
  ['giquina-accountancy', 'giquina-accountancy-direct-filing'],
  ['aws-clawd-bot', 'aws-clawd-bot'],
  ['clawd-bot', 'aws-clawd-bot'],
  ['giquina-website', 'giquina-website'],
  ['gq-cars', 'gq-cars'],
  ['giquina-portal', 'giquina-portal'],
  ['moltbook', 'moltbook'],
]);

/**
 * Known company codes (case-insensitive matching).
 * Values are stored in their canonical casing.
 * @type {Map<string, string>}
 */
const KNOWN_COMPANIES = new Map([
  ['gmh', 'GMH'],
  ['gacc', 'GACC'],
  ['gcap', 'GCAP'],
  ['gqcars', 'GQCARS'],
  ['gspv', 'GSPV'],
]);

/**
 * Action verbs that can be referenced via "same" / "again".
 * @type {Set<string>}
 */
const ACTION_VERBS = new Set([
  'deploy', 'test', 'build', 'run', 'check', 'fix', 'review',
  'show', 'list', 'create', 'delete', 'update', 'restart',
  'push', 'pull', 'merge', 'revert', 'rollback', 'install',
]);

// ---------------------------------------------------------------------------
// Pronoun Patterns (compiled once)
// ---------------------------------------------------------------------------

/**
 * Patterns for singular pronoun resolution (it/that/this).
 * These resolve to lastRepo or lastEntity, whichever was mentioned most recently.
 *
 * Word-boundary anchored to avoid matching inside words like "with" or "item".
 * Uses negative lookbehind/lookahead where needed.
 * @type {RegExp[]}
 */
const SINGULAR_PRONOUN_PATTERNS = [
  // "on it", "to it", "for it", "with it", "in it" — pronoun at end or mid-sentence
  /\b(on|to|for|with|in|from|about|against)\s+it\b/gi,
  // "it" at start: "it needs fixing" — but not "iterate", "item"
  /^it\b/gi,
  // Standalone "fix it", "deploy it", "test it", "check it"
  /\b(deploy|test|build|run|check|fix|review|restart|push|pull|merge|revert|install)\s+it\b/gi,
];

/**
 * Patterns for plural pronoun resolution (them/those/they/their).
 * Resolve to lastCompany or plural entity.
 * @type {RegExp[]}
 */
const PLURAL_PRONOUN_PATTERNS = [
  /\b(their|them|those|they)\b/gi,
];

/**
 * Patterns for locational pronouns (there/that repo/that project).
 * Resolve to lastRepo specifically.
 * @type {RegExp[]}
 */
const LOCATION_PRONOUN_PATTERNS = [
  /\bthere\b/gi,
  /\bthat\s+(repo|project|repository)\b/gi,
  /\bthis\s+(repo|project|repository)\b/gi,
];

/**
 * Patterns for "same" / "again" — repeat last action on last or new target.
 * @type {RegExp[]}
 */
const REPEAT_PATTERNS = [
  // Standalone "again" — repeat last action on last target
  /^again$/i,
  // "same thing" / "same" standalone
  /^same(\s+thing)?$/i,
  // "do the same for X" — repeat last action on X
  /\bdo\s+the\s+same\b/i,
  // "same for X"
  /\bsame\s+for\b/i,
];

/**
 * Pattern for "the other one" / "the other" — resolves to second-to-last repo.
 * @type {RegExp}
 */
const OTHER_PATTERN = /\bthe\s+other(\s+one)?\b/gi;

// ---------------------------------------------------------------------------
// ConversationThread Class
// ---------------------------------------------------------------------------

class ConversationThread {
  constructor() {
    /** @type {Map<string, ThreadState>} */
    this._threads = new Map();

    /** @type {number} Total mentions recorded across all threads */
    this._totalMentions = 0;

    /** @type {number} Total pronoun resolutions performed */
    this._totalResolutions = 0;

    /** @type {NodeJS.Timeout|null} */
    this._cleanupInterval = null;

    // Start periodic cleanup
    this._startCleanup();

    console.log('[ConversationThread] Initialized');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record an entity mention in a conversation thread.
   *
   * Call this whenever a message references a known repo, company, action,
   * or entity. Multiple calls per message are fine — each updates the
   * thread state and appends to the mentions ring buffer.
   *
   * @param {string} chatId - Telegram/WhatsApp chat identifier
   * @param {'repo'|'company'|'action'|'entity'} type - Entity type
   * @param {string} value - The entity value (e.g., "JUDO", "GMH", "deploy")
   * @returns {void}
   */
  recordMention(chatId, type, value) {
    if (!chatId || !type || !value) return;

    const key = String(chatId);
    const state = this._getOrCreate(key);
    const now = Date.now();

    // Update the appropriate "last" field
    switch (type) {
      case 'repo':
        state.lastRepo = String(value);
        break;
      case 'company':
        state.lastCompany = String(value);
        break;
      case 'action':
        state.lastAction = String(value).toLowerCase();
        break;
      case 'entity':
        state.lastEntity = String(value);
        break;
      default:
        console.warn(`[ConversationThread] Unknown mention type "${type}"`);
        return;
    }

    // Append to ring buffer
    state.lastMentions.push({
      type,
      value: String(value),
      timestamp: now,
    });

    // Trim ring buffer to MAX_MENTIONS
    if (state.lastMentions.length > MAX_MENTIONS) {
      state.lastMentions = state.lastMentions.slice(-MAX_MENTIONS);
    }

    state.updatedAt = now;
    this._totalMentions++;
  }

  /**
   * Scan a message for known entities and record all mentions automatically.
   *
   * This is a convenience method that detects repos, companies, and action
   * verbs in the raw message text and calls {@link recordMention} for each.
   * Should be called on every incoming user message.
   *
   * @param {string} chatId - Chat identifier
   * @param {string} message - Raw user message text
   * @returns {Array<{type: string, value: string}>} List of detected mentions
   */
  detectAndRecord(chatId, message) {
    if (!chatId || !message || typeof message !== 'string') return [];

    const detected = [];
    const lower = message.toLowerCase();

    // Detect repos — scan for known repo names as whole words
    for (const [key, canonical] of KNOWN_REPOS.entries()) {
      // Build a regex that matches the key as a whole word
      const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(message)) {
        this.recordMention(chatId, 'repo', canonical);
        detected.push({ type: 'repo', value: canonical });
      }
    }

    // Detect companies — scan for known company codes as whole words
    for (const [key, canonical] of KNOWN_COMPANIES.entries()) {
      const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(message)) {
        this.recordMention(chatId, 'company', canonical);
        detected.push({ type: 'company', value: canonical });
      }
    }

    // Detect action verbs (first one found wins — it's the primary action)
    for (const verb of ACTION_VERBS) {
      const re = new RegExp(`\\b${verb}\\b`, 'i');
      if (re.test(lower)) {
        this.recordMention(chatId, 'action', verb);
        detected.push({ type: 'action', value: verb });
        break; // Only record the first (primary) action verb
      }
    }

    // Detect generic entities — noun phrases after action verbs
    // e.g., "check the login page" → entity = "login page"
    const entityMatch = message.match(
      /\b(?:check|fix|update|review|test|build|create|show|deploy)\s+(?:the\s+)?([a-z][a-z0-9\s-]{2,30}?)(?:\s*$|\s+(?:on|for|in|to|from|with|and)\b)/i
    );
    if (entityMatch && entityMatch[1]) {
      const entity = entityMatch[1].trim();
      // Only record if it is NOT a known repo or company (those are already recorded)
      const entityLower = entity.toLowerCase();
      if (!KNOWN_REPOS.has(entityLower) && !KNOWN_COMPANIES.has(entityLower)) {
        this.recordMention(chatId, 'entity', entity);
        detected.push({ type: 'entity', value: entity });
      }
    }

    return detected;
  }

  /**
   * Resolve pronouns in a message using the thread's context.
   *
   * Examines the message for pronoun patterns and replaces them with the
   * corresponding entity from thread state. If no resolution context exists
   * (e.g., first message in a conversation), the message is returned unchanged.
   *
   * Should be called BEFORE SmartRouter processes the message.
   *
   * @param {string} chatId - Chat identifier
   * @param {string} message - Raw user message
   * @returns {string} Message with pronouns resolved (or original if nothing to resolve)
   */
  resolvePronouns(chatId, message) {
    if (!chatId || !message || typeof message !== 'string') return message || '';

    const key = String(chatId);
    const state = this._threads.get(key);

    // No thread state → return unchanged
    if (!state) return message;

    // Check TTL — if expired, clear and return unchanged
    if (Date.now() - state.updatedAt > THREAD_TTL) {
      this._threads.delete(key);
      return message;
    }

    let resolved = message;
    let didResolve = false;

    // --- Rule 4: "again" / "same" / "same thing" (check FIRST, standalone patterns) ---
    resolved = this._resolveRepeat(resolved, state);
    if (resolved !== message) {
      didResolve = true;
    }

    // --- Rule 5: "the other one" / "the other" ---
    if (!didResolve) {
      resolved = this._resolveOther(resolved, state);
      if (resolved !== message) {
        didResolve = true;
      }
    }

    // --- Rule 3: "there" / "that repo" / "that project" ---
    if (!didResolve || resolved.match(/\bthere\b/i) || resolved.match(/\bthat\s+(repo|project|repository)\b/i)) {
      const beforeLocational = resolved;
      resolved = this._resolveLocational(resolved, state);
      if (resolved !== beforeLocational) {
        didResolve = true;
      }
    }

    // --- Rule 2: "them" / "those" / "they" / "their" ---
    {
      const beforePlural = resolved;
      resolved = this._resolvePlural(resolved, state);
      if (resolved !== beforePlural) {
        didResolve = true;
      }
    }

    // --- Rule 1: "it" / "that" / "this" ---
    {
      const beforeSingular = resolved;
      resolved = this._resolveSingular(resolved, state);
      if (resolved !== beforeSingular) {
        didResolve = true;
      }
    }

    if (didResolve) {
      this._totalResolutions++;
      console.log(`[ConversationThread] Resolved: "${message}" -> "${resolved}" (chat=${chatId})`);
    }

    return resolved;
  }

  /**
   * Get the current thread state for a chat.
   *
   * Returns null if no state exists or the state has expired.
   *
   * @param {string} chatId - Chat identifier
   * @returns {ThreadState|null} Current thread state or null
   */
  getState(chatId) {
    if (!chatId) return null;

    const key = String(chatId);
    const state = this._threads.get(key);

    if (!state) return null;

    // Check TTL
    if (Date.now() - state.updatedAt > THREAD_TTL) {
      this._threads.delete(key);
      return null;
    }

    // Return a defensive copy
    return {
      chatId: state.chatId,
      lastRepo: state.lastRepo,
      lastCompany: state.lastCompany,
      lastAction: state.lastAction,
      lastEntity: state.lastEntity,
      lastMentions: [...state.lastMentions],
      updatedAt: state.updatedAt,
    };
  }

  /**
   * Clear thread state for a specific chat.
   *
   * Use when the conversation topic changes explicitly (e.g., user starts
   * talking about a completely different project).
   *
   * @param {string} chatId - Chat identifier
   * @returns {boolean} True if state existed and was cleared
   */
  clear(chatId) {
    if (!chatId) return false;
    const existed = this._threads.delete(String(chatId));
    if (existed) {
      console.log(`[ConversationThread] Cleared state for chat ${chatId}`);
    }
    return existed;
  }

  /**
   * Get diagnostic statistics about the thread manager.
   *
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      activeThreads: this._threads.size,
      maxThreads: MAX_THREADS,
      totalMentions: this._totalMentions,
      totalResolutions: this._totalResolutions,
      threadTTL: THREAD_TTL,
      maxMentionsPerThread: MAX_MENTIONS,
    };
  }

  /**
   * Destroy the thread manager — clears all state and stops cleanup interval.
   * Used for graceful shutdown or testing.
   */
  destroy() {
    this._stopCleanup();
    this._threads.clear();
    console.log('[ConversationThread] Destroyed');
  }

  // -------------------------------------------------------------------------
  // Private: Resolution Logic
  // -------------------------------------------------------------------------

  /**
   * Resolve singular pronouns: "it", "that", "this".
   * Maps to the most recently mentioned repo or entity.
   *
   * @private
   * @param {string} message
   * @param {ThreadState} state
   * @returns {string}
   */
  _resolveSingular(message, state) {
    // Determine replacement: prefer the most recent between lastRepo and lastEntity
    const replacement = this._getMostRecentSingular(state);
    if (!replacement) return message;

    let result = message;

    // Replace "deploy it", "test it", etc.
    result = result.replace(
      /\b(deploy|test|build|run|check|fix|review|restart|push|pull|merge|revert|install)\s+it\b/gi,
      `$1 ${replacement}`
    );

    // Replace "on it", "to it", "for it", etc.
    result = result.replace(
      /\b(on|to|for|with|in|from|about|against)\s+it\b/gi,
      `$1 ${replacement}`
    );

    // Replace standalone "it" at start of sentence
    // Use a careful pattern to avoid replacing "it" inside words
    if (/^it\b/i.test(result) && result.length > 2) {
      result = result.replace(/^it\b/i, replacement);
    }

    return result;
  }

  /**
   * Resolve plural pronouns: "them", "those", "they", "their".
   * Maps to lastCompany.
   *
   * @private
   * @param {string} message
   * @param {ThreadState} state
   * @returns {string}
   */
  _resolvePlural(message, state) {
    const replacement = state.lastCompany;
    if (!replacement) return message;

    let result = message;

    // "their" → possessive: "GMH's" or just "GMH"
    result = result.replace(/\btheir\b/gi, `${replacement}`);

    // "them" → "GMH"
    result = result.replace(/\bthem\b/gi, replacement);

    // "those" → "GMH" (when used as a pronoun, not demonstrative adjective)
    result = result.replace(/\bthose\b/gi, replacement);

    // "they" → "GMH"
    result = result.replace(/\bthey\b/gi, replacement);

    return result;
  }

  /**
   * Resolve locational pronouns: "there", "that repo", "that project".
   * Always maps to lastRepo.
   *
   * @private
   * @param {string} message
   * @param {ThreadState} state
   * @returns {string}
   */
  _resolveLocational(message, state) {
    if (!state.lastRepo) return message;

    let result = message;

    // "there" → "in JUDO"
    result = result.replace(/\bthere\b/gi, `in ${state.lastRepo}`);

    // "that repo" / "that project" / "that repository"
    result = result.replace(/\bthat\s+(repo|project|repository)\b/gi, state.lastRepo);

    // "this repo" / "this project" / "this repository"
    result = result.replace(/\bthis\s+(repo|project|repository)\b/gi, state.lastRepo);

    return result;
  }

  /**
   * Resolve repeat patterns: "again", "same", "same thing", "do the same for X".
   *
   * @private
   * @param {string} message
   * @param {ThreadState} state
   * @returns {string}
   */
  _resolveRepeat(message, state) {
    const trimmed = message.trim();

    // "again" standalone → repeat last action on last target
    if (/^again$/i.test(trimmed)) {
      if (state.lastAction && state.lastRepo) {
        return `${state.lastAction} ${state.lastRepo}`;
      }
      if (state.lastAction && state.lastEntity) {
        return `${state.lastAction} ${state.lastEntity}`;
      }
      return message;
    }

    // "same" / "same thing" standalone → repeat last action on last target
    if (/^same(\s+thing)?$/i.test(trimmed)) {
      if (state.lastAction && state.lastRepo) {
        return `${state.lastAction} ${state.lastRepo}`;
      }
      if (state.lastAction && state.lastEntity) {
        return `${state.lastAction} ${state.lastEntity}`;
      }
      return message;
    }

    // "do the same for X" / "same for X" → replace action target with X
    const sameForMatch = trimmed.match(/\b(?:do\s+the\s+)?same\s+for\s+(.+)$/i);
    if (sameForMatch && state.lastAction) {
      const newTarget = sameForMatch[1].trim();
      return `${state.lastAction} ${newTarget}`;
    }

    return message;
  }

  /**
   * Resolve "the other one" / "the other" → second-to-last mentioned repo.
   *
   * @private
   * @param {string} message
   * @param {ThreadState} state
   * @returns {string}
   */
  _resolveOther(message, state) {
    if (!OTHER_PATTERN.test(message)) return message;

    // Reset lastIndex since the regex is global
    OTHER_PATTERN.lastIndex = 0;

    // Find the second-to-last repo mention in the ring buffer
    const repoMentions = state.lastMentions
      .filter(m => m.type === 'repo')
      .reverse(); // newest first

    if (repoMentions.length < 2) return message;

    const otherRepo = repoMentions[1].value; // second-to-last
    return message.replace(OTHER_PATTERN, otherRepo);
  }

  /**
   * Determine the most recently mentioned singular entity (repo or entity).
   *
   * Looks at the mentions ring buffer to find which was mentioned most
   * recently: a repo or a generic entity.
   *
   * @private
   * @param {ThreadState} state
   * @returns {string|null}
   */
  _getMostRecentSingular(state) {
    // Walk the mentions ring buffer from newest to oldest
    for (let i = state.lastMentions.length - 1; i >= 0; i--) {
      const mention = state.lastMentions[i];
      if (mention.type === 'repo' || mention.type === 'entity') {
        return mention.value;
      }
    }
    // Fallback to state fields
    return state.lastRepo || state.lastEntity || null;
  }

  // -------------------------------------------------------------------------
  // Private: Thread Management
  // -------------------------------------------------------------------------

  /**
   * Get or create thread state for a chat, enforcing LRU eviction at MAX_THREADS.
   *
   * @private
   * @param {string} key - Chat ID as string
   * @returns {ThreadState}
   */
  _getOrCreate(key) {
    let state = this._threads.get(key);

    if (state) {
      // Move to end of Map (most recently used) by re-inserting
      this._threads.delete(key);
      this._threads.set(key, state);
      return state;
    }

    // Evict LRU if at capacity
    if (this._threads.size >= MAX_THREADS) {
      const oldestKey = this._threads.keys().next().value;
      if (oldestKey !== undefined) {
        this._threads.delete(oldestKey);
        console.log(`[ConversationThread] LRU evicted thread for chat ${oldestKey}`);
      }
    }

    // Create new state
    state = {
      chatId: key,
      lastRepo: null,
      lastCompany: null,
      lastAction: null,
      lastEntity: null,
      lastMentions: [],
      updatedAt: Date.now(),
    };

    this._threads.set(key, state);
    return state;
  }

  /**
   * Remove threads that have exceeded the TTL.
   *
   * @private
   * @returns {number} Number of threads removed
   */
  _cleanupExpired() {
    const now = Date.now();
    let removed = 0;

    for (const [key, state] of this._threads.entries()) {
      if (now - state.updatedAt > THREAD_TTL) {
        this._threads.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[ConversationThread] Cleaned up ${removed} expired thread(s)`);
    }

    return removed;
  }

  /**
   * Start the periodic cleanup interval.
   *
   * @private
   */
  _startCleanup() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => this._cleanupExpired(), CLEANUP_INTERVAL);
    // Allow the process to exit even if the interval is running
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Stop the periodic cleanup interval.
   *
   * @private
   */
  _stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Type Definitions (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ThreadState
 * @property {string} chatId - The chat identifier
 * @property {string|null} lastRepo - Most recently mentioned repository
 * @property {string|null} lastCompany - Most recently mentioned company code
 * @property {string|null} lastAction - Most recently mentioned action verb
 * @property {string|null} lastEntity - Most recently mentioned generic entity
 * @property {Array<Mention>} lastMentions - Ring buffer of last N mentions
 * @property {number} updatedAt - Timestamp of last update (ms since epoch)
 */

/**
 * @typedef {Object} Mention
 * @property {'repo'|'company'|'action'|'entity'} type - Type of mention
 * @property {string} value - The mentioned value
 * @property {number} timestamp - When it was mentioned (ms since epoch)
 */

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

module.exports = new ConversationThread();
