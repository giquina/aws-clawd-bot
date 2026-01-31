# TASKS.md - Detailed Implementation Tasks

## Overview
This file contains granular, assignable tasks for implementing the ClawdBot upgrade. Tasks are organized by phase and include acceptance criteria.

---

## Notation
- **[A]** = Assignable to agent
- **[H]** = Requires human input
- **Est:** = Time estimate
- **Deps:** = Dependencies
- **AC:** = Acceptance Criteria

---

## Phase 1: Foundation

### TASK-001: Create Memory Database Schema
**[A]** | Est: 30 min | Deps: None

Create SQLite database schema for persistent storage.

**Files to Create:**
- `02-whatsapp-bot/memory/schema.sql`
- `02-whatsapp-bot/memory/migrations/001_initial.sql`

**Schema:**
```sql
-- Conversations table
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Facts table (user preferences, learned info)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category TEXT,  -- 'preference', 'personal', 'work', etc.
  fact TEXT NOT NULL,
  source TEXT,    -- conversation that taught this
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',  -- pending, in_progress, completed
  priority TEXT DEFAULT 'medium',
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Scheduled jobs table
CREATE TABLE scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  handler TEXT NOT NULL,
  params TEXT,  -- JSON
  enabled BOOLEAN DEFAULT 1,
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**AC:**
- [ ] Schema file created
- [ ] Can create database from schema
- [ ] Indexes on user_id columns

---

### TASK-002: Implement Memory Manager Class
**[A]** | Est: 1 hour | Deps: TASK-001

Create MemoryManager class for database operations.

**Files to Create:**
- `02-whatsapp-bot/memory/memory-manager.js`

**Methods:**
```javascript
class MemoryManager {
  // Conversation methods
  async saveMessage(userId, role, content)
  async getConversationHistory(userId, limit = 10)
  async clearHistory(userId)
  async searchConversations(userId, query)

  // Fact methods
  async saveFact(userId, fact, category = 'general')
  async getFacts(userId, category = null)
  async searchFacts(userId, query)
  async deleteFact(userId, factId)

  // Task methods
  async createTask(userId, title, description, priority)
  async getTasks(userId, status = null)
  async updateTaskStatus(taskId, status)

  // Utility
  async getStats(userId)
  async exportData(userId)
}
```

**AC:**
- [ ] All methods implemented
- [ ] Error handling for DB operations
- [ ] Unit tests pass
- [ ] JSDoc comments

---

### TASK-003: Integrate Memory with AI Handler
**[A]** | Est: 45 min | Deps: TASK-002

Update ai-handler.js to use persistent memory.

**Changes to `ai-handler.js`:**
1. Import MemoryManager
2. Replace in-memory array with DB calls
3. Add fact extraction from responses
4. Include relevant facts in system prompt

**AC:**
- [ ] Conversations persist across restarts
- [ ] Facts extracted and saved
- [ ] System prompt includes relevant facts
- [ ] Old in-memory code removed

---

### TASK-004: Create Skill Base Class
**[A]** | Est: 30 min | Deps: None

Create base class for all skills.

**Files to Create:**
- `02-whatsapp-bot/skills/base-skill.js`

**Template:**
```javascript
class BaseSkill {
  name = 'base'
  description = ''
  commands = []

  constructor(context) {
    this.memory = context.memory
    this.ai = context.ai
    this.config = context.config
  }

  canHandle(command) { ... }
  async execute(command, context) { ... }
  async initialize() { ... }
  async shutdown() { ... }

  // Helpers
  parseCommand(command) { ... }
  formatResponse(data) { ... }
}
```

**AC:**
- [ ] Base class created
- [ ] Helper methods implemented
- [ ] Export default and named

---

### TASK-005: Create Skill Registry & Loader
**[A]** | Est: 45 min | Deps: TASK-004

Create skill discovery and routing system.

**Files to Create:**
- `02-whatsapp-bot/skills/skill-registry.js`
- `02-whatsapp-bot/skills/skill-loader.js`
- `02-whatsapp-bot/skills/skills.json`

**Registry Methods:**
```javascript
class SkillRegistry {
  register(skill)
  unregister(skillName)
  getSkill(skillName)
  async route(command, context)
  listSkills()
}
```

**AC:**
- [ ] Skills auto-discovered from directory
- [ ] Commands routed to correct skill
- [ ] Fallback to AI for unknown commands
- [ ] Skills.json controls enabled/disabled

---

### TASK-006: Update index.js for Skill System
**[A]** | Est: 30 min | Deps: TASK-005

Refactor main router to use skill system.

**Changes:**
1. Import SkillRegistry
2. Initialize skills on startup
3. Route commands through registry
4. Remove hardcoded command handling

**AC:**
- [ ] All existing commands still work
- [ ] New skills auto-registered
- [ ] Clean separation of concerns

---

### TASK-007: Install Scheduling Dependencies
**[A]** | Est: 15 min | Deps: None

Add node-cron and update package.json.

**Commands:**
```bash
cd 02-whatsapp-bot
npm install node-cron better-sqlite3
```

**AC:**
- [ ] Dependencies added to package.json
- [ ] No version conflicts
- [ ] npm install succeeds

---

### TASK-008: Create Scheduler Module
**[A]** | Est: 1 hour | Deps: TASK-001, TASK-007

Create scheduling system for recurring tasks.

**Files to Create:**
- `02-whatsapp-bot/scheduler/scheduler.js`
- `02-whatsapp-bot/scheduler/jobs/`

**Methods:**
```javascript
class Scheduler {
  constructor(db)

  // Job management
  async schedule(name, cronExpr, handler, params)
  async cancel(jobId)
  async list()
  async enable(jobId)
  async disable(jobId)

  // Execution
  start()
  stop()

  // Built-in jobs
  registerMorningBrief()
  registerEveningReport()
}
```

**AC:**
- [ ] Jobs persist in database
- [ ] Jobs execute on schedule
- [ ] Jobs survive restart
- [ ] Can add/remove jobs dynamically

---

## Phase 2: Core Features

### TASK-009: Create Morning Brief Skill
**[A]** | Est: 1.5 hours | Deps: TASK-004, TASK-008

Implement morning brief feature.

**Files to Create:**
- `02-whatsapp-bot/skills/morning-brief/index.js`
- `02-whatsapp-bot/skills/morning-brief/weather.js`
- `02-whatsapp-bot/skills/morning-brief/task-summary.js`

**Components:**
1. Weather fetcher (OpenWeatherMap API)
2. Task summary from memory
3. Overnight work report
4. Trend fetcher (optional)

**AC:**
- [ ] Brief sent at configured time
- [ ] Weather included (if API key provided)
- [ ] Tasks summarized from database
- [ ] Formatted nicely for WhatsApp

---

### TASK-010: Wire Up GitHub Write Operations
**[A]** | Est: 1 hour | Deps: TASK-005

Expose code-analyzer.js methods as commands.

**New Commands:**
- `create pr [repo] [title]`
- `create branch [repo] [name]`
- `commit [repo] [file] [message]`
- `create issue [repo] [title]`
- `close issue [repo] #[number]`

**Files to Modify:**
- Import code-analyzer.js in index.js or create github skill

**AC:**
- [ ] All commands work via WhatsApp
- [ ] Error handling for failed operations
- [ ] Confirmation messages returned

---

### TASK-011: Create Research Skill
**[A]** | Est: 1.5 hours | Deps: TASK-004

Add web research capability.

**Files to Create:**
- `02-whatsapp-bot/skills/research/index.js`
- `02-whatsapp-bot/skills/research/brave-search.js`
- `02-whatsapp-bot/skills/research/summarizer.js`

**Methods:**
- Search web via Brave API
- Fetch and extract page content
- Summarize with Claude

**AC:**
- [ ] `research [topic]` returns summary
- [ ] Sources cited
- [ ] Rate limiting respected

---

### TASK-012: Add Help Command
**[A]** | Est: 30 min | Deps: TASK-005

Implement comprehensive help.

**Commands:**
- `help` - All commands
- `help [skill]` - Skill-specific help

**AC:**
- [ ] Lists all available commands
- [ ] Grouped by category/skill
- [ ] Short descriptions for each

---

## Phase 3: Autonomy

### TASK-013: Create Vibe Coder Skill
**[A]** | Est: 3 hours | Deps: TASK-010

Implement code generation workflow.

**Files to Create:**
- `02-whatsapp-bot/skills/vibe-coder/index.js`
- `02-whatsapp-bot/skills/vibe-coder/code-generator.js`
- `02-whatsapp-bot/skills/vibe-coder/pr-workflow.js`

**Workflow:**
1. User describes feature
2. Analyze existing codebase
3. Create branch
4. Generate code with Claude
5. Commit changes
6. Create PR
7. Notify user

**AC:**
- [ ] End-to-end PR creation works
- [ ] Code quality checks included
- [ ] User can review before merge

---

### TASK-014: Create Second Brain Skill
**[A]** | Est: 2 hours | Deps: TASK-002

Implement document management.

**Files to Create:**
- `02-whatsapp-bot/skills/second-brain/index.js`
- `02-whatsapp-bot/skills/second-brain/journal.js`
- `02-whatsapp-bot/skills/second-brain/docs/`

**Features:**
- Daily journal auto-generation
- Note capture
- Document search
- Concept extraction

**AC:**
- [ ] `note [content]` saves note
- [ ] Daily journals created
- [ ] Search returns relevant docs

---

### TASK-015: Create Proactive Task Suggester
**[A]** | Est: 2 hours | Deps: TASK-002, TASK-008

Implement proactive behavior.

**Files to Create:**
- `02-whatsapp-bot/autonomous/task-suggester.js`

**Logic:**
1. Analyze user patterns
2. Identify opportunities
3. Generate suggestions
4. Send proactive messages

**AC:**
- [ ] Suggests relevant tasks
- [ ] Not too frequent (configurable)
- [ ] Can be disabled

---

## Phase 4: Polish

### TASK-016: Add Telegram Support
**[A]** | Est: 2 hours | Deps: TASK-006

Add Telegram as messaging channel.

**Files to Create:**
- `02-whatsapp-bot/channels/telegram.js`
- `02-whatsapp-bot/channels/channel-interface.js`

**AC:**
- [ ] Telegram bot responds to messages
- [ ] Same commands work
- [ ] Rich formatting used

---

### TASK-017: Production Error Handling
**[A]** | Est: 1 hour | Deps: All above

Add comprehensive error handling.

**Changes:**
- Try/catch everywhere
- Retry logic for APIs
- User-friendly error messages
- Error logging

**AC:**
- [ ] No uncaught exceptions
- [ ] Graceful degradation
- [ ] Errors logged with context

---

### TASK-018: Update Documentation
**[A]** | Est: 1 hour | Deps: All above

Update all docs with new features.

**Files to Update:**
- README.md
- CLAUDE.md
- PLAN.md
- SKILLS.md

**AC:**
- [ ] All new commands documented
- [ ] Setup instructions updated
- [ ] Examples included

---

## Human Tasks

### TASK-H01: Obtain API Keys
**[H]** | Est: 30 min

Get required API keys:
- [ ] OpenWeatherMap API key (free)
- [ ] Brave Search API key (free)
- [ ] Verify Anthropic API key works
- [ ] Verify GitHub token has write permissions

---

### TASK-H02: Configure Environment
**[H]** | Est: 15 min

Update `.env.local` with all keys:
- [ ] OPENWEATHER_API_KEY
- [ ] BRAVE_API_KEY
- [ ] Set MORNING_BRIEF_TIME
- [ ] Set TIMEZONE

---

### TASK-H03: Test Deployment
**[H]** | Est: 1 hour

Deploy and verify everything works:
- [ ] Run deploy-to-aws.ps1
- [ ] Verify bot responds on WhatsApp
- [ ] Test all commands
- [ ] Verify morning brief works

---

## Task Dependencies Graph

```
TASK-001 ──┬── TASK-002 ──── TASK-003
           │
           ├── TASK-008 ──┬─ TASK-009
           │              │
TASK-004 ──┼── TASK-005 ──┼─ TASK-006
           │              │
           │              ├─ TASK-010
           │              │
           │              ├─ TASK-011
           │              │
           │              └─ TASK-012
           │
TASK-007 ──┘

TASK-010 ─── TASK-013

TASK-002 ─┬─ TASK-014
          │
          └─ TASK-015

TASK-006 ─── TASK-016

ALL ─────── TASK-017 ─── TASK-018
```

---

## Parallel Execution Plan

**Batch 1 (Can run simultaneously):**
- TASK-001: Database schema
- TASK-004: Base skill class
- TASK-007: Install dependencies

**Batch 2 (After Batch 1):**
- TASK-002: Memory manager
- TASK-005: Skill registry

**Batch 3 (After Batch 2):**
- TASK-003: Integrate memory with AI
- TASK-006: Update index.js
- TASK-008: Scheduler module

**Batch 4 (After Batch 3):**
- TASK-009: Morning brief
- TASK-010: GitHub write ops
- TASK-011: Research skill
- TASK-012: Help command

**Batch 5 (After Batch 4):**
- TASK-013: Vibe coder
- TASK-014: Second brain
- TASK-015: Task suggester

**Batch 6 (After all):**
- TASK-016: Telegram
- TASK-017: Error handling
- TASK-018: Documentation

---

*Last Updated: 2026-01-31*
*Total Estimated Time: 22-28 hours*
