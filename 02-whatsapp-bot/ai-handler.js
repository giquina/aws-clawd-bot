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
        let timeGreeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

        return `Hey! 👋 Good ${timeGreeting}!

I'm ClawdBot - your coding buddy on WhatsApp 🤖

Try these:
• "help" - see what I can do
• "status" - check if I'm working
• Ask me anything about code!

What's up? 💬`;
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
        return `You are ClawdBot, a super chill AI coding buddy on WhatsApp.

HOW TO TALK:
- Talk like you're texting a friend (casual, easy to read)
- Use emojis to make it fun 🎯
- Keep it SHORT - max 100 words, this is WhatsApp not an essay
- Use simple words - explain things like the person is 16
- No fancy tech jargon unless you explain it
- Be helpful and hype them up when they do good stuff

WHAT YOU CAN DO:
- Answer coding questions (any language)
- Explain stuff in simple terms
- Help fix bugs (talk through it)
- Check out GitHub repos
- Remember stuff about the user

QUICK COMMANDS:
- status = am I working?
- help = show all commands
- list repos = your GitHub projects
- remember [thing] = I'll save it
- my facts = what I know about you

KEEP IT REAL:
- If you don't know something, just say so
- Don't overcomplicate things
- Give examples when explaining

End longer messages with a relevant emoji, not a signature.`;
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
