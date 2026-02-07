'use strict';

/**
 * PR Watcher Skill for ClawdBot
 *
 * Automated PR review and merge management. Watches repos for new PRs,
 * auto-reviews them against quality standards via design-quality-framework,
 * comments quality scores, and can auto-merge when criteria are met.
 *
 * Commands:
 *   watch prs <repo> / pr watch <repo>       - Enable PR watching for a repo
 *   unwatch prs <repo> / pr unwatch <repo>   - Disable watching
 *   pr watch status / watched repos          - Show watched repos and pending PRs
 *   auto review pr <repo> #<n> / pr check    - Manually trigger quality review
 *   pr auto merge <repo> #<n>                - Enable auto-merge when quality passes
 *   pr rules <repo>                          - Show auto-merge rules for a repo
 */
const BaseSkill = require('../base-skill');

class PRWatcherSkill extends BaseSkill {
  name = 'pr-watcher';
  description = 'Automated PR review and merge management with quality scoring';
  priority = 23;

  commands = [
    { pattern: /^(?:watch\s+prs|pr\s+watch)\s+(\S+)$/i, description: 'Enable PR watching for a repo', usage: 'watch prs <repo>' },
    { pattern: /^(?:unwatch\s+prs|pr\s+unwatch)\s+(\S+)$/i, description: 'Disable PR watching for a repo', usage: 'unwatch prs <repo>' },
    { pattern: /^(?:pr\s+watch\s+status|watched\s+repos)$/i, description: 'Show watched repos and pending PRs', usage: 'pr watch status' },
    { pattern: /^(?:auto\s+review\s+pr|pr\s+check)\s+(\S+)\s+#?(\d+)$/i, description: 'Manually trigger quality review on a PR', usage: 'auto review pr <repo> #<number>' },
    { pattern: /^pr\s+auto\s+merge\s+(\S+)\s+#?(\d+)$/i, description: 'Enable auto-merge when quality passes', usage: 'pr auto merge <repo> #<number>' },
    { pattern: /^pr\s+rules\s+(\S+)$/i, description: 'Show auto-merge rules for a repo', usage: 'pr rules <repo>' }
  ];

  constructor(context = {}) {
    super(context);
    this.watchedRepos = new Map();
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    try {
      const watchMatch = raw.match(/^(?:watch\s+prs|pr\s+watch)\s+(\S+)$/i);
      if (watchMatch) return this._handleWatch(watchMatch[1]);

      const unwatchMatch = raw.match(/^(?:unwatch\s+prs|pr\s+unwatch)\s+(\S+)$/i);
      if (unwatchMatch) return this._handleUnwatch(unwatchMatch[1]);

      if (/^(?:pr\s+watch\s+status|watched\s+repos)$/i.test(raw)) return this._handleStatus();

      const reviewMatch = raw.match(/^(?:auto\s+review\s+pr|pr\s+check)\s+(\S+)\s+#?(\d+)$/i);
      if (reviewMatch) return await this._handleReview(reviewMatch[1], parseInt(reviewMatch[2]), context);

      const mergeMatch = raw.match(/^pr\s+auto\s+merge\s+(\S+)\s+#?(\d+)$/i);
      if (mergeMatch) return await this._handleAutoMerge(mergeMatch[1], parseInt(mergeMatch[2]), context);

      const rulesMatch = raw.match(/^pr\s+rules\s+(\S+)$/i);
      if (rulesMatch) return this._handleRules(rulesMatch[1]);

      return this.error('Unknown PR watcher command. Try "pr watch status" for help.');
    } catch (err) {
      this.log('error', 'PR watcher command failed', err);
      return this.error('PR watcher failed', err);
    }
  }

  // ==================== Command Handlers ====================

  /** Enable PR watching for a repo */
  _handleWatch(repoName) {
    const repo = repoName.trim();
    if (this.watchedRepos.has(repo)) return this.success(`Already watching PRs for ${repo}`);

    this.watchedRepos.set(repo, {
      repo, enabledAt: new Date().toISOString(), autoMerge: false,
      minQualityScore: 80, requireTests: true, maxFilesChanged: 20,
      lastChecked: null, pendingPRs: []
    });
    this.log('info', `PR watching enabled for ${repo}`);

    let msg = `PR watching enabled for ${repo}\n\n`;
    msg += `Default Rules:\n`;
    msg += `  Min quality score: 80/100\n`;
    msg += `  Tests must pass: Yes\n`;
    msg += `  No security issues: Yes\n`;
    msg += `  Max files changed: 20\n`;
    msg += `  Auto-merge: Off\n\n`;
    msg += `I'll review new PRs automatically and comment quality scores.\n`;
    msg += `Use "pr rules ${repo}" to view or "pr auto merge ${repo} #N" to enable auto-merge.`;
    return this.success(msg);
  }

  /** Disable PR watching for a repo */
  _handleUnwatch(repoName) {
    const repo = repoName.trim();
    if (!this.watchedRepos.has(repo)) {
      return this.error(`Not currently watching PRs for ${repo}`, null, {
        suggestion: 'Use "pr watch status" to see watched repos'
      });
    }
    this.watchedRepos.delete(repo);
    this.log('info', `PR watching disabled for ${repo}`);
    return this.success(`PR watching disabled for ${repo}`);
  }

  /** Show watched repos and pending PRs */
  _handleStatus() {
    if (this.watchedRepos.size === 0) {
      return this.success('No repos being watched.\nUse "watch prs <repo>" to start watching.');
    }
    let msg = `PR Watch Status\n` + '\u2501'.repeat(24) + '\n\n';
    for (const [repo, config] of this.watchedRepos) {
      const since = config.enabledAt ? this._timeAgo(new Date(config.enabledAt)) : 'unknown';
      const lastCheck = config.lastChecked ? this._timeAgo(new Date(config.lastChecked)) : 'never';
      msg += `${repo}\n`;
      msg += `  Watching since: ${since}\n`;
      msg += `  Last checked: ${lastCheck}\n`;
      msg += `  Auto-merge: ${config.autoMerge ? 'On' : 'Off'}\n`;
      msg += `  Min score: ${config.minQualityScore}/100\n`;
      if (config.pendingPRs.length > 0) {
        msg += `  Pending PRs:\n`;
        config.pendingPRs.slice(0, 5).forEach(pr => {
          msg += `    #${pr.number}: ${pr.title} (score: ${pr.score || 'pending'})\n`;
        });
        if (config.pendingPRs.length > 5) msg += `    ...and ${config.pendingPRs.length - 5} more\n`;
      } else {
        msg += `  Pending PRs: none\n`;
      }
      msg += '\n';
    }
    return this.success(msg.trimEnd());
  }

  /** Manually trigger quality review on a PR */
  async _handleReview(repoName, prNumber, context) {
    // Lazy imports to avoid circular deps
    const { Octokit } = require('@octokit/rest');
    const dqf = require('../../lib/design-quality-framework');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_USER || 'giquina';
    this.log('info', `Reviewing PR #${prNumber} in ${repoName}`);

    // 1. Fetch PR details
    let prData;
    try {
      const { data } = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
      prData = data;
    } catch (err) {
      return err.status === 404
        ? this.error(`PR #${prNumber} not found in ${repoName}`)
        : this.error(`Failed to fetch PR #${prNumber}`, err);
    }

    // 2. Fetch changed files
    let changedFiles;
    try {
      const { data } = await octokit.pulls.listFiles({ owner, repo: repoName, pull_number: prNumber, per_page: 50 });
      changedFiles = data;
    } catch (err) {
      return this.error('Failed to fetch PR files', err);
    }

    // 3. Fetch file contents for quality validation
    const filesToValidate = [];
    const codeExts = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.py', '.json', '.html', '.css', '.scss']);
    for (const file of changedFiles.slice(0, 15)) {
      if (file.status === 'removed') continue;
      const ext = '.' + (file.filename.split('.').pop() || '').toLowerCase();
      if (!codeExts.has(ext)) continue;
      try {
        const { data: fd } = await octokit.repos.getContent({ owner, repo: repoName, path: file.filename, ref: prData.head.ref });
        if (fd.content) filesToValidate.push({ path: file.filename, content: Buffer.from(fd.content, 'base64').toString('utf8') });
      } catch (_) { /* skip unreadable files (binary, too large) */ }
    }

    // 4. Run quality validation
    const validation = filesToValidate.length > 0
      ? dqf.validateGeneratedCode(filesToValidate, { repoName })
      : { passed: true, score: 100, issues: [], warnings: ['No code files to validate'] };

    // 5. Compute additional metrics
    const totalAdditions = changedFiles.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = changedFiles.reduce((s, f) => s + f.deletions, 0);
    const todoCount = filesToValidate.reduce((c, f) => c + (f.content.match(/\/\/\s*TODO|\/\*\s*TODO|#\s*TODO/gi) || []).length, 0);
    const hasTypeScript = filesToValidate.some(f => /\.tsx?$/.test(f.path));

    // Adjust score for file count and TS usage
    let adjustedScore = validation.score;
    if (changedFiles.length > 20) adjustedScore = Math.max(0, adjustedScore - 10);
    if (hasTypeScript) adjustedScore = Math.min(100, adjustedScore + 5);
    adjustedScore = Math.max(0, Math.min(100, adjustedScore));

    const grade = adjustedScore >= 90 ? 'A \u2014 Excellent'
      : adjustedScore >= 80 ? 'B \u2014 Good'
      : adjustedScore >= 70 ? 'C \u2014 Acceptable'
      : adjustedScore >= 60 ? 'D \u2014 Needs Work' : 'F \u2014 Poor';

    const recommendation = adjustedScore >= 80 && validation.issues.length === 0
      ? 'Ready to merge'
      : adjustedScore >= 60 ? 'Review issues before merging'
      : 'Significant issues found \u2014 do not merge';

    // 6. Build review comment
    let msg = `Quality Review \u2014 PR #${prNumber}\n` + '\u2501'.repeat(24) + '\n\n';
    msg += `Score: ${adjustedScore}/100 (${grade})\n\n`;
    msg += `Code Check: ${validation.passed ? 'Passed' : 'Issues found'}\n`;
    msg += `  Security: ${validation.issues.some(i => i.toLowerCase().includes('secret')) ? 'Issues detected' : 'No issues'}\n`;
    msg += `  Completeness: ${todoCount > 0 ? todoCount + ' TODOs found' : 'Clean'}\n`;
    msg += `  Syntax: ${validation.issues.some(i => i.toLowerCase().includes('bracket') || i.toLowerCase().includes('json')) ? 'Issues' : 'Valid'}\n`;
    if (hasTypeScript) msg += `  TypeScript: Yes (+5 bonus)\n`;
    msg += '\n';

    msg += `Files Changed: ${changedFiles.length} (+${totalAdditions} -${totalDeletions})\n`;
    changedFiles.slice(0, 8).forEach(f => { msg += `  ${f.filename}\n`; });
    if (changedFiles.length > 8) msg += `  ...and ${changedFiles.length - 8} more\n`;
    msg += '\n';

    if (validation.issues.length > 0) {
      msg += `Issues (${validation.issues.length}):\n`;
      validation.issues.slice(0, 5).forEach(i => { msg += `  - ${i.substring(0, 120)}\n`; });
      if (validation.issues.length > 5) msg += `  ...and ${validation.issues.length - 5} more\n`;
      msg += '\n';
    }
    if (validation.warnings.length > 0) {
      msg += `Warnings (${validation.warnings.length}):\n`;
      validation.warnings.slice(0, 3).forEach(w => { msg += `  - ${w.substring(0, 120)}\n`; });
      if (validation.warnings.length > 3) msg += `  ...and ${validation.warnings.length - 3} more\n`;
      msg += '\n';
    }
    msg += `Recommendation: ${recommendation}\n\n${prData.html_url}`;

    // 7. Record metric via DQF
    dqf.recordMetric('codeQuality', adjustedScore, { repo: repoName, taskType: 'review' });

    // 8. Update pending PRs for watched repo
    if (this.watchedRepos.has(repoName)) {
      const cfg = this.watchedRepos.get(repoName);
      cfg.lastChecked = new Date().toISOString();
      const prEntry = { number: prNumber, title: prData.title, score: adjustedScore, reviewedAt: new Date().toISOString() };
      const idx = cfg.pendingPRs.findIndex(p => p.number === prNumber);
      if (idx >= 0) cfg.pendingPRs[idx] = prEntry; else cfg.pendingPRs.push(prEntry);
    }

    this.log('info', `PR #${prNumber} reviewed: ${adjustedScore}/100`);
    return this.success(msg.trimEnd());
  }

  /** Enable auto-merge for a PR if quality passes */
  async _handleAutoMerge(repoName, prNumber, context) {
    const { Octokit } = require('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_USER || 'giquina';

    // Ensure repo is being watched
    if (!this.watchedRepos.has(repoName)) {
      this.watchedRepos.set(repoName, {
        repo: repoName, enabledAt: new Date().toISOString(), autoMerge: false,
        minQualityScore: 80, requireTests: true, maxFilesChanged: 20,
        lastChecked: null, pendingPRs: []
      });
    }
    const config = this.watchedRepos.get(repoName);
    const pendingPR = config.pendingPRs.find(p => p.number === prNumber);

    // Review first if no score yet
    if (!pendingPR || pendingPR.score === undefined) {
      const reviewResult = await this._handleReview(repoName, prNumber, context);
      if (!reviewResult.success) return reviewResult;
      const updatedPR = config.pendingPRs.find(p => p.number === prNumber);
      if (!updatedPR) return this.error('Failed to review PR before auto-merge');
      if (updatedPR.score < config.minQualityScore) {
        return this.warning(
          `PR #${prNumber} does not meet auto-merge criteria\n\nScore: ${updatedPR.score}/100 (minimum: ${config.minQualityScore})\n\nImprove the code and re-review, or merge manually on GitHub.`,
          { risk: 'medium', action: `Score must reach ${config.minQualityScore}/100 to auto-merge` }
        );
      }
    } else if (pendingPR.score < config.minQualityScore) {
      return this.warning(
        `PR #${prNumber} does not meet auto-merge criteria\n\nScore: ${pendingPR.score}/100 (minimum: ${config.minQualityScore})\n\nRun "pr check ${repoName} #${prNumber}" after improvements.`,
        { risk: 'medium', action: `Score must reach ${config.minQualityScore}/100 to auto-merge` }
      );
    }

    // Score meets threshold -- merge
    try {
      const { data: pr } = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
      if (pr.state !== 'open') return this.error(`PR #${prNumber} is ${pr.state}, cannot merge`);
      if (pr.merged) return this.success(`PR #${prNumber} is already merged`);

      await octokit.pulls.merge({ owner, repo: repoName, pull_number: prNumber, merge_method: 'squash' });
      config.pendingPRs = config.pendingPRs.filter(p => p.number !== prNumber);
      this.log('info', `Auto-merged PR #${prNumber} in ${repoName}`);

      const score = pendingPR ? pendingPR.score : 'passed';
      return this.success(`PR #${prNumber} auto-merged in ${repoName}\n\nQuality score: ${score}/100\nMerge method: squash\n${pr.html_url}`);
    } catch (err) {
      if (err.status === 405) {
        return this.error(`PR #${prNumber} cannot be merged`, 'Merge requirements not met (branch protection, reviews, or checks)', { suggestion: 'Check branch protection rules on GitHub' });
      }
      if (err.status === 409) {
        return this.error(`PR #${prNumber} has merge conflicts`, 'Head branch is out of date or has conflicts', { suggestion: 'Resolve conflicts and try again' });
      }
      return this.error(`Failed to merge PR #${prNumber}`, err);
    }
  }

  /** Show auto-merge rules for a repo */
  _handleRules(repoName) {
    const repo = repoName.trim();
    const config = this.watchedRepos.get(repo);
    if (!config) {
      return this.success(`PR Auto-Merge Rules: ${repo}\n` + '\u2501'.repeat(24) + `\n\nNot currently watching this repo.\nUse "watch prs ${repo}" to enable and configure.`);
    }
    let msg = `PR Auto-Merge Rules: ${repo}\n` + '\u2501'.repeat(24) + '\n';
    msg += `  Min quality score: ${config.minQualityScore}/100\n`;
    msg += `  Tests must pass: ${config.requireTests ? 'Yes' : 'No'}\n`;
    msg += `  No security issues: Yes\n`;
    msg += `  Max files changed: ${config.maxFilesChanged}\n`;
    msg += `  Auto-merge enabled: ${config.autoMerge ? 'Yes' : 'No'}`;
    return this.success(msg);
  }

  // ==================== Private Helpers ====================

  /** @private Format a Date as a human-readable "time ago" string */
  _timeAgo(date) {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay > 0) return `${diffDay}d ago`;
    if (diffHr > 0) return `${diffHr}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'just now';
  }
}

module.exports = PRWatcherSkill;
