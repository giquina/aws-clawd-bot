/**
 * Design Review Skill for ClawdBot
 *
 * On-demand design quality reviews against premium standards.
 * Fetches key files from GitHub, runs AI-powered quality checks, and
 * returns Telegram-friendly reports with scores and recommendations.
 *
 * Commands:
 *   review design <repo>          - Review repo against quality standards
 *   design review <repo>          - Alias
 *   quality report / quality score - Recent metrics across repos
 *   quality standards / design standards - Show active standards
 *   review PR <number>            - Review PR against quality standards
 *   review pull request <number>  - Alias
 */

const BaseSkill = require('../base-skill');

const GRADES = [
  { min: 95, grade: 'A+', label: 'Exceptional' },
  { min: 90, grade: 'A',  label: 'Excellent' },
  { min: 85, grade: 'B+', label: 'Very Good' },
  { min: 80, grade: 'B',  label: 'Good' },
  { min: 70, grade: 'C',  label: 'Needs Improvement' },
  { min: 60, grade: 'D',  label: 'Below Standard' },
  { min: 0,  grade: 'F',  label: 'Failing' }
];

const KEY_FILES = [
  'package.json', 'tsconfig.json', '.eslintrc.json', '.eslintrc.js',
  'next.config.js', 'next.config.mjs', 'tailwind.config.js', 'tailwind.config.ts',
  'src/app/layout.tsx', 'src/app/page.tsx', 'app/layout.tsx', 'app/page.tsx',
  'src/index.ts', 'src/index.js', 'index.ts', 'index.js',
  'styles/globals.css', 'src/styles/globals.css', 'src/app/globals.css', 'app/globals.css'
];

const QUALITY_STANDARDS = {
  'Code Structure':  { minScore: 80, weight: 0.20, description: 'File organization, modularity, separation of concerns' },
  'Type Safety':     { minScore: 85, weight: 0.15, description: 'TypeScript usage, strict mode, proper typing' },
  'UI/UX Quality':   { minScore: 85, weight: 0.20, description: 'Component quality, responsive design, accessibility' },
  'Performance':     { minScore: 80, weight: 0.15, description: 'Bundle size, lazy loading, optimizations' },
  'Error Handling':  { minScore: 75, weight: 0.10, description: 'Error boundaries, validation, graceful failures' },
  'Testing':         { minScore: 70, weight: 0.10, description: 'Test coverage, test quality, CI integration' },
  'Documentation':   { minScore: 70, weight: 0.10, description: 'README, inline docs, API documentation' }
};

class DesignReviewSkill extends BaseSkill {
  name = 'design-review';
  description = 'Review project design quality against premium standards';
  priority = 25;

  commands = [
    { pattern: /^(?:review\s+design|design\s+review)(?:\s+(\S+))?$/i, description: 'Review a repo against quality standards', usage: 'review design <repo>' },
    { pattern: /^quality\s+(?:report|score)$/i, description: 'Show recent quality metrics across repos', usage: 'quality report' },
    { pattern: /^(?:quality|design)\s+standards$/i, description: 'Show current active quality standards', usage: 'quality standards' },
    { pattern: /^review\s+(?:pr|pull\s+request)\s+#?(\d+)$/i, description: 'Review a specific PR against quality standards', usage: 'review PR <number>' }
  ];

  constructor(context = {}) {
    super(context);
    this._reviewHistory = [];
    this._maxHistory = 20;
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    try {
      if (/^(?:review\s+design|design\s+review)/i.test(raw)) {
        const match = raw.match(/^(?:review\s+design|design\s+review)(?:\s+(\S+))?$/i);
        const repo = (match && match[1]) || context.autoRepo || null;
        if (!repo) return this.error('No repository specified', null, { suggestion: 'Use: review design <repo> or send from a registered group' });
        return await this.reviewDesign(repo, context);
      }
      if (/^quality\s+(?:report|score)$/i.test(raw)) return this.showQualityReport();
      if (/^(?:quality|design)\s+standards$/i.test(raw)) return this.showQualityStandards();
      if (/^review\s+(?:pr|pull\s+request)\s+#?(\d+)$/i.test(raw)) {
        const match = raw.match(/^review\s+(?:pr|pull\s+request)\s+#?(\d+)$/i);
        const repo = context.autoRepo || null;
        if (!repo) return this.error('No repository context', null, { suggestion: 'Send from a registered repo group' });
        return await this.reviewPR(repo, parseInt(match[1]), context);
      }
      return this.error('Unknown command', null, { suggestion: 'Try: review design <repo>, quality report, quality standards, review PR <number>' });
    } catch (err) {
      this.log('error', 'Design review error', err);
      return this.error('Design review failed', err, { suggestion: 'Check the repo name and try again' });
    }
  }

  /**
   * Review a repository against quality standards
   */
  async reviewDesign(repoName, context) {
    this.log('info', `Starting design review for: ${repoName}`);
    const projectManager = require('../../lib/project-manager');
    const owner = process.env.GITHUB_USERNAME;

    const rootFiles = await projectManager.listRepoFiles(owner, repoName, '');
    if (!rootFiles) return this.error(`Repository not found: ${repoName}`, null, { suggestion: 'Check repo name or GITHUB_TOKEN access' });

    // Fetch up to 10 key files
    const fetchedFiles = {};
    let fetchCount = 0;
    for (const filePath of KEY_FILES) {
      if (fetchCount >= 10) break;
      try {
        const content = await projectManager.fetchFile(owner, repoName, filePath);
        if (content) { fetchedFiles[filePath] = content; fetchCount++; }
      } catch (err) { continue; }
    }
    if (fetchCount === 0) return this.error('Could not fetch any key files', null, { attempted: `Tried ${KEY_FILES.length} paths`, suggestion: 'Ensure standard project structure' });

    const fileList = rootFiles.map(f => `${f.type === 'dir' ? '/' : ''}${f.name}`).join(', ');
    const result = await this._runAIAssessment(repoName, fetchedFiles, fileList);
    const overallScore = this._calcOverall(result.scores);
    const grade = this._getGrade(overallScore);

    this._reviewHistory.push({ repo: repoName, score: overallScore, grade: grade.grade, scores: result.scores, timestamp: Date.now() });
    if (this._reviewHistory.length > this._maxHistory) this._reviewHistory.shift();

    // Format report
    let out = `*Design Review: ${repoName}*\n\n*Overall: ${grade.grade} (${overallScore}/100) - ${grade.label}*\n\n*Category Scores:*\n`;
    for (const [cat, cfg] of Object.entries(QUALITY_STANDARDS)) {
      const s = result.scores[cat] || 0;
      const g = this._getGrade(s);
      out += `\n${cat}: ${s}/100 ${this._bar(s)} ${g.grade} [${s >= cfg.minScore ? 'PASS' : 'FAIL'}]\n`;
      if (result.notes && result.notes[cat]) out += `  ${result.notes[cat]}\n`;
    }
    if (result.summary) out += `\n*Assessment:*\n${result.summary}\n`;
    const failing = Object.entries(result.scores).filter(([c, s]) => QUALITY_STANDARDS[c] && s < QUALITY_STANDARDS[c].minScore).map(([c]) => c);
    if (failing.length > 0) out += `\n*Needs Attention:* ${failing.join(', ')}\n`;
    out += `\n_Reviewed ${fetchCount} files | Standards: v1.0_`;
    return this.success(out, null, { files: fetchCount });
  }

  /**
   * Show recent quality metrics across repos
   */
  showQualityReport() {
    if (this._reviewHistory.length === 0) {
      return this.success('*Quality Report*\n\nNo reviews yet this session.\nRun `review design <repo>` to start.');
    }
    const latest = new Map();
    for (const e of this._reviewHistory) {
      if (!latest.has(e.repo) || e.timestamp > latest.get(e.repo).timestamp) latest.set(e.repo, e);
    }

    let out = '*Quality Report - All Repos*\n\n';
    for (const [repo, e] of latest) {
      const g = this._getGrade(e.score);
      out += `*${repo}*: ${g.grade} (${e.score}/100) - ${g.label}\n  Reviewed: ${this._timeAgo(e.timestamp)}\n\n`;
    }

    // Category averages
    const totals = {}, counts = {};
    for (const e of latest.values()) {
      if (!e.scores) continue;
      for (const [c, s] of Object.entries(e.scores)) { totals[c] = (totals[c] || 0) + s; counts[c] = (counts[c] || 0) + 1; }
    }
    if (Object.keys(totals).length > 0) {
      out += '*Category Averages:*\n';
      for (const cat of Object.keys(QUALITY_STANDARDS)) {
        if (totals[cat]) out += `  ${cat}: ${Math.round(totals[cat] / counts[cat])}/100 ${this._bar(Math.round(totals[cat] / counts[cat]))}\n`;
      }
    }

    // Trend
    if (this._reviewHistory.length >= 2) {
      const sorted = [...this._reviewHistory].sort((a, b) => a.timestamp - b.timestamp);
      const mid = Math.floor(sorted.length / 2);
      const avgFirst = sorted.slice(0, mid).reduce((s, e) => s + e.score, 0) / mid;
      const avgSecond = sorted.slice(mid).reduce((s, e) => s + e.score, 0) / (sorted.length - mid);
      const diff = avgSecond - avgFirst;
      out += `\n*Trend:* ${diff > 2 ? 'Improving' : diff < -2 ? 'Declining' : 'Stable'} (${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts)`;
    }
    return this.success(out);
  }

  /**
   * Show active quality standards summary
   */
  showQualityStandards() {
    let out = '*Design Quality Standards*\n\n*Categories & Minimum Scores:*\n\n';
    for (const [name, cfg] of Object.entries(QUALITY_STANDARDS)) {
      out += `*${name}* (${(cfg.weight * 100).toFixed(0)}% weight)\n  Min: ${cfg.minScore}/100 | ${cfg.description}\n\n`;
    }
    out += '*Grading Scale:*\n';
    for (const g of GRADES) out += `  ${g.grade} (${g.min === 0 ? '<60' : g.min + '+'}): ${g.label}\n`;
    out += '\n_Use `review design <repo>` to run a review_';
    return this.success(out);
  }

  /**
   * Review a specific PR against quality standards
   */
  async reviewPR(repoName, prNumber, context) {
    this.log('info', `Reviewing PR #${prNumber} in ${repoName}`);
    const { Octokit } = require('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_USERNAME;

    let pr;
    try {
      pr = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
    } catch (err) {
      if (err.status === 404) return this.error(`PR #${prNumber} not found in ${repoName}`);
      throw err;
    }

    const prFiles = (await octokit.pulls.listFiles({ owner, repo: repoName, pull_number: prNumber, per_page: 30 })).data;
    if (prFiles.length === 0) return this.error(`PR #${prNumber} has no changed files`);

    let diffCtx = '', totalAdd = 0, totalDel = 0;
    for (const f of prFiles.slice(0, 15)) {
      totalAdd += f.additions; totalDel += f.deletions;
      diffCtx += `\n--- ${f.filename} (${f.status}) +${f.additions} -${f.deletions} ---\n`;
      if (f.patch) diffCtx += f.patch.substring(0, 2000) + (f.patch.length > 2000 ? '\n...truncated...' : '') + '\n';
    }
    if (prFiles.length > 15) diffCtx += `\n... and ${prFiles.length - 15} more files`;

    const a = await this._runPRAssessment(repoName, prNumber, pr.data.title, pr.data.body || '', diffCtx, totalAdd, totalDel);

    let out = `*PR Quality Review: #${prNumber}*\n${pr.data.title}\n${repoName} | +${totalAdd} -${totalDel} | ${prFiles.length} files\n\n`;
    out += `*Verdict:* ${a.verdict}\n*Risk:* ${a.risk}\n\n`;
    out += `*Scores:*\n  Code Quality: ${a.codeQuality}/100 ${this._bar(a.codeQuality)}\n`;
    out += `  Design Consistency: ${a.designConsistency}/100 ${this._bar(a.designConsistency)}\n`;
    out += `  Error Handling: ${a.errorHandling}/100 ${this._bar(a.errorHandling)}\n`;
    out += `  Testing Impact: ${a.testingImpact}/100 ${this._bar(a.testingImpact)}\n`;
    if (a.positives.length) { out += '\n*Positives:*\n'; a.positives.forEach(p => out += `  + ${p}\n`); }
    if (a.issues.length) { out += '\n*Issues:*\n'; a.issues.forEach(i => out += `  - ${i}\n`); }
    if (a.summary) out += `\n${a.summary}\n`;
    out += `\n${pr.data.html_url}`;
    return this.success(out, null, { files: prFiles.length });
  }

  // ============ AI Methods ============

  async _runAIAssessment(repoName, fetchedFiles, fileList) {
    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let filesContent = '';
    for (const [path, content] of Object.entries(fetchedFiles)) {
      const trunc = content.length > 3000 ? content.substring(0, 3000) + '\n...truncated...' : content;
      filesContent += `\n=== ${path} ===\n${trunc}\n`;
    }
    const cats = Object.keys(QUALITY_STANDARDS).join(', ');
    try {
      const resp = await claude.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `You are a senior software architect performing a design quality review.\n\nRepository: ${repoName}\nRoot files: ${fileList}\n${filesContent}\n\nScore 0-100 in each category: ${cats}\n\nReturn ONLY JSON:\n{"scores":{"Code Structure":{"score":<n>,"note":"<recommendation>"},"Type Safety":{"score":<n>,"note":"..."},"UI/UX Quality":{"score":<n>,"note":"..."},"Performance":{"score":<n>,"note":"..."},"Error Handling":{"score":<n>,"note":"..."},"Testing":{"score":<n>,"note":"..."},"Documentation":{"score":<n>,"note":"..."}},"summary":"<2-3 sentence assessment>"}\n\nBe fair but rigorous. If you cannot assess a category, estimate conservatively and note it.` }]
      });
      return this._parseScores(resp.content[0].text);
    } catch (err) {
      this.log('error', 'AI assessment failed, using fallback', err);
      return this._fallbackScoring(fetchedFiles);
    }
  }

  async _runPRAssessment(repoName, prNumber, title, body, diffCtx, additions, deletions) {
    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const resp = await claude.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `You are a senior code reviewer assessing PR quality.\n\nRepo: ${repoName} | PR #${prNumber}: ${title}\nDescription: ${body}\nChanges: +${additions} -${deletions}\n\n${diffCtx}\n\nReturn ONLY JSON:\n{"codeQuality":<0-100>,"designConsistency":<0-100>,"errorHandling":<0-100>,"testingImpact":<0-100>,"risk":"<low|medium|high>","verdict":"<APPROVE|REQUEST_CHANGES|NEEDS_DISCUSSION>","issues":["..."],"positives":["..."],"summary":"<2-3 sentences>"}` }]
      });
      return this._parsePRScores(resp.content[0].text);
    } catch (err) {
      this.log('error', 'PR AI assessment failed', err);
      return { codeQuality: 0, designConsistency: 0, errorHandling: 0, testingImpact: 0, risk: 'unknown', verdict: 'NEEDS_DISCUSSION', issues: ['AI assessment unavailable'], positives: [], summary: 'Could not complete AI assessment. Manual review recommended.' };
    }
  }

  // ============ Parsing ============

  _parseScores(text) {
    try {
      const json = text.match(/\{[\s\S]*\}/);
      if (!json) return this._defaultScores();
      const parsed = JSON.parse(json[0]);
      const scores = {}, notes = {};
      if (parsed.scores) {
        for (const [cat, data] of Object.entries(parsed.scores)) {
          if (!QUALITY_STANDARDS[cat]) continue;
          const s = typeof data === 'object' ? data.score : data;
          scores[cat] = Math.max(0, Math.min(100, Math.round(Number(s) || 0)));
          if (typeof data === 'object' && data.note) notes[cat] = data.note;
        }
      }
      for (const cat of Object.keys(QUALITY_STANDARDS)) {
        if (scores[cat] === undefined) { scores[cat] = 50; notes[cat] = 'Could not assess from available files'; }
      }
      return { scores, notes, summary: parsed.summary || '' };
    } catch (err) {
      this.log('warn', 'Failed to parse AI scores', err);
      return this._defaultScores();
    }
  }

  _parsePRScores(text) {
    try {
      const json = text.match(/\{[\s\S]*\}/);
      if (!json) return this._defaultPRScores();
      const p = JSON.parse(json[0]);
      const clamp = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      return {
        codeQuality: clamp(p.codeQuality), designConsistency: clamp(p.designConsistency),
        errorHandling: clamp(p.errorHandling), testingImpact: clamp(p.testingImpact),
        risk: p.risk || 'unknown', verdict: p.verdict || 'NEEDS_DISCUSSION',
        issues: Array.isArray(p.issues) ? p.issues.slice(0, 5) : [],
        positives: Array.isArray(p.positives) ? p.positives.slice(0, 5) : [],
        summary: p.summary || 'Assessment complete.'
      };
    } catch (err) {
      this.log('warn', 'Failed to parse PR scores', err);
      return this._defaultPRScores();
    }
  }

  // ============ Helpers ============

  _calcOverall(scores) {
    let tw = 0, ws = 0;
    for (const [cat, cfg] of Object.entries(QUALITY_STANDARDS)) {
      if (scores[cat] !== undefined) { ws += scores[cat] * cfg.weight; tw += cfg.weight; }
    }
    return tw === 0 ? 0 : Math.round(ws / tw);
  }

  _getGrade(score) {
    return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
  }

  _bar(score) {
    const f = Math.round(score / 10);
    return '[' + '#'.repeat(f) + '-'.repeat(10 - f) + ']';
  }

  _timeAgo(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  }

  _fallbackScoring(fetchedFiles) {
    const paths = Object.keys(fetchedFiles);
    const scores = {}, notes = {};
    const hasTs = paths.some(f => f.includes('tsconfig'));
    const hasLayout = paths.some(f => f.includes('layout'));
    const hasNextCfg = paths.some(f => f.includes('next.config'));
    let hasTests = false;
    if (fetchedFiles['package.json']) {
      try { const pkg = JSON.parse(fetchedFiles['package.json']); hasTests = !!(pkg.scripts && (pkg.scripts.test || pkg.scripts['test:unit'])); } catch (e) { /* skip */ }
    }
    scores['Code Structure'] = paths.some(f => f.startsWith('src/')) ? 75 : 60;
    notes['Code Structure'] = 'Heuristic: based on directory structure';
    scores['Type Safety'] = hasTs ? 80 : 40;
    notes['Type Safety'] = hasTs ? 'TypeScript config found' : 'No TypeScript detected';
    scores['UI/UX Quality'] = hasLayout ? 70 : 50;
    notes['UI/UX Quality'] = 'Heuristic - run with AI for details';
    scores['Performance'] = hasNextCfg ? 70 : 55;
    notes['Performance'] = 'Heuristic - run with AI for details';
    scores['Error Handling'] = 55;
    notes['Error Handling'] = 'Could not assess without AI';
    scores['Testing'] = hasTests ? 65 : 30;
    notes['Testing'] = hasTests ? 'Test script found' : 'No test scripts found';
    scores['Documentation'] = paths.some(f => f.toLowerCase().includes('readme')) ? 65 : 35;
    notes['Documentation'] = 'Heuristic: based on README presence';
    return { scores, notes, summary: 'Heuristic scoring (AI unavailable). Scores may be less accurate.' };
  }

  _defaultScores() {
    const scores = {}, notes = {};
    for (const c of Object.keys(QUALITY_STANDARDS)) { scores[c] = 50; notes[c] = 'Assessment parsing failed'; }
    return { scores, notes, summary: 'Default scores assigned - assessment could not be completed.' };
  }

  _defaultPRScores() {
    return { codeQuality: 0, designConsistency: 0, errorHandling: 0, testingImpact: 0, risk: 'unknown', verdict: 'NEEDS_DISCUSSION', issues: ['Assessment failed - manual review recommended'], positives: [], summary: 'Could not parse AI assessment.' };
  }
}

module.exports = DesignReviewSkill;
