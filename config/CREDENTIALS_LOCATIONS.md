# Credentials Locations Reference

This file tracks where API keys and credentials are stored locally.
**DO NOT commit this file** (it's in .gitignore)

---

## Active Credentials Files

| Service | File Location | Status |
|---------|---------------|--------|
| All Keys | `config/.env.local` | Primary config |
| Bot Runtime | `02-whatsapp-bot/.env` | Copy for bot |

---

## API Key Sources (where to get new ones)

| Service | URL | Notes |
|---------|-----|-------|
| GitHub | https://github.com/settings/tokens | Needs: repo, workflow, admin:org |
| Anthropic | https://console.anthropic.com/ | Claude API |
| Twilio | https://console.twilio.com | Account SID + Auth Token |
| Brave Search | https://brave.com/search/api/ | For research skill |
| OpenWeather | https://openweathermap.org/api | For morning brief |
| Vercel | https://vercel.com/account/tokens | For deploy skill |

---

## Last Updated
2026-01-31

## Notes
- GitHub token `gho_kBZ745d...` created 2026-01-31 (OAuth token via gh CLI)
- Twilio credentials are valid (ACb36b892d...)
- Anthropic key is valid (sk-ant-api03-KKj8q...) - Created 2026-01-31
- GitHub CLI authenticated as: giquina
