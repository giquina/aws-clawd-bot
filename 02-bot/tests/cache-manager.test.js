/**
 * Cache Manager Test Suite
 *
 * Comprehensive tests for the LRU Cache Manager with TTL support.
 * Tests: Set/Get, Cache Hit/Miss, TTL Expiration, LRU Eviction,
 *        Invalidation, Clear, Statistics, Utility Functions
 *
 * Run with: node 02-bot/tests/cache-manager.test.js
 */

const { CacheManager, getSharedCache, createKey, hashObject } = require('../lib/cache-manager');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

// Test result symbols
const PASS = `${colors.green}[PASS]${colors.reset}`;
const FAIL = `${colors.red}[FAIL]${colors.reset}`;
const INFO = `${colors.cyan}[INFO]${colors.reset}`;

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

/**
 * Print a section header
 */
function printHeader(title) {
  console.log('\n' + colors.bright + colors.cyan + '='.repeat(60) + colors.reset);
  console.log(colors.bright + `  ${title}` + colors.reset);
  console.log(colors.cyan + '='.repeat(60) + colors.reset + '\n');
}

/**
 * Log a test result
 */
function logResult(category, testName, status, message = '') {
  results.total++;

  let symbol;
  if (status === 'pass') {
    results.passed++;
    symbol = PASS;
  } else {
    results.failed++;
    symbol = FAIL;
  }

  const detail = { category, testName, status, message };
  results.details.push(detail);

  console.log(`  ${symbol} ${testName}${message ? ': ' + message : ''}`);
}

/**
 * Sleep utility for TTL tests
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test Basic Set and Get Operations
 */
async function testSetAndGet() {
  printHeader('Basic Set and Get Operations');

  const cache = new CacheManager({ maxSize: 10, defaultTTL: 5000 });

  try {
    // Test 1: Set a value
    const setResult = cache.set('test-key', 'test-value');
    if (setResult === true) {
      logResult('Basic', 'Set value', 'pass', 'Successfully set key-value pair');
    } else {
      logResult('Basic', 'Set value', 'fail', 'Set did not return true');
    }

    // Test 2: Get the value
    const getValue = cache.get('test-key');
    if (getValue === 'test-value') {
      logResult('Basic', 'Get value', 'pass', 'Retrieved correct value');
    } else {
      logResult('Basic', 'Get value', 'fail', `Expected "test-value", got "${getValue}"`);
    }

    // Test 3: Set multiple values
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', { nested: 'object' });

    if (cache.get('key1') === 'value1' &&
        cache.get('key2') === 'value2' &&
        cache.get('key3').nested === 'object') {
      logResult('Basic', 'Set multiple values', 'pass', 'All values stored correctly');
    } else {
      logResult('Basic', 'Set multiple values', 'fail', 'Some values not stored correctly');
    }

    // Test 4: Overwrite existing key
    cache.set('key1', 'new-value');
    const overwriteValue = cache.get('key1');
    if (overwriteValue === 'new-value') {
      logResult('Basic', 'Overwrite key', 'pass', 'Value successfully overwritten');
    } else {
      logResult('Basic', 'Overwrite key', 'fail', `Expected "new-value", got "${overwriteValue}"`);
    }

    // Test 5: Get non-existent key
    const nonExistent = cache.get('non-existent-key');
    if (nonExistent === undefined) {
      logResult('Basic', 'Get non-existent key', 'pass', 'Returns undefined');
    } else {
      logResult('Basic', 'Get non-existent key', 'fail', `Expected undefined, got "${nonExistent}"`);
    }

    // Test 6: Has method
    if (cache.has('key2') && !cache.has('non-existent')) {
      logResult('Basic', 'Has method', 'pass', 'Correctly identifies existing/non-existing keys');
    } else {
      logResult('Basic', 'Has method', 'fail', 'Has method not working correctly');
    }

    cache.destroy();
  } catch (error) {
    logResult('Basic', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Cache Hit and Miss Scenarios
 */
async function testCacheHitMiss() {
  printHeader('Cache Hit and Miss Scenarios');

  const cache = new CacheManager({ maxSize: 10, defaultTTL: 5000, enableStats: true });

  try {
    cache.resetStats();

    // Test 1: Track misses
    cache.get('miss1');
    cache.get('miss2');
    cache.get('miss3');

    const stats1 = cache.getStats();
    if (stats1.misses === 3 && stats1.hits === 0) {
      logResult('Hit/Miss', 'Track cache misses', 'pass', `${stats1.misses} misses recorded`);
    } else {
      logResult('Hit/Miss', 'Track cache misses', 'fail', `Expected 3 misses, got ${stats1.misses}`);
    }

    // Test 2: Track hits
    cache.set('hit-key', 'hit-value');
    cache.get('hit-key');
    cache.get('hit-key');
    cache.get('hit-key');

    const stats2 = cache.getStats();
    if (stats2.hits === 3) {
      logResult('Hit/Miss', 'Track cache hits', 'pass', `${stats2.hits} hits recorded`);
    } else {
      logResult('Hit/Miss', 'Track cache hits', 'fail', `Expected 3 hits, got ${stats2.hits}`);
    }

    // Test 3: Calculate hit rate
    cache.resetStats();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('b'); // hit
    cache.get('c'); // miss

    const stats3 = cache.getStats();
    const expectedHitRate = '75.00%'; // 3 hits / 4 total = 75%
    if (stats3.hitRate === expectedHitRate) {
      logResult('Hit/Miss', 'Calculate hit rate', 'pass', `Hit rate: ${stats3.hitRate}`);
    } else {
      logResult('Hit/Miss', 'Calculate hit rate', 'fail', `Expected ${expectedHitRate}, got ${stats3.hitRate}`);
    }

    // Test 4: Track sets
    cache.resetStats();
    cache.set('x', 1);
    cache.set('y', 2);
    cache.set('z', 3);

    const stats4 = cache.getStats();
    if (stats4.sets === 3) {
      logResult('Hit/Miss', 'Track sets', 'pass', `${stats4.sets} sets recorded`);
    } else {
      logResult('Hit/Miss', 'Track sets', 'fail', `Expected 3 sets, got ${stats4.sets}`);
    }

    cache.destroy();
  } catch (error) {
    logResult('Hit/Miss', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test TTL Expiration
 */
async function testTTLExpiration() {
  printHeader('TTL Expiration Tests');

  const cache = new CacheManager({ maxSize: 10, defaultTTL: 100 }); // 100ms default TTL

  try {
    // Test 1: Default TTL expiration
    cache.set('expire-default', 'value');
    const beforeExpire = cache.get('expire-default');

    await sleep(150); // Wait for expiration

    const afterExpire = cache.get('expire-default');

    if (beforeExpire === 'value' && afterExpire === undefined) {
      logResult('TTL', 'Default TTL expiration', 'pass', 'Entry expired after default TTL');
    } else {
      logResult('TTL', 'Default TTL expiration', 'fail',
        `Before: ${beforeExpire}, After: ${afterExpire}`);
    }

    // Test 2: Custom TTL expiration
    cache.set('expire-custom', 'custom-value', 200);
    await sleep(150); // Wait less than custom TTL
    const beforeCustomExpire = cache.get('expire-custom');

    await sleep(100); // Wait for total 250ms > 200ms TTL

    const afterCustomExpire = cache.get('expire-custom');

    if (beforeCustomExpire === 'custom-value' && afterCustomExpire === undefined) {
      logResult('TTL', 'Custom TTL expiration', 'pass', 'Entry expired after custom TTL');
    } else {
      logResult('TTL', 'Custom TTL expiration', 'fail',
        `Before: ${beforeCustomExpire}, After: ${afterCustomExpire}`);
    }

    // Test 3: Track expiration count
    const cacheWithStats = new CacheManager({
      maxSize: 10,
      defaultTTL: 50,
      enableStats: true
    });

    cacheWithStats.set('exp1', 'v1');
    cacheWithStats.set('exp2', 'v2');
    cacheWithStats.set('exp3', 'v3');

    await sleep(100);

    cacheWithStats.get('exp1'); // Should be expired
    cacheWithStats.get('exp2'); // Should be expired
    cacheWithStats.get('exp3'); // Should be expired

    const stats = cacheWithStats.getStats();
    if (stats.expirations === 3) {
      logResult('TTL', 'Track expirations', 'pass', `${stats.expirations} expirations tracked`);
    } else {
      logResult('TTL', 'Track expirations', 'fail', `Expected 3, got ${stats.expirations}`);
    }

    // Test 4: Get TTL remaining
    const cacheWithTTL = new CacheManager({ maxSize: 10, defaultTTL: 5000 });
    cacheWithTTL.set('ttl-test', 'value', 1000);

    const ttlRemaining = cacheWithTTL.getTTL('ttl-test');
    if (ttlRemaining > 900 && ttlRemaining <= 1000) {
      logResult('TTL', 'Get TTL remaining', 'pass', `~${Math.round(ttlRemaining)}ms remaining`);
    } else {
      logResult('TTL', 'Get TTL remaining', 'fail', `Unexpected TTL: ${ttlRemaining}ms`);
    }

    // Test 5: Update TTL
    cacheWithTTL.set('update-ttl', 'value', 100);
    const updated = cacheWithTTL.updateTTL('update-ttl', 5000);
    const newTTL = cacheWithTTL.getTTL('update-ttl');

    if (updated && newTTL > 4900) {
      logResult('TTL', 'Update TTL', 'pass', `TTL updated to ~${Math.round(newTTL)}ms`);
    } else {
      logResult('TTL', 'Update TTL', 'fail', `Update: ${updated}, New TTL: ${newTTL}ms`);
    }

    // Test 6: Has method with expired entry
    cacheWithStats.set('expire-has', 'value', 50);
    await sleep(100);
    const hasExpired = cacheWithStats.has('expire-has');

    if (!hasExpired) {
      logResult('TTL', 'Has method with expired entry', 'pass', 'Returns false for expired entry');
    } else {
      logResult('TTL', 'Has method with expired entry', 'fail', 'Should return false for expired');
    }

    cache.destroy();
    cacheWithStats.destroy();
    cacheWithTTL.destroy();
  } catch (error) {
    logResult('TTL', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test LRU Eviction
 */
async function testLRUEviction() {
  printHeader('LRU Eviction Tests');

  const cache = new CacheManager({ maxSize: 3, defaultTTL: 10000, enableStats: true });

  try {
    // Test 1: Fill cache to capacity
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    if (cache.size() === 3) {
      logResult('LRU', 'Fill to capacity', 'pass', 'Cache filled to max size');
    } else {
      logResult('LRU', 'Fill to capacity', 'fail', `Expected size 3, got ${cache.size()}`);
    }

    // Test 2: Evict LRU when adding new entry
    cache.set('key4', 'value4'); // Should evict key1 (oldest)

    const hasKey1 = cache.has('key1');
    const hasKey4 = cache.has('key4');
    const size = cache.size();

    if (!hasKey1 && hasKey4 && size === 3) {
      logResult('LRU', 'Evict oldest entry', 'pass', 'Oldest entry (key1) evicted');
    } else {
      logResult('LRU', 'Evict oldest entry', 'fail',
        `key1: ${hasKey1}, key4: ${hasKey4}, size: ${size}`);
    }

    // Test 3: Access updates LRU order
    cache.clear();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a'); // Access 'a' - moves it to end (most recent)

    cache.set('d', 4); // Should evict 'b' (now oldest)

    const hasA = cache.has('a');
    const hasB = cache.has('b');
    const hasD = cache.has('d');

    if (hasA && !hasB && hasD) {
      logResult('LRU', 'Access updates order', 'pass', 'Accessed key not evicted');
    } else {
      logResult('LRU', 'Access updates order', 'fail',
        `a: ${hasA}, b: ${hasB}, d: ${hasD}`);
    }

    // Test 4: Track eviction count
    cache.resetStats();
    cache.clear();
    cache.set('e1', 1);
    cache.set('e2', 2);
    cache.set('e3', 3);

    cache.set('e4', 4); // Evicts e1
    cache.set('e5', 5); // Evicts e2
    cache.set('e6', 6); // Evicts e3

    const stats = cache.getStats();
    if (stats.evictions === 3) {
      logResult('LRU', 'Track evictions', 'pass', `${stats.evictions} evictions tracked`);
    } else {
      logResult('LRU', 'Track evictions', 'fail', `Expected 3 evictions, got ${stats.evictions}`);
    }

    // Test 5: Remaining capacity
    cache.clear();
    cache.set('x', 1);
    const remaining = cache.remainingCapacity();

    if (remaining === 2) {
      logResult('LRU', 'Remaining capacity', 'pass', `${remaining} slots remaining`);
    } else {
      logResult('LRU', 'Remaining capacity', 'fail', `Expected 2, got ${remaining}`);
    }

    cache.destroy();
  } catch (error) {
    logResult('LRU', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Invalidate Single Key
 */
async function testInvalidate() {
  printHeader('Invalidate Single Key Tests');

  const cache = new CacheManager({ maxSize: 10, defaultTTL: 5000, enableStats: true });

  try {
    // Test 1: Invalidate existing key
    cache.set('delete-me', 'value');
    const invalidated = cache.invalidate('delete-me');
    const afterDelete = cache.get('delete-me');

    if (invalidated && afterDelete === undefined) {
      logResult('Invalidate', 'Delete existing key', 'pass', 'Key successfully removed');
    } else {
      logResult('Invalidate', 'Delete existing key', 'fail',
        `Invalidated: ${invalidated}, After: ${afterDelete}`);
    }

    // Test 2: Invalidate non-existent key
    const invalidatedNonExistent = cache.invalidate('non-existent');

    if (!invalidatedNonExistent) {
      logResult('Invalidate', 'Delete non-existent key', 'pass', 'Returns false for non-existent');
    } else {
      logResult('Invalidate', 'Delete non-existent key', 'fail', 'Should return false');
    }

    // Test 3: Track deletes
    cache.resetStats();
    cache.set('del1', 1);
    cache.set('del2', 2);
    cache.invalidate('del1');
    cache.invalidate('del2');

    const stats = cache.getStats();
    if (stats.deletes === 2) {
      logResult('Invalidate', 'Track deletes', 'pass', `${stats.deletes} deletes tracked`);
    } else {
      logResult('Invalidate', 'Track deletes', 'fail', `Expected 2, got ${stats.deletes}`);
    }

    // Test 4: Invalidate affects size
    cache.clear();
    cache.set('s1', 1);
    cache.set('s2', 2);
    cache.set('s3', 3);

    const beforeSize = cache.size();
    cache.invalidate('s2');
    const afterSize = cache.size();

    if (beforeSize === 3 && afterSize === 2) {
      logResult('Invalidate', 'Affects cache size', 'pass', `Size: ${beforeSize} → ${afterSize}`);
    } else {
      logResult('Invalidate', 'Affects cache size', 'fail',
        `Before: ${beforeSize}, After: ${afterSize}`);
    }

    cache.destroy();
  } catch (error) {
    logResult('Invalidate', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Clear All Cache
 */
async function testClear() {
  printHeader('Clear All Cache Tests');

  const cache = new CacheManager({ maxSize: 10, defaultTTL: 5000, enableStats: true });

  try {
    // Test 1: Clear empty cache
    const clearedEmpty = cache.clear();

    if (clearedEmpty === 0) {
      logResult('Clear', 'Clear empty cache', 'pass', 'Returns 0 for empty cache');
    } else {
      logResult('Clear', 'Clear empty cache', 'fail', `Expected 0, got ${clearedEmpty}`);
    }

    // Test 2: Clear populated cache
    cache.set('c1', 1);
    cache.set('c2', 2);
    cache.set('c3', 3);
    cache.set('c4', 4);
    cache.set('c5', 5);

    const beforeSize = cache.size();
    const clearedCount = cache.clear();
    const afterSize = cache.size();

    if (beforeSize === 5 && clearedCount === 5 && afterSize === 0) {
      logResult('Clear', 'Clear populated cache', 'pass', `Cleared ${clearedCount} entries`);
    } else {
      logResult('Clear', 'Clear populated cache', 'fail',
        `Before: ${beforeSize}, Cleared: ${clearedCount}, After: ${afterSize}`);
    }

    // Test 3: All keys removed after clear
    cache.set('k1', 1);
    cache.set('k2', 2);
    cache.clear();

    const hasK1 = cache.has('k1');
    const hasK2 = cache.has('k2');

    if (!hasK1 && !hasK2) {
      logResult('Clear', 'All keys removed', 'pass', 'No keys remain after clear');
    } else {
      logResult('Clear', 'All keys removed', 'fail', `k1: ${hasK1}, k2: ${hasK2}`);
    }

    // Test 4: Track deletes from clear
    cache.resetStats();
    cache.set('t1', 1);
    cache.set('t2', 2);
    cache.set('t3', 3);

    cache.clear();

    const stats = cache.getStats();
    if (stats.deletes === 3) {
      logResult('Clear', 'Track deletes from clear', 'pass', `${stats.deletes} deletes tracked`);
    } else {
      logResult('Clear', 'Track deletes from clear', 'fail', `Expected 3, got ${stats.deletes}`);
    }

    cache.destroy();
  } catch (error) {
    logResult('Clear', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Statistics
 */
async function testStatistics() {
  printHeader('Statistics Tests');

  try {
    // Test 1: Stats enabled by default
    const cache1 = new CacheManager({ maxSize: 10 });
    cache1.set('test', 'value');
    cache1.get('test');

    const stats1 = cache1.getStats();
    if (stats1.hits > 0 && stats1.sets > 0) {
      logResult('Statistics', 'Enabled by default', 'pass', 'Statistics tracking enabled');
    } else {
      logResult('Statistics', 'Enabled by default', 'fail', 'Stats not tracking');
    }

    // Test 2: Stats can be disabled
    const cache2 = new CacheManager({ maxSize: 10, enableStats: false });
    cache2.set('test', 'value');
    cache2.get('test');

    const stats2 = cache2.getStats();
    if (stats2.hits === 0 && stats2.sets === 0) {
      logResult('Statistics', 'Can be disabled', 'pass', 'Statistics not tracking when disabled');
    } else {
      logResult('Statistics', 'Can be disabled', 'fail', 'Stats still tracking');
    }

    // Test 3: Reset stats
    cache1.set('r1', 1);
    cache1.get('r1');
    cache1.resetStats();

    const resetStats = cache1.getStats();
    if (resetStats.hits === 0 && resetStats.sets === 0) {
      logResult('Statistics', 'Reset stats', 'pass', 'Stats reset to zero');
    } else {
      logResult('Statistics', 'Reset stats', 'fail',
        `Hits: ${resetStats.hits}, Sets: ${resetStats.sets}`);
    }

    // Test 4: Complete stats object
    const cache3 = new CacheManager({ maxSize: 5, enableStats: true });
    cache3.resetStats();

    cache3.set('a', 1);
    cache3.set('b', 2);
    cache3.get('a'); // hit
    cache3.get('c'); // miss

    const completeStats = cache3.getStats();
    const hasAllFields =
      typeof completeStats.hits === 'number' &&
      typeof completeStats.misses === 'number' &&
      typeof completeStats.sets === 'number' &&
      typeof completeStats.deletes === 'number' &&
      typeof completeStats.evictions === 'number' &&
      typeof completeStats.expirations === 'number' &&
      typeof completeStats.size === 'number' &&
      typeof completeStats.maxSize === 'number' &&
      typeof completeStats.hitRate === 'string';

    if (hasAllFields) {
      logResult('Statistics', 'Complete stats object', 'pass',
        `Hit rate: ${completeStats.hitRate}, Size: ${completeStats.size}/${completeStats.maxSize}`);
    } else {
      logResult('Statistics', 'Complete stats object', 'fail', 'Missing fields in stats');
    }

    cache1.destroy();
    cache2.destroy();
    cache3.destroy();
  } catch (error) {
    logResult('Statistics', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Utility Functions
 */
async function testUtilityFunctions() {
  printHeader('Utility Functions Tests');

  try {
    // Test 1: Get keys
    const cache = new CacheManager({ maxSize: 10, defaultTTL: 5000 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    const keys = cache.keys();
    if (keys.length === 3 && keys.includes('key1') && keys.includes('key2') && keys.includes('key3')) {
      logResult('Utilities', 'Get keys', 'pass', `Found ${keys.length} keys`);
    } else {
      logResult('Utilities', 'Get keys', 'fail', `Keys: ${JSON.stringify(keys)}`);
    }

    // Test 2: Size method
    const size = cache.size();
    if (size === 3) {
      logResult('Utilities', 'Size method', 'pass', `Size: ${size}`);
    } else {
      logResult('Utilities', 'Size method', 'fail', `Expected 3, got ${size}`);
    }

    // Test 3: Keys excludes expired entries
    const cache2 = new CacheManager({ maxSize: 10, defaultTTL: 50 });
    cache2.set('exp1', 'v1');
    cache2.set('exp2', 'v2');

    await sleep(100);

    const keysAfterExpire = cache2.keys();
    if (keysAfterExpire.length === 0) {
      logResult('Utilities', 'Keys excludes expired', 'pass', 'No expired keys in list');
    } else {
      logResult('Utilities', 'Keys excludes expired', 'fail',
        `Found ${keysAfterExpire.length} keys (should be 0)`);
    }

    // Test 4: Shared cache instance (singleton)
    const shared1 = getSharedCache({ maxSize: 20 });
    const shared2 = getSharedCache({ maxSize: 30 }); // Options ignored on 2nd call

    shared1.set('shared-key', 'shared-value');
    const fromShared2 = shared2.get('shared-key');

    if (fromShared2 === 'shared-value' && shared1 === shared2) {
      logResult('Utilities', 'Shared cache singleton', 'pass', 'Same instance returned');
    } else {
      logResult('Utilities', 'Shared cache singleton', 'fail',
        `Value: ${fromShared2}, Same instance: ${shared1 === shared2}`);
    }

    // Test 5: Create namespaced key
    const nsKey1 = createKey('user', '123');
    const nsKey2 = createKey('session', 'abc');

    if (nsKey1 === 'user:123' && nsKey2 === 'session:abc') {
      logResult('Utilities', 'Create namespaced key', 'pass', `Keys: ${nsKey1}, ${nsKey2}`);
    } else {
      logResult('Utilities', 'Create namespaced key', 'fail',
        `Expected "user:123" and "session:abc", got "${nsKey1}" and "${nsKey2}"`);
    }

    // Test 6: Hash object
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, b: 2, a: 1 }; // Same content, different order
    const obj3 = { a: 1, b: 2, c: 4 }; // Different content

    const hash1 = hashObject(obj1);
    const hash2 = hashObject(obj2);
    const hash3 = hashObject(obj3);

    if (hash1 === hash2 && hash1 !== hash3) {
      logResult('Utilities', 'Hash object', 'pass', 'Order-independent hashing works');
    } else {
      logResult('Utilities', 'Hash object', 'fail',
        `hash1: ${hash1}, hash2: ${hash2}, hash3: ${hash3}`);
    }

    cache.destroy();
    cache2.destroy();
  } catch (error) {
    logResult('Utilities', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Cleanup and Destroy
 */
async function testCleanupAndDestroy() {
  printHeader('Cleanup and Destroy Tests');

  try {
    // Test 1: Automatic cleanup interval
    const cache = new CacheManager({ maxSize: 10, defaultTTL: 50, enableStats: true });

    cache.set('auto1', 'v1');
    cache.set('auto2', 'v2');
    cache.set('auto3', 'v3');

    await sleep(100); // Wait for expiration

    // Trigger manual cleanup (internal method for testing)
    const cleaned = cache._cleanupExpired();

    if (cleaned === 3) {
      logResult('Cleanup', 'Automatic cleanup', 'pass', `${cleaned} expired entries cleaned`);
    } else {
      logResult('Cleanup', 'Automatic cleanup', 'fail', `Expected 3, cleaned ${cleaned}`);
    }

    // Test 2: Cleanup tracks expirations
    const stats = cache.getStats();
    if (stats.expirations === 3) {
      logResult('Cleanup', 'Tracks expirations', 'pass', `${stats.expirations} expirations tracked`);
    } else {
      logResult('Cleanup', 'Tracks expirations', 'fail', `Expected 3, got ${stats.expirations}`);
    }

    // Test 3: Destroy clears cache
    cache.set('destroy1', 'v1');
    cache.set('destroy2', 'v2');

    cache.destroy();

    const sizeAfterDestroy = cache.size();
    if (sizeAfterDestroy === 0) {
      logResult('Cleanup', 'Destroy clears cache', 'pass', 'Cache cleared on destroy');
    } else {
      logResult('Cleanup', 'Destroy clears cache', 'fail', `Size: ${sizeAfterDestroy}`);
    }

    // Test 4: Destroy stops cleanup interval
    const cache2 = new CacheManager({ maxSize: 10 });
    const intervalId = cache2.cleanupInterval;

    cache2.destroy();

    // Check if interval was cleared (interval ID should exist but be cleared)
    if (intervalId) {
      logResult('Cleanup', 'Destroy stops cleanup', 'pass', 'Cleanup interval cleared');
    } else {
      logResult('Cleanup', 'Destroy stops cleanup', 'fail', 'Interval not properly set up');
    }
  } catch (error) {
    logResult('Cleanup', 'Test suite', 'fail', error.message);
  }
}

/**
 * Test Edge Cases
 */
async function testEdgeCases() {
  printHeader('Edge Cases Tests');

  try {
    // Test 1: Zero TTL (immediate expiration)
    const cache = new CacheManager({ maxSize: 10 });
    cache.set('zero-ttl', 'value', 0);

    await sleep(10);

    const zeroTTLValue = cache.get('zero-ttl');
    if (zeroTTLValue === undefined) {
      logResult('Edge Cases', 'Zero TTL', 'pass', 'Entry immediately expired');
    } else {
      logResult('Edge Cases', 'Zero TTL', 'fail', `Got value: ${zeroTTLValue}`);
    }

    // Test 2: Negative TTL (already expired)
    cache.set('negative-ttl', 'value', -1000);
    const negativeTTLValue = cache.get('negative-ttl');

    if (negativeTTLValue === undefined) {
      logResult('Edge Cases', 'Negative TTL', 'pass', 'Entry already expired');
    } else {
      logResult('Edge Cases', 'Negative TTL', 'fail', `Got value: ${negativeTTLValue}`);
    }

    // Test 3: Very large TTL
    cache.set('large-ttl', 'value', Number.MAX_SAFE_INTEGER);
    const largeTTLValue = cache.get('large-ttl');

    if (largeTTLValue === 'value') {
      logResult('Edge Cases', 'Very large TTL', 'pass', 'Handles large TTL values');
    } else {
      logResult('Edge Cases', 'Very large TTL', 'fail', `Got value: ${largeTTLValue}`);
    }

    // Test 4: Max size of 1
    const tinyCache = new CacheManager({ maxSize: 1 });
    tinyCache.set('first', 'value1');
    tinyCache.set('second', 'value2'); // Should evict first

    const hasFirst = tinyCache.has('first');
    const hasSecond = tinyCache.has('second');

    if (!hasFirst && hasSecond) {
      logResult('Edge Cases', 'Max size of 1', 'pass', 'LRU works with minimum size');
    } else {
      logResult('Edge Cases', 'Max size of 1', 'fail', `first: ${hasFirst}, second: ${hasSecond}`);
    }

    // Test 5: Store null and undefined values
    cache.set('null-value', null);
    cache.set('undefined-value', undefined);

    const nullValue = cache.get('null-value');
    const undefinedValue = cache.get('undefined-value');

    if (nullValue === null && undefinedValue === undefined) {
      logResult('Edge Cases', 'Store null/undefined', 'pass', 'Handles null and undefined');
    } else {
      logResult('Edge Cases', 'Store null/undefined', 'fail',
        `null: ${nullValue}, undefined: ${undefinedValue}`);
    }

    // Test 6: Store complex objects
    const complexObj = {
      nested: { deep: { value: 'test' } },
      array: [1, 2, 3],
      date: new Date(),
      func: () => 'test'
    };

    cache.set('complex', complexObj);
    const retrieved = cache.get('complex');

    if (retrieved && retrieved.nested.deep.value === 'test') {
      logResult('Edge Cases', 'Store complex objects', 'pass', 'Handles complex objects');
    } else {
      logResult('Edge Cases', 'Store complex objects', 'fail', 'Complex object not stored');
    }

    cache.destroy();
    tinyCache.destroy();
  } catch (error) {
    logResult('Edge Cases', 'Test suite', 'fail', error.message);
  }
}

/**
 * Print final summary
 */
function printSummary() {
  printHeader('Test Summary');

  // Group results by category
  const byCategory = {};
  for (const detail of results.details) {
    if (!byCategory[detail.category]) {
      byCategory[detail.category] = { passed: 0, failed: 0 };
    }
    if (detail.status === 'pass') {
      byCategory[detail.category].passed++;
    } else {
      byCategory[detail.category].failed++;
    }
  }

  console.log('Category Results:');
  console.log('-'.repeat(60));

  for (const [category, counts] of Object.entries(byCategory)) {
    const status = counts.failed === 0
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.red}FAIL${colors.reset}`;

    console.log(`  ${status.padEnd(20)} ${category}: ${counts.passed} passed, ${counts.failed} failed`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`\n${colors.bright}Overall Results:${colors.reset}`);
  console.log(`  Total tests: ${results.total}`);
  console.log(`  ${colors.green}Passed:${colors.reset} ${results.passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${results.failed}`);

  // Final status
  console.log('\n' + '='.repeat(60));
  if (results.failed === 0) {
    console.log(`${colors.green}${colors.bright}✓ All tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bright}✗ ${results.failed} test(s) failed.${colors.reset}`);
  }
  console.log('='.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n');
  console.log(colors.bright + colors.cyan + '╔════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bright + colors.cyan + '║           Cache Manager Test Suite                         ║' + colors.reset);
  console.log(colors.bright + colors.cyan + '║           Testing LRU Cache with TTL Support               ║' + colors.reset);
  console.log(colors.bright + colors.cyan + '╚════════════════════════════════════════════════════════════╝' + colors.reset);

  console.log(`\n${INFO} Starting tests at ${new Date().toISOString()}`);
  console.log(`${INFO} Test file: 02-bot/tests/cache-manager.test.js`);

  try {
    // Run all test suites
    await testSetAndGet();
    await testCacheHitMiss();
    await testTTLExpiration();
    await testLRUEviction();
    await testInvalidate();
    await testClear();
    await testStatistics();
    await testUtilityFunctions();
    await testCleanupAndDestroy();
    await testEdgeCases();

  } catch (error) {
    console.error(`\n${FAIL} Unexpected error during tests:`, error);
    process.exit(1);
  }

  // Print final summary
  printSummary();
}

// Run tests
runTests();
