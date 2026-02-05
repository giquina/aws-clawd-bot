# ClawdBot Test Suite

This directory contains comprehensive test suites for ClawdBot's core modules.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Individual Test Files
```bash
# Cache Manager Tests
node 02-bot/tests/cache-manager.test.js

# Main Bot Tests (all components)
node scripts/test-bot.js
```

## Test Files

### cache-manager.test.js

Comprehensive test suite for the LRU Cache Manager with TTL support.

**Test Coverage (49 tests):**

1. **Basic Set and Get Operations** (6 tests)
   - Set single value
   - Get value
   - Set multiple values
   - Overwrite existing key
   - Get non-existent key
   - Has method

2. **Cache Hit and Miss Scenarios** (4 tests)
   - Track cache misses
   - Track cache hits
   - Calculate hit rate
   - Track set operations

3. **TTL Expiration Tests** (6 tests)
   - Default TTL expiration
   - Custom TTL expiration
   - Track expiration count
   - Get TTL remaining
   - Update TTL
   - Has method with expired entry

4. **LRU Eviction Tests** (5 tests)
   - Fill cache to capacity
   - Evict oldest entry when full
   - Access updates LRU order
   - Track eviction count
   - Remaining capacity calculation

5. **Invalidate Single Key Tests** (4 tests)
   - Invalidate existing key
   - Invalidate non-existent key
   - Track delete operations
   - Size changes after invalidation

6. **Clear All Cache Tests** (4 tests)
   - Clear empty cache
   - Clear populated cache
   - All keys removed verification
   - Track deletes from clear

7. **Statistics Tests** (4 tests)
   - Stats enabled by default
   - Stats can be disabled
   - Reset statistics
   - Complete stats object structure

8. **Utility Functions Tests** (6 tests)
   - Get all keys
   - Size method
   - Keys excludes expired entries
   - Shared cache singleton pattern
   - Create namespaced keys
   - Hash complex objects

9. **Cleanup and Destroy Tests** (4 tests)
   - Automatic cleanup interval
   - Track expirations from cleanup
   - Destroy clears cache
   - Destroy stops cleanup interval

10. **Edge Cases Tests** (6 tests)
    - Zero TTL (immediate expiration)
    - Negative TTL (already expired)
    - Very large TTL values
    - Max size of 1 (minimum cache)
    - Store null/undefined values
    - Store complex objects

**Run:**
```bash
node 02-bot/tests/cache-manager.test.js
```

**Expected Output:**
```
✓ All tests passed!
Total tests: 49
Passed: 49
Failed: 0
```

## Test Framework

Tests use a custom lightweight test framework following ClawdBot's existing patterns:

- **No external dependencies** - Pure Node.js
- **Color-coded output** - Green (pass), Red (fail), Cyan (info)
- **Categorized results** - Tests grouped by functionality
- **Detailed logging** - Each test shows specific pass/fail reasons
- **Exit codes** - Non-zero exit code on failure for CI integration

## Writing New Tests

Follow the existing pattern in `cache-manager.test.js`:

```javascript
async function testYourFeature() {
  printHeader('Your Feature Tests');

  try {
    // Test 1: Description
    const result = yourFunction();
    if (result === expected) {
      logResult('Category', 'Test name', 'pass', 'Success message');
    } else {
      logResult('Category', 'Test name', 'fail', 'Failure message');
    }

    // Add cleanup
    cleanupResources();
  } catch (error) {
    logResult('Category', 'Test suite', 'fail', error.message);
  }
}
```

Then add to the main test runner:

```javascript
async function runTests() {
  await testYourFeature();
  // ... other tests
  printSummary();
}
```

## CI Integration

Tests return appropriate exit codes:
- **0** - All tests passed
- **1** - One or more tests failed

This enables CI/CD integration:

```yaml
# GitHub Actions example
- name: Run tests
  run: npm test
```

## Future Test Suites

Planned test files:
- `context-engine.test.js` - Context aggregation tests
- `outcome-tracker.test.js` - Action outcome tracking tests
- `alert-escalation.test.js` - Multi-tier alert tests
- `skill-registry.test.js` - Skill loading and routing tests
