/**
 * AI Providers Registry
 *
 * Central registry for all AI providers:
 * - Groq (FREE) - Simple queries, greetings, quick answers
 * - Claude (Tiered) - Opus for planning/strategy, Sonnet for coding
 * - Grok (xAI) - Social media, X/Twitter, trends, real-time info
 *
 * Manages provider initialization, health checks, and unified interface.
 */

const GroqHandler = require('./groq-handler');
const ClaudeHandler = require('./claude-handler');
const GrokHandler = require('./grok-handler');
const Router = require('./router');

class AIProviderRegistry {
    constructor() {
        this.providers = {};
        this.router = null;
        this.stats = {
            groq: { calls: 0, tokens: 0, errors: 0 },
            claude: { calls: 0, tokens: 0, errors: 0, estimatedCost: 0, opusCalls: 0, sonnetCalls: 0 },
            grok: { calls: 0, tokens: 0, errors: 0, estimatedCost: 0 }
        };
        this.initialized = false;
    }

    /**
     * Initialize all AI providers
     */
    async initialize() {
        if (this.initialized) return;

        console.log('[AI Providers] Initializing multi-AI architecture...');

        // Initialize Groq (FREE - prioritize for simple queries)
        if (process.env.GROQ_API_KEY) {
            this.providers.groq = new GroqHandler();
            await this.providers.groq.initialize();
            console.log('[AI Providers] Groq (FREE) ready - simple queries');
        } else {
            console.log('[AI Providers] Groq not configured (GROQ_API_KEY missing)');
        }

        // Initialize Claude (tiered: Opus=brain, Sonnet=coder)
        if (process.env.ANTHROPIC_API_KEY) {
            this.providers.claude = new ClaudeHandler();
            await this.providers.claude.initialize();
            console.log('[AI Providers] Claude ready - Opus (brain) + Sonnet (coder)');
        } else {
            console.log('[AI Providers] Claude not configured (ANTHROPIC_API_KEY missing)');
        }

        // Initialize Grok (xAI - for social/X/Twitter searches)
        if (process.env.XAI_API_KEY) {
            this.providers.grok = new GrokHandler();
            await this.providers.grok.initialize();
            console.log('[AI Providers] Grok (xAI) ready - social/X searches');
        } else {
            console.log('[AI Providers] Grok not configured (XAI_API_KEY missing) - social search disabled');
        }

        // Initialize router
        this.router = new Router(this.providers, this.stats);
        console.log('[AI Providers] Smart router ready');

        this.initialized = true;
        return this;
    }

    /**
     * Process a query using the smart router
     * @param {string} query - User's query
     * @param {Object} context - Context including conversation history, user preferences
     * @returns {Promise<{response: string, provider: string}>}
     */
    async processQuery(query, context = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.router.route(query, context);
    }

    /**
     * Force a query to a specific provider
     * @param {string} provider - Provider name (groq, claude)
     * @param {string} query - User's query
     * @param {Object} context - Context
     */
    async queryProvider(provider, query, context = {}) {
        if (!this.providers[provider]) {
            throw new Error(`Provider ${provider} not available`);
        }

        const result = await this.providers[provider].complete(query, context);
        this.stats[provider].calls++;
        if (result.tokens) {
            this.stats[provider].tokens += result.tokens;
        }
        return result;
    }

    /**
     * Get provider health status
     */
    getHealth() {
        const health = {};
        for (const [name, provider] of Object.entries(this.providers)) {
            health[name] = {
                available: true,
                model: provider.getModel(),
                isFree: name === 'groq'
            };
        }
        return health;
    }

    /**
     * Get usage statistics
     */
    getStats() {
        const savings = this.calculateSavings();
        return {
            ...this.stats,
            savings: savings,
            summary: this.formatStatsSummary()
        };
    }

    /**
     * Calculate estimated cost savings
     */
    calculateSavings() {
        // Groq is FREE, Claude costs money
        const groqCalls = this.stats.groq.calls;
        const avgCostPerClaudeCall = 0.003; // ~$0.003 per Sonnet call average

        return {
            freeQueries: groqCalls,
            estimatedSaved: (groqCalls * avgCostPerClaudeCall).toFixed(4),
            currency: 'USD'
        };
    }

    /**
     * Format stats for WhatsApp display
     */
    formatStatsSummary() {
        const groq = this.stats.groq;
        const claude = this.stats.claude;
        const grok = this.stats.grok;
        const savings = this.calculateSavings();
        const total = groq.calls + claude.calls + grok.calls;
        const freePercent = total > 0 ? Math.round((groq.calls / total) * 100) : 0;

        let summary = `*AI Usage Stats*\n`;
        summary += `Groq (FREE): ${groq.calls} queries\n`;
        summary += `Claude: ${claude.calls} (Opus: ${claude.opusCalls || 0}, Sonnet: ${claude.sonnetCalls || 0})\n`;
        if (grok.calls > 0) {
            summary += `Grok: ${grok.calls} social searches\n`;
        }
        summary += `Free ratio: ${freePercent}%\n`;
        summary += `Est. saved: $${savings.estimatedSaved}`;

        return summary;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            groq: { calls: 0, tokens: 0, errors: 0 },
            claude: { calls: 0, tokens: 0, errors: 0, estimatedCost: 0, opusCalls: 0, sonnetCalls: 0 },
            grok: { calls: 0, tokens: 0, errors: 0, estimatedCost: 0 }
        };
    }

    /**
     * Get available providers list
     */
    getAvailableProviders() {
        return Object.keys(this.providers);
    }

    /**
     * Check if a provider is available
     */
    hasProvider(name) {
        return !!this.providers[name];
    }
}

// Singleton instance
const registry = new AIProviderRegistry();

module.exports = {
    registry,
    AIProviderRegistry
};
