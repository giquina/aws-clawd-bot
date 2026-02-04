# Claude Code Session Skill

Run autonomous Claude Code CLI sessions for complex coding tasks via voice or text commands.

## Overview

The Claude Code Session skill integrates Claude Code CLI into ClawdBot, enabling long-running autonomous coding sessions (5-30 minutes) that can read codebases, plan changes, implement features, run tests, and create GitHub pull requests—all triggered by simple voice or text commands.

## Commands

### Start a Session
```
claude code session <task description>
```

**Examples:**
- "claude code session add a health check endpoint to the API"
- "claude code session fix the login bug in the authentication module"
- "claude code session refactor the database connection code for better error handling"

**Flow:**
1. Confirms with user (shows estimated cost)
2. Spawns detached Claude Code CLI process
3. Sends progress updates every 30 seconds
4. Reports completion with PR URL
5. Times out after 30 minutes if not complete

### Check Status
```
claude code status
```

Shows active session progress or recent session history (last 3 sessions with PR URLs).

### Cancel Session
```
cancel claude code
```
or
```
stop claude code
```

Gracefully terminates the active Claude Code session (SIGTERM → SIGKILL if needed).

## Voice Integration

**Voice commands automatically detected:**
- "Use Claude Code to fix the login bug"
- "Have the agent add a dashboard component"
- "Code for me: implement user authentication"

The skill extracts the task description from voice transcriptions and routes to the session handler.

## Architecture

### Components

1. **Session Skill** (`index.js`)
   - Handles all Claude Code commands
   - Manages confirmation flow via confirmation-manager
   - Integrates with database for session tracking

2. **Task Queue** (`lib/task-queue.js`)
   - Manages async execution
   - Limits to 1 concurrent session
   - Handles process spawning and lifecycle

3. **Progress Monitor** (`lib/claude-code-monitor.js`)
   - Polls session log files every 30 seconds
   - Detects milestones: reading files, planning, creating files, running tests, creating PR
   - Sends real-time updates via Telegram

4. **Database** (`lib/database.js`)
   - Table: `claude_code_sessions`
   - Tracks session history, status, outputs, PR URLs
   - Queryable for status and history

### Session Lifecycle

```
User Command
    ↓
Confirmation (requires 'yes')
    ↓
Create session in database (status: pending)
    ↓
Add to task queue
    ↓
Spawn claude-code CLI process (status: active)
    ↓
Monitor log output (every 30s)
    ↓
Send progress updates to Telegram
    ↓
Detect completion (status: completed/failed/timeout)
    ↓
Extract PR URL and report to user
    ↓
Update outcome tracker
```

## Database Schema

```sql
CREATE TABLE claude_code_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT UNIQUE NOT NULL,
  repo TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, active, completed, failed, cancelled, timeout
  output_summary TEXT,
  pr_url TEXT,
  session_log_path TEXT,
  pid INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  duration_seconds INTEGER
);
```

## Configuration

### Repo Mapping

Known repos automatically map to EC2 paths:
```javascript
{
  'aws-clawd-bot': '/opt/clawd-bot',
  'JUDO': '/opt/projects/JUDO',
  'LusoTown': '/opt/projects/LusoTown',
  'armora': '/opt/projects/armora',
  'gqcars-manager': '/opt/projects/gqcars-manager',
  'gq-cars-driver-app': '/opt/projects/gq-cars-driver-app',
  'giquina-accountancy-direct-filing': '/opt/projects/giquina-accountancy-direct-filing'
}
```

### Limits

- **Max concurrent sessions:** 1
- **Session timeout:** 30 minutes
- **Progress update interval:** 30 seconds
- **"Still working" update:** Every 2 minutes if no milestones

### Confirmation Required

All session starts require explicit user confirmation:
- Estimated cost: $0.50-2.00
- Risk level: low
- Expected duration: 5-15 minutes

## Installation

### Prerequisites

1. **Claude Code CLI** must be installed on EC2:
   ```bash
   ./deploy.sh full install-cc
   ```

2. **Environment variable** must exist:
   ```
   ANTHROPIC_API_KEY=sk-...
   ```

3. **Skill enabled** in `skills/skills.json`:
   ```json
   "enabled": ["claude-code-session", ...]
   ```

### Deployment

```bash
# Deploy with Claude Code CLI installation
./deploy.sh full install-cc

# Or deploy without (if already installed)
./deploy.sh full
```

## Usage Examples

### Text Command (Telegram/WhatsApp)

```
User: claude code session add rate limiting to the API endpoints

Bot: ⚠ Start Claude Code session requires approval
     Estimated cost: $0.50-2.00 (estimated)
     Risk level: low
     This will run for 5-15 minutes and create a PR.
     Reply 'yes' to proceed.

User: yes

Bot: ✓ Claude Code session started for aws-clawd-bot
     Task: add rate limiting to the API endpoints

     I'll send updates as it progresses.

Bot: 🔄 Reading project files

Bot: 🔄 Planning changes

Bot: 🔄 Creating files

Bot: 🔄 Running tests

Bot: 🔄 Creating pull request

Bot: ✅ Claude Code session complete!

     PR: https://github.com/user/aws-clawd-bot/pull/42
     Duration: 8m 34s
```

### Voice Command

```
User: [voice note] "use claude code to fix the authentication bug in the login flow"

Bot: I heard: use claude code to fix the authentication bug in the login flow

     ⚠ Start Claude Code session requires approval
     ...
```

### Check Status

```
User: claude code status

Bot: 🔄 Active Claude Code Session

     Task: add rate limiting to the API endpoints
     Repo: aws-clawd-bot
     Runtime: 3m 45s
     Status: active

     Use "cancel claude code" to stop it.
```

### Cancel Session

```
User: cancel claude code

Bot: ✓ Cancelled Claude Code session: add rate limiting to the API endpoints

Bot: 🛑 Claude Code session cancelled
```

## Error Handling

### Session Already Active

```
User: claude code session add new feature

Bot: ✗ Session already active
     Reason: A Claude Code session is currently running
     Attempted: add new feature
     Suggestion: Use "claude code status" to check progress or "cancel claude code" to stop it
```

### No Project Specified

```
User: claude code session fix bug

Bot: ✗ No project specified
     Suggestion: Register this chat to a project or specify repo
```

### Session Timeout

After 30 minutes:
```
Bot: ❌ Claude Code session timed out after 30 minutes
```

### Session Failed

```
Bot: ❌ Session failed: Could not parse project structure
     Check logs for details
```

## Monitoring & Debugging

### View Logs

Session logs stored at `/tmp/claude-code-<session-id>.log` on EC2.

```bash
# SSH to EC2
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151

# View recent session log
tail -f /tmp/claude-code-*.log

# View bot logs
pm2 logs clawd-bot
```

### Query Database

```javascript
// Get active session for a chat
const active = database.getActiveClaudeCodeSession(chatId);

// Get session history
const history = database.getClaudeCodeSessionHistory(chatId, 10);

// Update session status
database.updateClaudeCodeSession(sessionId, {
  status: 'completed',
  prUrl: 'https://github.com/...'
});
```

### Task Queue Status

```javascript
const taskQueue = require('../../lib/task-queue');

// Check queue status
const status = taskQueue.getStatus();
// { queued: 0, running: 1, capacity: 1 }

// Cancel a task
await taskQueue.cancelTask(taskId);
```

## Integration with Other Skills

### Auto-Deploy After PR Merge

When Claude Code creates a PR and it's merged, the GitHub webhook triggers auto-deploy:
```
PR merged → GitHub webhook → git pull → vercel --prod → Telegram notification
```

### Context Engine Integration

Sessions tracked in outcome tracker, feeding into context engine for:
- Recent activity awareness
- Project-specific patterns
- Success/failure learning

### Voice Flow Integration

Voice commands automatically route through:
```
Voice transcription (Groq Whisper FREE)
    ↓
Intent classification (voice-flow.js)
    ↓
Smart router (NLP → command)
    ↓
Claude Code Session Skill
```

## Security

- **Command Whitelist:** All CLI commands validated via `lib/command-whitelist.js`
- **Confirmation Required:** All sessions require explicit user approval
- **Process Isolation:** Sessions run in detached processes with separate log files
- **Timeout Protection:** 30-minute hard limit prevents runaway sessions
- **Repo Validation:** Only known repos can be accessed

## Performance

- **Concurrent Limit:** 1 session at a time (prevents resource exhaustion)
- **Log Polling:** Every 30 seconds (low overhead)
- **Database Writes:** Minimal (only on status changes)
- **Memory Footprint:** ~10-50 MB per active session
- **CPU Usage:** Delegated to Claude Code CLI process

## Troubleshooting

### "Unknown repo" Error

Add repo to `getRepoPath()` method in `index.js`:
```javascript
getRepoPath(repo) {
  const knownRepos = {
    'new-repo': '/opt/projects/new-repo',
    ...
  };
  return knownRepos[repo] || null;
}
```

### Session Stuck in "Active" State

Sessions orphaned by bot restart remain in database as 'active'. Recovery:
```javascript
// Manual cleanup
const db = database.getDb();
db.prepare("UPDATE claude_code_sessions SET status = 'failed' WHERE status = 'active'").run();
```

### Progress Updates Not Appearing

Check:
1. Log file exists at `/tmp/claude-code-<session-id>.log`
2. Monitor interval running (check `activeMonitors` Map)
3. `sendProgress` callback provided in context
4. Telegram bot has permission to send messages

### Claude Code CLI Not Found

Install via:
```bash
./deploy.sh full install-cc
```

Or manually:
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
cd /opt/clawd-bot
bash scripts/install-claude-code.sh
```

## Future Enhancements

- [ ] Session pause/resume capability
- [ ] Multi-repo session support (batch operations)
- [ ] Cost tracking per session (token usage)
- [ ] Session replay/debugging tools
- [ ] Web dashboard for session visualization
- [ ] Slack integration for progress updates
- [ ] Custom milestone patterns per repo
- [ ] Session templates for common tasks

## Version History

- **v1.0** (2026-02-04) - Initial implementation
  - Basic session management (start/status/cancel)
  - Voice command integration
  - Progress monitoring with milestone detection
  - Database persistence
  - 30-minute timeout protection
  - PR URL extraction

## See Also

- [Task Queue Documentation](../../lib/task-queue.js)
- [Progress Monitor Documentation](../../lib/claude-code-monitor.js)
- [Database Schema](../../lib/database.js)
- [Voice Flow Integration](../../lib/voice-flow.js)
- [Smart Router](../../hooks/smart-router.js)
