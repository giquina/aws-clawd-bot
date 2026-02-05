# Cache Configuration Quick Reference

## TL;DR - What You Need

Add these 3 lines to `config/.env.local`:

```bash
# Cache Configuration (recommended defaults)
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
CACHE_MAX_SIZE=100
```

Done! Caching is now enabled with smart defaults.

---

## What Each Variable Does

| Variable | What It Does | Default | When to Change |
|----------|-------------|---------|-----------------|
| `CACHE_ENABLED` | On/off switch for caching | `true` | Only if debugging or need fresh data |
| `CACHE_TTL_SECONDS` | How long to keep cached responses (seconds) | `300` | Increase for more hits, decrease for fresher data |
| `CACHE_MAX_SIZE` | How many responses to cache | `100` | Increase if high traffic, decrease if memory-limited |

---

## Common Scenarios

### "I want it working with defaults"
```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
CACHE_MAX_SIZE=100
```
✓ Recommended for most deployments

### "I'm in development, need fresh data"
```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=60
CACHE_MAX_SIZE=50
```
✓ Quick refresh, small memory footprint

### "We have lots of users"
```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=600
CACHE_MAX_SIZE=500
```
✓ Longer cache, more coverage

### "Memory is tight"
```bash
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
CACHE_MAX_SIZE=50
```
✓ Minimal memory usage

### "I want to debug / need all fresh data"
```bash
CACHE_ENABLED=false
```
✓ No caching, fresh API calls every time

---

## How to Change Settings

1. Edit `config/.env.local`
2. Update the three variables
3. Restart the bot: `npm start`

**On EC2**:
```bash
./deploy.sh
```

---

## Understanding the Values

### CACHE_TTL_SECONDS (Time-to-Live)

**Higher** = More cost savings, but slightly older data
- `60` = Fresh every minute
- `300` = Fresh every 5 minutes (GOOD FOR MOST)
- `1800` = Fresh every 30 minutes (GOOD FOR STABLE DATA)

**Lower** = Fresher data, but more API calls

### CACHE_MAX_SIZE (How Many Entries)

**Higher** = More cache hits for diverse queries
- `50` = Good for 50 unique questions (minimal memory)
- `100` = Good for ~100 unique questions (DEFAULT)
- `500` = Good for ~500 unique questions (high traffic)

**Rule of thumb**: Each entry uses ~1-2 KB of RAM
- 100 entries ≈ 100-200 KB
- 500 entries ≈ 500-1000 KB

---

## What Gets Cached?

✓ **Cached**:
- Regular AI queries ("What is machine learning?")
- Code explanations ("How does this function work?")
- Analysis requests ("Review my code")

✗ **NOT Cached** (Real-time queries):
- "What's trending on Twitter?"
- "What's the status?"
- "Health check"
- Anything with: `now`, `current`, `latest`, `trending`, `live`

---

## How to Check If It's Working

Look for these messages in logs:

```
✓ Cache HIT for claude/coding       ← Good! Using cached response
✓ Cached response for claude/coding ← Good! Storing this response
⏭️  Bypassing cache for real-time   ← Normal for real-time queries
```

---

## Cost Savings

With typical usage:
- **30% cache hit rate** = 30% reduction in API costs
- **50% cache hit rate** = 50% reduction in API costs

Example: If you spend $100/month on AI APIs
- 30% hit rate = Save $30/month
- 50% hit rate = Save $50/month

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Cache not working | Check logs for `ENABLED` message |
| Memory too high | Reduce `CACHE_MAX_SIZE` to 50 |
| Need fresher data | Reduce `CACHE_TTL_SECONDS` to 60 |
| Low cache hit rate | Increase `CACHE_TTL_SECONDS` to 600 |
| Want debugging | Set `CACHE_ENABLED=false` |

---

## Files Modified

- `config/.env.local` ← Edit this for your settings
- `lib/cache-config.js` ← Loads settings (no edits needed)
- `lib/cache-manager.js` ← Implements cache (no edits needed)
- `ai-providers/router.js` ← Uses cache (no edits needed)

---

## Next Steps

1. ✓ Add the three variables to `config/.env.local`
2. ✓ Restart the bot
3. ✓ Check logs for cache messages
4. ✓ Done!

See `docs/CACHE_CONFIGURATION.md` for advanced configuration.
