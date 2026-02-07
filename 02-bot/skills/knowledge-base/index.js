/**
 * Knowledge Base Skill - Searchable decision and runbook store
 *
 * Stores and retrieves institutional knowledge — decisions, runbooks,
 * patterns, and notes. Makes tribal knowledge searchable and persistent.
 *
 * Commands:
 *   kb save <text>           - Save a knowledge entry
 *   kb search <query>        - Search knowledge base
 *   kb list                  - List recent entries
 *   kb runbook <name>        - Show or create a runbook
 *   kb tag <id> <tags>       - Add tags to an entry
 *   kb delete <id>           - Delete an entry
 *   kb stats                 - Show knowledge base statistics
 *
 * Storage: JSON file at data/knowledge-base.json with in-memory fallback.
 */
const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs');

const KB_PATH = path.join(__dirname, '../../data/knowledge-base.json');

// Known repo names for auto-tagging
const REPO_NAMES = [
  'judo', 'lusotown', 'armora', 'gqcars-manager', 'gq-cars-driver-app',
  'giquina-accountancy', 'giquina-website', 'giquina-portal', 'moltbook',
  'clawd-bot', 'gq-cars'
];

// Tech keywords for auto-tagging
const TECH_KEYWORDS = [
  'react', 'nextjs', 'node', 'express', 'vercel', 'aws', 'ec2', 'docker',
  'telegram', 'whatsapp', 'github', 'sqlite', 'postgres', 'api', 'auth',
  'jwt', 'oauth', 'deploy', 'ci', 'cd', 'nginx', 'pm2', 'redis', 'ssl',
  'webhook', 'typescript', 'javascript', 'tailwind', 'prisma', 'twilio'
];

class KnowledgeBaseSkill extends BaseSkill {
  name = 'knowledge-base';
  description = 'Searchable store for decisions, runbooks, patterns, and notes';
  priority = 16;

  commands = [
    {
      pattern: /^(?:kb|knowledge)\s+save\s+(.+)$/i,
      description: 'Save a knowledge entry',
      usage: 'kb save <text>'
    },
    {
      pattern: /^(?:kb|knowledge)\s+search\s+(.+)$/i,
      description: 'Search the knowledge base',
      usage: 'kb search <query>'
    },
    {
      pattern: /^(?:kb|knowledge)\s+list$/i,
      description: 'List recent knowledge entries',
      usage: 'kb list'
    },
    {
      pattern: /^(?:kb\s+runbook|runbook)\s+(.+)$/i,
      description: 'Show or create a runbook',
      usage: 'kb runbook <name>'
    },
    {
      pattern: /^(?:kb|knowledge)\s+tag\s+(KB-\d+)\s+(.+)$/i,
      description: 'Add tags to an entry',
      usage: 'kb tag <id> <tags>'
    },
    {
      pattern: /^(?:kb|knowledge)\s+delete\s+(KB-\d+)$/i,
      description: 'Delete a knowledge entry',
      usage: 'kb delete <id>'
    },
    {
      pattern: /^(?:kb|knowledge)\s+stats$/i,
      description: 'Show knowledge base statistics',
      usage: 'kb stats'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.entries = [];
    this.nextId = 1;
    this._loaded = false;
  }

  /**
   * Load entries from disk (lazy, once)
   */
  _loadEntries() {
    if (this._loaded) return;
    this._loaded = true;

    try {
      if (fs.existsSync(KB_PATH)) {
        const raw = fs.readFileSync(KB_PATH, 'utf-8');
        const data = JSON.parse(raw);
        this.entries = Array.isArray(data.entries) ? data.entries : [];
        this.nextId = typeof data.nextId === 'number' ? data.nextId : 1;
      }
    } catch (err) {
      this.log('warn', 'Failed to load knowledge base, starting fresh', err.message);
      this.entries = [];
      this.nextId = 1;
    }
  }

  /**
   * Persist entries to disk
   */
  _saveEntries() {
    try {
      const dir = path.dirname(KB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(KB_PATH, JSON.stringify({ entries: this.entries, nextId: this.nextId }, null, 2));
    } catch (err) {
      this.log('error', 'Failed to save knowledge base', err.message);
    }
  }

  /**
   * Auto-detect entry type from content
   */
  _detectType(text) {
    const lower = text.toLowerCase();
    if (/\b(decided|chose|chosen|because|decision|rationale)\b/.test(lower)) return 'decision';
    if (/\b(step\s+\d|^\d+[\.\)]\s)/m.test(text) || /\b(step 1|step 2)\b/i.test(lower)) return 'runbook';
    if (/\b(pattern:|approach:|always|convention|rule:)\b/.test(lower)) return 'pattern';
    return 'note';
  }

  /**
   * Auto-extract title from content (first sentence or first 60 chars)
   */
  _extractTitle(text) {
    const firstLine = text.split('\n')[0].trim();
    // Try to get first sentence
    const sentenceMatch = firstLine.match(/^(.+?[.!?])\s/);
    if (sentenceMatch && sentenceMatch[1].length <= 80) {
      return sentenceMatch[1];
    }
    if (firstLine.length <= 60) return firstLine;
    return firstLine.substring(0, 57) + '...';
  }

  /**
   * Auto-extract tags from content
   */
  _extractTags(text, repo) {
    const lower = text.toLowerCase();
    const tags = [];

    // Check repo names
    for (const name of REPO_NAMES) {
      if (lower.includes(name)) tags.push(name);
    }

    // Check tech keywords
    for (const kw of TECH_KEYWORDS) {
      if (lower.includes(kw) && !tags.includes(kw)) tags.push(kw);
    }

    // Add repo from context if provided and not already tagged
    if (repo && !tags.includes(repo.toLowerCase())) {
      tags.push(repo.toLowerCase());
    }

    return tags.slice(0, 8); // Cap at 8 tags
  }

  /**
   * Score a single entry against a search query
   */
  _scoreEntry(entry, queryWords) {
    let score = 0;
    const titleLower = (entry.title || '').toLowerCase();
    const contentLower = (entry.content || '').toLowerCase();
    const query = queryWords.join(' ');

    // Exact match in title: 10 points
    if (titleLower.includes(query)) score += 10;

    // Word matches in title: 5 points each
    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 5;
    }

    // Tag match: 3 points each
    for (const word of queryWords) {
      if ((entry.tags || []).some(t => t.toLowerCase().includes(word))) score += 3;
    }

    // Content match: 1 point per occurrence
    for (const word of queryWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = contentLower.match(regex);
      if (matches) score += matches.length;
    }

    return score;
  }

  /**
   * Get a content snippet around the first match
   */
  _getSnippet(content, queryWords, maxLen = 100) {
    const lower = content.toLowerCase();
    let bestPos = 0;

    for (const word of queryWords) {
      const idx = lower.indexOf(word);
      if (idx !== -1) { bestPos = idx; break; }
    }

    const start = Math.max(0, bestPos - 20);
    const end = Math.min(content.length, start + maxLen);
    let snippet = content.substring(start, end).replace(/\n/g, ' ').trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Format a date for display
   */
  _formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'unknown';
    }
  }

  /**
   * Type icons
   */
  _typeIcon(type) {
    const icons = { decision: '\u{1F4CB}', runbook: '\u{1F4D6}', pattern: '\u{1F501}', note: '\u{1F4DD}' };
    return icons[type] || '\u{1F4DD}';
  }

  // ============ Command Execution ============

  async execute(command, context) {
    this._loadEntries();

    const parsed = this.parseCommand(command);
    const raw = parsed.raw;
    const lower = raw.toLowerCase();

    // kb save <text>
    const saveMatch = raw.match(/^(?:kb|knowledge)\s+save\s+(.+)$/i);
    if (saveMatch) return this._handleSave(saveMatch[1], context);

    // kb search <query>
    const searchMatch = raw.match(/^(?:kb|knowledge)\s+search\s+(.+)$/i);
    if (searchMatch) return this._handleSearch(searchMatch[1]);

    // kb list
    if (/^(?:kb|knowledge)\s+list$/i.test(lower)) return this._handleList();

    // kb runbook <name> or runbook <name>
    const runbookMatch = raw.match(/^(?:kb\s+runbook|runbook)\s+(.+)$/i);
    if (runbookMatch) return this._handleRunbook(runbookMatch[1]);

    // kb tag <id> <tags>
    const tagMatch = raw.match(/^(?:kb|knowledge)\s+tag\s+(KB-\d+)\s+(.+)$/i);
    if (tagMatch) return this._handleTag(tagMatch[1], tagMatch[2]);

    // kb delete <id>
    const deleteMatch = raw.match(/^(?:kb|knowledge)\s+delete\s+(KB-\d+)$/i);
    if (deleteMatch) return this._handleDelete(deleteMatch[1]);

    // kb stats
    if (/^(?:kb|knowledge)\s+stats$/i.test(lower)) return this._handleStats();

    return this.error('Unknown knowledge base command. Try: kb save, kb search, kb list, kb stats');
  }

  /**
   * Save a new knowledge entry
   */
  _handleSave(text, context) {
    const content = text.trim();
    if (!content) {
      return this.error('Please provide content to save.', null, {
        suggestion: 'kb save We decided to use NextAuth because it handles OAuth natively'
      });
    }

    const type = this._detectType(content);
    const title = this._extractTitle(content);
    const repo = context.autoRepo || null;
    const tags = this._extractTags(content, repo);
    const now = new Date().toISOString();
    const id = `KB-${String(this.nextId).padStart(3, '0')}`;

    const entry = {
      id,
      type,
      title,
      content,
      tags,
      repo: repo || null,
      createdAt: now,
      updatedAt: now,
      searchTerms: `${title} ${content} ${tags.join(' ')}`.toLowerCase()
    };

    this.entries.push(entry);
    this.nextId++;
    this._saveEntries();

    const icon = this._typeIcon(type);
    let msg = `*Knowledge Saved* ${icon}\n`;
    msg += '\u2501'.repeat(30) + '\n\n';
    msg += `*ID:* \`${id}\`\n`;
    msg += `*Type:* ${type}\n`;
    msg += `*Title:* ${title}\n`;
    if (tags.length > 0) {
      msg += `*Tags:* ${tags.map(t => '#' + t).join(', ')}\n`;
    }
    if (repo) {
      msg += `*Repo:* ${repo}\n`;
    }
    msg += `\n_Use "kb search" to find entries or "kb tag ${id} <tags>" to add more tags_`;

    this.log('info', `Saved entry ${id} [${type}]: ${title}`);
    return this.success(msg);
  }

  /**
   * Search knowledge base with fuzzy scoring
   */
  _handleSearch(query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return this.error('Please provide a search query.', null, {
        suggestion: 'kb search authentication'
      });
    }

    const queryWords = trimmed.split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) {
      return this.error('Search query too short. Use at least one word with 2+ characters.');
    }

    const scored = this.entries
      .map(entry => ({ entry, score: this._scoreEntry(entry, queryWords) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (scored.length === 0) {
      let msg = `*No results for "${query}"*\n\n`;
      msg += 'Try:\n';
      msg += '\u2022 Different keywords\n';
      msg += '\u2022 `kb list` to browse recent entries\n';
      msg += '\u2022 `kb save <text>` to add new knowledge';
      return this.success(msg);
    }

    let msg = `*Knowledge Base Search:* "${query}"\n`;
    msg += '\u2501'.repeat(30) + '\n\n';

    for (const { entry } of scored) {
      const icon = this._typeIcon(entry.type);
      const snippet = this._getSnippet(entry.content, queryWords);
      msg += `${icon} \`${entry.id}\` [${entry.type}] *${entry.title}*\n`;
      msg += `  "${snippet}"\n`;
      if (entry.tags.length > 0) {
        msg += `  Tags: ${entry.tags.map(t => '#' + t).join(', ')}\n`;
      }
      msg += '\n';
    }

    msg += `_Found ${scored.length} result(s)_`;

    return this.success(msg);
  }

  /**
   * List recent entries
   */
  _handleList() {
    if (this.entries.length === 0) {
      return this.success(
        '*Knowledge Base is empty*\n\n' +
        'Start building your knowledge base:\n' +
        '\u2022 `kb save <text>` \u2014 Save a decision, runbook, pattern, or note\n' +
        '\u2022 `kb runbook <name>` \u2014 Create a runbook'
      );
    }

    const sorted = [...this.entries].sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    // Group by type if > 15 entries
    if (sorted.length > 15) {
      return this._handleListGrouped(sorted);
    }

    const recent = sorted.slice(0, 10);
    let msg = '*Knowledge Base \u2014 Recent Entries*\n';
    msg += '\u2501'.repeat(30) + '\n\n';

    for (const entry of recent) {
      const icon = this._typeIcon(entry.type);
      const date = this._formatDate(entry.updatedAt);
      msg += `${icon} \`${entry.id}\` [${entry.type}] *${entry.title}*\n`;
      msg += `  _${date}_\n\n`;
    }

    msg += '\u2501'.repeat(30) + '\n';
    msg += `_Showing ${recent.length} of ${this.entries.length} entries_\n\n`;
    msg += 'Use `kb search <query>` to find specific entries';

    return this.success(msg);
  }

  /**
   * List entries grouped by type (for larger knowledge bases)
   */
  _handleListGrouped(sorted) {
    const groups = {};
    for (const entry of sorted) {
      if (!groups[entry.type]) groups[entry.type] = [];
      groups[entry.type].push(entry);
    }

    let msg = '*Knowledge Base \u2014 By Category*\n';
    msg += '\u2501'.repeat(30) + '\n\n';

    for (const type of ['decision', 'runbook', 'pattern', 'note']) {
      const items = groups[type];
      if (!items || items.length === 0) continue;

      const icon = this._typeIcon(type);
      msg += `${icon} *${type.charAt(0).toUpperCase() + type.slice(1)}s* (${items.length})\n`;

      const shown = items.slice(0, 5);
      for (const entry of shown) {
        msg += `  \`${entry.id}\` ${entry.title}\n`;
      }
      if (items.length > 5) {
        msg += `  _...and ${items.length - 5} more_\n`;
      }
      msg += '\n';
    }

    msg += '\u2501'.repeat(30) + '\n';
    msg += `_${sorted.length} total entries_\n\n`;
    msg += 'Use `kb search <query>` to find specific entries';

    return this.success(msg);
  }

  /**
   * Show or offer to create a runbook
   */
  _handleRunbook(name) {
    const normalized = name.trim().toLowerCase();

    // Search for existing runbook by name
    const runbook = this.entries.find(e =>
      e.type === 'runbook' &&
      (e.title.toLowerCase().includes(normalized) ||
       e.searchTerms.includes(normalized))
    );

    if (runbook) {
      let msg = `*Runbook: ${runbook.title}*\n`;
      msg += '\u2501'.repeat(30) + '\n';
      msg += `_Last updated: ${this._formatDate(runbook.updatedAt)}_\n\n`;
      msg += runbook.content + '\n\n';
      msg += '\u2501'.repeat(30) + '\n';
      if (runbook.tags.length > 0) {
        msg += `Tags: ${runbook.tags.map(t => '#' + t).join(', ')}\n`;
      }
      msg += `ID: \`${runbook.id}\``;
      return this.success(msg);
    }

    // No runbook found — offer to create
    let msg = `*No runbook found for "${name}"*\n\n`;
    msg += 'To create one, save it with numbered steps:\n\n';
    msg += '`kb save Runbook: ' + name + '\n';
    msg += 'Step 1: First step here\n';
    msg += 'Step 2: Second step here\n';
    msg += 'Step 3: Third step here`\n\n';
    msg += '_The type will be auto-detected as "runbook" from the numbered steps._';

    return this.success(msg);
  }

  /**
   * Add tags to an existing entry
   */
  _handleTag(id, tagString) {
    const entry = this.entries.find(e => e.id.toUpperCase() === id.toUpperCase());
    if (!entry) {
      return this.error(`Entry ${id} not found.`, null, {
        suggestion: 'Use "kb list" to see available entries'
      });
    }

    const newTags = tagString.split(/[\s,]+/)
      .map(t => t.replace(/^#/, '').toLowerCase().trim())
      .filter(t => t.length > 0);

    if (newTags.length === 0) {
      return this.error('Please provide at least one tag.', null, {
        suggestion: 'kb tag KB-001 auth deploy production'
      });
    }

    // Merge without duplicates
    const existing = new Set(entry.tags.map(t => t.toLowerCase()));
    let added = 0;
    for (const tag of newTags) {
      if (!existing.has(tag)) {
        entry.tags.push(tag);
        existing.add(tag);
        added++;
      }
    }

    entry.updatedAt = new Date().toISOString();
    entry.searchTerms = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
    this._saveEntries();

    let msg = `*Tags Updated for ${entry.id}*\n\n`;
    msg += `*${entry.title}*\n`;
    msg += `Tags: ${entry.tags.map(t => '#' + t).join(', ')}\n\n`;
    msg += `_Added ${added} new tag(s)_`;

    this.log('info', `Tagged ${entry.id} with ${newTags.join(', ')}`);
    return this.success(msg);
  }

  /**
   * Delete an entry by ID
   */
  _handleDelete(id) {
    const idx = this.entries.findIndex(e => e.id.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return this.error(`Entry ${id} not found.`, null, {
        suggestion: 'Use "kb list" to see available entries'
      });
    }

    const removed = this.entries.splice(idx, 1)[0];
    this._saveEntries();

    let msg = `*Deleted ${removed.id}*\n\n`;
    msg += `[${removed.type}] ${removed.title}\n\n`;
    msg += '_This action cannot be undone._';

    this.log('info', `Deleted entry ${removed.id}: ${removed.title}`);
    return this.success(msg);
  }

  /**
   * Show knowledge base statistics
   */
  _handleStats() {
    if (this.entries.length === 0) {
      return this.success(
        '*Knowledge Base Stats*\n\n' +
        'No entries yet. Get started with `kb save <text>`'
      );
    }

    // Count by type
    const typeCounts = {};
    const tagCounts = {};
    const repoCounts = {};

    for (const entry of this.entries) {
      typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
      if (entry.repo) {
        repoCounts[entry.repo] = (repoCounts[entry.repo] || 0) + 1;
      }
      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // Top tags (sorted by frequency)
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Most recently updated
    const recentlyUpdated = [...this.entries]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);

    let msg = '*Knowledge Base Stats*\n';
    msg += '\u2501'.repeat(30) + '\n\n';

    msg += `*Total entries:* ${this.entries.length}\n\n`;

    // By type
    msg += '*By Type:*\n';
    for (const type of ['decision', 'runbook', 'pattern', 'note']) {
      const count = typeCounts[type] || 0;
      if (count > 0) {
        const icon = this._typeIcon(type);
        msg += `  ${icon} ${type}: ${count}\n`;
      }
    }
    msg += '\n';

    // Top tags
    if (topTags.length > 0) {
      msg += '*Top Tags:*\n';
      for (const [tag, count] of topTags) {
        msg += `  #${tag} (${count})\n`;
      }
      msg += '\n';
    }

    // By repo
    const repoEntries = Object.entries(repoCounts);
    if (repoEntries.length > 0) {
      msg += '*By Repo:*\n';
      for (const [repo, count] of repoEntries.sort((a, b) => b[1] - a[1])) {
        msg += `  ${repo}: ${count}\n`;
      }
      msg += '\n';
    }

    // Recently updated
    msg += '*Recently Updated:*\n';
    for (const entry of recentlyUpdated) {
      msg += `  \`${entry.id}\` ${entry.title} \u2014 _${this._formatDate(entry.updatedAt)}_\n`;
    }

    return this.success(msg);
  }

  async initialize() {
    await super.initialize();
    this._loadEntries();
    this.log('info', `Knowledge base loaded: ${this.entries.length} entries`);
  }

  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'knowledge',
      provider: 'JSON file',
      entryCount: this.entries.length
    };
  }
}

module.exports = KnowledgeBaseSkill;
