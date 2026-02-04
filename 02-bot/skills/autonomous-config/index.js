/**
 * Autonomous Config Skill
 *
 * WhatsApp commands for managing autonomous operation settings.
 *
 * Commands:
 *   autonomous on/off  - Toggle autonomous mode
 *   safe mode on/off   - Toggle safe mode
 *   config show        - Display current settings
 *   config set <path> <value> - Update a setting
 *   config reset       - Reset to defaults
 */

const BaseSkill = require('../base-skill');
const autonomousConfig = require('../../autonomous/config');

class AutonomousConfigSkill extends BaseSkill {
  name = 'autonomous-config';
  description = 'Manage autonomous operation settings';
  priority = 25;  // Higher priority to catch config commands

  commands = [
    {
      pattern: /^autonomous\s+(on|off)$/i,
      description: 'Toggle autonomous mode on or off',
      usage: 'autonomous on/off'
    },
    {
      pattern: /^safe\s?mode\s+(on|off)$/i,
      description: 'Toggle safe mode (limits changes to docs/tests)',
      usage: 'safe mode on/off'
    },
    {
      pattern: /^config(\s+show)?$/i,
      description: 'Display current autonomous configuration',
      usage: 'config show'
    },
    {
      pattern: /^config\s+set\s+.+$/i,
      description: 'Update a config setting',
      usage: 'config set <path> <value>'
    },
    {
      pattern: /^config\s+reset$/i,
      description: 'Reset configuration to defaults',
      usage: 'config reset'
    },
    {
      pattern: /^nightly\s+(on|off)$/i,
      description: 'Toggle nightly autonomous runs',
      usage: 'nightly on/off'
    },
    {
      pattern: /^nightly\s+time\s+(\d{1,2}:\d{2})$/i,
      description: 'Set nightly run time',
      usage: 'nightly time HH:MM'
    }
  ];

  async execute(command, context) {
    const cmd = command.toLowerCase().trim();

    // Handle nightly shortcuts
    const nightlyMatch = cmd.match(/^nightly\s+(on|off)$/i);
    if (nightlyMatch) {
      const enabled = nightlyMatch[1].toLowerCase() === 'on';
      autonomousConfig.setConfig('autonomous.nightlyRun.enabled', enabled);
      autonomousConfig.saveConfig();
      return this.success(
        enabled
          ? `Nightly runs enabled at ${autonomousConfig.getConfig('autonomous.nightlyRun.time')}`
          : 'Nightly runs disabled'
      );
    }

    const nightlyTimeMatch = cmd.match(/^nightly\s+time\s+(\d{1,2}:\d{2})$/i);
    if (nightlyTimeMatch) {
      const time = nightlyTimeMatch[1];
      // Validate time format
      const [hours, minutes] = time.split(':').map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return this.error('Invalid time format. Use HH:MM (24-hour).');
      }
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      autonomousConfig.setConfig('autonomous.nightlyRun.time', formattedTime);
      autonomousConfig.saveConfig();
      return this.success(`Nightly run time set to ${formattedTime}`);
    }

    // Delegate to config handler for other commands
    const result = autonomousConfig.handleCommand(command);

    if (result.handled) {
      return this.success(result.message);
    }

    // Shouldn't reach here if patterns match correctly
    return this.error('Unknown config command. Type "config show" for help.');
  }

  /**
   * Get current config status for inclusion in other commands
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      autonomous: autonomousConfig.isAutonomousEnabled(),
      safeMode: autonomousConfig.isSafeModeEnabled(),
      nightlyRun: autonomousConfig.getConfig('autonomous.nightlyRun.enabled'),
      nightlyTime: autonomousConfig.getConfig('autonomous.nightlyRun.time')
    };
  }
}

module.exports = AutonomousConfigSkill;
