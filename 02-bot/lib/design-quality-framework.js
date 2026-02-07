'use strict';

/**
 * Design Quality Framework - Quality assurance backbone for ClawdBot
 *
 * Loads design standards from config, validates generated code/designs,
 * scores quality, generates Telegram-friendly reports, tracks metrics
 * over time, and integrates with governance/audit systems.
 *
 * Singleton module — require() returns a single instance.
 *
 * @module lib/design-quality-framework
 */

const path = require('path');
const fs = require('fs');

const STANDARDS_PATH = path.join(__dirname, '../../config/design-standards.json');
const MAX_METRICS = 500;
const VALID_CATEGORIES = new Set([
  'aesthetics', 'usability', 'accessibility',
  'responsiveness', 'brandConsistency', 'codeQuality'
]);
const GRADES = [
  { min: 90, grade: 'A', label: 'Excellent' },
  { min: 80, grade: 'B', label: 'Good' },
  { min: 70, grade: 'C', label: 'Acceptable' },
  { min: 60, grade: 'D', label: 'Needs Work' },
  { min: 0,  grade: 'F', label: 'Poor' },
];
const DEFAULT_WEIGHTS = {
  aesthetics: 0.15, usability: 0.25, accessibility: 0.20,
  responsiveness: 0.15, brandConsistency: 0.10, codeQuality: 0.15,
};
const DEFAULT_STANDARDS = {
  version: '1.0',
  weights: DEFAULT_WEIGHTS,
  projectTypes: {
    react:   { requiredPatterns: ['import React', 'export default'], forbiddenPatterns: ['document.getElementById'], maxFileSize: 500000, minFileSize: 20 },
    express: { requiredPatterns: [], forbiddenPatterns: ['eval('], maxFileSize: 300000, minFileSize: 20 },
    python:  { requiredPatterns: [], forbiddenPatterns: ['exec(', 'eval('], maxFileSize: 200000, minFileSize: 10 },
  },
  completeness: {
    truncationIndicators: ['// TODO: implement', '// ...', '/* ... */', '# TODO', 'pass  # placeholder', "throw new Error('Not implemented')", 'NotImplementedError'],
    maxTruncationRatio: 0.15,
  },
};
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
  /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  /(?:token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
  /sk[-_](?:live|test)[A-Za-z0-9_\-]{20,}/,
  /ghp_[A-Za-z0-9]{36,}/, /gsk_[A-Za-z0-9]{20,}/, /xai-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9_\-]{20,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];
const PROMPT_TEMPLATES = {
  design: 'Follow design standards: consistent spacing, accessible colours (WCAG AA), responsive layout, clear visual hierarchy. Prefer system fonts and CSS variables.',
  coding: 'Write clean, maintainable code: no hardcoded secrets, descriptive names, error handling on I/O, small focused functions. Max 300 lines per file.',
  planning: 'Consider quality gates: accessibility, security review, responsive testing, and brand consistency before marking complete.',
  review: 'Check for: truncated/placeholder code, hardcoded secrets, missing error handling, accessibility issues, inconsistent styling.',
};
const STACK_HINTS = {
  react: 'Use functional components with hooks. Prefer composition. Keep components under 200 lines.',
  nextjs: 'Use functional components with hooks. Prefer composition. Keep components under 200 lines.',
  express: 'Validate all inputs. Use async/await with try/catch. Return consistent error shapes.',
  python: 'Use type hints. Follow PEP 8. Handle exceptions explicitly.',
  'react native': 'Use functional components. Test on both iOS and Android.',
};
const RECOMMENDATIONS = {
  aesthetics:        { critical: 'Visual design needs work — review spacing, colour palette, and typography.', improvement: 'Refine visual polish — check alignment and whitespace balance.' },
  usability:         { critical: 'Simplify navigation, improve error messages, ensure intuitive flow.', improvement: 'Add loading states, clearer labels, better form validation feedback.' },
  accessibility:     { critical: 'Add alt text, ensure keyboard nav, check colour contrast (WCAG AA).', improvement: 'Verify focus indicators, aria labels, screen reader compatibility.' },
  responsiveness:    { critical: 'Layout breaks on different screens — implement mobile-first design.', improvement: 'Test tablet breakpoints and touch target sizes.' },
  brandConsistency:  { critical: 'Align colours, fonts, and tone with brand guidelines.', improvement: 'Check logo usage, colour values, and font weights.' },
  codeQuality:       { critical: 'Refactor large functions, add error handling, remove dead code.', improvement: 'Extract shared logic, improve naming, add JSDoc to public APIs.' },
};

class DesignQualityFramework {
  constructor() {
    this._standards = null;
    this._metrics = [];
    this._metricsHead = 0;
    this._metricsSize = 0;
    console.log('[DesignQuality] Framework initialised');
  }

  /**
   * Load design standards from config/design-standards.json.
   * Caches in memory. Falls back to built-in defaults if file missing.
   * @returns {object} The standards object
   */
  loadStandards() {
    if (this._standards) return this._standards;
    try {
      if (fs.existsSync(STANDARDS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STANDARDS_PATH, 'utf8'));
        this._standards = {
          ...DEFAULT_STANDARDS, ...parsed,
          weights: { ...DEFAULT_WEIGHTS, ...(parsed.weights || {}) },
          completeness: { ...DEFAULT_STANDARDS.completeness, ...(parsed.completeness || {}) },
        };
        console.log('[DesignQuality] Loaded standards from', STANDARDS_PATH);
      } else {
        this._standards = { ...DEFAULT_STANDARDS };
        console.log('[DesignQuality] No config file found, using defaults');
      }
    } catch (err) {
      console.log('[DesignQuality] Error loading standards:', err.message, '— using defaults');
      this._standards = { ...DEFAULT_STANDARDS };
    }
    return this._standards;
  }

  /**
   * Generate a concise quality-context string for Claude's system prompt.
   * Adapts to project type and task type. Kept under 500 characters.
   * @param {object} options
   * @param {string} [options.projectType] - 'react' | 'express' | 'python' etc.
   * @param {string} [options.taskType]    - 'design' | 'coding' | 'planning' | 'review'
   * @param {string} [options.repoName]    - Repository name for context
   * @returns {string} Formatted prompt injection string
   */
  getQualityPromptInjection({ projectType, taskType, repoName } = {}) {
    try {
      const parts = [PROMPT_TEMPLATES[(taskType || 'coding').toLowerCase()] || PROMPT_TEMPLATES.coding];
      const hint = STACK_HINTS[(projectType || '').toLowerCase()];
      if (hint) parts.push(hint);
      let result = parts.join(' ');
      if (result.length > 490) result = result.substring(0, 487) + '...';
      return `[Quality] ${result}`;
    } catch (err) {
      console.log('[DesignQuality] getQualityPromptInjection error:', err.message);
      return '[Quality] Write clean, secure, accessible code.';
    }
  }

  /**
   * Validate generated files for common AI-generation issues.
   * Checks syntax, completeness, security, imports, and size.
   * @param {Array<{path: string, content: string}>} files
   * @param {object} projectDetails
   * @param {string} [projectDetails.repoName]
   * @param {string} [projectDetails.template] - 'react' | 'express' | 'python'
   * @param {string[]} [projectDetails.techStack]
   * @returns {{ passed: boolean, score: number, issues: string[], warnings: string[] }}
   */
  validateGeneratedCode(files, projectDetails = {}) {
    const issues = [], warnings = [];
    let totalPts = 0, earnedPts = 0;
    if (!Array.isArray(files) || files.length === 0) {
      return { passed: false, score: 0, issues: ['No files provided for validation'], warnings: [] };
    }
    const standards = this.loadStandards();
    const typeConfig = (standards.projectTypes || {})[(projectDetails.template || '').toLowerCase()] || {};

    for (const file of files) {
      if (!file || typeof file.content !== 'string') { issues.push(`Invalid file entry: ${file?.path || 'unknown'}`); continue; }
      const fp = file.path || 'unknown', content = file.content, ext = path.extname(fp).toLowerCase();
      const maxSz = typeConfig.maxFileSize || 500000, minSz = typeConfig.minFileSize || 10;

      // Size (5 pts)
      totalPts += 5;
      if (content.length > maxSz) { issues.push(`${fp}: File too large (${(content.length/1024).toFixed(1)}KB)`); }
      else if (content.length < minSz) { warnings.push(`${fp}: Suspiciously small file (${content.length} bytes)`); earnedPts += 3; }
      else { earnedPts += 5; }

      // Syntax (10 pts)
      totalPts += 10;
      const syn = this._checkSyntax(content, ext, fp);
      issues.push(...syn.issues); warnings.push(...syn.warnings); earnedPts += syn.points;

      // Completeness (10 pts)
      totalPts += 10;
      const comp = this._checkCompleteness(content, fp, standards.completeness);
      issues.push(...comp.issues); warnings.push(...comp.warnings); earnedPts += comp.points;

      // Security (15 pts)
      totalPts += 15;
      const sec = this._checkSecurity(content, fp);
      issues.push(...sec.issues); warnings.push(...sec.warnings); earnedPts += sec.points;

      // Imports (5 pts)
      totalPts += 5;
      const imp = this._checkImports(content, ext, fp);
      warnings.push(...imp.warnings); earnedPts += imp.points;
    }
    const score = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : 0;
    return { passed: issues.length === 0 && score >= 60, score, issues, warnings };
  }

  /** @private */
  _checkSyntax(content, ext, fp) {
    const issues = [], warnings = [];
    let points = 10;
    if (ext === '.json') {
      try { JSON.parse(content); } catch (e) { issues.push(`${fp}: Invalid JSON — ${e.message.substring(0, 80)}`); points = 0; }
      return { issues, warnings, points };
    }
    if (ext === '.html' || ext === '.htm') {
      const open = (content.match(/<(?!\/|!|br|hr|img|input|meta|link)[a-z][a-z0-9]*(?:\s[^>]*)?>/gi) || []).length;
      const close = (content.match(/<\/[a-z][a-z0-9]*>/gi) || []).length;
      const diff = Math.abs(open - close);
      if (diff > 3) { issues.push(`${fp}: HTML tag mismatch — ${open} opening vs ${close} closing`); points -= 5; }
      else if (diff > 0) { warnings.push(`${fp}: Minor HTML tag imbalance (${diff})`); points -= 2; }
      return { issues, warnings, points: Math.max(0, points) };
    }
    // Bracket balance for JS/TS/CSS/Python
    const pairs = { '{': '}', '(': ')', '[': ']' };
    const stack = [];
    let inStr = false, strCh = '', esc = false, lineC = false, blockC = false;
    for (let i = 0; i < content.length; i++) {
      const c = content[i], n = content[i + 1];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (!inStr && !blockC && c === '/' && n === '/') { lineC = true; continue; }
      if (lineC) { if (c === '\n') lineC = false; continue; }
      if (!inStr && !blockC && c === '/' && n === '*') { blockC = true; i++; continue; }
      if (blockC) { if (c === '*' && n === '/') { blockC = false; i++; } continue; }
      if (!inStr && (c === '"' || c === '\'' || c === '`')) { inStr = true; strCh = c; continue; }
      if (inStr && c === strCh) { inStr = false; continue; }
      if (inStr) continue;
      if (pairs[c]) stack.push(c);
      else if (c === '}' || c === ')' || c === ']') {
        if (stack.length > 0 && pairs[stack[stack.length - 1]] === c) stack.pop();
      }
    }
    if (stack.length > 3 && content.length < 50000) { issues.push(`${fp}: ${stack.length} unclosed brackets`); points -= 6; }
    else if (stack.length > 0 && content.length < 50000) { warnings.push(`${fp}: ${stack.length} unclosed bracket(s)`); points -= 3; }
    if (inStr) { warnings.push(`${fp}: Possible unterminated string literal`); points -= 2; }
    return { issues, warnings, points: Math.max(0, points) };
  }

  /** @private */
  _checkCompleteness(content, fp, cfg) {
    const issues = [], warnings = [];
    let points = 10;
    const indicators = (cfg && cfg.truncationIndicators) || DEFAULT_STANDARDS.completeness.truncationIndicators;
    const maxRatio = (cfg && cfg.maxTruncationRatio) || 0.15;
    const lines = content.split('\n');
    let count = 0;
    for (const ind of indicators) {
      const lower = ind.toLowerCase();
      for (const line of lines) { if (line.toLowerCase().includes(lower)) count++; }
    }
    const ratio = lines.length > 0 ? count / lines.length : 0;
    if (ratio > maxRatio) { issues.push(`${fp}: Likely truncated — ${count} placeholders in ${lines.length} lines (${(ratio*100).toFixed(1)}%)`); points = 0; }
    else if (count > 3) { warnings.push(`${fp}: ${count} placeholder/TODO markers`); points -= 3; }
    else if (count > 0) { warnings.push(`${fp}: ${count} TODO marker(s)`); points -= 1; }
    // Abrupt ending check
    const trimmed = content.trimEnd();
    if (trimmed.length > 100 && /[{(,]\s*$/.test(trimmed.slice(-20)) && !/\)\s*[{]\s*$/.test(trimmed.slice(-20))) {
      warnings.push(`${fp}: File may be truncated (ends with open bracket/comma)`); points -= 4;
    }
    return { issues, warnings, points: Math.max(0, points) };
  }

  /** @private */
  _checkSecurity(content, fp) {
    const issues = [], warnings = [];
    let points = 15;
    const base = path.basename(fp).toLowerCase();
    if (base.endsWith('.example') || base.endsWith('.sample')) return { issues, warnings, points };
    for (const pat of SECRET_PATTERNS) {
      const m = content.match(pat);
      if (m) { issues.push(`${fp}: Potential hardcoded secret — "${m[0].substring(0, 40)}..."`); points = 0; }
    }
    if (content.includes('PRIVATE KEY')) { issues.push(`${fp}: Contains private key material`); points = 0; }
    const envFallbacks = content.match(/process\.env\.\w+\s*\|\|\s*['"][A-Za-z0-9_\-]{10,}['"]/g);
    if (envFallbacks) { warnings.push(`${fp}: ${envFallbacks.length} env var fallback(s) with literal values`); points = Math.max(0, points - 3); }
    return { issues, warnings, points };
  }

  /** @private */
  _checkImports(content, ext, fp) {
    const warnings = [];
    let points = 5;
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) return { warnings, points };
    const deep = content.match(/(?:require|import\s+.*from)\s*\(\s*['"](\.\.[/\\]){4,}/g);
    if (deep) { warnings.push(`${fp}: ${deep.length} deeply nested relative import(s)`); points -= 1; }
    const placeholders = content.match(/(?:require|from)\s*\(?['"](?:TODO|FIXME|your-module|module-name|package-name)['"]\)?/gi);
    if (placeholders) { warnings.push(`${fp}: ${placeholders.length} placeholder import(s)`); points -= 3; }
    return { warnings, points: Math.max(0, points) };
  }

  /**
   * Score a design across multiple quality dimensions.
   * @param {object} criteria - Category scores, each 0-100
   * @returns {{ overallScore: number, grade: string, breakdown: object, recommendations: string[] }}
   */
  scoreDesign(criteria = {}) {
    try {
      const weights = this.loadStandards().weights || DEFAULT_WEIGHTS;
      const breakdown = {}, recommendations = [];
      let weightedSum = 0, totalWeight = 0;
      for (const cat of VALID_CATEGORIES) {
        const score = typeof criteria[cat] === 'number' ? Math.max(0, Math.min(100, criteria[cat])) : null;
        const w = weights[cat] || DEFAULT_WEIGHTS[cat] || 0;
        if (score !== null) {
          breakdown[cat] = { score, weight: w, weighted: Math.round(score * w * 100) / 100 };
          weightedSum += score * w; totalWeight += w;
          if (score < 60) recommendations.push(RECOMMENDATIONS[cat]?.critical || `${cat} needs attention (${score}/100).`);
          else if (score < 75) recommendations.push(RECOMMENDATIONS[cat]?.improvement || `${cat} could improve (${score}/100).`);
        } else {
          breakdown[cat] = { score: null, weight: w, weighted: null };
        }
      }
      const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      const g = GRADES.find(t => overall >= t.min) || GRADES[GRADES.length - 1];
      return { overallScore: overall, grade: `${g.grade} (${g.label})`, breakdown, recommendations };
    } catch (err) {
      console.log('[DesignQuality] scoreDesign error:', err.message);
      return { overallScore: 0, grade: 'F (Error)', breakdown: {}, recommendations: ['Scoring failed'] };
    }
  }

  /**
   * Generate a human-friendly quality report for Telegram.
   * @param {string} projectName
   * @param {object} results - { validation, designScore, taskDescription }
   * @returns {string} Formatted report
   */
  generateQualityReport(projectName, results = {}) {
    try {
      const lines = [];
      const v = results.validation || {}, ds = results.designScore || {};
      lines.push(`Quality Report: ${projectName || 'Unknown'}`);
      lines.push('─'.repeat(30));
      if (results.taskDescription) { lines.push(`Task: ${results.taskDescription}`, ''); }
      if (ds.overallScore !== undefined) {
        const verdict = ds.overallScore >= 80 ? 'Great' : ds.overallScore >= 60 ? 'OK' : 'Needs attention';
        lines.push(`Overall: ${ds.overallScore}/100 — ${ds.grade || 'N/A'}`, `Verdict: ${verdict}`, '');
      }
      if (ds.breakdown && Object.keys(ds.breakdown).length > 0) {
        lines.push('Scores by area:');
        for (const [cat, d] of Object.entries(ds.breakdown)) {
          if (d.score != null) {
            const bar = '|'.repeat(Math.round(d.score / 10)) + '.'.repeat(10 - Math.round(d.score / 10));
            lines.push(`  ${cat.replace(/([A-Z])/g, ' $1').trim()}: ${bar} ${d.score}/100`);
          }
        }
        lines.push('');
      }
      if (v.score !== undefined) lines.push(`Code check: ${v.passed ? 'Passed' : 'Issues found'} (${v.score}/100)`);
      if (v.issues && v.issues.length > 0) {
        lines.push('', `Problems (${v.issues.length}):`);
        v.issues.slice(0, 5).forEach(i => lines.push(`  - ${i.substring(0, 120)}`));
        if (v.issues.length > 5) lines.push(`  ... and ${v.issues.length - 5} more`);
      }
      if (v.warnings && v.warnings.length > 0) {
        lines.push('', `Warnings (${v.warnings.length}):`);
        v.warnings.slice(0, 3).forEach(w => lines.push(`  - ${w.substring(0, 120)}`));
        if (v.warnings.length > 3) lines.push(`  ... and ${v.warnings.length - 3} more`);
      }
      if (ds.recommendations && ds.recommendations.length > 0) {
        lines.push('', 'Recommendations:');
        ds.recommendations.slice(0, 3).forEach(r => lines.push(`  - ${r}`));
      }
      lines.push('', `Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`);
      return lines.join('\n');
    } catch (err) {
      console.log('[DesignQuality] generateQualityReport error:', err.message);
      return `Quality Report: ${projectName || 'Unknown'}\n\nReport generation failed: ${err.message}`;
    }
  }

  /**
   * Record a quality metric to the in-memory ring buffer (500 entries).
   * @param {string} category - One of the six quality categories
   * @param {number} score    - 0-100
   * @param {object} [metadata] - { repo, timestamp, taskType }
   * @returns {object|null} The recorded entry, or null on error
   */
  recordMetric(category, score, metadata = {}) {
    try {
      if (!VALID_CATEGORIES.has(category)) { console.log('[DesignQuality] Invalid category:', category); return null; }
      const entry = {
        category, score: Math.max(0, Math.min(100, Number(score) || 0)),
        repo: metadata.repo || null, timestamp: metadata.timestamp || new Date().toISOString(),
        taskType: metadata.taskType || null,
      };
      if (this._metricsSize < MAX_METRICS) {
        this._metrics.push(entry); this._metricsHead = this._metrics.length; this._metricsSize++;
      } else {
        const idx = this._metricsHead % MAX_METRICS;
        this._metrics[idx] = entry; this._metricsHead = idx + 1;
      }
      return entry;
    } catch (err) { console.log('[DesignQuality] recordMetric error:', err.message); return null; }
  }

  /**
   * Get quality metrics summary with optional filtering.
   * @param {object} [options] - { repo, category, days }
   * @returns {{ averageScore: number, trend: string, categoryBreakdown: object, recentScores: number[] }}
   */
  getMetrics(options = {}) {
    try {
      const { repo, category, days } = options;
      const cutoff = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
      // Read ring buffer in order
      let ordered;
      if (this._metricsSize < MAX_METRICS) { ordered = this._metrics.slice(); }
      else { const idx = this._metricsHead % MAX_METRICS; ordered = this._metrics.slice(idx).concat(this._metrics.slice(0, idx)); }
      // Filter
      let filtered = ordered;
      if (repo) filtered = filtered.filter(m => m.repo === repo);
      if (category) filtered = filtered.filter(m => m.category === category);
      if (cutoff) filtered = filtered.filter(m => m.timestamp >= cutoff);
      if (filtered.length === 0) return { averageScore: 0, trend: 'no data', categoryBreakdown: {}, recentScores: [] };
      const avg = Math.round(filtered.reduce((a, m) => a + m.score, 0) / filtered.length);
      // Trend: compare halves
      let trend = 'stable';
      if (filtered.length >= 4) {
        const mid = Math.floor(filtered.length / 2);
        const firstAvg = filtered.slice(0, mid).reduce((a, m) => a + m.score, 0) / mid;
        const secondAvg = filtered.slice(mid).reduce((a, m) => a + m.score, 0) / (filtered.length - mid);
        if (secondAvg - firstAvg > 5) trend = 'improving';
        else if (secondAvg - firstAvg < -5) trend = 'declining';
      }
      // Category breakdown
      const bd = {};
      for (const cat of VALID_CATEGORIES) {
        const cm = filtered.filter(m => m.category === cat);
        if (cm.length > 0) bd[cat] = { average: Math.round(cm.reduce((a, m) => a + m.score, 0) / cm.length), count: cm.length };
      }
      return { averageScore: avg, trend, categoryBreakdown: bd, recentScores: filtered.slice(-10).map(m => m.score) };
    } catch (err) { console.log('[DesignQuality] getMetrics error:', err.message); return { averageScore: 0, trend: 'error', categoryBreakdown: {}, recentScores: [] }; }
  }

  /**
   * Return audit evidence for governance compliance.
   * Formatted for Giquina Group companies (GMH, GACC, GCAP, GQCARS, GSPV).
   * @param {string} repoName
   * @returns {object} Governance evidence object
   */
  getGovernanceEvidence(repoName) {
    try {
      // Lazy-load project registry for company mapping
      let company = null;
      try {
        const regPath = path.join(__dirname, '../../config/project-registry.json');
        if (fs.existsSync(regPath)) {
          const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
          for (const [key, proj] of Object.entries(reg.projects || {})) {
            if (key.toLowerCase() === (repoName || '').toLowerCase() ||
                (proj.repo && proj.repo.toLowerCase().endsWith('/' + (repoName || '').toLowerCase()))) {
              if (proj.companies && proj.companies.length > 0) company = proj.companies.join(', ');
              break;
            }
          }
        }
      } catch (_) { /* company mapping is optional */ }

      const metrics = this.getMetrics({ repo: repoName, days: 90 });
      // Count from buffer
      let ordered;
      if (this._metricsSize < MAX_METRICS) ordered = this._metrics.slice();
      else { const idx = this._metricsHead % MAX_METRICS; ordered = this._metrics.slice(idx).concat(this._metrics.slice(0, idx)); }
      const repoM = ordered.filter(m => m.repo === repoName);
      const reviewsPerformed = repoM.length;
      const issuesFound = repoM.filter(m => m.score < 60).length;
      const issuesResolved = repoM.filter(m => m.score >= 60).length;
      const compliance = metrics.averageScore < 50 ? 'non-compliant' : metrics.averageScore < 70 ? 'needs-improvement' : 'compliant';
      const now = new Date();
      const period = `${new Date(now.getTime() - 90 * 86400000).toISOString().substring(0, 10)} to ${now.toISOString().substring(0, 10)}`;
      return {
        repo: repoName, company, period, qualityScores: metrics.categoryBreakdown,
        reviewsPerformed, issuesFound, issuesResolved, compliance,
        summary: [
          `Quality audit for ${repoName}`, company ? `(${company})` : '', `over ${period}.`,
          `${reviewsPerformed} review(s).`, `Avg score: ${metrics.averageScore}/100 (${metrics.trend}).`,
          `Status: ${compliance}.`
        ].filter(Boolean).join(' '),
      };
    } catch (err) {
      console.log('[DesignQuality] getGovernanceEvidence error:', err.message);
      return { repo: repoName, company: null, period: 'unknown', qualityScores: {}, reviewsPerformed: 0, issuesFound: 0, issuesResolved: 0, compliance: 'unknown', summary: `Evidence unavailable: ${err.message}` };
    }
  }
}

module.exports = new DesignQualityFramework();
