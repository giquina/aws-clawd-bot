# SuperDesign Skill

AI-powered design system generation and UI component creation for ClawdBot.

## Overview

The SuperDesign skill integrates `@superdesign/cli` to provide automated design system generation, UI component creation, and design token management. It uses AI to analyze repositories and generate production-ready components with comprehensive documentation.

## Features

- **Automatic Repo Detection**: Uses chat-registry to auto-detect the current repository context
- **CLI Auto-Installation**: Automatically installs `@superdesign/cli` if not present
- **Authentication Verification**: Checks login status before running commands
- **Progress Updates**: Real-time status messages via status-messenger
- **Voice Support**: Works with voice commands via Telegram voice notes

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `superdesign init` | Initialize SuperDesign for current repo | `superdesign init` |
| `superdesign help` | Show help and available commands | `superdesign help` |
| `help me design <what>` | Get design assistance | `help me design a login page` |
| `design <description>` | Generate UI components | `design a responsive navbar` |

## Voice Commands

You can also use natural voice commands:

- "Initialize SuperDesign for JUDO"
- "Help me design a login page"
- "Design a dashboard layout with charts"
- "Design a responsive navigation menu"

## Prerequisites

### EC2 Setup

1. Node.js and npm installed
2. Repository cloned under `/opt/projects/` or `/opt/clawd-bot`
3. SuperDesign CLI authentication (one-time setup)

### Authentication

First-time setup requires login to SuperDesign:

```bash
# On EC2 or local machine
npx @superdesign/cli login
```

Follow the prompts to authenticate with your SuperDesign account.

## Usage Workflow

### 1. Initialize Repository

```
User: superdesign init
Bot: ⏳ WORKING...
     I'm now initializing SuperDesign

     • Checking SuperDesign CLI installation
     • Verifying authentication
     • Analyzing repository structure
     • Generating design system configuration

     ⏱️ Estimated time: 2-5 minutes

     ✅ COMPLETE
     SuperDesign initialized for JUDO

     Next steps:
     You can now use design commands like:
     • design a login page
     • design a dashboard layout
     • superdesign help
```

### 2. Generate Components

```
User: design a login page with email and password
Bot: ⏳ WORKING...
     I'm now designing "a login page with email and password" for JUDO

     • Analyzing design requirements
     • Generating component structure
     • Creating design tokens
     • Writing documentation

     ⏱️ Estimated time: 3-10 minutes

     ✅ COMPLETE
     Design generated for "a login page with email and password" in JUDO

     Next steps:
     Review the generated components and commit to your repository:
     • git status
     • git add .
     • git commit -m "feat: add generated design components"
```

## Repository Mappings

The skill knows about these repositories (configured in `REPO_PATHS`):

- `aws-clawd-bot` → `/opt/clawd-bot`
- `judo` → `/opt/projects/JUDO`
- `lusotown` → `/opt/projects/LusoTown`
- `armora` → `/opt/projects/armora`
- `gqcars-manager` → `/opt/projects/gqcars-manager`
- `gq-cars-driver-app` → `/opt/projects/gq-cars-driver-app`
- `giquina-accountancy` → `/opt/projects/giquina-accountancy-direct-filing`
- `giquina-website` → `/opt/projects/giquina-website`
- `gq-cars` → `/opt/projects/gq-cars`
- `giquina-portal` → `/opt/projects/giquina-portal`
- `moltbook` → `/opt/projects/moltbook`

## Auto-Repo Detection

The skill automatically detects which repository to work with using:

1. **Chat Registry** (primary): If the command is sent from a registered Telegram group linked to a repo
2. **Context autoRepo** (secondary): From the conversation context
3. **Context activeProject** (fallback): From active project tracking

Example:
```
# In JUDO Telegram group
User: superdesign init
Bot: [Automatically uses JUDO repo based on chat registration]
```

## Error Handling

### Not Authenticated
```
✗ SuperDesign not authenticated
  Reason: You need to login to SuperDesign first
  Suggestion: Run: npx @superdesign/cli login
```

### Unknown Repository
```
✗ Unknown repository: my-repo
  Reason: Repository 'my-repo' is not configured
  Suggestion: Available repos: judo, lusotown, armora, ...
```

### No Repository Context
```
✗ No repository context
  Reason: Could not determine which repository to initialize
  Suggestion: Try running this command from a registered Telegram group
```

## Configuration

Edit `02-bot/skills/skills.json` to customize:

```json
{
  "superdesign": {
    "initTimeout": 180000,        // 3 minutes
    "generateTimeout": 600000,    // 10 minutes
    "requiresConfirmation": false,
    "cliVersion": "latest"
  }
}
```

## Technical Details

### Implementation

- **Base Class**: Extends `BaseSkill` from `../base-skill`
- **Priority**: 25 (higher than generic commands, lower than critical skills)
- **Platform Detection**: Only executes on EC2 (Linux), simulates on Windows dev
- **Command Execution**: Uses `child_process.exec` with timeout protection
- **Message Formatting**: Uses `status-messenger` for consistent progress updates

### Integration Points

| Module | Purpose |
|--------|---------|
| `chat-registry` | Auto-detect repo from Telegram group context |
| `status-messenger` | Format progress/completion messages |
| `BaseSkill` | Inherit standard skill patterns (success/error/warning) |

### CLI Commands Used

| CLI Command | Purpose | Timeout |
|-------------|---------|---------|
| `npx @superdesign/cli --version` | Check installation | 10s |
| `npx @superdesign/cli whoami` | Verify authentication | 10s |
| `npx @superdesign/cli init` | Initialize repository | 3 min |
| `npx @superdesign/cli generate --prompt "<desc>"` | Generate components | 10 min |

## Development Mode

On non-EC2 systems (Windows development), the skill simulates command execution:

```javascript
if (!this.isEC2) {
  this.log('warn', `[DEV MODE] Would execute: ${command} in ${cwd}`);
  return {
    success: true,
    output: `[DEV MODE] Simulated execution of: ${command}`,
    simulated: true
  };
}
```

This allows testing the skill logic without requiring EC2 infrastructure.

## Troubleshooting

### CLI Not Installing

If `npm install -g @superdesign/cli` fails:

1. Check npm permissions on EC2
2. Verify network connectivity
3. Try manual installation: `ssh` to EC2 and run command directly

### Authentication Failing

If `npx @superdesign/cli whoami` fails:

1. Run login manually on EC2: `npx @superdesign/cli login`
2. Check credentials are saved in `~/.superdesign/`
3. Verify API endpoint is reachable

### Generate Timeout

If generation takes longer than 10 minutes:

1. Simplify the design prompt
2. Check EC2 resources (CPU/memory)
3. Increase `generateTimeout` in config

## Future Enhancements

Potential improvements for future versions:

- [ ] Add confirmation step for generate command (optional)
- [ ] Support for design tokens extraction only
- [ ] Component preview generation
- [ ] Integration with GitHub PR creation (auto-commit generated components)
- [ ] Design system version management
- [ ] Multi-repo batch operations
- [ ] Custom prompt templates
- [ ] Design linting and validation

## Related Skills

- **coder**: Generate code based on requirements
- **github**: Create PRs and manage repositories
- **remote-exec**: Execute arbitrary commands on EC2
- **claude-code-session**: Run autonomous coding sessions

## Support

For issues or questions:

1. Check skill logs: `pm2 logs clawd-bot | grep SuperDesign`
2. Test CLI directly on EC2: `ssh` and run commands manually
3. Verify repository paths in `REPO_PATHS` constant
4. Check SuperDesign API status

## License

Part of ClawdBot v2.5 - AWS EC2 Telegram/WhatsApp bot system.
