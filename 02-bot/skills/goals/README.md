# Goals Skill

Track and achieve personal and professional goals with progress monitoring, deadlines, and visual progress bars.

## Features

- Set goals with optional numeric targets and deadlines
- Track progress with visual progress bars
- View statistics and completion rates
- Get reminders for approaching deadlines
- Mark goals as complete
- Delete goals you no longer want to track

## Commands

### Create a Goal

```
goal set <description> [target <value> <unit>] [by <date>]
```

**Examples:**
```
goal set Read 12 books target 12 books by 2025-12-31
goal set Launch new feature by 2025-03-15
goal set Exercise regularly
goal set Save money target 10000 GBP by 2025-06-30
```

### View Goals

```
goal list
goal progress
```

Shows all active goals with:
- Progress bars (for goals with targets)
- Percentage completion
- Days remaining until deadline
- Overdue indicators

### Update Progress

```
goal update <id> <value>
```

**Example:**
```
goal update 1 8
```

Updates the current value for a goal. If the goal has a target, it calculates and shows the percentage complete.

### Complete a Goal

```
goal complete <id>
```

**Example:**
```
goal complete 2
```

Marks a goal as completed and removes it from the active list.

### Delete a Goal

```
goal delete <id>
```

**Example:**
```
goal delete 3
```

Permanently deletes a goal.

### View Statistics

```
goal stats
```

Shows:
- Total, active, and completed goal counts
- Completion rate
- Average progress (for goals with targets)
- Upcoming deadlines (within 7 days)
- Overdue goals count

## Progress Visualization

Goals with numeric targets display a visual progress bar:

```
████████░░ 80% (8/10 books)
```

- `█` = Completed progress
- `░` = Remaining progress

## Deadline Tracking

Goals can have deadlines in `YYYY-MM-DD` format. The skill will:

- Show days remaining for upcoming deadlines
- Mark overdue goals with a warning icon (⚠)
- Highlight goals due within 7 days with a clock icon (⏰)
- Show calendar icon (📅) for deadlines further out

## Database Schema

Goals are stored in the `goals` table:

```sql
CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  target_value REAL,
  current_value REAL DEFAULT 0,
  unit TEXT,
  deadline DATE,
  status TEXT DEFAULT 'active',
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

## Integration Points

### Morning Brief Integration

Goals approaching deadlines can be included in the morning brief skill by querying:

```javascript
const db = require('../lib/database');
const goals = db.getGoalsApproachingDeadline(userId, 7);
```

### Voice Command Support

The skill supports natural language via ClawdBot's voice flow:

- "Create a goal to read 10 books by end of year"
- "Show me my goals"
- "Update my reading goal to 5 books"
- "Mark my launch goal as complete"

### Outcome Tracker Integration

Goal completions can be tracked as outcomes:

```javascript
const outcomeTracker = require('../lib/outcome-tracker');
outcomeTracker.startAction('goal_complete', 'Completing goal', { goalId });
// ... complete the goal ...
outcomeTracker.completeAction('goal_complete', 'success', { goalId });
```

## Configuration

In `skills.json`:

```json
{
  "goals": {
    "maxGoals": 50,
    "deadlineReminderDays": 7
  }
}
```

## Implementation Notes

- Priority: 16 (runs after core commands but before general AI)
- Database functions: `saveGoal`, `getGoal`, `listGoals`, `updateGoalProgress`, `completeGoal`, `deleteGoal`, `getGoalsApproachingDeadline`
- Status values: `active`, `completed`, `cancelled`
- Uses BaseSkill's `success()` and `error()` response templates
- Progress bars use Unicode blocks: `█` (filled) and `░` (empty)

## Future Enhancements

Potential additions (not yet implemented):

1. **Daily/Weekly Reminders**: Scheduled reminders for goals approaching deadlines
2. **Goal Categories**: Tag goals as personal, work, health, etc.
3. **Sub-goals**: Break large goals into smaller milestones
4. **Goal Templates**: Pre-defined goal templates (e.g., "Read X books", "Save X money")
5. **Progress History**: Track progress changes over time
6. **Goal Sharing**: Share goals with team members in group chats
7. **Motivational Messages**: Dynamic encouragement based on progress
8. **Integration with Tasks**: Link goals to tasks in the tasks skill

## Testing

Run the test suite:

```bash
cd 02-bot/skills/goals
node test.js
```

All tests should pass with detailed output showing each command working correctly.

## Related Skills

- **tasks**: For action items and to-dos
- **reminders**: For time-based notifications
- **pomodoro**: For focused work sessions
- **morning-brief**: For daily summaries including goal progress

## Example Usage Session

```
User: goal set Read 12 books target 12 books by 2025-12-31
Bot: ✓ Goal created: Read 12 books
     Target: 12 books
     Deadline: 2025-12-31 (330 days away)

     Use "goal update 1 <value>" to track progress.

User: goal set Launch MVP by 2025-03-01
Bot: ✓ Goal created: Launch MVP
     Deadline: 2025-03-01 (90 days away)

     Use "goal update 2 <value>" to track progress.

User: goal list
Bot: *Active Goals (2)*

     ID 1: Read 12 books
     ░░░░░░░░░░ 0% (0/12 books)
     📅 2025-12-31 (330 days remaining)

     ID 2: Launch MVP
     📅 2025-03-01 (90 days remaining)

     Use "goal update <id> <value>" to update progress.

User: goal update 1 3
Bot: ✓ Progress updated: Read 12 books
     ███░░░░░░░ 25% (3/12 books)

User: goal complete 2
Bot: ✓ 🎉 Goal completed: Launch MVP

User: goal stats
Bot: *Goal Statistics*

     📊 Overview:
     • Total goals: 2
     • Active: 1
     • Completed: 1
     • Completion rate: 50%

     📈 Progress:
     • Average progress: 25%
     ███░░░░░░░
```
