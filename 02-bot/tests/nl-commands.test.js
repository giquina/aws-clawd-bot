/**
 * NL Command Handling Test Suite
 *
 * Tests SmartRouter, IntentClassifier, and end-to-end message routing.
 * Covers: passthrough guards, pattern matching, auto-context, cache,
 *         sanitization, confidence scoring, fuzzy matching, edge cases.
 *
 * Run with: node 02-bot/tests/nl-commands.test.js
 */

// Terminal colors
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', yellow: '\x1b[33m', dim: '\x1b[2m'
};

const PASS = `${C.green}[PASS]${C.reset}`;
const FAIL = `${C.red}[FAIL]${C.reset}`;

const results = { total: 0, passed: 0, failed: 0, details: [] };

function test(category, name, condition, detail = '') {
  results.total++;
  if (condition) {
    results.passed++;
    results.details.push({ category, name, status: 'pass' });
    console.log(`  ${PASS} ${name}${detail ? ': ' + detail : ''}`);
  } else {
    results.failed++;
    results.details.push({ category, name, status: 'fail' });
    console.log(`  ${FAIL} ${name}${detail ? ': ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${C.bright}${C.cyan}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.bright}  ${title}${C.reset}`);
  console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);
}

// ============================================================================
// Load modules (mock-safe — no API keys needed for offline tests)
// ============================================================================

// We need to test the SmartRouter class directly
const SmartRouter = require('../hooks/smart-router');

// ============================================================================
// SMART ROUTER: Passthrough Guards
// ============================================================================

async function testPassthroughGuards() {
  section('SmartRouter: Passthrough Guards');

  const greetings = ['hey', 'hi', 'hello!', 'good morning', 'yo', 'sup', 'morning!'];
  for (const g of greetings) {
    const result = await SmartRouter.route(g);
    test('Passthrough', `Greeting "${g}" passes through`, result === g, `→ "${result}"`);
  }

  const thanks = ['thanks', 'thank you!', 'cheers', 'ty', 'thx'];
  for (const t of thanks) {
    const result = await SmartRouter.route(t);
    test('Passthrough', `Thanks "${t}" passes through`, result === t);
  }

  const acks = ['ok', 'sure', 'cool', 'nice', 'great!', 'perfect', 'got it', 'yes', 'no', 'yeah'];
  for (const a of acks) {
    const result = await SmartRouter.route(a);
    test('Passthrough', `Ack "${a}" passes through`, result === a);
  }

  const questions = [
    'what is the best framework?',
    'how do I deploy?',
    'where is the config?',
    'why did that fail?',
    'can you explain more?',
    'is it done yet?',
    'should I use React?',
  ];
  for (const q of questions) {
    const result = await SmartRouter.route(q);
    test('Passthrough', `Question "${q.substring(0, 40)}" passes through`, result === q);
  }

  // Question mark ending
  const qMarkMsgs = ['deploy JUDO to production?', 'that sounds right?', 'is the build passing?'];
  for (const q of qMarkMsgs) {
    const result = await SmartRouter.route(q);
    test('Passthrough', `"${q}" (question mark) passes through`, result === q);
  }

  // Follow-ups
  const followups = ['and also the footer', 'but not the sidebar', 'what about the nav?', 'for now just the header'];
  for (const f of followups) {
    const result = await SmartRouter.route(f);
    test('Passthrough', `Follow-up "${f.substring(0, 30)}" passes through`, result === f);
  }
}

// ============================================================================
// SMART ROUTER: Coding Instruction Guards
// ============================================================================

async function testCodingGuards() {
  section('SmartRouter: Coding Instruction Guards');

  const codingMsgs = [
    'add a login button',
    'fix the header alignment',
    'implement dark mode',
    'remove the old footer',
    'style the sidebar properly',
    'optimize the database queries',
    'replace the nav bar with a bottom tab',
    'write a function to validate emails',
    'build me an API endpoint',
    "let's build a todo app",
    "i want to create a dashboard",
  ];

  for (const msg of codingMsgs) {
    const result = await SmartRouter.route(msg);
    test('Coding', `"${msg.substring(0, 40)}" passes to AI`, result === msg);
  }
}

// ============================================================================
// SMART ROUTER: Conversational Build Guards
// ============================================================================

async function testConversationalBuildGuards() {
  section('SmartRouter: Conversational Build Guards');

  const buildMsgs = [
    "let's build a new feature",
    "i want to create a landing page",
    "can you implement the login flow",
    "we should design the database schema",
    "shall we scaffold the project",
    "hey let's make a dashboard",
  ];

  for (const msg of buildMsgs) {
    const result = await SmartRouter.route(msg);
    test('Conv Build', `"${msg.substring(0, 40)}" → AI`, result === msg);
  }
}

// ============================================================================
// SMART ROUTER: Pattern Matching
// ============================================================================

async function testPatternMatching() {
  section('SmartRouter: Pattern Matching');

  // Deadlines
  const deadlineTests = [
    { msg: 'what are the deadlines for gqcars', expected: 'deadlines GQCARS' },
    { msg: 'what is due for gmh', expected: 'deadlines GMH' },
    { msg: 'upcoming deadlines', expected: 'deadlines' },
    { msg: 'anything due', expected: 'deadlines' },
  ];
  for (const { msg, expected } of deadlineTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }

  // Companies
  const companyTests = [
    { msg: 'company number for gqcars', expected: 'company number GQCARS' },
    { msg: 'company number for holdings', expected: 'company number GMH' },
    { msg: 'show all companies', expected: 'companies' },
  ];
  for (const { msg, expected } of companyTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }

  // Expenses
  const expenseTests = [
    { msg: 'show my expenses', expected: 'expenses' },
    { msg: 'expense summary', expected: 'summary' },
    { msg: 'how much have I spent', expected: 'summary' },
  ];
  for (const { msg, expected } of expenseTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }

  // Repos
  const repoTests = [
    { msg: 'list my repos', expected: 'list repos' },
    { msg: 'my projects', expected: 'list repos' },
    { msg: 'all my repos', expected: 'my repos' },
  ];
  for (const { msg, expected } of repoTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }

  // Remote execution
  const execTests = [
    { msg: 'run tests on JUDO', expected: 'run tests JUDO' },
    { msg: 'deploy JUDO', expected: 'deploy JUDO' },
    { msg: 'push JUDO live', expected: 'deploy JUDO' },
    { msg: 'check logs for JUDO', expected: 'logs JUDO' },
    { msg: 'restart JUDO', expected: 'restart JUDO' },
  ];
  for (const { msg, expected } of execTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }

  // Vercel
  const vercelTests = [
    { msg: 'deploy JUDO to vercel', expected: 'vercel deploy JUDO' },
    { msg: 'push JUDO to vercel', expected: 'vercel deploy JUDO' },
    { msg: 'deploy to vercel', expected: 'vercel deploy' },
  ];
  for (const { msg, expected } of vercelTests) {
    const result = await SmartRouter.route(msg);
    test('Patterns', `"${msg}" → "${expected}"`, result === expected, `got: "${result}"`);
  }
}

// ============================================================================
// SMART ROUTER: Auto-Context
// ============================================================================

async function testAutoContext() {
  section('SmartRouter: Auto-Context');

  // Repo commands get auto-context
  const result1 = await SmartRouter.route('deploy', { autoRepo: 'JUDO' });
  test('AutoCtx', '"deploy" in JUDO context → "deploy JUDO"', result1 === 'deploy JUDO', `got: "${result1}"`);

  const result2 = await SmartRouter.route('run tests', { autoRepo: 'LusoTown' });
  test('AutoCtx', '"run tests" in LusoTown → "run tests LusoTown"', result2 === 'run tests LusoTown', `got: "${result2}"`);

  const result3 = await SmartRouter.route('logs', { autoRepo: 'armora' });
  test('AutoCtx', '"logs" in armora → "logs armora"', result3 === 'logs armora', `got: "${result3}"`);

  // Company commands get auto-context
  const result4 = await SmartRouter.route('deadlines', { autoCompany: 'GMH' });
  test('AutoCtx', '"deadlines" in GMH → "deadlines GMH"', result4 === 'deadlines GMH', `got: "${result4}"`);

  // Commands that already have a target don't get double-contexted
  const result5 = await SmartRouter.route('deploy JUDO', { autoRepo: 'LusoTown' });
  test('AutoCtx', '"deploy JUDO" in LusoTown → kept as-is', result5 === 'deploy JUDO', `got: "${result5}"`);

  // Pattern matches also get auto-context
  const result6 = SmartRouter.patternMatch('upcoming deadlines', { autoCompany: 'GACC' });
  test('AutoCtx', 'Pattern "upcoming deadlines" + GACC context → "deadlines GACC"', result6 === 'deadlines GACC', `got: "${result6}"`);
}

// ============================================================================
// SMART ROUTER: Cache
// ============================================================================

async function testCache() {
  section('SmartRouter: Cache');

  // Clear cache
  SmartRouter.cache.clear();

  // Trigger a pattern match to populate cache
  await SmartRouter.route('upcoming deadlines');
  test('Cache', 'Cache populated after route', SmartRouter.cache.size > 0, `size: ${SmartRouter.cache.size}`);

  // Same message should hit cache
  SmartRouter.routeMetrics.cacheHits = 0;
  await SmartRouter.route('upcoming deadlines');
  test('Cache', 'Repeat message hits cache', SmartRouter.routeMetrics.cacheHits > 0);

  // Whitespace variations should still hit cache (normalized keys)
  const key1 = SmartRouter._buildCacheKey('  deploy  JUDO  ', {});
  const key2 = SmartRouter._buildCacheKey('deploy JUDO', {});
  test('Cache', 'Whitespace normalized in cache keys', key1 === key2, `"${key1}" vs "${key2}"`);

  // Context affects cache keys
  const keyNoCtx = SmartRouter._buildCacheKey('deploy', {});
  const keyWithCtx = SmartRouter._buildCacheKey('deploy', { autoRepo: 'JUDO' });
  test('Cache', 'Context changes cache key', keyNoCtx !== keyWithCtx);

  // Cache size limit
  SmartRouter.cache.clear();
  const originalMax = SmartRouter.cacheMaxSize;
  SmartRouter.cacheMaxSize = 5;
  for (let i = 0; i < 10; i++) {
    SmartRouter._cacheSet(`key${i}`, `cmd${i}`);
  }
  test('Cache', 'Cache respects max size', SmartRouter.cache.size <= 5, `size: ${SmartRouter.cache.size}`);
  SmartRouter.cacheMaxSize = originalMax;

  // Clean expired
  SmartRouter.cache.clear();
  SmartRouter.cache.set('old', { command: 'test', time: Date.now() - 10 * 60 * 1000 });
  SmartRouter.cache.set('new', { command: 'test', time: Date.now() });
  const cleaned = SmartRouter.cleanCache();
  test('Cache', 'cleanCache removes expired', cleaned === 1 && SmartRouter.cache.size === 1);
}

// ============================================================================
// SMART ROUTER: Input Sanitization
// ============================================================================

async function testSanitization() {
  section('SmartRouter: Input Sanitization');

  const sanitized1 = SmartRouter._sanitizeCommand('deploy JUDO; rm -rf /');
  test('Sanitize', 'Strips semicolons', !sanitized1.includes(';'), `→ "${sanitized1}"`);

  const sanitized2 = SmartRouter._sanitizeCommand('logs $(whoami)');
  test('Sanitize', 'Strips $() subshell', !sanitized2.includes('$('), `→ "${sanitized2}"`);

  const sanitized3 = SmartRouter._sanitizeCommand('test `hostname`');
  test('Sanitize', 'Strips backticks', !sanitized3.includes('`'), `→ "${sanitized3}"`);

  const sanitized4 = SmartRouter._sanitizeCommand('deploy JUDO | cat /etc/passwd');
  test('Sanitize', 'Strips pipe', !sanitized4.includes('|'), `→ "${sanitized4}"`);

  const sanitized5 = SmartRouter._sanitizeCommand('deploy JUDO');
  test('Sanitize', 'Clean command unchanged', sanitized5 === 'deploy JUDO');

  // Null/undefined handling
  const sanitized6 = SmartRouter._sanitizeCommand(null);
  test('Sanitize', 'Handles null', sanitized6 === null);

  const sanitized7 = SmartRouter._sanitizeCommand('');
  test('Sanitize', 'Handles empty string', sanitized7 === '');
}

// ============================================================================
// SMART ROUTER: Claude Code Detection
// ============================================================================

async function testClaudeCodeDetection() {
  section('SmartRouter: Claude Code Detection');

  const result1 = SmartRouter._extractClaudeCodeCommand('claude code to fix the login bug');
  test('CC Detect', '"claude code to fix..." → session command', result1 === 'claude code session fix the login bug');

  const result2 = SmartRouter._extractClaudeCodeCommand('use the agent to add rate limiting');
  test('CC Detect', '"use the agent to..." → session command', result2 === 'claude code session add rate limiting');

  const result3 = SmartRouter._extractClaudeCodeCommand('have the agent implement caching');
  test('CC Detect', '"have the agent..." → session command', result3 === 'claude code session implement caching');

  const result4 = SmartRouter._extractClaudeCodeCommand('deploy JUDO');
  test('CC Detect', '"deploy JUDO" → undefined (not CC)', result4 === undefined);

  const result5 = SmartRouter._extractClaudeCodeCommand('claude code');
  test('CC Detect', '"claude code" alone → null (passthrough)', result5 === null);
}

// ============================================================================
// SMART ROUTER: looksLikeCommand
// ============================================================================

async function testLooksLikeCommand() {
  section('SmartRouter: looksLikeCommand');

  const commands = ['help', 'status', 'deploy JUDO', 'run tests JUDO', 'list repos',
                    'deadlines GMH', 'company GQCARS', 'project status JUDO'];
  for (const cmd of commands) {
    test('Command', `"${cmd}" looks like command`, SmartRouter.looksLikeCommand(cmd));
  }

  const notCommands = ['add a login button', 'fix the sidebar', 'hello there',
                       'what time is it', 'build me an API'];
  for (const msg of notCommands) {
    test('Command', `"${msg.substring(0, 25)}" NOT a command`, !SmartRouter.looksLikeCommand(msg));
  }
}

// ============================================================================
// SMART ROUTER: Metrics
// ============================================================================

async function testMetrics() {
  section('SmartRouter: Metrics');

  SmartRouter.resetMetrics();
  test('Metrics', 'Metrics reset to zero', SmartRouter.routeMetrics.patternHits === 0);

  await SmartRouter.route('hello!');
  test('Metrics', 'Passthrough increments counter', SmartRouter.routeMetrics.passthroughs > 0);

  SmartRouter.cache.clear();
  await SmartRouter.route('upcoming deadlines');
  test('Metrics', 'Pattern match increments counter', SmartRouter.routeMetrics.patternHits > 0);

  const metrics = SmartRouter.getMetrics();
  test('Metrics', 'getMetrics returns total', typeof metrics.total === 'number' && metrics.total > 0);
  test('Metrics', 'getMetrics returns rates', typeof metrics.patternRate === 'string');
}

// ============================================================================
// SMART ROUTER: Edge Cases
// ============================================================================

async function testEdgeCases() {
  section('SmartRouter: Edge Cases');

  // Null/empty
  const r1 = await SmartRouter.route(null);
  test('Edge', 'null message → null', r1 === null);

  const r2 = await SmartRouter.route('');
  test('Edge', 'empty string → empty string', r2 === '');

  const r3 = await SmartRouter.route('   ');
  test('Edge', 'whitespace only → original', r3 === '   ');

  // Very long message
  const longMsg = 'a'.repeat(1000);
  const r4 = await SmartRouter.route(longMsg);
  test('Edge', 'Very long message handled', r4 === longMsg);

  // Special characters
  const r5 = await SmartRouter.route('deploy 🚀 JUDO');
  test('Edge', 'Emoji in message handled', typeof r5 === 'string');

  // Number-only message
  const r6 = await SmartRouter.route('12345');
  test('Edge', 'Number-only message passes through', r6 === '12345');
}

// ============================================================================
// INTENT CLASSIFIER: Confidence Calculation
// ============================================================================

function testConfidenceCalculation() {
  section('IntentClassifier: Confidence Calculation');

  // Create a fresh instance for testing
  const IntentClassifier = require('../lib/intent-classifier');

  // Test fixed confidence calculation (no inflation from single factors)
  const factors1 = { keywordMatch: 0.9, contextMatch: 0, historyMatch: 0, specificity: 0 };
  const conf1 = IntentClassifier.calculateOverallConfidence(factors1);
  test('Confidence', 'Single factor 0.9 → not 0.9 (no inflation)',
    conf1 < 0.5, `got: ${conf1.toFixed(3)} (expected ~0.36)`);

  // All factors high
  const factors2 = { keywordMatch: 1.0, contextMatch: 1.0, historyMatch: 1.0, specificity: 1.0 };
  const conf2 = IntentClassifier.calculateOverallConfidence(factors2);
  test('Confidence', 'All factors 1.0 → 1.0', conf2 === 1.0, `got: ${conf2}`);

  // All factors zero
  const factors3 = { keywordMatch: 0, contextMatch: 0, historyMatch: 0, specificity: 0 };
  const conf3 = IntentClassifier.calculateOverallConfidence(factors3);
  test('Confidence', 'All factors 0 → 0', conf3 === 0, `got: ${conf3}`);

  // Mixed factors
  const factors4 = { keywordMatch: 0.8, contextMatch: 0.6, historyMatch: 0, specificity: 0.5 };
  const conf4 = IntentClassifier.calculateOverallConfidence(factors4);
  const expected4 = 0.8 * 0.4 + 0.6 * 0.25 + 0 * 0.15 + 0.5 * 0.2;
  test('Confidence', 'Mixed factors calculate correctly',
    Math.abs(conf4 - expected4) < 0.001, `got: ${conf4.toFixed(3)}, expected: ${expected4.toFixed(3)}`);

  // Thresholds are tunable
  IntentClassifier.setThresholds({ ambiguityThreshold: 0.7, clarificationThreshold: 0.4 });
  const thresholds = IntentClassifier.getThresholds();
  test('Confidence', 'Thresholds are tunable',
    thresholds.ambiguityThreshold === 0.7 && thresholds.clarificationThreshold === 0.4);

  // Reset
  IntentClassifier.setThresholds({ ambiguityThreshold: 0.5, clarificationThreshold: 0.3 });
}

// ============================================================================
// INTENT CLASSIFIER: Specificity
// ============================================================================

function testSpecificity() {
  section('IntentClassifier: Specificity');

  const IntentClassifier = require('../lib/intent-classifier');

  // Short vague message
  const spec1 = IntentClassifier.calculateSpecificity('hi', { intent: null, project: null, company: null });
  test('Specificity', 'Short vague "hi" → low', spec1 < 0.3, `got: ${spec1.toFixed(2)}`);

  // Specific message with intent and project
  const spec2 = IntentClassifier.calculateSpecificity('deploy judo project to production', { intent: 'deploy', project: 'JUDO', company: null });
  test('Specificity', 'Specific msg with intent+project → high', spec2 > 0.6, `got: ${spec2.toFixed(2)}`);

  // Vague pattern detection
  const spec3 = IntentClassifier.calculateSpecificity('just do the thing', { intent: null, project: null, company: null });
  test('Specificity', '"do the thing" → very low', spec3 <= 0.3, `got: ${spec3.toFixed(2)}`);
}

// ============================================================================
// INTENT CLASSIFIER: Fuzzy Matching
// ============================================================================

function testFuzzyMatching() {
  section('IntentClassifier: Fuzzy Matching');

  const IntentClassifier = require('../lib/intent-classifier');

  // Exact match
  test('Fuzzy', 'Exact match "hello" = "hello"', IntentClassifier._fuzzyMatch('hello', 'hello', 1));

  // One edit distance
  test('Fuzzy', '"helo" ~ "hello" (dist 1)', IntentClassifier._fuzzyMatch('helo', 'hello', 1));
  test('Fuzzy', '"helloo" ~ "hello" (dist 1)', IntentClassifier._fuzzyMatch('helloo', 'hello', 1));

  // Two edit distance
  test('Fuzzy', '"hllo" ~ "hello" (dist 2)', IntentClassifier._fuzzyMatch('hllo', 'hello', 2));

  // Too far
  test('Fuzzy', '"xyz" !~ "hello" (too far)', !IntentClassifier._fuzzyMatch('xyz', 'hello', 2));

  // Length difference check
  test('Fuzzy', '"hi" !~ "hello" (length diff > maxDist)', !IntentClassifier._fuzzyMatch('hi', 'hello', 1));
}

// ============================================================================
// INTENT CLASSIFIER: User History Bounds
// ============================================================================

function testUserHistoryBounds() {
  section('IntentClassifier: User History Bounds');

  const IntentClassifier = require('../lib/intent-classifier');

  // Clear history
  IntentClassifier.userHistory.clear();

  // Track actions for many users
  const originalMax = IntentClassifier.maxUsers;
  IntentClassifier.maxUsers = 5;

  for (let i = 0; i < 10; i++) {
    IntentClassifier.trackUserAction(`user${i}`, {
      intent: 'deploy', project: 'JUDO', company: null
    });
  }

  test('History', 'User history bounded at maxUsers',
    IntentClassifier.userHistory.size <= 5,
    `size: ${IntentClassifier.userHistory.size}`);

  test('History', 'getTrackedUserCount works',
    IntentClassifier.getTrackedUserCount() <= 5);

  // Restore
  IntentClassifier.maxUsers = originalMax;
  IntentClassifier.userHistory.clear();

  // Track many actions for one user
  const origMaxActions = IntentClassifier.maxActionsPerUser;
  IntentClassifier.maxActionsPerUser = 10;

  for (let i = 0; i < 20; i++) {
    IntentClassifier.trackUserAction('test-user', {
      intent: 'deploy', project: `proj${i}`, company: null
    });
  }

  const history = IntentClassifier.getUserHistory('test-user');
  test('History', 'Actions per user bounded',
    history && history.actions.length <= 10,
    `actions: ${history ? history.actions.length : 'null'}`);

  IntentClassifier.maxActionsPerUser = origMaxActions;
  IntentClassifier.clearUserHistory('test-user');
}

// ============================================================================
// INTENT CLASSIFIER: Risk Assessment
// ============================================================================

function testRiskAssessment() {
  section('IntentClassifier: Risk Assessment');

  const IntentClassifier = require('../lib/intent-classifier');

  // High risk: deploy
  const high = IntentClassifier.assessRisk({ action: 'deploy', intent: 'deploy', project: 'JUDO' });
  test('Risk', 'deploy → high risk', high.risk === 'high');
  test('Risk', 'high risk requires confirmation', high.requiresConfirmation === true);

  // Medium risk: create-page
  const med = IntentClassifier.assessRisk({ action: 'create-page', intent: 'create', project: 'JUDO' });
  test('Risk', 'create-page → medium risk', med.risk === 'medium');

  // Low risk: check-status
  const low = IntentClassifier.assessRisk({ action: 'check-status', intent: 'check', project: 'JUDO' });
  test('Risk', 'check-status → low risk', low.risk === 'low');
  test('Risk', 'low risk no confirmation', low.requiresConfirmation === false);

  // Production target escalates risk
  const prod = IntentClassifier.assessRisk({ action: 'check-status', intent: 'check', project: 'production' });
  test('Risk', 'production target escalates', prod.risk === 'medium');
}

// ============================================================================
// INTENT CLASSIFIER: Default Result
// ============================================================================

function testDefaultResult() {
  section('IntentClassifier: Default Result');

  const IntentClassifier = require('../lib/intent-classifier');

  const empty = IntentClassifier.defaultResult('empty');
  test('Default', 'Empty result has all fields', empty.intent === 'unknown' && empty.confidence === 0);
  test('Default', 'Empty result not ambiguous', empty.ambiguous === false);

  const unknown = IntentClassifier.defaultResult('unknown');
  test('Default', 'Unknown result is ambiguous', unknown.ambiguous === true);
  test('Default', 'Unknown has clarifying questions', unknown.clarifyingQuestions.length > 0);
}

// ============================================================================
// INTENT CLASSIFIER: Correction Learning
// ============================================================================

function testCorrectionLearning() {
  section('IntentClassifier: Correction Learning');

  const IntentClassifier = require('../lib/intent-classifier');

  // Clear corrections
  IntentClassifier.corrections = [];
  IntentClassifier.correctionPatterns.clear();

  // Record a correction
  IntentClassifier.recordCorrection(
    { intent: 'deploy', project: 'JUDO', confidence: 0.8 },
    { correctionText: 'deploy LusoTown' },
    'user1'
  );

  test('Correction', 'Correction recorded', IntentClassifier.corrections.length === 1);
  test('Correction', 'Pattern learned',
    IntentClassifier.correctionPatterns.has('deploy:JUDO'));

  // Record same correction again
  IntentClassifier.recordCorrection(
    { intent: 'deploy', project: 'JUDO', confidence: 0.8 },
    { correctionText: 'deploy LusoTown' },
    'user1'
  );

  const pattern = IntentClassifier.correctionPatterns.get('deploy:JUDO');
  test('Correction', 'Pattern count increments', pattern && pattern.count === 2);

  // Test that learned patterns reduce confidence
  const result = {
    intent: 'deploy', project: 'JUDO', confidence: 0.9,
    ambiguous: false, clarifyingQuestions: []
  };
  IntentClassifier._applyLearnedPatterns(result, 'deploy judo');
  test('Correction', 'Learned patterns reduce confidence', result.confidence < 0.9,
    `was 0.9, now ${result.confidence.toFixed(2)}`);
  test('Correction', 'Learned patterns mark ambiguous', result.ambiguous === true);

  // Stats
  const stats = IntentClassifier.getCorrectionStats();
  test('Correction', 'Stats available', stats.totalCorrections === 2 && stats.learnedPatterns === 1);

  // Clean up
  IntentClassifier.corrections = [];
  IntentClassifier.correctionPatterns.clear();
}

// ============================================================================
// SKILL REGISTRY: Conflict Detection
// ============================================================================

function testSkillRegistryConflicts() {
  section('SkillRegistry: Conflict Detection');

  const { SkillRegistry } = require('../skills/skill-registry');
  const registry = new SkillRegistry();

  // Register two skills with overlapping commands
  const skill1 = {
    name: 'skill-a',
    priority: 50,
    commands: [{ pattern: /^test$/i, usage: 'test', description: 'Test A' }],
    canHandle: (cmd) => /^test$/i.test(cmd),
    execute: async () => ({ success: true, message: 'A' }),
    isInitialized: () => true,
    initialize: async () => {},
    shutdown: async () => {},
    getMetadata: () => ({ name: 'skill-a', description: 'A', commands: [], priority: 50 })
  };

  const skill2 = {
    name: 'skill-b',
    priority: 30,
    commands: [{ pattern: /^test$/i, usage: 'test', description: 'Test B' }],
    canHandle: (cmd) => /^test$/i.test(cmd),
    execute: async () => ({ success: true, message: 'B' }),
    isInitialized: () => true,
    initialize: async () => {},
    shutdown: async () => {},
    getMetadata: () => ({ name: 'skill-b', description: 'B', commands: [], priority: 30 })
  };

  registry.register(skill1);
  registry.register(skill2);

  // Test conflict detection
  const conflicts = registry.detectConflicts();
  test('Conflicts', 'Detects conflicting skills', conflicts.length > 0);

  // Test that higher priority wins in routing
  const matching = registry.findMatchingSkills('test');
  test('Conflicts', 'findMatchingSkills returns both',
    matching.length === 2, `found: ${matching.length}`);
  test('Conflicts', 'Higher priority listed first',
    matching[0].name === 'skill-a' && matching[0].priority === 50);
}

// ============================================================================
// END-TO-END: Message Classification Flow
// ============================================================================

async function testE2EFlow() {
  section('End-to-End: Message Classification');

  // Test that greetings don't route to skills
  const greeting = await SmartRouter.route('hey there!');
  test('E2E', 'Greeting stays as-is', greeting === 'hey there!');

  // Test that questions don't route
  const question = await SmartRouter.route('how do I deploy to vercel?');
  test('E2E', 'Question passes to AI', question === 'how do I deploy to vercel?');

  // Test that exact commands work
  const deploy = await SmartRouter.route('deploy JUDO');
  test('E2E', 'Exact command works', deploy === 'deploy JUDO');

  // Test that NL deadlines route
  SmartRouter.cache.clear();
  const deadline = await SmartRouter.route('what deadlines do we have for gmh');
  test('E2E', 'NL deadline → command', deadline === 'deadlines GMH');

  // Test that coding instructions pass through
  const coding = await SmartRouter.route('add a search bar to the dashboard');
  test('E2E', 'Coding instruction → AI', coding === 'add a search bar to the dashboard');

  // Test claude code routing
  const cc = await SmartRouter.route('claude code to implement rate limiting');
  test('E2E', 'Claude code → session command',
    cc === 'claude code session implement rate limiting',
    `got: "${cc}"`);
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary() {
  console.log(`\n${C.bright}${C.cyan}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.bright}  Test Summary${C.reset}`);
  console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);

  // Group by category
  const byCategory = {};
  for (const d of results.details) {
    if (!byCategory[d.category]) byCategory[d.category] = { passed: 0, failed: 0 };
    if (d.status === 'pass') byCategory[d.category].passed++;
    else byCategory[d.category].failed++;
  }

  for (const [cat, counts] of Object.entries(byCategory)) {
    const status = counts.failed === 0 ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
    console.log(`  ${status}  ${cat}: ${counts.passed} passed, ${counts.failed} failed`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Total: ${results.total} | ${C.green}Passed: ${results.passed}${C.reset} | ${C.red}Failed: ${results.failed}${C.reset}`);
  console.log(`${'─'.repeat(60)}`);

  if (results.failed === 0) {
    console.log(`\n${C.green}${C.bright}  All ${results.total} tests passed!${C.reset}\n`);
  } else {
    console.log(`\n${C.red}${C.bright}  ${results.failed} test(s) failed.${C.reset}\n`);
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${C.bright}${C.cyan}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bright}${C.cyan}║     NL Command Handling Test Suite                         ║${C.reset}`);
  console.log(`${C.bright}${C.cyan}║     SmartRouter + IntentClassifier + E2E                   ║${C.reset}`);
  console.log(`${C.bright}${C.cyan}╚════════════════════════════════════════════════════════════╝${C.reset}`);

  try {
    // SmartRouter tests
    await testPassthroughGuards();
    await testCodingGuards();
    await testConversationalBuildGuards();
    await testPatternMatching();
    await testAutoContext();
    await testCache();
    await testSanitization();
    await testClaudeCodeDetection();
    await testLooksLikeCommand();
    await testMetrics();
    await testEdgeCases();

    // IntentClassifier tests (sync - no API needed)
    testConfidenceCalculation();
    testSpecificity();
    testFuzzyMatching();
    testUserHistoryBounds();
    testRiskAssessment();
    testDefaultResult();
    testCorrectionLearning();

    // SkillRegistry tests
    testSkillRegistryConflicts();

    // E2E tests
    await testE2EFlow();

  } catch (err) {
    console.error(`\n${C.red}Unexpected error:${C.reset}`, err);
    process.exit(1);
  }

  printSummary();
}

main();
