# ClawdBot Setup Guide

**Complete setup instructions for AWS ClawdBot - your WhatsApp-controlled AI coding assistant.**

| Estimated Time | Difficulty |
|----------------|------------|
| 30-45 minutes  | Beginner   |

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [GitHub Webhook Setup](#3-github-webhook-setup)
4. [Running Locally](#4-running-locally)
5. [Testing](#5-testing)
6. [AWS Deployment](#6-aws-deployment)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

Before starting, ensure you have the following accounts and tools ready.

### Required Software

| Tool | Minimum Version | Download |
|------|-----------------|----------|
| Node.js | 18.0+ | https://nodejs.org/ |
| npm | 9.0+ | Included with Node.js |
| Git | 2.30+ | https://git-scm.com/ |

Verify installations:
```bash
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher
git --version     # Should show 2.30.x or higher
```

### Required Accounts

#### 1. Twilio Account (for WhatsApp integration)

Twilio acts as the bridge between WhatsApp and your bot.

1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account (includes $15 credit)
3. Verify your phone number
4. Navigate to the Twilio Console: https://console.twilio.com
5. Note down:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click to reveal)
6. Enable WhatsApp Sandbox:
   - Go to Messaging > Try it out > Send a WhatsApp message
   - Follow the instructions to connect your phone to the sandbox
   - Note the **WhatsApp Sandbox Number** (usually `+14155238886`)

#### 2. GitHub Account

Required for repository monitoring and webhook notifications.

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g., "ClawdBot Access")
4. Select expiration (recommend 90 days or "No expiration" for personal use)
5. Select these scopes:
   - `repo` - Full control of private repositories
   - `workflow` - Update GitHub Actions workflows
   - `admin:org` - Read and write org and team data (optional)
6. Click **Generate token**
7. **Copy the token immediately** - you won't see it again!

#### 3. Anthropic API Key (for Claude AI)

The brain of your bot - powers all AI responses.

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-...`)

---

## 2. Environment Configuration

All configuration is managed through environment variables in a `.env` file.

### Setup Steps

```bash
# Navigate to the project
cd C:\Giquina-Projects\aws-clawd-bot

# Copy the example configuration
copy config\.env.example config\.env.local
```

### Configuration Reference

Edit `config\.env.local` with your values:

```env
# ============================================
# REQUIRED CONFIGURATION
# ============================================

# Anthropic API Key (Claude AI)
# Get from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx

# Twilio WhatsApp Configuration
# Get from: https://console.twilio.com
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886

# Your WhatsApp Number (the only number that can use the bot)
# Include country code, e.g., +44 for UK, +1 for US
YOUR_WHATSAPP=+447700123456

# GitHub Configuration
# Create token at: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-github-username

# Repositories to Monitor (comma-separated, no spaces)
REPOS_TO_MONITOR=repo1,repo2,repo3

# ============================================
# OPTIONAL CONFIGURATION
# ============================================

# GitHub Webhook Secret (recommended for security)
# Generate a random string: openssl rand -hex 32
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here

# Brave Search API Key (for web search features)
# Get from: https://api.search.brave.com/
BRAVE_API_KEY=

# OpenWeather API Key (for weather features)
# Get from: https://openweathermap.org/api
OPENWEATHER_API_KEY=

# ============================================
# APPLICATION SETTINGS
# ============================================

# Server port (default: 3000)
PORT=3000

# Environment mode
NODE_ENV=development

# AWS Region (for deployment)
AWS_REGION=eu-west-2

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
```

### Environment Variable Details

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude AI API key for intelligent responses |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio authentication token |
| `TWILIO_WHATSAPP_NUMBER` | Yes | Twilio WhatsApp sandbox number |
| `YOUR_WHATSAPP` | Yes | Your phone number (only authorized user) |
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `GITHUB_USERNAME` | Yes | Your GitHub username |
| `REPOS_TO_MONITOR` | Yes | Comma-separated list of repository names |
| `GITHUB_WEBHOOK_SECRET` | No | Shared secret for webhook signature verification |
| `BRAVE_API_KEY` | No | Enables web search capabilities |
| `OPENWEATHER_API_KEY` | No | Enables weather information features |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment mode (development/production) |
| `LOG_LEVEL` | No | Logging verbosity (debug/info/warn/error) |

---

## 3. GitHub Webhook Setup

GitHub webhooks send real-time notifications to ClawdBot when events occur in your repositories.

### Step-by-Step Setup

#### Step 1: Navigate to Repository Settings

1. Go to your GitHub repository
2. Click **Settings** tab
3. In the left sidebar, click **Webhooks**
4. Click **Add webhook**

#### Step 2: Configure Webhook URL

| Field | Value |
|-------|-------|
| **Payload URL** | `https://your-server.com/github-webhook` |
| **Content type** | `application/json` |
| **Secret** | Your `GITHUB_WEBHOOK_SECRET` value (optional but recommended) |

For local development with ngrok:
```
https://abc123.ngrok.io/github-webhook
```

For AWS deployment:
```
http://your-ec2-ip:3000/github-webhook
```

#### Step 3: Select Events

Choose **Let me select individual events** and enable:

| Event | Notification Type |
|-------|-------------------|
| **Push** | Code commits to branches |
| **Pull requests** | PR opened, closed, merged |
| **Issues** | Issues opened, closed, reopened |
| **Workflow runs** | CI/CD pipeline status |
| **Create** | Branch or tag creation |
| **Releases** | New releases published |

#### Step 4: Save

1. Ensure **Active** is checked
2. Click **Add webhook**
3. GitHub will send a `ping` event to verify the connection
4. You should receive a WhatsApp message: `[repo-name] Webhook connected successfully`

### Webhook Security

If you configured `GITHUB_WEBHOOK_SECRET`, GitHub signs each webhook payload. ClawdBot verifies this signature to ensure webhooks are genuine.

**Generate a secure secret:**
```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

---

## 4. Running Locally

### Quick Start

```bash
# Navigate to the WhatsApp bot directory
cd C:\Giquina-Projects\aws-clawd-bot\02-whatsapp-bot

# Copy environment file (if not already done)
copy ..\config\.env.local .env

# Install dependencies
npm install

# Start the server
npm start
```

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Expected Output

```
ClawdBot WhatsApp Server v2.1
=====================================
   Port: 3000
   User: +447700123456
   Repos: repo1,repo2,repo3

   Endpoints:
   - POST /webhook        - Twilio WhatsApp
   - POST /github-webhook - GitHub events
   - GET  /health         - Health check

   Features:
   - Memory: Persistent
   - Skills: Loaded
   - Scheduler: Active
   - GitHub Webhook: Secured
```

### Exposing Local Server (for testing)

WhatsApp requires a public URL. Use ngrok for local development:

```bash
# Install ngrok: https://ngrok.com/download

# Expose your local server
ngrok http 3000
```

Copy the `https://...ngrok.io` URL and configure it in:
1. Twilio Console > Messaging > Settings > WhatsApp Sandbox
2. Set webhook URL to: `https://your-ngrok-url/webhook`

---

## 5. Testing

### Basic Connectivity Test

1. **Send "hi" to your Twilio WhatsApp number**
   - You should receive a greeting message from ClawdBot
   - If no response, check server logs for errors

2. **Send "status" to verify all systems**
   - Expected response includes uptime, RAM usage, and feature status:
   ```
   ClawdBot is online!

   Uptime: 0h 5m
   RAM: 45.2 MB
   Repos: 3
   Features: Memory, Skills, Scheduler
   Messages: 2 | Facts: 0

   Type "help" for commands!
   ```

3. **Send "help" to see all commands**
   - Lists all available commands and skills

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "online",
  "uptime": 123.456,
  "timestamp": "2026-01-31T12:00:00.000Z",
  "memory": {
    "heapUsed": "45.23 MB"
  },
  "features": {
    "persistentMemory": true,
    "skillsFramework": true,
    "scheduler": true
  }
}
```

### GitHub Webhook Test

1. Make a small commit to a monitored repository
2. You should receive a WhatsApp notification:
   ```
   [repo-name] Push: 1 commit to main by @username
   "Your commit message here"
   ```

### Command Reference

| Command | Description |
|---------|-------------|
| `hi` | Start conversation, get greeting |
| `status` | Check bot health and stats |
| `help` | List all available commands |
| `list repos` | Show monitored repositories |
| `analyze <repo>` | Get repository analysis |
| `morning brief` | Get your daily briefing |
| `brief settings` | View briefing configuration |

---

## 6. AWS Deployment

ClawdBot includes an automated deployment script for AWS EC2.

### Prerequisites for AWS Deployment

1. **AWS Account** - https://aws.amazon.com
2. **AWS CLI installed** - https://aws.amazon.com/cli/
3. **AWS credentials configured**:
   ```bash
   aws configure
   # Enter your AWS Access Key ID
   # Enter your AWS Secret Access Key
   # Enter default region (e.g., eu-west-2)
   # Enter output format (json)
   ```

### Running the Deployment Script

```powershell
cd C:\Giquina-Projects\aws-clawd-bot\scripts
.\deploy-to-aws.ps1
```

### What the Script Does

1. **Creates Security Group** - Opens ports 22 (SSH), 80, 443, 3000
2. **Creates SSH Key Pair** - Saves to `~/.ssh/clawd-bot-key.pem`
3. **Launches EC2 Instance** - t2.micro (Free Tier eligible)
4. **Installs Dependencies** - Docker, Node.js 20
5. **Deploys Application** - Copies code to `/opt/clawd-bot/`

### Post-Deployment Steps

1. **Update Twilio webhook URL**
   - Go to Twilio Console
   - Set webhook to: `http://YOUR-EC2-IP:3000/webhook`

2. **Update GitHub webhook URL**
   - Go to each repository's webhook settings
   - Update Payload URL to: `http://YOUR-EC2-IP:3000/github-webhook`

3. **Verify deployment**
   - Send "status" via WhatsApp
   - Check health endpoint: `curl http://YOUR-EC2-IP:3000/health`

### SSH Access

```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@YOUR-EC2-IP
```

### View Logs

```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@YOUR-EC2-IP 'docker logs clawd-bot'
```

---

## 7. Troubleshooting

### Common Issues and Solutions

#### No response from WhatsApp

| Possible Cause | Solution |
|----------------|----------|
| Server not running | Check `npm start` output for errors |
| Wrong webhook URL in Twilio | Verify URL matches your server address |
| Phone not in sandbox | Re-join Twilio WhatsApp sandbox |
| Unauthorized number | Ensure `YOUR_WHATSAPP` matches your phone |

**Debug steps:**
```bash
# Check if server is running
curl http://localhost:3000/health

# Check server logs
# Look for "Received:" messages when you send WhatsApp
```

#### "AI service not configured" error

**Cause:** Missing or invalid `ANTHROPIC_API_KEY`

**Solution:**
1. Verify key in `.env` file
2. Ensure no extra spaces or quotes around the key
3. Test key validity at https://console.anthropic.com/

#### GitHub webhook not working

| Symptom | Solution |
|---------|----------|
| No ping received | Check Payload URL is correct and reachable |
| Signature failed | Ensure `GITHUB_WEBHOOK_SECRET` matches in both places |
| Events not triggering | Verify correct events are selected in webhook settings |

**View webhook delivery history:**
1. Go to repository Settings > Webhooks
2. Click on your webhook
3. Scroll to "Recent Deliveries"
4. Check response codes and payloads

#### Server crashes on startup

**Common causes:**
1. **Port already in use**
   ```bash
   # Find process using port 3000
   netstat -ano | findstr :3000

   # Kill the process (replace PID with actual number)
   taskkill /PID <PID> /F
   ```

2. **Missing dependencies**
   ```bash
   cd 02-whatsapp-bot
   rm -rf node_modules
   npm install
   ```

3. **Invalid environment variables**
   - Check for typos in `.env` file
   - Ensure all required variables are set

#### Memory/Database errors

**Cause:** SQLite database corruption or permissions

**Solution:**
```bash
# Backup and reset database
cd 02-whatsapp-bot
mv memory/clawd-memory.db memory/clawd-memory.db.backup
npm start  # Will create fresh database
```

### Getting Help

1. **Check logs** - Most errors are logged to console
2. **Health endpoint** - `GET /health` shows system status
3. **GitHub Issues** - Report bugs with full error logs
4. **Debug mode** - Set `LOG_LEVEL=debug` for verbose output

### Log Interpretation

| Log Message | Meaning |
|-------------|---------|
| `Received: "..." from whatsapp:+...` | Message received successfully |
| `Sent: "..."` | Response sent to user |
| `[GitHub Webhook] Sent: "..."` | Webhook notification delivered |
| `Skill error: ...` | A skill failed to execute |
| `Error calling Claude AI: ...` | AI API request failed |

---

## Next Steps

After completing setup:

1. **Explore commands** - Send "help" to see all available features
2. **Set up morning brief** - Send "set brief time 08:00"
3. **Add more repositories** - Update `REPOS_TO_MONITOR` in `.env`
4. **Customize skills** - Check `02-whatsapp-bot/skills/` directory

For advanced configuration, see:
- `docs/AWS_DEPLOYMENT.md` - Detailed AWS setup
- `docs/WHATSAPP_SETUP.md` - Twilio configuration details
- `docs/TROUBLESHOOTING.md` - Extended troubleshooting guide

---

**Document Version:** 2.0
**Last Updated:** January 2026
**Applies to:** ClawdBot v2.1+
