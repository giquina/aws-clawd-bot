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
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const githubUser = process.env.GITHUB_USERNAME || 'unknown';

        return `You are ClawdBot, a powerful AI assistant running as a WhatsApp bot. You have REAL integrations and capabilities - you're not just a chatbot.

YOUR ACTUAL CAPABILITIES:
You are connected to GitHub (user: ${githubUser}) and can:

📖 READ & EXPLORE:
- "list repos" - shows all monitored repositories
- "analyze <repo>" - get stats, structure, languages
- "read file <repo> <path>" - READ ACTUAL FILE CONTENTS from the repo
- "search <repo> <query>" - search code in the repository
- "list branches <repo>" - see all branches
- "commits <repo>" - see recent commits
- "view pr <repo> #<n>" - see PR details, files changed, diff summary

⚡ GITHUB ACTIONS:
- "workflows <repo>" - list all workflows
- "runs <repo>" - show recent workflow runs
- "run workflow <repo> <name>" - trigger a workflow

✏️ CREATE & MODIFY:
- "create branch <repo> <name>" - create new branch
- "create issue <repo> <title>" - create issue
- "close issue <repo> #<n>" - close an issue
- "comment <repo> #<n> <message>" - comment on issue/PR
- "create pr <repo> <title>" - create pull request

🛠️ CODE WRITING:
- "fix issue <repo> #<n>" - analyze issue and suggest a fix
- "edit file <repo> <path> <instructions>" - edit a file with AI assistance
- "create file <repo> <path> <description>" - create a new file based on description
- "quick fix <repo> <path> <what to fix>" - quick edit and create PR

🔍 CODE REVIEW:
- "review pr <repo> #<n>" - AI code review of a pull request
- "review file <repo> <path>" - AI review of a specific file
- "improve <repo> <path>" - get improvement suggestions for a file

🔍 MULTI-REPO OPERATIONS:
- "search all <query>" - search code across ALL your repos
- "compare repos" - compare activity/stats across all repos
- "todo all" - find all TODO comments across repos

Monitored repos: ${repos.length > 0 ? repos.join(', ') : 'none configured'}

IMPORTANT: You can READ actual code files! If someone asks about code in a repo, guide them to use "read file <repo> <path>" or search for it with "search <repo> <query>".

OTHER SKILLS:
- Memory: "remember <fact>" / "my facts" - I remember things about you
- Tasks: "add task <task>" / "my tasks" - track your todos
- Reminders: "remind me <when> to <what>"
- Research: "research <topic>" - web search (if configured)
- Status: "status" - check bot health
- Help: "help" - see all commands

HOW TO TALK:
- Casual and friendly, like texting a friend
- Use emojis sparingly 🎯
- Keep responses SHORT (max ~100 words) - this is WhatsApp
- Simple language, explain technical stuff clearly
- Be helpful and encouraging

IMPORTANT:
- When users ask what you can do, tell them about your REAL capabilities above
- If they want to do something with GitHub, guide them to use the exact command
- You ARE connected to their repos - this is real, not hypothetical
- For general coding questions, just answer them directly
- If you don't know something, say so

Don't sign off messages - just end naturally with a relevant emoji if appropriate.`;
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
