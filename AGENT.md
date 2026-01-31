# AGENT.md

This file provides guidance to AI coding assistants (Claude, GPT, Copilot, Cursor, etc.) when working with this codebase.

## Project: ClawdBot v2.0

A WhatsApp-controlled AI coding assistant running 24/7 on AWS EC2. Send commands via WhatsApp to write code, create PRs, trigger workflows, and manage GitHub repos.

**Live:** `16.171.150.151:3000` (eu-north-1)

## Architecture

```
WhatsApp → Twilio → Express (index.js) → Skills Router (13 skills)
                                              ↓
                    ┌─────────────────────────┼─────────────────────────┐
                    ↓                         ↓                         ↓
              GitHub/Multi-Repo         Coder/Review              AI Handler
              (repo operations)        (AI code writing)        (Claude API)
```

## Key Files

| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Main webhook server |
| `02-whatsapp-bot/ai-handler.js` | Claude API + system prompt |
| `02-whatsapp-bot/skills/base-skill.js` | Abstract skill class |
| `02-whatsapp-bot/skills/multi-repo/index.js` | Cross-repo search/compare |
| `02-whatsapp-bot/skills/coder/index.js` | AI code writing, creates PRs |
| `02-whatsapp-bot/skills/github/index.js` | GitHub ops (files, PRs, branches) |
| `config/.env.local` | Environment variables |

## Skills (13 loaded)

| Skill | Priority | Commands |
|-------|----------|----------|
| `multi-repo` | 25 | `search all <query>`, `compare repos`, `todo all` |
| `coder` | 20 | `fix issue`, `edit file`, `create file`, `quick fix` |
| `review` | 18 | `review pr`, `review file`, `improve` |
| `actions` | 15 | `workflows`, `runs`, `run workflow` |
| `stats` | 12 | `stats`, `contributors`, `activity`, `languages` |
| `github` | 10 | `list repos`, `read file`, `search`, `view pr`, `create branch/issue/pr` |
| `memory` | 50 | `remember`, `my facts`, `forget` |
| `tasks` | 35 | `add task`, `my tasks`, `complete task` |
| `help` | 100 | `help`, `status`, `skills` |

## Development

```bash
cd 02-whatsapp-bot
npm install
npm run dev      # Development (nodemon)
npm start        # Production
curl localhost:3000/health
```

## Environment Variables

```
ANTHROPIC_API_KEY     # Claude API
GITHUB_TOKEN          # GitHub PAT (repo, workflow scopes)
GITHUB_USERNAME       # Your GitHub username
REPOS_TO_MONITOR      # Comma-separated: repo1,repo2,repo3
TWILIO_ACCOUNT_SID    # Twilio credentials
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
YOUR_WHATSAPP         # Only this number can use bot
```

## Code Patterns

**Singleton exports:**
```javascript
module.exports = new AIHandler();  // Instance, not class
```

**Skill template:**
```javascript
const BaseSkill = require('../base-skill');

class MySkill extends BaseSkill {
  name = 'my-skill';
  priority = 10;
  commands = [{ pattern: /^my cmd$/i, description: '...' }];

  async execute(command, context) {
    return this.success('Done!');  // or this.error('Failed')
  }
}
module.exports = MySkill;
```

## Deploy

```bash
# Create package
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' --exclude='deploy-package' .

# Upload & deploy
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && \
   cd 02-whatsapp-bot && npm install --production && pm2 restart clawd-bot"
```

## Notes for AI Agents

1. **Never modify `.env.local`** - Contains real API keys
2. **Skill priority** - Higher number = matched first
3. **WhatsApp limit** - Keep responses under ~4000 chars
4. **Test locally** - Use `npm run dev` before deploying
5. **Skills auto-load** - Just create `skills/<name>/index.js`

## Owner

GitHub: @giquina
Repos: armora, gqcars-manager, JUDO, giquina-accountancy-direct-filing, aws-clawd-bot
