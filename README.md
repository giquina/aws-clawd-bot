# ClawdBot v2.0 - AI Coding Assistant for WhatsApp

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude AI](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange)](https://anthropic.com)
[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366?logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)
[![AWS](https://img.shields.io/badge/Deployed%20on-AWS%20EC2-FF9900?logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)

**Your personal AI coding assistant running 24/7, controlled entirely from WhatsApp.**

ClawdBot v2.0 transforms WhatsApp into a powerful developer command center. Send commands via text message to manage GitHub repositories, **write and edit code with AI**, trigger GitHub Actions, review PRs, track tasks, get morning briefings, and leverage Claude AI for coding assistance - all while you're on the go.

> 🚀 **Now running 24/7 on AWS EC2** - Send a WhatsApp message anytime and ClawdBot will respond!

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Code Writing** | Edit files, create new files, fix issues - AI generates code and creates PRs |
| **GitHub Actions** | List workflows, view runs, trigger workflows remotely |
| **Code Review** | AI-powered PR review and file improvement suggestions |
| **Repository Stats** | Contributors, activity, language breakdown, comprehensive analytics |
| **File Operations** | Read actual file contents, search code across repos |
| **PR Management** | View PRs, see diffs, create branches, comment on issues |
| **Persistent Memory** | Remembers conversations and facts you share across sessions (SQLite) |
| **Skills System** | 12+ modular skills with extensible plugin architecture |
| **Scheduler** | Automated morning briefs, reminders, and recurring tasks (node-cron) |
| **Claude AI** | Natural language processing for coding questions and assistance |
| **Task Management** | Track tasks with priorities (urgent/high/medium/low) |
| **24/7 AWS Deployment** | Runs on EC2 with PM2 process management, always available |

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
| `read file <repo> <path>` | **Read actual file contents from GitHub** |
| `search <repo> <query>` | Search code in the repository |
| `list branches <repo>` | List all branches |
| `commits <repo>` | Show recent commits |
| `view pr <repo> #<n>` | View PR details, files changed, diff summary |
| `create branch <repo> <name>` | Create a new branch from main |
| `create issue <repo> <title>` | Create a new GitHub issue |
| `close issue <repo> #<number>` | Close an issue |
| `comment <repo> #<number> <message>` | Add comment to issue/PR |
| `create pr <repo> <title>` | Create a pull request |

### AI Code Writing (NEW in v2.0)

| Command | Description |
|---------|-------------|
| `fix issue <repo> #<n>` | Analyze issue and suggest a fix |
| `edit file <repo> <path> <instructions>` | Edit a file with AI assistance, creates PR |
| `create file <repo> <path> <description>` | Create new file based on description |
| `quick fix <repo> <path> <what to fix>` | Quick edit and create PR |

### GitHub Actions (NEW in v2.0)

| Command | Description |
|---------|-------------|
| `workflows <repo>` | List all workflows |
| `runs <repo>` | Show recent workflow runs |
| `run workflow <repo> <name>` | Trigger a workflow manually |
| `run status <repo> <id>` | Check workflow run status |

### Code Review (NEW in v2.0)

| Command | Description |
|---------|-------------|
| `review pr <repo> #<n>` | AI code review of a pull request |
| `review file <repo> <path>` | AI review of a specific file |
| `improve <repo> <path>` | Get improvement suggestions for a file |

### Repository Stats (NEW in v2.0)

| Command | Description |
|---------|-------------|
| `stats <repo>` | Comprehensive repo statistics |
| `contributors <repo>` | Top contributors list |
| `activity <repo>` | Recent activity summary |
| `languages <repo>` | Language breakdown with visual bars |

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
│       ├── github/            # GitHub skill (repos, branches, issues, PRs)
│       ├── memory/            # Memory skill (facts, conversation)
│       ├── morning-brief/     # Morning brief skill (daily summaries)
│       ├── tasks/             # Task management
│       ├── reminders/         # Reminder system
│       ├── coder/             # AI code writing (fix, edit, create)
│       ├── review/            # AI code review
│       ├── actions/           # GitHub Actions integration
│       ├── stats/             # Repository statistics
│       ├── research/          # Web research
│       ├── vercel/            # Vercel deployment
│       └── help/              # Help and command listing
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

### Built-in Skills (12 Skills)

| Skill | Priority | Description |
|-------|----------|-------------|
| `help` | 100 | Command documentation and skill listing |
| `memory` | 50 | Fact storage and conversation management |
| `morning-brief` | 40 | Daily briefings and scheduling |
| `tasks` | 35 | Task management with priorities |
| `reminders` | 30 | Time-based reminders |
| `coder` | 20 | **AI code writing - fix issues, edit files, create PRs** |
| `review` | 18 | **AI code review for PRs and files** |
| `actions` | 15 | **GitHub Actions - list/trigger workflows** |
| `stats` | 12 | **Repository statistics and analytics** |
| `github` | 10 | Repository management (branches, issues, PRs) |
| `research` | 8 | Web research capability |
| `vercel` | 5 | Vercel deployment integration |

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
