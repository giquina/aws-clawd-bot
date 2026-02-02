# MEMORY.md - ClawdBot Context Cache

> Auto-generated template - will be populated dynamically at runtime
> This file serves as context cache for the OpenClaw Executive Assistant spec

---

## Known Facts

*Facts are populated from SQLite database at runtime via `lib/memory-export.js`*

### User Preferences
- Deep work hours: 9am-12pm, 2pm-5pm (do not interrupt)
- Timezone: Europe/London
- Morning brief: 7am
- Evening summary: 6pm

### System Configuration
- AI mode: balanced (economy/balanced/quality)
- Auto-approve: docs, tests, formatting changes
- Require approval: deployments, financial actions, code changes

---

## Active Projects

Projects are loaded from `config/project-registry.json`:

- **aws-clawd-bot**: WhatsApp AI Assistant (this bot)
- **giquina-accountancy**: Tax filing, HMRC MTD, Companies House
- **LusoTown**: Portuguese community platform
- **JUDO**: Martial arts training app
- **GQCars**: GQ Cars business operations
- ... and 11 more projects

---

## Pending Tasks

*Pending tasks are loaded from memory database at runtime*

### Urgent
- (populated at runtime)

### High Priority
- (populated at runtime)

---

## Recent Context

*Last 5 interactions are loaded at runtime for conversation continuity*

---

## Preferences

- **Deep work hours**: 9am-12pm, 2pm-5pm
- **Timezone**: Europe/London
- **Morning brief**: 7am
- **Evening summary**: 6pm
- **AI mode**: balanced
- **Proactive behaviors ON**: morning briefing, end-of-day summary, proactive alerts
- **Proactive behaviors OFF**: auto-respond emails, auto-decline invites, auto-organize downloads

---

## Priority Contacts

*Configure in system settings*

---

## Ignore List

- Newsletters
- Promotional emails
- LinkedIn notifications

---

*End of MEMORY.md*
*This file is regenerated via `lib/memory-export.js` - see writeMemoryMd()*
