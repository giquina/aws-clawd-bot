# TODO.md - AWS ClawdBot Task Tracker

## Quick Links
- [PLAN.md](./PLAN.md) - Overall strategy
- [SKILLS.md](./SKILLS.md) - Skills to implement
- [SUGGESTIONS.md](./SUGGESTIONS.md) - Enhancement ideas
- [TASKS.md](./TASKS.md) - Detailed task breakdown
- [docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md) - Setup instructions

---

## Status Legend
- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
- ❌ Blocked

---

## Phase 1: Foundation - ✅ COMPLETE

### 1.1 Memory System
- ✅ Create `memory/` directory structure
- ✅ Create database schema (schema.sql)
- ✅ Create `memory-manager.js` class
- ✅ Add saveFact/getFacts methods
- ✅ Add conversation history persistence
- ✅ Integrate with index.js

### 1.2 Skills Framework
- ✅ Create `skills/` directory structure
- ✅ Create `skill-loader.js` for plugin discovery
- ✅ Create `skill-registry.js` for command routing
- ✅ Create base `Skill` class template
- ✅ Update index.js to use skill router
- ✅ Create skills.json configuration

### 1.3 Scheduling System
- ✅ Create `scheduler/scheduler.js`
- ✅ Create morning brief job handler
- ✅ Add cron job support

---

## Phase 2: Core Features - ✅ COMPLETE

### 2.1 Skills Implemented
- ✅ **help** - Lists all available commands
- ✅ **memory** - remember/forget/my facts commands
- ✅ **github** - Full GitHub operations (create PR, branch, issue)
- ✅ **morning-brief** - Daily morning summary
- ✅ **research** - Web search and summarization

### 2.2 GitHub Integration
- ✅ Wire up code-analyzer.js to WhatsApp
- ✅ Add `create pr` command
- ✅ Add `create branch` command
- ✅ Add `create issue` command
- ✅ Add `close issue` command
- ✅ Add GitHub webhook handler (/github-webhook endpoint)

### 2.3 Improved AI Handler
- ✅ Better system prompt (honest about capabilities)
- ✅ Time-aware greeting
- ✅ Increased max_tokens to 1024

---

## Phase 3: Deployment - 🟡 USER ACTION NEEDED

### 3.1 Configuration Required
- ⬜ Add ANTHROPIC_API_KEY to .env
- ⬜ Add TWILIO_ACCOUNT_SID to .env
- ⬜ Add TWILIO_AUTH_TOKEN to .env
- ⬜ Add YOUR_WHATSAPP number to .env
- ⬜ Add GITHUB_TOKEN to .env
- ⬜ (Optional) Add BRAVE_API_KEY for research
- ⬜ (Optional) Add OPENWEATHER_API_KEY for weather

### 3.2 GitHub Webhook Setup
- ⬜ Go to each repo → Settings → Webhooks
- ⬜ Add webhook URL: `https://your-server/github-webhook`
- ⬜ Select events: push, pull_request, issues, workflow_run
- ⬜ (Optional) Add webhook secret

### 3.3 AWS Deployment
- ⬜ Run `scripts/deploy-to-aws.ps1`
- ⬜ Update Twilio webhook URL to AWS IP
- ⬜ Update GitHub webhook URLs

---

## Completed Features Summary

| Feature | Status | Commands |
|---------|--------|----------|
| AI Chat | ✅ | Any message |
| Memory | ✅ | remember, my facts, forget |
| GitHub Read | ✅ | list repos, analyze [repo] |
| GitHub Write | ✅ | create pr/branch/issue, close issue |
| GitHub Webhooks | ✅ | Automatic notifications |
| Morning Brief | ✅ | morning brief |
| Research | ✅ | research [topic], summarize [url] |
| Help | ✅ | help |
| Status | ✅ | status |

---

## What's Left for User

1. **Configure .env file** with your API keys
2. **Set up GitHub webhooks** on your repos
3. **Deploy to AWS** or run locally with ngrok
4. **Test WhatsApp commands**

See [docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md) for detailed instructions.

---

*Last Updated: 2026-01-31*
*Status: Code Complete - Awaiting User Configuration*
