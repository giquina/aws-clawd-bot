// hooks/smart-router.js
// Smart natural language routing - converts casual messages to structured commands
// before they hit the skills framework

const Anthropic = require('@anthropic-ai/sdk');

class SmartRouter {
  constructor() {
    this.claude = null;
    this.cache = new Map(); // Cache recent translations
    this.cacheMaxAge = 5 * 60 * 1000; // 5 min cache
    this.cacheMaxSize = 500; // Prevent unbounded growth
    this.aiTimeoutMs = 5000; // 5s timeout for AI calls
    this.routeMetrics = { patternHits: 0, aiHits: 0, passthroughs: 0, cacheHits: 0, pronounResolutions: 0, multiIntents: 0 };

    // Dynamic skill commands - populated from skill registry
    this._dynamicCommands = null;
    this._dynamicCommandsAge = 0;
    this._dynamicCommandsTTL = 60 * 1000; // Refresh every 60s

    // Multi-intent: stores remaining intents after routing the first one
    this.lastMultiIntentResult = null;
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
    if (!message || typeof message !== 'string') {
      return message;
    }

    let trimmed = message.trim();
    if (!trimmed) return message;

    // Clear previous multi-intent result
    this.lastMultiIntentResult = null;

    // === STEP 0a: Conversation threading — record entity mentions ===
    if (context.chatId) {
      try {
        const conversationThread = require('../lib/conversation-thread');
        conversationThread.detectAndRecord(context.chatId, trimmed);
      } catch (e) { /* conversation-thread not available */ }
    }

    // === STEP 0b: Pronoun resolution — resolve "it", "them", "again", etc. ===
    if (context.chatId) {
      try {
        const conversationThread = require('../lib/conversation-thread');
        const resolved = conversationThread.resolvePronouns(context.chatId, trimmed);
        if (resolved !== trimmed) {
          this.routeMetrics.pronounResolutions++;
          trimmed = resolved;
        }
      } catch (e) { /* conversation-thread not available */ }
    }

    // === STEP 0c: Multi-intent detection — split compound commands ===
    try {
      const multiIntentParser = require('../lib/multi-intent-parser');
      const multiResult = multiIntentParser.parse(trimmed);
      if (multiResult.isMultiIntent && multiResult.intents.length > 1) {
        this.routeMetrics.multiIntents++;
        // Route the FIRST intent through the pipeline
        trimmed = multiResult.intents[0].text;
        // Store remaining intents for caller to pick up
        this.lastMultiIntentResult = {
          totalIntents: multiResult.intents.length,
          remainingIntents: multiResult.intents.slice(1),
          isSequential: multiResult.intents.some(i => i.isSequential),
          originalMessage: multiResult.originalMessage
        };
        console.log(`[SmartRouter] Multi-intent: ${multiResult.intents.length} intents detected, routing first: "${trimmed}"`);
      }
    } catch (e) { /* multi-intent-parser not available */ }

    // === STEP 1: Check cache first (fastest) ===
    const cacheKey = this._buildCacheKey(trimmed, context);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.cacheMaxAge) {
      this.routeMetrics.cacheHits++;
      console.log(`[SmartRouter] Cache hit: "${trimmed}" -> "${cached.command}"`);
      return cached.command;
    }

    // === STEP 2: Quick question guard ===
    // Messages ending with ? are ALWAYS questions — pass to AI, never pattern match.
    // This prevents "how do I deploy to vercel?" from matching the deploy pattern.
    if (/\?\s*$/.test(trimmed)) {
      this.routeMetrics.passthroughs++;
      console.log(`[SmartRouter] Passthrough (question): "${trimmed.substring(0, 50)}"`);
      return message;
    }

    // === STEP 3: Pattern matching (fast, before guards) ===
    // Pattern matching runs BEFORE passthrough because it catches NL commands like
    // "what are the deadlines" that would otherwise be caught by passthrough.
    const patternMatch = this.patternMatch(trimmed, context);
    if (patternMatch) {
      this.routeMetrics.patternHits++;
      console.log(`[SmartRouter] Pattern match: "${trimmed}" -> "${patternMatch}"`);
      this._cacheSet(cacheKey, patternMatch);
      return patternMatch;
    }

    // === STEP 4: Passthrough guard ===
    // Messages that should go to AI handler, not skills
    if (this._isPassthrough(trimmed)) {
      this.routeMetrics.passthroughs++;
      console.log(`[SmartRouter] Passthrough (conversational): "${trimmed.substring(0, 50)}"`);
      return message;
    }

    // === STEP 5: Conversational build guard ===
    if (this._isConversationalBuild(trimmed)) {
      this.routeMetrics.passthroughs++;
      console.log(`[SmartRouter] Conversational build request, direct to AI: "${trimmed.substring(0, 60)}"`);
      return message;
    }

    // === STEP 6: Already looks like a structured command ===
    if (this.looksLikeCommand(trimmed)) {
      return this.applyAutoContext(trimmed, context);
    }

    // === STEP 7: Coding/dev instructions → AI ===
    if (this._isCodingInstruction(trimmed)) {
      this.routeMetrics.passthroughs++;
      console.log(`[SmartRouter] Coding instruction, passing to AI: "${trimmed.substring(0, 60)}"`);
      return message;
    }

    // === STEP 8: Claude Code patterns ===
    const claudeCodeCmd = this._extractClaudeCodeCommand(trimmed);
    if (claudeCodeCmd !== undefined) {
      return claudeCodeCmd;
    }

    // === STEP 9: AI routing (slowest, last resort) ===
    if (this.claude) {
      const aiCommand = await this.aiRoute(trimmed, context);
      if (aiCommand && aiCommand !== trimmed && aiCommand !== message) {
        this.routeMetrics.aiHits++;
        console.log(`[SmartRouter] AI route: "${trimmed}" -> "${aiCommand}"`);
        this._cacheSet(cacheKey, aiCommand);
        return aiCommand;
      }
    }

    return trimmed; // Return (possibly pronoun-resolved / multi-intent-split) text
  }

  // === GUARDS (extracted for testability) ===

  _isPassthrough(msg) {
    const passthroughPatterns = [
      // Greetings and social
      /^(hey|hi|hello|yo|sup|hiya|morning|evening|afternoon|good\s+(morning|evening|afternoon|night))(\s|!|,|\.)*$/i,
      /^(thanks|thank you|cheers|ta|thx|ty)(\s|!|\.)*$/i,
      /^(ok|okay|sure|cool|nice|great|awesome|perfect|got it|understood|alright|no worries)(\s|!|\.)*$/i,
      /^(yes|no|yeah|nah|yep|nope|yea|na)(\s|!|\.)*$/i,

      // Questions (start with question words)
      /^(where|what|when|who|how|why|which)\s/i,
      /^(can you|could you|would you|will you|do you|are you|is there|is it|are there)\s/i,
      /^(tell me|show me|send me|give me|find me|get me)\s/i,

      // Conversational follow-ups
      /^(how long|when will|what about|what if|why not|why is|how come|how do i|how can i)\s/i,
      /^(will it|is it|does it|can it|should i|do i need)\s/i,
      /^(and |but |also |so |then |what about )/i,

      // Messages ending with question mark
      /\?\s*$/,

      // Design/scope follow-up discussions
      /^(what about|how about|instead of|rather than|maybe we|maybe just)\s/i,
      /^(for now|to start|initially|first|as a v1|as an mvp)\b/i,
    ];

    return passthroughPatterns.some(p => p.test(msg));
  }

  _isConversationalBuild(msg) {
    return /^(hey|hi|let's|lets|i want|i'd like|i need|can you|could you|we should|shall we)\b/i.test(msg) &&
      /\b(build|create|make|develop|implement|design|plan|scaffold|setup|start|prototype)\b/i.test(msg);
  }

  _isCodingInstruction(msg) {
    const codingPatterns = [
      /^add (a |the |an )?/i,
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
      /^(build|create|start|scaffold)\s+(me\s+)?(a|an|the|some)/i,
      /^(let's|lets|i want to|i'd like to)\s+(build|create|make|add|implement)/i,
    ];
    return codingPatterns.some(p => p.test(msg));
  }

  _extractClaudeCodeCommand(msg) {
    if (!/claude\s+code|use\s+the\s+agent|have\s+the\s+agent/i.test(msg)) {
      return undefined; // Not a claude code message at all
    }

    const taskMatch = msg.match(/claude\s+code\s+(?:to\s+)?(.+)/i) ||
                      msg.match(/use\s+the\s+agent\s+to\s+(.+)/i) ||
                      msg.match(/have\s+the\s+agent\s+(.+)/i);

    if (taskMatch) {
      console.log(`[SmartRouter] Claude Code pattern detected: "${msg}"`);
      return `claude code session ${taskMatch[1]}`;
    }

    console.log(`[SmartRouter] Claude Code mention without task, passing to AI`);
    return null; // null = passthrough to AI
  }

  // === CACHE ===

  _buildCacheKey(msg, context) {
    // Normalize: lowercase, collapse whitespace, trim
    const normalized = msg.toLowerCase().replace(/\s+/g, ' ').trim();
    const suffix = context.autoRepo ? `|repo:${context.autoRepo}` :
                   context.autoCompany ? `|co:${context.autoCompany}` : '';
    return `${normalized}${suffix}`;
  }

  _cacheSet(key, command) {
    // Enforce max cache size (LRU-style: just prune oldest entries)
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { command, time: Date.now() });
  }

  /**
   * Apply auto-context to commands that need a repo/company but don't have one
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
      // Remote execution commands (require repo/project after command word)
      /^run tests?\s+\S+/i,
      /^deploy\s+\S+/i,
      /^logs\s+\S+/i,
      /^restart\s+\S+/i,
      /^build\s+\S+$/i,
      /^install\s+\S+/i,
      /^exec\s+/i,
      // Bare repo commands (no args) — only these specific short forms
      /^(deploy|logs|restart|build|install|run tests?)$/i,
      // Explicit create project command (not "create a feature")
      /^create new project\s+\w+$/i,
    ];

    // Also check dynamic commands from skill registry
    if (this._getDynamicCommandPatterns()) {
      const dynamicPatterns = this._getDynamicCommandPatterns();
      if (dynamicPatterns.some(p => p.test(trimmed))) {
        return true;
      }
    }

    return commandPatterns.some(p => p.test(trimmed));
  }

  /**
   * Get dynamic command patterns from skill registry (cached)
   * This ensures newly added skills are recognized as commands
   */
  _getDynamicCommandPatterns() {
    const now = Date.now();
    if (this._dynamicCommands && (now - this._dynamicCommandsAge) < this._dynamicCommandsTTL) {
      return this._dynamicCommands;
    }

    try {
      const registry = require('../skills/skill-registry');
      if (!registry || !registry.skills || registry.skills.size === 0) {
        return null;
      }

      const patterns = [];
      for (const skill of registry.skills.values()) {
        if (skill.commands) {
          for (const cmd of skill.commands) {
            if (cmd.pattern instanceof RegExp) {
              patterns.push(cmd.pattern);
            }
          }
        }
      }

      this._dynamicCommands = patterns.length > 0 ? patterns : null;
      this._dynamicCommandsAge = now;
      return this._dynamicCommands;
    } catch (e) {
      return null;
    }
  }

  patternMatch(msg, context = {}) {
    const patterns = [
      // === DEADLINES === (specific before general)
      { match: /what.*(deadline|due).*(gq\s*cars|gqcars)/i, command: 'deadlines GQCARS' },
      { match: /what.*(deadline|due).*(gmh|holdings)/i, command: 'deadlines GMH' },
      { match: /what.*(deadline|due).*(gacc|accountants)/i, command: 'deadlines GACC' },
      { match: /what.*(deadline|due).*(gcap|capital)/i, command: 'deadlines GCAP' },
      { match: /what.*(deadline|due).*(gspv|spv)/i, command: 'deadlines GSPV' },
      { match: /(upcoming|what).*(deadline|due)/i, command: 'deadlines' },
      { match: /anything\s+due/i, command: 'deadlines' },

      // === COMPANIES === (specific before general)
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

      // === REPOS / GITHUB === (specific before general)
      { match: /all\s*(my)?\s*repos/i, command: 'my repos' },
      { match: /list\s*all\s*repos/i, command: 'my repos' },
      { match: /what\s*(repos?|projects?)\s+do\s+i\s+have/i, command: 'my repos' },
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
      { match: /who\s*(can\s*)?(approve|sign)/i, command: (m) => m[0] },
      { match: /board\s*(approval|meeting)/i, command: 'governance board' },

      // === INTERCOMPANY ===
      { match: /(show|list|what).*(intercompany|ic)\s*(loan|balance)/i, command: 'ic balance' },
      { match: /loan.*between/i, command: 'intercompany loans' },
      { match: /intercompany/i, command: 'intercompany' },

      // === WORKFLOWS ===
      { match: /(pending|active)\s*(workflow|task|approval)/i, command: 'workflows pending' },
      { match: /workflow\s*status/i, command: 'workflows' },

      // === GENERAL / HELP ===
      { match: /what\s*commands/i, command: 'help' },
      { match: /show.*help/i, command: 'help' },

      // === PROJECT CONTEXT ===
      { match: /what.*(left|remaining|todo).*(on|for|in)\s+(.+)/i, command: (m) => `project status ${m[3].trim()}` },
      { match: /project\s+status\s+(.+)/i, command: (m) => `project status ${m[1]}` },
      { match: /(show|get).*(readme|about)\s+(.+)/i, command: (m) => `readme ${m[3].trim()}` },
      { match: /what('?s| is)\s+(.+)\s+about/i, command: (m) => `readme ${m[2].trim()}` },
      { match: /(files|structure)\s+(in|of|for)\s+(.+)/i, command: (m) => `project files ${m[3].trim()}` },
      { match: /switch\s+to\s+(.+)/i, command: (m) => `switch to ${m[1].trim()}` },
      { match: /work(ing)?\s+on\s+(.+)/i, command: (m) => `switch to ${m[2].trim()}` },
      { match: /what('?s| is)\s+left(\s+to\s+do)?$/i, command: 'project status' },
      { match: /todo\s+list$/i, command: 'project status' },

      // === VERCEL DEPLOY === (MUST be before generic deploy — more specific)
      { match: /deploy\s+(\S+)\s+to\s+vercel/i, command: (m) => `vercel deploy ${m[1].trim()}` },
      { match: /vercel\s+deploy\s+(\S+)/i, command: (m) => `vercel deploy ${m[1].trim()}` },
      { match: /push\s+(\S+)\s+to\s+vercel/i, command: (m) => `vercel deploy ${m[1].trim()}` },
      { match: /preview\s+(\S+)\s+on\s+vercel/i, command: (m) => `vercel preview ${m[1].trim()}` },
      { match: /^deploy\s+to\s+vercel/i, command: 'vercel deploy' },
      { match: /^vercel\s+deploy$/i, command: 'vercel deploy' },
      { match: /^push\s+to\s+vercel/i, command: 'vercel deploy' },
      { match: /^deploy\s+(?:this|it)\s+to\s+vercel/i, command: 'vercel deploy' },

      // === REMOTE EXECUTION === (generic deploy AFTER vercel-specific)
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
        let cmd;
        if (typeof command === 'function') {
          cmd = command(result);
        } else {
          cmd = command;
        }
        // Sanitize extracted parameters
        cmd = this._sanitizeCommand(cmd);
        // Apply auto-context to the matched command
        return this.applyAutoContext(cmd, context);
      }
    }
    return null;
  }

  /**
   * Sanitize command parameters to prevent injection
   * Strips shell metacharacters from extracted user input
   */
  _sanitizeCommand(command) {
    if (!command || typeof command !== 'string') return command;
    // Strip dangerous shell characters but preserve safe ones
    return command.replace(/[;`${}|<>&\\]/g, '').trim();
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

      // Build dynamic command list from skill registry if available
      const dynamicCmds = this._buildDynamicCommandList();

      // Race the AI call against a timeout
      const aiPromise = this.claude.messages.create({
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
- vercel deploy <repo>, vercel preview <repo>${dynamicCmds}

Company codes: GMH, GACC, GCAP, GQCARS, GSPV${contextHint}

User message: "${message}"

Command:`
        }]
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI route timeout')), this.aiTimeoutMs)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);
      const aiCommand = response.content[0].text.trim();

      // Validation: don't return nonsense or multiline
      if (aiCommand.length > 100 || aiCommand.includes('\n')) {
        return null;
      }

      // Sanitize the AI-generated command
      const sanitized = this._sanitizeCommand(aiCommand);

      // Apply auto-context to AI-generated command as well
      return this.applyAutoContext(sanitized, context);
    } catch (e) {
      if (e.message === 'AI route timeout') {
        console.warn('[SmartRouter] AI routing timed out, falling back to passthrough');
      } else {
        console.error('[SmartRouter] AI routing failed:', e.message);
      }
      return null;
    }
  }

  /**
   * Build dynamic command list from skill registry for AI prompt
   */
  _buildDynamicCommandList() {
    try {
      const registry = require('../skills/skill-registry');
      if (!registry || !registry.skills || registry.skills.size === 0) {
        return '';
      }

      const extraCmds = [];
      for (const skill of registry.skills.values()) {
        if (skill.commands) {
          for (const cmd of skill.commands) {
            if (cmd.usage && !cmd.usage.includes('(')) {
              extraCmds.push(cmd.usage);
            }
          }
        }
      }

      if (extraCmds.length === 0) return '';

      // Deduplicate and limit to 30 to keep prompt manageable
      const unique = [...new Set(extraCmds)].slice(0, 30);
      return '\n- ' + unique.join('\n- ');
    } catch (e) {
      return '';
    }
  }

  // Clear expired cache entries
  cleanCache() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.cache.entries()) {
      if (now - value.time > this.cacheMaxAge) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  // Get cache stats and routing metrics for debugging
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      maxAge: this.cacheMaxAge,
      aiEnabled: !!this.claude,
      aiTimeoutMs: this.aiTimeoutMs,
      metrics: { ...this.routeMetrics }
    };
  }

  /**
   * Get routing metrics for diagnostics
   */
  getMetrics() {
    const total = this.routeMetrics.patternHits + this.routeMetrics.aiHits +
                  this.routeMetrics.passthroughs + this.routeMetrics.cacheHits;
    return {
      ...this.routeMetrics,
      total,
      patternRate: total > 0 ? ((this.routeMetrics.patternHits / total) * 100).toFixed(1) + '%' : '0%',
      cacheRate: total > 0 ? ((this.routeMetrics.cacheHits / total) * 100).toFixed(1) + '%' : '0%',
      pronounResolutions: this.routeMetrics.pronounResolutions || 0,
      multiIntents: this.routeMetrics.multiIntents || 0,
    };
  }

  /**
   * Reset routing metrics
   */
  resetMetrics() {
    this.routeMetrics = { patternHits: 0, aiHits: 0, passthroughs: 0, cacheHits: 0, pronounResolutions: 0, multiIntents: 0 };
  }
}

module.exports = new SmartRouter();
