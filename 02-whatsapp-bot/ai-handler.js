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

// Import project context libs (Phase 3 - Enhanced AI Context)
let projectManager = null;
let todoParser = null;
let activeProject = null;
try {
    projectManager = require('./lib/project-manager');
    todoParser = require('./lib/todo-parser');
    activeProject = require('./lib/active-project');
} catch (e) {
    console.log('[AI Handler] Project libs not yet available:', e.message);
}

class AIHandler {
    constructor() {
        this.conversationHistory = [];
        this.client = null; // Legacy Claude client (fallback)
        this.providersInitialized = false;
        this.projectContextCache = new Map(); // Cache project contexts (TTL: 5 min)
        this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
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
     * Detect if query mentions a known project/repo
     * @param {string} query - User's query
     * @returns {{repo: string, confidence: number}|null}
     */
    detectProjectInQuery(query) {
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const lowerQuery = query.toLowerCase();

        // Check for explicit repo mentions
        for (const repo of repos) {
            const repoLower = repo.toLowerCase();
            const repoName = repoLower.split('/').pop(); // Get repo name without owner

            // Direct repo name match (high confidence)
            if (lowerQuery.includes(repoLower) || lowerQuery.includes(repoName)) {
                return { repo, confidence: 0.9 };
            }

            // Partial match with common variations
            const variations = [
                repoName.replace(/-/g, ' '),  // "judo-website" -> "judo website"
                repoName.replace(/-/g, ''),   // "judo-website" -> "judowebsite"
                repoName.split('-')[0]        // "judo-website" -> "judo"
            ];

            for (const variant of variations) {
                if (variant.length >= 3 && lowerQuery.includes(variant)) {
                    return { repo, confidence: 0.7 };
                }
            }
        }

        // Check for project-related keywords without explicit name
        const projectKeywords = ['this project', 'the project', 'current project', 'my project', 'the repo', 'this repo'];
        for (const keyword of projectKeywords) {
            if (lowerQuery.includes(keyword)) {
                // Check for active project
                if (activeProject) {
                    const active = activeProject.get();
                    if (active) {
                        return { repo: active.repo, confidence: 0.8 };
                    }
                }
                return { repo: null, confidence: 0.5, needsActiveProject: true };
            }
        }

        return null;
    }

    /**
     * Get project context for a repository
     * @param {string} query - User's query (for context)
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} - Project context or null
     */
    async getProjectContext(query, userId) {
        try {
            // Detect which project the query is about
            const detected = this.detectProjectInQuery(query);
            if (!detected || !detected.repo) {
                // Check for active project as fallback
                if (activeProject) {
                    const active = activeProject.get(userId);
                    if (active) {
                        return await this.fetchProjectContext(active.repo, query);
                    }
                }
                return null;
            }

            return await this.fetchProjectContext(detected.repo, query);
        } catch (error) {
            console.error('[AI Handler] Error getting project context:', error.message);
            return null;
        }
    }

    /**
     * Fetch project context from cache or GitHub
     * @param {string} repo - Repository name (owner/repo)
     * @param {string} query - Original query for context relevance
     * @returns {Promise<Object|null>}
     */
    async fetchProjectContext(repo, query) {
        try {
            // Check cache first
            const cacheKey = `${repo}:${Date.now()}`;
            const cached = this.projectContextCache.get(repo);
            if (cached && (Date.now() - cached.timestamp) < this.cacheMaxAge) {
                console.log(`[AI Handler] Using cached context for ${repo}`);
                return cached.context;
            }

            // Use projectManager if available
            if (projectManager) {
                const context = await projectManager.getProjectContext(repo);
                if (context) {
                    this.projectContextCache.set(repo, {
                        context,
                        timestamp: Date.now()
                    });
                    return context;
                }
            }

            // Fallback: Try to fetch TODO.md and basic info via GitHub handler
            const context = await this.fetchBasicProjectContext(repo);
            if (context) {
                this.projectContextCache.set(repo, {
                    context,
                    timestamp: Date.now()
                });
            }
            return context;
        } catch (error) {
            console.error(`[AI Handler] Error fetching context for ${repo}:`, error.message);
            return null;
        }
    }

    /**
     * Fallback: Fetch basic project context using GitHub API
     * @param {string} repo - Repository name (can be "owner/repo" or just "repo")
     * @returns {Promise<Object|null>}
     */
    async fetchBasicProjectContext(repo) {
        try {
            const axios = require('axios');
            const githubToken = process.env.GITHUB_TOKEN;
            const githubUsername = process.env.GITHUB_USERNAME;

            if (!githubToken) {
                console.log('[AI Handler] No GitHub token for project context');
                return null;
            }

            // Handle repo format (owner/repo or just repo)
            const repoPath = repo.includes('/') ? repo : `${githubUsername}/${repo}`;
            const repoName = repo.split('/').pop(); // Just the repo name for display

            const headers = {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            };

            const context = {
                repo: repoPath,
                repoName,
                fetchedAt: new Date().toISOString(),
                todo: null,
                readme: null,
                recentCommits: null,
                keyFiles: []
            };

            // Try to fetch TODO.md via GitHub API
            try {
                const todoResponse = await axios.get(
                    `https://api.github.com/repos/${repoPath}/contents/TODO.md`,
                    { headers, timeout: 5000 }
                );
                if (todoResponse.data && todoResponse.data.content) {
                    const todoContent = Buffer.from(todoResponse.data.content, 'base64').toString('utf8');
                    context.todo = this.parseTodoContent(todoContent);
                }
            } catch (e) {
                // TODO.md might not exist - that's OK
            }

            // Try to fetch README.md via GitHub API
            try {
                const readmeResponse = await axios.get(
                    `https://api.github.com/repos/${repoPath}/readme`,
                    { headers, timeout: 5000 }
                );
                if (readmeResponse.data && readmeResponse.data.content) {
                    const readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf8');
                    // Truncate README to first 500 chars to save context
                    context.readme = readmeContent.substring(0, 500) + (readmeContent.length > 500 ? '...' : '');
                }
            } catch (e) {
                // README might not exist
            }

            // Try to get recent commits via GitHub API
            try {
                const commitsResponse = await axios.get(
                    `https://api.github.com/repos/${repoPath}/commits`,
                    { headers, params: { per_page: 5 }, timeout: 5000 }
                );
                if (commitsResponse.data && commitsResponse.data.length > 0) {
                    context.recentCommits = commitsResponse.data.map(c => ({
                        sha: c.sha?.substring(0, 7),
                        message: c.commit?.message?.split('\n')[0],
                        date: c.commit?.author?.date
                    }));
                }
            } catch (e) {
                // Commits fetch failed
            }

            return context;
        } catch (error) {
            console.error('[AI Handler] fetchBasicProjectContext error:', error.message);
            return null;
        }
    }

    /**
     * Parse TODO.md content into structured tasks
     * @param {string} content - Raw TODO.md content
     * @returns {Object}
     */
    parseTodoContent(content) {
        // Use todoParser if available
        if (todoParser) {
            return todoParser.parse(content);
        }

        // Basic parsing fallback
        const lines = content.split('\n');
        const tasks = {
            total: 0,
            completed: 0,
            pending: [],
            sections: []
        };

        let currentSection = 'General';

        for (const line of lines) {
            // Detect section headers
            if (line.startsWith('#')) {
                currentSection = line.replace(/^#+\s*/, '').trim();
                tasks.sections.push(currentSection);
                continue;
            }

            // Detect checkbox items
            const checkboxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
            if (checkboxMatch) {
                tasks.total++;
                const isComplete = checkboxMatch[1].toLowerCase() === 'x';
                if (isComplete) {
                    tasks.completed++;
                } else {
                    tasks.pending.push({
                        task: checkboxMatch[2].trim(),
                        section: currentSection
                    });
                }
            }
        }

        return tasks;
    }

    /**
     * Format project context for inclusion in system prompt
     * @param {Object} context - Project context object
     * @returns {string}
     */
    formatProjectContext(context) {
        if (!context) return '';

        let formatted = `\n\n📁 CURRENT PROJECT CONTEXT: ${context.repo}\n`;
        formatted += '─'.repeat(40) + '\n';

        // TODO summary
        if (context.todo) {
            const todo = context.todo;
            formatted += `\n📋 TODO Status: ${todo.completed}/${todo.total} complete\n`;
            if (todo.pending && todo.pending.length > 0) {
                formatted += 'Pending tasks:\n';
                // Limit to 5 pending tasks to save context
                const topTasks = todo.pending.slice(0, 5);
                topTasks.forEach(t => {
                    formatted += `  • ${t.task}${t.section !== 'General' ? ` (${t.section})` : ''}\n`;
                });
                if (todo.pending.length > 5) {
                    formatted += `  ... and ${todo.pending.length - 5} more\n`;
                }
            }
        }

        // Recent commits
        if (context.recentCommits && context.recentCommits.length > 0) {
            formatted += '\n📝 Recent commits:\n';
            context.recentCommits.slice(0, 3).forEach(c => {
                formatted += `  • ${c.sha}: ${c.message}\n`;
            });
        }

        // README snippet
        if (context.readme) {
            formatted += `\n📖 README excerpt:\n${context.readme}\n`;
        }

        formatted += '─'.repeat(40) + '\n';
        formatted += 'Use this context to provide project-aware responses.\n';

        return formatted;
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

            // Phase 3: Detect and fetch project context (non-blocking)
            let projectContext = null;
            const projectDetection = this.detectProjectInQuery(query);
            if (projectDetection && projectDetection.confidence >= 0.5) {
                try {
                    projectContext = await this.getProjectContext(query, context.userId);
                    if (projectContext) {
                        console.log(`[AI Handler] Project context loaded for: ${projectContext.repo}`);
                    }
                } catch (contextError) {
                    console.log('[AI Handler] Project context fetch failed, continuing without:', contextError.message);
                }
            }

            let aiResponse;
            let providerUsed = 'claude';

            // Build system prompt with optional project context
            const systemPrompt = this.getSystemPrompt(projectContext);

            // Try multi-AI routing first
            if (providerRegistry && this.providersInitialized) {
                try {
                    // Determine task type for Claude tier selection
                    let taskType = context.taskType;
                    if (!taskType && projectContext) {
                        // Use Opus for planning queries about projects
                        const planningKeywords = ['plan', 'strategy', 'approach', 'should i', 'best way', 'roadmap', 'phase'];
                        const lowerQuery = query.toLowerCase();
                        if (planningKeywords.some(k => lowerQuery.includes(k))) {
                            taskType = 'planning'; // Will use Opus
                        } else {
                            taskType = 'coding'; // Will use Sonnet for code queries
                        }
                    }

                    const result = await providerRegistry.processQuery(query, {
                        ...context,
                        taskType,
                        history: this.conversationHistory.slice(0, -1), // Exclude current query
                        systemPrompt: systemPrompt,
                        skillDocs: this.getDynamicSkillDocs(),
                        projectContext: projectContext // Pass to provider for potential use
                    });

                    aiResponse = result.response;
                    providerUsed = result.provider;

                    // Log which AI was used
                    const tierInfo = result.tier ? ` (${result.tier})` : '';
                    const projectInfo = projectContext ? ` [ctx: ${projectContext.repo}]` : '';
                    console.log(`[AI Handler] Response from ${providerUsed}${tierInfo}${projectInfo}: ${result.tokens || 0} tokens`);

                    // Add correction notice if spelling was fixed
                    if (result.correctedQuery && result.correctedQuery !== query) {
                        console.log(`[AI Handler] Spelling corrected: "${query}" → "${result.correctedQuery}"`);
                    }
                } catch (routerError) {
                    console.error('[AI Handler] Router error, falling back to legacy:', routerError.message);
                    aiResponse = await this.processWithLegacyClaude(query, systemPrompt);
                }
            } else {
                // Fallback to legacy Claude if providers not available
                aiResponse = await this.processWithLegacyClaude(query, systemPrompt);
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
     * @param {string} query - User query
     * @param {string} systemPrompt - Optional custom system prompt (with project context)
     */
    async processWithLegacyClaude(query, systemPrompt = null) {
        const client = this.initClient();

        if (!client) {
            return "AI service not configured. Please set up the ANTHROPIC_API_KEY.";
        }

        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt || this.getSystemPrompt(),
            messages: this.conversationHistory
        });

        return response.content[0].text.trim();
    }

    /**
     * Get system prompt that defines bot behavior
     * @param {Object|null} projectContext - Optional project context to include
     */
    getSystemPrompt(projectContext = null) {
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const githubUser = process.env.GITHUB_USERNAME || 'unknown';

        // Format project context if available
        const projectSection = projectContext ? this.formatProjectContext(projectContext) : '';

        return `You are ClawdBot, a powerful AI assistant running as a WhatsApp bot. You have REAL integrations and capabilities - you're not just a chatbot.
${projectSection}

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

🦞 OPENCLAW (AI Agent Network):
- "join openclaw" - connect to OpenClaw
- "post to openclaw: <message>" - post to OpenClaw
- "openclaw feed" - see what other AIs are posting
- "openclaw status" - check connection

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
     * Clear project context cache (or specific repo)
     * @param {string|null} repo - Repo to clear, or null to clear all
     */
    clearProjectCache(repo = null) {
        if (repo) {
            this.projectContextCache.delete(repo);
            console.log(`[AI Handler] Cleared project cache for: ${repo}`);
        } else {
            this.projectContextCache.clear();
            console.log('[AI Handler] Cleared all project context cache');
        }
    }

    /**
     * Get cached project repos
     * @returns {string[]}
     */
    getCachedProjects() {
        return Array.from(this.projectContextCache.keys());
    }

    /**
     * Set active project for user
     * @param {string} userId - User ID
     * @param {string} repo - Repository name
     */
    setActiveProject(userId, repo) {
        if (activeProject) {
            activeProject.set(userId, repo);
            console.log(`[AI Handler] Active project set for ${userId}: ${repo}`);
        }
    }

    /**
     * Get active project for user
     * @param {string} userId - User ID
     * @returns {string|null}
     */
    getActiveProject(userId) {
        if (activeProject) {
            const active = activeProject.get(userId);
            return active ? active.repo : null;
        }
        return null;
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
     * Get provider health status (includes project context info)
     */
    getHealth() {
        const health = providerRegistry ? providerRegistry.getHealth() : { legacy: { available: !!this.client } };

        // Add project context info
        health.projectContext = {
            enabled: !!(projectManager || todoParser || activeProject),
            cachedProjects: this.getCachedProjects(),
            cacheMaxAge: this.cacheMaxAge / 1000 + 's'
        };

        return health;
    }
}

// Export singleton instance
module.exports = new AIHandler();
