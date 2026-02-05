/**
 * Smart AI Query Router
 *
 * Classifies queries and routes to the best AI provider:
 * - Simple queries → Groq (FREE)
 * - Social/X/Twitter → Grok (xAI) - best for social search
 * - Research/Knowledge → Perplexity - best for research and current info
 * - Planning/Strategy → Claude Opus (THE BRAIN)
 * - Coding/Implementation → Claude Sonnet (THE CODER)
 *
 * Includes spelling tolerance for typos and misspellings.
 * Includes caching for AI responses to reduce API calls and costs.
 * Cache configured via environment variables:
 * - CACHE_ENABLED (default: true)
 * - CACHE_TTL_SECONDS (default: 300)
 * - CACHE_MAX_SIZE (default: 100)
 */

const { CacheManager, hashObject } = require('../lib/cache-manager');
const cacheConfig = require('../lib/cache-config');

class Router {
    constructor(providers, stats) {
        this.providers = providers;
        this.stats = stats;

        // Initialize cache for AI responses with environment-based configuration
        // Environment variables override defaults:
        // - CACHE_ENABLED: Enable/disable caching (default: true)
        // - CACHE_TTL_SECONDS: TTL in seconds (default: 300 = 5 minutes)
        // - CACHE_MAX_SIZE: Max cache entries (default: 100)
        const cacheOptions = cacheConfig.createCacheOptions();
        this.cache = new CacheManager(cacheOptions);
        this.cacheEnabled = this._isCacheEnabled();

        if (this.cacheEnabled) {
            const summary = cacheConfig.getCacheConfigSummary();
            console.log('🔄 AI Response Cache initialized' + summary);
        } else {
            console.log('⏭️  AI Response Cache is disabled');
        }

        // User preferences storage (in-memory, keyed by userId)
        this.userPreferences = new Map();

        // Default mode: balanced (smart routing)
        this.defaultMode = 'balanced';

        // Social media keywords (use Grok - best for X/Twitter)
        this.socialKeywords = [
            'twitter', 'x.com', 'tweet', 'tweets', 'trending',
            'viral', 'social media', 'hashtag', '#',
            'what are people saying', 'what\'s trending',
            'public opinion', 'sentiment', 'social search',
            'influencer', 'followers', 'retweet', 'likes',
            'x search', 'twitter search', 'social buzz'
        ];

        // Research/Knowledge keywords (use Perplexity - best for research)
        this.researchKeywords = [
            'research', 'find information', 'what is', 'how do i',
            'best way to', 'summarize', 'explain', 'knowledge',
            'current', 'latest', 'recent', 'update', 'news',
            'industry', 'market', 'trend', 'analysis', 'compare',
            'learn about', 'tell me about', 'overview', 'define',
            'look up', 'search for', 'find out', 'discover'
        ];

        // Planning/Strategy keywords (use Claude Opus - THE BRAIN)
        this.planningKeywords = [
            'plan', 'strategy', 'architect', 'design system',
            'how should i', 'best approach', 'recommend', 'advise',
            'trade-off', 'tradeoff', 'pros and cons', 'compare approaches',
            'roadmap', 'milestone', 'phase', 'step by step plan',
            'think through', 'reason about', 'consider options',
            'should i use', 'which is better', 'evaluate',
            'long-term', 'scalability', 'future-proof',
            'complex decision', 'weigh options', 'strategic'
        ];

        // Keywords that indicate complex coding queries (use Claude Sonnet)
        this.complexKeywords = [
            // Code operations
            'analyze', 'analyse', 'review', 'debug', 'fix', 'refactor',
            'explain code', 'explain this code', 'improve', 'optimize', 'optimise',
            // Multi-step
            'step by step', 'detailed', 'comprehensive', 'in depth', 'thorough',
            // Code writing
            'write code', 'create function', 'implement', 'build', 'develop',
            'write a', 'create a', 'make a',
            // Technical analysis
            'architecture', 'design pattern', 'best practice', 'security',
            'performance', 'scalability', 'algorithm',
            // File operations
            'read file', 'edit file', 'create file', 'search code',
            // PR/Issue operations
            'review pr', 'fix issue', 'create pr', 'merge',
            // Long-form content
            'documentation', 'readme', 'guide', 'tutorial'
        ];

        // Simple query patterns (use Groq - FREE)
        this.simplePatterns = [
            // Greetings
            /^(hi|hey|hello|yo|sup|hiya|heya|hola|howdy|greetings?)\b/i,
            /^good\s*(morning|afternoon|evening|night)/i,
            /^(thanks|thank you|thx|ty|cheers|ta)\b/i,
            /^(ok|okay|k|kk|alright|sure|yes|no|yep|nope|yeah|nah)\b/i,
            /^(bye|goodbye|later|cya|see ya|gtg)\b/i,
            // Quick questions
            /^(what is|what's|whats|wats)\s+(the\s+)?(time|date|day)/i,
            /^(how are you|how r u|hru|wassup|what's up)/i,
            // Simple commands
            /^(help|status|commands|skills)\b/i,
            // Acknowledgments
            /^(got it|understood|makes sense|i see|cool|nice|great|awesome|perfect)\b/i,
            // Short queries (less than 5 words and no code indicators)
            /^[^`]{1,30}$/  // Short message without code blocks
        ];

        // Patterns that ALWAYS need Claude (override simple)
        this.alwaysClaudePatterns = [
            /```/,                          // Code blocks
            /\bfunction\b.*\(/i,            // Function definitions
            /\bclass\b.*{/i,                // Class definitions
            /\b(import|require|export)\b/i, // Module operations
            /\.(js|ts|py|java|go|rs|rb)\b/i, // File extensions
            /\b(api|endpoint|webhook)\b/i,   // API stuff
            /\b(error|bug|issue|crash)\b.*\b(fix|solve|help)/i, // Error fixing
            /\b(repo|repository|github|git)\b/i, // Git operations
            /<repo>\s*\S+/i,                // Repo commands
            /\b(pr|pull request|merge)\b/i  // PR operations
        ];

        // Common misspellings mapped to correct words
        this.spellCorrections = {
            // Commands
            'hlep': 'help', 'hepl': 'help', 'hep': 'help',
            'stauts': 'status', 'staus': 'status', 'satus': 'status', 'statsu': 'status',
            'comands': 'commands', 'commadns': 'commands', 'commnads': 'commands',
            // Greetings
            'helo': 'hello', 'helllo': 'hello', 'hllo': 'hello',
            'thankyou': 'thank you', 'thnks': 'thanks', 'thnx': 'thanks',
            // Actions
            'analize': 'analyze', 'anaylze': 'analyze', 'anaylse': 'analyse',
            'reveiw': 'review', 'reviwe': 'review', 'reivew': 'review',
            'debg': 'debug', 'deubg': 'debug', 'dbug': 'debug',
            'cretae': 'create', 'craete': 'create', 'creat': 'create',
            'serach': 'search', 'searhc': 'search', 'saerch': 'search',
            'explian': 'explain', 'expalin': 'explain', 'expain': 'explain',
            'wirte': 'write', 'wrtie': 'write', 'wriet': 'write',
            'implment': 'implement', 'impelment': 'implement', 'imlement': 'implement',
            'refacor': 'refactor', 'refatcor': 'refactor', 'refactr': 'refactor',
            'optmize': 'optimize', 'optimze': 'optimize', 'optimise': 'optimize',
            // Common typos
            'teh': 'the', 'adn': 'and', 'hte': 'the', 'waht': 'what',
            'taht': 'that', 'wiht': 'with', 'fro': 'for', 'fo': 'for',
            'wokr': 'work', 'wrok': 'work', 'owrk': 'work',
            'chnage': 'change', 'cahnge': 'change', 'chagne': 'change',
            'fiel': 'file', 'flie': 'file', 'ifle': 'file',
            'coed': 'code', 'ocde': 'code', 'cdoe': 'code',
            'fucntion': 'function', 'funciton': 'function', 'funcion': 'function',
            'eroor': 'error', 'erorr': 'error', 'errro': 'error',
            'isuse': 'issue', 'isuue': 'issue', 'isseu': 'issue',
            'pls': 'please', 'plz': 'please', 'plese': 'please',
            'mispelling': 'misspelling', 'spellign': 'spelling', 'speling': 'spelling',
            'underdtand': 'understand', 'understnad': 'understand', 'udnerstand': 'understand',
            'mistkaes': 'mistakes', 'mistkae': 'mistake', 'mistaeks': 'mistakes',
            'wemistakes': 'we mistakes' // Direct from user's message
        };
    }

    /**
     * Route a query to the appropriate provider
     * @param {string} query - User's query
     * @param {Object} context - Context including userId, history, etc.
     * @returns {Promise<{response: string, provider: string, correctedQuery?: string}>}
     */
    async route(query, context = {}) {
        const { userId = 'default', history = [], forceProvider = null } = context;

        // Get user's preference
        const userPref = this.getUserPreference(userId);

        // Correct spelling first
        const correctedQuery = this.correctSpelling(query);
        const wasCorreted = correctedQuery !== query;

        // If user forces a provider, use it
        if (forceProvider && this.providers[forceProvider]) {
            return await this.executeWithProvider(forceProvider, correctedQuery, context, wasCorreted ? correctedQuery : null);
        }

        // Economy mode: always use Groq (FREE)
        if (userPref.mode === 'economy' && this.providers.groq) {
            return await this.executeWithProvider('groq', correctedQuery, context, wasCorreted ? correctedQuery : null);
        }

        // Quality mode: always use Claude
        if (userPref.mode === 'quality' && this.providers.claude) {
            return await this.executeWithProvider('claude', correctedQuery, context, wasCorreted ? correctedQuery : null);
        }

        // Balanced mode: smart routing
        const classification = this.classifyQuery(correctedQuery);
        const { provider, taskType } = classification;

        // Fallback if preferred provider not available
        const actualProvider = this.providers[provider] ? provider :
                              (this.providers.groq ? 'groq' :
                              (this.providers.claude ? 'claude' : null));

        if (!actualProvider) {
            throw new Error('No AI providers available');
        }

        // Pass taskType to provider for Claude tier selection (Opus vs Sonnet)
        const enhancedContext = { ...context, taskType };

        return await this.executeWithProvider(actualProvider, correctedQuery, enhancedContext, wasCorreted ? correctedQuery : null);
    }

    /**
     * Generate cache key for AI query
     * @param {string} provider - Provider name
     * @param {string} query - User query
     * @param {string} taskType - Task type (optional)
     * @returns {string} Cache key
     */
    generateCacheKey(provider, query, taskType = '') {
        // Use first 200 chars of query + provider + taskType
        const queryPrefix = query.substring(0, 200).toLowerCase().trim();
        return hashObject({ provider, query: queryPrefix, taskType });
    }

    /**
     * Check if query should bypass cache (real-time queries)
     * @param {string} query - User query
     * @returns {boolean} True if should bypass cache
     */
    shouldBypassCache(query) {
        const lowerQuery = query.toLowerCase();

        // Real-time query patterns that should not be cached
        const realTimeKeywords = [
            'now', 'current', 'today', 'latest', 'right now',
            'trending', 'live', 'recent', 'just happened',
            'breaking', 'update', 'status', 'health'
        ];

        // Check for time-sensitive queries
        for (const keyword of realTimeKeywords) {
            if (lowerQuery.includes(keyword)) {
                return true;
            }
        }

        // Check for commands (status, health checks, etc.)
        if (/^(status|health|ping|check)\b/i.test(query)) {
            return true;
        }

        return false;
    }

    /**
     * Execute query with a specific provider
     */
    async executeWithProvider(provider, query, context, correctedQuery) {
        const taskType = context.taskType || '';
        const bypassCache = this.shouldBypassCache(query) || !this.cacheEnabled;

        // Generate cache key
        const cacheKey = this.generateCacheKey(provider, query, taskType);

        // Check cache first (unless caching disabled or bypassing)
        if (!bypassCache && this.cacheEnabled) {
            const cachedResult = this.cache.get(cacheKey);
            if (cachedResult) {
                console.log(`[Router] Cache HIT for ${provider}/${taskType}`);

                // Update cache hit stats
                if (!this.stats[provider].cacheHits) {
                    this.stats[provider].cacheHits = 0;
                }
                this.stats[provider].cacheHits++;

                return {
                    ...cachedResult,
                    cached: true,
                    correctedQuery: correctedQuery
                };
            }
        } else if (this.shouldBypassCache(query)) {
            console.log(`[Router] Bypassing cache for real-time query`);
        }

        try {
            const result = await this.providers[provider].complete(query, context);

            // Update stats
            this.stats[provider].calls++;
            if (result.tokens) {
                this.stats[provider].tokens += result.tokens;
            }
            if (result.cost) {
                this.stats[provider].estimatedCost = (this.stats[provider].estimatedCost || 0) + result.cost;
            }

            // Track Claude tier usage (Opus vs Sonnet)
            if (provider === 'claude' && result.tier) {
                if (result.tier === 'brain') {
                    this.stats.claude.opusCalls = (this.stats.claude.opusCalls || 0) + 1;
                } else {
                    this.stats.claude.sonnetCalls = (this.stats.claude.sonnetCalls || 0) + 1;
                }
            }

            const responseData = {
                response: result.response,
                provider: provider,
                model: result.model,
                tier: result.tier, // brain, coder, or undefined
                tokens: result.tokens,
                cost: result.cost || 0,
                correctedQuery: correctedQuery
            };

            // Cache the result (unless bypassing or caching disabled)
            if (!bypassCache && this.cacheEnabled) {
                this.cache.set(cacheKey, responseData);
                console.log(`[Router] Cached response for ${provider}/${taskType}`);
            }

            return responseData;
        } catch (error) {
            this.stats[provider].errors++;

            // Try fallback chain: claude -> perplexity -> groq -> grok
            const fallbackOrder = ['claude', 'perplexity', 'groq', 'grok'];
            for (const fallback of fallbackOrder) {
                if (fallback !== provider && this.providers[fallback]) {
                    console.log(`[Router] ${provider} failed, falling back to ${fallback}`);
                    return await this.executeWithProvider(fallback, query, context, correctedQuery);
                }
            }

            throw error;
        }
    }

    /**
     * Classify a query to determine the best provider
     * @param {string} query - The user's query
     * @returns {{provider: string, taskType?: string}} - Provider name and optional task type
     */
    classifyQuery(query) {
        const lowerQuery = query.toLowerCase();

        // 1. Check for SOCIAL queries → Grok (if available)
        if (this.providers.grok) {
            for (const keyword of this.socialKeywords) {
                if (lowerQuery.includes(keyword)) {
                    console.log(`[Router] Social query detected: "${keyword}" → Grok`);
                    return { provider: 'grok', taskType: 'social' };
                }
            }
        }

        // 2. Check if query MUST go to Claude (code, technical content)
        for (const pattern of this.alwaysClaudePatterns) {
            if (pattern.test(query)) {
                return { provider: 'claude', taskType: 'coding' };
            }
        }

        // 3. Check for RESEARCH/KNOWLEDGE queries → Perplexity (if available)
        if (this.providers.perplexity) {
            for (const keyword of this.researchKeywords) {
                if (lowerQuery.includes(keyword)) {
                    console.log(`[Router] Research query detected: "${keyword}" → Perplexity`);
                    return { provider: 'perplexity', taskType: 'research' };
                }
            }
        }

        // 4. Check for PLANNING/STRATEGY queries → Claude Opus (THE BRAIN)
        for (const keyword of this.planningKeywords) {
            if (lowerQuery.includes(keyword)) {
                console.log(`[Router] Planning query detected: "${keyword}" → Claude Opus`);
                return { provider: 'claude', taskType: 'planning' };
            }
        }

        // 5. Check for complex CODING keywords → Claude Sonnet
        for (const keyword of this.complexKeywords) {
            if (lowerQuery.includes(keyword)) {
                return { provider: 'claude', taskType: 'coding' };
            }
        }

        // 6. Check if query matches simple patterns → Groq (FREE)
        for (const pattern of this.simplePatterns) {
            if (pattern.test(query)) {
                // But verify it's not actually complex
                if (query.length < 50 && !this.containsCodeIndicators(query)) {
                    return { provider: 'groq', taskType: 'simple' };
                }
            }
        }

        // 7. Word count heuristic: very short = simple → Groq
        const wordCount = query.trim().split(/\s+/).length;
        if (wordCount <= 5 && !this.containsCodeIndicators(query)) {
            return { provider: 'groq', taskType: 'simple' };
        }

        // 8. Long or ambiguous queries → Claude
        if (wordCount > 30) {
            return { provider: 'claude', taskType: 'complex' };
        }

        // 9. Default: Groq for medium-length queries without code indicators
        return this.containsCodeIndicators(query)
            ? { provider: 'claude', taskType: 'coding' }
            : { provider: 'groq', taskType: 'general' };
    }

    /**
     * Check if query contains code-related content
     */
    containsCodeIndicators(query) {
        const codeIndicators = [
            '`', '```', 'function', 'class', 'const ', 'let ', 'var ',
            'import ', 'export ', 'require(', '=>', '()', '{}', '[]',
            '.js', '.ts', '.py', '.java', '.go', 'npm', 'git ',
            'repo ', 'file ', 'code ', 'debug', 'error', 'bug '
        ];

        const lower = query.toLowerCase();
        return codeIndicators.some(indicator => lower.includes(indicator.toLowerCase()));
    }

    /**
     * Correct common spelling mistakes
     * @param {string} query - Original query
     * @returns {string} - Corrected query
     */
    correctSpelling(query) {
        let corrected = query;

        // Apply known corrections
        for (const [wrong, right] of Object.entries(this.spellCorrections)) {
            // Use word boundary regex for whole word matching
            const regex = new RegExp(`\\b${this.escapeRegex(wrong)}\\b`, 'gi');
            corrected = corrected.replace(regex, right);
        }

        // Levenshtein-based fuzzy correction for command words
        const words = corrected.split(/\s+/);
        const commandWords = ['help', 'status', 'analyze', 'review', 'search', 'create', 'debug', 'explain'];

        const correctedWords = words.map(word => {
            const lower = word.toLowerCase();
            // Only try to correct short words that might be commands
            if (lower.length >= 3 && lower.length <= 10) {
                for (const cmd of commandWords) {
                    if (this.levenshteinDistance(lower, cmd) <= 2) {
                        // Preserve original case pattern if possible
                        return word[0] === word[0].toUpperCase() ?
                               cmd.charAt(0).toUpperCase() + cmd.slice(1) : cmd;
                    }
                }
            }
            return word;
        });

        return correctedWords.join(' ');
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get user's AI preference
     */
    getUserPreference(userId) {
        return this.userPreferences.get(userId) || { mode: this.defaultMode };
    }

    /**
     * Set user's AI preference
     * @param {string} userId - User ID
     * @param {string} mode - 'economy', 'quality', or 'balanced'
     */
    setUserPreference(userId, mode) {
        const validModes = ['economy', 'quality', 'balanced'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid mode. Choose: ${validModes.join(', ')}`);
        }
        this.userPreferences.set(userId, { mode: mode });
    }

    /**
     * Check if cache is enabled via environment configuration
     * @private
     * @returns {boolean} True if cache is enabled
     */
    _isCacheEnabled() {
        // Check CACHE_ENABLED env var (default: true)
        const enabledStr = (process.env.CACHE_ENABLED || 'true').toLowerCase();
        return enabledStr === 'true' || enabledStr === '1' || enabledStr === 'yes';
    }

    /**
     * Get routing explanation for a query (for debugging)
     */
    explainRouting(query) {
        const corrected = this.correctSpelling(query);
        const classification = this.classifyQuery(corrected);

        return {
            originalQuery: query,
            correctedQuery: corrected,
            wasCorrected: query !== corrected,
            selectedProvider: classification.provider,
            taskType: classification.taskType,
            reason: this.getRoutingReason(corrected, classification)
        };
    }

    /**
     * Get human-readable reason for routing decision
     */
    getRoutingReason(query, classification) {
        const { provider, taskType } = classification;

        if (provider === 'grok') {
            return 'Social media/X/Twitter query → Grok (best for social search)';
        }

        if (provider === 'perplexity') {
            return 'Research/knowledge query → Perplexity (best for research)';
        }

        if (provider === 'claude') {
            if (taskType === 'planning') {
                return 'Planning/strategy query → Claude Opus (THE BRAIN)';
            }
            if (this.alwaysClaudePatterns.some(p => p.test(query))) {
                return 'Code/technical content → Claude Sonnet (THE CODER)';
            }
            if (this.complexKeywords.some(k => query.toLowerCase().includes(k))) {
                return 'Complex/analytical query → Claude Sonnet (THE CODER)';
            }
            return 'Long/complex query → Claude';
        }

        if (this.simplePatterns.some(p => p.test(query))) {
            return 'Simple greeting/acknowledgment → Groq (FREE)';
        }
        return 'Short/simple query → Groq (FREE)';
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats including hit rate
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Clear the cache
     * @returns {number} Number of entries cleared
     */
    clearCache() {
        return this.cache.clear();
    }

    /**
     * Invalidate a specific cache entry
     * @param {string} provider - Provider name
     * @param {string} query - Query to invalidate
     * @param {string} taskType - Task type (optional)
     * @returns {boolean} True if entry existed
     */
    invalidateCacheEntry(provider, query, taskType = '') {
        const cacheKey = this.generateCacheKey(provider, query, taskType);
        return this.cache.invalidate(cacheKey);
    }

    /**
     * Get combined router stats including cache performance
     * @returns {Object} Combined statistics
     */
    getExtendedStats() {
        const cacheStats = this.getCacheStats();

        return {
            providers: this.stats,
            cache: cacheStats,
            summary: {
                totalCalls: Object.values(this.stats).reduce((sum, p) => sum + (p.calls || 0), 0),
                totalErrors: Object.values(this.stats).reduce((sum, p) => sum + (p.errors || 0), 0),
                totalCacheHits: Object.values(this.stats).reduce((sum, p) => sum + (p.cacheHits || 0), 0),
                cacheHitRate: cacheStats.hitRate,
                estimatedCostSavings: this.calculateCostSavings()
            }
        };
    }

    /**
     * Calculate estimated cost savings from cache hits
     * @returns {number} Estimated cost savings in USD
     */
    calculateCostSavings() {
        // Rough estimates per provider call
        const avgCosts = {
            claude: 0.015,  // Avg between Opus and Sonnet
            groq: 0,        // FREE
            grok: 0.005,
            perplexity: 0.01
        };

        let savings = 0;
        for (const [provider, stats] of Object.entries(this.stats)) {
            const cacheHits = stats.cacheHits || 0;
            const avgCost = avgCosts[provider] || 0;
            savings += cacheHits * avgCost;
        }

        return savings;
    }
}

module.exports = Router;
