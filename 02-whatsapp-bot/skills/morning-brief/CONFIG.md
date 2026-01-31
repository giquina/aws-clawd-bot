# Morning Brief Skill - Configuration Guide

This document covers all configuration options for the Morning Brief Skill.

## Default Configuration

The Morning Brief Skill comes pre-configured with sensible defaults:

```javascript
// Default settings (hardcoded in index.js)
DEFAULT_BRIEF_TIME = '08:00'           // 8:00 AM UTC
JOB_NAME = 'daily-morning-brief'        // Unique job identifier
CONFIG_KEY = 'morning_brief_settings'   // Memory storage key
PRIORITY = 40                           // Medium-high priority in skill routing
TIMEZONE = 'Europe/London'              // From scheduler instance
```

These defaults are sufficient for most users. The skill works out-of-the-box without configuration.

---

## Configuration Methods

### Method 1: Via skills.json (Recommended)

Create or edit `02-whatsapp-bot/skills/skills.json`:

```json
{
  "enabled": [
    "help",
    "memory",
    "morning-brief",
    "github"
  ],
  "disabled": [],
  "config": {
    "morning-brief": {
      "defaultTime": "07:00",
      "timezone": "Europe/London",
      "enabled": true
    }
  }
}
```

**Configuration Options:**
- `enabled` (boolean): Include `"morning-brief"` in this array to enable
- `disabled` (array): Add `"morning-brief"` to disable the skill
- `config.morning-brief.defaultTime` (string): Default brief time in HH:MM format
- `config.morning-brief.timezone` (string): IANA timezone string
- `config.morning-brief.enabled` (boolean): Override skill enabled state

### Method 2: Environment Variables

Set environment variables in your `.env.local` file:

```bash
# Enable/disable skill
SKILL_MORNING_BRIEF_ENABLED=true

# Default brief time (HH:MM, 24-hour format)
SKILL_MORNING_BRIEF_DEFAULT_TIME=07:30

# Timezone for scheduling
SKILL_MORNING_BRIEF_TIMEZONE=Europe/London
```

Your bot startup code would read these:

```javascript
const skillConfig = {
  defaultTime: process.env.SKILL_MORNING_BRIEF_DEFAULT_TIME || '08:00',
  timezone: process.env.SKILL_MORNING_BRIEF_TIMEZONE || 'Europe/London'
};
```

### Method 3: Programmatically

When initializing skills in your main bot file:

```javascript
const { loadSkills } = require('./skills/skill-loader');
const { getScheduler } = require('./scheduler');
const memory = require('./memory/memory-manager');

const scheduler = getScheduler(memory, sendMessageFunction);

const skills = await loadSkills('./skills', {
  memory,
  scheduler,
  config: {
    'morning-brief': {
      defaultTime: '07:00',
      timezone: 'America/New_York'
    }
  }
});
```

---

## Timezone Configuration

The Morning Brief Skill uses the scheduler's timezone system. Supported IANA timezones:

### Common European Timezones
```
Europe/London         # UK (UTC+0/+1)
Europe/Paris          # Central Europe (UTC+1/+2)
Europe/Berlin         # Central Europe (UTC+1/+2)
Europe/Amsterdam      # Central Europe (UTC+1/+2)
Europe/Madrid         # Central Europe (UTC+1/+2)
Europe/Rome           # Central Europe (UTC+1/+2)
Europe/Stockholm      # Central Europe (UTC+1/+2)
Europe/Moscow         # Moscow (UTC+3)
```

### Common Americas Timezones
```
America/New_York      # Eastern (UTC-5/-4)
America/Chicago       # Central (UTC-6/-5)
America/Denver        # Mountain (UTC-7/-6)
America/Los_Angeles   # Pacific (UTC-8/-7)
America/Toronto       # Eastern Canada (UTC-5/-4)
America/Mexico_City   # Mexico (UTC-6/-5)
America/Sao_Paulo     # Brazil (UTC-3/-2)
America/Buenos_Aires  # Argentina (UTC-3)
```

### Common Asia/Pacific Timezones
```
Asia/Tokyo            # Japan (UTC+9)
Asia/Shanghai         # China (UTC+8)
Asia/Hong_Kong        # Hong Kong (UTC+8)
Asia/Singapore        # Singapore (UTC+8)
Asia/Bangkok          # Thailand (UTC+7)
Asia/Dubai            # UAE (UTC+4)
Asia/Kolkata          # India (UTC+5:30)
Australia/Sydney      # Australia (UTC+10/+11)
Australia/Melbourne   # Australia (UTC+10/+11)
Pacific/Auckland      # New Zealand (UTC+12/+13)
```

### Set Timezone

In `skills.json`:
```json
{
  "config": {
    "morning-brief": {
      "timezone": "America/Los_Angeles"
    }
  }
}
```

Or programmatically:
```javascript
scheduler.setTimezone('Asia/Tokyo');
```

---

## Default Brief Time Configuration

### Format
- **Format**: `HH:MM` (24-hour)
- **Range**: `00:00` - `23:59`

### Examples

**Early Morning:**
```json
{"defaultTime": "05:00"}  // 5:00 AM
{"defaultTime": "06:30"}  // 6:30 AM
```

**Regular Morning:**
```json
{"defaultTime": "07:00"}  // 7:00 AM (recommended)
{"defaultTime": "08:00"}  // 8:00 AM (current default)
{"defaultTime": "09:00"}  // 9:00 AM
```

**Afternoon:**
```json
{"defaultTime": "12:00"}  // 12:00 PM (noon)
{"defaultTime": "14:00"}  // 2:00 PM
{"defaultTime": "15:30"}  // 3:30 PM
```

**Evening:**
```json
{"defaultTime": "18:00"}  // 6:00 PM
{"defaultTime": "19:00"}  // 7:00 PM
{"defaultTime": "20:30"}  // 8:30 PM
```

---

## Complete Configuration Example

### Full skills.json

```json
{
  "enabled": [
    "help",
    "memory",
    "morning-brief",
    "github",
    "task"
  ],
  "disabled": [],
  "config": {
    "help": {
      "groupBySkill": true
    },
    "memory": {
      "maxFacts": 1000,
      "autoSave": true
    },
    "morning-brief": {
      "defaultTime": "07:00",
      "timezone": "Europe/London",
      "enabled": true
    },
    "github": {
      "maxRepos": 50,
      "cacheTime": 3600
    }
  }
}
```

### Full .env.local

```bash
# Morning Brief Skill Configuration
SKILL_MORNING_BRIEF_ENABLED=true
SKILL_MORNING_BRIEF_DEFAULT_TIME=07:00
SKILL_MORNING_BRIEF_TIMEZONE=Europe/London

# Other skills
SKILL_MEMORY_ENABLED=true
SKILL_GITHUB_ENABLED=true
SKILL_HELP_ENABLED=true

# Core settings
ANTHROPIC_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
GITHUB_TOKEN=ghp_...
```

---

## Skill Enable/Disable Scenarios

### Scenario 1: Enable Only Key Skills

```json
{
  "enabled": ["help", "morning-brief", "memory"],
  "disabled": []
}
```

**Result**: Only help, morning-brief, and memory skills are loaded. All others are skipped.

### Scenario 2: Disable Just Morning Brief

```json
{
  "enabled": [],
  "disabled": ["morning-brief"]
}
```

**Result**: All skills load except morning-brief.

### Scenario 3: Development Setup

```json
{
  "enabled": ["help", "memory", "morning-brief"],
  "disabled": [],
  "config": {
    "morning-brief": {
      "defaultTime": "09:00",
      "timezone": "Europe/London",
      "enabled": true
    }
  }
}
```

### Scenario 4: Production Setup

```json
{
  "enabled": [
    "help",
    "memory",
    "morning-brief",
    "github",
    "task",
    "analytics"
  ],
  "disabled": [],
  "config": {
    "morning-brief": {
      "defaultTime": "08:00",
      "timezone": "Europe/London",
      "enabled": true
    }
  }
}
```

---

## Runtime Configuration Changes

### User-Initiated Configuration

Users can change their brief time at runtime using the `set brief time` command:

```
User: set brief time 09:30
Bot: ✅ Brief schedule updated to 09:30
```

This change is stored in the memory manager and persists across bot restarts.

### Accessing Current Configuration

Users can view their configuration:

```
User: brief settings
Bot: ⚙️ *Morning Brief Settings*
     📅 *Scheduled Time:* 09:30 (daily)
     📊 *Status:* Enabled ✅
     ...
```

---

## Advanced Configuration

### Custom Cron Expressions

While the UI limits to HH:MM format, you can manually add advanced schedules by directly modifying the database:

```javascript
// Advanced: Schedule brief for weekdays only at 8:00 AM
memory.createScheduledJob(
  'daily-morning-brief',
  '0 8 * * 1-5',  // Monday-Friday only
  'morning-brief',
  {}
);
```

### Multiple Daily Briefs

For users wanting multiple briefings:

```javascript
// Schedule two briefs per day
memory.createScheduledJob(
  'morning-brief-8am',
  '0 8 * * *',     // 8:00 AM daily
  'morning-brief',
  { label: 'morning' }
);

memory.createScheduledJob(
  'evening-brief-6pm',
  '0 18 * * *',    // 6:00 PM daily
  'morning-brief',
  { label: 'evening' }
);
```

### Conditional Scheduling

Schedule briefs differently on weekends:

```javascript
const dayOfWeek = new Date().getDay();
if (dayOfWeek === 0 || dayOfWeek === 6) {
  // Weekend: 10:00 AM
  scheduleTime = '10:00';
} else {
  // Weekday: 8:00 AM
  scheduleTime = '08:00';
}
```

---

## Configuration Validation

### Valid Time Formats
```
✅ "07:00"    // Valid
✅ "7:00"     // Valid (single digit hour)
✅ "14:30"    // Valid
✅ "23:59"    // Valid
❌ "25:00"    // Invalid (hour out of range)
❌ "07:60"    // Invalid (minute out of range)
❌ "7:30 AM"  // Invalid (24-hour format required)
❌ "07-30"    // Invalid (colon required)
```

### Valid Timezone Formats
```
✅ "Europe/London"
✅ "America/New_York"
✅ "Asia/Tokyo"
❌ "EST"                  // Invalid (use America/New_York)
❌ "Europe/london"        // Invalid (case-sensitive)
❌ "InvalidTimezone"      // Invalid (not recognized)
```

---

## Troubleshooting Configuration

### Issue: Skill Won't Load

**Check:**
1. Skill is in `enabled` array (if using allowlist)
2. Skill is not in `disabled` array
3. Directory structure is correct: `skills/morning-brief/index.js`
4. File exports the skill class properly

**Solution:**
```json
{
  "enabled": ["morning-brief"],
  "disabled": []
}
```

### Issue: Wrong Time Format Error

**User Input:**
```
set brief time 9:30
```

**Error:**
```
Invalid time format
```

**Solution:** Use zero-padded format:
```
set brief time 09:30
```

### Issue: Brief Not Sending at Scheduled Time

**Check:**
1. Bot is running and scheduler is active
2. Timezone is correct
3. Default time is in valid format
4. No errors in bot console logs

**Verify:**
```bash
npm run dev  # Should see "[Scheduler] Started X jobs"
```

### Issue: Wrong Timezone

If briefs arrive at wrong time:

1. Check bot logs for timezone setting
2. Verify IANA timezone string in config
3. Account for daylight saving time changes

**Common Mistake:**
```javascript
// ❌ Wrong
timezone: 'GMT'         // Not valid IANA

// ✅ Correct
timezone: 'Europe/London'  // Valid IANA (handles DST)
```

---

## Configuration Best Practices

### 1. Use skills.json
Store skill configuration in version control:
```json
{
  "config": {
    "morning-brief": {
      "defaultTime": "07:00",
      "timezone": "Europe/London"
    }
  }
}
```

### 2. Environment-Specific Config
Use environment variables for sensitive data:
```bash
# .env.local (development)
SKILL_MORNING_BRIEF_TIMEZONE=Europe/London

# .env.production (production)
SKILL_MORNING_BRIEF_TIMEZONE=Europe/London
```

### 3. Document Your Configuration
Add comments in skills.json:
```json
{
  "config": {
    "morning-brief": {
      "defaultTime": "07:00",  // Team start time
      "timezone": "Europe/London",  // Team location
      "enabled": true
    }
  }
}
```

### 4. Test Configuration Changes
After changing config, restart bot and verify:
```
User: brief settings
Bot: [Should show new configuration]
```

---

## Configuration Reset

### Reset to Defaults

If you need to reset Morning Brief Skill to defaults:

1. **Option 1: Delete Config**
   ```json
   {
     "config": {
       "morning-brief": {}  // Removed all custom config
     }
   }
   ```

2. **Option 2: Explicit Defaults**
   ```json
   {
     "config": {
       "morning-brief": {
         "defaultTime": "08:00",
         "timezone": "Europe/London",
         "enabled": true
       }
     }
   }
   ```

3. **Option 3: Delete from Database**
   Clear the stored brief settings from memory:
   ```javascript
   const facts = memory.getFacts(userId, 'settings');
   const briefFact = facts.find(f => f.fact.includes('Brief scheduled'));
   if (briefFact) {
     memory.deleteFact(userId, briefFact.id);
   }
   ```

---

## Related Configuration Files

- **Scheduler Config**: `02-whatsapp-bot/scheduler/index.js`
- **Memory Config**: `02-whatsapp-bot/memory/memory-manager.js`
- **Skills Index**: `02-whatsapp-bot/skills/index.js`
- **Main Config**: `config/.env.local` (root level)

---

## Support and Questions

For configuration issues:
1. Check bot logs: `npm run dev 2>&1 | grep -i morning`
2. Verify syntax in skills.json (valid JSON)
3. Test with `brief settings` command
4. Review this guide's troubleshooting section
