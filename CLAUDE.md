# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawdBot v2.1 is a WhatsApp-controlled AI coding assistant running 24/7 on AWS EC2. Users send commands via WhatsApp (through Twilio), which triggers skills to interact with GitHub, track company deadlines, manage tasks, and more.

**Live Server:** `16.171.150.151:3000` (eu-north-1)

## Commands

```bash
# Development
cd 02-whatsapp-bot && npm install
npm run dev                    # Development with nodemon auto-reload
npm start                      # Production mode
curl localhost:3000/health     # Health check

# Deploy to AWS EC2
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' .
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && pm2 restart clawd-bot"

# EC2 Instance Connect (if SSH permission denied)
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-009f070a76a0d91c1 \
  --instance-os-user ubuntu \
  --ssh-public-key file://~/.ssh/clawd-bot-key.pem.pub \
  --region eu-north-1
```

## Architecture

```
WhatsApp → Twilio → Express (index.js) → Hooks → Skills Router (23 skills)
                                           ↓
                    ┌──────────────────────┼──────────────────────┐
                    ↓                      ↓                      ↓
              Smart Router           Error Alerter          Skill Registry
              (NLP → cmds)          (crash alerts)         (command routing)
```

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

## Key Files

| File | Purpose |
|------|---------|
| `02-whatsapp-bot/index.js` | Express server, webhook handlers |
| `02-whatsapp-bot/ai-handler.js` | Claude API integration, system prompt |
| `02-whatsapp-bot/skills/skill-registry.js` | Skill routing, dynamic docs |
| `02-whatsapp-bot/skills/skills.json` | Enabled skills config |
| `02-whatsapp-bot/hooks/smart-router.js` | NLP → command conversion |
| `config/.env.local` | Environment variables (never modify via code) |

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

## Important Notes

- **WhatsApp message limit:** ~4000 characters max
- **Skill priority:** Higher number = checked first (help=100, github=10)
- **Authorization:** Only `YOUR_WHATSAPP` env var number can control the bot
- **Skills auto-document:** AI handler reads from registry via `generateSkillDocs()`
