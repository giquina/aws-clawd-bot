# ClawdBot Telegram Setup Guide

Complete guide to setting up ClawdBot with Telegram as your primary control interface.

| Estimated Time | Difficulty |
|----------------|------------|
| 10-15 minutes  | Beginner   |

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Create Your Telegram Bot](#step-1-create-your-telegram-bot)
3. [Step 2: Get Your Chat ID](#step-2-get-your-chat-id)
4. [Step 3: Configure Environment Variables](#step-3-configure-environment-variables)
5. [Step 4: Deploy and Verify](#step-4-deploy-and-verify)
6. [Step 5: Test Your Bot](#step-5-test-your-bot)
7. [Step 6: Create Channel Groups](#step-6-create-channel-groups-optional)
8. [Step 7: Enable Voice Notes](#step-7-enable-voice-notes)
9. [Webhook Setup (Production)](#webhook-setup-production)
10. [Troubleshooting](#troubleshooting)
11. [Quick Command Reference](#quick-command-reference)
12. [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

- ClawdBot running on AWS EC2 (or local development environment)
- A Telegram account (mobile or desktop app)
- Your server's public IP address or domain name
- 10-15 minutes of setup time

---

## Step 1: Create Your Telegram Bot

Telegram bots are created through BotFather, Telegram's official bot management tool.

**1. Open Telegram and search for `@BotFather`**

Start a chat with BotFather (look for the verified blue checkmark).

**2. Create a new bot:**
```
/newbot
```

**3. Choose a display name:**
```
ClawdBot
```
This is the name users see in chats. Can include spaces and emojis.

**4. Choose a username:**
```
your_clawdbot
```

**Important:** Username must:
- End with `bot` (e.g., `my_clawdbot`, `clawdbot_dev`)
- Be unique across all of Telegram
- Contain only letters, numbers, and underscores
- Be 5-32 characters long

**5. Copy your bot token:**

BotFather will respond with your bot token:
```
Done! Congratulations on your new bot. You will find it at t.me/your_clawdbot.

Use this token to access the HTTP API:
123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
```

**Save this token securely** - it's your bot's password!

### Optional: Customize Your Bot

While chatting with BotFather, you can also:
```
/setdescription - Set the bot's description
/setabouttext - Set the "About" text shown in profile
/setuserpic - Upload a profile picture
/setcommands - Set command suggestions in the menu
```

---

## Step 2: Get Your Chat ID

Your chat ID is needed to authorize your account to use the bot.

**Method 1: Using the Bot API (Recommended)**

1. Start a chat with your new bot in Telegram
2. Send any message (e.g., "hello")
3. Open this URL in your browser (replace `YOUR_TOKEN` with your bot token):
```
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

4. Find your chat ID in the response:
```json
{
  "ok": true,
  "result": [{
    "message": {
      "chat": {
        "id": 123456789,    <-- This is your chat ID
        "first_name": "Your Name",
        "type": "private"
      }
    }
  }]
}
```

**Method 2: Using @userinfobot**

1. Search for `@userinfobot` in Telegram
2. Start a chat and send any message
3. It will reply with your user ID (same as chat ID for private chats)

**Method 3: Using @RawDataBot**

1. Search for `@RawDataBot` in Telegram
2. Send `/start`
3. Look for "Chat id" in the response

---

## Step 3: Configure Environment Variables

Add the following to your `.env` or `config/.env.local` file:

```env
# ============================================
# TELEGRAM CONFIGURATION (Required)
# ============================================

# Bot token from @BotFather (Step 1)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ

# Your personal chat ID for HQ alerts (Step 2)
TELEGRAM_HQ_CHAT_ID=123456789

# Authorized users who can control the bot (comma-separated for multiple)
TELEGRAM_AUTHORIZED_USERS=123456789

# ============================================
# PLATFORM PRIORITY (Optional)
# ============================================

# Set Telegram as primary platform (default: telegram)
DEFAULT_PLATFORM=telegram

# WhatsApp only receives critical alerts when Telegram is primary
WHATSAPP_CRITICAL_ALERTS=true

# ============================================
# WEBHOOK SECURITY (Optional but Recommended)
# ============================================

# Secret token for webhook verification
# Generate with: openssl rand -hex 32
TELEGRAM_WEBHOOK_SECRET=your_secret_here

# ============================================
# VOICE CALLING (Optional - see VOICE_SETUP.md)
# ============================================

# TWILIO_PHONE_NUMBER=+1234567890
# YOUR_PHONE_NUMBER=+447123456789
# BASE_URL=https://your-server.com
```

### Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_HQ_CHAT_ID` | Yes | Your chat ID for receiving all alerts |
| `TELEGRAM_AUTHORIZED_USERS` | Yes | Comma-separated list of authorized chat IDs |
| `DEFAULT_PLATFORM` | No | Primary messaging platform (default: telegram) |
| `TELEGRAM_WEBHOOK_SECRET` | No | Secret for webhook verification |

### Multiple Authorized Users

To allow multiple people to use the bot:
```env
TELEGRAM_AUTHORIZED_USERS=123456789,987654321,555555555
```

---

## Step 4: Deploy and Verify

### Local Development

```bash
# Navigate to the bot directory
cd C:\Giquina-Projects\aws-clawd-bot\02-whatsapp-bot

# Install dependencies (includes Telegraf)
npm install

# Start in development mode
npm run dev
```

You should see:
```
ClawdBot WhatsApp Server v2.3
=====================================
   Port: 3000

   [Telegram] Bot initialized
   [Telegram] Using long-polling (development mode)
   [Telegram] Bot verified: @your_clawdbot
```

### Deploy to AWS EC2

**Quick Deploy (code changes only):**
```bash
scp -i ~/.ssh/clawd-bot-key.pem 02-whatsapp-bot/*.js ubuntu@16.171.150.151:/opt/clawd-bot/02-whatsapp-bot/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 restart clawd-bot"
```

**Full Deploy (with config):**
```bash
# Copy environment file
scp -i ~/.ssh/clawd-bot-key.pem config/.env.local ubuntu@16.171.150.151:/opt/clawd-bot/config/

# Deploy code
tar -czvf /tmp/clawd-bot.tar.gz --exclude='node_modules' --exclude='.git' .
scp -i ~/.ssh/clawd-bot-key.pem /tmp/clawd-bot.tar.gz ubuntu@16.171.150.151:/tmp/
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 \
  "cd /opt/clawd-bot && sudo tar -xzf /tmp/clawd-bot.tar.gz && cd 02-whatsapp-bot && npm install && pm2 restart clawd-bot"
```

**Check logs:**
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 30"
```

Expected output:
```
[Telegram] Bot initialized
[Telegram] Bot verified: @your_clawdbot
[Telegram] Using long-polling (no webhook URL provided)
[ChatRegistry] Auto-registered Telegram HQ: 123456789
```

---

## Step 5: Test Your Bot

Open your Telegram chat with your bot and send these test messages:

### Basic Tests

| Send This | Expected Response |
|-----------|-------------------|
| `help` | List of all available commands |
| `status` | Bot health check, uptime, features |
| `my repos` | List of your GitHub repositories |
| `ai mode` | Current AI routing mode |

### Example Conversation

```
You: help

ClawdBot: ClawdBot Commands

Core Commands:
  help - Show this help
  status - Bot health check
  memory - View conversation history

Project Commands:
  my repos - List all GitHub repos
  switch to <repo> - Set active project
  project status - Show TODO tasks
  ...
```

```
You: status

ClawdBot: ClawdBot Status

Uptime: 2h 15m
Memory: 67.2 MB
Platform: telegram
AI Mode: balanced

Features:
  Memory: Active (42 facts)
  Skills: 30 loaded
  Scheduler: Running (3 jobs)
  GitHub: Connected

Ready to assist!
```

### Test Voice Notes

Send a voice message describing a task:
```
[Voice] "What's the status of the judo project?"
```

ClawdBot will:
1. Transcribe the voice note (Groq Whisper - FREE)
2. Process the request
3. Reply with project status

---

## Step 6: Create Channel Groups (Optional)

You can create dedicated Telegram groups for specific repos or companies, so alerts are automatically routed to the right place.

### Create a Repo Group

**1. Create a new Telegram group:**
- Open Telegram
- Create new group
- Add your bot as a member
- Make the bot an admin (so it can read all messages)

**2. Get the group chat ID:**
Send a message in the group, then check:
```
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

Group chat IDs are negative numbers (e.g., `-100123456789`).

**3. Register the group:**
In the group, send:
```
register chat for aws-clawd-bot
```

Now all alerts for `aws-clawd-bot` will go to this group!

### Create a Company Group

```
register chat for company GMH
```

Valid company codes: GMH, GACC, GCAP, GQCARS, GSPV

### Notification Levels

Set what notifications a chat receives:
```
set notifications all       # Everything
set notifications critical  # Only errors/failures
set notifications digest    # Daily summary only
```

### View Registry

```
list chats
```

Shows all registered chats and their contexts.

---

## Step 7: Enable Voice Notes

Voice notes are automatically enabled when Groq is configured:

```env
# Add to your .env file
GROQ_API_KEY=gsk_xxxxxxxxxxxx
```

Get a FREE API key from: https://console.groq.com

Voice notes are transcribed using Groq Whisper (FREE, no cost) and then processed normally.

### Voice Note Tips

- Keep voice notes under 60 seconds for best results
- Speak clearly and mention project names explicitly
- Voice notes are transcribed to text, then processed as commands

---

## Webhook Setup (Production)

For production deployments, set up a webhook instead of long-polling:

### Why Use Webhooks?

| Feature | Long-Polling | Webhook |
|---------|--------------|---------|
| Latency | Higher (polls every few seconds) | Instant |
| Resources | Constant connection | On-demand |
| Reliability | Good | Better |
| SSL Required | No | Yes (HTTPS) |

### Requirements

- HTTPS with valid SSL certificate (self-signed won't work)
- Public domain or IP with port 443, 80, 88, or 8443
- Firewall allowing Telegram IPs

### Setup Steps

**1. Ensure HTTPS is configured:**

Option A: Use a reverse proxy (nginx, Caddy)
Option B: Use Cloudflare or similar
Option C: Get SSL cert from Let's Encrypt

**2. Set the webhook URL:**

```bash
# Replace with your domain and token
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/telegram-webhook"
```

Or with secret token (recommended):
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/telegram-webhook&secret_token=YOUR_SECRET"
```

**3. Verify webhook is set:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/telegram-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### Remove Webhook (Switch Back to Polling)

```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## Troubleshooting

### Bot Not Responding

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| No response at all | Bot not running | Check `pm2 logs clawd-bot` |
| "Unauthorized" | Chat ID not in authorized list | Add to `TELEGRAM_AUTHORIZED_USERS` |
| Delayed responses | Long-polling issues | Set up webhook for production |

**Debug Steps:**
```bash
# 1. Check if bot is running
curl http://localhost:3000/health

# 2. Check PM2 status
pm2 status

# 3. Check logs for errors
pm2 logs clawd-bot --lines 50

# 4. Verify token is valid
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

### Voice Notes Not Working

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| "Voice not configured" | Missing Groq key | Add `GROQ_API_KEY` to .env |
| Transcription empty | Audio too short/quiet | Speak clearly, >1 second |
| File too large | Voice note >20MB | Keep notes under 60 seconds |

### Webhook Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid SSL certificate" | Self-signed cert | Use valid SSL from CA |
| "Connection timed out" | Server not reachable | Check firewall, ensure HTTPS port open |
| "Bad Request: bad webhook" | Invalid URL format | Must be HTTPS with valid domain |

### Common Error Messages

**"Bot token invalid"**
- Regenerate token with `/revoke` in BotFather
- Update `TELEGRAM_BOT_TOKEN` in .env
- Restart the bot

**"Chat not found"**
- User hasn't started a chat with the bot yet
- Send `/start` to the bot first

**"Forbidden: bot was blocked by the user"**
- User blocked the bot
- User must unblock and send a message first

---

## Quick Command Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `status` | Bot health check and statistics |
| `memory` | View conversation history and facts |

### Project Commands

| Command | Description |
|---------|-------------|
| `my repos` | List all your GitHub repositories |
| `switch to <repo>` | Set active project context |
| `project status [repo]` | Show TODO.md tasks |
| `what's left [repo]` | Show incomplete tasks |
| `readme [repo]` | Show README summary |
| `files [repo]` | List key project files |

### Deployment Commands

| Command | Description |
|---------|-------------|
| `deploy <repo>` | Deploy with confirmation |
| `run tests <repo>` | Run npm test |
| `logs <repo>` | View PM2 logs |
| `restart <repo>` | Restart PM2 process |
| `build <repo>` | Run npm build |
| `remote status` | Show all PM2 processes |

### AI Commands

| Command | Description |
|---------|-------------|
| `ai mode` | Show current AI routing mode |
| `ai mode economy` | Use FREE Groq for everything |
| `ai mode quality` | Use Claude for everything |
| `ai mode balanced` | Smart routing (default) |
| `ai stats` | View AI usage and savings |

### Chat Registry Commands

| Command | Description |
|---------|-------------|
| `register chat for <repo>` | Register chat for repo alerts |
| `register chat for company <code>` | Register for company alerts |
| `list chats` | Show all registered chats |
| `unregister chat` | Remove chat registration |
| `set notifications <level>` | Set notification level |

### Action Commands

| Command | Description |
|---------|-------------|
| `undo` | Undo last action |
| `pause` | Pause current action |
| `explain` | Explain pending action |
| `confirm` | Confirm pending action |
| `cancel` | Cancel pending action |

---

## Next Steps

After completing Telegram setup:

1. **Set up Voice Calling** - See [VOICE_SETUP.md](./VOICE_SETUP.md)
2. **Configure GitHub Webhooks** - Real-time repo alerts
3. **Create Company Channels** - Per-company alert routing
4. **Set up Morning Brief** - Daily automated summary

### Useful Documentation

- [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) - AWS EC2 setup
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Extended troubleshooting
- [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) - WhatsApp as backup platform

---

## Telegram vs WhatsApp Comparison

| Feature | Telegram | WhatsApp (Twilio) |
|---------|----------|-------------------|
| **Cost** | FREE | ~$0.005/message |
| **Message Limit** | 4,096 chars | ~1,600 chars |
| **Media Size** | 50MB | 16MB |
| **Markdown** | Full support | Limited |
| **Inline Buttons** | Yes | No |
| **Bot Setup** | Free, instant | Requires Twilio account |
| **Groups** | Full bot support | Limited |

**Recommendation:** Use Telegram as primary, WhatsApp as backup for critical alerts only.

---

**Document Version:** 1.0
**Last Updated:** February 2026
**Applies to:** ClawdBot v2.3+
