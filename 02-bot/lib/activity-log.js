/**
 * Activity Log - In-memory real-time activity tracker for ClawdBot
 *
 * Tracks what the bot is doing at any moment using a ring buffer
 * of the last 200 entries. Useful for diagnostics, the /health
 * endpoint, and debugging live behaviour without tailing log files.
 *
 * Usage:
 *   const activityLog = require('./lib/activity-log');
 *   activityLog.log('activity', 'telegram', 'Processing /deploy command', { repo: 'aws-clawd-bot' });
 *   activityLog.getRecent(10);
 */

'use strict';

const MAX_ENTRIES = 200;

const VALID_LEVELS = new Set(['info', 'warn', 'error', 'activity']);

let entries = [];
let nextId = 1;
let head = 0;   // insertion index within the ring buffer
let size = 0;   // current number of stored entries

/**
 * Record an activity log entry.
 *
 * @param {'info'|'warn'|'error'|'activity'} level
 * @param {string} source  - e.g. 'telegram', 'voice', 'ai', 'skill', 'webhook', 'system'
 * @param {string} message - human-readable description of what happened
 * @param {object} [meta]  - optional metadata object (repo name, timings, etc.)
 * @returns {object} the created entry
 */
function log(level, source, message, meta = null) {
  if (!VALID_LEVELS.has(level)) {
    level = 'info';
  }

  const entry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    source: String(source),
    message: String(message),
    meta: meta || undefined,
  };

  if (size < MAX_ENTRIES) {
    // Buffer is not full yet - just push
    entries.push(entry);
    head = entries.length;
    size++;
  } else {
    // Buffer is full - overwrite oldest slot
    const idx = head % MAX_ENTRIES;
    entries[idx] = entry;
    head = idx + 1;
  }

  return entry;
}

/**
 * Retrieve the most recent entries, newest first.
 *
 * @param {number} [limit=50]  - max entries to return
 * @param {string} [source]    - optional filter by source
 * @returns {object[]}
 */
function getRecent(limit = 50, source = null) {
  // Build a chronologically-ordered snapshot from the ring buffer
  let ordered;
  if (size < MAX_ENTRIES) {
    ordered = entries.slice();
  } else {
    // head points to the next write position, so the oldest entry is at head
    const idx = head % MAX_ENTRIES;
    ordered = entries.slice(idx).concat(entries.slice(0, idx));
  }

  // Newest first
  ordered.reverse();

  if (source) {
    const src = source.toLowerCase();
    ordered = ordered.filter((e) => e.source.toLowerCase() === src);
  }

  return ordered.slice(0, Math.max(0, limit));
}

/**
 * Retrieve entries filtered by level, newest first.
 *
 * @param {'info'|'warn'|'error'|'activity'} level
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function getByLevel(level, limit = 50) {
  const all = getRecent(MAX_ENTRIES);
  return all.filter((e) => e.level === level).slice(0, Math.max(0, limit));
}

/**
 * Clear all entries and reset the ID counter.
 */
function clear() {
  entries = [];
  head = 0;
  size = 0;
  nextId = 1;
}

module.exports = {
  log,
  getRecent,
  getByLevel,
  clear,
  /** Expose for testing / diagnostics */
  get size() {
    return size;
  },
  get maxEntries() {
    return MAX_ENTRIES;
  },
};
