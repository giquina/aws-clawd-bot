// AI Handler - Multi-AI Router
// Processes user queries using the best AI for each task:
// - Groq (FREE) - Simple queries, greetings
// - Grok (xAI) - Social media, X/Twitter searches
// - Claude Opus - Planning, strategy (THE BRAIN)
// - Claude Sonnet - Coding, implementation (THE CODER)

const Anthropic = require('@anthropic-ai/sdk');

// Import skill registry for dynamic skill documentation
let skillRegistry = null;
try {
    skillRegistry = require('./skills/skill-registry');
} catch (e) {
    // Skills not loaded yet, will use fallback
}

// Import multi-AI provider system
let providerRegistry = null;
try {
    const { registry } = require('./ai-providers');
    providerRegistry = registry;
} catch (e) {
    console.log('[AI Handler] Provider registry not yet available:', e.message);
}

class AIHandler {
    constructor() {
        this.conversationHistory = [];
        this.client = null; // Legacy Claude client (fallback)
        this.providersInitialized = false;
    }

    /**
     * Initialize the AI providers
     */
    async initProviders() {
        if (this.providersInitialized) return;

        try {
            if (providerRegistry) {
                await providerRegistry.initialize();
                this.providersInitialized = true;
                console.log('[AI Handler] Multi-AI providers initialized');
            }
        } catch (e) {
            console.log('[AI Handler] Provider init failed, using legacy Claude:', e.message);
        }
    }

    /**
     * Initialize the legacy Anthropic client (fallback)
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

Now with MULTI-AI: I use the best AI for each task!
• Simple questions → FREE (Groq)
• Social/X search → Grok
• Planning → Claude Opus (THE BRAIN)
• Coding → Claude Sonnet (THE CODER)

Try "help" to see what I can do! 💬`;
    }

    /**
     * Process a user query with smart AI routing
     * @param {string} query - The user's question or command
     * @param {Object} context - Optional context (userId, etc.)
     * @returns {Promise<string>} - AI response
     */
    async processQuery(query, context = {}) {
        try {
            // Initialize providers on first use
            await this.initProviders();

            // Add query to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: query
            });

            // Keep only last 10 messages to manage context
            if (this.conversationHistory.length > 10) {
                this.conversationHistory = this.conversationHistory.slice(-10);
            }

            let aiResponse;
            let providerUsed = 'claude';

            // Try multi-AI routing first
            if (providerRegistry && this.providersInitialized) {
                try {
                    const result = await providerRegistry.processQuery(query, {
                        ...context,
                        history: this.conversationHistory.slice(0, -1), // Exclude current query
                        systemPrompt: this.getSystemPrompt(),
                        skillDocs: this.getDynamicSkillDocs()
                    });

                    aiResponse = result.response;
                    providerUsed = result.provider;

                    // Log which AI was used
                    const tierInfo = result.tier ? ` (${result.tier})` : '';
                    console.log(`[AI Handler] Response from ${providerUsed}${tierInfo}: ${result.tokens || 0} tokens`);

                    // Add correction notice if spelling was fixed
                    if (result.correctedQuery && result.correctedQuery !== query) {
                        console.log(`[AI Handler] Spelling corrected: "${query}" → "${result.correctedQuery}"`);
                    }
                } catch (routerError) {
                    console.error('[AI Handler] Router error, falling back to legacy:', routerError.message);
                    aiResponse = await this.processWithLegacyClaude(query);
                }
            } else {
                // Fallback to legacy Claude if providers not available
                aiResponse = await this.processWithLegacyClaude(query);
            }

            // Add to history
            this.conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });

            return aiResponse;
        } catch (error) {
            console.error('Error in AI Handler:', error.message);
            return "I'm having trouble right now. Please try again in a moment.";
        }
    }

    /**
     * Legacy Claude processing (fallback)
     */
    async processWithLegacyClaude(query) {
        const client = this.initClient();

        if (!client) {
            return "AI service not configured. Please set up the ANTHROPIC_API_KEY.";
        }

        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: this.getSystemPrompt(),
            messages: this.conversationHistory
        });

        return response.content[0].text.trim();
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

📸 RECEIPT & EXPENSE TRACKING:
- Send a photo of a receipt → I'll extract the data automatically
- "expenses" or "my expenses" - see recent expenses
- "summary" or "expense summary" - monthly expense summary

🚀 PROJECT CREATOR:
- "create new project <name>" - create a new GitHub repo with full setup
- "new app for <description>" - describe what you want, I'll plan it
- "approve" / "yes" - approve a pending project plan
- "reject" / "no" - cancel a pending plan

Monitored repos: ${repos.length > 0 ? repos.join(', ') : 'none configured'}

IMPORTANT: You can READ actual code files! If someone asks about code in a repo, guide them to use "read file <repo> <path>" or search for it with "search <repo> <query>".

📊 ACCOUNTANCY & COMPANY MANAGEMENT:
- "deadlines" - view upcoming company filing deadlines
- "due this week" / "overdue" - urgent deadlines
- "companies" - list all Giquina group companies
- "company <code>" - details for GMH, GACC, GCAP, GQCARS, GSPV
- "directors" - list company directors
- "can I <action>?" - check if action needs approval (governance)
- "who approves <action>" - see required authorization level
- "intercompany" / "loans" - view intercompany loans
- "record loan" - track new intercompany transaction

📝 PRODUCTIVITY:
- "digest" / "today" - daily summary with deadlines + GitHub
- "morning summary" - full morning brief
- "tonight <task>" - queue task for overnight AI processing
- "my queue" - see overnight queue

💾 MEMORY & TASKS:
- "remember <fact>" / "my facts" - I remember things about you
- "add task <task>" / "my tasks" - track your todos
- "remind me <when> to <what>" - set reminders

🦞 MOLTBOOK (AI Social Network):
- "join moltbook" - connect to Moltbook
- "post to moltbook: <message>" - post to Moltbook
- "moltbook feed" - see what other AIs are posting
- "moltbook status" - check connection

🤖 AI SETTINGS:
- "ai mode economy" - use FREE Groq for everything
- "ai mode quality" - use Claude for everything
- "ai mode balanced" - smart routing (default)
- "ai stats" - see AI usage and savings
- "ai status" - check which AI providers are active

🔧 SYSTEM:
- "help" / "skills" - see all commands
- "status" - check bot health
- Send voice message → transcription

${this.getDynamicSkillDocs()}

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

    /**
     * Get dynamic skill documentation from registry
     * This ensures the AI always knows about ALL skills
     */
    getDynamicSkillDocs() {
        if (skillRegistry && typeof skillRegistry.generateSkillDocs === 'function') {
            const docs = skillRegistry.generateSkillDocs();
            if (docs && docs.length > 50) {
                return `\n📋 ALL AVAILABLE COMMANDS (auto-generated):\n${docs}`;
            }
        }
        return ''; // Return empty if skills not loaded yet
    }

    /**
     * Get AI usage stats
     */
    getStats() {
        if (providerRegistry) {
            return providerRegistry.getStats();
        }
        return null;
    }

    /**
     * Get provider health status
     */
    getHealth() {
        if (providerRegistry) {
            return providerRegistry.getHealth();
        }
        return { legacy: { available: !!this.client } };
    }
}

// Export singleton instance
module.exports = new AIHandler();
