/**
 * Dependency Guard Skill for ClawdBot
 *
 * Scans managed repos for dependency vulnerabilities, blacklisted packages,
 * and risky version patterns. Can run on-demand or via nightly automation.
 *
 * Commands:
 *   scan deps <repo>            - Scan a specific repo
 *   check vulnerabilities <repo> - Alias
 *   scan all deps               - Scan all managed repos
 *   vulnerability report        - Alias
 *   dep guard status            - Show recent scan results
 */

const BaseSkill = require('../base-skill');
const path = require('path');

const BLACKLISTED = {
  'event-stream': 'Supply chain attack (2018)',
  'ua-parser-js': 'Supply chain attack (2021)',
  'colors': 'Maintainer sabotage (2022)',
  'faker': 'Maintainer sabotage (2022)',
  'node-ipc': 'Protestware (2022)',
  'peacenotwar': 'Protestware dependency',
  'flatmap-stream': 'Malicious package',
  'getcookies': 'Malicious package',
  'mailparser': 'Known vulnerabilities — use mailparser-mit',
  'request': 'Deprecated — use node-fetch or axios',
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

class DependencyGuardSkill extends BaseSkill {
  name = 'dependency-guard';
  description = 'Scan repos for dependency vulnerabilities and risky packages';
  priority = 20;

  commands = [
    { pattern: /^scan\s+deps\s+(\S+)$/i, description: 'Scan repo for vulnerable dependencies', usage: 'scan deps <repo>' },
    { pattern: /^check\s+vulnerabilities?\s+(\S+)$/i, description: 'Check repo for vulnerabilities', usage: 'check vulnerabilities <repo>' },
    { pattern: /^scan\s+all\s+deps$/i, description: 'Scan all managed repos', usage: 'scan all deps' },
    { pattern: /^vulnerability\s+report$/i, description: 'Full vulnerability report', usage: 'vulnerability report' },
    { pattern: /^dep\s+guard\s+status$/i, description: 'Recent scan results', usage: 'dep guard status' },
  ];

  constructor(context) {
    super(context);
    this.scanHistory = new Map();
    this._octokit = null;
  }

  /** @private Lazy-load Octokit */
  _getOctokit() {
    if (this._octokit) return this._octokit;
    try {
      const { Octokit } = require('@octokit/rest');
      this._octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      return this._octokit;
    } catch (e) {
      return null;
    }
  }

  async execute(command, context) {
    const cmd = command.trim().toLowerCase();

    // Scan specific repo
    let match = cmd.match(/^(?:scan\s+deps|check\s+vulnerabilities?)\s+(\S+)$/i);
    if (match) return this._scanRepo(match[1], context);

    // Scan all repos
    if (/^(?:scan\s+all\s+deps|vulnerability\s+report)$/i.test(cmd)) {
      return this._scanAll(context);
    }

    // Status
    if (/^dep\s+guard\s+status$/i.test(cmd)) {
      return this._showStatus();
    }

    return this.error('Unknown command', null, { suggestion: 'Try: scan deps <repo>' });
  }

  /**
   * Scan a single repo for dependency vulnerabilities
   * @param {string} repoName
   * @param {object} context
   */
  async _scanRepo(repoName, context) {
    const octokit = this._getOctokit();
    if (!octokit) return this.error('GitHub token not configured');

    const owner = process.env.GITHUB_USER || 'giquina';
    let packageJson;

    try {
      const { data } = await octokit.repos.getContent({ owner, repo: repoName, path: 'package.json' });
      packageJson = JSON.parse(Buffer.from(data.content, 'base64').toString());
    } catch (e) {
      if (e.status === 404) {
        return this.success(`${repoName} has no package.json — not a Node.js project, or dependencies are managed differently.`);
      }
      return this.error(`Couldn't read ${repoName}/package.json`, e);
    }

    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };
    const totalCount = Object.keys(allDeps).length;

    const issues = [];

    // Check blacklisted packages
    for (const [pkg, reason] of Object.entries(BLACKLISTED)) {
      if (allDeps[pkg]) {
        issues.push({ severity: 'critical', package: pkg, reason, version: allDeps[pkg] });
      }
    }

    // Check version risks
    for (const [pkg, version] of Object.entries(allDeps)) {
      const risk = this._checkVersionRisk(version);
      if (risk) {
        issues.push({ severity: risk, package: pkg, reason: this._versionRiskReason(version), version });
      }
    }

    // Check for very outdated patterns
    for (const [pkg, version] of Object.entries(allDeps)) {
      if (/^[~^]?0\./.test(version) && !pkg.startsWith('@types/')) {
        issues.push({ severity: 'low', package: pkg, reason: 'Pre-1.0 version — may have breaking changes', version });
      }
    }

    // Sort by severity
    issues.sort((a, b) => (SEVERITY_ORDER[a.severity] || 3) - (SEVERITY_ORDER[b.severity] || 3));

    // Store result
    const result = {
      repo: repoName,
      timestamp: new Date().toISOString(),
      totalDeps: totalCount,
      issues,
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    };
    this.scanHistory.set(repoName, result);

    // Record metric if framework available
    try {
      const dqf = require('../../lib/design-quality-framework');
      const score = Math.max(0, 100 - (result.critical * 25) - (result.high * 10) - (result.medium * 3) - (result.low * 1));
      dqf.recordMetric('codeQuality', score, { repo: repoName, taskType: 'dependency-scan' });
    } catch (e) { /* framework not available */ }

    return this.success(this._formatScanReport(result));
  }

  /**
   * Scan all managed repos
   * @param {object} context
   */
  async _scanAll(context) {
    let registry;
    try {
      registry = require(path.join(__dirname, '../../../config/project-registry.json'));
    } catch (e) {
      return this.error('Could not load project registry');
    }

    const projects = registry.projects || {};
    const targetTypes = new Set(['web-app', 'mobile-app', 'infrastructure']);
    const repos = [];

    for (const [key, proj] of Object.entries(projects)) {
      if (targetTypes.has(proj.type)) {
        const repoName = proj.repo ? proj.repo.split('/').pop() : key;
        repos.push(repoName);
      }
    }

    if (repos.length === 0) return this.error('No repos found in project registry');

    const results = [];
    let scanned = 0, totalIssues = 0;

    for (const repo of repos) {
      try {
        await this._scanRepo(repo, context);
        const result = this.scanHistory.get(repo);
        if (result) {
          results.push(result);
          scanned++;
          totalIssues += result.issues.length;
        }
      } catch (e) {
        results.push({ repo, error: e.message });
      }
    }

    // Build summary
    const lines = [`Vulnerability Scan — All Repos`, `${'━'.repeat(32)}`, ''];

    let totalCritical = 0, totalHigh = 0;
    for (const r of results) {
      if (r.error) {
        lines.push(`  ${r.repo}: Scan failed`);
      } else {
        const icon = r.critical > 0 ? '!!' : r.high > 0 ? '!' : 'OK';
        lines.push(`  ${icon} ${r.repo}: ${r.totalDeps} deps, ${r.issues.length} issue(s)`);
        totalCritical += r.critical || 0;
        totalHigh += r.high || 0;
      }
    }

    lines.push('', `Scanned: ${scanned} repos`);
    lines.push(`Total issues: ${totalIssues} (${totalCritical} critical, ${totalHigh} high)`);

    if (totalCritical > 0) {
      lines.push('', 'Action needed: Critical vulnerabilities found. Run "scan deps <repo>" for details.');
    }

    return this.success(lines.join('\n'));
  }

  /**
   * Show recent scan results
   */
  _showStatus() {
    if (this.scanHistory.size === 0) {
      return this.success('No scans recorded yet. Run "scan deps <repo>" or "scan all deps" to start.');
    }

    const lines = [`Dependency Guard Status`, `${'━'.repeat(28)}`, ''];

    for (const [repo, result] of this.scanHistory) {
      const age = this._timeAgo(result.timestamp);
      const issueCount = result.issues.length;
      const icon = result.critical > 0 ? '!!' : result.high > 0 ? '!' : 'OK';
      lines.push(`  ${icon} ${repo}`);
      lines.push(`     ${result.totalDeps} deps, ${issueCount} issues — scanned ${age}`);
    }

    lines.push('', `${this.scanHistory.size} repo(s) tracked`);
    return this.success(lines.join('\n'));
  }

  /** @private Check version string for risky patterns */
  _checkVersionRisk(version) {
    if (!version || typeof version !== 'string') return null;
    if (version === '*' || version === 'latest') return 'critical';
    if (version.startsWith('>=') && !version.includes('<')) return 'high';
    if (version.startsWith('>') && !version.includes('<')) return 'high';
    if (/^https?:\/\//.test(version)) return 'medium';
    if (/^git[+:]/.test(version)) return 'medium';
    if (/^file:/.test(version)) return 'medium';
    return null;
  }

  /** @private Human-readable risk reason */
  _versionRiskReason(version) {
    if (version === '*' || version === 'latest') return 'Wildcard version — any version could be installed';
    if (version.startsWith('>=')) return 'No upper bound — could pull breaking changes';
    if (/^https?:\/\/|^git[+:]/.test(version)) return 'URL dependency — not from npm registry';
    if (/^file:/.test(version)) return 'Local file dependency — not portable';
    return 'Risky version pattern';
  }

  /** @private Format scan report for Telegram */
  _formatScanReport(result) {
    const lines = [
      `Dependency Scan: ${result.repo}`,
      `${'━'.repeat(28)}`,
      '',
      `Total dependencies: ${result.totalDeps}`,
      `Issues found: ${result.issues.length}`,
    ];

    if (result.critical > 0) lines.push(`  Critical: ${result.critical}`);
    if (result.high > 0) lines.push(`  High: ${result.high}`);
    if (result.medium > 0) lines.push(`  Medium: ${result.medium}`);
    if (result.low > 0) lines.push(`  Low: ${result.low}`);

    if (result.issues.length > 0) {
      lines.push('', 'Details:');
      const shown = result.issues.slice(0, 8);
      for (const issue of shown) {
        const sev = issue.severity.toUpperCase().padEnd(8);
        lines.push(`  [${sev}] ${issue.package}@${issue.version}`);
        lines.push(`           ${issue.reason}`);
      }
      if (result.issues.length > 8) {
        lines.push(`  ... and ${result.issues.length - 8} more`);
      }
    } else {
      lines.push('', 'No issues found — dependencies look clean.');
    }

    lines.push('', `Scanned: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`);
    return lines.join('\n');
  }

  /** @private Relative time string */
  _timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}

module.exports = DependencyGuardSkill;
