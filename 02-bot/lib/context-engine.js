/**
 * Context Engine - The brain's foundation
 *
 * Aggregates ALL available context before Claude processes any message.
 * This is what makes the bot "aware" — it knows who's talking, what project
 * this chat is for, what happened recently, what's pending, and what time it is.
 *
 * Called once per incoming message, returns a rich context object that gets
 * injected into the system prompt so Claude has full awareness.
 *
 * @module lib/context-engine
 */

'use strict';

// Lazy-load dependencies to avoid circular imports
let _memory = null;
let _chatRegistry = null;
let _activeProject = null;
let _database = null;
let _activityLog = null;
let _projectManager = null;

function getMemory() {
  if (!_memory) {
    try { _memory = require('../memory/memory-manager'); } catch (e) { _memory = false; }
  }
  return _memory || null;
}

function getChatRegistry() {
  if (!_chatRegistry) {
    try { _chatRegistry = require('./chat-registry'); } catch (e) { _chatRegistry = false; }
  }
  return _chatRegistry || null;
}

function getActiveProject() {
  if (!_activeProject) {
    try { _activeProject = require('./active-project'); } catch (e) { _activeProject = false; }
  }
  return _activeProject || null;
}

function getDatabase() {
  if (!_database) {
    try { _database = require('./database'); } catch (e) { _database = false; }
  }
  return _database || null;
}

function getActivityLog() {
  if (!_activityLog) {
    try { _activityLog = require('./activity-log'); } catch (e) { _activityLog = false; }
  }
  return _activityLog || null;
}

function getProjectManager() {
  if (!_projectManager) {
    try { _projectManager = require('./project-manager'); } catch (e) { _projectManager = false; }
  }
  return _projectManager || null;
}

/**
 * Build a comprehensive context object for the current message.
 *
 * @param {Object} params
 * @param {string} params.chatId - Chat/group ID
 * @param {string} params.userId - User ID
 * @param {string} params.platform - 'telegram' | 'whatsapp'
 * @param {string} [params.message] - The incoming message (for intent hints)
 * @param {string} [params.autoRepo] - Auto-detected repo from chat registry
 * @param {string} [params.autoCompany] - Auto-detected company from chat registry
 * @returns {Promise<Object>} Rich context object
 */
async function build({ chatId, userId, platform = 'telegram', message = '', autoRepo = null, autoCompany = null }) {
  const startTime = Date.now();

  const context = {
    // Identity
    chatId,
    userId,
    platform,
    timestamp: new Date().toISOString(),
    timeOfDay: getTimeOfDay(),
    dayOfWeek: getDayOfWeek(),

    // Chat context
    chatType: null,       // 'repo' | 'company' | 'hq' | null
    chatValue: null,      // repo name, company code, or null
    chatName: null,       // display name for the chat

    // User knowledge
    userFacts: [],        // facts we know about the user
    userFactsSummary: '', // formatted string for system prompt

    // Conversation memory
    conversationHistory: [], // recent messages for Claude API format
    conversationSummary: '', // brief summary of what was discussed recently

    // Project awareness
    activeRepo: null,     // currently active repo
    repoContext: null,     // TODO.md, recent commits, open PRs

    // Recent activity
    recentActivity: [],   // what the bot has been doing
    recentDeployments: [], // recent deploys
    recentPlans: [],       // recent plans

    // Pending items
    pendingActions: [],    // actions awaiting confirmation

    // Build metadata
    buildTimeMs: 0,
  };

  // Run all context-building in parallel for speed
  const tasks = [];

  // 1. Chat registry context
  tasks.push(buildChatContext(context, chatId, autoRepo, autoCompany));

  // 2. User facts
  tasks.push(buildUserFacts(context, userId));

  // 3. Conversation history
  tasks.push(buildConversationHistory(context, chatId, userId));

  // 4. Active project & repo context
  tasks.push(buildProjectContext(context, userId, autoRepo, message));

  // 5. Recent activity
  tasks.push(buildRecentActivity(context));

  // 6. Recent deployments & plans
  tasks.push(buildRecentDeploymentsAndPlans(context, chatId));

  await Promise.allSettled(tasks);

  context.buildTimeMs = Date.now() - startTime;

  return context;
}

/**
 * Build chat registry context
 */
async function buildChatContext(context, chatId, autoRepo, autoCompany) {
  const registry = getChatRegistry();
  if (!registry) return;

  try {
    const chatContext = registry.getContext(chatId);
    if (chatContext) {
      context.chatType = chatContext.type || null;
      context.chatValue = chatContext.value || null;
      context.chatName = chatContext.name || null;
    }
  } catch (e) {
    // Ignore
  }

  // Override with auto-detected values if available
  if (autoRepo) {
    context.chatType = 'repo';
    context.chatValue = autoRepo;
  }
  if (autoCompany) {
    context.chatType = 'company';
    context.chatValue = autoCompany;
  }
}

/**
 * Build user facts from memory
 */
async function buildUserFacts(context, userId) {
  const memory = getMemory();
  if (!memory) return;

  try {
    const facts = memory.getFacts(userId);
    if (facts && facts.length > 0) {
      context.userFacts = facts.map(f => ({
        category: f.category,
        fact: f.fact,
      }));

      // Build summary string
      context.userFactsSummary = memory.getUserContextSummary(userId);
    }
  } catch (e) {
    // Ignore - memory might not be available
  }
}

/**
 * Build conversation history from memory
 */
async function buildConversationHistory(context, chatId, userId) {
  const memory = getMemory();
  if (!memory) return;

  try {
    const history = memory.getConversationForClaude(chatId || userId, 15);
    if (history && history.length > 0) {
      context.conversationHistory = history;

      // Build a brief summary of recent topics
      const recentMessages = history.slice(-6);
      const topics = recentMessages
        .filter(m => m.role === 'user')
        .map(m => m.content.substring(0, 80))
        .join('; ');
      if (topics) {
        context.conversationSummary = `Recent topics: ${topics}`;
      }
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Build project context - active repo, TODO status, recent commits, open PRs
 */
async function buildProjectContext(context, userId, autoRepo, message) {
  const ap = getActiveProject();
  const pm = getProjectManager();

  // Determine active repo
  let repo = autoRepo;
  if (!repo && ap) {
    try {
      const active = ap.getActiveProject(userId);
      if (active) {
        repo = active.repo || active.fullName;
      }
    } catch (e) { /* ignore */ }
  }

  if (!repo) return;

  context.activeRepo = repo;

  // Fetch repo context in parallel
  if (!pm) return;

  const githubUsername = process.env.GITHUB_USERNAME || 'giquina';
  const repoFullName = repo.includes('/') ? repo : `${githubUsername}/${repo}`;

  const subTasks = [];

  // TODO.md
  subTasks.push(
    pm.fetchTodoMd(repoFullName)
      .then(todo => { if (todo) context.repoContext = { ...context.repoContext, todoMd: todo }; })
      .catch(() => {})
  );

  // Open PRs
  if (typeof pm.getOpenPRs === 'function') {
    subTasks.push(
      pm.getOpenPRs(repoFullName)
        .then(prs => { if (prs) context.repoContext = { ...context.repoContext, openPRs: prs }; })
        .catch(() => {})
    );
  }

  await Promise.allSettled(subTasks);
}

/**
 * Build recent activity from activity log
 */
async function buildRecentActivity(context) {
  const log = getActivityLog();
  if (!log) return;

  try {
    const recent = log.getRecent(8);
    if (recent && recent.length > 0) {
      context.recentActivity = recent.map(entry => ({
        time: entry.timestamp,
        source: entry.source,
        message: entry.message,
      }));
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Build recent deployments and plans from database
 */
async function buildRecentDeploymentsAndPlans(context, chatId) {
  const db = getDatabase();
  if (!db || !db.getDb || !db.getDb()) return;

  try {
    // Recent plans for this chat
    const plans = db.getRecentPlans(chatId, 3);
    if (plans && plans.length > 0) {
      context.recentPlans = plans.map(p => ({
        id: p.id,
        status: p.status,
        repo: p.repo,
        createdAt: p.created_at,
        prUrl: p.pr_url,
      }));
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Format the full context into a system prompt section.
 * This is what gets injected into Claude's system prompt.
 *
 * @param {Object} ctx - Context object from build()
 * @returns {string} Formatted context section for system prompt
 */
function formatForSystemPrompt(ctx) {
  if (!ctx) return '';

  const sections = [];

  // Time awareness
  sections.push(`🕐 Current time: ${ctx.timeOfDay} (${ctx.dayOfWeek})`);

  // Chat context
  if (ctx.chatType === 'repo' && ctx.chatValue) {
    sections.push(`📁 This chat is dedicated to: ${ctx.chatValue}`);
    sections.push(`   Every message here is about this project. Auto-target ${ctx.chatValue} for all commands.`);
  } else if (ctx.chatType === 'company' && ctx.chatValue) {
    sections.push(`🏢 This chat is for company: ${ctx.chatValue}`);
  } else if (ctx.chatType === 'hq') {
    sections.push(`🎯 This is the HQ chat — cross-repo access, all alerts routed here.`);
  }

  // User facts
  if (ctx.userFactsSummary) {
    sections.push(`\n👤 USER KNOWLEDGE:\n${ctx.userFactsSummary}`);
  }

  // Active project
  if (ctx.activeRepo) {
    sections.push(`\n📂 Active project: ${ctx.activeRepo}`);
  }

  // Repo context - TODO status
  if (ctx.repoContext) {
    if (ctx.repoContext.todoMd) {
      const todoLines = ctx.repoContext.todoMd.split('\n').slice(0, 15).join('\n');
      sections.push(`\n📋 TODO.md (first 15 lines):\n${todoLines}`);
    }
    if (ctx.repoContext.openPRs && ctx.repoContext.openPRs.length > 0) {
      const prList = ctx.repoContext.openPRs
        .slice(0, 5)
        .map(pr => `  • #${pr.number}: ${pr.title} (${pr.user?.login || 'unknown'})`)
        .join('\n');
      sections.push(`\n🔀 Open PRs:\n${prList}`);
    }
  }

  // Recent plans
  if (ctx.recentPlans && ctx.recentPlans.length > 0) {
    const planList = ctx.recentPlans.map(p => {
      const status = p.status === 'completed' ? '✅' : p.status === 'failed' ? '❌' : '⏳';
      return `  ${status} Plan #${p.id} (${p.repo || 'unknown'}) — ${p.status}${p.prUrl ? ` → ${p.prUrl}` : ''}`;
    }).join('\n');
    sections.push(`\n📝 Recent plans:\n${planList}`);
  }

  // Conversation summary
  if (ctx.conversationSummary) {
    sections.push(`\n💬 ${ctx.conversationSummary}`);
  }

  // Recent activity (last 5 actions)
  if (ctx.recentActivity && ctx.recentActivity.length > 0) {
    const activityList = ctx.recentActivity
      .slice(0, 5)
      .map(a => `  • [${a.source}] ${a.message}`)
      .join('\n');
    sections.push(`\n🔄 Recent bot activity:\n${activityList}`);
  }

  if (sections.length === 0) return '';

  return '\n\n' + '═'.repeat(50) + '\n' +
    '🧠 CONTEXT AWARENESS (auto-built)\n' +
    '═'.repeat(50) + '\n' +
    sections.join('\n') + '\n' +
    '═'.repeat(50) + '\n' +
    'Use this context to give intelligent, project-aware responses.\n' +
    'Remember what was discussed. Know what project this chat is for.\n' +
    'Be proactive — suggest next steps based on what you see.\n';
}

// ── Helpers ──────────────────────────────────────────────────────────

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 6) return 'late night';
  if (hour < 9) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'lunchtime';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'evening';
  return 'night';
}

function getDayOfWeek() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
}

module.exports = {
  build,
  formatForSystemPrompt,
};
