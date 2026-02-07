/**
 * Feature Flags Skill - Remote feature toggle management
 *
 * Manages feature flags across all managed repos. Toggle features remotely
 * without deploying. Supports gradual rollout percentages and environment targeting.
 *
 * Commands:
 *   flag set <repo> <flag> <enabled|disabled>   - Set a feature flag
 *   feature flag <repo> <flag> on/off            - Set a feature flag (alias)
 *   flag list <repo>                             - List all flags for a repo
 *   feature flags <repo>                         - List all flags (alias)
 *   flag get <repo> <flag>                       - Get current value of a flag
 *   flag delete <repo> <flag>                    - Remove a feature flag
 *   flags all                                    - Show flags across all repos
 *   all feature flags                            - Show all flags (alias)
 *   flag history <repo>                          - Show flag change history
 *
 * @example
 * flag set JUDO dark-mode enabled
 * feature flag JUDO dark-mode on 50%
 * flag list JUDO
 * flag get JUDO dark-mode
 * flag delete JUDO dark-mode
 * flags all
 * flag history JUDO
 */

const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs');

const FLAGS_PATH = path.join(__dirname, '../../data/feature-flags.json');
const MAX_HISTORY = 50;

class FeatureFlagsSkill extends BaseSkill {
  name = 'feature-flags';
  description = 'Manage feature flags across repos — toggle features remotely without deploying';
  priority = 17;

  commands = [
    {
      pattern: /^flag\s+set\s+(\S+)\s+(\S+)\s+(enabled|disabled|on|off)(\s+\d+%)?$/i,
      description: 'Set a feature flag for a repo',
      usage: 'flag set <repo> <flag> <enabled|disabled|on|off> [percentage%]'
    },
    {
      pattern: /^feature\s+flag\s+(\S+)\s+(\S+)\s+(on|off|enabled|disabled)(\s+\d+%)?$/i,
      description: 'Set a feature flag (alias)',
      usage: 'feature flag <repo> <flag> on/off [percentage%]'
    },
    {
      pattern: /^flag\s+list\s+(\S+)$/i,
      description: 'List all flags for a repo',
      usage: 'flag list <repo>'
    },
    {
      pattern: /^feature\s+flags\s+(\S+)$/i,
      description: 'List all flags for a repo (alias)',
      usage: 'feature flags <repo>'
    },
    {
      pattern: /^flag\s+get\s+(\S+)\s+(\S+)$/i,
      description: 'Get current value of a flag',
      usage: 'flag get <repo> <flag>'
    },
    {
      pattern: /^flag\s+delete\s+(\S+)\s+(\S+)$/i,
      description: 'Remove a feature flag',
      usage: 'flag delete <repo> <flag>'
    },
    {
      pattern: /^flags\s+all$/i,
      description: 'Show flags across all repos',
      usage: 'flags all'
    },
    {
      pattern: /^all\s+feature\s+flags$/i,
      description: 'Show all flags (alias)',
      usage: 'all feature flags'
    },
    {
      pattern: /^flag\s+history\s+(\S+)$/i,
      description: 'Show flag change history for a repo',
      usage: 'flag history <repo>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.changeHistory = [];
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Feature flags skill initialized');
  }

  /**
   * Execute feature flag commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const raw = parsed.raw;

    // flag set <repo> <flag> <value> [percent]
    let match = raw.match(/^flag\s+set\s+(\S+)\s+(\S+)\s+(enabled|disabled|on|off)(\s+(\d+)%)?$/i);
    if (match) {
      return this._handleSet(match[1], match[2], match[3], match[5], context);
    }

    // feature flag <repo> <flag> <value> [percent]
    match = raw.match(/^feature\s+flag\s+(\S+)\s+(\S+)\s+(on|off|enabled|disabled)(\s+(\d+)%)?$/i);
    if (match) {
      return this._handleSet(match[1], match[2], match[3], match[5], context);
    }

    // flag list <repo>
    match = raw.match(/^flag\s+list\s+(\S+)$/i);
    if (match) {
      return this._handleList(match[1]);
    }

    // feature flags <repo>
    match = raw.match(/^feature\s+flags\s+(\S+)$/i);
    if (match) {
      return this._handleList(match[1]);
    }

    // flag get <repo> <flag>
    match = raw.match(/^flag\s+get\s+(\S+)\s+(\S+)$/i);
    if (match) {
      return this._handleGet(match[1], match[2]);
    }

    // flag delete <repo> <flag>
    match = raw.match(/^flag\s+delete\s+(\S+)\s+(\S+)$/i);
    if (match) {
      return this._handleDelete(match[1], match[2]);
    }

    // flags all / all feature flags
    if (/^flags\s+all$/i.test(raw) || /^all\s+feature\s+flags$/i.test(raw)) {
      return this._handleAll();
    }

    // flag history <repo>
    match = raw.match(/^flag\s+history\s+(\S+)$/i);
    if (match) {
      return this._handleHistory(match[1]);
    }

    return this.error('Unknown feature flags command', null, {
      suggestion: 'Try: flag set, flag list, flag get, flag delete, flags all, flag history'
    });
  }

  // ==================== Command Handlers ====================

  /**
   * Handle flag set / feature flag commands
   */
  _handleSet(repo, flag, value, percentStr, context) {
    const repoKey = repo.toUpperCase();
    const flagKey = flag.toLowerCase();
    const enabled = /^(enabled|on)$/i.test(value);
    const percentage = percentStr ? parseInt(percentStr, 10) : (enabled ? 100 : 0);
    const now = new Date().toISOString();
    const userId = context.chatId || context.fromNumber || 'unknown';

    const flags = this._loadFlags();
    if (!flags[repoKey]) {
      flags[repoKey] = {};
    }

    const existing = flags[repoKey][flagKey];
    const isUpdate = !!existing;

    // Record change in history
    this._addHistory({
      repo: repoKey,
      flag: flagKey,
      oldValue: existing ? existing.enabled : null,
      newValue: enabled,
      oldPercentage: existing ? existing.percentage : null,
      newPercentage: percentage,
      timestamp: now,
      changedBy: String(userId),
      action: isUpdate ? 'updated' : 'created'
    });

    flags[repoKey][flagKey] = {
      enabled,
      description: existing ? existing.description : '',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      updatedBy: String(userId),
      percentage,
      environment: existing ? existing.environment : 'all'
    };

    this._saveFlags(flags);

    const status = enabled ? 'Enabled' : 'Disabled';
    let msg = `Feature flag ${isUpdate ? 'updated' : 'created'}\n\n`;
    msg += `Repo: ${repoKey}\n`;
    msg += `Flag: ${flagKey}\n`;
    msg += `Status: ${status}\n`;
    msg += `Rollout: ${percentage}%\n`;
    if (existing) {
      const prev = existing.enabled ? 'Enabled' : 'Disabled';
      msg += `Previous: ${prev} (${existing.percentage}%)\n`;
    }
    msg += `\nNote: This only updates the flag store. Your app needs\nto read from the flags API to pick up the change.`;

    this.log('info', `Flag ${flagKey} ${isUpdate ? 'updated' : 'created'} for ${repoKey}`);
    return this.success(msg);
  }

  /**
   * Handle flag list / feature flags commands
   */
  _handleList(repo) {
    const repoKey = repo.toUpperCase();
    const flags = this._loadFlags();
    const repoFlags = flags[repoKey];

    if (!repoFlags || Object.keys(repoFlags).length === 0) {
      return this.success(
        `No feature flags configured for ${repoKey}.\n\nUse "flag set ${repoKey} <flag> on" to create one.`
      );
    }

    const entries = Object.entries(repoFlags);
    let msg = `Feature Flags: ${repoKey}\n`;

    for (const [name, flag] of entries) {
      const status = flag.enabled ? 'ON ' : 'OFF';
      const pct = String(flag.percentage).padStart(3) + '%';
      const env = flag.environment || 'all';
      msg += `\n  ${name.padEnd(20)} ${status}  ${pct}  ${env}`;
    }

    msg += `\n\n${entries.length} flag${entries.length !== 1 ? 's' : ''} configured`;

    return this.success(msg);
  }

  /**
   * Handle flag get command
   */
  _handleGet(repo, flag) {
    const repoKey = repo.toUpperCase();
    const flagKey = flag.toLowerCase();
    const flags = this._loadFlags();

    if (!flags[repoKey] || !flags[repoKey][flagKey]) {
      return this.error(`Flag "${flagKey}" not found in ${repoKey}`, null, {
        suggestion: `Use "flag list ${repoKey}" to see available flags`
      });
    }

    const f = flags[repoKey][flagKey];
    const status = f.enabled ? 'Enabled' : 'Disabled';
    const updated = new Date(f.updatedAt).toLocaleString();
    const created = new Date(f.createdAt).toLocaleString();

    let msg = `Feature Flag: ${flagKey}\n\n`;
    msg += `Repo: ${repoKey}\n`;
    msg += `Status: ${status}\n`;
    msg += `Rollout: ${f.percentage}%\n`;
    msg += `Environment: ${f.environment || 'all'}\n`;
    if (f.description) {
      msg += `Description: ${f.description}\n`;
    }
    msg += `Created: ${created}\n`;
    msg += `Updated: ${updated}\n`;
    msg += `Updated by: ${f.updatedBy || 'unknown'}`;

    return this.success(msg);
  }

  /**
   * Handle flag delete command
   */
  _handleDelete(repo, flag) {
    const repoKey = repo.toUpperCase();
    const flagKey = flag.toLowerCase();
    const flags = this._loadFlags();

    if (!flags[repoKey] || !flags[repoKey][flagKey]) {
      return this.error(`Flag "${flagKey}" not found in ${repoKey}`, null, {
        suggestion: `Use "flag list ${repoKey}" to see available flags`
      });
    }

    const existing = flags[repoKey][flagKey];

    // Record deletion in history
    this._addHistory({
      repo: repoKey,
      flag: flagKey,
      oldValue: existing.enabled,
      newValue: null,
      timestamp: new Date().toISOString(),
      changedBy: 'user',
      action: 'deleted'
    });

    delete flags[repoKey][flagKey];

    // Clean up empty repo entries
    if (Object.keys(flags[repoKey]).length === 0) {
      delete flags[repoKey];
    }

    this._saveFlags(flags);

    this.log('info', `Flag ${flagKey} deleted from ${repoKey}`);
    return this.success(`Feature flag "${flagKey}" deleted from ${repoKey}`);
  }

  /**
   * Handle flags all / all feature flags commands
   */
  _handleAll() {
    const flags = this._loadFlags();
    const repos = Object.keys(flags);

    if (repos.length === 0) {
      return this.success(
        'No feature flags configured for any repo.\n\nUse "flag set <repo> <flag> on" to create one.'
      );
    }

    let msg = 'Feature Flags: All Repos\n';
    let totalFlags = 0;

    // Identify recently changed flags (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const repo of repos.sort()) {
      const repoFlags = flags[repo];
      const entries = Object.entries(repoFlags);
      if (entries.length === 0) continue;

      msg += `\n${repo}\n`;

      for (const [name, flag] of entries) {
        const status = flag.enabled ? 'ON ' : 'OFF';
        const pct = String(flag.percentage).padStart(3) + '%';
        const env = flag.environment || 'all';
        const recent = flag.updatedAt > oneDayAgo ? ' *' : '';
        msg += `  ${name.padEnd(20)} ${status}  ${pct}  ${env}${recent}\n`;
        totalFlags++;
      }
    }

    msg += `\n${totalFlags} flag${totalFlags !== 1 ? 's' : ''} across ${repos.length} repo${repos.length !== 1 ? 's' : ''}`;
    msg += '\n* = changed in last 24h';

    return this.success(msg);
  }

  /**
   * Handle flag history command
   */
  _handleHistory(repo) {
    const repoKey = repo.toUpperCase();
    const repoHistory = this.changeHistory
      .filter(h => h.repo === repoKey)
      .slice(-10)
      .reverse();

    if (repoHistory.length === 0) {
      return this.success(
        `No flag change history for ${repoKey}.\n\nHistory is recorded when flags are set or deleted.`
      );
    }

    let msg = `Flag History: ${repoKey} (last ${repoHistory.length} changes)\n`;

    for (const entry of repoHistory) {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      if (entry.action === 'created') {
        const val = entry.newValue ? 'ON' : 'OFF';
        msg += `\n  ${dateStr} ${timeStr}  ${entry.flag.padEnd(18)} Created (${val})`;
      } else if (entry.action === 'deleted') {
        msg += `\n  ${dateStr} ${timeStr}  ${entry.flag.padEnd(18)} Deleted`;
      } else {
        const oldVal = entry.oldValue ? 'ON ' : 'OFF';
        const newVal = entry.newValue ? 'ON ' : 'OFF';
        msg += `\n  ${dateStr} ${timeStr}  ${entry.flag.padEnd(18)} ${oldVal} -> ${newVal}`;
        if (entry.oldPercentage !== entry.newPercentage) {
          msg += ` (${entry.oldPercentage}% -> ${entry.newPercentage}%)`;
        }
      }
    }

    return this.success(msg);
  }

  // ==================== Persistence ====================

  /**
   * Load flags from JSON file
   * @private
   */
  _loadFlags() {
    try {
      if (fs.existsSync(FLAGS_PATH)) {
        return JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8'));
      }
    } catch (e) {
      this.log('error', 'Error loading flags:', e.message);
    }
    return {};
  }

  /**
   * Save flags to JSON file
   * @private
   */
  _saveFlags(flags) {
    try {
      const dir = path.dirname(FLAGS_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(FLAGS_PATH, JSON.stringify(flags, null, 2));
    } catch (e) {
      this.log('error', 'Error saving flags:', e.message);
    }
  }

  /**
   * Add entry to change history, trimming to MAX_HISTORY
   * @private
   */
  _addHistory(entry) {
    this.changeHistory.push(entry);
    if (this.changeHistory.length > MAX_HISTORY) {
      this.changeHistory = this.changeHistory.slice(-MAX_HISTORY);
    }
  }

  // ==================== Lifecycle ====================

  /**
   * Shutdown the skill - clear history
   */
  async shutdown() {
    this.changeHistory = [];
    this.log('info', 'Feature flags skill shut down');
    await super.shutdown();
  }

  /**
   * Get skill metadata including flag statistics
   */
  getMetadata() {
    const meta = super.getMetadata();
    const flags = this._loadFlags();
    const totalFlags = Object.values(flags).reduce(
      (sum, repoFlags) => sum + Object.keys(repoFlags).length, 0
    );
    return {
      ...meta,
      dataType: 'feature-flags',
      totalFlags,
      totalRepos: Object.keys(flags).length,
      historyLength: this.changeHistory.length
    };
  }
}

module.exports = FeatureFlagsSkill;
