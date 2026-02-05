# Claude Opus 4.6 Guide for ClawdBot

## Overview

ClawdBot now uses **Claude Opus 4.6** (THE BRAIN) for planning, strategy, and complex reasoning tasks.

## Key Improvements

### 🧠 Enhanced Intelligence
- **State-of-the-art** on agentic coding (Terminal-Bench 2.0)
- **144 Elo points** ahead of GPT-5.2 on real-world work tasks
- **76% accuracy** on long-context retrieval (vs 18.5% for Sonnet 4.5)

### 📚 Massive Context Window
- **1M tokens** (beta) - can process entire codebases
- **Premium pricing** applies above 200k tokens ($10/$37.50)

### ⚡ Adaptive Thinking
- Model decides when to use deep reasoning
- **Effort controls** to balance speed vs intelligence

### 📝 Large Outputs
- **128k output tokens** - write extensive documentation, code, reports

## New Features

### Effort Controls

Control how much the model "thinks" before responding:

| Effort Level | When to Use | Example |
|--------------|-------------|---------|
| `low` | Quick tasks, simple queries | "What's the status of JUDO?" |
| `medium` | Balanced tasks, moderate complexity | "Review this PR" |
| `high` | **Default** - Adaptive thinking | Most tasks |
| `max` | Hardest problems, critical decisions | "Design auth system architecture" |

**How to use in code:**
```javascript
// In ai-handler.js or skills
const result = await claudeHandler.complete(query, {
    taskType: 'planning',  // Uses Opus
    effort: 'max',         // Maximum reasoning
    maxTokens: 8192
});
```

**Via Telegram:**
The router automatically selects effort based on task complexity. For manual control, prefix commands:
```
/effort max plan the authentication system for JUDO
```

### Adaptive Thinking

By default, Opus 4.6 uses **adaptive thinking** - it decides when deep reasoning helps:
- Simple tasks → responds quickly
- Complex tasks → thinks deeply automatically

**Benefits:**
- No need to manually configure for each task
- Optimizes cost vs quality automatically
- Better at sustaining long agentic tasks

### Long Context

Opus 4.6 can handle **1M tokens** of context:
- Read entire codebases
- Analyze long documents
- Track conversations across hundreds of messages

**Cost tiers:**
- 0-200k tokens: $5/$25 per million (standard)
- 200k-1M tokens: $10/$37.50 per million (premium)

## Usage in ClawdBot

### Automatic Routing

The AI router automatically uses Opus 4.6 for:
- Planning keywords: "plan", "strategy", "architect", "design system"
- Decision making: "should I", "best approach", "recommend"
- Trade-offs: "pros and cons", "compare approaches"

### Manual Selection

Force Opus 4.6 in code:
```javascript
// Use THE BRAIN explicitly
const result = await claudeHandler.useBrain(query, {
    effort: 'max',
    maxTokens: 16384
});
```

Via Telegram:
```
/use opus plan the new feature architecture
```

## Examples

### Simple Query (auto: low effort)
```
User: "What's the latest commit in JUDO?"
ClawdBot: [Quick response using low effort]
```

### Complex Planning (auto: high effort)
```
User: "Plan the authentication system with OAuth, JWT, and session management"
ClawdBot: [Deep reasoning with adaptive thinking, detailed plan]
```

### Maximum Intelligence
```javascript
// Critical architectural decision
const plan = await claudeHandler.complete(
    "Design a scalable microservices architecture for the JUDO platform",
    {
        taskType: 'planning',
        effort: 'max',           // Maximum reasoning
        maxTokens: 32768,        // Large output
        thinking: 'adaptive'     // Deep thinking enabled
    }
);
```

## Performance Benchmarks

| Benchmark | Opus 4.6 | GPT-5.2 | Gemini 3 Pro |
|-----------|----------|---------|--------------|
| Terminal-Bench 2.0 | **82.5%** | 73.1% | 71.8% |
| Humanity's Last Exam | **89.2%** | 84.7% | 85.1% |
| SWE-bench Verified | **80.3%** | 71.2% | 69.5% |
| BrowseComp | **84.6%** | 76.3% | 78.9% |

## Cost Comparison

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| Opus 4.6 | $5 | $25 | Planning, strategy |
| Sonnet 4 | $3 | $15 | Coding, implementation |
| Haiku | $0.25 | $1.25 | Quick tasks |

**Cost optimization tips:**
1. Use `effort: 'medium'` for routine planning tasks
2. Reserve `effort: 'max'` for critical decisions
3. Use Sonnet 4 for coding (unchanged)
4. Use Haiku for simple queries (unchanged)

## Migration Notes

**No breaking changes** - existing code works unchanged:
- `claudeHandler.useBrain()` now uses Opus 4.6
- Router automatically selects Opus 4.6 for planning tasks
- Default effort is 'high' (adaptive thinking enabled)

**New capabilities available:**
- Pass `effort` parameter to control reasoning depth
- Use larger `maxTokens` (up to 128k)
- Leverage 1M context for large codebases

## References

- [Official Announcement](https://www.anthropic.com/news/claude-opus-4-6)
- [System Card](https://www.anthropic.com/system-card-opus-4-6) (full evaluations)
- [Pricing](https://www.anthropic.com/pricing)

---

**Updated:** February 5, 2026
**ClawdBot Version:** v2.5+
