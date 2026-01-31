# SKILLS.md - ClawdBot Skills Registry

## Overview

Skills are modular capabilities that extend ClawdBot's functionality. Each skill:
- Has its own directory under `skills/`
- Exports a standard interface
- Can have its own dependencies
- Is registered in the skill registry

---

## Skill Architecture

```
skills/
├── skill-loader.js          # Discovers and loads skills
├── skill-registry.js        # Command routing
├── base-skill.js            # Base class template
├── skills.json              # Configuration
│
├── memory/                  # Memory & persistence
│   ├── index.js
│   ├── memory-manager.js
│   └── schema.sql
│
├── github/                  # GitHub operations
│   ├── index.js
│   ├── pr-manager.js
│   ├── branch-manager.js
│   └── issue-manager.js
│
├── morning-brief/           # Daily morning brief
│   ├── index.js
│   ├── weather.js
│   ├── task-summary.js
│   └── templates/
│
├── research/                # Web research
│   ├── index.js
│   ├── brave-search.js
│   └── summarizer.js
│
├── vibe-coder/              # Code generation
│   ├── index.js
│   ├── claude-code.js
│   └── pr-workflow.js
│
├── second-brain/            # Document management
│   ├── index.js
│   ├── journal.js
│   ├── concepts.js
│   └── templates/
│
├── scheduler/               # Task scheduling
│   ├── index.js
│   ├── cron-manager.js
│   └── task-queue.js
│
└── email/                   # Email integration
    ├── index.js
    ├── gmail-client.js
    └── templates/
```

---

## Core Skills

### 1. Memory Skill
**Priority:** CRITICAL | **Status:** ⬜ Not Started

**Purpose:** Persistent storage and learning

**Commands:**
| Command | Description |
|---------|-------------|
| `remember [fact]` | Store a fact about user |
| `what do you know about me` | List stored facts |
| `forget [topic]` | Remove facts about topic |
| `search memory [query]` | Search conversation history |

**Technical:**
- SQLite database
- Tables: conversations, facts, tasks
- Semantic search with embeddings (future)

**Implementation:**
```javascript
class MemorySkill extends BaseSkill {
  name = 'memory'
  commands = ['remember', 'recall', 'forget', 'search memory']

  async remember(fact) {
    await this.db.insertFact(this.userId, fact)
    return `Got it! I'll remember: "${fact}"`
  }
}
```

---

### 2. GitHub Skill (Full)
**Priority:** HIGH | **Status:** 🟡 Partial (read-only exists)

**Purpose:** Complete GitHub operations

**Commands:**
| Command | Description |
|---------|-------------|
| `list repos` | List monitored repositories |
| `analyze [repo]` | Get repo stats and issues |
| `create pr [repo] [title]` | Create pull request |
| `create branch [repo] [name]` | Create new branch |
| `commit [repo] [file] [msg]` | Commit a file change |
| `create issue [repo] [title]` | Create new issue |
| `close issue [repo] #[n]` | Close an issue |
| `merge pr [repo] #[n]` | Merge pull request |

**Technical:**
- Uses Octokit (already installed)
- code-analyzer.js has most methods
- Need to wire up to WhatsApp commands

---

### 3. Morning Brief Skill
**Priority:** HIGH | **Status:** ⬜ Not Started

**Purpose:** Daily morning summary

**Commands:**
| Command | Description |
|---------|-------------|
| `morning brief` | Trigger manual brief |
| `set brief time [HH:MM]` | Change brief time |
| `brief settings` | View/edit brief config |

**Brief Contents:**
1. Weather for user's location
2. Task summary for today
3. What ClawdBot did overnight
4. Trending topics in user's interests
5. Recommended actions for today

**APIs Required:**
- OpenWeatherMap (free tier)
- Brave Search (free tier)

**Template:**
```
☀️ Good morning! Here's your brief:

📍 WEATHER
London: 12°C, Partly Cloudy

📋 TODAY'S TASKS
• Review PR #42 in armora
• Finish user auth feature
• Deploy staging

🌙 OVERNIGHT WORK
• Created draft PR for bug fix
• Researched Redis caching options

💡 SUGGESTIONS
• Matthew Berman posted ClawdBot video
• New Claude API feature released

Have a great day! 🚀
```

---

### 4. Research Skill
**Priority:** HIGH | **Status:** ⬜ Not Started

**Purpose:** Web research and summarization

**Commands:**
| Command | Description |
|---------|-------------|
| `research [topic]` | Research and summarize |
| `trending [category]` | Get trending topics |
| `summarize [url]` | Summarize webpage |
| `compare [a] vs [b]` | Compare two topics |

**Technical:**
- Brave Search API for web search
- Puppeteer for page content
- Claude for summarization

---

### 5. Scheduler Skill
**Priority:** HIGH | **Status:** ⬜ Not Started

**Purpose:** Schedule tasks and reminders

**Commands:**
| Command | Description |
|---------|-------------|
| `schedule [task] at [time]` | Schedule one-time task |
| `schedule [task] every [interval]` | Schedule recurring |
| `list scheduled` | Show all scheduled tasks |
| `cancel schedule [id]` | Cancel a scheduled task |
| `remind me [msg] at [time]` | Set reminder |

**Technical:**
- node-cron for scheduling
- SQLite for persistence
- Timezone support

---

### 6. Vibe Coder Skill
**Priority:** HIGH | **Status:** ⬜ Not Started

**Purpose:** Autonomous code generation

**Commands:**
| Command | Description |
|---------|-------------|
| `build [description]` | Create new feature |
| `fix [issue description]` | Fix a bug |
| `refactor [file/area]` | Improve code |
| `add tests for [file]` | Generate tests |
| `tonight, build [feature]` | Queue overnight work |

**Workflow:**
1. User describes feature
2. ClawdBot analyzes codebase
3. Creates branch
4. Generates code (via Claude)
5. Creates PR
6. Notifies user for review

**Technical:**
- Claude with tool use
- Git operations
- Code execution sandbox
- PR workflow

---

### 7. Second Brain Skill
**Priority:** MEDIUM | **Status:** ⬜ Not Started

**Purpose:** Knowledge management

**Commands:**
| Command | Description |
|---------|-------------|
| `note [content]` | Quick capture note |
| `journal` | View today's journal |
| `search notes [query]` | Search documents |
| `summarize week` | Weekly summary |

**Document Types:**
- Daily journals (auto-generated)
- Concept deep-dives
- Meeting notes
- Research reports
- Code documentation

**Technical:**
- Markdown files in `second-brain/docs/`
- SQLite index for search
- Auto-tagging with Claude

---

### 8. Email Skill
**Priority:** MEDIUM | **Status:** ⬜ Not Started

**Purpose:** Email management

**Commands:**
| Command | Description |
|---------|-------------|
| `check email` | Summarize unread emails |
| `email summary` | Daily email digest |
| `draft email to [person]` | Draft an email |
| `send email [id]` | Send drafted email |

**Technical:**
- Gmail API
- OAuth2 authentication
- Template system

---

## Skill Interface

### Base Skill Class

```javascript
// skills/base-skill.js
class BaseSkill {
  name = 'unnamed'
  description = ''
  commands = []

  constructor(context) {
    this.db = context.db
    this.ai = context.ai
    this.config = context.config
  }

  // Return true if this skill handles the command
  canHandle(command) {
    return this.commands.some(c =>
      command.toLowerCase().startsWith(c.toLowerCase())
    )
  }

  // Process the command
  async execute(command, context) {
    throw new Error('execute() must be implemented')
  }

  // Called when skill is loaded
  async initialize() {}

  // Called when skill is unloaded
  async shutdown() {}
}

module.exports = BaseSkill
```

### Skill Registration

```javascript
// skills/skill-registry.js
class SkillRegistry {
  skills = new Map()

  register(skill) {
    this.skills.set(skill.name, skill)
    console.log(`Registered skill: ${skill.name}`)
  }

  async route(command, context) {
    for (const [name, skill] of this.skills) {
      if (skill.canHandle(command)) {
        return await skill.execute(command, context)
      }
    }
    // Fallback to AI
    return null
  }
}
```

---

## Skills Configuration

```json
// skills/skills.json
{
  "enabled": [
    "memory",
    "github",
    "morning-brief",
    "scheduler",
    "research"
  ],
  "disabled": [
    "email",
    "calendar"
  ],
  "config": {
    "memory": {
      "maxConversations": 1000,
      "maxFacts": 500
    },
    "morning-brief": {
      "time": "08:00",
      "timezone": "Europe/London",
      "includeWeather": true,
      "includeNews": true
    },
    "scheduler": {
      "timezone": "Europe/London"
    }
  }
}
```

---

## Third-Party Skills (Future)

The transcript mentions a skills marketplace. We could support:

| Skill | Source | Purpose |
|-------|--------|---------|
| Things 3 | Apple | Mac todo list integration |
| Notion | API | Notion workspace management |
| Linear | API | Project management |
| Slack | API | Slack notifications |
| X/Twitter | API | Social media monitoring |
| Last30Days | @mattvanhorn | Reddit/X trend research |

---

## Implementation Priority

1. **Memory** - Foundation for everything
2. **GitHub Full** - Already partially built
3. **Morning Brief** - High user value
4. **Scheduler** - Enables proactive features
5. **Research** - Extends capabilities
6. **Vibe Coder** - The killer feature
7. **Second Brain** - Knowledge management
8. **Email** - Nice to have

---

*Last Updated: 2026-01-31*
