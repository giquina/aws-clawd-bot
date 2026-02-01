# TODO.md - ClawdBot v2.2 Task Tracker

## Quick Links
- [CLAUDE.md](./CLAUDE.md) - Project documentation
- [README.md](./README.md) - Overview & commands

---

## Status Legend
- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
- ❌ Blocked

---

## Phase 1: Foundation - ✅ COMPLETE

- ✅ Memory system (SQLite persistence)
- ✅ Skills framework (28 skills)
- ✅ Scheduling system (node-cron)
- ✅ GitHub integration (full CRUD)
- ✅ AI handler with Claude

---

## Phase 2: Multi-AI System - ✅ COMPLETE

- ✅ **Groq Provider** - FREE LLaMA 3.3 70B for simple queries
- ✅ **Groq Whisper** - FREE voice transcription
- ✅ **Grok Provider** - xAI for social/X/Twitter searches
- ✅ **Claude Tiered** - Opus (brain) + Sonnet (coder)
- ✅ **Smart Router** - Classifies queries, routes to optimal AI
- ✅ **ai-settings skill** - Switch modes (economy/balanced/quality)

---

## Phase 3: Autonomous Agent - ✅ COMPLETE

- ✅ **Project Scanner** - Scans repos for issues
- ✅ **Task Executor** - Executes queued tasks
- ✅ **Morning Report** - Intelligent briefings
- ✅ **Nightly Job** - Scheduled autonomous runs
- ✅ **autonomous-config skill** - Configure behavior

---

## Phase 4: Media Handling - ✅ COMPLETE

- ✅ **Voice skill** - Transcribe voice messages
- ✅ **Image Analysis skill** - Analyze images with AI
- ✅ **Video skill** - Handle video messages
- ✅ **Files skill** - Handle document uploads

---

## Phase 5: Accountancy Skills - ✅ COMPLETE

- ✅ **deadlines** - Company filing deadlines
- ✅ **companies** - Giquina group company info
- ✅ **governance** - Board meetings, resolutions
- ✅ **intercompany** - Inter-company transactions
- ✅ **receipts** - Receipt scanning/tracking
- ✅ **moltbook** - Accountancy integrations

---

## Phase 6: Deploy & Polish - 🟡 IN PROGRESS

### 6.1 Immediate Tasks
- ⬜ Push to origin (3 commits ahead)
- ⬜ Deploy to AWS EC2 (`16.171.150.151`)
- ⬜ Test multi-AI routing in production
- ⬜ Test autonomous agent nightly run
- ⬜ Verify voice transcription works

### 6.2 Configuration Needed
- ⬜ Add `GROQ_API_KEY` to EC2 .env
- ⬜ Add `XAI_API_KEY` to EC2 .env (optional, for Grok)
- ⬜ Verify all 28 skills load on startup

---

## Phase 7: Future Enhancements - ⬜ PLANNED

### 7.1 High Priority
- ⬜ **Web dashboard** - View stats, configure settings via browser
- ⬜ **Multi-user support** - Allow other phone numbers
- ⬜ **Conversation memory per topic** - Context-aware threading
- ⬜ **Cost tracking dashboard** - Real-time AI spend monitoring

### 7.2 Medium Priority
- ⬜ **Claude Code integration** - Use MCP to talk to ClawdBot
- ⬜ **GitHub App** - Replace personal access token
- ⬜ **Slack integration** - Alternative to WhatsApp
- ⬜ **Email digest** - Daily summary via email

### 7.3 Low Priority
- ⬜ **Natural language scheduling** - "remind me tomorrow at 9am"
- ⬜ **Project templates** - Scaffold new projects via WhatsApp
- ⬜ **Code execution sandbox** - Run code snippets safely
- ⬜ **Notion integration** - Sync with Notion databases

---

## Current Stats

| Metric | Value |
|--------|-------|
| Skills | 28 |
| AI Providers | 3 (Groq, Claude, Grok) |
| Scheduled Jobs | 3 |
| Commits ahead | 3 |

---

## Next Actions (Priority Order)

1. **Push to remote** - `git push origin master`
2. **Deploy to EC2** - Run deploy script
3. **Add Groq API key** - FREE tier, get from console.groq.com
4. **Test voice messages** - Send voice note, verify transcription
5. **Wait for nightly autonomous** - Check morning report

---

*Last Updated: 2026-02-01*
*Version: 2.2 (Multi-AI + Autonomous)*
