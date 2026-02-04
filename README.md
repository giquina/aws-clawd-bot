# ClawdBot v2.5 - AI Coding Agent for Telegram/WhatsApp/Voice

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude AI](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange)](https://anthropic.com)
[![Platform](https://img.shields.io/badge/Platform-Telegram-26A5E4?logo=telegram&logoColor=white)](https://telegram.org/)
[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366?logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)
[![AWS](https://img.shields.io/badge/Deployed%20on-AWS%20EC2-FF9900?logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)

**Your personal AI coding agent running 24/7, controllable via Telegram (primary), WhatsApp (backup), or Voice calls (critical).**

ClawdBot v2.5 is a full Claude Code Agent - read any repo, parse TODOs, deploy code, run tests, and get proactive morning reports. Includes multi-AI routing (Groq FREE, Claude Opus/Sonnet, Grok, Perplexity), context-aware intelligence (context engine + outcome tracking), an autonomous agent system for nightly task execution, smart alert escalation with voice calling for emergencies, auto-deploy on GitHub push, and 37 modular skills.

> 🚀 **Running 24/7 on AWS EC2** - Send a message via Telegram or WhatsApp anytime, or receive voice calls for critical alerts!

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Platform** | Telegram (primary), WhatsApp (backup), Voice calls (critical alerts) |
| **Multi-AI Routing** | Groq (FREE), Claude Opus/Sonnet, Grok, Perplexity - smart cost optimization |
| **AI Code Writing** | Edit files, create new files, fix issues - AI generates code and creates PRs |
| **Voice Calling** | Twilio-powered outbound calls for emergencies and unacknowledged alerts |
| **Alert Escalation** | Telegram → WhatsApp → Voice call with configurable delays |
| **GitHub Actions** | List workflows, view runs, trigger workflows remotely |
| **Code Review** | AI-powered PR review and file improvement suggestions |
| **Repository Stats** | Contributors, activity, language breakdown, comprehensive analytics |
| **Remote Execution** | Deploy, run tests, view logs on EC2 via whitelisted commands |
| **Chat Registry** | Per-chat context (repo/HQ), notification levels, auto-routing |
| **Action Control** | Propose-confirm-execute model with undo, pause, stop capabilities |
| **Persistent Memory** | Remembers conversations and facts across sessions (SQLite) |
| **Skills System** | 37+ modular skills with extensible plugin architecture |
| **Scheduler** | Morning briefs, deadline checks, nightly autonomous agent |
| **MCP Server** | Control from Claude Desktop, Claude Code App, or any MCP client |
| **Audit Logging** | Full action and message logging for accountability (JSONL) |
| **24/7 AWS Deployment** | Runs on EC2 with PM2 process management, always available |

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- [Twilio Account](https://www.twilio.com/try-twilio) (for WhatsApp integration)
- [GitHub Personal Access Token](https://github.com/settings/tokens)
- [Anthropic API Key](https://console.anthropic.com/) (for Claude AI)
- Your WhatsApp phone number

### Installation

```bash
# Clone the repository
git clone https://github.com/giquina/aws-clawd-bot.git
cd aws-clawd-bot

# Install dependencies
cd 02-bot
npm install

# Configure environment
cp ../config/.env.example ../config/.env.local
# Edit .env.local with your API keys and settings

# Start the bot
npm start
```

### Interactive Setup (Recommended)

```bash
npm run setup  # Interactive configuration wizard
```

### Development Mode

```bash
npm run dev    # Auto-reload on file changes (uses nodemon)
```

---

## Commands

Commands work via both Telegram and WhatsApp. The smart router also handles natural language (e.g., "what's left on judo" → `project status judo`).

### Core Commands

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `help <skill>` | Show commands for a specific skill |
| `project status [repo]` | Show TODO.md tasks for a repo |
| `my repos` | List all your GitHub repos |
| `switch to <repo>` | Set active project context |

### Action Control

| Command | Description |
|---------|-------------|
| `yes` / `confirm` | Confirm pending action |
| `no` / `reject` | Reject pending action |
| `undo` | Reverse last completed action |
| `stop` / `cancel` | Cancel current action |
| `explain` | Get details about pending action |

### Remote Execution

| Command | Description |
|---------|-------------|
| `deploy <repo>` | Deploy with confirmation |
| `run tests <repo>` | Run npm test |
| `logs <repo>` | View PM2 logs |
| `restart <repo>` | Restart PM2 process |
| `remote status` | Show all PM2 processes |

### Chat Management

| Command | Description |
|---------|-------------|
| `register chat for <repo>` | Register chat for a repository |
| `register chat as hq` | Register as HQ (cross-repo access) |
| `context` | Show current chat context |
| `set notifications <level>` | all / critical / digest |

### HQ Commands (cross-repo)

| Command | Description |
|---------|-------------|
| `urgent` | Most urgent task across ALL repos |
| `all projects` | Summary of all projects |
| `global brief` | Aggregated morning brief |
| `completion rate` | Overall completion stats |

### Voice Calling

| Command | Description |
|---------|-------------|
| `call me` | Call immediately |
| `call me about <message>` | Call with specific message |
| `call me at HH:MM` | Schedule call for time |
| `voice status` | Show voice configuration |

### AI Assistance

Any message that doesn't match a specific command is routed to the appropriate AI provider:
- Simple queries → Groq (FREE)
- Planning/strategy → Claude Opus
- Code/debugging → Claude Sonnet
- Social/Twitter → Grok
- Deep research → Perplexity

---

## Architecture

```
Telegram/WhatsApp → Express (index.js) → Hooks → Skills Router (37+ skills)
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

GitHub Events --> /github-webhook --> Alert Escalation (Telegram → WhatsApp → Voice)
```

### Project Structure

```
aws-clawd-bot/
├── 02-bot/           # Main application
│   ├── index.js               # Express server & webhook handlers
│   ├── ai-handler.js          # Multi-AI router, project context
│   ├── telegram-handler.js    # Telegram Bot API integration
│   ├── voice-handler.js       # Twilio Voice calling handler
│   ├── github-webhook.js      # GitHub webhook event handler
│   ├── ai-providers/          # AI provider implementations
│   │   ├── router.js          # Smart query classification
│   │   ├── groq-handler.js    # Groq LLM + Whisper (FREE)
│   │   ├── claude-handler.js  # Claude Opus/Sonnet
│   │   └── grok-handler.js    # Grok xAI (social)
│   ├── lib/                   # Core libraries
│   │   ├── messaging-platform.js  # Multi-platform abstraction
│   │   ├── chat-registry.js       # Chat context registration
│   │   ├── action-controller.js   # Propose-confirm-execute model
│   │   ├── alert-escalation.js    # Multi-tier escalation
│   │   └── audit-logger.js        # Action logging (JSONL)
│   ├── hooks/
│   │   └── smart-router.js    # NLP → command conversion
│   ├── autonomous/            # Nightly autonomous agent
│   ├── mcp-server/            # MCP server for Claude Desktop
│   ├── memory/                # SQLite persistence layer
│   ├── scheduler/             # Job scheduler (node-cron)
│   └── skills/                # 37+ modular skills
│       ├── skills.json        # Enabled skills config
│       └── <skillname>/       # Each skill in its own folder
├── config/
│   ├── project-registry.json  # GitHub projects with capabilities
│   ├── chat-registry.json     # Persisted chat registrations
│   └── .env.local             # Environment variables (gitignored)
└── scripts/                   # Deployment and setup scripts
```

---

## Configuration

### Required Environment Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Claude AI API key | [Anthropic Console](https://console.anthropic.com/) |
| `GROQ_API_KEY` | Groq API key (FREE) | [Groq Console](https://console.groq.com/) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_AUTHORIZED_USERS` | Authorized Telegram chat IDs | Comma-separated |
| `GITHUB_TOKEN` | GitHub Personal Access Token | [GitHub Settings](https://github.com/settings/tokens) |
| `GITHUB_USERNAME` | Your GitHub username | Your profile |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `XAI_API_KEY` | - | Grok API for social/X search |
| `PERPLEXITY_API_KEY` | - | Perplexity for deep research |
| `TWILIO_ACCOUNT_SID` | - | Twilio for WhatsApp/Voice |
| `TWILIO_AUTH_TOKEN` | - | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | - | Twilio WhatsApp number |
| `TWILIO_PHONE_NUMBER` | - | Twilio voice-enabled number |
| `YOUR_WHATSAPP` | - | Your WhatsApp number |
| `YOUR_PHONE_NUMBER` | - | Your phone for voice calls |
| `AUTO_CALL_ENABLED` | `false` | Enable voice call escalation |
| `CLAWDBOT_API_KEY` | - | API key for MCP/REST access |

### Example Configuration

```bash
# config/.env.local

# Multi-AI (Groq is FREE)
GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...              # Optional
PERPLEXITY_API_KEY=pplx-...      # Optional

# Telegram (Primary)
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_AUTHORIZED_USERS=123456789,987654321
TELEGRAM_HQ_CHAT_ID=123456789

# WhatsApp (Backup) - Optional
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+14155238886
YOUR_WHATSAPP=+447123456789

# Voice Calling - Optional
TWILIO_PHONE_NUMBER=+1...
YOUR_PHONE_NUMBER=+44...
AUTO_CALL_ENABLED=true

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_USERNAME=yourusername
```

---

## Skills System

ClawdBot uses a modular skills architecture. Each skill is a self-contained module that handles specific commands.

### Built-in Skills (37 Skills)

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
| **Config** | ai-settings, autonomous-config, audit |

**Skill Priority:** Higher number = checked first (help=100, action-control=99, hq-commands=95)

### Creating a Custom Skill

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

### Skill Context

Skills receive a context object with:

```javascript
{
  userId: '123456789',           // Telegram chat ID or phone number
  platform: 'telegram',          // 'telegram' or 'whatsapp'
  memory: MemoryManager,         // Persistent storage
  ai: AIHandler,                 // Multi-AI handler
  mediaUrl: 'https://...',       // Optional: media attachment URL
  config: { ... }                // Configuration
}
```

---

## Deployment

### Local Development

```bash
cd 02-bot && npm install
npm run dev                    # Development with nodemon auto-reload
npm start                      # Production mode
curl localhost:3000/health     # Health check
```

### AWS EC2 Deployment

**Quick deploy (single file):**
```bash
scp -i ~/.ssh/clawd-bot-key.pem 02-bot/index.js ubuntu@16.171.150.151:/opt/clawd-bot/02-bot/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 restart clawd-bot"
```

**Full deploy:**
```bash
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' .
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && pm2 restart clawd-bot"
```

**View logs:**
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 50"
```

**Live Server:** `16.171.150.151:3000` (eu-north-1)

---

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

### REST API (for MCP Server)
All API endpoints require `X-API-Key` header with `CLAWDBOT_API_KEY` value.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Bot status, uptime, features |
| `/api/message` | POST | Send message & get response |
| `/api/projects` | GET | List all GitHub repos |
| `/api/project/:repo/status` | GET | Get TODO.md tasks for a repo |
| `/api/project/:repo/deploy` | POST | Trigger deployment |
| `/api/skills` | GET | List all available skills |

### Health Check Response

```json
{
  "status": "online",
  "uptime": 3600,
  "timestamp": "2026-01-31T10:00:00.000Z",
  "memory": {
    "heapUsed": "45.23 MB"
  },
  "features": {
    "persistentMemory": true,
    "skillsFramework": true,
    "scheduler": true
  },
  "stats": {
    "totalMessages": 150,
    "totalFacts": 12,
    "pendingTasks": 3
  }
}
```

---

## Cost Breakdown

| Service | Free Tier | After Free Tier |
|---------|-----------|-----------------|
| AWS EC2 (t2.micro) | 12 months FREE | ~$10/month |
| AWS Storage (30GB) | 12 months FREE | ~$1/month |
| Twilio WhatsApp | ~$3/month | ~$3/month |
| Claude AI API | Pay per use | ~$5-20/month* |
| **TOTAL** | **~$3/month** | **~$19-34/month** |

*Claude API costs depend on usage. Light usage is very affordable.

---

## Troubleshooting

### Bot Not Responding

1. Check health endpoint: `curl http://localhost:3000/health`
2. Verify Twilio webhook URL is correct
3. Ensure `YOUR_WHATSAPP` matches your phone number exactly
4. Check console logs for errors

### GitHub Commands Failing

1. Verify `GITHUB_TOKEN` has correct scopes (`repo`, `workflow`, `admin:org`)
2. Check `GITHUB_USERNAME` is correct
3. Ensure repository names in `REPOS_TO_MONITOR` are correct

### Memory Not Persisting

1. Check `02-bot/memory/clawd.db` exists
2. Verify write permissions on the directory
3. Check console for SQLite errors

### Webhook Signature Errors

1. Ensure `GITHUB_WEBHOOK_SECRET` matches your GitHub webhook settings
2. Check raw body parsing is enabled in Express

---

## Contributing

### Adding New Skills

1. Fork the repository
2. Create a new skill in `02-bot/skills/`
3. Follow the skill structure from existing skills
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines

- Use ESLint for code style
- Follow existing patterns for error handling
- Document all public methods
- Keep skills modular and focused

---

## Security Notes

1. **Never commit `.env.local`** - Contains sensitive API keys
2. **Rotate tokens regularly** - GitHub and Anthropic keys
3. **Use webhook secrets** - Verify GitHub webhook signatures
4. **Limit bot access** - Only `YOUR_WHATSAPP` can control the bot
5. **Audit repository permissions** - `GITHUB_TOKEN` has write access

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Claude AI](https://anthropic.com) - AI language model (Opus/Sonnet)
- [Groq](https://groq.com) - FREE LLaMA + Whisper inference
- [Telegram](https://telegram.org) - Primary messaging platform
- [Twilio](https://twilio.com) - WhatsApp + Voice calling
- [Octokit](https://github.com/octokit) - GitHub API client

---

**Built by Giquina | Powered by Claude AI + Groq + AWS**
