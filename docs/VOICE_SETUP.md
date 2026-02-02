# ClawdBot Voice Setup Guide

Configure voice features for ClawdBot - voice notes, transcription, and outbound calling.

| Estimated Time | Difficulty |
|----------------|------------|
| 5-15 minutes   | Beginner   |

---

## Table of Contents

1. [Voice Features Overview](#voice-features-overview)
2. [Voice Notes (Telegram/WhatsApp)](#voice-notes-telegramwhatsapp)
3. [Voice Calling (Twilio)](#voice-calling-twilio)
4. [Voice Commands](#voice-commands)
5. [Troubleshooting](#troubleshooting)

---

## Voice Features Overview

ClawdBot supports three voice capabilities:

| Feature | Platform | Cost | Setup Time |
|---------|----------|------|------------|
| Voice Notes | Telegram/WhatsApp | FREE (Groq) | 2 minutes |
| Voice Transcription | Any audio | FREE (Groq) | 2 minutes |
| Voice Calling | Phone | ~$0.01/min (Twilio) | 15 minutes |

---

## Voice Notes (Telegram/WhatsApp)

Voice notes are transcribed using Groq Whisper (FREE) and processed as text commands.

### Setup

**1. Get a Groq API Key:**

- Go to: https://console.groq.com
- Sign up (free)
- Create an API key
- Copy the key (starts with `gsk_...`)

**2. Add to Environment:**

```env
# Add to config/.env.local
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. Restart the bot:**

```bash
pm2 restart clawd-bot
```

### How It Works

```
1. You send a voice note via Telegram or WhatsApp
2. ClawdBot downloads the audio file
3. Groq Whisper transcribes speech to text (FREE)
4. Transcribed text is processed as a normal command
5. Response is sent back as text
```

### Usage Tips

- Speak clearly and at a normal pace
- Keep voice notes under 60 seconds for best accuracy
- Mention project/repo names explicitly
- Pause briefly between different ideas

### Example Voice Commands

```
"What's the status of the judo project?"
-> Transcribes to: "What's the status of the judo project?"
-> Routes to project-context skill
-> Returns TODO.md summary

"Deploy clawd bot to production"
-> Transcribes to: "Deploy clawd bot to production"
-> Triggers deploy confirmation
-> You confirm, deployment runs
```

### Supported Audio Formats

| Format | Telegram | WhatsApp |
|--------|----------|----------|
| OGG/Opus | Native | - |
| MP3 | Yes | Yes |
| M4A | Yes | Yes |
| WAV | Yes | Yes |
| WEBM | Yes | - |

---

## Voice Calling (Twilio)

Enable outbound voice calls for urgent alerts or "call me" functionality.

### Prerequisites

- Twilio account with voice capability
- Verified phone number
- ~$1/month for phone number + ~$0.01/min for calls

### Setup

**1. Get a Twilio Phone Number:**

- Go to: https://console.twilio.com
- Navigate to: Phone Numbers > Manage > Buy a number
- Select a number with Voice capability
- Note the phone number

**2. Configure Environment:**

```env
# Add to config/.env.local

# Twilio Voice Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+12025551234

# Your phone number for receiving calls
YOUR_PHONE_NUMBER=+447123456789

# Server URL (for TwiML webhooks)
BASE_URL=https://your-server.com
```

**3. Restart the bot:**

```bash
pm2 restart clawd-bot
```

### Voice Call Commands

| Command | Description |
|---------|-------------|
| `call me` | Initiate a voice call to your phone |
| `call me about <topic>` | Call with specific context |
| `urgent alert` | Triggers call for critical issues |

### Call Escalation

Calls can be triggered automatically by the alert escalation system:

```
1. Critical alert detected (e.g., CI failure)
2. Telegram notification sent (primary)
3. WhatsApp notification sent (backup)
4. If no response in 5 minutes, phone call initiated
```

Configure escalation thresholds:
```env
# Alert escalation settings
ALERT_ESCALATION_TIMEOUT=300000  # 5 minutes before call
CALL_ON_CRITICAL_ALERTS=true
```

### TwiML Webhook Setup

For advanced voice features, configure a webhook:

**1. In Twilio Console:**
- Go to: Phone Numbers > Manage > Active numbers
- Click your number
- Under "Voice & Fax", set:
  - "A call comes in": Webhook
  - URL: `https://your-server.com/voice-webhook`
  - HTTP: POST

**2. The webhook handles:**
- Incoming calls
- Voice menu navigation
- Text-to-speech responses

---

## Voice Commands

### General Voice Tips

```
DO say:                          DON'T say:
"Deploy the clawd bot"           "Um, deploy that thing"
"Status of judo project"         "What about judo"
"Run tests on armora"            "Tests... armora maybe?"
```

### Natural Language Examples

The smart router handles natural speech:

| You Say | Interpreted As |
|---------|----------------|
| "What's happening with judo?" | `project status judo` |
| "Ship clawd to production" | `deploy aws-clawd-bot` |
| "Any issues with my repos?" | `project status` (all repos) |
| "Read me the todo for armora" | `project status armora` |
| "Switch to the dashboard project" | `switch to clawd-dashboard` |

### Voice + Actions

Voice notes can trigger actions that require confirmation:

```
Voice: "Create a new landing page for the judo website"

Bot: I'll create a landing page for judo. This will:
     - Create new branch: feature/landing-page
     - Generate page component
     - Open PR for review

     [Confirm] [Cancel]
```

---

## Troubleshooting

### Voice Notes Not Transcribing

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Voice not configured" | Missing GROQ_API_KEY | Add Groq API key to .env |
| Empty transcription | Audio too quiet | Speak louder, closer to mic |
| "File too large" | Voice note >25MB | Keep notes under 2 minutes |
| Garbled transcription | Poor audio quality | Re-record in quieter environment |

**Debug voice processing:**
```bash
# Check logs for transcription
pm2 logs clawd-bot --lines 50 | grep -i "whisper\|voice\|transcri"
```

### Voice Calls Not Working

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Voice not available" | Twilio not configured | Add Twilio credentials |
| Call fails immediately | Invalid phone number | Check number format (+country code) |
| "Invalid URL" | BASE_URL not HTTPS | Use HTTPS for production |
| No audio | TwiML webhook issue | Check webhook configuration |

**Test Twilio connection:**
```bash
# In the bot directory
node -e "
const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
twilio.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch()
  .then(a => console.log('Connected:', a.friendlyName))
  .catch(e => console.error('Error:', e.message));
"
```

### Transcription Accuracy

For better transcription accuracy:

1. **Environment:** Record in a quiet space
2. **Microphone:** Hold phone close, speak into mic
3. **Speech:** Speak at normal pace, enunciate clearly
4. **Technical terms:** Spell out unusual words first time
5. **Context:** Mention project names explicitly

---

## Cost Summary

### Voice Notes (Groq Whisper)

- **Cost:** FREE
- **Limit:** 25MB file size
- **Rate:** ~100 requests/minute

### Voice Calls (Twilio)

| Item | Cost |
|------|------|
| Phone number | ~$1/month |
| Outbound calls (US) | $0.013/min |
| Outbound calls (UK) | $0.015/min |
| Outbound calls (other) | $0.02-0.10/min |

**Example monthly cost:**
- Phone number: $1
- 10 alert calls (avg 1 min): $0.15
- **Total: ~$1.15/month**

---

## Next Steps

- Configure [Alert Escalation](./ALERTS.md) for automatic call triggers
- Set up [Morning Brief](../02-whatsapp-bot/skills/morning-brief/README.md) for daily voice summaries
- Review [Telegram Setup](./TELEGRAM_SETUP.md) for primary messaging

---

**Document Version:** 1.0
**Last Updated:** February 2026
**Applies to:** ClawdBot v2.3+
