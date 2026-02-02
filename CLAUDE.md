# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawdBot v2.3 is a **Claude Code Agent** running 24/7 on AWS EC2, controllable via **Telegram (primary)**, WhatsApp (backup), or **Voice calls (critical)**. It's a full development assistant - read any repo, parse TODOs, deploy code, run tests, and get proactive morning reports. Includes multi-AI routing (Groq FREE, Claude Opus/Sonnet, Grok), an autonomous agent system for nightly task execution, and smart alert escalation with voice calling for emergencies.

**Platform Priority:** Telegram for all proactive messages. WhatsApp for critical alerts as backup. Voice calls for emergencies and unacknowledged critical alerts.

**Live Server:** `16.171.150.151:3000` (eu-north-1)

## Multi-Platform Architecture

ClawdBot supports three communication channels with automatic routing:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Telegram     │     │    WhatsApp     │     │     Voice       │
│   (Primary)     │     │    (Backup)     │     │   (Critical)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ Bot API              │ Twilio                │ Twilio Voice
         └──────────────────────┼───────────────────────┘
                                ↓
              ┌──────────────────────────────────┐
              │       Messaging Platform         │
              │    (lib/messaging-platform.js)   │
              │                                  │
              │  • Message normalization         │
              │  • Platform-specific formatting  │
              │  • Character limit handling      │
              │  • Media type support           │
              └──────────────────────────────────┘
                                ↓
              ┌──────────────────────────────────┐
              │         Chat Registry            │
              │     (lib/chat-registry.js)       │
              │                                  │
              │  • Per-chat context (repo/HQ)   │
              │  • Notification levels          │
              │  • Auto-routing for alerts      │
              └──────────────────────────────────┘
```

**Platform Behavior:**
| Scenario | Platform Used |
|----------|---------------|
| User messages via Telegram | Reply via Telegram |
| User messages via WhatsApp | Reply via WhatsApp |
| Proactive messages (briefs, digests) | Telegram only |
| Critical alerts (CI failure) | Telegram + WhatsApp |
| Emergency/Unacknowledged alerts | Voice call |

**Platform Limits:**
| Platform | Max Message | Markdown | Inline Buttons |
|----------|-------------|----------|----------------|
| Telegram | 4096 chars | Yes | Yes |
| WhatsApp | ~1600 chars | Limited | No |
| Voice | N/A (TTS) | No | No |

## Commands

```bash
# Development
cd 02-whatsapp-bot && npm install
npm run dev                    # Development with nodemon auto-reload
npm start                      # Production mode
curl localhost:3000/health     # Health check

# Testing
npm test                       # Run bot tests

# Security
npm run audit                  # Check for vulnerabilities
npm run audit:fix              # Auto-fix vulnerabilities
npm run security-check         # Audit with high severity threshold

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

### Platform Webhooks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Twilio WhatsApp webhook (incoming messages) |
| `/telegram` | POST | Telegram bot webhook (incoming messages) |
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

## Voice Features

ClawdBot supports voice in multiple ways:

### Inbound Voice Notes (Telegram/WhatsApp)
Send voice messages to ClawdBot - they're automatically transcribed via Groq Whisper (FREE) and processed as text commands.

### Outbound Voice Calls (Twilio)
ClawdBot can call you for alerts, urgent notifications, or on-demand.

**Voice Call Skill Commands (`skills/voice-call/`):**
```
call me                     → Call immediately with greeting
call me about <message>     → Call with specific message
call me at HH:MM            → Schedule call for specific time
call me in X minutes/hours  → Schedule call with delay
hang up                     → End active call
urgent call <message>       → Make urgent call (bypasses DND)
voice status                → Show voice configuration
voice voices                → List available TTS voices
voice set voice <name>      → Set default voice
```

**Available TTS Voices (Polly):**
| Voice | Description |
|-------|-------------|
| amy | British female (default) |
| brian | British male |
| emma | British female |
| joanna | American female |
| matthew | American male |
| salli, ivy, kendra, kimberly, joey | American variants |

**Auto-Call Triggers:**
| Trigger | When | Example |
|---------|------|---------|
| Unacknowledged critical alert | 30 min after WhatsApp | CI failure on main |
| Emergency alert | Immediate | Server down |
| Deadline in 1 hour | Immediate | Companies House filing |
| Deadline missed | Immediate | VAT return overdue |

## Action Control System

ClawdBot uses a propose-confirm-execute model for actions with override capabilities.

### Action Lifecycle
```
User Request → proposeAction() → [PENDING]
                                    ↓
                            User says "yes"
                                    ↓
                            executeAction() → [EXECUTING]
                                    ↓
                            [COMPLETED] → History (for undo)
```

### Override Commands (`skills/action-control/`)
| Command | Description | When Available |
|---------|-------------|----------------|
| `undo` | Reverse the last action | After completed reversible action |
| `stop` / `cancel` | Cancel current/pending action | While action is pending/executing |
| `pause` | Pause current action | While executing |
| `resume` | Resume paused action | After pause |
| `explain` | Get details about pending action | While action is pending |
| `change approach` | Suggest alternatives | While action is pending |
| `yes` / `confirm` | Confirm pending action | While action is pending |
| `no` / `reject` | Reject pending action | While action is pending |
| `action status` | Show all action states | Any time |

### Confidence Thresholds
| Threshold | Value | Behavior |
|-----------|-------|----------|
| AUTO_EXECUTE | 95%+ | Execute immediately (low risk only) |
| CONFIRM_REQUIRED | 70-95% | Ask for confirmation |
| CLARIFY_REQUIRED | 50-70% | Ask clarifying questions |
| REJECT | <50% | Ask user to rephrase |

### Reversible Actions
| Action Type | Can Undo? | Undo Steps |
|-------------|-----------|------------|
| deploy | Yes | Rollback to previous version |
| create-page | Yes | Delete branch, close PR |
| create-feature | Yes | Delete branch, close PR |
| create-task | Yes | Close issue |
| git_commit | Yes | Revert commit |
| delete operations | No | N/A |

## Alert Escalation System

ClawdBot includes automatic multi-tier alert escalation:

### Escalation Flow
```
Alert Created
     ↓
[Telegram] ← Immediate
     ↓
(15 min, no ack)
     ↓
[WhatsApp] ← Escalation 1
     ↓
(30 min, no ack)
     ↓
[Voice Call] ← Escalation 2 (final)
```

### Alert Levels
| Level | Behavior | Example Triggers |
|-------|----------|------------------|
| INFO | Telegram only, no escalation | Deadline in 7 days, PR needs review |
| WARNING | Telegram → WhatsApp | CI failure on feature branch, anomaly detected |
| CRITICAL | Full escalation to voice | CI failure on main, deadline in 24h, payment failed |
| EMERGENCY | Immediate voice call | Server down, deadline in 1h, security alert |

### Predefined Triggers
| Trigger | Level | Auto-triggered By |
|---------|-------|-------------------|
| `CI_FAILURE_MAIN` | CRITICAL | GitHub webhook (main branch) |
| `CI_FAILURE_OTHER` | WARNING | GitHub webhook (feature branch) |
| `DEPLOY_FAILURE` | CRITICAL | Deploy script |
| `SERVER_DOWN` | EMERGENCY | Health check job |
| `SERVER_HIGH_CPU` | WARNING | Monitoring job |
| `DEADLINE_7D` | INFO | Deadline check job |
| `DEADLINE_24H` | CRITICAL | Deadline check job |
| `DEADLINE_1H` | EMERGENCY | Deadline check job |
| `DEADLINE_MISSED` | EMERGENCY | Deadline check job |
| `SECURITY_ALERT` | EMERGENCY | GitHub security advisory |
| `PAYMENT_FAILED` | CRITICAL | Payment processor |
| `ERROR_SPIKE` | CRITICAL | Error monitoring |

### Do Not Disturb
- Default hours: 23:00 - 07:00
- EMERGENCY and CRITICAL alerts bypass DND (configurable)
- DND prevents voice calls only (Telegram/WhatsApp still sent)

### Acknowledging Alerts
Reply `ack <alert-id>` (last 6 chars shown in alert) to stop escalation.

## Chat Registry System

Register chats for automatic context and targeted notifications.

### Registration Commands (`skills/chat-management/`)
```
register chat for <repo>           → Repository-focused chat
register chat for company <code>   → Company-focused chat (GMH, GACC, etc.)
register chat as hq                → Cross-repo HQ access
unregister chat                    → Remove registration
context                            → Show current chat context
list chats                         → List all registered chats
set notifications <level>          → all | critical | digest
chat stats                         → Registration statistics
```

### Context Types
| Type | Description | Notifications |
|------|-------------|---------------|
| HQ | Cross-repo access, receives all alerts | All events from all repos |
| Repo | Single repository focus | Only events for that repo |
| Company | Company-focused (Giquina Group) | Deadline/filing reminders |

### Notification Levels
| Level | Description |
|-------|-------------|
| `all` | Every notification (default) |
| `critical` | Only failures, errors, urgent items |
| `digest` | Daily summary only |

### Auto-Context Benefits
When a chat is registered for a repo:
- No need to say "switch to <repo>" - commands auto-target the registered repo
- GitHub webhooks route to the correct chat
- "project status" shows that repo automatically

## HQ Commands (`skills/hq-commands/`)

Cross-repository commands for HQ-registered chats:

```
urgent / what's urgent      → Most urgent task across ALL repos
all projects                → Summary of all projects
search tasks <keyword>      → Search tasks across repos
global brief                → Aggregated morning brief
completion rate             → Overall completion stats
urgent items                → CI failures, stale PRs, urgent tasks
switch to hq                → Enter HQ mode
switch to repo <name>       → Focus on specific repo
hq status                   → Show HQ channel status
```

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
│   Telegram      │     │  Claude Desktop │     │  Claude Code    │
│   (Primary)     │     │  (Desktop)      │     │  CLI            │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Bot API              │ MCP                   │ (local)
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
                  │   • Voice calling        │
                  └──────────────────────────┘
```

## Architecture

```
Telegram/WhatsApp → Express (index.js) → Hooks → Skills Router (35+ skills)
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
                          ├── deadline-check.js     Hourly deadline check
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
| Perplexity | sonar | $$ | Deep research with citations |

**Routing Logic:**
- Greetings, short queries → Groq (FREE)
- "plan", "strategy", "which approach" → Claude Opus
- Code, debugging, analysis → Claude Sonnet
- "trending", "twitter", "X search" → Grok
- Deep research with sources → Perplexity

**Commands:**
- `ai mode economy` - Use FREE Groq for everything
- `ai mode quality` - Use Claude for everything
- `ai mode balanced` - Smart routing (default)
- `ai stats` - View usage and savings

**Request Flow:**
1. Webhook receives message (Telegram/WhatsApp)
2. `messaging-platform.js` normalizes message format
3. `hooks/smart-router.js` converts natural language to commands
4. `skills/skill-registry.js` routes to appropriate skill by priority
5. Skill executes and returns response
6. Response sent back via same platform

**Key Design Patterns:**
- Skills extend `BaseSkill` class with `name`, `commands[]`, `priority`, `execute()`
- Skills are auto-loaded from `skills/<name>/index.js`
- New skills MUST be added to `skills/skills.json` enabled array
- AI handler dynamically generates skill docs from registry (no manual updates needed)
- Hooks run before skills for preprocessing
- `canHandle(command, context)` receives optional `context.mediaUrl` for media messages
- Skills return `this.success(message)` or `this.error(message)` responses

## Key Files

### Core Handlers
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Express server, webhook handlers |
| `02-whatsapp-bot/ai-handler.js` | Multi-AI router, project context, system prompt |
| `02-whatsapp-bot/telegram-handler.js` | Telegram Bot API integration |
| `02-whatsapp-bot/voice-handler.js` | Twilio Voice calling handler |
| `02-whatsapp-bot/github-webhook.js` | GitHub event formatter |

### AI Providers
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/ai-providers/index.js` | AI provider registry |
| `02-whatsapp-bot/ai-providers/router.js` | Smart query classification |
| `02-whatsapp-bot/ai-providers/groq-handler.js` | Groq LLM + Whisper (FREE) |
| `02-whatsapp-bot/ai-providers/claude-handler.js` | Claude Opus/Sonnet |
| `02-whatsapp-bot/ai-providers/grok-handler.js` | Grok xAI (social) |

### Libraries
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/lib/messaging-platform.js` | Multi-platform abstraction layer |
| `02-whatsapp-bot/lib/chat-registry.js` | Chat context registration and routing |
| `02-whatsapp-bot/lib/action-controller.js` | Action lifecycle: propose -> confirm -> execute -> undo |
| `02-whatsapp-bot/lib/alert-escalation.js` | Multi-tier alert escalation (Telegram->WhatsApp->Voice) |
| `02-whatsapp-bot/lib/audit-logger.js` | Action and message audit logging (JSONL) |
| `02-whatsapp-bot/lib/project-manager.js` | GitHub file fetching with 60-min cache |
| `02-whatsapp-bot/lib/todo-parser.js` | Parses TODO.md (emoji + checkboxes) |
| `02-whatsapp-bot/lib/active-project.js` | Per-user project context (2hr expiry) |
| `02-whatsapp-bot/lib/command-whitelist.js` | Security for remote exec |
| `02-whatsapp-bot/lib/project-intelligence.js` | The brain - project routing |
| `02-whatsapp-bot/lib/intent-classifier.js` | AI intent understanding |
| `02-whatsapp-bot/lib/action-executor.js` | Auto-execution with 7 handlers |
| `02-whatsapp-bot/lib/confirmation-manager.js` | Safe action confirmations |
| `02-whatsapp-bot/lib/cross-repo-queries.js` | HQ cross-repo aggregation |

### Skills
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/skills/skill-registry.js` | Skill routing, dynamic docs |
| `02-whatsapp-bot/skills/skills.json` | Enabled skills config |
| `02-whatsapp-bot/skills/chat-management/index.js` | Chat registration commands |
| `02-whatsapp-bot/skills/hq-commands/index.js` | Cross-repo HQ commands |
| `02-whatsapp-bot/skills/voice-call/index.js` | Voice call commands |
| `02-whatsapp-bot/skills/action-control/index.js` | Override commands: undo, pause, stop |
| `02-whatsapp-bot/skills/project-context/index.js` | Project awareness, TODO parsing |
| `02-whatsapp-bot/skills/remote-exec/index.js` | Safe EC2 command execution |

### Other
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/hooks/smart-router.js` | NLP → command conversion |
| `02-whatsapp-bot/autonomous/index.js` | Autonomous agent orchestrator |
| `02-whatsapp-bot/mcp-server/index.js` | MCP server for Claude Desktop/App |
| `config/project-registry.json` | 16 projects with capabilities |
| `config/chat-registry.json` | Persisted chat registrations |
| `config/.env.local` | Environment variables (never modify via code) |

## Environment Variables

### Required for multi-AI:
```
GROQ_API_KEY=gsk_...            # FREE - get from console.groq.com
ANTHROPIC_API_KEY=sk-...        # Claude - required
XAI_API_KEY=xai-...             # Grok - optional, for social search
PERPLEXITY_API_KEY=pplx-...     # Perplexity - optional, for deep research
CLAWDBOT_API_KEY=...            # API key for MCP/REST API access
```

### Platform configuration:
```
DEFAULT_PLATFORM=telegram           # Primary platform for proactive messages

# Telegram
TELEGRAM_BOT_TOKEN=...              # Bot token from @BotFather
TELEGRAM_HQ_CHAT_ID=123456789       # Telegram chat ID for HQ alerts
TELEGRAM_AUTHORIZED_USERS=123,456   # Comma-separated authorized chat IDs

# WhatsApp
YOUR_WHATSAPP=+447123456789         # Authorized WhatsApp number
TWILIO_ACCOUNT_SID=AC...            # Twilio account SID
TWILIO_AUTH_TOKEN=...               # Twilio auth token
TWILIO_WHATSAPP_NUMBER=+1...        # Twilio WhatsApp sandbox number
WHATSAPP_CRITICAL_ALERTS=true       # Send critical alerts to WhatsApp backup

# Voice
TWILIO_PHONE_NUMBER=+1...           # Twilio voice-enabled phone number
YOUR_PHONE_NUMBER=+44...            # Your phone number (call recipient)
BASE_URL=http://...                 # Public URL for voice webhooks
```

### Alert escalation config:
```
AUTO_CALL_ENABLED=true                      # Enable automatic voice call escalation
ESCALATE_TELEGRAM_TO_WHATSAPP_MS=900000     # 15 min delay (default)
ESCALATE_WHATSAPP_TO_VOICE_MS=1800000       # 30 min delay (default)
DND_START_HOUR=23                           # Do Not Disturb start (11 PM)
DND_END_HOUR=7                              # Do Not Disturb end (7 AM)
BYPASS_DND_FOR_CRITICAL=true                # Emergency/critical bypass DND
MAX_ALERTS_PER_HOUR=10                      # Rate limit
ALERT_COOLDOWN_MS=300000                    # 5 min cooldown per alert type
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

The bot functions as a full Claude Code agent controllable via Telegram/WhatsApp:

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

### GitHub Webhooks (Real-time Alerts)

Endpoint: `POST /github-webhook`

| Event | Alert Level |
|-------|-------------|
| `workflow_run` (failed, main) | CRITICAL (full escalation) |
| `workflow_run` (failed, other) | WARNING (Telegram + WhatsApp) |
| `pull_request` (opened) | INFO (Telegram only) |
| `issues` (opened) | INFO (Telegram only) |
| `push` | INFO (Telegram only) |
| `release` | INFO (Telegram only) |

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
| **Control** | action-control (undo, pause, stop, explain) |
| **Core** | help, memory, tasks, reminders |
| **Claude Code Agent** | project-context, remote-exec |
| **GitHub** | github, coder, review, stats, actions, multi-repo, project-creator |
| **Accountancy** | deadlines, companies, governance, intercompany, receipts, moltbook |
| **Media** | image-analysis, voice, voice-call, video, files |
| **Scheduling** | morning-brief, digest, overnight |
| **Research** | research, vercel |
| **Chat/Platform** | chat-management, hq-commands |
| **Config** | ai-settings, autonomous-config |

## Audit Logging

All actions are logged to `logs/audit/audit-YYYY-MM-DD.jsonl` for accountability:

**Log Types:**
| Type | Description |
|------|-------------|
| `incoming_message` | Messages received from users |
| `outgoing_message` | Messages sent to users |
| `action_proposed` | Actions suggested by AI |
| `action_confirmed` | User-confirmed actions |
| `action_executed` | Completed actions |
| `action_undone` | Reverted actions |
| `action_cancelled` | Cancelled actions |
| `skill_execution` | Skill invocations |
| `ai_query` | AI provider calls |
| `escalation` | Alert escalations |
| `voice_call` | Voice call events |
| `error` | Error events |
| `security` | Security-related events |

## Important Notes

- **Telegram message limit:** 4096 characters (truncated automatically)
- **WhatsApp message limit:** ~1600 characters (truncated automatically)
- **Skill priority:** Higher number = checked first (help=100, action-control=99, hq-commands=95)
- **Authorization:** Check `TELEGRAM_AUTHORIZED_USERS` and `YOUR_WHATSAPP` env vars
- **Skills auto-document:** AI handler reads from registry via `generateSkillDocs()`
- **Voice messages:** Automatically transcribed via Groq Whisper (FREE)
- **Autonomous mode:** Runs nightly, configurable via `autonomous-config` skill
- **Alert escalation:** Configurable delays, DND hours, and bypass rules
- **Chat registry:** Persists to `config/chat-registry.json`
- **Audit logs:** Daily rotation, JSONL format, buffered writes
