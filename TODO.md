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

## Phase 7: MCP Server & API - ✅ COMPLETE

- ✅ **REST API Endpoints** - `/api/*` routes for programmatic access
- ✅ **API Authentication** - X-API-Key header authentication
- ✅ **MCP Server** - Full MCP protocol implementation
- ✅ **Claude Desktop config** - Ready-to-use config template
- ✅ **9 MCP Tools** - status, message, projects, deploy, command, memory, whatsapp, skills

---

## Phase 8: Future Enhancements - ⬜ PLANNED

### 8.1 High Priority
- ⬜ **Web dashboard** - View stats, configure settings via browser
- ⬜ **Multi-user support** - Allow other phone numbers
- ⬜ **Conversation memory per topic** - Context-aware threading
- ⬜ **Cost tracking dashboard** - Real-time AI spend monitoring

### 8.2 Medium Priority
- ⬜ **GitHub App** - Replace personal access token
- ⬜ **Slack integration** - Alternative to WhatsApp
- ⬜ **Email digest** - Daily summary via email

### 8.3 Low Priority
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
| API Endpoints | 9 |
| MCP Tools | 9 |

---

## Next Actions (Priority Order)

### Configuration Tasks (Manual)
1. **Configure GitHub webhooks** - Point each repo to `http://16.171.150.151:3000/github-webhook`
2. **Add XAI_API_KEY to EC2** - Optional, enables Grok for social/X searches
3. **Set secure CLAWDBOT_API_KEY on EC2** - Replace default dev key

### Testing Tasks
4. **Test MCP Server** - Configure Claude Desktop with MCP server config
5. **Test voice commands** - Send voice note with task instructions

### Future Development
6. **Build Web Dashboard** - Visual config, stats, conversation viewer (Phase 8)

---

## Verification Log

**2026-02-02** - All Phase 1-7 features verified implemented:
- ✅ 30 skills enabled and loading
- ✅ 3 AI providers (Groq, Claude, Grok)
- ✅ 7 action handlers registered
- ✅ 16 projects in registry
- ✅ 3 scheduled jobs configured
- ✅ 9 REST API endpoints implemented
- ✅ 9 MCP tools available
- ✅ All lib modules present (project-intelligence, intent-classifier, action-executor, confirmation-manager, code-generator, receipt-processor)

---

*Last Updated: 2026-02-02*
*Version: 2.3 (Claude Code Agent + MCP Server)*
*Verified: All code complete, pending manual configuration tasks*
