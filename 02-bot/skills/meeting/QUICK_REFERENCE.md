# Meeting Assistant - Quick Reference Card

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `meeting start [title]` | Start recording | `meeting start Team Standup` |
| `meeting stop` | Stop & analyze | `meeting stop` |
| `meeting summary` | Show last summary | `meeting summary` |
| `meeting actions` | Show action items | `meeting actions` |
| `meeting list` | List recent meetings | `meeting list` |
| `meeting view <id>` | View meeting details | `meeting view 3` |

## Quick Start

```
1. meeting start [title]     ← Start session
2. [Send voice notes]        ← Record content
3. meeting stop              ← Get analysis
```

## What You Get

**Automatic Analysis:**
- ✓ Full transcription (Groq Whisper FREE)
- ✓ 3-5 bullet point summary (Claude Opus)
- ✓ Action items with assignees
- ✓ Stored in database forever

## Example Flow

```
You: meeting start Product Review

Bot: ✓ Meeting started: "Product Review"
     Recording... 🎙️

You: [Voice note about features, bugs, decisions]

You: meeting stop

Bot: ✅ Meeting Analysis Complete

     Summary:
     • Discussed Q2 feature roadmap
     • 3 critical bugs need immediate attention
     • Approved new pricing model

     Action Items:
     • [Sarah] Draft Q2 roadmap by Friday
     • [Dev Team] Fix critical bugs this week
     • [Finance] Update pricing by March 15
```

## Tips

- **Multiple Voice Notes**: Send as many as needed
- **Be Clear**: Mention names for better action item extraction
- **Mention Dates**: Say deadlines for automatic tracking
- **Review Later**: Use `meeting view <id>` anytime

## Status Indicators

- 🟢 **Active** - Recording in progress
- ✓ **Completed** - Analysis done
- ❌ **Failed** - Analysis error
- ⚠️ **Incomplete** - Session closed early

## Storage

All meetings stored permanently in database:
- Full transcripts
- AI summaries
- Action items
- Duration and timestamps

## Cost

- **Transcription**: FREE (Groq Whisper)
- **Analysis**: Included (Claude Opus)

## Need Help?

Type `help meeting` for full documentation
