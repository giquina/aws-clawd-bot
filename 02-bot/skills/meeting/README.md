# Meeting Assistant Skill

Record, transcribe, and analyze meetings with AI-powered summaries and action item extraction.

## Overview

The Meeting Assistant Skill enables ClawdBot to act as your intelligent meeting recorder and analyst. It uses Groq Whisper (FREE) for voice transcription and Claude Opus for generating summaries and extracting action items.

## Features

- **Voice Note Recording**: Record meetings via voice notes in Telegram/WhatsApp
- **Automatic Transcription**: FREE transcription using Groq Whisper large-v3 model
- **AI-Powered Summaries**: Claude Opus generates concise 3-5 bullet point summaries
- **Action Item Extraction**: Automatically identifies tasks, assignees, and deadlines
- **Meeting History**: Persistent storage of all meetings with searchable history
- **Multi-Chunk Support**: Handle long meetings with multiple voice notes

## Commands

### `meeting start [title]`
Start a new meeting recording session.

**Example:**
```
meeting start Team Standup
meeting start Product Review Meeting
meeting start
```

**Response:**
- Creates a meeting record in the database
- Provides instructions for recording voice notes
- Shows meeting ID for reference

### `meeting stop`
Stop recording and analyze the meeting.

**Example:**
```
meeting stop
```

**Response:**
- Transcribes all voice notes using Groq Whisper
- Generates AI summary using Claude Opus
- Extracts action items with assignees and deadlines
- Stores everything in the database
- Sends complete analysis via message

### `meeting summary`
Get the AI summary of your last meeting.

**Example:**
```
meeting summary
```

**Response:**
- Meeting title and date
- 3-5 bullet point summary
- Key discussion points

### `meeting actions`
Get action items from your last meeting.

**Example:**
```
meeting actions
```

**Response:**
- All identified action items
- Responsible parties (if mentioned)
- Due dates (if mentioned)

### `meeting list`
List your recent meetings.

**Example:**
```
meeting list
```

**Response:**
- Last 10 meetings
- Meeting ID, title, date, duration
- Summary preview for each

### `meeting view <id>`
View full details of a specific meeting.

**Example:**
```
meeting view 3
```

**Response:**
- Complete meeting details
- Full summary
- All action items
- Participants (if recorded)
- Duration and status

## Usage Flow

### Basic Flow
1. **Start**: `meeting start Project Planning`
2. **Record**: Send voice notes with meeting content
3. **Stop**: `meeting stop`
4. **Review**: Receive automatic analysis with summary and action items

### Review Flow
1. **Summary**: `meeting summary` - Quick overview
2. **Actions**: `meeting actions` - Task list
3. **Details**: `meeting view 5` - Full transcript and analysis

### History Flow
1. **List**: `meeting list` - Browse recent meetings
2. **View**: `meeting view <id>` - Open specific meeting
3. **Reference**: Access transcripts and action items anytime

## Technical Details

### Transcription
- **Engine**: Groq Whisper large-v3
- **Cost**: FREE (Groq provides free API access)
- **Language**: English (forced for accuracy)
- **Quality**: High-quality transcription with punctuation

### AI Analysis
- **Model**: Claude Opus 4.5 (THE BRAIN)
- **Summary Prompt**: "Analyze this meeting transcript and provide a concise summary in 3-5 bullet points"
- **Action Items Prompt**: "Extract all action items with what, who, and when"

### Storage
- **Database**: SQLite (meetings table)
- **Fields**:
  - `id`: Auto-increment meeting ID
  - `title`: Meeting title
  - `transcript`: Full transcription text
  - `summary`: AI-generated summary
  - `action_items`: Extracted action items
  - `participants`: List of participants (if mentioned)
  - `duration_minutes`: Meeting duration
  - `audio_file_path`: Path to audio files (future use)
  - `status`: active, completed, incomplete, failed
  - `user_id`: Owner of the meeting
  - `created_at`: Start timestamp
  - `completed_at`: End timestamp

### Data Directory
- **Production**: `/opt/clawd-bot/data/meetings/`
- **Local**: `02-bot/data/meetings/`

## Configuration

In `skills.json`:

```json
{
  "meeting": {
    "maxActiveSessions": 1,
    "maxAudioChunks": 50,
    "transcriptionModel": "whisper-large-v3",
    "analysisModel": "opus",
    "storageDir": "meetings"
  }
}
```

## Environment Variables

Required:
- `GROQ_API_KEY`: FREE from console.groq.com
- `ANTHROPIC_API_KEY`: For Claude Opus analysis

## Integration with Outcome Tracker

The skill integrates with the outcome tracker to log:
- Meeting analysis completion
- Success/failure status
- Meeting metadata (duration, chunks, etc.)

## Limitations

### MVP Version
- Voice note-based recording only (no live call recording yet)
- Manual start/stop (no automatic meeting detection)
- English transcription only (multi-language support planned)
- Text-based summaries (no visual reports yet)

### Future Enhancements
- Live Twilio call recording
- Automatic meeting detection via calendar integration
- Multi-language support (Portuguese, Spanish, French)
- PDF report generation
- Speaker identification and diarization
- Real-time transcription during calls
- Integration with task management systems
- Calendar event creation for action items

## Error Handling

The skill handles:
- No audio chunks recorded (graceful error message)
- Transcription failures (marks chunk as failed, continues)
- AI analysis failures (stores transcript only)
- Multiple active sessions (prevents conflicts)
- Database errors (fallback to error messages)

## Examples

### Team Standup
```
User: meeting start Team Standup
Bot: ✓ Meeting started: "Team Standup"
     Recording... 🎙️

User: [Voice note] "John is working on the login feature,
      expects to finish by Friday. Sarah is blocked on the
      API integration, needs help from backend team.
      I'm reviewing PRs today."

User: meeting stop
Bot: ✓ Meeting stopped: "Team Standup"
     Processing...

     ✅ Meeting Analysis Complete

     Summary:
     • John working on login feature (due Friday)
     • Sarah blocked on API integration, needs backend help
     • PR reviews in progress today

     Action Items:
     • [John] Complete login feature by Friday
     • [Backend Team] Assist Sarah with API integration (urgent)
     • [You] Complete PR reviews today
```

### Product Planning
```
User: meeting start Product Planning Q2
Bot: ✓ Meeting started: "Product Planning Q2"

User: [Multiple voice notes with discussion]

User: meeting stop
Bot: [Full analysis with summary and action items]

User: meeting actions
Bot: Action Items:
     1. Draft Q2 roadmap by March 15 (Sarah)
     2. Schedule stakeholder review meeting (You)
     3. Update pricing model documentation (Finance team)
     4. Review competitor analysis (Marketing)
```

## Priority

**Priority: 20** - Same priority as monitoring and docker management skills, ensuring it's checked before generic AI fallback but after critical control skills.

## Dependencies

- `BaseSkill` - Base class for all skills
- `lib/database.js` - SQLite persistence
- `lib/voice-flow.js` - Groq Whisper transcription
- `ai-handler.js` - Claude Opus analysis
- `lib/outcome-tracker.js` - Action tracking

## Testing

Run manual test:
```bash
cd 02-bot
node -e "
const MeetingSkill = require('./skills/meeting');
const skill = new MeetingSkill();
console.log('Commands:', skill.commands.map(c => c.usage));
"
```

Test database functions:
```bash
cd 02-bot
node -e "
const db = require('./lib/database');
const result = db.saveMeeting('test', { title: 'Test' });
console.log('Created:', result);
console.log('Retrieved:', db.getMeeting(result.id));
db.deleteMeeting(result.id);
"
```

## Deployment

1. Ensure database schema is up to date (meetings table)
2. Add "meeting" to skills.json enabled array
3. Deploy to EC2: `./deploy.sh full`
4. Verify skill loads: Check PM2 logs for "Meeting skill initialized"
5. Test with Telegram: `meeting start Test` → voice note → `meeting stop`

## Support

For issues or questions:
- Check PM2 logs: `pm2 logs clawd-bot --lines 100`
- Review meeting table: SQLite CLI on `data/clawdbot.db`
- Verify Groq API key is set: `echo $GROQ_API_KEY`
- Check Anthropic API key: `echo $ANTHROPIC_API_KEY`
