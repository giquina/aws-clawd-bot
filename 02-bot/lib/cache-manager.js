/**
 * LRU Cache Manager with TTL support
 *
 * Features:
 * - In-memory Least Recently Used (LRU) cache
 * - Time-to-live (TTL) automatic expiration
 * - Maximum size limit with automatic eviction
 * - Cache statistics (hits, misses, evictions)
 * - Thread-safe operations
 * - Environment-based configuration (CACHE_ENABLED, CACHE_TTL_SECONDS, CACHE_MAX_SIZE)
 *
 * @module lib/cache-manager
 */

class CacheManager {
  /**
   * Create a new cache manager
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.maxSize=100] - Maximum number of entries
   * @param {number} [options.defaultTTL=300000] - Default TTL in milliseconds (5 minutes)
   * @param {boolean} [options.enableStats=true] - Enable statistics tracking
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.enableStats = options.enableStats !== false;

    // Cache storage: Map maintains insertion order
    this.cache = new Map();

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0
    };

    // Cleanup interval for expired entries (every minute)
    this.cleanupInterval = setInterval(() => this._cleanupExpired(), 60000);
  }

  /**
   * Get a value from the cache
   *
   * @param {string} key - Cache key
   * @returns {*} The cached value, or undefined if not found or expired
   */
  get(key) {
    const entry = this.cache.get(key);

    // Cache miss
    if (!entry) {
      if (this.enableStats) this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (this._isExpired(entry)) {
      this.cache.delete(key);
      if (this.enableStats) {
        this.stats.misses++;
        this.stats.expirations++;
      }
      return undefined;
    }

    // Cache hit - move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    if (this.enableStats) this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   *
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time-to-live in milliseconds (overrides default)
   * @returns {boolean} True if set successfully
   */
  set(key, value, ttl) {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict least recently used if at capacity
    if (this.cache.size >= this.maxSize) {
      this._evictLRU();
    }

    // Create cache entry
    const entry = {
      value,
      expiresAt: Date.now() + (ttl !== undefined ? ttl : this.defaultTTL),
      createdAt: Date.now()
    };

    this.cache.set(key, entry);

    if (this.enableStats) this.stats.sets++;
    return true;
  }

  /**
   * Check if a key exists in the cache (and is not expired)
   *
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (this._isExpired(entry)) {
      this.cache.delete(key);
      if (this.enableStats) this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Invalidate (delete) a specific cache entry
   *
   * @param {string} key - Cache key to invalidate
   * @returns {boolean} True if the entry existed and was deleted
   */
  invalidate(key) {
    const existed = this.cache.delete(key);
    if (existed && this.enableStats) {
      this.stats.deletes++;
    }
    return existed;
  }

  /**
   * Clear all cache entries
   *
   * @returns {number} Number of entries cleared
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();

    if (this.enableStats) {
      this.stats.deletes += size;
    }

    return size;
  }

  /**
   * Get cache statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Get all cache keys (excluding expired)
   *
   * @returns {string[]} Array of valid cache keys
   */
  keys() {
    const validKeys = [];

    for (const [key, entry] of this.cache.entries()) {
      if (!this._isExpired(entry)) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Get cache size
   *
   * @returns {number} Current number of entries
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get remaining capacity
   *
   * @returns {number} Number of entries that can be added before eviction
   */
  remainingCapacity() {
    return Math.max(0, this.maxSize - this.cache.size);
  }

  /**
   * Get TTL remaining for a key
   *
   * @param {string} key - Cache key
   * @returns {number|null} Milliseconds until expiration, or null if not found
   */
  getTTL(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Update TTL for an existing key
   *
   * @param {string} key - Cache key
   * @param {number} ttl - New TTL in milliseconds
   * @returns {boolean} True if TTL was updated
   */
  updateTTL(key, ttl) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    entry.expiresAt = Date.now() + ttl;
    return true;
  }

  /**
   * Destroy the cache manager and cleanup resources
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }

  /**
   * Check if a cache entry is expired
   *
   * @private
   * @param {Object} entry - Cache entry
   * @returns {boolean} True if expired
   */
  _isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Evict the least recently used entry
   *
   * @private
   */
  _evictLRU() {
    // Map iterator returns entries in insertion order
    // First entry is the least recently used
    const firstKey = this.cache.keys().next().value;

    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      if (this.enableStats) this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   *
   * @private
   * @returns {number} Number of entries cleaned up
   */
  _cleanupExpired() {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
        if (this.enableStats) this.stats.expirations++;
      }
    }

    return cleaned;
  }

  /**
   * Get cache entries for debugging
   *
   * @private
   * @returns {Array} Array of cache entries with metadata
   */
  _debug() {
    const entries = [];
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        value: entry.value,
        age: now - entry.createdAt,
        ttl: entry.expiresAt - now,
        expired: this._isExpired(entry)
      });
    }

    return entries;
  }
}

// Singleton instance for shared cache
let sharedInstance = null;

/**
 * Get or create the shared cache instance
 *
 * Initializes with environment-based configuration if available.
 * Falls back to provided options or defaults if env vars not set.
 *
 * Environment variables:
 * - CACHE_ENABLED (boolean, default: true)
 * - CACHE_TTL_SECONDS (number, default: 300)
 * - CACHE_MAX_SIZE (number, default: 100)
 *
 * @param {Object} [options] - Configuration options (only used on first call)
 * @returns {CacheManager} Shared cache manager instance
 */
function getSharedCache(options) {
  if (!sharedInstance) {
    // Try to load from cache-config module if available
    try {
      const cacheConfig = require('./cache-config');
      const envOptions = cacheConfig.createCacheOptions();
      // Merge with provided options (provided options take precedence)
      const finalOptions = { ...envOptions, ...options };
      sharedInstance = new CacheManager(finalOptions);
    } catch (err) {
      // Fallback to provided options or defaults
      sharedInstance = new CacheManager(options);
    }
  }
  return sharedInstance;
}

/**
 * Create a namespaced cache key
 *
 * @param {string} namespace - Namespace prefix
 * @param {string} key - Cache key
 * @returns {string} Namespaced key
 */
function createKey(namespace, key) {
  return `${namespace}:${key}`;
}

/**
 * Hash a complex object into a cache key
 *
 * @param {Object} obj - Object to hash
 * @returns {string} Hash string
 */
function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return hash.toString(36);
}

module.exports = {
  CacheManager,
  getSharedCache,
  createKey,
  hashObject
};
