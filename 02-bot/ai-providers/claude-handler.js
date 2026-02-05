/**
 * Claude Handler - Premium AI Provider
 *
 * Multi-tier Claude strategy:
 * - Opus 4.6 (THE BRAIN) = Planning, strategy, architecture, complex reasoning
 *   • NEW: 1M token context window (beta)
 *   • NEW: Adaptive thinking with effort controls (low/medium/high/max)
 *   • NEW: 128k output tokens
 *   • Improved coding, agentic tasks, code review
 * - Sonnet 4 (THE CODER) = Code writing, analysis, debugging, implementation
 * - Haiku (QUICK) = Fast responses for simple Claude tasks
 *
 * More expensive but highest quality for complex tasks.
 */

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeHandler {
    constructor() {
        this.apiKey = process.env.ANTHROPIC_API_KEY;
        this.client = null;

        // Models available - tiered by capability and cost
        this.models = {
            // THE BRAIN - for planning, strategy, architecture
            opus: 'claude-opus-4-6',              // NEW: Opus 4.6 with 1M context, improved coding
            // THE CODER - for implementation, code review
            sonnet: 'claude-sonnet-4-20250514',   // Great for coding
            // QUICK - for fast simple responses
            haiku: 'claude-3-haiku-20240307'      // Fastest, cheapest
        };

        // Default to Sonnet for most tasks
        this.currentModel = this.models.sonnet;
        this.initialized = false;

        // Cost tracking (per 1M tokens)
        this.costs = {
            'claude-opus-4-6': { input: 5.00, output: 25.00 },            // Opus 4.6 pricing
            'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },   // Mid-tier
            'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }      // Cheapest
        };

        // Effort controls for Opus 4.6 (adaptive thinking)
        this.effortLevels = {
            low: 'low',       // Less thinking, faster responses
            medium: 'medium', // Balanced thinking
            high: 'high',     // Default - adaptive thinking
            max: 'max'        // Maximum reasoning for hardest tasks
        };

        // Task type to model mapping
        this.taskModels = {
            // Strategic/Planning tasks → Opus (THE BRAIN)
            planning: 'opus',
            strategy: 'opus',
            architecture: 'opus',
            design: 'opus',
            complex_reasoning: 'opus',

            // Coding tasks → Sonnet (THE CODER)
            coding: 'sonnet',
            debugging: 'sonnet',
            review: 'sonnet',
            analysis: 'sonnet',
            implementation: 'sonnet',

            // Quick tasks → Haiku
            quick: 'haiku',
            simple: 'haiku'
        };
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('ANTHROPIC_API_KEY not configured');
        }

        this.client = new Anthropic({
            apiKey: this.apiKey
        });

        this.initialized = true;
        return this;
    }

    /**
     * Complete a text query using Claude
     * @param {string} query - User's query
     * @param {Object} context - Context including system prompt, history, taskType
     * @returns {Promise<{response: string, tokens: number, model: string, cost: number}>}
     */
    async complete(query, context = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const {
            systemPrompt = this.getDefaultSystemPrompt(),
            history = [],
            model = null, // Will be auto-selected if not provided
            taskType = null, // planning, coding, quick, etc.
            maxTokens = 4096, // Increased default (Opus 4.6 supports up to 128k)
            skillDocs = '',
            effort = 'high', // NEW: Opus 4.6 effort level (low, medium, high, max)
            thinking = 'adaptive' // NEW: adaptive thinking (true/false/'adaptive')
        } = context;

        // Auto-select model based on task type if not explicitly provided
        const selectedModel = model || this.selectModelForTask(query, taskType);

        // Inject skill docs into system prompt if provided
        let fullSystemPrompt = systemPrompt;
        if (skillDocs) {
            fullSystemPrompt += `\n\n${skillDocs}`;
        }

        // Build messages array
        const messages = [];

        // Add conversation history (last 10 messages, filter out empty content)
        if (history.length > 0) {
            const validHistory = history.slice(-10).filter(m => m.content && m.content.trim());
            messages.push(...validHistory);
        }

        // Add current query (guard against empty)
        if (!query || !query.trim()) {
            return { response: "I didn't catch that. Could you repeat?", tokens: 0, provider: 'claude', tier: 'quick' };
        }
        messages.push({ role: 'user', content: query });

        try {
            // Build API request params
            const apiParams = {
                model: selectedModel,
                max_tokens: maxTokens,
                system: fullSystemPrompt,
                messages: messages
            };

            // Add Opus 4.6 specific features
            if (selectedModel === 'claude-opus-4-6') {
                // Effort control (low, medium, high, max)
                if (effort && this.effortLevels[effort]) {
                    apiParams.metadata = { ...apiParams.metadata, effort: this.effortLevels[effort] };
                }

                // Adaptive thinking (new in 4.6)
                if (thinking === 'adaptive') {
                    apiParams.thinking = { type: 'enabled', budget_tokens: 10000 }; // Default budget
                } else if (thinking === true) {
                    apiParams.thinking = { type: 'enabled', budget_tokens: 10000 };
                }
            }

            const response = await this.client.messages.create(apiParams);

            const responseText = response.content[0]?.text?.trim() || '';
            const inputTokens = response.usage?.input_tokens || 0;
            const outputTokens = response.usage?.output_tokens || 0;
            const totalTokens = inputTokens + outputTokens;

            // Calculate cost
            const modelCosts = this.costs[selectedModel] || this.costs['claude-sonnet-4-20250514'];
            const cost = ((inputTokens / 1000000) * modelCosts.input) +
                        ((outputTokens / 1000000) * modelCosts.output);

            // Determine tier for display
            const tier = selectedModel.includes('opus') ? 'brain' :
                        selectedModel.includes('sonnet') ? 'coder' : 'quick';

            return {
                response: responseText,
                tokens: totalTokens,
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                model: selectedModel,
                tier: tier,
                provider: 'claude',
                cost: cost,
                effort: selectedModel === 'claude-opus-4-6' ? effort : undefined
            };
        } catch (error) {
            console.error('[Claude] API error:', error.message);
            throw error;
        }
    }

    /**
     * Get default system prompt for Claude
     */
    getDefaultSystemPrompt() {
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const githubUser = process.env.GITHUB_USERNAME || 'unknown';

        return `You are ClawdBot, a powerful AI assistant running as a WhatsApp bot. You have REAL integrations and capabilities - you're not just a chatbot.

YOUR ACTUAL CAPABILITIES:
You are connected to GitHub (user: ${githubUser}) and can:

- READ & EXPLORE repos, files, code, branches, commits, PRs
- CREATE branches, issues, PRs, files
- EDIT and modify code with AI assistance
- REVIEW code and suggest improvements
- Track EXPENSES from receipt photos
- Manage COMPANY deadlines and governance
- Remember FACTS and track TASKS

Monitored repos: ${repos.length > 0 ? repos.join(', ') : 'none configured'}

HOW TO TALK:
- Casual and friendly, like texting a friend
- Use emojis sparingly
- Keep responses SHORT (max ~100 words) - this is WhatsApp
- Simple language, explain technical stuff clearly
- Be helpful and encouraging

IMPORTANT:
- When users ask what you can do, tell them about your REAL capabilities
- If they want to do something with GitHub, guide them to use the exact command
- For general coding questions, just answer them directly
- If you don't know something, say so

Don't sign off messages - just end naturally with a relevant emoji if appropriate.`;
    }

    /**
     * Set the model to use
     */
    setModel(modelKey) {
        if (this.models[modelKey]) {
            this.currentModel = this.models[modelKey];
        }
    }

    /**
     * Get current model name
     */
    getModel() {
        return this.currentModel;
    }

    /**
     * Get all available models
     */
    getAvailableModels() {
        return { ...this.models };
    }

    /**
     * Check if Claude is available
     */
    isAvailable() {
        return !!this.apiKey && this.initialized;
    }

    /**
     * Estimate cost for a query
     * @param {number} inputTokens - Estimated input tokens
     * @param {number} outputTokens - Estimated output tokens
     */
    estimateCost(inputTokens, outputTokens) {
        const modelCosts = this.costs[this.currentModel];
        return ((inputTokens / 1000000) * modelCosts.input) +
               ((outputTokens / 1000000) * modelCosts.output);
    }

    /**
     * Auto-select the best Claude model based on task type and query content
     * @param {string} query - The user's query
     * @param {string} taskType - Optional explicit task type
     * @returns {string} - Model ID
     */
    selectModelForTask(query, taskType = null) {
        // If explicit task type provided, use mapped model
        if (taskType && this.taskModels[taskType]) {
            return this.models[this.taskModels[taskType]];
        }

        const lowerQuery = query.toLowerCase();

        // OPUS (THE BRAIN) - Planning, strategy, architecture
        const planningKeywords = [
            'plan', 'strategy', 'architect', 'design system', 'design pattern',
            'how should i', 'best approach', 'recommend', 'advise',
            'trade-off', 'tradeoff', 'pros and cons', 'compare approaches',
            'roadmap', 'milestone', 'phase', 'step by step plan',
            'think through', 'reason about', 'consider',
            'should i use', 'which is better', 'evaluate options',
            'long-term', 'scalability', 'future-proof',
            'complex decision', 'difficult choice', 'weigh options'
        ];

        for (const keyword of planningKeywords) {
            if (lowerQuery.includes(keyword)) {
                console.log(`[Claude] Using OPUS (brain) for planning task: "${keyword}"`);
                return this.models.opus;
            }
        }

        // SONNET (THE CODER) - Default for most coding tasks
        const codingKeywords = [
            'code', 'function', 'class', 'implement', 'write',
            'debug', 'fix', 'bug', 'error', 'review',
            'refactor', 'optimize', 'improve code',
            'test', 'unit test', 'integration',
            'api', 'endpoint', 'database', 'query'
        ];

        for (const keyword of codingKeywords) {
            if (lowerQuery.includes(keyword)) {
                return this.models.sonnet;
            }
        }

        // Check for code blocks or technical content
        if (query.includes('```') || query.includes('function ') || query.includes('class ')) {
            return this.models.sonnet;
        }

        // Default to Sonnet for balanced performance
        return this.models.sonnet;
    }

    /**
     * Force use of Opus for strategic planning
     */
    useBrain(query, context = {}) {
        return this.complete(query, { ...context, taskType: 'planning' });
    }

    /**
     * Force use of Sonnet for coding tasks
     */
    useCoder(query, context = {}) {
        return this.complete(query, { ...context, taskType: 'coding' });
    }

    /**
     * Get model tier description
     */
    getModelTier(model) {
        if (model.includes('opus')) return { tier: 'brain', description: 'Strategic planning & complex reasoning' };
        if (model.includes('sonnet')) return { tier: 'coder', description: 'Coding & implementation' };
        return { tier: 'quick', description: 'Fast simple responses' };
    }
}

module.exports = ClaudeHandler;
