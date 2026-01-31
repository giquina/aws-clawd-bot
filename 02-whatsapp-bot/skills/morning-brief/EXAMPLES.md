# Morning Brief Skill - Usage Examples

This document contains practical examples of using the Morning Brief Skill in ClawdBot.

## Quick Start Examples

### Example 1: Get Your Morning Brief Right Now

**User Request:**
```
morning brief
```

**Bot Response (8:30 AM on Monday):**
```
🌄 Good morning! Happy Monday!

📋 *Pending Tasks*
━━━━━━━━━━━━━━━
🔴 *Urgent (2):*
   • Fix critical auth bug in login flow
   • Deploy hotfix to production

🟠 *High (3):*
   • Code review PR #456 from Sarah
   • Update API documentation
   • Fix failing unit tests

🟡 *Medium (2):*
   • Refactor database module
   • Add logging to payment service

📊 *Quick Stats*
━━━━━━━━━━━━━━━
💬 Messages: 127
📝 Stored facts: 8
✅ Completed tasks: 15
⏳ Pending tasks: 7

💪 *You got this!*
━━━━━━━━━━━━━━━
One task at a time, you've got this! 📈
```

---

## Scheduling Examples

### Example 2: Change Brief Time to 7:00 AM

**User Request:**
```
set brief time 07:00
```

**Bot Response:**
```
✅ *Brief schedule updated*

📅 New time: 07:00 (daily)
🔔 You'll get your brief at that time every day

_To trigger manually, say: morning brief_
```

**What happens next:**
- Bot receives a message at exactly 7:00 AM every day
- Message contains the morning brief with updated task/fact counts
- Time continues until user changes it again

### Example 3: Change to Afternoon Briefing

**User Request:**
```
set brief time 14:30
```

**Bot Response:**
```
✅ *Brief schedule updated*

📅 New time: 14:30 (daily)
🔔 You'll get your brief at that time every day

_To trigger manually, say: morning brief_
```

**What user will see at 2:30 PM:**
```
🌤️ Good afternoon! Here's your Monday brief.

📋 *Pending Tasks*
...
```

### Example 4: Evening Briefing Schedule

**User Request:**
```
set brief time 18:00
```

**Bot Response:**
```
✅ *Brief schedule updated*

📅 New time: 18:00 (daily)
🔔 You'll get your brief at that time every day

_To trigger manually, say: morning brief_
```

**Greeting at 6:00 PM (evening):**
```
🌆 Good evening! Here's your Monday summary.
```

---

## Settings and Configuration Examples

### Example 5: View Current Brief Settings

**User Request:**
```
brief settings
```

**Bot Response:**
```
⚙️ *Morning Brief Settings*
━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Scheduled Time:* 08:00 (daily)
📊 *Status:* Enabled ✅

📈 *Your Data:*
  • Messages: 127
  • Stored facts: 8
  • Pending tasks: 7
  • Completed tasks: 15

━━━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
• `morning brief` - Get brief now
• `set brief time HH:MM` - Change time
```

### Example 6: Multiple Settings Checks

First check:
```
User: brief settings
Bot: Time is 08:00 (8 AM), 5 pending tasks
```

After completing some work and adding tasks:
```
User: brief settings
Bot: Time is 08:00 (8 AM), 7 pending tasks now
```

After changing schedule:
```
User: set brief time 07:00
User: brief settings
Bot: Time is 07:00 (7 AM), 7 pending tasks
```

---

## Real-World Workflow Examples

### Example 7: Complete Monday Morning Workflow

**7:00 AM - Automated Brief Arrives:**
```
Bot: 🌄 Good morning! Happy Monday!
     (Shows 3 urgent tasks, 5 medium tasks)
```

**7:15 AM - User Checks Details:**
```
User: my facts
Bot: [Shows all stored preferences and context]
```

**8:30 AM - Change of Plans:**
```
User: set brief time 06:00
Bot: ✅ Brief schedule updated to 06:00 daily
```

**9:00 AM - Manual Check:**
```
User: brief
Bot: [Sends brief for current time - 9:00 AM afternoon greeting]
```

**5:00 PM - Check Settings:**
```
User: brief settings
Bot: [Shows 06:00 schedule, 4 tasks completed during day, 3 pending]
```

---

### Example 8: Weekend Workflow

**Saturday 8:00 AM - Weekend Greeting:**
```
Bot: 🌄 Good morning! Happy Saturday!
     [All pending tasks]
     [Stats]
     Enjoy your weekend - you've earned it! 🎉
```

**Sunday 8:00 AM - Weekend Wrap-up:**
```
Bot: 🌄 Good morning! Happy Sunday!
     [Completed 5 tasks this weekend]
     [3 tasks remaining - Monday checklist]
     Hope you have a great weekend! 🌟
```

---

## Integration Examples

### Example 9: Brief + Memory Skill Workflow

**Step 1: Add facts about yourself**
```
User: remember I work as a DevOps engineer at TechCorp
Bot: ✅ Remembered!
```

**Step 2: Create tasks related to your role**
```
User: add task Deploy new cluster configuration [high priority]
Bot: ✅ Task created
```

**Step 3: Get morning brief (brief data-enriched with context)**
```
User: morning brief
Bot: 🌄 Good morning! Happy Monday!
     [Shows high-priority DevOps tasks]
     [Your role: DevOps engineer at TechCorp - influencing brief content]
```

---

### Example 10: Brief + Task Management Workflow

**Morning:**
```
User: morning brief
Bot: Shows: 2 urgent, 3 high, 4 medium tasks
```

**During Day:**
```
User: complete task 1
User: complete task 3
[... more work ...]
```

**Evening:**
```
User: brief
Bot: Shows: 1 urgent (completed 1), 2 high, 3 medium tasks
```

**Next Morning (if time not changed):**
```
Bot: [Auto-sends brief showing: 1 urgent, 2 high, 3 medium - updated counts]
```

---

## Error Handling Examples

### Example 11: Invalid Time Format

**User Request:**
```
set brief time 25:00
```

**Bot Response:**
```
❌ *Invalid time format*

Use 24-hour format (HH:MM)
Examples: 07:30, 08:00, 14:30
```

### Example 12: Malformed Time Command

**User Request:**
```
set brief time seven thirty
```

**Bot Response:**
```
❌ *Invalid time format*

Use 24-hour format (HH:MM)
Examples: 07:30, 08:00, 14:30
```

### Example 13: Database Not Available (Graceful Degradation)

**User Request:**
```
morning brief
```

**Bot Response (Database temporarily unavailable):**
```
🌄 Good morning! Happy Monday!

📋 *Pending Tasks*
━━━━━━━━━━━━━━━
_Unable to retrieve tasks._

📊 *Quick Stats*
━━━━━━━━━━━━━━━
_Stats unavailable._

💪 *You got this!*
━━━━━━━━━━━━━━━
Let's make today productive! 🚀
```

---

## Time-Specific Greeting Examples

### Example 14: Morning Brief at Different Times

**5:30 AM (Very early):**
```
🌅 Early riser! Good morning and happy Monday!
```

**7:45 AM (Regular morning):**
```
🌄 Good morning! Happy Monday!
```

**11:30 AM (Late morning):**
```
☀️ Morning! Hope your Monday is going well.
```

**3:00 PM (Afternoon):**
```
🌤️ Good afternoon! Here's your Monday brief.
```

**7:00 PM (Evening):**
```
🌆 Good evening! Here's your Monday summary.
```

**11:00 PM (Night):**
```
🌙 Good night! Daily summary for Monday.
```

---

## Advanced Examples

### Example 15: Context-Aware Motivational Messages

**Monday 8:00 AM:**
```
💪 *You got this!*
━━━━━━━━━━━━━━━
Let's make today productive! 🚀
```

**Tuesday 8:00 AM:**
```
💪 *You got this!*
━━━━━━━━━━━━━━━
You're ready to tackle today! 💯
```

**Wednesday 8:00 AM:**
```
💪 *You got this!*
━━━━━━━━━━━━━━━
Time to get things done! ⚡
```

**Saturday 8:00 AM:**
```
💪 *You got this!*
━━━━━━━━━━━━━━━
Enjoy your weekend - you've earned it!
```

**Sunday 8:00 AM:**
```
💪 *You got this!*
━━━━━━━━━━━━━━━
Hope you have a great weekend!
```

### Example 16: Priority-Based Task Grouping

**User has mixed priorities:**
```
3 Urgent: Fix bug, Deploy hotfix, Security review
5 High: PRs to review, Docs to update, Tests to fix
2 Medium: Refactor code, Add logging
0 Low: Nice-to-have improvements
```

**Brief shows (truncated for space):**
```
🔴 *Urgent (3):*
   • Fix bug
   • Deploy hotfix
   • Security review

🟠 *High (5):*
   • PRs to review
   • Docs to update

...and 3 more

🟡 *Medium (2):*
   • Refactor code
```

---

## Tips and Best Practices

### Tip 1: Change Brief Time for Workflow
If you get most productive at 6 AM:
```
set brief time 06:00
```

If you work late and want evening update:
```
set brief time 20:00
```

### Tip 2: Use Aliases
Both work identically:
```
morning brief
brief
```

Use whichever feels more natural!

### Tip 3: Combine with Task Creation
Before receiving your brief, create your tasks:
```
User: remember 3 high-priority items for today
User: morning brief
Bot: [Brief shows those 3 items]
```

### Tip 4: Check Before Big Days
On days with many tasks:
```
User: brief settings
Bot: [Shows total count]
User: morning brief
Bot: [Gets detailed breakdown by priority]
```

---

## Integration Code Examples

### Setting Up with Scheduler and Memory

```javascript
// In your bot initialization
const { getScheduler, CRON } = require('./scheduler');
const memory = require('./memory/memory-manager');
const { loadSkills } = require('./skills/skill-loader');

const scheduler = getScheduler(memory, async (message) => {
  // This function sends the brief via WhatsApp
  await twilioClient.messages.create({
    body: message,
    from: 'whatsapp:+1234567890',
    to: 'whatsapp:+user'
  });
});

const skills = await loadSkills('./skills', {
  memory,
  scheduler,
  // ... other context
});

// Morning brief skill is now automatically loaded and available
```

### Manual Brief Trigger in Code

```javascript
const morningBriefSkill = registry.getSkill('morning-brief');

const result = await morningBriefSkill.execute('morning brief', {
  from: '+447123456789',
  messageId: 'msg_123',
  timestamp: new Date()
});

console.log(result.message); // Prints the brief
```

---

## FAQ Examples

**Q: Can I change the time every day?**
```
A: Yes! Set brief time whenever you want. It updates immediately.

set brief time 07:00  (tomorrow at 7 AM)
set brief time 08:00  (change back to 8 AM)
```

**Q: What if I don't have any tasks?**
```
A: You'll get a brief like:
📋 *Pending Tasks*
✅ No pending tasks - great job!

[Stats still show, with 0 pending]
```

**Q: Will I miss a brief if I change the time?**
```
A: No, changing the time updates the schedule immediately.
The next brief will be at the new time.
```

**Q: Can I set the brief for multiple times per day?**
```
A: Not with one command, but you could ask the ClawdBot team
to add this feature for multiple daily briefings!
```

**Q: What happens on weekends?**
```
A: You still get your brief at the scheduled time, but with
a special weekend message at the end instead of a weekday one.
```
