# Natural Language Command Handling: Systemic Improvements Proposal

**Date:** 2026-02-07
**Context:** Following the regex routing fix in `smart-router.js` that resolved natural language commands like "deploy from github judo to vercel" failing to execute. This proposal addresses the deeper systemic issues that the regex fix papers over.

---

## Problem Statement

The current NL→command pipeline has five structural weaknesses:

1. **Smart router and skills use flat regex — no confidence scoring, no fallback ranking**
2. **A sophisticated IntentClassifier exists (`lib/intent-classifier.js`) but is disconnected from the main Telegram pipeline**
3. **The AI fallback in `aiRoute()` has a hardcoded list of ~20 commands, but the bot has 49+ skills**
4. **Transformed commands are never shown to the user — misinterpretations execute silently**
5. **No conversational memory for commands — "do that for JUDO too" goes to AI chat, not command replay**

These compound into a system where adding a new skill or a new NL phrasing requires manually updating regex in two places (smart-router patterns AND `aiRoute()` prompt), and misrouted commands are invisible until something breaks in production.

---

## Improvement 1: Auto-generate `aiRoute()` command list from SkillRegistry

### Problem
`smart-router.js:aiRoute()` (line 396–441) has a hardcoded prompt listing ~20 commands. The bot has 49+ skills. When new skills are added, `aiRoute()` doesn't know about them — it can never route to them. This is the single largest gap in NL coverage.

### How it works
Replace the hardcoded command list with a call to `skillRegistry.generateSkillDocs()` (already exists at `skill-registry.js:300`), or a more targeted method that emits just command patterns + usage strings.

```javascript
// In SmartRouter.aiRoute(), replace the hardcoded "Available commands:" block:
const skillDocs = require('../skills').registry.getSkillNames()
  ? require('../skills').registry.listSkills()
      .flatMap(s => s.commands.map(c => c.usage || c.pattern.toString()))
      .join('\n- ')
  : '(no skills loaded)';

// Then inject into the prompt:
// Available commands:\n- ${skillDocs}
```

### Where it fits
`hooks/smart-router.js` — the `aiRoute()` method. Single function change. No architectural shift.

### Why it matters
Every new skill becomes AI-routable immediately. No manual prompt updates. Eliminates the class of bugs where "the skill exists but the AI doesn't know about it."

### Effort: Low (30 min). Impact: High.

---

## Improvement 2: Command echo-back for dangerous actions

### Problem
When the smart router transforms "restart the clawd-bot server please" → `restart clawd-bot`, the user never sees this transformation. If the NLP misinterprets the input, a destructive action (restart, deploy, delete) executes without the user ever seeing what was dispatched.

The confirmation manager (`lib/confirmation-manager.js`) already has an `ACTIONS_REQUIRING_CONFIRMATION` set and a full confirm/cancel flow. But it only activates when a skill explicitly calls it — the pipeline doesn't automatically intercept dangerous commands post-transformation.

### How it works
After the smart router transforms a message AND the transformed output differs from the input, check if the resulting command maps to a dangerous action. If so, echo the transformation and require confirmation before dispatching to skills.

```javascript
// In processMessageForTelegram(), after hooks.preprocess():
if (processedMsg !== incomingMsg && confirmationManager) {
  const action = processedMsg.split(/\s+/)[0]; // "restart", "deploy", etc.
  if (confirmationManager.requiresConfirmation(action)) {
    // Show the user what we understood
    confirmationManager.setPending(userId, action, {
      command: processedMsg,
      originalMessage: incomingMsg,
    });
    return `I understood: **${processedMsg}**\n\nReply "yes" to execute or "no" to cancel.`;
  }
}
```

### Where it fits
`index.js` — between the hooks.preprocess() call (line 1679) and the skill routing (line 1760). ~15 lines of insertion.

### Why it matters
Prevents silent misexecution of destructive commands. The user sees exactly what was interpreted and can correct before execution. This is the cheapest possible safety net for NL misinterpretation.

### Effort: Low (1 hour). Impact: High (safety-critical).

---

## Improvement 3: Wire IntentClassifier as `aiRoute()` replacement

### Problem
The smart router's `aiRoute()` (line 386–441) uses a one-shot Claude Haiku call with a hardcoded prompt to classify NL messages. Meanwhile, `lib/intent-classifier.js` already has:
- Confidence scoring with 4-factor breakdown (keyword, context, history, specificity)
- Ambiguity detection with clarifying questions
- Risk assessment (high/medium/low)
- User history tracking and pattern learning
- Correction learning from past mistakes
- AI classification fallback (also Claude Haiku, but with richer context)

But the IntentClassifier is only used by the voice flow / action controller path. The main Telegram text pipeline never calls it.

### How it works
Replace `SmartRouter.aiRoute()` with a call to the IntentClassifier, then map its structured output back to a command string:

```javascript
// In SmartRouter, replace aiRoute() internals:
async aiRoute(message, context = {}) {
  const classifier = require('../lib/intent-classifier');
  if (!classifier.claude) classifier.initialize();

  const result = await classifier.classifyIntent(message, {
    activeProject: context.autoRepo,
    userId: context.userId,
  });

  if (result.confidence < 0.5 || result.ambiguous) {
    return null; // Let AI handler take it as conversation
  }

  // Map structured intent → command string
  return this.intentToCommand(result);
}

intentToCommand(intent) {
  // intent.actionType: "deploy", intent.target: "JUDO" → "deploy JUDO"
  const parts = [intent.actionType];
  if (intent.target) parts.push(intent.target);
  return parts.join(' ');
}
```

### Where it fits
`hooks/smart-router.js` — replace the body of `aiRoute()`. The IntentClassifier already exists and is initialized.

### Why it matters
- Adds confidence scoring to NL routing (currently: pattern matches are binary yes/no, AI routes are uncalibrated)
- Adds ambiguity detection — "deploy" without a target prompts clarification instead of guessing
- Correction learning accumulates over time — mistakes improve future routing
- User history patterns boost confidence for repeated workflows
- Single AI classification system instead of two independent ones

### Effort: Medium (2-3 hours). Impact: High.

---

## Improvement 4: Structured command object instead of string passing

### Problem
The entire pipeline passes commands as plain strings. Smart router outputs a string → skill registry tries regex on it → skill parses it again. This means:
- `extractRepo()` can return empty string → malformed command like `"restart "` passes through
- No way to attach metadata (confidence, source, original message) to a command
- Skill `canHandle()` re-parses what the router already parsed
- Debugging requires grepping logs to trace transformations

### How it works
Define a `CommandIntent` structure that flows through the pipeline:

```javascript
// lib/command-intent.js
class CommandIntent {
  constructor({ action, target, args = {}, confidence = 1.0, source = 'direct', originalMessage = '' }) {
    this.action = action;       // "deploy", "restart", "logs", "vercel deploy"
    this.target = target;       // "JUDO", "clawd-bot", etc.
    this.args = args;           // { production: true, force: false }
    this.confidence = confidence;
    this.source = source;       // "pattern", "ai", "direct"
    this.originalMessage = originalMessage;
  }

  toString() {
    // Backward-compatible: skills that haven't been updated still see a string
    return [this.action, this.target, ...Object.values(this.args)]
      .filter(Boolean).join(' ');
  }
}
```

Smart router returns a `CommandIntent` (or null). Skill registry accepts both `CommandIntent` and plain string (backward compatible). Skills that opt in can read structured fields instead of re-parsing.

### Where it fits
New file `lib/command-intent.js`. Changes to `smart-router.js` (return CommandIntent from `patternMatch`), `skill-registry.js` (accept CommandIntent in `route()`), and individual skills (opt-in).

### Why it matters
- Eliminates the "malformed string" class of bugs entirely
- Enables confidence-based routing (skip skill if confidence < threshold)
- Provides audit trail: every command carries its source and original message
- Skills stop re-parsing — they read `intent.target` instead of regex-matching again

### Effort: Medium-High (4-6 hours for core + backward compat). Impact: High (architectural foundation for all other improvements).

---

## Improvement 5: Follow-up context / anaphoric resolution

### Problem
After executing "deploy JUDO", the user says "do that for clawd-bot too" or "same thing but for production." The smart router sees a short vague message, no pattern matches, it goes to AI handler which generates a conversational response like "Sure, I can help with that! What would you like me to deploy?"

The bot has no memory of the last executed command.

### How it works
Store the last successfully executed command per user. On the next message, check for anaphoric patterns before running through the normal pipeline:

```javascript
// In processMessageForTelegram(), after successful skill execution:
lastCommand.set(userId, { command: processedMsg, timestamp: Date.now() });

// Before hooks.preprocess():
const anaphoricPatterns = [
  /^(do that|same|again|same thing)\s*(for|on|to|with)\s+(.+)/i,
  /^(and|also)\s*(for|on)\s+(.+)/i,
  /^(do it|run it|that)\s*(for|on)\s+(.+)/i,
];
for (const pattern of anaphoricPatterns) {
  const match = incomingMsg.match(pattern);
  if (match && lastCommand.has(userId)) {
    const prev = lastCommand.get(userId);
    if (Date.now() - prev.timestamp < 5 * 60 * 1000) { // 5 min window
      // Replace the target in the previous command
      const newTarget = SmartRouter.extractRepo(match[3]);
      const replayed = prev.command.replace(/\S+$/, newTarget);
      processedMsg = replayed;
      // Skip hooks — we already have a structured command
    }
  }
}
```

### Where it fits
`index.js` — before the hooks.preprocess() call. Small in-memory Map (auto-cleared after 5 min).

### Why it matters
Telegram is a command console. Users naturally say "same for X" after running a command. Without this, every command must be fully specified from scratch. This is a common source of user frustration that pushes conversations into the AI fallback when they should be quick command replays.

### Effort: Low-Medium (2 hours). Impact: Medium.

---

## Improvement 6: Multi-command decomposition

### Problem
"Run tests on JUDO and then deploy if they pass" is treated as a single atomic string. No pattern matches it. It goes to AI handler which generates a conversational response explaining what it would do — but doesn't actually do it.

### How it works
Detect compound commands (joined by "and", "then", "after that", "if X then Y") and decompose into a sequential execution plan:

```javascript
// In smart-router.js or a new lib/command-decomposer.js:
function decompose(message) {
  // Split on conjunctions
  const parts = message.split(/\s+(?:and then|then|after that|and)\s+/i);
  if (parts.length <= 1) return null;

  // Detect conditional chains ("if tests pass then deploy")
  const conditionalMatch = message.match(
    /^(.+?)\s+(?:and\s+)?(?:if\s+(?:they|it|that)\s+pass(?:es)?\s+(?:then\s+)?)?(.+)$/i
  );

  return {
    steps: parts.map(p => p.trim()),
    isConditional: !!conditionalMatch,
    condition: conditionalMatch ? 'success' : null,
  };
}
```

Then present the decomposed plan for confirmation:
```
I'll do this in order:
1. Run tests on JUDO
2. If tests pass → deploy JUDO

Reply "yes" to proceed.
```

### Where it fits
New utility in `lib/command-decomposer.js`, called from `index.js` after hooks but before skill routing. Feeds into the existing confirmation manager.

### Why it matters
Multi-step commands are the natural way users give instructions via voice or text. Currently they're all lost to the AI conversational fallback. This bridges the gap between "Telegram as command console" and natural speech patterns.

### Effort: Medium (3-4 hours). Impact: Medium.

---

## Improvement 7: Skill conflict detection and logging

### Problem
`deploy judo` matches both the Vercel skill (priority 10) and remote-exec skill (priority 30). Remote-exec wins silently. The smart router works around this by transforming to `vercel deploy judo`, but this is fragile — it depends on the smart router knowing about skill priority conflicts that may change.

The `findMatchingSkills()` method exists in skill-registry.js (line 256) but is never called in the production pipeline.

### How it works
In `SkillRegistry.route()`, when a command is about to be dispatched, call `findMatchingSkills()` and log if multiple skills matched. Optionally, if the top two matches have close priorities (within 10), flag it as ambiguous.

```javascript
// In skill-registry.js route(), before executing:
const matches = this.findMatchingSkills(normalizedCommand);
if (matches.length > 1) {
  console.warn(`[Registry] ${matches.length} skills match "${normalizedCommand}": ${
    matches.map(m => `${m.name}(p${m.priority})`).join(', ')
  }`);
  this.emit('skillConflict', { command: normalizedCommand, matches });
}
```

### Where it fits
`skills/skill-registry.js` — 5 lines added to the `route()` method.

### Why it matters
Makes priority conflicts visible in logs. Today, a new skill accidentally shadowing an existing one produces no warning — the user just sees wrong behavior. This is diagnostic infrastructure that prevents a class of silent bugs.

### Effort: Very Low (15 min). Impact: Medium (diagnostic).

---

## Improvement 8: Validate transformed commands before dispatch

### Problem
If `extractRepo()` strips all tokens from "restart the server please" and returns `""`, the skill receives `"restart "` (with trailing space after cleanup). This matches the regex `/^restart\s+(\S+)$/i` — except the capture group is empty. The skill then tries to restart a project named `""`, which fails at execution time with a confusing error.

### How it works
After smart router transformation, validate that the command has a non-empty target when the command verb requires one:

```javascript
// In patternMatch(), after cmd is computed:
cmd = cmd.replace(/\s+/g, ' ').trim();

// Validate: commands that require a target should have one
const requiresTarget = /^(deploy|restart|build|install|logs|test|run tests)\s*$/i;
if (requiresTarget.test(cmd)) {
  // Target is missing — apply auto-context or reject
  const withContext = this.applyAutoContext(cmd.trim(), context);
  if (withContext === cmd.trim()) {
    // No auto-context available either — can't dispatch
    console.warn(`[SmartRouter] Command "${cmd}" missing target and no auto-context`);
    return null; // Let AI handle it
  }
  return withContext;
}
```

### Where it fits
`hooks/smart-router.js` — in `patternMatch()`, after the command string is assembled. ~10 lines.

### Why it matters
Prevents dispatch of malformed commands that will fail at execution. Instead, the pipeline either fills in the target from auto-context or falls through to AI which can ask the user "which project?"

### Effort: Very Low (20 min). Impact: Medium (prevents a class of runtime errors).

---

## Priority Ranking

### Immediate (do first — highest impact / lowest effort)

| # | Improvement | Effort | Impact | Why first |
|---|------------|--------|--------|-----------|
| 1 | Auto-generate `aiRoute()` command list | 30 min | High | Every new skill becomes AI-routable immediately. One function change. |
| 7 | Skill conflict detection logging | 15 min | Medium | 5 lines. Pure diagnostic. No behavior change. Catches silent bugs. |
| 8 | Validate transformed commands | 20 min | Medium | 10 lines. Prevents malformed dispatch. No behavior change for valid commands. |
| 2 | Command echo-back for dangerous actions | 1 hour | High | Safety-critical. Uses existing confirmation infrastructure. ~15 lines in index.js. |

### Short-term (next iteration)

| # | Improvement | Effort | Impact | Why next |
|---|------------|--------|--------|----------|
| 3 | Wire IntentClassifier into smart router | 2-3 hours | High | Replaces `aiRoute()` with the existing, more capable classifier. Confidence scoring + learning. |
| 5 | Follow-up context / anaphoric resolution | 2 hours | Medium | Natural user pattern. Small in-memory map. Big UX win for repeated commands. |

### Longer-term (architectural)

| # | Improvement | Effort | Impact | Why later |
|---|------------|--------|--------|----------|
| 4 | Structured CommandIntent object | 4-6 hours | High | Foundation for type-safe pipeline. Requires backward-compat work. Best done when refactoring pipeline. |
| 6 | Multi-command decomposition | 3-4 hours | Medium | Nice-to-have. Compound commands are less common than single commands. Needs careful edge-case handling. |

---

## Appendix: Current Pipeline Flow (for reference)

```
Telegram message
  → memory.saveMessage()
  → auto-context (chat-registry → autoRepo / autoCompany)
  → session resume check
  → iterating mode (amendment detection)
  → confirmation manager (pending action check)
  → voice handling (transcribe → plan or re-route)
  → hooks.preprocess() (smart-router: passthrough → looksLikeCommand → patternMatch → aiRoute)
  → text plan detection (coding instructions → plan + confirm)
  → skillRegistry.route() (priority-sorted canHandle regex → execute)
  → AI fallback (context engine → ai-handler.processQuery)
```

**Key observation:** The smart router (`hooks/smart-router.js`) and the skill registry (`skills/skill-registry.js`) both do independent regex matching on the same message. The smart router transforms NL→command, then the skill registry matches the command. But neither has confidence scoring, neither knows about the other's state, and the AI fallback between them (`aiRoute`) has a stale command list. The improvements above address each of these gaps incrementally, without requiring a rewrite.
