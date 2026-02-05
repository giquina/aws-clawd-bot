# SuperDesign Quick Reference

**AI-Powered Design System for ClawdBot**

SuperDesign automatically generates production-ready design systems, UI components, and documentation using AI analysis.

## Quick Start

```
# 1. Initialize SuperDesign for your repo
superdesign init

# 2. Generate components
design a login page with email and password
design a responsive navbar
help me design a dashboard layout
```

## Commands

| Command | Action | Voice Supported |
|---------|--------|-----------------|
| `superdesign init` | Initialize repo | ✅ Yes |
| `superdesign help` | Show help | ✅ Yes |
| `design <description>` | Generate components | ✅ Yes |
| `help me design <what>` | Design assistance | ✅ Yes |

## Examples

### Text Commands

```
superdesign init
design a login form with email and password fields
help me design a hero section for the homepage
design a sidebar navigation with icons
```

### Voice Commands

```
"Initialize SuperDesign for JUDO"
"Help me design a login page"
"Design a dashboard with charts and metrics"
"Design a responsive navigation menu"
```

## Auto-Repo Detection

SuperDesign automatically detects which repository to work with:

1. **Telegram Group Context**: If sent from a registered group (e.g., JUDO group → JUDO repo)
2. **Active Project**: From conversation context
3. **Auto Repo**: From previous commands

No need to specify repo name if using from a registered Telegram group!

## Workflow

### 1️⃣ First-Time Setup

```
User: superdesign init
Bot: ⏳ WORKING... initializing SuperDesign
     • Checking CLI installation
     • Verifying authentication
     • Analyzing repository
     • Generating configuration

     ⏱️ Estimated time: 2-5 minutes

Bot: ✅ COMPLETE
     SuperDesign initialized for JUDO
```

### 2️⃣ Generate Components

```
User: design a login page with email and password
Bot: ⏳ WORKING... designing for JUDO
     • Analyzing requirements
     • Generating components
     • Creating design tokens
     • Writing documentation

     ⏱️ Estimated time: 3-10 minutes

Bot: ✅ COMPLETE
     Design generated for "a login page"

     Next steps:
     • git status
     • git add .
     • git commit -m "feat: add login components"
```

## Supported Repositories

SuperDesign works with all ClawdBot-managed repositories:

- `judo`
- `lusotown`
- `armora`
- `gqcars-manager`
- `gq-cars-driver-app`
- `giquina-accountancy`
- `giquina-website`
- `gq-cars`
- `giquina-portal`
- `moltbook`
- `aws-clawd-bot`

## What Gets Generated

✨ **Design Tokens**
- Colors, typography, spacing
- Shadows, borders, animations
- Responsive breakpoints

🎨 **Components**
- React/Vue/Svelte components
- Props interface/types
- Accessibility features
- Responsive layouts

📚 **Documentation**
- Component usage examples
- Design guidelines
- Token reference
- Best practices

🧪 **Tests**
- Component tests
- Accessibility tests
- Visual regression tests

## Tips

### Writing Good Prompts

✅ **Good Prompts**:
- "Design a login page with email, password, and remember me checkbox"
- "Create a dashboard with sidebar navigation and card-based metrics"
- "Design a responsive hero section with image and CTA buttons"

❌ **Avoid**:
- "Make a page" (too vague)
- "Design something nice" (no specifics)
- "Create UI" (what kind?)

### Best Practices

1. **Be Specific**: Include what elements you need
2. **Mention Layout**: Describe arrangement (sidebar, grid, flex)
3. **State Responsiveness**: Mention mobile/desktop if important
4. **Include Interactions**: Buttons, forms, modals, etc.

## Troubleshooting

### Not Authenticated

```
✗ SuperDesign not authenticated
  Suggestion: Run: npx @superdesign/cli login
```

**Solution**: SSH to EC2 and run the login command:
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
npx @superdesign/cli login
```

### Unknown Repository

```
✗ Unknown repository: my-repo
  Suggestion: Available repos: judo, lusotown, armora, ...
```

**Solution**: Use one of the supported repos, or add your repo to `REPO_PATHS` in the skill file.

### No Repository Context

```
✗ No repository context
  Suggestion: Try running from a registered Telegram group
```

**Solution**: Either:
1. Send command from a registered Telegram group (e.g., JUDO group)
2. Set active project first using another command
3. Specify repo in command (if supported in future version)

### Generation Timeout

```
✗ Design generation failed
  Reason: Command timed out after 600s
```

**Solution**:
1. Simplify your design prompt
2. Check EC2 resources (CPU/memory)
3. Contact support if persistent

## Integration with Other Skills

### With GitHub

```
# Generate design
design a login page

# Commit and create PR
github pr create "Add login page design"
```

### With Remote Exec

```
# Generate design
design a dashboard

# Run tests
test judo

# Deploy
deploy judo to production
```

### With Claude Code

```
# Generate design components
design a settings page

# Implement logic with Claude Code
claude code session implement form validation for settings page
```

## Advanced Usage

### Custom Design Tokens

Generated design tokens can be customized after generation:

```
# After running superdesign init
cd /opt/projects/JUDO
edit .superdesign/tokens.json
```

### Component Variants

Request multiple variants in your prompt:

```
design a button component with primary, secondary, and danger variants
```

### Design System Themes

```
design a dark mode theme for the application
design light and dark variants of the navbar
```

## Configuration

Edit `02-bot/skills/skills.json`:

```json
{
  "superdesign": {
    "initTimeout": 180000,        // Init timeout (3 min)
    "generateTimeout": 600000,    // Generate timeout (10 min)
    "requiresConfirmation": false, // Ask before generation
    "cliVersion": "latest"        // CLI version to use
  }
}
```

## FAQ

**Q: Can I use SuperDesign offline?**
A: No, SuperDesign requires internet connection to the AI service.

**Q: What frameworks are supported?**
A: React, Vue, Svelte, and vanilla HTML/CSS.

**Q: Can I customize generated components?**
A: Yes! Generated code is 100% yours to modify.

**Q: Does it work with existing design systems?**
A: Yes, SuperDesign can extend or replace existing systems.

**Q: How much does generation cost?**
A: Currently free during beta. Check SuperDesign pricing for updates.

## Support

- **Logs**: `pm2 logs clawd-bot | grep SuperDesign`
- **Manual CLI**: SSH to EC2 and run commands directly
- **Skill File**: `/opt/clawd-bot/02-bot/skills/superdesign/index.js`
- **Help**: `superdesign help` or contact ClawdBot maintainer

## Related Documentation

- [SuperDesign CLI Docs](https://superdesign.ai/docs)
- [ClawdBot Skills Overview](../CLAUDE.md#skill-categories)
- [Remote Exec Skill](../../02-bot/skills/remote-exec/README.md)
- [GitHub Skill](../../02-bot/skills/github/README.md)

---

**Last Updated**: February 2026
**Skill Version**: 1.0.0
**ClawdBot Version**: 2.5
