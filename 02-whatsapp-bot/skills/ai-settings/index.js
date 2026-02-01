/**
 * AI Settings Skill - Manage AI provider preferences
 *
 * Commands:
 *   ai mode <economy|quality|balanced>  - Set AI routing preference
 *   ai stats                            - Show AI usage statistics
 *   use groq                            - Set default to Groq (FREE)
 *   use claude                          - Set default to Claude
 *   ai help                             - Show AI settings help
 */

const BaseSkill = require('../base-skill');

// Import provider registry (will be initialized later)
let providerRegistry = null;

class AISettingsSkill extends BaseSkill {
    name = 'ai-settings';
    description = 'Manage AI provider preferences and view usage stats';
    priority = 95; // High priority to intercept AI commands

    commands = [
        { pattern: /^ai\s+mode\s+(economy|quality|balanced)$/i, description: 'Set AI routing mode', usage: 'ai mode economy' },
        { pattern: /^ai\s+stats?$/i, description: 'Show AI usage statistics', usage: 'ai stats' },
        { pattern: /^ai\s+status$/i, description: 'Show AI provider status', usage: 'ai status' },
        { pattern: /^use\s+(groq|claude)$/i, description: 'Set default AI provider', usage: 'use groq' },
        { pattern: /^ai\s+help$/i, description: 'Show AI settings help', usage: 'ai help' },
        { pattern: /^ai\s+providers?$/i, description: 'List available AI providers', usage: 'ai providers' },
        { pattern: /^ai\s+explain\s+(.+)$/i, description: 'Explain routing for a query', usage: 'ai explain <query>' }
    ];

    constructor(context = {}) {
        super(context);
    }

    async execute(command, context) {
        const lowerCmd = (command || '').toLowerCase().trim();

        // Lazy load provider registry
        if (!providerRegistry) {
            try {
                const { registry } = require('../../ai-providers');
                providerRegistry = registry;
            } catch (e) {
                return this.error('AI provider system not available: ' + e.message);
            }
        }

        // ai mode <mode>
        const modeMatch = lowerCmd.match(/^ai\s+mode\s+(economy|quality|balanced)$/i);
        if (modeMatch) {
            return this.setMode(modeMatch[1], context.userId);
        }

        // ai stats
        if (/^ai\s+stats?$/i.test(lowerCmd)) {
            return this.showStats();
        }

        // ai status
        if (/^ai\s+status$/i.test(lowerCmd)) {
            return this.showStatus();
        }

        // use groq / use claude
        const useMatch = lowerCmd.match(/^use\s+(groq|claude)$/i);
        if (useMatch) {
            const provider = useMatch[1].toLowerCase();
            const mode = provider === 'groq' ? 'economy' : 'quality';
            return this.setMode(mode, context.userId);
        }

        // ai providers
        if (/^ai\s+providers?$/i.test(lowerCmd)) {
            return this.showProviders();
        }

        // ai explain <query>
        const explainMatch = command.match(/^ai\s+explain\s+(.+)$/i);
        if (explainMatch) {
            return this.explainRouting(explainMatch[1]);
        }

        // ai help
        if (/^ai\s+help$/i.test(lowerCmd)) {
            return this.showHelp();
        }

        return this.showHelp();
    }

    /**
     * Set AI routing mode
     */
    setMode(mode, userId) {
        const modeDescriptions = {
            economy: 'Groq (FREE) for most queries - maximum savings',
            quality: 'Claude for all queries - best quality',
            balanced: 'Smart routing - FREE for simple, Claude for complex'
        };

        try {
            if (providerRegistry.router) {
                providerRegistry.router.setUserPreference(userId, mode);
            }

            return this.success(
                `*AI Mode Updated* \n\n` +
                `Mode: *${mode.toUpperCase()}*\n` +
                `${modeDescriptions[mode]}\n\n` +
                `_Use "ai stats" to track usage_`
            );
        } catch (error) {
            return this.error(`Failed to set mode: ${error.message}`);
        }
    }

    /**
     * Show usage statistics
     */
    showStats() {
        try {
            const stats = providerRegistry.getStats();

            let response = `*AI Usage Stats* \n\n`;

            // Groq stats
            response += `*Groq (FREE)*\n`;
            response += `  Queries: ${stats.groq.calls}\n`;
            response += `  Tokens: ${stats.groq.tokens.toLocaleString()}\n`;
            response += `  Cost: $0.00 (FREE!)\n\n`;

            // Claude stats
            response += `*Claude*\n`;
            response += `  Queries: ${stats.claude.calls}\n`;
            response += `  Tokens: ${stats.claude.tokens.toLocaleString()}\n`;
            response += `  Est. Cost: $${(stats.claude.estimatedCost || 0).toFixed(4)}\n\n`;

            // Savings
            const total = stats.groq.calls + stats.claude.calls;
            const freePercent = total > 0 ? Math.round((stats.groq.calls / total) * 100) : 0;

            response += `*Savings*\n`;
            response += `  Free queries: ${freePercent}%\n`;
            response += `  Est. saved: $${stats.savings.estimatedSaved}\n\n`;

            response += `_"ai mode economy" for max savings_`;

            return this.success(response);
        } catch (error) {
            return this.error(`Failed to get stats: ${error.message}`);
        }
    }

    /**
     * Show provider status
     */
    showStatus() {
        try {
            const health = providerRegistry.getHealth();
            const providers = providerRegistry.getAvailableProviders();

            let response = `*AI Provider Status* \n\n`;

            for (const name of providers) {
                const info = health[name];
                const emoji = info.available ? '' : '';
                const freeTag = info.isFree ? ' (FREE)' : '';

                response += `${emoji} *${name.charAt(0).toUpperCase() + name.slice(1)}*${freeTag}\n`;
                response += `   Model: ${info.model}\n`;
                response += `   Status: ${info.available ? 'Online' : 'Offline'}\n\n`;
            }

            if (providers.length === 0) {
                response += `_No providers configured_\n`;
                response += `Add GROQ_API_KEY and/or ANTHROPIC_API_KEY`;
            }

            return this.success(response);
        } catch (error) {
            return this.error(`Failed to get status: ${error.message}`);
        }
    }

    /**
     * Show available providers
     */
    showProviders() {
        const providers = [
            {
                name: 'Groq',
                cost: 'FREE',
                models: 'LLaMA 3.3 70B, LLaMA 3.1 8B',
                bestFor: 'Simple queries, greetings, quick questions',
                key: 'GROQ_API_KEY'
            },
            {
                name: 'Claude',
                cost: '$3-15 per 1M tokens',
                models: 'Claude Sonnet 4, Claude Haiku',
                bestFor: 'Code analysis, complex reasoning, detailed explanations',
                key: 'ANTHROPIC_API_KEY'
            }
        ];

        let response = `*Available AI Providers* \n\n`;

        for (const p of providers) {
            const isConfigured = process.env[p.key] ? '' : '';
            response += `${isConfigured} *${p.name}*\n`;
            response += `   Cost: ${p.cost}\n`;
            response += `   Models: ${p.models}\n`;
            response += `   Best for: ${p.bestFor}\n\n`;
        }

        response += `_Use "ai mode <mode>" to change routing_`;

        return this.success(response);
    }

    /**
     * Explain how a query would be routed
     */
    explainRouting(query) {
        try {
            if (!providerRegistry.router) {
                return this.error('Router not initialized');
            }

            const explanation = providerRegistry.router.explainRouting(query);

            let response = `*Routing Analysis* \n\n`;
            response += `Query: "${query}"\n\n`;

            if (explanation.wasCorrected) {
                response += `Corrected: "${explanation.correctedQuery}"\n\n`;
            }

            response += `Provider: *${explanation.selectedProvider.toUpperCase()}*\n`;
            response += `Reason: ${explanation.reason}\n\n`;

            const isFree = explanation.selectedProvider === 'groq';
            response += isFree ? `_This query is FREE!_` : `_This query uses paid API_`;

            return this.success(response);
        } catch (error) {
            return this.error(`Failed to explain: ${error.message}`);
        }
    }

    /**
     * Show help for AI settings
     */
    showHelp() {
        return this.success(
            `*AI Settings Help* \n\n` +
            `*Modes:*\n` +
            `• "ai mode economy" - Use FREE Groq for everything\n` +
            `• "ai mode quality" - Use Claude for everything\n` +
            `• "ai mode balanced" - Smart routing (default)\n\n` +
            `*Quick Switch:*\n` +
            `• "use groq" - Switch to FREE mode\n` +
            `• "use claude" - Switch to quality mode\n\n` +
            `*Info:*\n` +
            `• "ai stats" - View usage & savings\n` +
            `• "ai status" - Provider health check\n` +
            `• "ai providers" - List all providers\n` +
            `• "ai explain <query>" - See routing decision\n\n` +
            `_Default: Balanced mode (saves ~70% costs)_`
        );
    }

    async initialize() {
        await super.initialize();

        // Try to initialize provider registry
        try {
            const { registry } = require('../../ai-providers');
            providerRegistry = registry;
            await providerRegistry.initialize();
            this.log('info', 'AI Settings skill connected to provider registry');
        } catch (e) {
            this.log('warn', 'AI provider registry not yet available: ' + e.message);
        }
    }
}

module.exports = AISettingsSkill;
