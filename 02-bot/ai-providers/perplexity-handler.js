/**
 * Perplexity Handler - AI Provider with Online Search
 *
 * Uses Perplexity's OpenAI-compatible API for:
 * - Sonar models with real-time internet search capabilities
 * - Ideal for research queries, current events, fact-checking
 *
 * Models:
 * - sonar: Fast online search with LLaMA 3.1 small
 * - sonar-large: Higher quality online search
 * - sonar-huge: Best quality for complex research queries
 */

const https = require('https');

class PerplexityHandler {
    constructor() {
        this.apiKey = process.env.PERPLEXITY_API_KEY;
        this.baseUrl = 'api.perplexity.ai';

        // Sonar models with online search capabilities
        this.models = {
            sonar: 'llama-3.1-sonar-small-128k-online',      // Fast, online search
            'sonar-large': 'llama-3.1-sonar-large-128k-online', // Quality, online search
            'sonar-huge': 'llama-3.1-sonar-huge-128k-online'    // Best quality
        };

        // Pricing per 1M tokens (estimated from Perplexity pricing)
        // Sonar models: input ~$1/1M, output ~$1/1M (with search costs)
        this.pricing = {
            'llama-3.1-sonar-small-128k-online': { input: 0.2, output: 0.2 },
            'llama-3.1-sonar-large-128k-online': { input: 1.0, output: 1.0 },
            'llama-3.1-sonar-huge-128k-online': { input: 5.0, output: 5.0 }
        };

        this.currentModel = this.models.sonar; // Default to fast sonar
        this.initialized = false;
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('PERPLEXITY_API_KEY not configured');
        }
        this.initialized = true;
        return this;
    }

    /**
     * Complete a text query using Perplexity API
     * @param {string} query - User's query
     * @param {Object} context - Context including system prompt, history
     * @returns {Promise<{response: string, tokens: number, inputTokens: number, outputTokens: number, model: string, provider: string, cost: number}>}
     */
    async complete(query, context = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const {
            systemPrompt = this.getDefaultSystemPrompt(),
            history = [],
            model = this.currentModel,
            maxTokens = 800,
            temperature = 0.7
        } = context;

        // Build messages array
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history (last 6 messages)
        if (history.length > 0) {
            messages.push(...history.slice(-6));
        }

        // Add current query
        messages.push({ role: 'user', content: query });

        const requestBody = {
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(requestBody);

            const options = {
                hostname: this.baseUrl,
                path: '/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', chunk => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            console.error('[Perplexity] API error:', res.statusCode, responseData);
                            reject(new Error(`Perplexity API error: ${res.statusCode}`));
                            return;
                        }

                        const parsed = JSON.parse(responseData);
                        const response = parsed.choices[0]?.message?.content?.trim() || '';
                        const inputTokens = parsed.usage?.prompt_tokens || 0;
                        const outputTokens = parsed.usage?.completion_tokens || 0;
                        const totalTokens = parsed.usage?.total_tokens || (inputTokens + outputTokens);

                        // Calculate cost
                        const cost = this.calculateCost(model, inputTokens, outputTokens);

                        resolve({
                            response: response,
                            tokens: totalTokens,
                            inputTokens: inputTokens,
                            outputTokens: outputTokens,
                            model: model,
                            provider: 'perplexity',
                            cost: cost
                        });
                    } catch (err) {
                        reject(new Error(`Failed to parse Perplexity response: ${err.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error('[Perplexity] Request error:', err);
                reject(err);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Calculate cost based on model and token usage
     * @param {string} model - Model name
     * @param {number} inputTokens - Input token count
     * @param {number} outputTokens - Output token count
     * @returns {number} Cost in USD
     */
    calculateCost(model, inputTokens, outputTokens) {
        const pricing = this.pricing[model];
        if (!pricing) {
            return 0;
        }

        // Pricing is per 1M tokens
        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;

        return inputCost + outputCost;
    }

    /**
     * Get default system prompt for Perplexity
     */
    getDefaultSystemPrompt() {
        return `You are a helpful AI assistant integrated into a WhatsApp bot called ClawdBot.

KEY RULES:
- Keep responses SHORT (under 150 words) - this is WhatsApp
- You have access to real-time internet search - use it to provide current information
- Always cite sources when providing factual information
- Be accurate and fact-based
- Use emojis sparingly
- If information might be outdated, mention the search date

You excel at research queries, current events, fact-checking, and finding up-to-date information from the web.`;
    }

    /**
     * Set the model to use
     * @param {string} modelKey - Key from models object (sonar, sonar-large, sonar-huge)
     */
    setModel(modelKey) {
        if (this.models[modelKey]) {
            this.currentModel = this.models[modelKey];
        }
    }

    /**
     * Get current model name
     * @returns {string} Current model identifier
     */
    getModel() {
        return this.currentModel;
    }

    /**
     * Get all available models
     * @returns {Object} Map of model keys to model identifiers
     */
    getAvailableModels() {
        return { ...this.models };
    }

    /**
     * Check if Perplexity is available
     * @returns {boolean} True if API key is configured and handler is initialized
     */
    isAvailable() {
        return !!this.apiKey && this.initialized;
    }
}

module.exports = PerplexityHandler;
