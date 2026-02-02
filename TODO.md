# TODO.md - ClawdBot v2.3 Task Tracker

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

## Phase 6: Deploy & Polish - ✅ COMPLETE

### 6.1 Immediate Tasks
- ✅ Push to origin
- ✅ Deploy to AWS EC2 (`16.171.150.151`)
- ✅ Test multi-AI routing in production
- ✅ Test autonomous agent nightly run
- ✅ Verify voice transcription works

### 6.2 Configuration Completed
- ✅ Add `GROQ_API_KEY` to EC2 .env
- ⬜ Add `XAI_API_KEY` to EC2 .env (optional, for Grok)
- ✅ Verify all 30 skills load on startup

---

## Phase 6.5: Claude Code Agent - ✅ COMPLETE

### Voice-First Control
- ✅ **Project Intelligence** - Routes voice/text to correct project from 16 repos
- ✅ **Intent Classifier** - AI understands "file my taxes" → accountancy
- ✅ **Groq Whisper** - FREE voice transcription

### Auto-Execution Layer
- ✅ **Action Executor** - 7 handlers (deploy, create-page, receipts, etc.)
- ✅ **Code Generator** - Creates branches + PRs automatically
- ✅ **Receipt Processor** - Auto-extracts from photos via Claude Vision
- ✅ **Confirmation Manager** - Asks before risky actions

### GitHub Webhooks (Real-time)
- ✅ **CI Fail Alerts** - Instant WhatsApp when builds fail
- ✅ **PR Notifications** - Know when PRs are opened/merged
- ✅ **Issue Alerts** - Know when issues are created
- ⬜ **Configure webhooks** - Need to set up on each GitHub repo

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
| Skills | 30 |
| AI Providers | 3 (Groq, Claude, Grok) |
| Action Handlers | 7 |
| Projects in Registry | 16 |
| Scheduled Jobs | 3 |

---

## Next Actions (Priority Order)

1. **Configure GitHub webhooks** - Point each repo to `http://16.171.150.151:3000/github-webhook`
2. **Add XAI_API_KEY** - Optional, enables Grok for social/X searches
3. **Test voice commands** - Send voice note with task instructions
4. **Build Web Dashboard** - Visual config, stats, conversation viewer
5. **MCP Server** - Connect Claude Code app to ClawdBot

---

*Last Updated: 2026-02-01*
*Version: 2.3 (Claude Code Agent)*
