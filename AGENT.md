# AGENT.md

This file provides guidance to AI coding assistants (Claude, GPT, Copilot, Cursor, etc.) when working with this codebase.

## Project: ClawdBot v2.1

A WhatsApp-controlled AI coding assistant running 24/7 on AWS EC2. Send commands via WhatsApp to write code, create PRs, trigger workflows, manage GitHub repos, track company deadlines, and more.

**Live:** `16.171.150.151:3000` (eu-north-1)
**Skills:** 23 loaded (auto-documented)
**Hooks:** Error alerting, Smart NLP routing

## Architecture

```
WhatsApp → Twilio → Express (index.js) → Hooks → Skills Router (22 skills)
                                           ↓
                    ┌──────────────────────┼──────────────────────┐
                    ↓                      ↓                      ↓
              Smart Router           Error Alerter          Skill Registry
              (NLP → cmds)          (crash alerts)         (command routing)
                    ↓
    ┌───────────────┼───────────────┬───────────────┬───────────────┐
    ↓               ↓               ↓               ↓               ↓
GitHub/Code    Accountancy      Productivity     AI/Social      Scheduler
(22 skills)    (deadlines,      (tasks, digest,  (overnight,    (proactive
               companies)        receipts)        voice)         alerts)
```

## Skills (23 loaded)

| Category | Skill | Priority | Key Commands |
|----------|-------|----------|--------------|
| **AI/Code** | `coder` | 20 | `fix issue`, `edit file`, `create file` |
| | `review` | 18 | `review pr`, `review file` |
| | `project-creator` | 22 | `create new project`, `new app for` |
| **GitHub** | `multi-repo` | 25 | `search all`, `compare repos` |
| | `github` | 10 | `list repos`, `read file`, `search`, `create branch` |
| | `actions` | 15 | `workflows`, `run workflow` |
| | `stats` | 12 | `stats`, `contributors`, `activity` |
| **Accountancy** | `deadlines` | 28 | `deadlines`, `due this week`, `overdue` |
| | `companies` | 26 | `companies`, `company GQCARS`, `directors` |
| | `governance` | 24 | `can I <action>?`, `who approves` |
| | `intercompany` | 23 | `loans`, `record loan`, `ic balance` |
| **Productivity** | `receipts` | 30 | Send image → extract data |
| | `digest` | 32 | `digest`, `today`, `morning summary` |
| | `overnight` | 35 | `tonight <task>`, `my queue` |
| | `tasks` | 35 | `add task`, `my tasks` |
| | `memory` | 50 | `remember`, `my facts` |
| | `reminders` | 30 | `remind me` |
| **Social** | `moltbook` | 40 | `post to moltbook`, `moltbook feed`, `join moltbook` |
| **System** | `voice` | 99 | Send voice → transcribe |
| | `help` | 100 | `help`, `status`, `skills` |

## Hooks

| Hook | Purpose |
|------|---------|
| `error-alerter` | WhatsApp alert when bot crashes |
| `smart-router` | Natural language → commands |

## Giquina Group Companies

| Code | Company | Number |
|------|---------|--------|
| GMH | Giquina Management Holdings Ltd | 15425137 |
| GACC | Giquina Accountancy Ltd | 16396650 |
| GCAP | Giquina Capital Ltd | 16360342 |
| GQCARS | GQ Cars Ltd | 15389347 |
| GSPV | Giquina Structured Asset SPV Ltd | 16369465 |

## Development

```bash
cd 02-whatsapp-bot
npm install
npm run dev      # Development (nodemon)
npm start        # Production
curl localhost:3000/health
```

## Deploy

```bash
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' --exclude='deploy-package' .
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && pm2 restart clawd-bot"
```

## Key Files

| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Main webhook server |
| `02-whatsapp-bot/hooks/` | Error alerter, smart router |
| `02-whatsapp-bot/skills/` | 21 skill modules |
| `02-whatsapp-bot/scheduler/` | Cron jobs, proactive alerts |
| `config/.env.local` | Environment variables |

## Notes for AI Agents

1. **Never modify `.env.local`** - Contains real API keys
2. **Skill priority** - Higher number = matched first
3. **Hooks run first** - Smart router processes before skills
4. **WhatsApp limit** - Keep responses under ~4000 chars
5. **Skills auto-load** - Just create `skills/<name>/index.js`
6. **Skills auto-documented** - AI handler reads from registry dynamically
7. **Add to skills.json** - New skills must be added to `enabled` array

## Owner

GitHub: @giquina
Repos: armora, gqcars-manager, JUDO, giquina-accountancy-direct-filing, aws-clawd-bot
