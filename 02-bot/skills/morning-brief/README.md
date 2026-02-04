# Morning Brief Skill

A comprehensive skill for managing and triggering daily morning briefings in ClawdBot. This skill integrates with the scheduler and memory manager to provide personalized summaries of tasks, activity, and motivational messages.

## Overview

The Morning Brief Skill allows users to:
- Trigger an immediate morning brief with current tasks and stats
- Schedule automated daily briefings at a preferred time
- View and configure brief settings
- Receive time-appropriate greetings and motivational messages

## Features

### Time-Aware Greetings
The skill detects the current hour and provides appropriate greetings:
- 🌅 Early morning (before 6 AM)
- 🌄 Morning (6-9 AM)
- ☀️ Late morning (9 AM-12 PM)
- 🌤️ Afternoon (12 PM-5 PM)
- 🌆 Evening (5-9 PM)
- 🌙 Night (after 9 PM)

### Task Summary
Displays pending tasks organized by priority:
- 🔴 Urgent
- 🟠 High
- 🟡 Medium
- ⚪ Low

### Activity Statistics
Quick overview of your interaction patterns:
- Total messages exchanged
- Stored facts about yourself
- Completed and pending task counts

### Motivational Messages
Context-aware closing messages that change based on:
- Day of week (weekday vs. weekend)
- Day of month (for variety)

## Commands

### `morning brief` or `brief`
Trigger a manual morning brief immediately.

**Usage:**
```
morning brief
brief
```

**Response:**
```
🌄 Good morning! Happy Monday!

📋 *Pending Tasks*
━━━━━━━━━━━━━━━
🔴 *Urgent (2):*
   • Fix authentication bug
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
━━━━━━━━━━━━━━━
Let's make today productive! 🚀
```

### `set brief time HH:MM`
Set the scheduled time for your daily automated brief. Uses 24-hour format.

**Usage:**
```
set brief time 07:30
set brief time 14:00
set brief time 08:00
```

**Parameters:**
- `HH`: Hour (00-23)
- `MM`: Minute (00-59)

**Response:**
```
✅ *Brief schedule updated*

📅 New time: 07:30 (daily)
🔔 You'll get your brief at that time every day

_To trigger manually, say: morning brief_
```

### `brief settings`
Display current brief configuration and data summary.

**Usage:**
```
brief settings
```

**Response:**
```
⚙️ *Morning Brief Settings*
━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Scheduled Time:* 08:00 (daily)
📊 *Status:* Enabled ✅

📈 *Your Data:*
  • Messages: 42
  • Stored facts: 5
  • Pending tasks: 3
  • Completed tasks: 8

━━━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
• `morning brief` - Get brief now
• `set brief time HH:MM` - Change time
```

## Architecture

### Dependencies
- **BaseSkill**: Parent class for all skills
- **Scheduler**: Manages recurring jobs using node-cron
- **MemoryManager**: Provides access to tasks, facts, and statistics

### Default Configuration
- Default brief time: **08:00** (8:00 AM)
- Job name: `daily-morning-brief`
- Cron schedule: `0 8 * * *` (8 AM every day)
- Timezone: Europe/London (via scheduler)

### Integration Points

#### With Scheduler
The skill initializes a default scheduled job on first use:
```javascript
// Default schedule at 8:00 AM daily
await scheduler.schedule(
  'daily-morning-brief',
  '0 8 * * *',
  'morning-brief',
  {}
);
```

When time is changed, it updates the schedule:
```javascript
// User changes to 7:30 AM
// Skill cancels old job and creates new one
await scheduler.schedule(
  'daily-morning-brief',
  '30 7 * * *',
  'morning-brief',
  {}
);
```

#### With MemoryManager
The skill retrieves data using:
- `getTasks(userId, 'pending')` - Pending tasks grouped by priority
- `getStats(userId)` - Overall statistics (message count, facts, tasks)
- `getFacts(userId, 'settings')` - Stored brief configuration

## Implementation Details

### File Structure
```
02-whatsapp-bot/skills/morning-brief/
├── index.js          # Main skill class (this file)
└── README.md         # This documentation
```

### Class Methods

#### Public Methods
- `async initialize()` - Set up default schedule on skill load
- `async execute(command, context)` - Route commands to handlers
- `getMetadata()` - Return skill metadata

#### Command Handlers
- `async handleMorningBriefCommand(userId)` - Generate and send brief
- `async handleSetBriefTimeCommand(userId, timeStr)` - Update schedule
- `async handleBriefSettingsCommand(userId)` - Show configuration

#### Private Helper Methods
- `_getTimeGreeting(hour)` - Get time-appropriate greeting
- `async _formatTasksSummary(userId)` - Format pending tasks
- `async _formatActivityStats(userId)` - Format statistics
- `_getMotivationalMessage()` - Generate motivational closing
- `async _initializeDefaultSchedule()` - Set up default 8 AM brief

### Error Handling
The skill gracefully handles errors:
- Missing memory manager: Returns error message
- Database unavailable: Shows partial brief with available data
- Invalid time format: Returns helpful validation message
- Scheduler unavailable: Still allows manual brief trigger

### Data Storage
Brief settings are stored as facts in the memory manager:
```javascript
this.memory.saveFact(
  userId,
  `Brief scheduled at 07:30 daily`,
  'settings',
  'system'
);
```

This allows settings to persist across bot restarts.

## Usage Examples

### Complete Example Workflow

1. **Get immediate brief:**
   ```
   User: morning brief
   Bot: [Sends morning brief with tasks and stats]
   ```

2. **Change schedule:**
   ```
   User: set brief time 07:00
   Bot: ✅ Brief schedule updated to 07:00
   ```

3. **Check settings:**
   ```
   User: brief settings
   Bot: [Shows current time: 07:00, your data, commands]
   ```

4. **Update time again:**
   ```
   User: set brief time 09:30
   Bot: ✅ Brief schedule updated to 09:30
   ```

5. **Verify change:**
   ```
   User: brief settings
   Bot: [Shows current time: 09:30]
   ```

## Testing

### Unit Tests
To test the skill in isolation:

```javascript
const MorningBriefSkill = require('./index');
const mockMemory = { /* mock methods */ };
const skill = new MorningBriefSkill({ memory: mockMemory });

// Test brief command
await skill.execute('morning brief', { from: '+447123456789' });

// Test time setting
await skill.execute('set brief time 07:30', { from: '+447123456789' });

// Test settings view
await skill.execute('brief settings', { from: '+447123456789' });
```

### Integration Tests
To test with real scheduler and memory:

```bash
# From 02-whatsapp-bot directory
npm test -- skills/morning-brief
```

## Configuration

### Via skills.json
You can enable/disable the skill or pass configuration:

```json
{
  "enabled": ["help", "memory", "morning-brief", "github"],
  "config": {
    "morning-brief": {
      "defaultTime": "07:00",
      "timezone": "Europe/London"
    }
  }
}
```

### Programmatically
When initializing ClawdBot:

```javascript
const scheduler = getScheduler(memory, sendMessage);
const skills = await loadSkills('./skills', {
  memory,
  ai,
  scheduler,
  config: { /* config */ }
});
```

## Troubleshooting

### Brief Not Sending at Scheduled Time
1. Check scheduler is running: `npm run dev` should show scheduler startup
2. Verify timezone: Default is `Europe/London`, adjust in config if needed
3. Check bot logs for cron job execution messages

### Time Setting Fails
1. Ensure format is `HH:MM` in 24-hour format
2. Check memory manager is initialized
3. Look for validation error messages

### Missing Tasks in Brief
1. Confirm tasks were created with `memory skill`
2. Verify tasks have status `pending`
3. Check memory database file exists

### No Greeting or Stats
1. Ensure memory manager is connected
2. Check user has data (messages, facts, tasks)
3. Review bot console for error messages

## Future Enhancements

Potential improvements for the Morning Brief Skill:

1. **Customizable Brief Sections**: Allow users to toggle which sections appear
2. **Email/Slack Integration**: Send briefs to multiple channels
3. **Weather Integration**: Include weather in morning brief
4. **Trending Topics**: Show trending discussion topics
5. **Voice Brief**: Generate audio version of brief
6. **Multi-Language**: Support briefs in different languages
7. **Reminders**: Escalating reminders for urgent tasks
8. **Analytics**: Show productivity trends week-over-week

## Related Skills

- **Memory Skill** (`../memory/`): Store and retrieve facts
- **Task Management**: Track tasks and deadlines
- **Scheduler** (`../../scheduler/`): Manage scheduled jobs

## Support

For issues or questions about the Morning Brief Skill:
1. Check the troubleshooting section above
2. Review bot logs for error messages
3. Test with simpler commands first
4. File an issue on the project GitHub

## License

Part of the ClawdBot project. See main LICENSE file.
