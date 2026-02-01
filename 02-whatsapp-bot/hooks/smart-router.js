// hooks/smart-router.js
// Smart natural language routing - converts casual messages to structured commands
// before they hit the skills framework

const Anthropic = require('@anthropic-ai/sdk');

class SmartRouter {
  constructor() {
    this.claude = null;
    this.cache = new Map(); // Cache recent translations
    this.cacheMaxAge = 5 * 60 * 1000; // 5 min cache
  }

  initialize() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    console.log('[SmartRouter] Initialized');
  }

  async route(message) {
    // Skip if already looks like a command
    if (this.looksLikeCommand(message)) {
      return message;
    }

    // Check cache
    const cached = this.cache.get(message.toLowerCase());
    if (cached && Date.now() - cached.time < this.cacheMaxAge) {
      console.log(`[SmartRouter] Cache hit: "${message}" -> "${cached.command}"`);
      return cached.command;
    }

    // Try pattern matching first (fast)
    const patternMatch = this.patternMatch(message);
    if (patternMatch) {
      console.log(`[SmartRouter] Pattern match: "${message}" -> "${patternMatch}"`);
      this.cache.set(message.toLowerCase(), { command: patternMatch, time: Date.now() });
      return patternMatch;
    }

    // Use AI for complex queries (slower but smarter)
    if (this.claude) {
      const aiCommand = await this.aiRoute(message);
      if (aiCommand && aiCommand !== message) {
        console.log(`[SmartRouter] AI route: "${message}" -> "${aiCommand}"`);
        this.cache.set(message.toLowerCase(), { command: aiCommand, time: Date.now() });
        return aiCommand;
      }
    }

    return message; // Return original if can't route
  }

  looksLikeCommand(msg) {
    const trimmed = msg.trim();
    const commandPatterns = [
      // Core commands
      /^(help|status|deadlines|expenses|companies|list repos)/i,
      // Action commands
      /^(create|edit|fix|review|search|read|analyze)/i,
      // Domain commands
      /^(company|governance|intercompany|workflows|loans|ic balance)/i,
      // Direct company code queries
      /^(company number|deadlines)\s+[A-Z]{2,}/i,
      // Already structured
      /^(summary|receipts|pending|due)/i,
    ];
    return commandPatterns.some(p => p.test(trimmed));
  }

  patternMatch(msg) {
    const patterns = [
      // === DEADLINES ===
      { match: /what.*(deadline|due).*(gq\s*cars|gqcars)/i, command: 'deadlines GQCARS' },
      { match: /what.*(deadline|due).*(gmh|holdings)/i, command: 'deadlines GMH' },
      { match: /what.*(deadline|due).*(gacc|accountants)/i, command: 'deadlines GACC' },
      { match: /what.*(deadline|due).*(gcap|capital)/i, command: 'deadlines GCAP' },
      { match: /what.*(deadline|due).*(gspv|spv)/i, command: 'deadlines GSPV' },
      { match: /(upcoming|what).*(deadline|due)/i, command: 'deadlines' },
      { match: /anything\s+due/i, command: 'deadlines' },

      // === COMPANIES ===
      { match: /company\s*number.*(gq\s*cars|gqcars)/i, command: 'company number GQCARS' },
      { match: /company\s*number.*(capital|gcap)/i, command: 'company number GCAP' },
      { match: /company\s*number.*(holdings|gmh)/i, command: 'company number GMH' },
      { match: /company\s*number.*(accountants|gacc)/i, command: 'company number GACC' },
      { match: /company\s*number.*(spv|gspv)/i, command: 'company number GSPV' },
      { match: /(show|list|what).*(compan|entities)/i, command: 'companies' },
      { match: /tell me about.*(gq\s*cars|gqcars)/i, command: 'company GQCARS' },
      { match: /tell me about.*(capital|gcap)/i, command: 'company GCAP' },
      { match: /tell me about.*(holdings|gmh)/i, command: 'company GMH' },

      // === EXPENSES ===
      { match: /(show|list|what).*(expense|receipt|spending)/i, command: 'expenses' },
      { match: /expense\s*summary/i, command: 'summary' },
      { match: /how much.*spent/i, command: 'summary' },
      { match: /receipt.*pending/i, command: 'pending receipts' },
      { match: /log.*(expense|receipt)/i, command: 'expenses' },

      // === REPOS / GITHUB ===
      { match: /(what|show|list).*(repo|project|repositories)/i, command: 'list repos' },
      { match: /my\s*(repo|project)s/i, command: 'list repos' },
      { match: /analyze\s+(.+)/i, command: (m) => `analyze ${m[1]}` },
      { match: /create.*project\s+(.+)/i, command: (m) => `create new project ${m[1]}` },
      { match: /new\s+repo\s+(.+)/i, command: (m) => `create new project ${m[1]}` },

      // === GOVERNANCE ===
      { match: /can\s*i\s*(pay|declare).*(dividend)/i, command: 'can I declare dividend?' },
      { match: /can\s*i\s*(hire|employ)/i, command: 'can I hire employee?' },
      { match: /can\s*i\s*(issue|create).*(shares)/i, command: 'can I issue shares?' },
      { match: /can\s*i\s*(approve|sign)/i, command: (m) => `can I ${m[0]}?` },
      { match: /who\s*(can\s*)?(approve|sign)/i, command: (m) => m[0] }, // Pass through
      { match: /board\s*(approval|meeting)/i, command: 'governance board' },

      // === INTERCOMPANY ===
      { match: /(show|list|what).*(intercompany|ic)\s*(loan|balance)/i, command: 'ic balance' },
      { match: /loan.*between/i, command: 'intercompany loans' },
      { match: /intercompany/i, command: 'intercompany' },

      // === WORKFLOWS ===
      { match: /(pending|active)\s*(workflow|task|approval)/i, command: 'workflows pending' },
      { match: /workflow\s*status/i, command: 'workflows' },

      // === GENERAL / HELP ===
      { match: /(what|how).*(can you|do you)\s*do/i, command: 'help' },
      { match: /what\s*commands/i, command: 'help' },
      { match: /what.*(capabilities|features|skills)/i, command: 'help' },
      { match: /show.*help/i, command: 'help' },
      { match: /^(hi|hello|hey|yo|sup)$/i, command: 'status' },
      { match: /good\s*(morning|afternoon|evening)/i, command: 'status' },
      { match: /how.*you/i, command: 'status' },

      // === GITHUB/CLAUDE QUESTIONS (common) ===
      { match: /what.*(github|claude|ai).*(do|can)/i, command: 'help' },
      { match: /(tell|show|explain).*(github|claude)/i, command: 'help' },
      { match: /github.*(features|commands|help)/i, command: 'help' },

    ];

    for (const { match, command } of patterns) {
      const result = msg.match(match);
      if (result) {
        // If command is a function, call it with the match result
        if (typeof command === 'function') {
          return command(result);
        }
        return command;
      }
    }
    return null;
  }

  async aiRoute(message) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Convert this natural language to a ClawdBot command. Reply with ONLY the command, nothing else. If it doesn't match any command, reply with the original message exactly.

Available commands:
- deadlines, deadlines <COMPANY_CODE>
- companies, company <CODE>, company number <CODE>
- expenses, summary, pending receipts
- list repos, analyze <repo>, create new project <name>
- can I <action>?, governance <topic>
- intercompany, loans, ic balance
- workflows, workflows pending
- help, status

Company codes: GMH, GACC, GCAP, GQCARS, GSPV

User message: "${message}"

Command:`
        }]
      });

      const aiCommand = response.content[0].text.trim();

      // Basic validation - don't return nonsense
      if (aiCommand.length > 100 || aiCommand.includes('\n')) {
        return null;
      }

      return aiCommand;
    } catch (e) {
      console.error('[SmartRouter] AI routing failed:', e.message);
      return null;
    }
  }

  // Clear expired cache entries
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.time > this.cacheMaxAge) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache stats for debugging
  getCacheStats() {
    return {
      size: this.cache.size,
      maxAge: this.cacheMaxAge,
      aiEnabled: !!this.claude
    };
  }
}

module.exports = new SmartRouter();
