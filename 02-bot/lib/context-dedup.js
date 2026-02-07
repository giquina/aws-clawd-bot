/**
 * Context Dedup — Per-request context caching for the Context Engine
 *
 * Problem: The context engine's build() method is called up to 9 times per
 * incoming message across different code paths in index.js (voice processing,
 * plan execution, AI fallback, WhatsApp, etc). Each call queries SQLite,
 * fetches GitHub data, and aggregates context — all of which is redundant
 * within a single message pipeline.
 *
 * Solution: Cache the context per chatId with a very short TTL (10 seconds),
 * just long enough to cover the entire message processing pipeline. The first
 * call builds context normally; subsequent calls within the TTL window return
 * the cached result instantly.
 *
 * Two usage modes:
 *   1. Direct: const dedup = require('./context-dedup'); dedup.getOrBuild(params)
 *   2. Monkey-patch: dedup.patchContextEngine() wraps the original build()
 *      so ALL existing callers automatically benefit with zero code changes.
 *
 * @module lib/context-dedup
 */

'use strict';

/**
 * @typedef {Object} CacheEntry
 * @property {Object} context - The built context object
 * @property {number} createdAt - Timestamp when the entry was created
 * @property {string} paramHash - Hash of the build parameters (for staleness detection)
 */

/**
 * Generate a deterministic cache key from build parameters.
 *
 * The key is based on chatId (primary), plus a hash of the other parameters
 * to detect when the same chatId is called with meaningfully different params
 * within the same TTL window (rare, but handled correctly).
 *
 * @param {Object} params - Parameters passed to contextEngine.build()
 * @returns {{ cacheKey: string, paramHash: string }}
 */
function deriveKey(params) {
  const chatId = params.chatId || params.userId || 'unknown';
  // Build a lightweight fingerprint from the params that affect context output.
  // We intentionally include autoRepo and autoCompany because they override
  // chat registry values and produce different context objects.
  const hashParts = [
    params.userId || '',
    params.platform || '',
    params.autoRepo || '',
    params.autoCompany || '',
  ].join('|');

  return {
    cacheKey: `ctx:${chatId}:${hashParts}`,
    paramHash: hashParts,
  };
}

class ContextDedup {
  /**
   * @param {number} [ttlMs=10000] - Cache TTL in milliseconds. Default 10 seconds,
   *   which is long enough for a single message pipeline but short enough that
   *   the next message always gets fresh context.
   */
  constructor(ttlMs = 10000) {
    /** @type {number} */
    this.ttlMs = ttlMs;

    /** @type {Map<string, CacheEntry>} */
    this._cache = new Map();

    /** @type {{ hits: number, misses: number, builds: number, errors: number, invalidations: number }} */
    this._stats = {
      hits: 0,
      misses: 0,
      builds: 0,
      errors: 0,
      invalidations: 0,
    };

    /** @type {boolean} */
    this._patched = false;

    /** @type {Function|null} - Reference to the original build function (before patching) */
    this._originalBuild = null;

    // Periodic cleanup every 30 seconds to prevent memory leaks from abandoned entries.
    // Use unref() so this timer does not prevent Node.js from exiting.
    this._cleanupTimer = setInterval(() => this.cleanup(), 30000);
    if (this._cleanupTimer && typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Get cached context or build it fresh via the context engine.
   *
   * This is the primary API. It transparently caches the result of
   * contextEngine.build() keyed by chatId + params.
   *
   * @param {Object} params - Same parameters as contextEngine.build()
   * @param {string} params.chatId
   * @param {string} params.userId
   * @param {string} [params.platform]
   * @param {string} [params.message]
   * @param {string} [params.autoRepo]
   * @param {string} [params.autoCompany]
   * @returns {Promise<Object>} The context object
   */
  async getOrBuild(params) {
    const { cacheKey } = deriveKey(params);
    const now = Date.now();

    // Check cache
    const cached = this._cache.get(cacheKey);
    if (cached && (now - cached.createdAt) < this.ttlMs) {
      this._stats.hits++;
      return cached.context;
    }

    // Cache miss — build fresh
    this._stats.misses++;

    let contextEngine;
    try {
      contextEngine = require('./context-engine');
    } catch (e) {
      this._stats.errors++;
      throw new Error(`[ContextDedup] Failed to load context-engine: ${e.message}`);
    }

    // Use the original (unpatched) build if we've monkey-patched,
    // to avoid infinite recursion.
    const buildFn = this._originalBuild || contextEngine.build;

    try {
      const context = await buildFn(params);
      this._stats.builds++;

      // Store in cache
      this._cache.set(cacheKey, {
        context,
        createdAt: now,
      });

      return context;
    } catch (buildErr) {
      this._stats.errors++;
      // Don't cache errors — let the next caller retry
      throw buildErr;
    }
  }

  /**
   * Invalidate cached context for a specific chatId.
   *
   * Call this after an action that changes state (e.g., deploy, PR creation,
   * plan execution) so the next context build picks up the new state.
   *
   * @param {string} chatId - The chat ID to invalidate
   */
  invalidate(chatId) {
    if (!chatId) return;

    const prefix = `ctx:${chatId}:`;
    let removed = 0;

    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this._stats.invalidations += removed;
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns {{ cacheSize: number, hits: number, misses: number, builds: number, errors: number, invalidations: number, hitRate: string, patched: boolean }}
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    const hitRate = total > 0
      ? ((this._stats.hits / total) * 100).toFixed(1) + '%'
      : '0.0%';

    return {
      cacheSize: this._cache.size,
      hits: this._stats.hits,
      misses: this._stats.misses,
      builds: this._stats.builds,
      errors: this._stats.errors,
      invalidations: this._stats.invalidations,
      hitRate,
      patched: this._patched,
    };
  }

  /**
   * Remove all expired entries from the cache.
   *
   * Called automatically every 30 seconds, but can also be called manually.
   *
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this._cache.entries()) {
      if ((now - entry.createdAt) >= this.ttlMs) {
        this._cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all cached entries and reset statistics.
   */
  clear() {
    this._cache.clear();
    this._stats = {
      hits: 0,
      misses: 0,
      builds: 0,
      errors: 0,
      invalidations: 0,
    };
  }

  /**
   * Monkey-patch the context engine's build() method with caching.
   *
   * After calling this, ALL existing code that does:
   *   const contextEngine = require('./lib/context-engine');
   *   const ctx = await contextEngine.build({ ... });
   *
   * ...will automatically benefit from deduplication, with zero code changes
   * required in index.js or anywhere else.
   *
   * Safe to call multiple times — only patches once.
   *
   * @returns {boolean} true if patching was applied, false if already patched
   */
  patchContextEngine() {
    if (this._patched) {
      return false;
    }

    let contextEngine;
    try {
      contextEngine = require('./context-engine');
    } catch (e) {
      console.error('[ContextDedup] Cannot patch: failed to load context-engine:', e.message);
      return false;
    }

    if (typeof contextEngine.build !== 'function') {
      console.error('[ContextDedup] Cannot patch: context-engine.build is not a function');
      return false;
    }

    // Save the original build function
    this._originalBuild = contextEngine.build;

    // Replace with our caching wrapper
    const self = this;
    contextEngine.build = async function patchedBuild(params) {
      return self.getOrBuild(params);
    };

    this._patched = true;
    console.log(`[ContextDedup] Patched context-engine.build() with ${this.ttlMs}ms TTL cache`);

    return true;
  }

  /**
   * Remove the monkey-patch and restore the original build() method.
   *
   * @returns {boolean} true if unpatching was applied, false if not currently patched
   */
  unpatchContextEngine() {
    if (!this._patched || !this._originalBuild) {
      return false;
    }

    let contextEngine;
    try {
      contextEngine = require('./context-engine');
    } catch (e) {
      console.error('[ContextDedup] Cannot unpatch: failed to load context-engine:', e.message);
      return false;
    }

    contextEngine.build = this._originalBuild;
    this._originalBuild = null;
    this._patched = false;
    console.log('[ContextDedup] Unpatched context-engine.build() — original restored');

    return true;
  }

  /**
   * Stop the cleanup timer. Call this during graceful shutdown.
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.unpatchContextEngine();
    this._cache.clear();
  }
}

// ── Singleton instance ──────────────────────────────────────────────────
// A single shared instance is used across the entire process.
// This is critical for the monkey-patch approach: all callers must share
// the same cache.

const instance = new ContextDedup();

// ── Convenience exports ─────────────────────────────────────────────────

module.exports = {
  /**
   * Get or build context (uses shared singleton).
   * @param {Object} params - Same as contextEngine.build() params
   * @returns {Promise<Object>}
   */
  getOrBuild: (params) => instance.getOrBuild(params),

  /**
   * Invalidate cached context for a chatId.
   * @param {string} chatId
   */
  invalidate: (chatId) => instance.invalidate(chatId),

  /**
   * Get cache statistics.
   * @returns {Object}
   */
  getStats: () => instance.getStats(),

  /**
   * Cleanup expired entries.
   * @returns {number}
   */
  cleanup: () => instance.cleanup(),

  /**
   * Clear all entries and reset stats.
   */
  clear: () => instance.clear(),

  /**
   * Monkey-patch context-engine.build() so ALL callers benefit automatically.
   * Call this once at startup (e.g., in index.js before bot.launch()).
   * @returns {boolean}
   */
  patchContextEngine: () => instance.patchContextEngine(),

  /**
   * Remove the monkey-patch and restore original build().
   * @returns {boolean}
   */
  unpatchContextEngine: () => instance.unpatchContextEngine(),

  /**
   * Stop timers and cleanup. Call during graceful shutdown.
   */
  destroy: () => instance.destroy(),

  /**
   * The ContextDedup class itself, for creating custom instances
   * (e.g., in tests with different TTL values).
   */
  ContextDedup,
};
