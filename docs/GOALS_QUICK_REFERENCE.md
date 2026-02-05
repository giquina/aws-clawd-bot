# Goals Skill - Quick Reference

## Commands

### Create a Goal
```
goal set <description> [target <value> <unit>] [by <date>]
```

**Examples:**
- `goal set Read 12 books target 12 books by 2025-12-31`
- `goal set Launch MVP by 2025-03-15`
- `goal set Exercise regularly`

### View Goals
```
goal list
goal progress
```

### Update Progress
```
goal update <id> <value>
```

**Example:** `goal update 1 8`

### Complete Goal
```
goal complete <id>
```

**Example:** `goal complete 2`

### Delete Goal
```
goal delete <id>
```

**Example:** `goal delete 3`

### View Statistics
```
goal stats
```

## Features

- ✅ Progress bars with percentage completion
- ✅ Deadline tracking (days remaining/overdue)
- ✅ Visual icons (📅 calendar, ⏰ urgent, ⚠ overdue)
- ✅ Statistics dashboard
- ✅ Per-user goal tracking
- ✅ Works in DMs and group chats

## Progress Bar

```
████████░░ 80% (8/10 books)
```

- `█` = Completed
- `░` = Remaining

## Deadline Icons

- 📅 - Deadline more than 7 days away
- ⏰ - Deadline within 7 days
- ⚠ - Overdue

## Usage Tips

1. **Set realistic targets** - Break large goals into smaller ones
2. **Update regularly** - Track progress weekly or daily
3. **Use deadlines** - Create urgency and accountability
4. **Celebrate wins** - Mark goals as complete to track achievements
5. **Review stats** - Check `goal stats` to see overall progress

## Integration

### Voice Commands
Say naturally:
- "Create a goal to read 10 books by end of year"
- "Show me my goals"
- "Update my reading goal to 5 books"
- "Mark my launch goal as complete"

### Morning Brief
Goals approaching deadlines will appear in your morning brief.

### Group Chats
Each user has their own goals, even in group chats.
