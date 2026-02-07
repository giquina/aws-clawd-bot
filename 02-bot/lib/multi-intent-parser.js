/**
 * Multi-Intent Parser
 *
 * Splits compound natural language messages into individual command intents
 * for sequential or parallel execution. Uses pattern-based splitting only
 * (no AI calls) for fast, deterministic parsing.
 *
 * Examples:
 *   "run tests on JUDO and then deploy it" => two sequential intents
 *   "check deadlines for GMH and also show expenses" => two parallel intents
 *   "deploy JUDO but first run tests" => two intents, reversed order
 *
 * @module lib/multi-intent-parser
 */

/**
 * @typedef {Object} Intent
 * @property {string} text - The resolved intent text
 * @property {number} order - Execution order (0-based)
 * @property {string|null} connector - The connector that preceded this intent
 * @property {boolean} isSequential - Whether this intent must run after the previous one
 */

/**
 * @typedef {Object} ParseResult
 * @property {boolean} isMultiIntent - Whether multiple intents were detected
 * @property {string} originalMessage - The original input message
 * @property {Intent[]} intents - Array of parsed intents
 */

class MultiIntentParser {
  constructor() {
    /**
     * Ordered list of connector patterns to split on.
     * Checked in order of specificity (longest/most specific first).
     * Each entry: { pattern, label, sequential, reverse }
     *   - pattern: RegExp matching the connector boundary
     *   - label: human-readable connector name stored on the intent
     *   - sequential: true if order matters between the two parts
     *   - reverse: true if the second part should execute before the first
     */
    this.connectors = [
      { pattern: /\s+but\s+first\s+/i,    label: 'but first',   sequential: true,  reverse: true },
      { pattern: /\s+and\s+then\s+/i,     label: 'and then',    sequential: true,  reverse: false },
      { pattern: /\s+and\s+also\s+/i,     label: 'and also',    sequential: false, reverse: false },
      { pattern: /\s+(?:and\s+)?after\s+that\s+/i, label: 'after that', sequential: true, reverse: false },
      { pattern: /,\s*then\s+/i,          label: ', then',      sequential: true,  reverse: false },
      { pattern: /\.\s+/,                 label: '.',           sequential: true,  reverse: false },
      { pattern: /\s+then\s+/i,           label: 'then',        sequential: true,  reverse: false },
      // " and " is checked last and only when both sides look like commands
      { pattern: /\s+and\s+/i,            label: 'and',         sequential: false, reverse: false, requiresBothVerbs: true },
      // " also " at clause boundary (preceded by comma or as sentence start)
      { pattern: /,?\s+also\s+/i,         label: 'also',        sequential: false, reverse: false, requiresBothVerbs: true },
    ];

    /**
     * Common command verbs that indicate a clause is an actionable intent.
     */
    this.commandVerbs = [
      'run', 'deploy', 'check', 'show', 'list', 'create', 'add', 'remove',
      'delete', 'update', 'fix', 'build', 'test', 'start', 'stop', 'restart',
      'install', 'push', 'pull', 'merge', 'review', 'generate', 'send',
      'get', 'set', 'enable', 'disable', 'configure', 'backup', 'restore',
      'monitor', 'schedule', 'cancel', 'undo', 'redo', 'search', 'find',
      'open', 'close', 'status', 'help', 'remind', 'notify', 'analyze',
      'compare', 'export', 'import', 'reset', 'verify', 'validate',
      'publish', 'browse', 'screenshot', 'research', 'summarize',
    ];

    /**
     * Noun phrases containing "and" that should NOT be split.
     */
    this.andNounPhrases = [
      'pros and cons',
      'back and forth',
      'up and running',
      'search and replace',
      'find and replace',
      'copy and paste',
      'cut and paste',
      'drag and drop',
      'trial and error',
      'rise and fall',
      'come and go',
      'more and more',
      'less and less',
      'again and again',
      'now and then',
      'here and there',
      'bread and butter',
      'black and white',
      'dos and donts',
      'bits and pieces',
      'null and void',
      'safe and sound',
      'sick and tired',
      'front and back',
      'frontend and backend',
      'left and right',
      'read and write',
      'input and output',
      'start and end',
      'begin and end',
      'name and email',
      'username and password',
      'questions and answers',
      'terms and conditions',
    ];

    /**
     * Greeting patterns that indicate the message is conversational, not commands.
     */
    this.greetingPatterns = [
      /^(hi|hello|hey|howdy|greetings|good\s+(morning|afternoon|evening))\b/i,
      /^(what'?s?\s+up|sup|yo)\b/i,
    ];

    /**
     * Pronouns that can be resolved to a previously mentioned noun/project.
     */
    this.resolvablePronouns = [
      { pattern: /\bit\b/gi, type: 'subject' },
      { pattern: /\bthem\b/gi, type: 'object' },
      { pattern: /\btheir\b/gi, type: 'possessive' },
      { pattern: /\bits\b/gi, type: 'possessive' },
      { pattern: /\bthat\b/gi, type: 'demonstrative' },
    ];

    /**
     * Known project/entity names for pronoun resolution.
     * Includes ClawdBot known projects plus Giquina company codes.
     */
    this.knownEntities = [
      'JUDO', 'LusoTown', 'armora', 'gqcars-manager', 'gq-cars-driver-app',
      'giquina-accountancy-direct-filing', 'giquina-accountancy', 'giquina-website',
      'gq-cars', 'giquina-portal', 'moltbook', 'clawd-bot', 'aws-clawd-bot',
      'GMH', 'GACC', 'GCAP', 'GQCARS', 'GSPV',
    ];
  }

  /**
   * Quick check: does this message likely contain multiple intents?
   * Faster than full parse() — use for gating before expensive processing.
   *
   * @param {string} message - The input message
   * @returns {boolean} True if the message likely contains multiple intents
   */
  isMultiIntent(message) {
    if (!message || typeof message !== 'string') return false;

    const trimmed = message.trim();

    // Questions are never multi-intent
    if (/\?\s*$/.test(trimmed)) return false;

    // Greetings are never multi-intent
    if (this.greetingPatterns.some(p => p.test(trimmed))) return false;

    // Check for any connector pattern
    for (const connector of this.connectors) {
      if (connector.pattern.test(trimmed)) {
        // For "and" connector, do a quick verb check on both sides
        if (connector.requiresBothVerbs) {
          const parts = trimmed.split(connector.pattern);
          if (parts.length >= 2) {
            const leftHasVerb = this._containsVerb(parts[0]);
            const rightHasVerb = this._containsVerb(parts[parts.length - 1]);
            if (leftHasVerb && rightHasVerb) return true;
          }
        } else {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Parse a message into multiple intents.
   *
   * @param {string} message - The input message
   * @returns {ParseResult} The parsed result with intents array
   */
  parse(message) {
    if (!message || typeof message !== 'string') {
      return this._singleIntent(message || '');
    }

    const trimmed = message.trim();

    // Guard: empty or too short
    if (trimmed.length < 3) {
      return this._singleIntent(trimmed);
    }

    // Guard: questions
    if (/\?\s*$/.test(trimmed)) {
      return this._singleIntent(trimmed);
    }

    // Guard: greetings
    if (this.greetingPatterns.some(p => p.test(trimmed))) {
      return this._singleIntent(trimmed);
    }

    // Guard: contains protected "and" noun phrase — skip "and" splitting but
    // still allow other connectors
    const lower = trimmed.toLowerCase();
    const hasProtectedAnd = this.andNounPhrases.some(phrase => lower.includes(phrase));

    // Try splitting with each connector (most specific first)
    let rawSegments = [{ text: trimmed, connector: null, sequential: false, reverse: false }];

    for (const conn of this.connectors) {
      // Skip "and" connector if protected noun phrase detected
      if (hasProtectedAnd && conn.label === 'and') continue;

      rawSegments = this._splitSegments(rawSegments, conn);
    }

    // Filter out segments that are too short or don't look like commands
    const validSegments = rawSegments.filter(seg => {
      const words = seg.text.trim().split(/\s+/);
      return words.length >= 2 || this._containsVerb(seg.text);
    });

    // If we still only have one segment, it is a single intent
    if (validSegments.length <= 1) {
      return this._singleIntent(trimmed);
    }

    // Handle "first X, then Y" — if the first segment starts with "first", strip it
    if (validSegments.length >= 2) {
      const firstText = validSegments[0].text.trim();
      if (/^first\s+/i.test(firstText)) {
        validSegments[0].text = firstText.replace(/^first\s+/i, '').trim();
        // Mark all as sequential since "first" implies ordering
        for (let i = 1; i < validSegments.length; i++) {
          validSegments[i].sequential = true;
        }
      }
    }

    // Resolve pronouns across segments
    this._resolvePronouns(validSegments);

    // Build ordering — handle reverse connectors ("but first")
    const ordered = this._buildOrder(validSegments);

    // Build final result
    const intents = ordered.map((seg, idx) => ({
      text: seg.text.trim(),
      order: idx,
      connector: seg.connector,
      isSequential: idx === 0 ? ordered.some(s => s.sequential) : seg.sequential,
    }));

    return {
      isMultiIntent: true,
      originalMessage: message,
      intents,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a single-intent result wrapper.
   *
   * @param {string} text - The original message text
   * @returns {ParseResult}
   * @private
   */
  _singleIntent(text) {
    return {
      isMultiIntent: false,
      originalMessage: text,
      intents: [
        { text: text.trim() || text, order: 0, connector: null, isSequential: false },
      ],
    };
  }

  /**
   * Split existing segments further using a specific connector.
   * Only splits segments that haven't already been split (i.e. the "leaf" segments
   * from previous connector passes).
   *
   * @param {Array} segments - Current segment array
   * @param {Object} conn - Connector definition
   * @returns {Array} Updated segments array
   * @private
   */
  _splitSegments(segments, conn) {
    const result = [];

    for (const seg of segments) {
      const text = seg.text;

      // Don't split inside quoted strings
      if (this._hasUnbalancedQuotes(text)) {
        result.push(seg);
        continue;
      }

      // Attempt split
      const parts = text.split(conn.pattern);

      if (parts.length < 2) {
        result.push(seg);
        continue;
      }

      // For connectors that require both sides to have verbs, validate
      if (conn.requiresBothVerbs) {
        let allValid = true;
        for (const part of parts) {
          if (part.trim().length > 0 && !this._containsVerb(part)) {
            allValid = false;
            break;
          }
        }
        if (!allValid) {
          result.push(seg);
          continue;
        }
      }

      // Filter out empty parts
      const validParts = parts.filter(p => p.trim().length > 0);

      if (validParts.length < 2) {
        result.push(seg);
        continue;
      }

      // Create new segments for each part
      for (let i = 0; i < validParts.length; i++) {
        result.push({
          text: validParts[i].trim(),
          connector: i === 0 ? seg.connector : conn.label,
          sequential: i === 0 ? seg.sequential : conn.sequential,
          reverse: i === 0 ? seg.reverse : conn.reverse,
        });
      }
    }

    return result;
  }

  /**
   * Check if a text fragment contains a command verb.
   *
   * @param {string} text - Text to check
   * @returns {boolean}
   * @private
   */
  _containsVerb(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    return words.some(word => this.commandVerbs.includes(word));
  }

  /**
   * Check if text has unbalanced (odd number of) quotes,
   * indicating we are inside a quoted string.
   *
   * @param {string} text - Text to check
   * @returns {boolean}
   * @private
   */
  _hasUnbalancedQuotes(text) {
    const doubleQuotes = (text.match(/"/g) || []).length;
    const singleQuotes = (text.match(/'/g) || []).length;
    return (doubleQuotes % 2 !== 0) || (singleQuotes % 2 !== 0);
  }

  /**
   * Resolve pronouns in later segments to entities mentioned in earlier ones.
   * Tracks the last mentioned entity (project name, company code) and replaces
   * pronouns like "it", "their", "them" in subsequent segments.
   *
   * @param {Array} segments - Mutable array of segments
   * @private
   */
  _resolvePronouns(segments) {
    let lastEntity = null;

    for (let i = 0; i < segments.length; i++) {
      const text = segments[i].text;

      // Try to find an entity in this segment
      const foundEntity = this._extractEntity(text);
      if (foundEntity) {
        lastEntity = foundEntity;
      }

      // For all segments after the first, resolve pronouns if we have an entity
      if (i > 0 && lastEntity) {
        let resolved = text;
        for (const pronoun of this.resolvablePronouns) {
          // Only replace if the pronoun is actually present
          if (pronoun.pattern.test(resolved)) {
            // Reset regex lastIndex since we're using 'g' flag
            pronoun.pattern.lastIndex = 0;

            if (pronoun.type === 'possessive') {
              // "their expenses" -> "GMH expenses", "its tests" -> "JUDO tests"
              resolved = resolved.replace(pronoun.pattern, lastEntity);
            } else {
              // "deploy it" -> "deploy JUDO", "check them" -> "check JUDO"
              resolved = resolved.replace(pronoun.pattern, lastEntity);
            }
          }
        }
        segments[i].text = resolved;
      }
    }
  }

  /**
   * Extract the first known entity (project/company name) from text.
   *
   * @param {string} text - Text to search
   * @returns {string|null} The entity name, or null if none found
   * @private
   */
  _extractEntity(text) {
    if (!text) return null;

    // Check known entities (case-insensitive match, return original casing)
    for (const entity of this.knownEntities) {
      const regex = new RegExp(`\\b${this._escapeRegex(entity)}\\b`, 'i');
      if (regex.test(text)) {
        // Return the entity as it appeared in our known list (canonical form)
        return entity;
      }
    }

    // Fallback: look for capitalized words that might be project names
    // (words that are all-caps or PascalCase, at least 2 chars)
    const capsMatch = text.match(/\b([A-Z][A-Za-z0-9-]{1,})\b/);
    if (capsMatch) {
      return capsMatch[1];
    }

    return null;
  }

  /**
   * Escape special regex characters in a string.
   *
   * @param {string} str - String to escape
   * @returns {string}
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Re-order segments to handle "reverse" connectors like "but first".
   * Segments marked with reverse=true are moved before the segment they were
   * split from.
   *
   * @param {Array} segments - Array of segments with connector metadata
   * @returns {Array} Reordered segments
   * @private
   */
  _buildOrder(segments) {
    // Collect groups: each reverse segment swaps with its predecessor
    const result = [];
    let i = 0;

    while (i < segments.length) {
      if (segments[i].reverse && result.length > 0) {
        // "but first" — this segment goes before the previous one
        const prev = result.pop();
        result.push({
          ...segments[i],
          reverse: false,
          sequential: true,
        });
        result.push({
          ...prev,
          sequential: true,
        });
      } else {
        result.push(segments[i]);
      }
      i++;
    }

    return result;
  }
}

module.exports = new MultiIntentParser();
