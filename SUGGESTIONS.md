# SUGGESTIONS.md - Enhancement Ideas & Future Features

## Overview
This document captures ideas for improving ClawdBot beyond the core implementation. Ideas range from quick wins to ambitious future features.

**Last Updated:** 2026-02-02 (v2.3 Verified)

---

## ✅ COMPLETED in v2.0

| Feature | Status | Notes |
|---------|--------|-------|
| AI Code Writing | ✅ Done | `coder` skill - fix issues, edit files, create PRs |
| GitHub Actions | ✅ Done | `actions` skill - list/trigger workflows |
| Code Review | ✅ Done | `review` skill - AI review for PRs and files |
| Repository Stats | ✅ Done | `stats` skill - contributors, activity, languages |
| Read File Contents | ✅ Done | `read file <repo> <path>` in github skill |
| Search Code | ✅ Done | `search <repo> <query>` in github skill |
| View PR Details | ✅ Done | `view pr <repo> #<n>` with diff summary |
| 24/7 AWS Deployment | ✅ Done | Running on EC2 with PM2 |
| Help Command | ✅ Done | Comprehensive help with skill grouping |
| Better Welcome | ✅ Done | Time-aware greeting with capabilities |

---

## ✅ COMPLETED in v2.3 (Claude Code Agent)

| Feature | Status | Notes |
|---------|--------|-------|
| Voice Messages | ✅ Done | Groq Whisper transcription (FREE) |
| Multi-AI Routing | ✅ Done | Groq (free) / Claude (tiered) / Grok (social) |
| Project Intelligence | ✅ Done | Routes voice/text to correct project from 16 repos |
| Intent Classification | ✅ Done | Understands "file my taxes" → accountancy |
| Auto-Execution Layer | ✅ Done | 7 handlers (deploy, create-page, receipts, etc.) |
| Confirmation System | ✅ Done | Asks before risky actions |
| Receipt Processor | ✅ Done | Auto-extracts from photos via Claude Vision |
| Code Generator | ✅ Done | Creates branches + PRs automatically |
| GitHub Webhooks | ✅ Done | CI fail / PR / Issue alerts to WhatsApp |
| Overnight Queue | ✅ Done | `autonomous/nightly-autonomous.js` |
| Model Selection | ✅ Done | `ai mode economy/balanced/quality` |
| Quick Actions + Confirm | ✅ Done | `confirmation-manager.js` |
| MCP Server | ✅ Done | 9 tools for Claude Desktop/App integration |
| REST API | ✅ Done | 9 endpoints with API key auth |

---

## Quick Wins (< 1 hour each)

### 1. ~~Better Welcome Message~~ ✅ DONE

### 2. ~~`help` Command~~ ✅ DONE

### 3. Conversation Context Window
Show user how many messages are in context:
```
"(5/10 messages in memory) Your response..."
```

### 4. Error Messages with Suggestions
When something fails, suggest alternatives:
```
❌ Couldn't find repo "armra"
Did you mean: armora, gqcars-manager?
```

### 5. Emoji Signature
Let user choose an emoji that ClawdBot uses:
```
🦉 Done! PR created. - Henry
```

---

## Medium Effort (1-4 hours each)

### 6. Conversation Export
Command: `export chat`
- Export conversation to markdown file
- Include timestamps
- Save to second-brain

### 7. Quick Actions with Confirmation
For destructive actions, ask for confirmation:
```
User: delete branch feature-x
Bot: ⚠️ This will permanently delete branch 'feature-x'.
     Reply YES to confirm.
```

### 8. Rate Limit Awareness
Track API usage and warn before hitting limits:
```
📊 API Usage: 847/1000 requests today
Consider using Claude Haiku for routine tasks.
```

### 9. Multi-Repo Context
Allow analyzing multiple repos at once:
```
User: compare armora and gqcars-manager
Bot: Comparing repositories...
     armora: Node.js, 12 issues, 45 commits/month
     gqcars: Python, 3 issues, 12 commits/month
```

### 10. Code Snippet Sharing
Accept code in messages and analyze:
```
User: analyze this code:
```javascript
function foo() { ... }
```
Bot: Analysis: This function has potential race condition...
```

---

## High Effort (1+ days each)

### 11. Voice Message Support
- Accept voice messages via Twilio
- Transcribe with Whisper
- Respond with text or voice

### 12. Visual Dashboard
Next.js web app with:
- Task kanban board
- Conversation history viewer
- Memory/facts explorer
- Skill configuration
- Activity timeline

### 13. Multi-User Support
- Per-user conversation contexts
- Role-based permissions (admin, user, viewer)
- Team collaboration features

### 14. Workflow Automation
Define multi-step workflows:
```yaml
name: PR Review Workflow
trigger: new_pr
steps:
  - analyze_code
  - check_tests
  - suggest_improvements
  - post_review_comment
```

### 15. Learning Mode
```
User: when I say "deploy" I mean deploy to staging
Bot: Got it! I'll remember that "deploy" = staging deployment.
```

---

## Integration Ideas

### 16. Telegram Integration (High Priority)
- Richer formatting (buttons, inline queries)
- Better file sharing
- Multiple chat support

### 17. Discord Integration
- Server channels for different purposes
- Bot commands with slash commands
- Rich embeds for responses

### 18. Slack Integration
- Workspace channels
- Thread replies
- App home with dashboard

### 19. GitHub Webhooks ✅ IMPLEMENTED (v2.3)
Receive events instead of polling:
- New issues → WhatsApp notification ✅
- New PRs → WhatsApp notification ✅
- Failed CI → WhatsApp alert ✅

**Note:** Webhook handler ready at `/github-webhook`. Configure each GitHub repo to send webhooks to `http://16.171.150.151:3000/github-webhook`

### 20. Notion Integration
- Sync tasks with Notion database
- Create pages from conversations
- Update project docs

### 21. Linear Integration
- Issue tracking sync
- Sprint planning assistance
- Cycle reports

### 22. Calendar Integration
- Schedule meetings
- Set deadlines
- Daily agenda in morning brief

### 23. Vercel/Netlify Integration
- Deploy commands
- Preview deployments
- Deployment status

---

## AI Enhancements

### 24. Model Selection
Let user choose model per task:
```
User: use opus for this: [complex question]
User: use haiku for quick questions
```

### 25. Claude Tool Use
Enable Claude to call tools directly:
```javascript
tools: [
  { name: "create_file", ... },
  { name: "run_tests", ... },
  { name: "search_web", ... }
]
```

### 26. MCP Server Integration ✅ DONE (v2.3)
ClawdBot now IS an MCP server with 9 tools:
- clawdbot_status, clawdbot_message, clawdbot_projects
- clawdbot_project_status, clawdbot_deploy, clawdbot_command
- clawdbot_memory, clawdbot_whatsapp, clawdbot_skills

**Setup:** Add to Claude Desktop config - see `mcp-server/README.md`

### 27. Agent Delegation
Spawn sub-agents for complex tasks:
```
Main Agent → Research Agent → returns findings
           → Code Agent → returns implementation
           → Review Agent → returns feedback
```

### 28. Self-Improvement Loop
After each interaction:
1. Evaluate response quality
2. Identify improvement opportunities
3. Update system prompt/memory

---

## Autonomy Features

### 29. Overnight Work Queue
Before bed:
```
User: tonight, build the user settings page
Bot: Added to queue. I'll create a PR by morning.
```

### 30. Proactive Suggestions
Based on patterns, suggest improvements:
```
Bot: I noticed you've asked about caching 3 times this week.
     Want me to research Redis caching options?
```

### 31. Auto-Maintenance
- Clean old branches
- Close stale issues
- Update dependencies
- Run security scans

### 32. Research Reports
Daily/weekly research reports on topics of interest:
```
📚 AI RESEARCH DIGEST - Jan 31, 2026
• Claude 4 announced (Anthropic)
• GPT-5.2 multimodal update (OpenAI)
• 3 trending GitHub repos in AI agents
```

### 33. Personal CRM
Track contacts and conversations:
```
User: remind me what I discussed with John last week
Bot: On Jan 24, you discussed the API migration timeline...
```

---

## Security & Compliance

### 34. Audit Logging
Log all actions for compliance:
```json
{
  "timestamp": "2026-01-31T10:30:00Z",
  "user": "+44xxx",
  "action": "create_pr",
  "repo": "armora",
  "result": "success"
}
```

### 35. Approval Workflow
Require approval for risky actions:
```
Bot: This action requires approval:
     - Delete branch: feature-old
     Admin reply YES to approve.
```

### 36. Secret Detection
Prevent accidental secret exposure:
```
⚠️ Detected potential API key in your message.
I won't store or process this. Please use env variables.
```

### 37. GDPR Compliance
- Export user data
- Delete user data
- Consent management

---

## Performance & Reliability

### 38. Response Streaming
Stream long responses instead of waiting:
```
Bot: Analyzing repository...
     [progress bar or dots]
     ✅ Analysis complete!
```

### 39. Caching Layer
Cache common queries:
- Repo metadata (5 min TTL)
- Weather data (30 min TTL)
- Search results (1 hour TTL)

### 40. Graceful Degradation
When APIs fail, provide alternatives:
```
⚠️ GitHub API is slow. Using cached data from 5 min ago.
```

### 41. Health Dashboard
Web endpoint showing system health:
- API status (Claude, GitHub, Twilio)
- Memory usage
- Last activity
- Error rates

---

## Fun Features

### 42. Personality Modes
- Professional (default)
- Casual (more emojis, casual language)
- Mentor (explains more)
- Brief (minimal responses)

### 43. Daily Streak
Track consecutive days of usage:
```
🔥 7-day streak! You've used ClawdBot every day this week.
```

### 44. Achievements
Unlock badges for milestones:
```
🏆 Unlocked: "Bug Squasher" - Fixed 10 bugs with ClawdBot
```

### 45. Random Tips
Occasionally share helpful tips:
```
💡 Tip: Try "analyze [repo]" to get a full repo breakdown!
```

---

## Priority Matrix (Updated for v2.3)

| Effort | High Impact | Low Impact |
|--------|-------------|------------|
| **Low** | ~~Help command~~ ✅, Better errors, Emoji signature | Streak tracker, Tips |
| **Medium** | Telegram, ~~GitHub webhooks~~ ✅, ~~Overnight queue~~ ✅ | Achievements, Personality modes |
| **High** | ~~MCP integration~~ ✅, Visual dashboard, Agent delegation | ~~Voice support~~ ✅, Personal CRM |

---

## 🎯 RECOMMENDED NEXT STEPS

Based on current v2.3 capabilities, here are the highest-value additions:

### 1. ~~**Overnight Work Queue**~~ ✅ DONE (v2.3)
Implemented in `autonomous/nightly-autonomous.js`

### 2. ~~**Real-time GitHub Webhooks**~~ ✅ DONE (v2.3)
Webhook handler implemented at `/github-webhook`

**To enable:** Configure each GitHub repo's webhook settings to POST to `http://16.171.150.151:3000/github-webhook`

### 3. ~~**MCP Server Integration**~~ ✅ DONE (v2.3)
Full MCP server with 9 tools - see `mcp-server/README.md`

### 4. **Web Dashboard** (High Value, High Effort) 🎯 NEXT
Visual interface for:
- Task kanban board
- Conversation history viewer
- Memory/facts explorer
- Skill configuration
- Activity timeline

### 5. **Telegram Integration** (Medium Value)
- Richer formatting (buttons, inline keyboards)
- Better code snippet display
- Multiple chat support

### 6. **Multi-User Support** (Medium Value)
- Per-user conversation contexts
- Role-based permissions
- Team collaboration

---

## Implementation Notes

### For Each Suggestion:
1. Create GitHub issue with label `enhancement`
2. Add to TODO.md when prioritized
3. Create skill if standalone feature
4. Update SKILLS.md if new skill
5. Document in README when complete

### Decision Criteria:
- User value: How much does this help users?
- Technical debt: Does this add complexity?
- Maintenance: How much ongoing work?
- Dependencies: What external services needed?

---

*Last Updated: 2026-02-02 (v2.3 Verified Complete)*
*Contributions welcome! Add your ideas below.*
