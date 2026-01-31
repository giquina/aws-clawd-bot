# AWS ClawdBot Upgrade Plan

## Vision Statement
Transform the current reactive WhatsApp bot into a **24/7 autonomous AI employee** matching the capabilities described in the ClawdBot ecosystem - with infinite memory, proactive features, skills system, and full computer control.

---

## Current State Assessment

### What We Have (MVP)
| Component | Status | Description |
|-----------|--------|-------------|
| WhatsApp Integration | ✅ Working | Twilio webhook, phone whitelist |
| Claude AI Chat | ✅ Working | Claude Sonnet via API |
| GitHub Read Ops | ✅ Working | List repos, analyze, get issues |
| Docker Deployment | ✅ Working | Multi-container setup |
| AWS Script | ✅ Ready | PowerShell deployment |

### What's Missing (Gap Analysis)
| Component | Status | Priority |
|-----------|--------|----------|
| Persistent Memory | ❌ Missing | **CRITICAL** |
| Skills/Plugin System | ❌ Missing | **CRITICAL** |
| Proactive Features | ❌ Missing | **HIGH** |
| Morning/Evening Briefs | ❌ Missing | **HIGH** |
| Scheduling System | ❌ Missing | **HIGH** |
| GitHub Write Ops (PR, commit) | 🟡 Available (unused) | **HIGH** |
| Code Execution Sandbox | ❌ Missing | **MEDIUM** |
| Second Brain/Documents | ❌ Missing | **MEDIUM** |
| MCP Server Integration | ❌ Missing | **MEDIUM** |
| Visual Dashboard | ❌ Missing | **LOW** |
| Multi-user Support | ❌ Missing | **LOW** |

---

## Target Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           AWS EC2 / Local Mac           │
                    │                                         │
WhatsApp ──────────►│  ┌─────────────────────────────────┐   │
Telegram ──────────►│  │      ClawdBot Core Engine       │   │
Discord  ──────────►│  │   (index.js + message router)   │   │
                    │  └──────────────┬──────────────────┘   │
                    │                 │                       │
                    │    ┌────────────┼────────────┐         │
                    │    ▼            ▼            ▼         │
                    │ ┌──────┐   ┌──────────┐  ┌────────┐   │
                    │ │Skills│   │  Memory  │  │Scheduler│   │
                    │ │System│   │  System  │  │  Cron   │   │
                    │ └──┬───┘   └────┬─────┘  └────┬───┘   │
                    │    │            │             │        │
                    │    ▼            ▼             ▼        │
                    │ ┌─────────────────────────────────┐   │
                    │ │          Tool Registry          │   │
                    │ │  • AI Handler (Claude/GPT)      │   │
                    │ │  • GitHub Handler (full ops)    │   │
                    │ │  • Code Executor (E2B/sandbox)  │   │
                    │ │  • File System                  │   │
                    │ │  • Research (Brave/Google)      │   │
                    │ │  • Email (Gmail/Outlook)        │   │
                    │ │  • Calendar                     │   │
                    │ └─────────────────────────────────┘   │
                    │                 │                      │
                    │    ┌────────────┼────────────┐        │
                    │    ▼            ▼            ▼        │
                    │ ┌──────┐   ┌──────────┐  ┌────────┐  │
                    │ │SQLite│   │  Redis   │  │  Docs  │  │
                    │ │Memory│   │  Queue   │  │ Store  │  │
                    │ └──────┘   └──────────┘  └────────┘  │
                    └─────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
**Goal:** Core infrastructure for autonomous operation

1. **Memory System**
   - SQLite database for persistent storage
   - Conversation history (unlimited, searchable)
   - User preferences and facts
   - Task/project tracking

2. **Skills Framework**
   - Plugin loader architecture
   - Skill registry with discovery
   - Command routing to skills
   - Skill configuration system

3. **Scheduling System**
   - node-cron integration
   - Scheduled task storage
   - Morning brief trigger
   - Evening report trigger

### Phase 2: Core Features (Days 3-5)
**Goal:** Essential ClawdBot features

4. **Morning Brief**
   - Weather API integration
   - Task summary from memory
   - Overnight work report
   - Today's priorities

5. **GitHub Full Integration**
   - Wire up code-analyzer.js
   - Create PR command
   - Create branch command
   - Commit file command
   - Close issue command

6. **Research Capability**
   - Brave Search API
   - Web scraping (Puppeteer)
   - Content summarization
   - Trend detection

### Phase 3: Autonomy (Days 6-8)
**Goal:** Proactive AI employee behavior

7. **Proactive Task Engine**
   - Auto-suggest tasks
   - Background research
   - Overnight vibe coding
   - Self-improvement loops

8. **Second Brain**
   - Document generation
   - Daily journal entries
   - Concept extraction
   - Knowledge graph

9. **Code Execution**
   - E2B sandbox integration OR
   - Local Docker sandbox
   - Test runner
   - Build commands

### Phase 4: Polish (Days 9-10)
**Goal:** Production-ready deployment

10. **Multi-Channel Support**
    - Telegram bot integration
    - Discord bot (optional)
    - iMessage (Mac only)

11. **Dashboard (Optional)**
    - Next.js web UI
    - Task kanban board
    - Memory viewer
    - Skill management

12. **Production Hardening**
    - Error recovery
    - Rate limiting
    - Health monitoring
    - Auto-restart

---

## Skills to Implement

See `SKILLS.md` for full details.

| Skill | Priority | Complexity |
|-------|----------|------------|
| memory | CRITICAL | Medium |
| github-full | HIGH | Medium |
| scheduler | HIGH | Medium |
| morning-brief | HIGH | Low |
| research | HIGH | Medium |
| vibe-coder | HIGH | High |
| email | MEDIUM | Medium |
| calendar | MEDIUM | Medium |
| second-brain | MEDIUM | High |
| brave-search | LOW | Low |

---

## Success Criteria

### Minimum Viable ClawdBot
- [ ] Remembers conversations across restarts
- [ ] Sends morning brief at 8am
- [ ] Can create GitHub PRs via WhatsApp
- [ ] Has scheduled task capability
- [ ] Learns user preferences over time

### Full ClawdBot
- [ ] Proactively suggests and executes tasks
- [ ] Overnight vibe coding with PR review
- [ ] Second brain with searchable documents
- [ ] Research capability with summaries
- [ ] Multi-channel (WhatsApp + Telegram)

---

## Resource Requirements

### APIs Needed
- [x] Anthropic API (Claude) - existing
- [x] GitHub API - existing
- [x] Twilio API - existing
- [ ] OpenWeatherMap API - free tier
- [ ] Brave Search API - free tier
- [ ] Gmail API (optional) - free
- [ ] E2B API (optional) - paid

### Dependencies to Add
```json
{
  "better-sqlite3": "^9.0.0",
  "node-cron": "^3.0.0",
  "axios": "^1.6.0",
  "puppeteer": "^21.0.0",
  "telegram": "^2.19.0"
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API costs | Use Claude Haiku for routine tasks |
| Memory bloat | Implement retention policies |
| Runaway automation | Require approval for destructive actions |
| Security | Sandbox code execution |
| Downtime | Docker restart policies + health checks |

---

## Next Steps

1. Review this plan
2. Check TODO.md for task breakdown
3. Start with Phase 1 (Memory System)
4. Test each phase before moving on

---

*Last Updated: 2026-01-31*
*Status: Planning Complete - Ready for Implementation*
