/**
 * Incident Response Skill - Automated incident management for ClawdBot
 *
 * Manages the full incident lifecycle from detection through resolution.
 * Collects diagnostics, escalates alerts, tracks timeline, and generates postmortems.
 *
 * Lifecycle:
 *   Created -> Investigating -> Identified -> Monitoring -> Resolved
 *
 * Commands:
 *   incident create <desc>      - Create a new incident
 *   incident report <desc>      - Alias for create
 *   incident status             - Show active incidents
 *   incident active             - Alias for status
 *   incident resolve <id>       - Resolve an incident
 *   close incident <id>         - Alias for resolve
 *   incident history            - Show recent resolved incidents
 *   incident postmortem <id>    - Generate postmortem report
 *   incident escalate <id>      - Manually escalate an incident
 *
 * @example
 * incident create API returning 500 errors
 * incident status
 * incident resolve INC-003 fixed the database connection pool
 * incident postmortem INC-003
 * incident escalate INC-005
 */
const BaseSkill = require('../base-skill');

const MAX_INCIDENTS = 50;

const SEVERITY_ICONS = {
  critical: '\uD83D\uDD34',  // red circle
  high: '\uD83D\uDFE0',      // orange circle
  medium: '\uD83D\uDFE1',    // yellow circle
  low: '\uD83D\uDFE2'        // green circle
};

const STATUS_ICONS = {
  investigating: '\uD83D\uDD0D',  // magnifying glass
  identified: '\uD83C\uDFAF',     // bullseye
  monitoring: '\uD83D\uDCE1',     // satellite antenna
  resolved: '\u2705'              // check mark
};

const LIFECYCLE_ORDER = ['investigating', 'identified', 'monitoring', 'resolved'];

/**
 * Detect severity from incident description keywords.
 * @param {string} description
 * @returns {'critical'|'high'|'medium'|'low'}
 */
function detectSeverity(description) {
  const lower = description.toLowerCase();
  if (/\b(down|outage|crash|500|unresponsive|data.?loss)\b/.test(lower)) return 'critical';
  if (/\b(error|fail|broken|bug|not.?working)\b/.test(lower)) return 'high';
  if (/\b(slow|timeout|delay|degraded|intermittent)\b/.test(lower)) return 'medium';
  return 'low';
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format an ISO timestamp for display.
 * @param {string} iso
 * @returns {string}
 */
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
}

class IncidentResponseSkill extends BaseSkill {
  name = 'incident-response';
  description = 'Manage incident lifecycle: create, track, escalate, resolve, and generate postmortems';
  priority = 92;

  commands = [
    {
      pattern: /^incident\s+(create|report)\s+(.+)$/i,
      description: 'Create a new incident from a description',
      usage: 'incident create <description>'
    },
    {
      pattern: /^incident\s+(status|active)$/i,
      description: 'Show all active (unresolved) incidents',
      usage: 'incident status'
    },
    {
      pattern: /^(?:incident\s+resolve|close\s+incident)\s+(INC-\d+)(?:\s+(.+))?$/i,
      description: 'Resolve an incident with optional resolution note',
      usage: 'incident resolve INC-001 <resolution note>'
    },
    {
      pattern: /^incident\s+history$/i,
      description: 'Show recently resolved incidents',
      usage: 'incident history'
    },
    {
      pattern: /^incident\s+postmortem\s+(INC-\d+)$/i,
      description: 'Generate a structured postmortem report',
      usage: 'incident postmortem INC-001'
    },
    {
      pattern: /^incident\s+escalate\s+(INC-\d+)$/i,
      description: 'Manually escalate an incident to the next alert tier',
      usage: 'incident escalate INC-001'
    }
  ];

  constructor(context = {}) {
    super(context);

    /** @type {Map<string, Object>} Active and recent incidents keyed by ID */
    this.incidents = new Map();

    /** Auto-incrementing counter for incident IDs */
    this._counter = 0;
  }

  async initialize() {
    await super.initialize();
    this.log('info', 'Incident Response skill initialized');
  }

  // ========================= Command Router =========================

  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const raw = parsed.raw;

    // --- incident create / report ---
    const createMatch = raw.match(/^incident\s+(?:create|report)\s+(.+)$/i);
    if (createMatch) {
      return this._handleCreate(createMatch[1].trim(), context);
    }

    // --- incident status / active ---
    if (/^incident\s+(?:status|active)$/i.test(raw)) {
      return this._handleStatus();
    }

    // --- incident resolve / close incident ---
    const resolveMatch = raw.match(/^(?:incident\s+resolve|close\s+incident)\s+(INC-\d+)(?:\s+(.+))?$/i);
    if (resolveMatch) {
      return this._handleResolve(resolveMatch[1].toUpperCase(), (resolveMatch[2] || '').trim(), context);
    }

    // --- incident history ---
    if (/^incident\s+history$/i.test(raw)) {
      return this._handleHistory();
    }

    // --- incident postmortem ---
    const postmortemMatch = raw.match(/^incident\s+postmortem\s+(INC-\d+)$/i);
    if (postmortemMatch) {
      return this._handlePostmortem(postmortemMatch[1].toUpperCase());
    }

    // --- incident escalate ---
    const escalateMatch = raw.match(/^incident\s+escalate\s+(INC-\d+)$/i);
    if (escalateMatch) {
      return this._handleEscalate(escalateMatch[1].toUpperCase(), context);
    }

    return this.error('Unknown incident command', null, {
      suggestion: 'Try: incident create <description>, incident status, incident resolve INC-001'
    });
  }

  // ========================= Handlers =========================

  /**
   * Create a new incident, collect diagnostics, and optionally auto-escalate.
   */
  _handleCreate(description, context) {
    this._counter++;
    const id = `INC-${String(this._counter).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const severity = detectSeverity(description);

    const incident = {
      id,
      description,
      severity,
      status: 'investigating',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      timeline: [
        { time: now, event: 'Incident created', actor: 'user' }
      ],
      diagnostics: {},
      affectedRepos: context.autoRepo ? [context.autoRepo] : [],
      resolution: null
    };

    // --- Collect diagnostics ---
    const diagnostics = this._collectDiagnostics();
    incident.diagnostics = diagnostics;
    if (Object.keys(diagnostics).length > 0) {
      incident.timeline.push({ time: new Date().toISOString(), event: 'Diagnostics collected', actor: 'system' });
    }

    // Store (ring buffer eviction if needed)
    this.incidents.set(id, incident);
    this._enforceMaxIncidents();

    // --- Auto-escalate critical incidents ---
    let escalationNote = '';
    if (severity === 'critical') {
      escalationNote = this._triggerEscalation(incident, context);
      incident.timeline.push({ time: new Date().toISOString(), event: 'Auto-escalated (critical severity)', actor: 'system' });
    }

    // --- Build response ---
    const sev = SEVERITY_ICONS[severity];
    let msg = `*Incident Created*\n\n`;
    msg += `${sev} *${id}* — ${severity.toUpperCase()}\n`;
    msg += `${STATUS_ICONS.investigating} Status: Investigating\n`;
    msg += `\uD83D\uDCC4 ${description}\n\n`;

    if (incident.affectedRepos.length > 0) {
      msg += `\uD83D\uDCC1 Affected: ${incident.affectedRepos.join(', ')}\n`;
    }

    // Diagnostics summary
    if (diagnostics.recentErrors && diagnostics.recentErrors.length > 0) {
      msg += `\n\u26A0\uFE0F *Recent Errors (${diagnostics.recentErrors.length}):*\n`;
      diagnostics.recentErrors.slice(0, 3).forEach((err, i) => {
        msg += `  ${i + 1}. ${err}\n`;
      });
    }
    if (diagnostics.recentDeployments && diagnostics.recentDeployments.length > 0) {
      msg += `\n\uD83D\uDE80 *Recent Deployments:*\n`;
      diagnostics.recentDeployments.slice(0, 3).forEach((dep, i) => {
        msg += `  ${i + 1}. ${dep}\n`;
      });
    }
    if (diagnostics.systemHealth) {
      msg += `\n\uD83D\uDCBB *System Health:* ${diagnostics.systemHealth}\n`;
    }

    if (escalationNote) {
      msg += `\n\uD83D\uDEA8 ${escalationNote}\n`;
    }

    msg += `\n_Use \`incident resolve ${id}\` when resolved_`;

    this.log('info', `Created incident ${id} (${severity}): ${description}`);
    return this.success(msg);
  }

  /**
   * Show all active (unresolved) incidents.
   */
  _handleStatus() {
    const active = this._getActiveIncidents();

    if (active.length === 0) {
      return this.success('*Incident Status*\n\n\uD83D\uDFE2 No active incidents. All clear.');
    }

    let msg = `*Active Incidents* (${active.length})\n\n`;

    active.forEach(inc => {
      const sev = SEVERITY_ICONS[inc.severity];
      const sts = STATUS_ICONS[inc.status] || '\u2753';
      const duration = formatDuration(Date.now() - new Date(inc.createdAt).getTime());

      msg += `${sev} *${inc.id}* — ${inc.severity.toUpperCase()}\n`;
      msg += `  ${sts} ${inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}`;
      msg += ` | \u23F1 ${duration}\n`;
      msg += `  \uD83D\uDCC4 ${inc.description}\n`;

      // Show latest timeline event
      if (inc.timeline.length > 0) {
        const latest = inc.timeline[inc.timeline.length - 1];
        msg += `  \uD83D\uDD58 Latest: ${latest.event} (${formatTime(latest.time)})\n`;
      }

      if (inc.affectedRepos.length > 0) {
        msg += `  \uD83D\uDCC1 Repos: ${inc.affectedRepos.join(', ')}\n`;
      }
      msg += '\n';
    });

    msg += `_Use \`incident resolve INC-XXX <note>\` to close_`;
    return this.success(msg);
  }

  /**
   * Resolve an incident by ID.
   */
  _handleResolve(id, resolutionNote, context) {
    const incident = this.incidents.get(id);
    if (!incident) {
      return this.error(`Incident ${id} not found`, null, {
        suggestion: 'Use `incident status` to see active incidents or `incident history` for resolved ones'
      });
    }

    if (incident.status === 'resolved') {
      return this.error(`Incident ${id} is already resolved`, null, {
        suggestion: `Resolved at ${formatTime(incident.resolvedAt)}`
      });
    }

    const now = new Date().toISOString();
    incident.status = 'resolved';
    incident.resolvedAt = now;
    incident.updatedAt = now;
    incident.resolution = resolutionNote || 'Resolved without note';
    incident.timeline.push({
      time: now,
      event: `Resolved: ${incident.resolution}`,
      actor: 'user'
    });

    const duration = formatDuration(new Date(now).getTime() - new Date(incident.createdAt).getTime());

    let msg = `*Incident Resolved*\n\n`;
    msg += `\u2705 *${id}* — ${incident.severity.toUpperCase()}\n`;
    msg += `\uD83D\uDCC4 ${incident.description}\n`;
    msg += `\u23F1 Duration: ${duration}\n`;
    msg += `\uD83D\uDD27 Resolution: ${incident.resolution}\n`;
    msg += `\uD83D\uDCC5 Timeline events: ${incident.timeline.length}\n`;
    msg += `\n_Use \`incident postmortem ${id}\` to generate a full report_`;

    this.log('info', `Resolved incident ${id} after ${duration}`);
    return this.success(msg);
  }

  /**
   * Show recently resolved incidents.
   */
  _handleHistory() {
    const resolved = this._getResolvedIncidents();

    if (resolved.length === 0) {
      return this.success('*Incident History*\n\nNo resolved incidents on record.');
    }

    let msg = `*Incident History* (${resolved.length} resolved)\n\n`;

    resolved.slice(0, 15).forEach(inc => {
      const sev = SEVERITY_ICONS[inc.severity];
      const duration = formatDuration(
        new Date(inc.resolvedAt).getTime() - new Date(inc.createdAt).getTime()
      );

      msg += `${sev} *${inc.id}* — ${inc.severity.toUpperCase()}\n`;
      msg += `  \uD83D\uDCC4 ${inc.description}\n`;
      msg += `  \u23F1 Duration: ${duration}\n`;
      msg += `  \uD83D\uDD27 ${inc.resolution}\n`;
      msg += `  \uD83D\uDCC5 Resolved: ${formatTime(inc.resolvedAt)}\n\n`;
    });

    if (resolved.length > 15) {
      msg += `_...and ${resolved.length - 15} more_\n`;
    }

    return this.success(msg);
  }

  /**
   * Generate a structured postmortem report for an incident.
   */
  _handlePostmortem(id) {
    const incident = this.incidents.get(id);
    if (!incident) {
      return this.error(`Incident ${id} not found`, null, {
        suggestion: 'Use `incident status` or `incident history` to find valid IDs'
      });
    }

    const isResolved = incident.status === 'resolved';
    const duration = isResolved
      ? formatDuration(new Date(incident.resolvedAt).getTime() - new Date(incident.createdAt).getTime())
      : formatDuration(Date.now() - new Date(incident.createdAt).getTime()) + ' (ongoing)';

    let msg = `\uD83D\uDCCB *POSTMORTEM: ${id}*\n`;
    msg += `${'─'.repeat(30)}\n\n`;

    // Section 1: What Happened
    msg += `*1. What Happened*\n`;
    msg += `${SEVERITY_ICONS[incident.severity]} Severity: ${incident.severity.toUpperCase()}\n`;
    msg += `${incident.description}\n\n`;

    // Section 2: Timeline
    msg += `*2. Timeline of Events*\n`;
    incident.timeline.forEach(entry => {
      msg += `  \u2022 \`${formatTime(entry.time)}\` — ${entry.event} [${entry.actor}]\n`;
    });
    msg += '\n';

    // Section 3: Root Cause
    msg += `*3. Root Cause*\n`;
    if (incident.diagnostics.recentErrors && incident.diagnostics.recentErrors.length > 0) {
      msg += `Diagnostics captured the following errors:\n`;
      incident.diagnostics.recentErrors.forEach((err, i) => {
        msg += `  ${i + 1}. ${err}\n`;
      });
    } else {
      msg += `_No automated diagnostics captured. Fill in root cause manually._\n`;
    }
    if (incident.diagnostics.recentDeployments && incident.diagnostics.recentDeployments.length > 0) {
      msg += `Recent deployments that may be related:\n`;
      incident.diagnostics.recentDeployments.forEach((dep, i) => {
        msg += `  ${i + 1}. ${dep}\n`;
      });
    }
    msg += '\n';

    // Section 4: Impact
    msg += `*4. Impact*\n`;
    msg += `  \u2022 Duration: ${duration}\n`;
    if (incident.affectedRepos.length > 0) {
      msg += `  \u2022 Affected repos: ${incident.affectedRepos.join(', ')}\n`;
    } else {
      msg += `  \u2022 Affected repos: _not specified_\n`;
    }
    msg += `  \u2022 Status: ${isResolved ? 'Resolved' : incident.status}\n`;
    if (incident.resolution) {
      msg += `  \u2022 Resolution: ${incident.resolution}\n`;
    }
    msg += '\n';

    // Section 5: Action Items
    msg += `*5. Action Items*\n`;
    msg += `  \u25A1 Investigate root cause and confirm fix\n`;
    msg += `  \u25A1 Add monitoring/alerting for this failure mode\n`;
    msg += `  \u25A1 Update runbook with resolution steps\n`;
    msg += `  \u25A1 Review if automated rollback is possible\n`;
    msg += `  \u25A1 Schedule follow-up review in 1 week\n\n`;

    // Section 6: Lessons Learned
    msg += `*6. Lessons Learned*\n`;
    msg += `  \u2022 _What went well?_\n`;
    msg += `  \u2022 _What could be improved?_\n`;
    msg += `  \u2022 _What will we do differently next time?_\n`;
    msg += `\n${'─'.repeat(30)}\n`;
    msg += `_Generated ${formatTime(new Date().toISOString())}_`;

    this.log('info', `Generated postmortem for ${id}`);
    return this.success(msg);
  }

  /**
   * Manually escalate an incident via the alert-escalation system.
   */
  _handleEscalate(id, context) {
    const incident = this.incidents.get(id);
    if (!incident) {
      return this.error(`Incident ${id} not found`, null, {
        suggestion: 'Use `incident status` to see active incidents'
      });
    }

    if (incident.status === 'resolved') {
      return this.error(`Cannot escalate resolved incident ${id}`);
    }

    const note = this._triggerEscalation(incident, context);
    incident.timeline.push({
      time: new Date().toISOString(),
      event: 'Manually escalated by user',
      actor: 'user'
    });
    incident.updatedAt = new Date().toISOString();

    // Advance status if still in early stages
    const currentIdx = LIFECYCLE_ORDER.indexOf(incident.status);
    if (currentIdx < 2) {
      incident.status = LIFECYCLE_ORDER[Math.min(currentIdx + 1, 2)];
      incident.timeline.push({
        time: new Date().toISOString(),
        event: `Status advanced to ${incident.status}`,
        actor: 'system'
      });
    }

    let msg = `*Incident Escalated*\n\n`;
    msg += `${SEVERITY_ICONS[incident.severity]} *${id}* — ${incident.severity.toUpperCase()}\n`;
    msg += `${STATUS_ICONS[incident.status]} Status: ${incident.status}\n`;
    msg += `\uD83D\uDEA8 ${note}\n`;
    msg += `\n_Escalation sent. Acknowledge via alert system to stop further escalation._`;

    this.log('info', `Escalated incident ${id}`);
    return this.success(msg);
  }

  // ========================= Diagnostics =========================

  /**
   * Collect diagnostics from various system sources.
   * Uses lazy requires to avoid circular dependencies.
   * @returns {Object} diagnostics data
   */
  _collectDiagnostics() {
    const diagnostics = {};

    // 1. Recent errors from activity log
    try {
      const activityLog = require('../../lib/activity-log');
      const recentErrors = activityLog.getByLevel('error', 10);
      if (recentErrors.length > 0) {
        diagnostics.recentErrors = recentErrors.map(
          e => `[${e.source}] ${e.message} (${formatTime(e.timestamp)})`
        );
      }
    } catch (err) {
      this.log('warn', 'Could not collect activity log errors', err.message);
    }

    // 2. Recent deployments from database
    try {
      const database = require('../../lib/database');
      if (database && typeof database.getRecentDeployments === 'function') {
        const deployments = database.getRecentDeployments(5);
        if (deployments && deployments.length > 0) {
          diagnostics.recentDeployments = deployments.map(
            d => `${d.repo || d.project || 'unknown'} — ${d.status || 'deployed'} (${formatTime(d.created_at || d.timestamp)})`
          );
        }
      }
    } catch (err) {
      this.log('warn', 'Could not collect deployment history', err.message);
    }

    // 3. System health snapshot (memory)
    try {
      const os = require('os');
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedPercent = ((1 - freeMem / totalMem) * 100).toFixed(1);
      const uptime = formatDuration(os.uptime() * 1000);
      diagnostics.systemHealth = `Memory: ${usedPercent}% used | Uptime: ${uptime} | Load: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`;
    } catch (err) {
      this.log('warn', 'Could not collect system health', err.message);
    }

    return diagnostics;
  }

  // ========================= Escalation =========================

  /**
   * Trigger alert escalation via the alert-escalation module.
   * @param {Object} incident
   * @param {Object} context
   * @returns {string} Note about escalation result
   */
  _triggerEscalation(incident, context) {
    try {
      const { alertEscalation } = require('../../lib/alert-escalation');
      const alertLevel = incident.severity === 'critical' ? 'CRITICAL' : 'WARNING';
      const triggerType = 'ERROR_SPIKE';

      alertEscalation.createAlert(
        triggerType,
        `${incident.id}: ${incident.description}`,
        {
          level: alertLevel.toLowerCase(),
          message: `Incident ${incident.id} — ${incident.severity.toUpperCase()}`,
          metadata: {
            incidentId: incident.id,
            severity: incident.severity,
            chatId: context.chatId || null
          }
        }
      );

      return `Alert escalation triggered (${alertLevel}). Will escalate Telegram -> WhatsApp -> Voice if unacknowledged.`;
    } catch (err) {
      this.log('warn', 'Alert escalation not available', err.message);
      return 'Alert escalation unavailable — notify team manually.';
    }
  }

  // ========================= Helpers =========================

  /**
   * Get all active (non-resolved) incidents, sorted newest first.
   * @returns {Object[]}
   */
  _getActiveIncidents() {
    const active = [];
    for (const inc of this.incidents.values()) {
      if (inc.status !== 'resolved') {
        active.push(inc);
      }
    }
    return active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get all resolved incidents, sorted by resolution time (newest first).
   * @returns {Object[]}
   */
  _getResolvedIncidents() {
    const resolved = [];
    for (const inc of this.incidents.values()) {
      if (inc.status === 'resolved') {
        resolved.push(inc);
      }
    }
    return resolved.sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
  }

  /**
   * Enforce the max incidents limit using a ring buffer approach.
   * Evicts the oldest resolved incidents first, then oldest active if needed.
   */
  _enforceMaxIncidents() {
    if (this.incidents.size <= MAX_INCIDENTS) return;

    // Prefer evicting oldest resolved incidents
    const resolved = this._getResolvedIncidents().reverse(); // oldest first
    for (const inc of resolved) {
      if (this.incidents.size <= MAX_INCIDENTS) return;
      this.incidents.delete(inc.id);
    }

    // If still over limit, evict oldest active
    const active = this._getActiveIncidents().reverse(); // oldest first
    for (const inc of active) {
      if (this.incidents.size <= MAX_INCIDENTS) return;
      this.incidents.delete(inc.id);
    }
  }

  /**
   * Get skill metadata for help/documentation.
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      activeIncidents: this._getActiveIncidents().length,
      resolvedIncidents: this._getResolvedIncidents().length,
      totalTracked: this.incidents.size,
      maxIncidents: MAX_INCIDENTS
    };
  }

  /**
   * Shutdown — clear incident state.
   */
  async shutdown() {
    const count = this.incidents.size;
    this.incidents.clear();
    this._counter = 0;
    this.log('info', `Incident Response shutdown — cleared ${count} incidents`);
    await super.shutdown();
  }
}

module.exports = IncidentResponseSkill;
