# ClawdBot Quick Start Guide

Get ClawdBot running in 2 minutes with Telegram.

---

## Prerequisites

- Node.js 18+ installed
- A Telegram account

---

## Step 1: Create Telegram Bot (1 minute)

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Name it: `ClawdBot`
4. Username: `your_name_clawdbot` (must end in `bot`)
5. Copy the token: `123456789:ABCdef...`

---

## Step 2: Get Your Chat ID (30 seconds)

1. Message your new bot "hello"
2. Open: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find your chat ID: `"chat":{"id":123456789}`

---

## Step 3: Configure & Run (30 seconds)

```bash
# Clone and setup
cd C:\Giquina-Projects\aws-clawd-bot\02-whatsapp-bot
npm install

# Create config (copy example if exists, or create new)
```

Create `config/.env.local`:
```env
# Required
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_HQ_CHAT_ID=123456789
TELEGRAM_AUTHORIZED_USERS=123456789

# AI (Claude required, Groq optional but free)
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_USERNAME=your-username
```

Start the bot:
```bash
npm run dev
```

---

## Step 4: Test It

Send these to your bot:

| Send | Response |
|------|----------|
| `help` | Command list |
| `status` | Bot health |
| `my repos` | Your GitHub repos |

---

## You're Done!

For detailed setup, see:
- [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md) - Full Telegram guide
- [VOICE_SETUP.md](./VOICE_SETUP.md) - Voice notes & calling
- [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) - Deploy to cloud

---

## Quick Reference

### Essential Commands

```
help                 - Show commands
status               - Bot health
my repos             - List repos
switch to <repo>     - Set active project
project status       - Show TODO tasks
deploy <repo>        - Deploy (with confirmation)
```

### Voice Notes

Just send a voice message - it's transcribed and processed automatically (requires GROQ_API_KEY, FREE).

### AI Modes

```
ai mode economy   - FREE (Groq only)
ai mode balanced  - Smart routing (default)
ai mode quality   - Best quality (Claude)
```

---

**Time to complete: 2 minutes**
