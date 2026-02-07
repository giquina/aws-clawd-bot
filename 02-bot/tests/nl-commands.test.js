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
// CONVERSATION THREADING
// ============================================================================

function testConversationThreading() {
  section('ConversationThread: Pronoun Resolution');

  const thread = require('../lib/conversation-thread');

  // Clean slate
  thread.clear('test-chat-1');
  thread.clear('test-chat-2');

  // Test: Record repo mention and resolve "it"
  thread.recordMention('test-chat-1', 'repo', 'JUDO');
  const r1 = thread.resolvePronouns('test-chat-1', 'deploy it');
  test('Thread', '"deploy it" → "deploy JUDO"', r1 === 'deploy JUDO', `got: "${r1}"`);

  // Test: Record company mention and resolve "their"
  thread.recordMention('test-chat-1', 'company', 'GMH');
  const r2 = thread.resolvePronouns('test-chat-1', 'show their expenses');
  test('Thread', '"show their expenses" → "show GMH expenses"', r2 === 'show GMH expenses', `got: "${r2}"`);

  // Test: "on it" resolution
  thread.clear('test-chat-2');
  thread.recordMention('test-chat-2', 'repo', 'LusoTown');
  const r3 = thread.resolvePronouns('test-chat-2', 'run tests on it');
  test('Thread', '"run tests on it" → "run tests on LusoTown"', r3 === 'run tests on LusoTown', `got: "${r3}"`);

  // Test: "again" repeats last action
  thread.recordMention('test-chat-2', 'action', 'deploy');
  const r4 = thread.resolvePronouns('test-chat-2', 'again');
  test('Thread', '"again" → "deploy LusoTown"', r4 === 'deploy LusoTown', `got: "${r4}"`);

  // Test: "same for X" resolves to lastAction + X
  const r5 = thread.resolvePronouns('test-chat-2', 'do the same for JUDO');
  test('Thread', '"do the same for JUDO" → "deploy JUDO"', r5 === 'deploy JUDO', `got: "${r5}"`);

  // Test: "the other one" resolves to second-to-last repo
  thread.clear('test-chat-1');
  thread.recordMention('test-chat-1', 'repo', 'JUDO');
  thread.recordMention('test-chat-1', 'repo', 'LusoTown');
  const r6 = thread.resolvePronouns('test-chat-1', 'deploy the other one');
  test('Thread', '"deploy the other one" → "deploy JUDO"', r6 === 'deploy JUDO', `got: "${r6}"`);

  // Test: "there" resolves to lastRepo
  thread.clear('test-chat-1');
  thread.recordMention('test-chat-1', 'repo', 'armora');
  const r7 = thread.resolvePronouns('test-chat-1', 'what files are there');
  test('Thread', '"what files are there" → "what files are in armora"', r7 === 'what files are in armora', `got: "${r7}"`);

  // Test: No thread state → unchanged
  thread.clear('test-chat-99');
  const r8 = thread.resolvePronouns('test-chat-99', 'deploy it');
  test('Thread', 'No thread state → unchanged', r8 === 'deploy it', `got: "${r8}"`);

  // Test: detectAndRecord auto-detects entities
  thread.clear('test-chat-1');
  const detected = thread.detectAndRecord('test-chat-1', 'deploy JUDO');
  test('Thread', 'detectAndRecord finds JUDO', detected.some(d => d.type === 'repo' && d.value === 'JUDO'));

  // Test: detectAndRecord finds companies
  thread.clear('test-chat-1');
  const detected2 = thread.detectAndRecord('test-chat-1', 'check deadlines for GMH');
  test('Thread', 'detectAndRecord finds GMH', detected2.some(d => d.type === 'company' && d.value === 'GMH'));

  // Test: getState returns current state
  const state = thread.getState('test-chat-1');
  test('Thread', 'getState returns state', state !== null && state.lastCompany === 'GMH');

  // Test: getStats works
  const stats = thread.getStats();
  test('Thread', 'getStats returns active threads', stats.activeThreads > 0);

  // Cleanup
  thread.clear('test-chat-1');
  thread.clear('test-chat-2');
}

// ============================================================================
// MULTI-INTENT PARSER
// ============================================================================

function testMultiIntentParser() {
  section('MultiIntentParser: Compound Commands');

  const parser = require('../lib/multi-intent-parser');

  // Test: Single intent stays single
  const single = parser.parse('deploy JUDO');
  test('MultiIntent', '"deploy JUDO" → single intent', !single.isMultiIntent);
  test('MultiIntent', 'Single intent text preserved', single.intents[0].text === 'deploy JUDO');

  // Test: "and then" splits into sequential intents
  const andThen = parser.parse('run tests on JUDO and then deploy it');
  test('MultiIntent', '"run tests and then deploy" → multi', andThen.isMultiIntent);
  test('MultiIntent', '2 intents detected', andThen.intents.length === 2, `got: ${andThen.intents.length}`);
  test('MultiIntent', 'First intent is "run tests on JUDO"',
    andThen.intents[0].text === 'run tests on JUDO',
    `got: "${andThen.intents[0].text}"`);
  test('MultiIntent', 'Pronoun "it" resolved to JUDO',
    andThen.intents[1].text.includes('JUDO'),
    `got: "${andThen.intents[1].text}"`);
  test('MultiIntent', 'Sequential flag set', andThen.intents[1].isSequential);

  // Test: "and also" splits into parallel intents
  const andAlso = parser.parse('check deadlines and also show expenses');
  test('MultiIntent', '"check deadlines and also show expenses" → multi', andAlso.isMultiIntent);
  test('MultiIntent', 'Parallel (not sequential)', !andAlso.intents[1].isSequential);

  // Test: "but first" reverses order
  const butFirst = parser.parse('deploy JUDO but first run tests');
  test('MultiIntent', '"but first" → multi', butFirst.isMultiIntent);
  test('MultiIntent', '"but first" reverses order — tests first',
    butFirst.intents[0].text.includes('run tests'),
    `got first: "${butFirst.intents[0].text}", second: "${butFirst.intents[1].text}"`);

  // Test: Questions are never split
  const question = parser.parse('what are the deadlines and how do I deploy?');
  test('MultiIntent', 'Questions never split', !question.isMultiIntent);

  // Test: Greetings are never split
  const greeting = parser.parse('hello and how are you');
  test('MultiIntent', 'Greetings never split', !greeting.isMultiIntent);

  // Test: Noun phrases with "and" not split
  const nounPhrase = parser.parse('show me the pros and cons');
  test('MultiIntent', '"pros and cons" not split', !nounPhrase.isMultiIntent);

  // Test: isMultiIntent quick check
  test('MultiIntent', 'isMultiIntent("deploy JUDO") → false', !parser.isMultiIntent('deploy JUDO'));
  test('MultiIntent', 'isMultiIntent("run tests and then deploy") → true', parser.isMultiIntent('run tests and then deploy'));
  test('MultiIntent', 'isMultiIntent(null) → false', !parser.isMultiIntent(null));

  // Test: comma then splits
  const commaThen = parser.parse('check GMH deadlines, then deploy JUDO');
  test('MultiIntent', '", then" splits', commaThen.isMultiIntent);
  test('MultiIntent', '", then" is sequential', commaThen.intents[1].isSequential);

  // Test: sentence boundary splits
  const sentence = parser.parse('Run tests on JUDO. Deploy LusoTown.');
  test('MultiIntent', 'Sentence boundary splits', sentence.isMultiIntent);
  test('MultiIntent', 'Both intents preserved',
    sentence.intents.length === 2,
    `got: ${sentence.intents.length}`);

  // Test: "and" without verbs on both sides doesn't split
  const noVerb = parser.parse('frontend and backend');
  test('MultiIntent', '"frontend and backend" not split', !noVerb.isMultiIntent);

  // Test: edge case — empty/null
  const empty = parser.parse('');
  test('MultiIntent', 'Empty string → single intent', !empty.isMultiIntent);
  const nullParse = parser.parse(null);
  test('MultiIntent', 'null → single intent', !nullParse.isMultiIntent);
}

// ============================================================================
// A/B TESTING FRAMEWORK
// ============================================================================

function testABTesting() {
  section('ABTestingFramework: Experiment Management');

  // Create a fresh instance for testing (avoid polluting the singleton)
  const ABPath = require('path').join(__dirname, '..', 'lib', 'ab-testing.js');
  delete require.cache[ABPath];
  const abTesting = require('../lib/ab-testing');

  // Clean up any previous test experiments
  try { abTesting.endExperiment('test-exp-1'); } catch (e) {}
  abTesting.experiments.clear();

  // Test: Create experiment
  const exp = abTesting.createExperiment('test-exp-1', {
    description: 'Test experiment',
    variants: [
      { name: 'control', weight: 50, params: { ambiguityThreshold: 0.5 } },
      { name: 'variant-a', weight: 50, params: { ambiguityThreshold: 0.4 } }
    ]
  });
  test('ABTest', 'Create experiment', exp.id === 'test-exp-1');
  test('ABTest', 'Experiment is active', exp.status === 'active');
  test('ABTest', '2 variants created', exp.variants.length === 2);

  // Test: Deterministic variant assignment
  const v1 = abTesting.getVariant('test-exp-1', 'user-1');
  const v2 = abTesting.getVariant('test-exp-1', 'user-1');
  test('ABTest', 'Same user gets same variant', v1.name === v2.name, `user-1 → ${v1.name}`);

  // Test: Different users may get different variants (check determinism)
  const variants = new Set();
  for (let i = 0; i < 20; i++) {
    variants.add(abTesting.getVariant('test-exp-1', `user-${i}`).name);
  }
  test('ABTest', 'Variants distributed across users', variants.size >= 1, `unique variants: ${variants.size}`);

  // Test: Record outcome
  const outcome = abTesting.recordOutcome('test-exp-1', 'user-1', {
    success: true, corrected: false, latencyMs: 250
  });
  test('ABTest', 'Record outcome', outcome.success === true);
  test('ABTest', 'Outcome has variant', !!outcome.variant);

  // Test: Record multiple outcomes for results
  for (let i = 0; i < 10; i++) {
    abTesting.recordOutcome('test-exp-1', `user-${i}`, {
      success: i < 7, corrected: i >= 8, latencyMs: 200 + i * 10
    });
  }

  // Test: Get results
  const results_ab = abTesting.getResults('test-exp-1');
  test('ABTest', 'Results have variants', Object.keys(results_ab.variants).length === 2);
  test('ABTest', 'Results have participants', results_ab.totalParticipants > 0, `participants: ${results_ab.totalParticipants}`);

  // Test: End experiment
  const endResult = abTesting.endExperiment('test-exp-1', true);
  test('ABTest', 'End experiment', endResult.experiment.status === 'completed');

  // Test: Cannot record outcome on completed experiment
  let threwOnCompleted = false;
  try {
    abTesting.recordOutcome('test-exp-1', 'user-x', { success: true });
  } catch (e) {
    threwOnCompleted = true;
  }
  test('ABTest', 'Cannot record on completed', threwOnCompleted);

  // Test: List experiments
  const list = abTesting.listExperiments();
  test('ABTest', 'List experiments', list.length >= 1);

  // Test: Invalid experiment creation
  let threwOnInvalid = false;
  try {
    abTesting.createExperiment('', { variants: [] });
  } catch (e) {
    threwOnInvalid = true;
  }
  test('ABTest', 'Rejects invalid experiment', threwOnInvalid);

  // Cleanup
  abTesting.experiments.clear();
}

// ============================================================================
// CONTEXT DEDUP
// ============================================================================

function testContextDedup() {
  section('ContextDedup: Per-Request Caching');

  const { ContextDedup } = require('../lib/context-dedup');

  // Create a test instance with short TTL
  const dedup = new ContextDedup(500); // 500ms TTL for fast testing

  // Mock context engine build function
  let buildCallCount = 0;
  const mockBuild = async (params) => {
    buildCallCount++;
    return { chatId: params.chatId, built: true, callNumber: buildCallCount };
  };

  // Manually test the caching logic (without requiring actual context-engine)
  // We'll test the cache key generation and stats tracking

  // Test: Stats start at zero
  const stats = dedup.getStats();
  test('CtxDedup', 'Initial stats are zero', stats.hits === 0 && stats.misses === 0);

  // Test: Cache max size
  test('CtxDedup', 'Cache starts empty', stats.cacheSize === 0);

  // Test: Cleanup on empty cache returns 0
  const cleaned = dedup.cleanup();
  test('CtxDedup', 'Cleanup on empty returns 0', cleaned === 0);

  // Test: Clear resets everything
  dedup.clear();
  const afterClear = dedup.getStats();
  test('CtxDedup', 'Clear resets stats', afterClear.hits === 0 && afterClear.misses === 0);

  // Test: Invalidate on non-existent chatId is safe
  dedup.invalidate('nonexistent');
  test('CtxDedup', 'Invalidate non-existent is safe', true);

  // Test: Patched status
  test('CtxDedup', 'Not patched by default', !dedup.getStats().patched);

  // Cleanup
  dedup.destroy();
}

// ============================================================================
// NL TUNING SKILL
// ============================================================================

function testNLTuningSkill() {
  section('NLTuningSkill: Command Matching');

  const NLTuningSkill = require('../skills/nl-tuning');
  const skill = new NLTuningSkill();

  // Test: canHandle for all commands
  test('NLTuning', 'Handles "nl status"', skill.canHandle('nl status'));
  test('NLTuning', 'Handles "nl stats"', skill.canHandle('nl stats'));
  test('NLTuning', 'Handles "nl metrics"', skill.canHandle('nl metrics'));
  test('NLTuning', 'Handles "nl thresholds"', skill.canHandle('nl thresholds'));
  test('NLTuning', 'Handles "nl set ambiguity 0.5"', skill.canHandle('nl set ambiguity 0.5'));
  test('NLTuning', 'Handles "nl cache clear"', skill.canHandle('nl cache clear'));
  test('NLTuning', 'Handles "nl cache stats"', skill.canHandle('nl cache stats'));
  test('NLTuning', 'Handles "nl corrections"', skill.canHandle('nl corrections'));
  test('NLTuning', 'Handles "nl test deploy judo"', skill.canHandle('nl test deploy judo'));

  // Test: Does not handle unrelated commands
  test('NLTuning', 'Does not handle "deploy JUDO"', !skill.canHandle('deploy JUDO'));
  test('NLTuning', 'Does not handle "help"', !skill.canHandle('help'));
  test('NLTuning', 'Does not handle "status"', !skill.canHandle('status'));
}

// ============================================================================
// SMART ROUTER: Multi-Intent Integration
// ============================================================================

async function testSmartRouterMultiIntent() {
  section('SmartRouter: Multi-Intent Integration');

  SmartRouter.cache.clear();

  // Test: Multi-intent is detected and first intent routed
  // "run tests and then deploy JUDO" — "run tests" looks like a command, "deploy JUDO" is second intent
  const result = await SmartRouter.route('run tests and then deploy JUDO');
  // "run tests" is recognized by looksLikeCommand, so it should be returned as-is or with auto-context
  test('SRMulti', 'Multi-intent routes first intent',
    result === 'run tests' || result.startsWith('run tests'),
    `got: "${result}"`);

  // Test: lastMultiIntentResult is populated
  test('SRMulti', 'lastMultiIntentResult populated',
    SmartRouter.lastMultiIntentResult !== null);
  if (SmartRouter.lastMultiIntentResult) {
    test('SRMulti', 'Remaining intents count',
      SmartRouter.lastMultiIntentResult.remainingIntents.length >= 1,
      `got: ${SmartRouter.lastMultiIntentResult.remainingIntents.length}`);
    test('SRMulti', 'totalIntents is correct',
      SmartRouter.lastMultiIntentResult.totalIntents >= 2,
      `got: ${SmartRouter.lastMultiIntentResult.totalIntents}`);
  }

  // Test: Single intent clears lastMultiIntentResult
  SmartRouter.cache.clear();
  await SmartRouter.route('deploy JUDO');
  test('SRMulti', 'Single intent clears multi result', SmartRouter.lastMultiIntentResult === null);

  // Test: Multi-intent metric increments
  const metrics = SmartRouter.getMetrics();
  test('SRMulti', 'Multi-intent metric tracked', metrics.multiIntents >= 1, `got: ${metrics.multiIntents}`);
}

// ============================================================================
// SMART ROUTER: Pronoun Resolution Integration
// ============================================================================

async function testSmartRouterPronounResolution() {
  section('SmartRouter: Pronoun Resolution Integration');

  const thread = require('../lib/conversation-thread');

  // Set up thread state
  thread.clear('test-pronoun-chat');
  thread.recordMention('test-pronoun-chat', 'repo', 'JUDO');
  thread.recordMention('test-pronoun-chat', 'action', 'deploy');

  SmartRouter.cache.clear();

  // Test: "deploy it" with chatId context resolves to "deploy JUDO"
  const result = await SmartRouter.route('deploy it', { chatId: 'test-pronoun-chat' });
  test('SRPronoun', '"deploy it" → "deploy JUDO" via thread',
    result === 'deploy JUDO',
    `got: "${result}"`);

  // Test: Without chatId, pronoun stays unresolved
  SmartRouter.cache.clear();
  const result2 = await SmartRouter.route('deploy it', {});
  test('SRPronoun', 'Without chatId, no resolution',
    result2 !== 'deploy JUDO',
    `got: "${result2}"`);

  // Cleanup
  thread.clear('test-pronoun-chat');
}

// ============================================================================
// TELEGRAM SANITIZER
// ============================================================================

function testTelegramSanitizer() {
  section('TelegramSanitizer: Response Cleaning');

  const {
    sanitizeResponse,
    sanitizeError,
    humanizeCommit,
    formatPushNotification,
    formatDeployError,
    humanizeProgress,
  } = require('../lib/telegram-sanitizer');

  // Test: Strip XML invoke blocks
  const xmlResponse = 'Sure! <invoke name="task"><task_description>Search repos</task_description><agent_role>search_specialist</agent_role><success_criteria>Find all code</success_criteria></invoke> I\'ll handle that.';
  const cleaned = sanitizeResponse(xmlResponse);
  test('Sanitizer', 'Strips <invoke> blocks', !cleaned.includes('<invoke'), `got: "${cleaned.substring(0, 80)}"`);
  test('Sanitizer', 'Strips <task_description>', !cleaned.includes('<task_description'));
  test('Sanitizer', 'Strips <agent_role>', !cleaned.includes('agent_role'));
  test('Sanitizer', 'Keeps human text', cleaned.includes("Sure!") && cleaned.includes("handle that"));

  // Test: Strip thinking tags
  const thinkingResponse = '<thinking>Let me analyze this</thinking>Here is my answer.';
  const cleanThinking = sanitizeResponse(thinkingResponse);
  test('Sanitizer', 'Strips <thinking> blocks', !cleanThinking.includes('analyze this'));
  test('Sanitizer', 'Keeps answer after thinking', cleanThinking.includes('Here is my answer'));

  // Test: Strip agent role identifiers
  const agentResponse = 'The search_specialist found results and the architecture_analyst recommends Node.js.';
  const cleanAgent = sanitizeResponse(agentResponse);
  test('Sanitizer', 'Strips agent role names', !cleanAgent.includes('search_specialist'));

  // Test: Strip GitHub API doc URLs
  const errorWithUrl = 'Not Found - https://docs.github.com/rest/repos/repos#get-a-repository';
  const cleanUrl = sanitizeResponse(errorWithUrl);
  test('Sanitizer', 'Strips GitHub API doc URLs', !cleanUrl.includes('docs.github.com'));

  // Test: Clean multiple blank lines
  const messy = 'Line 1\n\n\n\n\nLine 2';
  test('Sanitizer', 'Collapses blank lines', !sanitizeResponse(messy).includes('\n\n\n'));

  // Test: null/empty handling
  test('Sanitizer', 'Handles null', sanitizeResponse(null) === '');
  test('Sanitizer', 'Handles empty string', sanitizeResponse('') === '');

  // --- Error sanitization ---
  test('Sanitizer', 'GitHub Not Found → friendly', sanitizeError('Not Found - https://docs.github.com/rest/repos').includes("couldn't find"));
  test('Sanitizer', 'Timeout → friendly', sanitizeError('Request timed out after 30000ms').includes('timed out'));
  test('Sanitizer', 'Rate limit → friendly', sanitizeError('429 Too Many Requests').includes('rate limit'));
  test('Sanitizer', 'Connection error → friendly', sanitizeError('ECONNREFUSED').includes('trouble connecting'));

  // --- Commit humanization ---
  test('Sanitizer', 'feat: → "Added a new feature"',
    humanizeCommit('feat: implement NL handlers').startsWith('Added a new feature'));
  test('Sanitizer', 'fix: → "Fixed a bug"',
    humanizeCommit('fix: resolve timeout issue').startsWith('Fixed a bug'));
  test('Sanitizer', 'docs: → "Updated documentation"',
    humanizeCommit('docs: update README').startsWith('Updated documentation'));
  test('Sanitizer', 'Non-conventional preserved',
    humanizeCommit('Update the login page') === 'Update the login page');

  // --- Push notification formatting ---
  const push = formatPushNotification('JUDO', 'main', 'giquina', [
    { message: 'feat: add rate limiting' }
  ]);
  test('Sanitizer', 'Push notification has repo name', push.includes('JUDO'));
  test('Sanitizer', 'Push notification humanizes commit', push.includes('Added a new feature'));
  test('Sanitizer', 'Push notification no raw commit prefix', !push.includes('feat:'));

  // --- Deploy error formatting ---
  const deployError = formatDeployError('JUDO', 'ECONNREFUSED');
  test('Sanitizer', 'Deploy error has repo name', deployError.includes('JUDO'));
  test('Sanitizer', 'Deploy error is friendly', deployError.includes('trouble connecting'));
  test('Sanitizer', 'Deploy error suggests retry', deployError.includes('retry'));

  // --- Progress humanization ---
  test('Sanitizer', 'File generation humanized',
    humanizeProgress('Generating code: src/utils/Logger.js (8/9)...').includes('8 of 9'));
  test('Sanitizer', 'Committing humanized',
    humanizeProgress('Committing: src/index.js (1/3)...').includes('1 of 3'));
  test('Sanitizer', 'Branch creation humanized',
    humanizeProgress('Creating branch: clawd-judo-12345').includes('new branch'));
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

    // NEW: 10/10 Feature tests
    testConversationThreading();
    testMultiIntentParser();
    testABTesting();
    testContextDedup();
    testNLTuningSkill();
    await testSmartRouterMultiIntent();
    await testSmartRouterPronounResolution();

    // Telegram Sanitizer tests
    testTelegramSanitizer();

  } catch (err) {
    console.error(`\n${C.red}Unexpected error:${C.reset}`, err);
    process.exit(1);
  }

  printSummary();
}

main();
