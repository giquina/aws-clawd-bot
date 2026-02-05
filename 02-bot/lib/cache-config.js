/**
 * Cache Configuration Loader
 *
 * Loads and validates cache settings from environment variables.
 * Provides sensible defaults and validates ranges.
 *
 * @module lib/cache-config
 */

/**
 * Load cache configuration from environment variables
 *
 * Environment variables:
 * - CACHE_ENABLED (boolean, default: true)
 * - CACHE_TTL_SECONDS (number, default: 300)
 * - CACHE_MAX_SIZE (number, default: 100)
 *
 * @returns {Object} Cache configuration object
 */
function loadCacheConfig() {
  const config = {
    // Whether caching is enabled (default: true)
    enabled: parseBoolean(process.env.CACHE_ENABLED, true),

    // TTL in milliseconds (convert from CACHE_TTL_SECONDS)
    ttlSeconds: parseInteger(process.env.CACHE_TTL_SECONDS, 300),

    // Maximum cache size
    maxSize: parseInteger(process.env.CACHE_MAX_SIZE, 100)
  };

  // Convert seconds to milliseconds for internal use
  config.ttlMs = config.ttlSeconds * 1000;

  // Validate configuration
  validateCacheConfig(config);

  return config;
}

/**
 * Parse boolean from environment variable
 *
 * @param {string} value - Environment variable value
 * @param {boolean} defaultValue - Default if not set
 * @returns {boolean} Parsed boolean
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const str = String(value).toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes' || str === 'on';
}

/**
 * Parse integer from environment variable
 *
 * @param {string} value - Environment variable value
 * @param {number} defaultValue - Default if not set
 * @returns {number} Parsed integer
 */
function parseInteger(value, defaultValue = 0) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate cache configuration
 *
 * @param {Object} config - Cache configuration
 * @throws {Error} If configuration is invalid
 */
function validateCacheConfig(config) {
  const errors = [];

  // Validate TTL
  if (config.ttlSeconds < 0) {
    errors.push('CACHE_TTL_SECONDS must be >= 0 (0 means no expiration)');
  }

  // Validate max size
  if (config.maxSize <= 0) {
    errors.push('CACHE_MAX_SIZE must be > 0');
  }

  if (config.maxSize > 10000) {
    console.warn('⚠️  CACHE_MAX_SIZE is very large (>10000), may consume excessive memory');
  }

  if (errors.length > 0) {
    throw new Error(`Cache configuration validation failed:\n${errors.join('\n')}`);
  }

  // Log warnings for unusual configurations
  if (config.enabled) {
    if (config.ttlSeconds === 0) {
      console.warn('⚠️  Cache TTL is 0 - entries will never expire. Make sure to monitor memory usage.');
    }

    if (config.ttlSeconds < 60) {
      console.warn('⚠️  Cache TTL is < 60 seconds - cache hit rate will be lower.');
    }

    if (config.maxSize < 50) {
      console.warn('⚠️  CACHE_MAX_SIZE is < 50 - limited coverage, higher eviction rate.');
    }
  }
}

/**
 * Create cache options for CacheManager initialization
 *
 * @param {Object} [overrides] - Optional overrides to config
 * @returns {Object} Options for CacheManager constructor
 */
function createCacheOptions(overrides = {}) {
  const config = loadCacheConfig();

  return {
    maxSize: overrides.maxSize !== undefined ? overrides.maxSize : config.maxSize,
    defaultTTL: overrides.ttlMs !== undefined ? overrides.ttlMs : config.ttlMs,
    enableStats: true
  };
}

/**
 * Get a human-readable cache configuration summary
 *
 * @returns {string} Configuration summary
 */
function getCacheConfigSummary() {
  const config = loadCacheConfig();

  const status = config.enabled ? '✅ ENABLED' : '❌ DISABLED';
  const ttlText = config.ttlSeconds === 0 ? 'Never expires' : `${config.ttlSeconds}s`;
  const memoryEst = Math.round((config.maxSize * 2) / 1024 * 100) / 100; // Rough estimate in KB

  return `
Cache Configuration:
  Status: ${status}
  TTL: ${ttlText}
  Max entries: ${config.maxSize}
  Est. memory: ~${memoryEst} KB (average case)
  `;
}

module.exports = {
  loadCacheConfig,
  createCacheOptions,
  getCacheConfigSummary,
  parseBoolean,
  parseInteger,
  validateCacheConfig
};
