# PLAN: Complete Executive Assistant System

## Current State
- ClawdBot v2.3 running 24/7 on AWS EC2
- WhatsApp via Twilio SANDBOX (expires every 72 hours)
- 30 skills, voice transcription, GitHub integration
- Missing: scheduled briefings, voice calls, Telegram, browser, memory

---

## Phase 1: Fix Immediate Issues (Today)

### 1.1 Fix Twilio Sandbox Expiry
**Problem:** "Host not allowed" = sandbox session expired
**Solution Options:**

| Option | Cost | Effort | Recommendation |
|--------|------|--------|----------------|
| Re-join sandbox | FREE | 30 sec | Quick fix (temporary) |
| Buy real Twilio number | ~$1/month | 1 hour | **RECOMMENDED** |

**To get real number:**
```
1. Login: twilio.com/console
2. Phone Numbers → Buy a Number
3. Get a UK number (~$1/month)
4. Update config: TWILIO_WHATSAPP_NUMBER=+44xxxxxxxxx
5. Deploy to EC2
```

### 1.2 Enable Scheduled Briefings
**Problem:** Morning brief code exists but scheduler not triggering
**Fix:** Update scheduler to actually send messages

```javascript
// scheduler/jobs/morning-brief.js - add cron trigger
// 7:00 AM London time
schedule.scheduleJob('0 7 * * *', sendMorningBrief);

// 6:00 PM London time
schedule.scheduleJob('0 18 * * *', sendEODBrief);
```

### 1.3 Add MEMORY.md Context File
**Purpose:** Persistent context the bot reads on every startup
**Location:** `/opt/clawd-bot/02-whatsapp-bot/data/MEMORY.md`

```markdown
# MEMORY.md - Persistent Context

## Owner
- Name: [Your name]
- Phone: +447407655203
- Timezone: Europe/London

## Priority Projects
1. aws-clawd-bot - This bot
2. JUDO - Martial arts app
3. GQCars - Car hire business
4. giquina-accountancy - Tax filing

## Current Focus
- Complete executive assistant features
- Voice integration

## Do Not Disturb
- 9am-12pm (deep work)
- 2pm-5pm (deep work)

## Remember
- [Bot adds learned preferences here]
```

---

## Phase 2: Voice Calls via Twilio (This Week)

### 2.1 Twilio Voice Setup
**Goal:** Bot can call you and you can call the bot

**New skill:** `skills/voice-call/index.js`

```
Commands:
- "call me" → Bot calls your phone
- "call me in 5 minutes" → Scheduled call
- Incoming calls → Bot answers with AI voice
```

**Requirements:**
- Twilio Voice-enabled number (same number can do SMS + Voice)
- TwiML webhook endpoint on EC2
- Text-to-speech (Twilio built-in or ElevenLabs)

### 2.2 Voice Endpoints
```
POST /voice/outbound  → Bot initiates call to you
POST /voice/inbound   → Handles incoming calls
POST /voice/webhook   → TwiML responses during call
```

---

## Phase 3: Telegram Integration (This Week)

### 3.1 Why Telegram + WhatsApp
| Feature | WhatsApp | Telegram |
|---------|----------|----------|
| Real-time streaming | ❌ | ✅ |
| Threaded conversations | ❌ | ✅ |
| Bot API | Via Twilio ($) | Direct (FREE) |
| File sharing | Limited | Better |
| Code formatting | Poor | Good |

**Recommendation:** Use BOTH
- WhatsApp = Quick voice notes, mobile
- Telegram = Desktop, long conversations, free

### 3.2 Telegram Bot Setup
```
1. Message @BotFather on Telegram
2. /newbot → name it "ClawdBot"
3. Get API token
4. Add to config: TELEGRAM_BOT_TOKEN=xxx
5. New endpoint: POST /telegram/webhook
```

### 3.3 Telegram Skill
```
skills/telegram/index.js
- Same capabilities as WhatsApp
- Real-time response streaming
- Thread support
- Markdown formatting
```

---

## Phase 4: Browser/Web via MCP (Next Week)

### 4.1 Chrome MCP Integration
**Instead of Perplexity, use MCP browser tools**

You already have `mcp__claude-in-chrome__*` tools available!

**New skill:** `skills/web-research/index.js`
```
Commands:
- "research [topic]" → Opens Chrome, searches, summarizes
- "check [website]" → Reads page content
- "monitor [url]" → Watches for changes
```

### 4.2 Calendar/Email via Chrome MCP
**Instead of Google API, use Chrome automation:**
```
- "check my calendar" → Opens Google Calendar in Chrome, reads events
- "check email" → Opens Gmail, summarizes unread
- "schedule meeting" → Creates calendar event via Chrome
```

---

## Phase 5: Heartbeat Monitoring (Next Week)

### 5.1 System Health Checks
**Every 4 hours, silently check:**

```javascript
// scheduler/jobs/heartbeat.js
async function heartbeat() {
  const alerts = [];

  // Disk space
  const diskFree = await checkDiskSpace();
  if (diskFree < 10) alerts.push(`⚠️ Disk: ${diskFree}% free`);

  // Memory
  const memFree = await checkMemory();
  if (memFree < 20) alerts.push(`⚠️ RAM: ${memFree}% free`);

  // PM2 processes
  const pm2Status = await checkPM2();
  if (pm2Status.crashed.length > 0) {
    alerts.push(`⚠️ Crashed: ${pm2Status.crashed.join(', ')}`);
  }

  // Only message if problems found
  if (alerts.length > 0) {
    await sendWhatsApp(alerts.join('\n'));
  }
}

// Run every 4 hours
schedule.scheduleJob('0 */4 * * *', heartbeat);
```

---

## Phase 6: Proactive Behaviors (Next Week)

### 6.1 Default ON
- [x] Morning briefing 7am
- [x] EOD summary 6pm
- [ ] GitHub webhook alerts (CI fails, PRs)
- [ ] Heartbeat monitoring

### 6.2 Default OFF (enable with command)
- [ ] Auto-organize Downloads
- [ ] Auto-respond to emails
- [ ] Stock/crypto monitoring
- [ ] Auto-decline calendar invites

**Enable command:** "enable auto-organize downloads"
**Disable command:** "disable morning briefings"

---

## Implementation Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Fix Twilio (buy real number) | 1 hour | Stops "host not allowed" |
| 2 | Enable scheduled briefings | 2 hours | Morning/EOD summaries |
| 3 | Add MEMORY.md | 30 min | Persistent context |
| 4 | Telegram integration | 4 hours | Free, better UX |
| 5 | Twilio Voice calls | 6 hours | "Call me" feature |
| 6 | Heartbeat monitoring | 2 hours | Proactive alerts |
| 7 | Chrome MCP research | 4 hours | Web browsing |
| 8 | Calendar/Email via Chrome | 4 hours | Full assistant |

---

## Cost Estimate

| Item | Monthly Cost |
|------|-------------|
| AWS EC2 t3.micro | ~$8 |
| Twilio number | ~$1 |
| Twilio SMS/Voice | ~$5 (usage) |
| Claude API | ~$20-50 (usage) |
| Groq | FREE |
| Telegram | FREE |
| **Total** | ~$35-65/month |

---

## Files to Create/Modify

### New Files:
```
02-whatsapp-bot/
├── skills/
│   ├── telegram/index.js        # Telegram bot
│   ├── voice-call/index.js      # Twilio voice
│   └── web-research/index.js    # Chrome MCP research
├── scheduler/jobs/
│   ├── heartbeat.js             # 4-hour health checks
│   └── eod-brief.js             # 6pm summary
├── data/
│   └── MEMORY.md                # Persistent context
└── telegram-handler.js          # Telegram webhook handler
```

### Modify:
```
- index.js                       # Add Telegram + Voice endpoints
- scheduler/scheduler.js         # Enable morning/EOD/heartbeat jobs
- config/.env.local              # Add TELEGRAM_BOT_TOKEN, new Twilio number
```

---

## Next Steps

1. **Immediate:** Re-join Twilio sandbox OR buy real number
2. **Today:** Enable scheduled morning briefings
3. **This week:** Telegram + Voice integration
4. **Next week:** Chrome MCP + Heartbeat

Ready to execute? Say "build phase 1" to start.
