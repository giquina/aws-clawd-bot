# Morning Brief Skill - START HERE

Welcome! This document provides a quick orientation to the Morning Brief Skill for ClawdBot.

## What Is This Skill?

The Morning Brief Skill enables ClawdBot to:
- Send you a daily briefing with your pending tasks
- Display quick statistics about your activity
- Provide time-appropriate greetings and motivation
- Let you schedule the brief for your preferred time

## Quick Navigation

### For Users
**I want to use this skill:**
1. Start with: [Simple Usage Examples](#simple-usage-examples)
2. Then read: [README.md](./README.md) - Full feature documentation
3. Reference: [EXAMPLES.md](./EXAMPLES.md) - Real-world examples

### For Developers
**I need to understand how it works:**
1. Start with: [Technical Overview](#technical-overview)
2. Then read: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Architecture
3. Reference: [CONFIG.md](./CONFIG.md) - Configuration options

### For Deployment
**I need to deploy this:**
1. Start with: [Deployment Guide](#deployment-guide)
2. Then read: [CONFIG.md](./CONFIG.md) - Configuration
3. Reference: [index.js](./index.js) - Full code

---

## Simple Usage Examples

### Getting Your Brief

Send one of these messages to ClawdBot:

```
morning brief
```
or
```
brief
```

**You'll receive:**
```
🌄 Good morning! Happy Monday!

📋 *Pending Tasks*
━━━━━━━━━━━━━━━
🔴 *Urgent (2):*
   • Fix critical bug
   • Deploy hotfix

🟠 *High (1):*
   • Code review PR #123

📊 *Quick Stats*
━━━━━━━━━━━━━━━
💬 Messages: 42
📝 Stored facts: 5
✅ Completed tasks: 8
⏳ Pending tasks: 3

💪 *You got this!*
Let's make today productive! 🚀
```

### Changing When You Get Your Brief

Send:
```
set brief time 07:00
```

This schedules your brief for 7:00 AM every day.

**Supported format**: `HH:MM` (24-hour time)
- `07:00` = 7 AM
- `14:30` = 2:30 PM
- `20:00` = 8 PM

### Checking Your Settings

Send:
```
brief settings
```

**You'll see:**
- Your scheduled time
- How many messages, facts, and tasks you have
- Available commands

---

## Technical Overview

### Architecture

```
MorningBriefSkill (extends BaseSkill)
├── Scheduler (for daily automation)
├── MemoryManager (for tasks & stats)
└── WhatsApp (for message delivery)
```

### How It Works

1. **Manual Trigger**: User says "morning brief"
   - Skill queries MemoryManager for tasks and stats
   - Formats response with emojis and sections
   - Sends via WhatsApp

2. **Automatic Scheduling**: Scheduler triggers at set time
   - Scheduler calls the `morning-brief` handler
   - Handler generates and sends brief
   - Message delivered via Twilio/WhatsApp

3. **Time Changes**: User says "set brief time HH:MM"
   - Skill cancels old scheduler job
   - Creates new job at new time
   - Saves setting to database

### Key Components

| Component | Purpose |
|-----------|---------|
| **index.js** | Main skill implementation (457 lines) |
| **Scheduler** | Manages cron jobs (node-cron) |
| **MemoryManager** | Stores tasks, facts, stats (SQLite) |
| **BaseSkill** | Parent class for all skills |

### Default Configuration

```javascript
// Default brief time
Time: 08:00 (8 AM)

// Timezone
Timezone: Europe/London

// Job name
Name: daily-morning-brief

// Schedule expression
Cron: 0 8 * * * (every day at 8 AM)
```

---

## File Guide

### Files in This Directory

| File | Purpose | Audience |
|------|---------|----------|
| **index.js** | Main implementation | Developers |
| **README.md** | Feature documentation | Everyone |
| **EXAMPLES.md** | Real-world examples | Users & Developers |
| **CONFIG.md** | Configuration guide | DevOps & Developers |
| **IMPLEMENTATION_SUMMARY.md** | Technical details | Developers |
| **VERIFICATION.md** | Quality checklist | QA & Managers |
| **START_HERE.md** | This file | Everyone |

### Reading Order

**For Users:**
```
START_HERE.md → README.md → EXAMPLES.md
```

**For Developers:**
```
START_HERE.md → IMPLEMENTATION_SUMMARY.md → index.js
```

**For Configuration:**
```
START_HERE.md → CONFIG.md → skills.json
```

---

## Deployment Guide

### Step 1: Verify Files Are in Place

The skill should be located at:
```
02-whatsapp-bot/skills/morning-brief/
├── index.js
├── README.md
├── CONFIG.md
├── EXAMPLES.md
└── ... (other docs)
```

### Step 2: Enable the Skill

Edit `02-whatsapp-bot/skills/skills.json`:

```json
{
  "enabled": ["help", "memory", "morning-brief"],
  "config": {
    "morning-brief": {
      "defaultTime": "08:00",
      "timezone": "Europe/London"
    }
  }
}
```

### Step 3: Configure (Optional)

If you want a custom time, edit `.env.local`:
```bash
SKILL_MORNING_BRIEF_DEFAULT_TIME=07:30
SKILL_MORNING_BRIEF_TIMEZONE=America/New_York
```

### Step 4: Start the Bot

```bash
cd 02-whatsapp-bot
npm install  # If needed
npm run dev  # Development
npm start    # Production
```

### Step 5: Test

Send a message:
```
User: morning brief
Bot: [Sends your brief]
```

---

## Troubleshooting Quick Reference

### Issue: Skill not responding

**Cause**: Skill not enabled
**Fix**: Add to `enabled` array in skills.json

### Issue: Wrong time format error

**Cause**: Not using HH:MM format
**Fix**: Use `set brief time 07:30` not `set brief time 7:30`

### Issue: Brief not sending at scheduled time

**Cause**: Bot not running or scheduler not active
**Fix**: Check bot is running: `npm run dev`

### Issue: No tasks showing in brief

**Cause**: No tasks created or all completed
**Fix**: Create tasks with your task management skill

---

## Command Reference

### 3 Available Commands

#### 1. Trigger Brief
```
morning brief
brief
```
Sends your brief immediately.

#### 2. Set Schedule
```
set brief time HH:MM
```
Sets daily brief time (24-hour format).

Examples:
- `set brief time 07:00` (7 AM)
- `set brief time 14:30` (2:30 PM)
- `set brief time 20:00` (8 PM)

#### 3. View Settings
```
brief settings
```
Shows current configuration and statistics.

---

## What You Get

### Time-Appropriate Greetings
The skill detects the time and greets you accordingly:
- 🌅 Before 6 AM: "Early riser!"
- 🌄 6-9 AM: "Good morning!"
- ☀️ 9 AM-12 PM: "Morning!"
- 🌤️ 12 PM-5 PM: "Good afternoon!"
- 🌆 5-9 PM: "Good evening!"
- 🌙 After 9 PM: "Good night!"

### Task Priority System
Tasks shown in priority order:
- 🔴 Urgent
- 🟠 High
- 🟡 Medium
- ⚪ Low

### Statistics
Quick overview of your activity:
- 💬 Total messages
- 📝 Stored facts
- ✅ Completed tasks
- ⏳ Pending tasks

### Motivational Messages
Context-aware motivation:
- **Weekday**: Work-focused messages
- **Weekend**: Relaxation-focused messages
- **Variety**: Different message each day

---

## Integration with Other Skills

### Memory Skill
Store facts about yourself that influence your brief:
```
remember I'm a DevOps engineer
```

### Task Management
Create tasks that appear in your brief:
```
add task Deploy new configuration [high]
```

### Overall Usage Pattern
```
1. Create tasks
2. Store personal facts
3. Get morning brief
4. Complete tasks
5. Repeat daily
```

---

## Advanced Features

### Custom Timezone
Set your timezone for accurate scheduling:
```json
{
  "config": {
    "morning-brief": {
      "timezone": "America/Los_Angeles"
    }
  }
}
```

### Multiple Briefs (Advanced)
You can manually set up multiple daily briefs by editing the database.
See [CONFIG.md](./CONFIG.md) for details.

### Graceful Degradation
If the database is temporarily unavailable:
- Brief still generates with available data
- Shows "Stats unavailable" instead of failing
- No user-visible errors

---

## Support & Help

### Documentation
- **Full Features**: See [README.md](./README.md)
- **Usage Examples**: See [EXAMPLES.md](./EXAMPLES.md)
- **Configuration**: See [CONFIG.md](./CONFIG.md)
- **Technical Details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

### Common Questions

**Q: Can I get two briefs a day?**
A: Not via the UI, but see CONFIG.md for advanced setup.

**Q: What if I don't have any tasks?**
A: You'll get a brief saying "No pending tasks - great job!"

**Q: Can I change the time anytime?**
A: Yes! Just say `set brief time HH:MM` anytime.

**Q: Will it work on weekends?**
A: Yes, with a special weekend motivation message.

---

## Summary

The Morning Brief Skill provides:
- ✅ Daily summaries of your tasks
- ✅ Quick statistics about your activity
- ✅ Time-appropriate greetings
- ✅ Flexible scheduling
- ✅ Professional WhatsApp formatting

**Status**: Production ready, fully documented, and tested.

**Next Steps**:
1. For usage: Read [README.md](./README.md)
2. For examples: See [EXAMPLES.md](./EXAMPLES.md)
3. For config: Check [CONFIG.md](./CONFIG.md)
4. For code: Review [index.js](./index.js)

---

## Quick Links

- [README.md](./README.md) - Full documentation
- [EXAMPLES.md](./EXAMPLES.md) - Usage examples
- [CONFIG.md](./CONFIG.md) - Configuration guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Technical overview
- [VERIFICATION.md](./VERIFICATION.md) - Quality checklist
- [index.js](./index.js) - Source code

---

**Happy briefing! 🚀**

Start with `morning brief` to get your first brief now.

Last updated: January 31, 2026
