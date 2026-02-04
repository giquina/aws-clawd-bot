# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawdBot v2.5 is a **Claude Code Agent** running 24/7 on AWS EC2, controllable via **Telegram (primary)**, WhatsApp (backup), or **Voice calls (critical)**. Voice/text instructions become real GitHub PRs, deploy to Vercel, run tests, and get proactive morning reports. Includes multi-AI routing (Groq FREE, Claude Opus/Sonnet, Grok, Perplexity), context-aware intelligence (context engine + outcome tracking), an autonomous agent system for nightly tasks, smart alert escalation with voice calling, and per-repo Telegram group management.

**Live Server:** `16.171.150.151:3000` (eu-north-1, instance `i-009f070a76a0d91c1`)

## Commands

```bash
# Development (all commands run from 02-whatsapp-bot/)
cd 02-whatsapp-bot && npm install
npm run dev                    # Development with nodemon auto-reload
npm start                      # Production mode
npm test                       # Run test suite (scripts/test-bot.js)
curl localhost:3000/health     # Health check

# Deploy to AWS EC2 (preferred — pushes SSH key automatically)
./deploy.sh              # Quick: git pull + restart
./deploy.sh full         # Full: git pull + npm install + rebuild better-sqlite3 + restart

# Manual deploy (individual files via SCP when git is broken)
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-009f070a76a0d91c1 \
  --instance-os-user ubuntu \
  --ssh-public-key file://~/.ssh/clawd-bot-key.pem.pub \
  --region eu-north-1
scp -i ~/.ssh/clawd-bot-key.pem 02-whatsapp-bot/index.js ubuntu@16.171.150.151:/opt/clawd-bot/02-whatsapp-bot/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 restart clawd-bot"

# View EC2 logs
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 50"
```

Note: There are no `lint` or `build` scripts — this is a plain Node.js project (no TypeScript, no bundler).

## Critical Deployment Notes

- **SSH keys expire quickly** — must call `aws ec2-instance-connect send-ssh-public-key` before EVERY SSH/SCP session
- **`config/.env.local`** — NEVER overwrite on EC2. Contains Telegram token, API keys. Git-tracked version is a template.
- **`config/chat-registry.json`** — NEVER overwrite on EC2. Contains live Telegram group registrations. Marked `assume-unchanged` in git on the server.
- **`better-sqlite3`** — native module. Windows `.node` files don't work on Linux. After `npm install` on EC2, always run `npm rebuild better-sqlite3`.
- **Telegram Bot Privacy Mode** — must be OFF for bot to see non-command messages in groups. Set via @BotFather → Bot Settings → Group Privacy → Turn off.
- **EC2 project paths** — repos cloned for auto-deploy: `/opt/clawd-bot` (this repo), `/opt/projects/JUDO`, `/opt/projects/LusoTown`, `/opt/projects/armora`, `/opt/projects/gqcars-manager`, `/opt/projects/gq-cars-driver-app`, `/opt/projects/giquina-accountancy-direct-filing`. All linked to Vercel. Mapped in `lib/command-whitelist.js` `KNOWN_PROJECTS`.
- **Telegram handler** — uses long-polling on EC2 (no SSL). Supports webhook mode if `TELEGRAM_WEBHOOK_URL` is set. Uses Telegraf library.

## Architecture

```
Telegram/WhatsApp → Express (index.js) → Hooks → Skills Router (37 skills)
                                           ↓
                    ┌──────────────────────┼──────────────────────┐
                    ↓                      ↓                      ↓
              Smart Router           Error Alerter          Skill Registry
              (NLP → cmds)          (crash alerts)         (command routing)
              Coding guard
              (bypass for dev)
                                           ↓
                              ┌── Context Engine ──┐
                              │ Builds rich context│
                              │ before every AI    │
                              │ call (chat, user,  │
                              │ project, history)  │
                              └────────┬───────────┘
                                       ↓
                                AI Provider Router
                    ┌────────────┬────────┼────────┬────────────┐
                    ↓            ↓        ↓        ↓            ↓
              Groq (FREE)   Claude    Claude    Grok (xAI)  Perplexity
              Simple/greet  Opus=Brain Sonnet   Social/X    Deep research
              Whisper(voice) Planning  =Coder   Trends      w/ citations

Voice/Text → Plan Executor → GitHub PRs
             Voice Flow → full pipeline (transcribe→intent→execute→report)

GitHub Push → Auto-Deploy → git pull + vercel --prod → Telegram notification

Scheduler (node-cron) → morning-brief, proactive-alerts, deadline-check, nightly-autonomous
```

## Message Processing Pipeline

Every incoming message follows this path:

1. **Webhook** receives message (Telegram bot API long-polling / WhatsApp Twilio POST)
2. **Auth check** — `TELEGRAM_AUTHORIZED_USERS` for DMs, auto-authorized for registered groups
3. **`messaging-platform.js`** normalizes message format across platforms
4. **Pending confirmation check** — if user has a pending action (plan, deploy), "yes"/"no" routes there first
5. **Voice notes** — detected by content type, sent to Groq Whisper (FREE, forced English), then either:
   - Complex instruction (>15 words + coding keywords) → plan creation via Claude
   - Short command → re-routed through skills
6. **`hooks/smart-router.js`** — converts natural language to skill commands. Has passthrough guards:
   - Greetings, questions, conversational messages → bypass to AI
   - Coding instructions (add, make, fix + component words) → bypass to AI
7. **`skills/skill-registry.js`** routes by priority (higher number = checked first, help=100, action-control=99)
8. **AI fallback** — if no skill matches, builds **rich context** via context engine, then calls AI handler
9. **Memory** — saves message and response to SQLite (per-chat conversation history)
10. **Response** sent back via same platform

## Intelligence Layer

### Context Engine (`lib/context-engine.js`)

Built before every AI call. Aggregates into a single object:
- **Chat context** from chat-registry (which repo/company this chat is for)
- **User facts** from memory (preferences, personal info)
- **Conversation history** (last 15 messages per chat from SQLite)
- **Active project** (TODO.md, open PRs from GitHub)
- **Recent activity** (last 8 entries from activity log ring buffer)
- **Recent plans/deployments** from database
- **Time awareness** (time of day, day of week)

Formatted and injected into Claude's system prompt via `formatForSystemPrompt()`.

### Outcome Tracker (`lib/outcome-tracker.js`)

Records action results in SQLite `outcomes` table:
- `startAction()` — when action begins (deploy, PR, plan, command)
- `completeAction()` — success/failed/cancelled with details
- `recordFeedback()` — user sentiment about the result
- `formatForContext()` — injects recent outcomes into system prompt

### Dual Persistence

| Module | DB Path | Purpose |
|--------|---------|---------|
| `memory/memory-manager.js` | `memory/clawd.db` | Conversations, facts, tasks, scheduled jobs (MemoryManager class) |
| `lib/database.js` | `/opt/clawd-bot/data/clawdbot.db` or `data/clawdbot.db` | Conversations, facts, plans, deployments, outcomes (singleton) |

Both use better-sqlite3 with WAL mode. The memory-manager is the primary conversation store (used by `saveMessage`/`getConversationForClaude`). The database.js module stores plans, deployments, and outcome tracking data.

## Multi-AI Routing

| Provider | Model | Cost | Best For |
|----------|-------|------|----------|
| Groq | LLaMA 3.3 70B | **FREE** | Simple queries, greetings |
| Groq | Whisper | **FREE** | Voice transcription (forced English) |
| Claude | Opus 4.5 | $$$ | Planning, strategy (THE BRAIN) |
| Claude | Sonnet 4 | $$ | Coding, implementation (THE CODER) |
| Grok | grok-3-fast | $ | Social/X/Twitter searches |
| Perplexity | sonar | $$ | Deep research with citations |

Routing: `ai-providers/router.js` classifies queries. Greetings/short → Groq (FREE). "plan"/"strategy" → Opus. Code/debug → Sonnet. "trending"/"twitter" → Grok. Research → Perplexity.

## Multi-Platform Architecture

| Platform | Max Message | Use Case |
|----------|-------------|----------|
| Telegram | 4096 chars, Markdown, inline buttons | Primary — DMs + per-repo groups |
| WhatsApp | ~1600 chars, limited Markdown | Backup — critical alerts only (50/day limit) |
| Voice | TTS via Polly | Emergency — unacknowledged alerts, urgent calls |

**Chat Registry** (`lib/chat-registry.js`, persisted to `config/chat-registry.json`):
- Maps chat IDs to repos/companies/HQ using `type` and `value` fields (NOT a `repo` field)
- Format: `{ "chatId": "-5100584192", "type": "repo", "value": "JUDO", "platform": "telegram" }`
- Telegram groups auto-register when bot is added (fuzzy-matches group title to repo names)
- Auto-context: messages in a registered group auto-target that repo for all commands

## Key Design Patterns

- **Skills** extend `BaseSkill` with `name`, `commands[]`, `priority`, `execute()`. Return `this.success(msg)` or `this.error(msg)`.
- Skills auto-loaded from `skills/<name>/index.js`. **Must be added to `skills/skills.json` enabled array.**
- AI handler dynamically generates skill docs from registry via `generateSkillDocs()` — no manual prompt updates needed.
- **Hooks** run before skills for preprocessing. Smart router has passthrough guards for conversational messages.
- **Confirmation manager** — propose-confirm-execute model. Actions stored per-userId. Voice plans use `voice_plan` action type.
- **Voice plan paths** in index.js must always pass `autoRepo` in the prompt AND `richContext` to `processQuery()` so Claude knows which project the chat is for.
- **Lazy imports** — context-engine.js and outcome-tracker.js use lazy `require()` to avoid circular dependencies.
- **Activity log** — in-memory ring buffer (200 entries) at `lib/activity-log.js` for real-time diagnostics.
- **Auto-deploy on push** — GitHub webhook push to default branch triggers `git pull` + `vercel --prod` on EC2. Requires `VERCEL_TOKEN` env var and project linked via `vercel link`. Projects cloned under `/opt/projects/` on EC2.

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

## Key Files

### Core
| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Express server, all webhook handlers, message processing pipeline |
| `02-whatsapp-bot/ai-handler.js` | Multi-AI router, system prompt builder, context engine integration |
| `02-whatsapp-bot/telegram-handler.js` | Telegram Bot API (Telegraf), auth, long-polling setup |
| `02-whatsapp-bot/github-webhook.js` | GitHub event formatter, webhook dedup (5-min delivery ID cache) |
| `02-whatsapp-bot/voice-handler.js` | Twilio Voice calling (TwiML, speech recognition) |

### Intelligence Layer
| File | Purpose |
|------|---------|
| `lib/context-engine.js` | Aggregates all context before every AI call |
| `lib/outcome-tracker.js` | Records action results, feeds back into context |
| `lib/database.js` | SQLite persistence (plans, deployments, outcomes) |
| `memory/memory-manager.js` | SQLite persistence (conversations, facts, tasks) |

### AI Providers
| File | Purpose |
|------|---------|
| `ai-providers/router.js` | Smart query classification across providers |
| `ai-providers/groq-handler.js` | Groq LLaMA + Whisper (FREE) |
| `ai-providers/claude-handler.js` | Claude Opus (brain) + Sonnet (coder) |
| `ai-providers/grok-handler.js` | Grok xAI (social/X search) |

### Libraries
| File | Purpose |
|------|---------|
| `lib/messaging-platform.js` | Multi-platform message abstraction |
| `lib/chat-registry.js` | Chat-to-repo mapping, Telegram group auto-register |
| `lib/plan-executor.js` | Voice/text plan → GitHub PR pipeline |
| `lib/voice-flow.js` | Voice note → transcribe → intent → execute → report |
| `lib/action-controller.js` | Action lifecycle: propose → confirm → execute → undo |
| `lib/alert-escalation.js` | Multi-tier escalation: Telegram → WhatsApp → Voice |
| `lib/confirmation-manager.js` | Per-user pending action confirmations |
| `lib/project-manager.js` | GitHub file fetching with 60-min cache, `getOpenPRs()` |
| `lib/intent-classifier.js` | AI intent understanding for voice commands |
| `lib/action-executor.js` | Auto-execution with 7 handlers (deploy, create-page, etc.) |
| `lib/activity-log.js` | In-memory ring buffer (200 entries) for diagnostics |

### Hooks
| File | Purpose |
|------|---------|
| `hooks/smart-router.js` | NLP → command conversion (with passthrough guards for greetings, questions, coding) |
| `hooks/error-alerter.js` | Uncaught error alerting to Telegram/WhatsApp (5-min cooldown) |

### Config
| File | Purpose |
|------|---------|
| `config/.env.local` | Environment variables — **NEVER overwrite on EC2** |
| `config/chat-registry.json` | Live Telegram group registrations — **NEVER overwrite on EC2** |
| `config/project-registry.json` | GitHub projects with capabilities |
| `skills/skills.json` | Enabled skills list |
| `deploy.sh` | Git-pull deploy script (quick/full modes) |

## Environment Variables

### Required:
```
GROQ_API_KEY=gsk_...            # FREE - console.groq.com
ANTHROPIC_API_KEY=sk-...        # Claude (required)
TELEGRAM_BOT_TOKEN=...          # Bot token from @BotFather
TELEGRAM_HQ_CHAT_ID=...        # Telegram chat ID for HQ alerts
TELEGRAM_AUTHORIZED_USERS=...   # Comma-separated authorized chat IDs
GITHUB_TOKEN=ghp_...            # GitHub PAT for PR creation
```

### Optional:
```
XAI_API_KEY=xai-...             # Grok (social search)
PERPLEXITY_API_KEY=pplx-...     # Perplexity (deep research)
VERCEL_TOKEN=...                # Vercel CLI deployment
CLAWDBOT_API_KEY=...            # API key for MCP/REST access
YOUR_WHATSAPP=+44...            # WhatsApp number for backup alerts
TWILIO_ACCOUNT_SID=AC...        # Twilio for WhatsApp + Voice
TWILIO_AUTH_TOKEN=...
```

## Skill Categories (37 enabled skills)

| Category | Skills |
|----------|--------|
| **Control** | action-control (undo, pause, stop, explain) |
| **Core** | help, memory, tasks, reminders |
| **Claude Code Agent** | project-context, remote-exec (incl. Vercel deploy) |
| **GitHub** | github, coder, review, stats, actions, multi-repo, project-creator |
| **Accountancy** | deadlines, companies, governance, intercompany, receipts, moltbook |
| **Media** | image-analysis, voice, voice-call, video, files |
| **Browser** | browser (browse, screenshot, search, extract) |
| **Scheduling** | morning-brief, digest, overnight |
| **Research** | research, vercel |
| **Chat/Platform** | chat-management, hq-commands |
| **Config** | ai-settings, autonomous-config, audit |

Note: `skills/alerts/` directory exists but is NOT enabled in `skills.json`.

## Alert Escalation

```
Alert → [Telegram] immediate → (15 min no ack) → [WhatsApp] → (30 min no ack) → [Voice Call]
```

Levels: INFO (Telegram only), WARNING (→ WhatsApp), CRITICAL (full escalation), EMERGENCY (immediate voice call).
DND: 23:00-07:00, EMERGENCY/CRITICAL bypass. Acknowledge with `ack <alert-id>`.

## Giquina Group Companies

Used by accountancy skills: GMH (15425137), GACC (16396650), GCAP (16360342), GQCARS (15389347), GSPV (16369465).

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Twilio WhatsApp webhook |
| `/telegram` | POST | Telegram bot webhook |
| `/github-webhook` | POST | GitHub events (deduped by delivery ID) |
| `/health` | GET | Health check |
| `/voice/outbound` | POST | TwiML for outbound calls |
| `/voice/response` | POST | Speech recognition handler |
| `/api/status` | GET | Bot status (requires `X-API-Key` header) |
| `/api/message` | POST | Send message & get response |
| `/api/projects` | GET | List repos |
| `/api/skills` | GET | List skills |
