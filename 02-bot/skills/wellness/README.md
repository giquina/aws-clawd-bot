# Wellness Reminders Skill

Automatic health and wellness reminders for breaks, water intake, stretching, and posture checks. Part of ClawdBot v2.6 multi-skill expansion.

## Overview

The Wellness skill provides smart, automatic reminders to help maintain healthy work habits. Reminders rotate through different types (breaks, water, stretching, eyes, posture) and respect user activity and Do Not Disturb hours.

## Features

- **5 Reminder Types**: Break, Water, Stretch, Eyes, Posture
- **Smart Reminders**: Skip if user is recently active (sent a message in last 10 minutes)
- **DND Awareness**: No reminders during 23:00-07:00 hours
- **Configurable Intervals**: 30 minutes to 8 hours (default: 2 hours)
- **Persistent Settings**: Stored per-user in database (facts table)
- **Outcome Tracking**: Integration with ClawdBot's outcome tracker
- **Rotation Logic**: Cycles through reminder types for variety

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `wellness on` | Enable wellness reminders | `wellness on` |
| `wellness off` | Disable wellness reminders | `wellness off` |
| `wellness status` | Check current settings | `wellness status` |
| `wellness config <minutes>` | Set reminder interval (30-480) | `wellness config 90` |

## Reminder Types

1. **🧘 Break** - "Take a 5-minute break! You've been working hard."
2. **💧 Water** - "Time to hydrate! Drink some water."
3. **🤸 Stretch** - "Stand up and stretch for 30 seconds. Your body will thank you!"
4. **👀 Eyes** - "Rest your eyes! Look away from the screen for 20 seconds (20-20-20 rule)."
5. **🪑 Posture** - "Check your posture! Sit up straight and adjust your chair if needed."

## Configuration

Defaults (overridable in `skills.json`):

```json
"wellness": {
  "defaultIntervalMinutes": 120,
  "minIntervalMinutes": 30,
  "maxIntervalMinutes": 480,
  "dndStartHour": 23,
  "dndEndHour": 7,
  "recentActivityThresholdMinutes": 10
}
```

## Database Schema

Settings are stored in the `facts` table with `category='wellness'`:

```sql
user_id: <telegram_user_id>
category: 'wellness'
fact: 'enabled: true|false'
fact: 'interval: <minutes>'
fact: 'lastReminder: <ISO8601_timestamp>'
```

## Technical Details

### Class: `WellnessSkill`

- **Extends**: `BaseSkill`
- **Priority**: 14
- **Commands**: 4 patterns

### Key Methods

- `handleEnableWellness(userId, context)` - Enable reminders
- `handleDisableWellness(userId)` - Disable reminders
- `handleStatus(userId)` - Show current settings
- `handleConfigureInterval(userId, intervalMinutes, context)` - Update interval
- `_sendWellnessReminder(userId, sendMessage)` - Send a reminder (respects DND, activity)
- `_isInDNDHours()` - Check if current time is in DND window
- `_isUserRecentlyActive(userId)` - Check if user sent a message recently
- `_getNextReminderType(userId)` - Rotate through reminder types

### Dependencies

- `base-skill.js` - Base class for all skills
- `lib/outcome-tracker.js` - Optional outcome tracking
- `memory/memory-manager.js` or `lib/database.js` - Persistent storage

### In-Memory State

- `activeIntervals` - Map of userId → intervalId for active reminders
- `lastReminderType` - Map of userId → last reminder type (for rotation)
- `lastUserActivity` - Map of userId → timestamp of last message

## Usage Example

```javascript
// Enable wellness reminders
wellness on

// Bot response:
// ✓ Wellness reminders enabled!
//
// 📋 Settings:
// • Interval: 120 minutes (2h)
// • Types: Break, Water, Stretch, Eyes, Posture
// • DND Mode: 23:00-07:00 (no reminders)
// • Smart Skipping: If you're actively using the bot
//
// You'll receive your first reminder in 120 minutes.

// After 2 hours (if not in DND, not recently active):
// 🧘 Wellness Reminder
//
// Take a 5-minute break! You've been working hard.

// Check status
wellness status

// Configure interval
wellness config 90

// Disable
wellness off
```

## Testing

Run the test suite:

```bash
cd 02-bot
node test-wellness-skill.js           # Unit tests
node test-wellness-integration.js     # Integration tests
```

All tests pass ✅

## Implementation Notes

1. **Interval Management**: Uses `setInterval()` for in-memory scheduling. Intervals are started when user enables wellness and stopped on disable or shutdown.

2. **Persistence**: Settings are saved to the database immediately. On bot restart, intervals are NOT automatically restarted (user must send a message first to re-initialize).

3. **Activity Tracking**: The skill tracks when users send messages (via the `execute()` method). This prevents reminder spam if the user is actively chatting.

4. **DND Hours**: Hard-coded to 23:00-07:00. Configurable via class constants.

5. **Reminder Rotation**: Each user has their own rotation state. Cycles through all 5 types in order.

6. **Graceful Degradation**: If `sendMessage` callback is not available, interval won't start but settings are still saved.

## Integration Points

### With Skill Registry

- Auto-loaded from `skills/wellness/index.js`
- Must be in `skills.json` enabled array
- Priority 14 ensures it doesn't conflict with higher-priority skills

### With Outcome Tracker

Optional integration:
```javascript
outcomeTracker.startAction('wellness_reminder', userId, { reminderType, timestamp });
outcomeTracker.completeAction('wellness_reminder', 'success', { message });
```

### With Memory Manager

Uses `facts` table for persistence:
- `memory.query('facts', { where: { user_id, category: 'wellness' } })`
- `memory.insert('facts', { user_id, fact, category: 'wellness' })`
- `memory.update('facts', { id }, { fact })`

## Future Enhancements

Potential improvements for future versions:

1. **Custom Reminder Messages**: Allow users to set their own reminder text
2. **Reminder History**: Track and show reminder compliance rate
3. **Achievements**: Gamification (e.g., "7-day streak!")
4. **Integration with Pomodoro**: Sync breaks with Pomodoro timer
5. **Time Zone Support**: DND hours based on user's timezone
6. **Reminder Acknowledgment**: Optional "ack" system
7. **Multiple Intervals**: Different intervals for different reminder types
8. **Calendar Integration**: Skip reminders during meetings
9. **Mobile App Notifications**: Push notifications via Telegram

## Changelog

### v1.0.0 (2026-02-04)
- Initial implementation
- 5 reminder types with rotation
- DND mode (23:00-07:00)
- Smart activity detection
- Configurable intervals (30-480 minutes)
- Database persistence
- Outcome tracking integration

## License

Part of ClawdBot v2.6. All rights reserved.

## Author

Implemented as part of the ClawdBot multi-skill expansion initiative (Priority 5, Skill #19).
