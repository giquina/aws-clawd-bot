# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS ClawdBot is a WhatsApp-controlled AI coding assistant that runs on AWS EC2. Users send commands via WhatsApp (through Twilio), which triggers the bot to interact with GitHub repositories and respond using Claude AI.

## Architecture

```
WhatsApp → Twilio → Express Webhook (02-whatsapp-bot/index.js)
                           ↓
              ┌────────────┼────────────┐
              ↓            ↓            ↓
         ai-handler   github-handler   code-analyzer
         (Claude API)   (GitHub API)   (Octokit)
              ↓            ↓
        Response via Twilio WhatsApp
```

**Two Docker containers run on EC2:**
- `clawd-bot`: Node.js Express server handling WhatsApp webhooks (port 3000)
- `clawd-llama`: Ollama serving Llama 3.2 (port 11434) - legacy, code now uses Claude API

## Key Files

| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Main webhook server, routes commands |
| `02-whatsapp-bot/ai-handler.js` | Claude API integration (uses @anthropic-ai/sdk) |
| `02-whatsapp-bot/github-handler.js` | GitHub API via axios for repo info/issues |
| `03-github-automation/code-analyzer.js` | Advanced GitHub ops via Octokit (clone, PR, commit) |
| `05-docker/docker-compose.yml` | Multi-service orchestration |
| `scripts/deploy-to-aws.ps1` | Full AWS deployment automation |

## Commands

```bash
# Install dependencies
cd 02-whatsapp-bot && npm install
cd 03-github-automation && npm install

# Run locally
cd 02-whatsapp-bot && npm run dev    # Uses nodemon
cd 02-whatsapp-bot && npm start      # Production

# Docker build and run
cd 05-docker
docker-compose up --build

# Deploy to AWS (from scripts directory)
.\deploy-to-aws.ps1

# Test health endpoint
curl http://localhost:3000/health
```

## Environment Variables

Configuration lives in `config/.env.local` (copy from `.env.example`):

- `ANTHROPIC_API_KEY` - Claude API key (required for AI responses)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` - WhatsApp integration
- `YOUR_WHATSAPP` - Authorized phone number (only this number can use the bot)
- `GITHUB_TOKEN`, `GITHUB_USERNAME` - GitHub API access
- `REPOS_TO_MONITOR` - Comma-separated list of repo names

## WhatsApp Command Flow

Commands processed in `index.js`:
- `status` → `handleStatusCommand()` (internal)
- `list repos` → `githubHandler.listRepos()`
- `analyze <repo>` → `githubHandler.analyzeRepo()`
- `fix bugs in <repo>` → `githubHandler.fixBugs()`
- Everything else → `aiHandler.processQuery()` (Claude AI)

## Code Patterns

**Singleton exports**: Both `ai-handler.js` and `github-handler.js` export class instances, not classes:
```javascript
module.exports = new AIHandler();  // Not: module.exports = AIHandler;
```

**Conversation history**: `ai-handler.js` maintains a 10-message rolling history per session.

**Authorization**: Webhook only responds to the phone number in `YOUR_WHATSAPP` env var.

## Deployment Notes

- AWS region defaults to `eu-west-2` (London)
- EC2 instance type: `t2.micro` (Free Tier eligible)
- Security group opens ports: 22 (SSH), 80, 443, 3000 (webhook)
- SSH key saved to `~/.ssh/clawd-bot-key.pem`
- App deployed to `/opt/clawd-bot/` on EC2
