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

  /**
   * Route a message, optionally using chat context for auto-completion
   * @param {string} message - The user message
   * @param {Object} [context] - Optional context from chat-registry
   * @param {string} [context.autoRepo] - Auto-context repo name
   * @param {string} [context.autoCompany] - Auto-context company code
   * @returns {Promise<string>} The routed command
   */
  async route(message, context = {}) {
    // Skip if already looks like a command
    if (this.looksLikeCommand(message)) {
      // Even for commands, apply auto-context if repo name is missing
      return this.applyAutoContext(message, context);
    }

    // Don't route conversational questions — let AI handle them naturally
    const conversationalPatterns = [
      /^how long/i, /^when will/i, /^what about/i, /^can you also/i,
      /^will (it|this|that)/i, /^is (it|this|that)/i, /^what if/i,
      /^why (is|did|does|would|should|can)/i, /^how (is|are|do|does|did|much|many)/i,
      /^what (is|are|do|does|did|would|should|happened)/i,
      /^(sounds good|ok |okay |got it|understood|makes sense|perfect|great|nice|cool|thanks|thank)/i,
      /\?$/ // Any message ending with a question mark
    ];
    if (conversationalPatterns.some(p => p.test(message.trim()))) {
      console.log(`[SmartRouter] Conversational message, passing through: "${message.substring(0, 40)}"`);
      return message;
    }

    // Don't route coding/development instructions — let AI handle them
    // These are feature requests, bug fixes, UI changes, etc. that need AI planning
    const codingPatterns = [
      /^add (a |the |an )?/i,           // "add a bottom nav bar", "add login"
      /^(make|change|update|modify|improve|refactor|redesign)/i,
      /^(fix|debug|resolve|patch|repair)/i,
      /^(remove|delete|hide|disable) (the |a |an )?/i,
      /^(implement|integrate|connect|wire|hook|set\s*up)/i,
      /^(style|theme|color|design|layout|animate)/i,
      /^(move|reorganize|restructure|split|merge|combine)/i,
      /^(replace|swap|substitute|convert|migrate|upgrade)/i,
      /^(optimize|speed up|improve performance|cache|lazy)/i,
      /^(write|code|program|develop|scaffold)/i,
      /\b(navigation|navbar|sidebar|header|footer|button|form|modal|page|component|feature)\b/i,
      /\b(like|similar to|same as|copy from|based on)\b.*\b(app|project|repo|site)\b/i,
    ];
    if (codingPatterns.some(p => p.test(message.trim()))) {
      console.log(`[SmartRouter] Coding instruction, passing to AI: "${message.substring(0, 60)}"`);
      return message;
    }

    // Check cache (include context in cache key for auto-context)
    const cacheKey = context.autoRepo
      ? `${message.toLowerCase()}|repo:${context.autoRepo}`
      : message.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.cacheMaxAge) {
      console.log(`[SmartRouter] Cache hit: "${message}" -> "${cached.command}"`);
      return cached.command;
    }

    // Try pattern matching first (fast)
    const patternMatch = this.patternMatch(message, context);
    if (patternMatch) {
      console.log(`[SmartRouter] Pattern match: "${message}" -> "${patternMatch}"`);
      this.cache.set(cacheKey, { command: patternMatch, time: Date.now() });
      return patternMatch;
    }

    // Use AI for complex queries (slower but smarter)
    if (this.claude) {
      const aiCommand = await this.aiRoute(message, context);
      if (aiCommand && aiCommand !== message) {
        console.log(`[SmartRouter] AI route: "${message}" -> "${aiCommand}"`);
        this.cache.set(cacheKey, { command: aiCommand, time: Date.now() });
        return aiCommand;
      }
    }

    return message; // Return original if can't route
  }

  /**
   * Apply auto-context to commands that need a repo/company but don't have one
   * @param {string} command - The command to check
   * @param {Object} context - Context with autoRepo/autoCompany
   * @returns {string} Command with auto-context applied if needed
   */
  applyAutoContext(command, context) {
    if (!context.autoRepo && !context.autoCompany) {
      return command;
    }

    const cmdLower = command.toLowerCase().trim();

    // Commands that need a repo name - check if they're missing one
    const repoCommands = [
      /^deploy$/i,
      /^run tests?$/i,
      /^logs$/i,
      /^restart$/i,
      /^build$/i,
      /^install$/i,
      /^project status$/i,
      /^readme$/i,
      /^project files$/i
    ];

    // If we have auto-repo context and command needs one
    if (context.autoRepo) {
      for (const pattern of repoCommands) {
        if (pattern.test(cmdLower)) {
          const enhanced = `${command} ${context.autoRepo}`;
          console.log(`[SmartRouter] Auto-context: "${command}" -> "${enhanced}"`);
          return enhanced;
        }
      }
    }

    // Commands that need a company code
    const companyCommands = [
      /^deadlines$/i,
      /^company$/i,
      /^expenses$/i
    ];

    // If we have auto-company context and command needs one
    if (context.autoCompany) {
      for (const pattern of companyCommands) {
        if (pattern.test(cmdLower)) {
          const enhanced = `${command} ${context.autoCompany}`;
          console.log(`[SmartRouter] Auto-context: "${command}" -> "${enhanced}"`);
          return enhanced;
        }
      }
    }

    return command;
  }

  looksLikeCommand(msg) {
    const trimmed = msg.trim();
    const commandPatterns = [
      // Core commands
      /^(help|status|deadlines|expenses|companies|list repos)/i,
      // Action commands — only exact skill commands, not coding instructions
      /^(review pr|search tasks?|read file|analyze\s+\w+$)/i,
      // Domain commands
      /^(company|governance|intercompany|workflows|loans|ic balance)/i,
      // Direct company code queries
      /^(company number|deadlines)\s+[A-Z]{2,}/i,
      // Already structured
      /^(summary|receipts|pending|due)/i,
      // Project context commands
      /^(project status|readme|project files|switch to|my repos)/i,
      // Remote execution commands
      /^(run tests|deploy|logs|restart|build|install|exec)/i,
      // Explicit create project command (not "create a feature")
      /^create new project\s+\w+$/i,
    ];
    return commandPatterns.some(p => p.test(trimmed));
  }

  patternMatch(msg, context = {}) {
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
      { match: /^analyze\s+(\S+)$/i, command: (m) => `analyze ${m[1]}` },
      { match: /^create\s+(a\s+)?new\s+(project|repo)\s+(\S+)$/i, command: (m) => `create new project ${m[3]}` },
      { match: /^new\s+repo\s+(\S+)$/i, command: (m) => `create new project ${m[1]}` },

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

      // === PROJECT CONTEXT ===
      { match: /what.*(left|remaining|todo).*(on|for|in)\s+(.+)/i, command: (m) => `project status ${m[3].trim()}` },
      { match: /project\s+status\s+(.+)/i, command: (m) => `project status ${m[1]}` },
      { match: /(show|get).*(readme|about)\s+(.+)/i, command: (m) => `readme ${m[3].trim()}` },
      { match: /what('?s| is)\s+(.+)\s+about/i, command: (m) => `readme ${m[2].trim()}` },
      { match: /(files|structure)\s+(in|of|for)\s+(.+)/i, command: (m) => `project files ${m[3].trim()}` },
      { match: /switch\s+to\s+(.+)/i, command: (m) => `switch to ${m[1].trim()}` },
      { match: /work(ing)?\s+on\s+(.+)/i, command: (m) => `switch to ${m[2].trim()}` },
      { match: /all\s*(my)?\s*repos/i, command: 'my repos' },
      { match: /list\s*all\s*repos/i, command: 'my repos' },
      { match: /what\s*(repos?|projects?)\s+do\s+i\s+have/i, command: 'my repos' },
      { match: /what('?s| is)\s+left(\s+to\s+do)?$/i, command: 'project status' },
      { match: /todo\s+list$/i, command: 'project status' },

      // === REMOTE EXECUTION ===
      { match: /run\s+tests?\s+(on\s+)?(.+)/i, command: (m) => `run tests ${m[2].trim()}` },
      { match: /test\s+(.+)/i, command: (m) => `run tests ${m[1].trim()}` },
      { match: /deploy\s+(.+?)(\s+to\s+prod(uction)?)?$/i, command: (m) => `deploy ${m[1].trim()}` },
      { match: /push\s+(.+)\s+live/i, command: (m) => `deploy ${m[1].trim()}` },
      { match: /(check|show|view)\s+logs?\s+(for\s+)?(.+)/i, command: (m) => `logs ${m[3].trim()}` },
      { match: /restart\s+(.+)/i, command: (m) => `restart ${m[1].trim()}` },
      { match: /rebuild\s+(.+)/i, command: (m) => `build ${m[1].trim()}` },

      // === VOICE COMMANDS ===
      { match: /what\s+(do\s+i\s+)?need\s+to\s+do\s+(for\s+)?(.+)?/i, command: (m) => m[3] ? `project status ${m[3].trim()}` : 'project status' },
      { match: /what('?s| is)\s+the\s+status\s+(of\s+)?(.+)?/i, command: (m) => m[3] ? `project status ${m[3].trim()}` : 'status' },
      { match: /what\s+should\s+i\s+work\s+on/i, command: 'project status' },

    ];

    for (const { match, command } of patterns) {
      const result = msg.match(match);
      if (result) {
        // If command is a function, call it with the match result
        let cmd;
        if (typeof command === 'function') {
          cmd = command(result);
        } else {
          cmd = command;
        }
        // Apply auto-context to the matched command
        return this.applyAutoContext(cmd, context);
      }
    }
    return null;
  }

  async aiRoute(message, context = {}) {
    try {
      // Build context hint for AI
      let contextHint = '';
      if (context.autoRepo) {
        contextHint = `\n\nNote: The user is in the context of repo "${context.autoRepo}". If the command needs a repo and none is specified, use "${context.autoRepo}".`;
      } else if (context.autoCompany) {
        contextHint = `\n\nNote: The user is in the context of company "${context.autoCompany}". If the command needs a company and none is specified, use "${context.autoCompany}".`;
      }

      const response = await this.claude.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Convert this natural language to a ClawdBot command. Reply with ONLY the command, nothing else. If it doesn't match any command, reply with the original message exactly.

IMPORTANT: If the message is a conversational question, follow-up, or acknowledgment (not a command), return the ORIGINAL message unchanged. Do NOT force it into a command. Examples of conversational messages that should be returned unchanged: "How long will it take?", "What about the other one?", "Can you explain more?", "Sounds good", "Thanks", "Why did that happen?", any question mark ending message that isn't clearly requesting a specific command action.

Available commands:
- deadlines, deadlines <COMPANY_CODE>
- companies, company <CODE>, company number <CODE>
- expenses, summary, pending receipts
- list repos, analyze <repo>, create new project <name>
- can I <action>?, governance <topic>
- intercompany, loans, ic balance
- workflows, workflows pending
- help, status
- project status <repo>, readme <repo>, project files <repo>
- my repos, switch to <repo>, active project
- run tests <repo>, deploy <repo>, logs <repo>
- restart <repo>, build <repo>, install <repo>

Company codes: GMH, GACC, GCAP, GQCARS, GSPV${contextHint}

User message: "${message}"

Command:`
        }]
      });

      const aiCommand = response.content[0].text.trim();

      // Basic validation - don't return nonsense
      if (aiCommand.length > 100 || aiCommand.includes('\n')) {
        return null;
      }

      // Apply auto-context to AI-generated command as well
      return this.applyAutoContext(aiCommand, context);
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
