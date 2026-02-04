# Analytics Dashboard Skill

Business analytics and insights from ClawdBot's internal database.

## Overview

The Analytics skill provides comprehensive insights into ClawdBot's usage, performance, and business metrics. All data is sourced from ClawdBot's SQLite database, eliminating the need for external API integrations.

## Commands

### Overall Dashboard
```
analytics
```
Shows top-level metrics across all categories:
- Messages this week
- Deployment success rate
- Plan completion rate
- Pomodoro sessions today
- Active projects count

### Usage Statistics
```
analytics usage
analytics activity
```
Bot usage metrics:
- Message volume (this week vs last week)
- Growth percentage
- Daily activity chart (last 7 days)
- Claude Code session statistics
- Most active chat

### Deployment Analytics
```
analytics deployments
analytics deploys
```
Deployment tracking:
- Total deployments this week
- Success/failure breakdown
- Success rate percentage
- Deployments by project
- Recent deployment history

### Productivity Tracking
```
analytics productivity
analytics pomodoro
analytics focus
```
Personal productivity metrics:
- Pomodoro sessions completed today
- Total focus time
- Completion rate
- Weekly overview
- Daily trend chart (last 7 days)

### Expense Analytics
```
analytics expenses
analytics spending
analytics budget
```
Financial tracking:
- Monthly spending totals
- VAT breakdown
- Month-over-month comparison
- Spending by category
- Budget status (if budgets are configured)

### GitHub Activity
```
analytics github
analytics git
analytics prs
```
Development activity:
- Plans created this week
- Pull requests opened
- Completion rate
- Activity by repository
- Recent PR history

### Project-Specific Analytics
```
analytics <project>
```
Supported projects:
- JUDO
- LusoTown
- armora
- gqcars-manager
- gq-cars-driver-app
- giquina-accountancy-direct-filing

Metrics per project:
- Deployments this week
- Plans created
- Success rates
- Recent activity timeline

## Features

### Visual Charts
Uses Unicode block characters for visual appeal:
- `█` Full block
- `▓` Dark shade
- `▒` Medium shade
- `░` Light shade

Example: `██████████░░░░░░░░░░ 50%`

### Caching
- 5-minute TTL to reduce database load
- Automatic cache invalidation
- Max 20 cached entries

### Time Comparisons
- This week vs last week
- Month-over-month growth
- Daily trends (last 7 days)
- Percentage changes with trend indicators (📈 📉 ➡️)

## Data Sources

| Metric | Database Table |
|--------|---------------|
| Messages | `conversations` |
| Deployments | `deployments` |
| Plans | `plan_history` |
| Pomodoro | `pomodoro_sessions` |
| Claude Code | `claude_code_sessions` |
| Expenses | `data/receipts.json` |
| Budgets | `budgets` |

## Configuration

In `skills.json`:
```json
{
  "analytics": {
    "cacheTTLMinutes": 5,
    "defaultPeriod": "week",
    "maxCacheEntries": 20
  }
}
```

## Examples

### Dashboard Output
```
📊 *ClawdBot Analytics Dashboard*

*This Week (2026-01-28 to 2026-02-04)*
💬 Messages: 247
🚀 Deployments: 12 (11 successful)
📝 Plans: 8 (7 completed)
⏱️ Pomodoro Today: 5 sessions
📦 Active Projects: 4

*Success Rates*
Deployments: ██████████░ 92%
Plans: ████████░░░ 88%

_Use 'analytics usage', 'analytics deployments', etc. for details_
```

### Usage Stats Output
```
📈 *Bot Usage Statistics*

*Messages*
This week: 247
Last week: 198
Growth: 📈 +25%

*Daily Activity (Last 7 Days)*
01-28: ████░░░░░░ 28
01-29: ██████░░░░ 35
01-30: ████████░░ 42
01-31: ██████████ 51
02-01: ████████░░ 39
02-02: ██████░░░░ 32
02-03: ████░░░░░░ 20

*Claude Code Sessions*
Total: 12
Completed: 10
Success rate: 83%
```

## Integration with Other Skills

The Analytics skill complements:
- **Pomodoro** - Productivity tracking
- **Receipts** - Expense analytics
- **GitHub** - Development metrics
- **Remote Exec** - Deployment tracking
- **Claude Code Session** - AI coding analytics

## Future Enhancements

Potential additions (not yet implemented):
- Google Analytics integration
- Stripe revenue tracking
- Vercel analytics API
- Custom date ranges
- Export to CSV/PDF
- Scheduled weekly reports
- Slack/email integration

## Performance

- Typical query time: < 50ms
- Cache hit rate: ~80% in normal usage
- Memory footprint: ~1MB (includes 20 cached reports)
- Database impact: Read-only, no writes

## Error Handling

Graceful degradation:
- Missing receipts.json → Shows "No data" message
- Empty database tables → Shows zeros with helpful text
- Database unavailable → Clear error message
- Malformed data → Skipped with warning logged

## Author

Part of ClawdBot v2.6 Multi-Skill Implementation (Phase 3, Priority 3, Skill #13)
