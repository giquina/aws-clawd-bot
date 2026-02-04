/**
 * Groq Handler - FREE AI Provider
 *
 * Uses Groq's FREE inference API for:
 * - LLaMA 3.3 70B for text completion (high quality, FREE)
 * - LLaMA 3.1 8B for fast responses (fastest, FREE)
 * - Whisper for voice transcription (already used in voice skill)
 *
 * This handler is for TEXT completion only.
 * Voice transcription remains in the voice skill.
 */

const https = require('https');

class GroqHandler {
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY;
        this.baseUrl = 'api.groq.com';

        // FREE models - no cost!
        this.models = {
            quality: 'llama-3.3-70b-versatile',  // Best quality, FREE
            fast: 'llama-3.1-8b-instant',         // Fastest, FREE
            balanced: 'mixtral-8x7b-32768'        // Good balance, FREE
        };

        this.currentModel = this.models.fast; // Default to fast for simple queries
        this.initialized = false;
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('GROQ_API_KEY not configured');
        }
        this.initialized = true;
        return this;
    }

    /**
     * Complete a text query using Groq LLM
     * @param {string} query - User's query
     * @param {Object} context - Context including system prompt, history
     * @returns {Promise<{response: string, tokens: number, model: string}>}
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
                path: '/openai/v1/chat/completions',
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
                            console.error('[Groq] API error:', res.statusCode, responseData);
                            reject(new Error(`Groq API error: ${res.statusCode}`));
                            return;
                        }

                        const parsed = JSON.parse(responseData);
                        const response = parsed.choices[0]?.message?.content?.trim() || '';
                        const tokens = parsed.usage?.total_tokens || 0;

                        resolve({
                            response: response,
                            tokens: tokens,
                            model: model,
                            provider: 'groq',
                            cost: 0 // FREE!
                        });
                    } catch (err) {
                        reject(new Error(`Failed to parse Groq response: ${err.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error('[Groq] Request error:', err);
                reject(err);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Get default system prompt for Groq (simpler than Claude's)
     */
    getDefaultSystemPrompt() {
        return `You are a helpful AI assistant integrated into a WhatsApp bot called ClawdBot.

KEY RULES:
- Keep responses SHORT (under 100 words) - this is WhatsApp
- Be casual and friendly, like texting a friend
- Use emojis sparingly
- If you don't know something, say so
- For complex coding questions, suggest the user ask for a more detailed analysis

You handle simple questions, greetings, and quick tasks. Complex code analysis and reasoning goes to a more powerful AI.`;
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
     * Check if Groq is available
     */
    isAvailable() {
        return !!this.apiKey && this.initialized;
    }
}

module.exports = GroqHandler;
