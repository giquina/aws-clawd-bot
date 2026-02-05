# AI Provider Cache Configuration

This document describes the environment variable configuration system for the AI provider response cache in ClawdBot v2.6+.

## Overview

ClawdBot uses an LRU (Least Recently Used) cache with TTL (Time-To-Live) to cache AI provider responses. This reduces API calls, lowers costs, and improves response times for repeated queries.

### Cache Benefits

- **Cost Savings**: Repeated queries return cached responses at zero cost
- **Speed**: Cached responses return instantly without API latency
- **Load Reduction**: Fewer API calls to external providers
- **Configurable**: Adjust for your specific deployment needs

## Environment Variables

All cache configuration is controlled via environment variables in `config/.env.local`:

### CACHE_ENABLED

Controls whether caching is active.

```bash
CACHE_ENABLED=true
```

- **Type**: Boolean (`true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`)
- **Default**: `true`
- **Valid Values**:
  - `true`, `1`, `yes`, `on` → Enable caching
  - `false`, `0`, `no`, `off` → Disable caching

**Examples**:
```bash
CACHE_ENABLED=true           # ✓ Caching enabled
CACHE_ENABLED=false          # ✓ Caching disabled
CACHE_ENABLED=1              # ✓ Caching enabled
CACHE_ENABLED=0              # ✓ Caching disabled
```

### CACHE_TTL_SECONDS

Time-To-Live for cached entries in seconds. Expired entries are automatically removed.

```bash
CACHE_TTL_SECONDS=300
```

- **Type**: Number (integer, >= 0)
- **Default**: `300` (5 minutes)
- **Unit**: Seconds
- **Special Value**: `0` = Never expires

**Recommended Values**:

| Value | Duration | Use Case |
|-------|----------|----------|
| 60 | 1 minute | Very fresh data needed |
| 300 | 5 minutes | Balanced (DEFAULT) |
| 600 | 10 minutes | Longer retention |
| 1800 | 30 minutes | Extended caching |
| 3600 | 1 hour | Long-term caching |
| 0 | Never expires | Manual invalidation only |

**Examples**:
```bash
CACHE_TTL_SECONDS=300       # 5 minutes (default, recommended)
CACHE_TTL_SECONDS=60        # 1 minute (fresher data)
CACHE_TTL_SECONDS=1800      # 30 minutes (more hits)
CACHE_TTL_SECONDS=0         # Never expires (use with caution!)
```

### CACHE_MAX_SIZE

Maximum number of entries in the cache before LRU eviction occurs.

```bash
CACHE_MAX_SIZE=100
```

- **Type**: Number (integer, > 0)
- **Default**: `100`
- **Unit**: Number of cache entries

**Memory Impact**:

| Size | Est. Memory | Coverage | Use Case |
|------|-------------|----------|----------|
| 50 | ~50-250 KB | 50 unique queries | Minimal footprint |
| 100 | ~100-500 KB | 100 unique queries | DEFAULT, balanced |
| 200 | ~200-1000 KB | 200 unique queries | Multi-user deployments |
| 500 | ~500-2500 KB | 500 unique queries | High-traffic instances |
| 1000 | ~1-5 MB | 1000 unique queries | Large deployments |

**Memory Calculation**: Each cached response is typically 0.5-5 KB depending on response length.

**Examples**:
```bash
CACHE_MAX_SIZE=100          # 100 entries (default)
CACHE_MAX_SIZE=50           # Minimal memory usage
CACHE_MAX_SIZE=200          # Multi-user friendly
CACHE_MAX_SIZE=500          # High-traffic instance
```

## Configuration Examples

### Example 1: Development (Maximum Freshness)

```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=60        # Refresh every minute
CACHE_MAX_SIZE=50           # Minimal memory
```

**Use case**: Testing with fresh data, small deployments

### Example 2: Production (Balanced - RECOMMENDED)

```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300       # 5-minute window
CACHE_MAX_SIZE=100          # Standard coverage
```

**Use case**: Most production deployments, good balance

### Example 3: High-Traffic Instance

```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=600       # 10-minute window
CACHE_MAX_SIZE=500          # High coverage
```

**Use case**: Many concurrent users, high query volume

### Example 4: Disabled (No Caching)

```bash
CACHE_ENABLED=false
```

**Use case**: Debugging, guaranteed fresh data, memory constraints

### Example 5: Long-term Caching (Cost Optimization)

```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=3600      # 1 hour
CACHE_MAX_SIZE=200          # Good coverage
```

**Use case**: Stable queries, cost optimization priority

## File Locations

### Configuration Files

| File | Purpose |
|------|---------|
| `config/.env.local` | **Live** configuration (DO NOT commit secrets) |
| `config/.env.example` | Template with defaults (commit to git) |

### Implementation Files

| File | Purpose |
|------|---------|
| `lib/cache-config.js` | Config loader and validator |
| `lib/cache-manager.js` | Cache implementation (LRU + TTL) |
| `ai-providers/router.js` | Uses cache configuration |

## Configuration Loader

The `cache-config.js` module handles loading and validating cache settings:

```javascript
const cacheConfig = require('./lib/cache-config');

// Load configuration from environment
const config = cacheConfig.loadCacheConfig();

// Create CacheManager options
const options = cacheConfig.createCacheOptions();

// Get human-readable summary
console.log(cacheConfig.getCacheConfigSummary());
```

## Runtime Behavior

### Cache Initialization

When the router starts, it logs cache configuration:

```
🔄 AI Response Cache initialized

Cache Configuration:
  Status: ✅ ENABLED
  TTL: 300s
  Max entries: 100
  Est. memory: ~0.39 KB (average case)
```

Or if disabled:

```
⏭️  AI Response Cache is disabled
```

### Cache Operations

**Cache Hit** (query was cached):
```
[Router] Cache HIT for claude/coding
```

**Cache Miss** (query not in cache):
```
[Router] Cached response for claude/coding
```

**Bypass** (real-time query, skips cache):
```
[Router] Bypassing cache for real-time query
```

### Real-Time Query Detection

Queries containing these keywords automatically bypass cache:
- Time-sensitive: `now`, `current`, `today`, `latest`, `right now`
- Real-time: `trending`, `live`, `recent`, `just happened`
- Status: `breaking`, `update`, `status`, `health`
- Commands: `status`, `health`, `ping`, `check`

**Example**: "What's trending on Twitter?" bypasses cache (real-time data needed)

## Cache Statistics

Get cache performance metrics:

```javascript
const router = /* ... */;

// Get cache stats
const stats = router.getCacheStats();
console.log(stats);
// Output:
// {
//   hits: 42,
//   misses: 58,
//   hitRate: '42.00%',
//   size: 35,
//   maxSize: 100,
//   ...
// }
```

## Cost Savings Calculation

The router estimates cost savings from cache hits:

```javascript
const stats = router.getExtendedStats();
console.log(stats.summary.estimatedCostSavings);
// Output: 0.42 (approx $0.42 saved from 42 cache hits)
```

## Troubleshooting

### "Cache configuration validation failed"

**Issue**: Invalid environment variable values

**Solution**: Check `.env.local` for:
- `CACHE_TTL_SECONDS` is a valid number >= 0
- `CACHE_MAX_SIZE` is a valid number > 0
- `CACHE_ENABLED` is a boolean value

### Cache not working / Memory issues

**Symptom**: High memory usage, cache doesn't seem to work

**Solutions**:
1. Reduce `CACHE_MAX_SIZE` (lower memory footprint)
2. Lower `CACHE_TTL_SECONDS` (entries expire faster)
3. Disable with `CACHE_ENABLED=false` to verify

### Cache hit rate too low

**Symptom**: Most queries result in cache misses

**Solutions**:
1. Increase `CACHE_TTL_SECONDS` (keep entries longer)
2. Increase `CACHE_MAX_SIZE` (store more entries)
3. Check if queries are too varied (would legitimately miss)

## Advanced: Manual Cache Management

### Clear all cache entries

```javascript
const router = /* ... */;
const cleared = router.clearCache();
console.log(`Cleared ${cleared} entries`);
```

### Invalidate specific query

```javascript
router.invalidateCacheEntry('claude', 'your query here');
```

### Get cache stats

```javascript
const stats = router.getCacheStats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Entries: ${stats.size}/${stats.maxSize}`);
```

## Performance Impact

### With Caching Enabled (Recommended)

- **Response time**: Cached: ~1-5ms | Uncached: ~200-2000ms
- **API calls**: ~40-60% reduction (with 40-50% hit rate)
- **Memory**: ~100-500 KB for typical deployments
- **Cost**: 40-60% reduction in API costs

### Without Caching

- **Response time**: ~200-2000ms (every query)
- **API calls**: 100% (no hits)
- **Memory**: Minimal (~1-5 KB)
- **Cost**: Full cost of every query

## Default Behavior

If environment variables are not set, the system uses safe defaults:

```javascript
CACHE_ENABLED = true      // Caching is ON
CACHE_TTL_SECONDS = 300   // 5-minute window
CACHE_MAX_SIZE = 100      // 100 entries max
```

These defaults provide a good balance for most deployments.

## Related Files

- `config/.env.local` - Live configuration (git-ignored)
- `config/.env.example` - Template (committed)
- `lib/cache-config.js` - Configuration loader
- `lib/cache-manager.js` - Cache implementation
- `ai-providers/router.js` - Uses cache

## Questions?

See the main documentation:
- [ClawdBot Main README](../README.md)
- [CLAUDE.md](../CLAUDE.md) - Project architecture
