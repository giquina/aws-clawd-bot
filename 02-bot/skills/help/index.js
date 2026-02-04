/**
 * HelpSkill - Lists all available commands grouped by skill
 *
 * Provides help and documentation for all registered skills.
 *
 * Commands:
 *   help              - Show all available commands
 *   help <skill>      - Show commands for a specific skill
 *   commands          - Alias for help
 */
const BaseSkill = require('../base-skill');
const registry = require('../skill-registry');

class HelpSkill extends BaseSkill {
  name = 'help';
  description = 'Shows available commands and skill documentation';
  priority = 100; // High priority so "help" is always recognized

  commands = [
    {
      pattern: /^help$/i,
      description: 'Show all available commands',
      usage: 'help'
    },
    {
      pattern: /^help\s+(.+)$/i,
      description: 'Show help for a specific skill',
      usage: 'help <skill-name>'
    },
    {
      pattern: /^commands$/i,
      description: 'List all commands (alias for help)',
      usage: 'commands'
    },
    {
      pattern: /^skills$/i,
      description: 'List all loaded skills',
      usage: 'skills'
    }
  ];

  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "skills" command
    if (lowerCommand === 'skills') {
      return this.listSkillsCommand();
    }

    // Handle "help <skill>" command
    if (lowerCommand.startsWith('help ')) {
      const skillName = parsed.args[0];
      return this.showSkillHelp(skillName);
    }

    // Default: show all commands
    return this.showAllCommands();
  }

  /**
   * Show all available commands - condensed for WhatsApp (max 1600 chars)
   */
  showAllCommands() {
    const skills = registry.listSkills();

    if (skills.length === 0) {
      return this.success('No skills are currently loaded.');
    }

    // Condensed help - grouped by category
    let message = '*ClawdBot* - Your AI Assistant\n\n';

    message += '*GitHub & Code*\n';
    message += '• list repos, search <repo> <query>\n';
    message += '• create branch, create pr, fix issue\n';
    message += '• review pr, workflows, stats\n\n';

    message += '*Accountancy*\n';
    message += '• deadlines, companies, company <code>\n';
    message += '• can I <action>?, loans, ic balance\n\n';

    message += '*Productivity*\n';
    message += '• Send receipt photo → auto-extract\n';
    message += '• digest, tasks, reminders\n';
    message += '• remember <fact>, tonight <task>\n\n';

    message += '*Media*\n';
    message += '• Send image → AI describes it\n';
    message += '• Send PDF → text extracted\n';
    message += '• Send voice → transcribed\n\n';

    message += '*Social*\n';
    message += '• moltbook feed, post to moltbook\n\n';

    message += '*System*\n';
    message += '• help, status, skills\n\n';

    message += `_${skills.length} skills loaded_\n`;
    message += '_Type "help <skill>" for details_';

    return this.success(message);
  }

  /**
   * List all loaded skills
   */
  listSkillsCommand() {
    const skills = registry.listSkills();

    if (skills.length === 0) {
      return this.success('No skills are currently loaded.');
    }

    let message = '*Loaded Skills*\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';

    for (const skill of skills) {
      message += `*${this.capitalize(skill.name)}*`;
      if (skill.description) {
        message += `\n  ${skill.description}`;
      }
      message += `\n  Commands: ${skill.commands.length}`;
      message += `\n  Priority: ${skill.priority}`;
      if (skill.requiresAuth) {
        message += ' (auth required)';
      }
      message += '\n\n';
    }

    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += `Type \`help <skill>\` for details`;

    return this.success(message);
  }

  /**
   * Show help for a specific skill
   */
  showSkillHelp(skillName) {
    const skill = registry.getSkill(skillName.toLowerCase());

    if (!skill) {
      // Try to find a partial match
      const skills = registry.getSkillNames();
      const matches = skills.filter(s =>
        s.toLowerCase().includes(skillName.toLowerCase())
      );

      if (matches.length === 1) {
        return this.showSkillHelp(matches[0]);
      }

      if (matches.length > 1) {
        return this.error(
          `Multiple skills match "${skillName}": ${matches.join(', ')}\n` +
          'Please be more specific.'
        );
      }

      return this.error(
        `Skill "${skillName}" not found.\n` +
        `Available skills: ${skills.join(', ') || 'none'}`
      );
    }

    const metadata = skill.getMetadata();

    let message = `*${this.capitalize(metadata.name)} Skill*\n`;
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';

    if (metadata.description) {
      message += `${metadata.description}\n\n`;
    }

    if (metadata.commands.length > 0) {
      message += '*Commands:*\n';
      for (const cmd of metadata.commands) {
        const usage = cmd.usage || this.patternToUsage(cmd.pattern);
        message += `\n• \`${usage}\`\n`;
        if (cmd.description) {
          message += `  ${cmd.description}\n`;
        }
      }
    } else {
      message += '_This skill has no commands._\n';
    }

    message += '\n━━━━━━━━━━━━━━━━━━━━\n';

    if (metadata.requiresAuth) {
      message += '_This skill requires authentication_';
    }

    return this.success(message);
  }

  /**
   * Convert a regex pattern to a human-readable usage string
   */
  patternToUsage(pattern) {
    if (!pattern) return '(unknown)';

    let str = pattern.toString();

    // Remove regex delimiters and flags
    str = str.replace(/^\//, '').replace(/\/[gim]*$/, '');

    // Remove anchors
    str = str.replace(/^\^/, '').replace(/\$$/, '');

    // Convert common regex patterns to readable format
    str = str
      .replace(/\(\.\+\)/g, '<text>')
      .replace(/\(\.\*\)/g, '[text]')
      .replace(/\\s\+/g, ' ')
      .replace(/\\s\*/g, ' ')
      .replace(/\[\^\\s\]\+/g, '<word>')
      .replace(/\\w\+/g, '<word>')
      .replace(/\\d\+/g, '<number>')
      .replace(/\(\?:([^)]+)\)/g, '($1)')  // Non-capturing groups
      .replace(/\|/g, ' | ')               // Alternatives
      .replace(/\\/g, '');                 // Remove remaining escapes

    return str.trim() || pattern.toString();
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = HelpSkill;
