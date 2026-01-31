// AI Handler - Interfaces with Claude API
// Processes user queries and generates intelligent responses

const Anthropic = require('@anthropic-ai/sdk');

class AIHandler {
    constructor() {
        this.conversationHistory = [];
        this.client = null;
    }

    /**
     * Initialize the Anthropic client
     */
    initClient() {
        if (!this.client && process.env.ANTHROPIC_API_KEY) {
            this.client = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        }
        return this.client;
    }

    /**
     * Check if this is a new conversation (no history)
     * @returns {boolean}
     */
    isNewConversation() {
        return this.conversationHistory.length === 0;
    }

    /**
     * Get a time-appropriate greeting for new conversations
     * @returns {string}
     */
    getGreeting() {
        const hour = new Date().getHours();
        let timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

        return `${timeGreeting}! 👋 I'm ClawdBot, your AI coding assistant.

QUICK COMMANDS:
• status - Check my health
• list repos - See your repos
• analyze [repo] - Repo deep-dive
• help - All commands

Or just ask me any coding question!

What can I help you with? 🤖`;
    }

    /**
     * Process a user query with Claude AI
     * @param {string} query - The user's question or command
     * @returns {Promise<string>} - AI response
     */
    async processQuery(query) {
        try {
            const client = this.initClient();

            if (!client) {
                return "AI service not configured. Please set up the ANTHROPIC_API_KEY.";
            }

            // Add query to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: query
            });

            // Keep only last 10 messages to manage context
            if (this.conversationHistory.length > 10) {
                this.conversationHistory = this.conversationHistory.slice(-10);
            }

            // Call Claude API
            const response = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                system: this.getSystemPrompt(),
                messages: this.conversationHistory
            });

            const aiResponse = response.content[0].text.trim();

            // Add to history
            this.conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });

            return aiResponse;
        } catch (error) {
            console.error('Error calling Claude AI:', error.message);
            return "I'm having trouble connecting to Claude. Please try again in a moment.";
        }
    }

    /**
     * Get system prompt that defines bot behavior
     */
    getSystemPrompt() {
        return `You are ClawdBot, a friendly AI coding assistant that helps via WhatsApp.

PERSONALITY:
- Warm but efficient
- Use occasional emojis (not excessive)
- Keep responses SHORT (under 150 words) - this is WhatsApp
- Be proactive - suggest next steps
- Remember context from our conversation

CURRENT CAPABILITIES:
- Answer coding questions
- Explain code concepts
- Help debug issues (by discussing, not fixing directly yet)
- Analyze GitHub repositories (use "analyze [repo]" command)
- List monitored repos (use "list repos" command)

COMMANDS (tell users about these):
- status - Check my health
- list repos - See your GitHub repos
- analyze [repo] - Get repo stats and issues
- help - Show all commands

LIMITATIONS (be honest):
- I can't yet create PRs or commit code directly
- I don't have persistent memory (conversation resets on restart)
- I can only access repos in REPOS_TO_MONITOR

When users ask for features I don't have, acknowledge it and suggest workarounds.
Sign off with "- ClawdBot 🤖" on longer responses.`;
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
    }
}

// Export singleton instance
module.exports = new AIHandler();
