/**
 * Grok Handler - xAI Provider
 *
 * Uses Grok (xAI) for:
 * - Social media/X/Twitter searches and trends
 * - Real-time information
 * - Current events and news
 *
 * Grok has special access to X/Twitter data making it ideal for social searches.
 *
 * API is OpenAI-compatible: https://api.x.ai/v1
 */

const https = require('https');

class GrokHandler {
    constructor() {
        this.apiKey = process.env.XAI_API_KEY;
        this.baseUrl = 'api.x.ai';

        // Models available
        this.models = {
            fast: 'grok-3-fast',    // Cheaper, faster
            full: 'grok-3'          // More powerful
        };

        this.currentModel = this.models.fast; // Default to fast for cost
        this.initialized = false;

        // Cost tracking (per 1M tokens)
        this.costs = {
            'grok-3-fast': { input: 0.20, output: 0.50 },  // Much cheaper
            'grok-3': { input: 3.00, output: 15.00 }       // More powerful
        };
    }

    async initialize() {
        if (!this.apiKey) {
            console.log('[Grok] XAI_API_KEY not configured - Grok disabled');
            return this;
        }
        this.initialized = true;
        return this;
    }

    /**
     * Complete a text query using Grok
     * Best for social media, X/Twitter, trends, current events
     *
     * @param {string} query - User's query
     * @param {Object} context - Context including system prompt, history
     * @returns {Promise<{response: string, tokens: number, model: string, cost: number}>}
     */
    async complete(query, context = {}) {
        if (!this.apiKey) {
            throw new Error('Grok not configured - add XAI_API_KEY');
        }

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

        // Build messages array (OpenAI format)
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
                path: '/v1/chat/completions',
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
                            console.error('[Grok] API error:', res.statusCode, responseData);
                            reject(new Error(`Grok API error: ${res.statusCode}`));
                            return;
                        }

                        const parsed = JSON.parse(responseData);
                        const response = parsed.choices[0]?.message?.content?.trim() || '';
                        const inputTokens = parsed.usage?.prompt_tokens || 0;
                        const outputTokens = parsed.usage?.completion_tokens || 0;
                        const totalTokens = inputTokens + outputTokens;

                        // Calculate cost
                        const modelCosts = this.costs[model] || this.costs['grok-3-fast'];
                        const cost = ((inputTokens / 1000000) * modelCosts.input) +
                                    ((outputTokens / 1000000) * modelCosts.output);

                        resolve({
                            response: response,
                            tokens: totalTokens,
                            inputTokens: inputTokens,
                            outputTokens: outputTokens,
                            model: model,
                            provider: 'grok',
                            cost: cost
                        });
                    } catch (err) {
                        reject(new Error(`Failed to parse Grok response: ${err.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error('[Grok] Request error:', err);
                reject(err);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Get default system prompt for Grok
     * Focused on social media and real-time info
     */
    getDefaultSystemPrompt() {
        return `You are a helpful AI assistant with special expertise in social media, X/Twitter, and current events.

KEY STRENGTHS:
- Real-time information and trends
- X/Twitter posts, discussions, and sentiment
- Current events and breaking news
- Social media analysis
- Public opinion and viral content

RULES:
- Keep responses SHORT (under 100 words) - this is WhatsApp
- Be casual and friendly
- Use emojis sparingly
- If you don't have current information, say so
- Focus on social/trending topics when relevant`;
    }

    /**
     * Search social media/X trends
     * Specialized method for social queries
     */
    async searchSocial(query, context = {}) {
        const socialPrompt = `${this.getDefaultSystemPrompt()}

FOCUS: This is a social media/X search. Find relevant:
- Trending discussions
- Popular posts
- Public sentiment
- Notable accounts discussing this
- Recent news or viral content`;

        return this.complete(query, {
            ...context,
            systemPrompt: socialPrompt
        });
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
     * Check if Grok is available
     */
    isAvailable() {
        return !!this.apiKey && this.initialized;
    }
}

module.exports = GrokHandler;
