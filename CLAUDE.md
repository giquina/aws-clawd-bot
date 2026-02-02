# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawdBot v2.3 is a WhatsApp-controlled **Claude Code Agent** running 24/7 on AWS EC2. It's a full development assistant you control via WhatsApp - read any repo, parse TODOs, deploy code, run tests, and get proactive morning reports. Includes multi-AI routing (Groq FREE, Claude Opus/Sonnet, Grok) and an autonomous agent system for nightly task execution.

**Live Server:** `16.171.150.151:3000` (eu-north-1)

## Commands

```bash
# Development
cd 02-whatsapp-bot && npm install
npm run dev                    # Development with nodemon auto-reload
npm start                      # Production mode
curl localhost:3000/health     # Health check

# Security
npm run audit                  # Check for vulnerabilities
npm run audit:fix              # Auto-fix vulnerabilities

# Deploy to AWS EC2 (quick)
scp -i ~/.ssh/clawd-bot-key.pem 02-whatsapp-bot/index.js ubuntu@16.171.150.151:/opt/clawd-bot/02-whatsapp-bot/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 restart clawd-bot"

# Deploy to AWS EC2 (full)
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' .
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && pm2 restart clawd-bot"

# SSH to EC2 (if permission denied, push key first)
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-009f070a76a0d91c1 \
  --instance-os-user ubuntu \
  --ssh-public-key file://~/.ssh/clawd-bot-key.pem.pub \
  --region eu-north-1

# View EC2 logs
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 50"
```

## API Endpoints

### WhatsApp/GitHub Webhooks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Twilio WhatsApp webhook (incoming messages) |
| `/github-webhook` | POST | GitHub webhook (events: push, PR, issues) |
| `/health` | GET | Health check and status information |

### Voice Calling (Twilio Voice)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/voice/outbound` | POST | TwiML for outbound calls |
| `/voice/response` | POST | Speech recognition handler |
| `/voice/status` | POST | Call status callbacks |

### REST API (for MCP Server & Claude Code App)
All API endpoints require `X-API-Key` header with `CLAWDBOT_API_KEY` value.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Bot status, uptime, features |
| `/api/message` | POST | Send message & get response (like WhatsApp) |
| `/api/projects` | GET | List all GitHub repos |
| `/api/project/:repo/status` | GET | Get TODO.md tasks for a repo |
| `/api/project/:repo/deploy` | POST | Trigger deployment |
| `/api/project/:repo/command` | POST | Run whitelisted command |
| `/api/memory` | GET | Get conversation history & facts |
| `/api/whatsapp/send` | POST | Send WhatsApp message directly |
| `/api/skills` | GET | List all available skills |

## MCP Server (Claude Code App Integration)

ClawdBot includes an MCP server that lets you control it from Claude Desktop, Claude Code App, or any MCP client.

### Setup

1. Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "node",
      "args": ["C:/Giquina-Projects/aws-clawd-bot/02-whatsapp-bot/mcp-server/index.js"],
      "env": {
        "CLAWDBOT_URL": "http://16.171.150.151:3000",
        "CLAWDBOT_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `clawdbot_status` | Get bot status, uptime, features |
| `clawdbot_message` | Send message & get response (like WhatsApp) |
| `clawdbot_projects` | List all GitHub repos |
| `clawdbot_project_status` | Get TODO.md tasks for a repo |
| `clawdbot_deploy` | Trigger deployment |
| `clawdbot_command` | Run whitelisted commands (tests, build, logs) |
| `clawdbot_memory` | Get conversation history & facts |
| `clawdbot_whatsapp` | Send WhatsApp message directly |
| `clawdbot_skills` | List all available skills |

### Multi-Client Architecture
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  WhatsApp       │     │  Claude Desktop │     │  Claude Code    │
│  (Mobile)       │     │  (Desktop)      │     │  CLI            │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Twilio               │ MCP                   │ (local)
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ↓
                  ┌──────────────────────────┐
                  │   ClawdBot (AWS EC2)     │
                  │   24/7 Always On         │
                  │                          │
                  │   • Shared memory        │
                  │   • Project context      │
                  │   • GitHub access        │
                  │   • Command execution    │
                  └──────────────────────────┘
```

## Architecture

```
WhatsApp → Twilio → Express (index.js) → Hooks → Skills Router (30 skills)
                                           ↓
                    ┌──────────────────────┼──────────────────────┐
                    ↓                      ↓                      ↓
              Smart Router           Error Alerter          Skill Registry
              (NLP → cmds)          (crash alerts)         (command routing)
                                           ↓
                                    AI Provider Router
                    ┌──────────────────────┼──────────────────────┐
                    ↓                      ↓                      ↓
              Groq (FREE)           Claude (Tiered)         Grok (xAI)
              Simple queries        Opus=Brain              Social/X search
              Greetings            Sonnet=Coder             Real-time trends
              Whisper (voice)

Scheduler (node-cron) → Jobs
                          ├── morning-brief.js      Daily briefings
                          ├── proactive-alerts.js   Alert system
                          └── nightly-autonomous.js Autonomous agent
                                      ↓
                            Autonomous System
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
             project-scanner  task-executor  morning-report
```

## Multi-AI Architecture

ClawdBot uses smart AI routing to minimize costs:

| Provider | Model | Cost | Best For |
|----------|-------|------|----------|
| Groq | LLaMA 3.3 70B | **FREE** | Simple queries, greetings |
| Groq | Whisper | **FREE** | Voice transcription |
| Claude | Opus 4.5 | $$$ | Planning, strategy (THE BRAIN) |
| Claude | Sonnet 4 | $$ | Coding, implementation (THE CODER) |
| Grok | grok-3-fast | $ | Social/X/Twitter searches |

**Routing Logic:**
- Greetings, short queries → Groq (FREE)
- "plan", "strategy", "which approach" → Claude Opus
- Code, debugging, analysis → Claude Sonnet
- "trending", "twitter", "X search" → Grok

**Commands:**
- `ai mode economy` - Use FREE Groq for everything
- `ai mode quality` - Use Claude for everything
- `ai mode balanced` - Smart routing (default)
- `ai stats` - View usage and savings

**Request Flow:**
1. Twilio sends POST to `/webhook` with WhatsApp message
2. `hooks/smart-router.js` converts natural language to commands
3. `skills/skill-registry.js` routes to appropriate skill by priority (higher = first)
4. Skill executes and returns response
5. Response sent back via Twilio

**Key Design Patterns:**
- Skills extend `BaseSkill` class with `name`, `commands[]`, `priority`, `execute()`
- Skills are auto-loaded from `skills/<name>/index.js`
- New skills MUST be added to `skills/skills.json` enabled array
- AI handler dynamically generates skill docs from registry (no manual updates needed)
- Hooks run before skills for preprocessing
- `canHandle(command, context)` receives optional `context.mediaUrl` for media messages
- Skills return `this.success(message)` or `this.error(message)` responses

## Key Files

| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Express server, webhook handlers |
| `02-whatsapp-bot/ai-handler.js` | Multi-AI router, project context, system prompt |
| `02-whatsapp-bot/ai-providers/index.js` | AI provider registry |
| `02-whatsapp-bot/ai-providers/router.js` | Smart query classification |
| `02-whatsapp-bot/ai-providers/groq-handler.js` | Groq LLM + Whisper (FREE) |
| `02-whatsapp-bot/ai-providers/claude-handler.js` | Claude Opus/Sonnet |
| `02-whatsapp-bot/ai-providers/grok-handler.js` | Grok xAI (social) |
| `02-whatsapp-bot/skills/skill-registry.js` | Skill routing, dynamic docs |
| `02-whatsapp-bot/skills/skills.json` | Enabled skills config |
| `02-whatsapp-bot/skills/project-context/index.js` | Project awareness, TODO parsing |
| `02-whatsapp-bot/skills/remote-exec/index.js` | Safe EC2 command execution |
| `02-whatsapp-bot/lib/project-manager.js` | GitHub file fetching, caching |
| `02-whatsapp-bot/lib/todo-parser.js` | TODO.md parsing |
| `02-whatsapp-bot/lib/active-project.js` | Per-user project context |
| `02-whatsapp-bot/lib/command-whitelist.js` | Security for remote exec |
| `02-whatsapp-bot/hooks/smart-router.js` | NLP → command conversion |
| `02-whatsapp-bot/autonomous/index.js` | Autonomous agent orchestrator |
| `02-whatsapp-bot/autonomous/morning-report.js` | Enhanced morning reports with TODO |
| `02-whatsapp-bot/autonomous/task-executor.js` | Executes queued tasks |
| `02-whatsapp-bot/autonomous/project-scanner.js` | Scans projects for issues |
| `02-whatsapp-bot/scheduler/jobs/nightly-autonomous.js` | Triggers autonomous runs |
| `02-whatsapp-bot/github-webhook.js` | GitHub event formatter |
| `02-whatsapp-bot/lib/project-intelligence.js` | The brain - project routing |
| `02-whatsapp-bot/lib/intent-classifier.js` | AI intent understanding |
| `02-whatsapp-bot/lib/action-executor.js` | Auto-execution with 7 handlers |
| `02-whatsapp-bot/lib/confirmation-manager.js` | Safe action confirmations |
| `02-whatsapp-bot/lib/actions/code-generator.js` | Creates branches + PRs |
| `02-whatsapp-bot/lib/actions/receipt-processor.js` | Claude Vision receipts |
| `02-whatsapp-bot/mcp-server/index.js` | MCP server for Claude Desktop/App |
| `02-whatsapp-bot/mcp-server/README.md` | MCP setup documentation |
| `02-whatsapp-bot/voice-handler.js` | Twilio Voice calling handler |
| `02-whatsapp-bot/skills/voice-call/index.js` | Voice call skill (commands) |
| `config/project-registry.json` | 16 projects with capabilities |
| `config/.env.local` | Environment variables (never modify via code) |

## Environment Variables

Required for multi-AI:
```
GROQ_API_KEY=gsk_...        # FREE - get from console.groq.com
ANTHROPIC_API_KEY=sk-...    # Claude - required
XAI_API_KEY=xai-...         # Grok - optional, for social search
CLAWDBOT_API_KEY=...        # API key for MCP/REST API access
```

Required for voice calling:
```
TWILIO_PHONE_NUMBER=+1...   # Twilio voice-enabled phone number
YOUR_PHONE_NUMBER=+44...    # Your phone number (recipient)
BASE_URL=http://...         # Public URL for voice webhooks
```

## Adding a New Skill

1. Create `skills/<skillname>/index.js`:
```javascript
const BaseSkill = require('../base-skill');

class MySkill extends BaseSkill {
  name = 'myskill';
  description = 'What it does';
  priority = 20;  // Higher = matched first

  commands = [
    { pattern: /^mycommand$/i, description: 'Does X', usage: 'mycommand' }
  ];

  async execute(command, context) {
    return this.success('Response text');
  }
}
module.exports = MySkill;
```

2. Add to `skills/skills.json` enabled array
3. Deploy and restart

## Giquina Group Companies

Used by accountancy skills (deadlines, governance, intercompany):

| Code | Company | CH Number |
|------|---------|-----------|
| GMH | Giquina Management Holdings Ltd | 15425137 |
| GACC | Giquina Accountancy Ltd | 16396650 |
| GCAP | Giquina Capital Ltd | 16360342 |
| GQCARS | GQ Cars Ltd | 15389347 |
| GSPV | Giquina Structured Asset SPV Ltd | 16369465 |

## Claude Code Agent System (v2.3)

The bot functions as a full Claude Code agent controllable via WhatsApp:

### Project Context Skill (`skills/project-context/`)
```
my repos                    → List ALL your GitHub repos
switch to <repo>            → Set active project context
project status [repo]       → Show TODO.md tasks
what's left [repo]          → Incomplete tasks summary
readme [repo]               → README summary
files [repo]                → List key project files
```

### Remote Exec Skill (`skills/remote-exec/`)
```
deploy <repo>               → Deploy with confirmation
run tests <repo>            → npm test
logs <repo>                 → PM2 logs
restart <repo>              → pm2 restart
build <repo>                → npm run build
remote status               → Show all PM2 processes
remote commands             → List allowed commands
```

### Voice Call Skill (`skills/voice-call/`)
```
call me                     → Call immediately with greeting
call me about <message>     → Call with specific message
call me at HH:MM            → Schedule call for specific time
call me in X minutes/hours  → Schedule call with delay
hang up                     → End active call
urgent call <message>       → Make urgent call
voice status                → Show voice configuration
voice voices                → List available TTS voices
voice set voice <name>      → Set default voice (amy, brian, etc.)
```

**Available Voices:** amy (British female, default), brian (British male), emma (British female), joanna (American female), matthew (American male), salli, ivy, kendra, kimberly, joey

### Lib Utilities (`lib/`)
| File | Purpose |
|------|---------|
| `project-manager.js` | GitHub file fetching with 60-min cache |
| `todo-parser.js` | Parses TODO.md (⬜🟡✅ + checkboxes) |
| `active-project.js` | Per-user project context (2hr expiry) |
| `command-whitelist.js` | Security controls for remote exec |

### Auto-Execution Layer (`lib/`)

The bot can automatically execute actions from voice/text commands:

| Handler | Trigger | What It Does |
|---------|---------|--------------|
| `create-page` | "create a homepage for X" | Generates code + PR |
| `create-feature` | "add login to X" | Generates feature code + PR |
| `process-receipt` | Send image | Extracts data via Claude Vision |
| `deploy` | "deploy X" | Runs deploy script (with confirmation) |
| `check-status` | "status of X" | Shows project TODO.md |
| `create-task` | "add task to X" | Creates GitHub issue |
| `code-task` | "fix bug in X" | AI analyzes + creates fix PR |

**Key Files:**
| File | Purpose |
|------|---------|
| `lib/project-intelligence.js` | The brain - routes to correct project |
| `lib/intent-classifier.js` | AI understands "file my taxes" |
| `lib/action-executor.js` | Executes actions with 7 handlers |
| `lib/confirmation-manager.js` | Asks before risky actions |
| `lib/actions/code-generator.js` | Creates branches + PRs |
| `lib/actions/receipt-processor.js` | Claude Vision receipt extraction |
| `config/project-registry.json` | Maps 16 repos with capabilities |

### GitHub Webhooks (Real-time Alerts)

Endpoint: `POST /github-webhook`

| Event | WhatsApp Alert |
|-------|----------------|
| `workflow_run` (failed) | "⚠️ [repo] CI failed on main" |
| `pull_request` (opened) | "[repo] PR opened #42: Title" |
| `issues` (opened) | "[repo] Issue opened #10: Bug report" |
| `push` | "[repo] Push: 3 commits to main" |
| `release` | "[repo] Release published: v1.2.3" |

**Setup:** Configure each GitHub repo's webhook to POST to `http://16.171.150.151:3000/github-webhook`

### Natural Language (voice-friendly)
The smart router handles casual speech:
- "what's left on judo" → `project status judo`
- "deploy clawd to production" → `deploy aws-clawd-bot`
- "what should I work on" → `project status` (uses active project)
- "file my taxes for GQCARS" → routes to accountancy project
- "create a contact page for LusoTown" → generates code + PR

## Skill Categories

| Category | Skills |
|----------|--------|
| **Core** | help, memory, tasks, reminders |
| **Claude Code Agent** | project-context, remote-exec |
| **GitHub** | github, coder, review, stats, actions, multi-repo, project-creator |
| **Accountancy** | deadlines, companies, governance, intercompany, receipts, moltbook |
| **Media** | image-analysis, voice, voice-call, video, files |
| **Scheduling** | morning-brief, digest, overnight |
| **Research** | research, vercel |
| **Config** | ai-settings, autonomous-config |

## Important Notes

- **WhatsApp message limit:** ~4000 characters max (truncated automatically)
- **Skill priority:** Higher number = checked first (help=100, github=10)
- **Authorization:** Only `YOUR_WHATSAPP` env var number can control the bot
- **Skills auto-document:** AI handler reads from registry via `generateSkillDocs()`
- **Voice messages:** Automatically transcribed via Groq Whisper (FREE)
- **Autonomous mode:** Runs nightly, configurable via `autonomous-config` skill
