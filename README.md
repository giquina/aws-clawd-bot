# ClawdBot - AI Coding Assistant for WhatsApp

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude AI](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange)](https://anthropic.com)
[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366?logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)

**Your personal AI coding assistant running 24/7, controlled entirely from WhatsApp.**

ClawdBot transforms WhatsApp into a powerful developer command center. Send commands via text message to manage GitHub repositories, track tasks, get morning briefings, and leverage Claude AI for coding assistance - all while you're on the go.

---

## Features

| Feature | Description |
|---------|-------------|
| **Persistent Memory** | Remembers conversations and facts you share across sessions (SQLite) |
| **Skills System** | Modular, extensible plugin architecture for adding new capabilities |
| **Scheduler** | Automated morning briefs, reminders, and recurring tasks (node-cron) |
| **GitHub Integration** | List repos, analyze code, create PRs/branches/issues, add comments |
| **Claude AI** | Natural language processing for coding questions and assistance |
| **Task Management** | Track tasks with priorities (urgent/high/medium/low) |
| **Webhook Support** | Receive GitHub events (PRs, issues, pushes) directly in WhatsApp |

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- [Twilio Account](https://www.twilio.com/try-twilio) (for WhatsApp integration)
- [GitHub Personal Access Token](https://github.com/settings/tokens)
- [Anthropic API Key](https://console.anthropic.com/) (for Claude AI)
- Your WhatsApp phone number

### Installation

```bash
# Clone the repository
git clone https://github.com/giquina/aws-clawd-bot.git
cd aws-clawd-bot

# Install dependencies
cd 02-whatsapp-bot
npm install

# Configure environment
cp ../config/.env.example ../config/.env.local
# Edit .env.local with your API keys and settings

# Start the bot
npm start
```

### Interactive Setup (Recommended)

```bash
npm run setup  # Interactive configuration wizard
```

### Development Mode

```bash
npm run dev    # Auto-reload on file changes (uses nodemon)
```

---

## WhatsApp Commands

### Help & Navigation

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `help <skill>` | Show commands for a specific skill |
| `commands` | Alias for help |
| `skills` | List all loaded skills |
| `status` | Check bot health and statistics |

### Memory & Facts

| Command | Description |
|---------|-------------|
| `remember <fact>` | Save a fact about yourself |
| `my facts` | List all stored facts |
| `what do you know about me` | Alternative for listing facts |
| `forget <topic>` | Delete facts containing a topic |
| `clear memory` | Clear conversation history |

### GitHub Integration

| Command | Description |
|---------|-------------|
| `list repos` | List all monitored repositories |
| `analyze <repo>` | Get repository statistics and code structure |
| `create branch <repo> <name>` | Create a new branch from main |
| `create branch <repo> <name> from <base>` | Create branch from specific base |
| `create issue <repo> <title>` | Create a new GitHub issue |
| `close issue <repo> #<number>` | Close an issue |
| `comment <repo> #<number> <message>` | Add comment to issue/PR |
| `create pr <repo> <title>` | Create a pull request (guided) |

### Morning Brief & Scheduler

| Command | Description |
|---------|-------------|
| `morning brief` or `brief` | Trigger a morning brief immediately |
| `set brief time HH:MM` | Set daily brief time (24-hour format) |
| `brief settings` | Show current brief configuration |

### AI Assistance

Any message that doesn't match a specific command is sent to Claude AI for natural language processing. You can ask coding questions, request explanations, or get help with development tasks.

---

## Architecture

```
WhatsApp --> Twilio --> Express Webhook (port 3000)
                              |
                              v
                      +-------+-------+
                      |  Skills Router |
                      +-------+-------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
         +--------+     +----------+    +----------+
         | Memory |     |  GitHub  |    | Scheduler|
         | (SQLite)|    | (Octokit)|    |(node-cron)|
         +--------+     +----------+    +----------+
              |               |               |
              v               v               v
         +--------+     +----------+    +----------+
         |  Facts |     |   PRs    |    |  Jobs    |
         |  Tasks |     |  Issues  |    |  Briefs  |
         |  History|    | Branches |    | Reminders|
         +--------+     +----------+    +----------+
              |
              v
         +--------+
         |Claude AI|
         +--------+

GitHub Events --> /github-webhook --> WhatsApp Notifications
```

### Project Structure

```
aws-clawd-bot/
├── 02-whatsapp-bot/           # Main application
│   ├── index.js               # Express server & webhook handler
│   ├── ai-handler.js          # Claude AI integration
│   ├── github-handler.js      # Basic GitHub API (axios)
│   ├── github-webhook.js      # GitHub webhook event handler
│   ├── memory/
│   │   ├── memory-manager.js  # SQLite persistence layer
│   │   └── schema.sql         # Database schema
│   ├── scheduler/
│   │   ├── scheduler.js       # Job scheduler (node-cron)
│   │   └── jobs/              # Built-in job handlers
│   └── skills/
│       ├── base-skill.js      # Abstract skill class
│       ├── skill-registry.js  # Skill management
│       ├── skill-loader.js    # Dynamic skill loading
│       ├── github/            # GitHub skill
│       ├── memory/            # Memory skill
│       ├── morning-brief/     # Morning brief skill
│       └── help/              # Help skill
├── 03-github-automation/      # Advanced GitHub operations
│   └── code-analyzer.js       # Octokit-based code analysis
├── 05-docker/                 # Docker configuration
│   └── docker-compose.yml     # Multi-service orchestration
├── config/
│   ├── .env.example           # Environment template
│   └── .env.local             # Your configuration (gitignored)
├── scripts/
│   ├── deploy-to-aws.ps1      # AWS deployment automation
│   └── setup.js               # Interactive setup wizard
└── docs/                      # Additional documentation
```

---

## Configuration

### Required Environment Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Claude AI API key | [Anthropic Console](https://console.anthropic.com/) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | [Twilio Console](https://console.twilio.com/) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | [Twilio Console](https://console.twilio.com/) |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp number | Twilio Sandbox: `+14155238886` |
| `YOUR_WHATSAPP` | Your phone number | Format: `+447123456789` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | [GitHub Settings](https://github.com/settings/tokens) |
| `GITHUB_USERNAME` | Your GitHub username | Your profile |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPOS_TO_MONITOR` | - | Comma-separated list of repo names |
| `GITHUB_WEBHOOK_SECRET` | - | Secret for webhook signature verification |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `TIMEZONE` | `Europe/London` | Timezone for scheduler |
| `MORNING_BRIEF_TIME` | `08:00` | Default morning brief time |
| `BRAVE_API_KEY` | - | For research/web search capability |
| `OPENWEATHER_API_KEY` | - | For weather in morning briefs |
| `WEATHER_CITY` | `London` | City for weather data |

### Example Configuration

```bash
# config/.env.local

# Required
ANTHROPIC_API_KEY=sk-ant-api...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+14155238886
YOUR_WHATSAPP=+447123456789
GITHUB_TOKEN=ghp_...
GITHUB_USERNAME=yourusername

# Recommended
REPOS_TO_MONITOR=myproject,another-repo,third-repo
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Optional
TIMEZONE=Europe/London
MORNING_BRIEF_TIME=08:00
```

---

## Skills System

ClawdBot uses a modular skills architecture. Each skill is a self-contained module that handles specific commands.

### Built-in Skills

| Skill | Priority | Description |
|-------|----------|-------------|
| `help` | 100 | Command documentation and skill listing |
| `memory` | 50 | Fact storage and conversation management |
| `morning-brief` | 40 | Daily briefings and scheduling |
| `github` | 10 | Repository management and automation |

### Creating a Custom Skill

1. Create a new folder in `02-whatsapp-bot/skills/`:

```javascript
// skills/my-skill/index.js
const BaseSkill = require('../base-skill');

class MySkill extends BaseSkill {
  name = 'my-skill';
  description = 'Does something amazing';
  priority = 20;

  commands = [
    {
      pattern: /^do magic$/i,
      description: 'Perform magic',
      usage: 'do magic'
    },
    {
      pattern: /^magic (\w+)$/i,
      description: 'Magic with a parameter',
      usage: 'magic <thing>'
    }
  ];

  async execute(command, context) {
    const { userId, memory } = context;

    if (/^do magic$/i.test(command)) {
      return this.success('Magic performed successfully!');
    }

    const match = command.match(/^magic (\w+)$/i);
    if (match) {
      return this.success(`You cast magic on: ${match[1]}`);
    }

    return this.error('Unknown magic command');
  }
}

module.exports = MySkill;
```

2. Skills are auto-loaded from the `skills/` directory on startup.

### Skill Lifecycle

- **`initialize()`** - Called when skill is loaded (setup, connect services)
- **`canHandle(command)`** - Check if skill can handle a command
- **`execute(command, context)`** - Process the command and return response
- **`shutdown()`** - Called when skill is unloaded (cleanup)

### Skill Context

Skills receive a context object with:

```javascript
{
  userId: '+447123456789',      // User's phone number
  fromNumber: 'whatsapp:+44...', // Full Twilio format
  memory: MemoryManager,        // Persistent storage
  ai: AIHandler,                // Claude AI handler
  config: { ... }               // Configuration
}
```

---

## Deployment

### Local Development with ngrok

1. Start the bot:
   ```bash
   cd 02-whatsapp-bot && npm run dev
   ```

2. Expose with ngrok:
   ```bash
   ngrok http 3000
   ```

3. Configure Twilio webhook:
   - Go to [Twilio Console](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
   - Set webhook URL: `https://your-ngrok-url.ngrok.io/webhook`

### AWS EC2 Deployment

```bash
# Run the deployment script (PowerShell)
cd scripts
.\deploy-to-aws.ps1
```

The script handles:
- EC2 instance creation (t2.micro, Free Tier eligible)
- Security group configuration (ports 22, 80, 443, 3000)
- SSH key generation
- Docker installation and container deployment

**Default Configuration:**
- Region: `eu-west-2` (London)
- Instance: `t2.micro`
- SSH key: `~/.ssh/clawd-bot-key.pem`
- App path: `/opt/clawd-bot/`

### Docker Deployment

```bash
cd 05-docker
docker-compose up --build -d
```

The Docker setup includes:
- `clawd-bot` container (Node.js Express server, port 3000)
- Automatic restarts and health checks

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Twilio WhatsApp webhook (incoming messages) |
| `/github-webhook` | POST | GitHub webhook (events: push, PR, issues) |
| `/health` | GET | Health check and status information |

### Health Check Response

```json
{
  "status": "online",
  "uptime": 3600,
  "timestamp": "2026-01-31T10:00:00.000Z",
  "memory": {
    "heapUsed": "45.23 MB"
  },
  "features": {
    "persistentMemory": true,
    "skillsFramework": true,
    "scheduler": true
  },
  "stats": {
    "totalMessages": 150,
    "totalFacts": 12,
    "pendingTasks": 3
  }
}
```

---

## Cost Breakdown

| Service | Free Tier | After Free Tier |
|---------|-----------|-----------------|
| AWS EC2 (t2.micro) | 12 months FREE | ~$10/month |
| AWS Storage (30GB) | 12 months FREE | ~$1/month |
| Twilio WhatsApp | ~$3/month | ~$3/month |
| Claude AI API | Pay per use | ~$5-20/month* |
| **TOTAL** | **~$3/month** | **~$19-34/month** |

*Claude API costs depend on usage. Light usage is very affordable.

---

## Troubleshooting

### Bot Not Responding

1. Check health endpoint: `curl http://localhost:3000/health`
2. Verify Twilio webhook URL is correct
3. Ensure `YOUR_WHATSAPP` matches your phone number exactly
4. Check console logs for errors

### GitHub Commands Failing

1. Verify `GITHUB_TOKEN` has correct scopes (`repo`, `workflow`, `admin:org`)
2. Check `GITHUB_USERNAME` is correct
3. Ensure repository names in `REPOS_TO_MONITOR` are correct

### Memory Not Persisting

1. Check `02-whatsapp-bot/memory/clawd.db` exists
2. Verify write permissions on the directory
3. Check console for SQLite errors

### Webhook Signature Errors

1. Ensure `GITHUB_WEBHOOK_SECRET` matches your GitHub webhook settings
2. Check raw body parsing is enabled in Express

---

## Contributing

### Adding New Skills

1. Fork the repository
2. Create a new skill in `02-whatsapp-bot/skills/`
3. Follow the skill structure from existing skills
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines

- Use ESLint for code style
- Follow existing patterns for error handling
- Document all public methods
- Keep skills modular and focused

---

## Security Notes

1. **Never commit `.env.local`** - Contains sensitive API keys
2. **Rotate tokens regularly** - GitHub and Anthropic keys
3. **Use webhook secrets** - Verify GitHub webhook signatures
4. **Limit bot access** - Only `YOUR_WHATSAPP` can control the bot
5. **Audit repository permissions** - `GITHUB_TOKEN` has write access

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Claude AI](https://anthropic.com) - AI language model
- [Twilio](https://twilio.com) - WhatsApp messaging API
- [Octokit](https://github.com/octokit) - GitHub API client

---

**Built by Giquina | Powered by Claude AI + AWS**
