/**
 * Action Controller
 * Manages action lifecycle: propose -> confirm -> execute -> track -> undo
 * WhatsApp remains single source of truth
 *
 * Flow:
 * 1. User request -> proposeAction() -> returns plan for review
 * 2. User confirms -> executeAction() -> runs steps with tracking
 * 3. User can: undo, pause, stop, change approach, explain
 */

class ActionController {
    constructor() {
        /** @type {Map<string, Object>} Actions awaiting confirmation */
        this.pendingActions = new Map();

        /** @type {Map<string, Object>} Currently running actions */
        this.executingActions = new Map();

        /** @type {Array<Object>} Completed actions (for undo) */
        this.actionHistory = [];

        /** @type {number} Keep last N actions */
        this.maxHistory = 50;

        /** @type {Map<string, Object>} Paused actions */
        this.pausedActions = new Map();

        // Confidence thresholds for flow routing
        this.thresholds = {
            AUTO_EXECUTE: 0.95,      // Very confident, execute immediately
            CONFIRM_REQUIRED: 0.7,   // Needs user confirmation
            CLARIFY_REQUIRED: 0.5,   // Need to ask clarifying questions
            REJECT: 0.3              // Too uncertain, ask user to rephrase
        };

        // Step executor reference (will be injected or lazy-loaded)
        this._executor = null;

        console.log('[ActionController] Initialized');
    }

    /**
     * Generate unique action ID
     * @returns {string}
     */
    generateId() {
        return `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    /**
     * Propose an action (doesn't execute yet)
     * Returns action plan for user review
     * @param {Object} intent - Classified intent from intent-classifier
     * @param {Object} context - Execution context
     * @returns {Promise<{action: Object, flow: string, message: string}>}
     */
    async proposeAction(intent, context = {}) {
        const actionId = this.generateId();

        const action = {
            id: actionId,
            intent: intent,
            type: intent.actionType || intent.action || 'unknown',
            target: intent.target || intent.project || null,
            confidence: intent.confidence || 0.5,
            steps: await this.planSteps(intent),
            risks: this.assessRisks(intent),
            reversible: this.isReversible(intent),
            undoSteps: this.planUndoSteps(intent),
            status: 'pending',
            proposedAt: Date.now(),
            context: context,
            completedSteps: []
        };

        // Summary for display
        action.summary = intent.summary || this.generateSummary(action);

        this.pendingActions.set(actionId, action);

        // Decide flow based on confidence and risk
        if (action.confidence >= this.thresholds.AUTO_EXECUTE && action.risks.level === 'low') {
            return {
                action,
                flow: 'auto_execute',
                message: this.formatAutoExecuteMessage(action)
            };
        } else if (action.confidence >= this.thresholds.CONFIRM_REQUIRED) {
            return {
                action,
                flow: 'confirm',
                message: this.formatConfirmMessage(action)
            };
        } else if (action.confidence >= this.thresholds.CLARIFY_REQUIRED) {
            return {
                action,
                flow: 'clarify',
                message: this.formatClarifyMessage(action)
            };
        } else {
            return {
                action,
                flow: 'reject',
                message: this.formatRejectMessage(action)
            };
        }
    }

    /**
     * Execute a confirmed action
     * @param {string} actionId - Action ID to execute
     * @returns {Promise<{status: string, results?: Array, error?: string}>}
     */
    async executeAction(actionId) {
        const action = this.pendingActions.get(actionId);
        if (!action) {
            throw new Error('Action not found or already executed');
        }

        action.status = 'executing';
        action.startedAt = Date.now();
        this.executingActions.set(actionId, action);
        this.pendingActions.delete(actionId);

        try {
            // Execute each step
            const results = [];
            for (let i = 0; i < action.steps.length; i++) {
                const step = action.steps[i];

                // Check if action was paused or cancelled
                if (action.status === 'paused') {
                    return {
                        status: 'paused',
                        completedSteps: results,
                        message: `Paused at step ${i + 1}/${action.steps.length}: ${step.description || step.type}`
                    };
                }
                if (action.status === 'cancelled') {
                    return {
                        status: 'cancelled',
                        completedSteps: results,
                        message: 'Action was cancelled'
                    };
                }

                // Execute step
                const result = await this.executeStep(step, action.context);
                results.push({ step, result, completedAt: Date.now() });
                action.completedSteps = results;
            }

            // Mark complete
            action.status = 'completed';
            action.completedAt = Date.now();
            action.results = results;

            // Add to history for undo
            this.addToHistory(action);
            this.executingActions.delete(actionId);

            return {
                status: 'completed',
                results,
                undoAvailable: action.reversible,
                message: this.formatCompletionMessage(action)
            };

        } catch (error) {
            action.status = 'failed';
            action.error = error.message;
            action.failedAt = Date.now();
            this.executingActions.delete(actionId);

            return {
                status: 'failed',
                error: error.message,
                completedSteps: action.completedSteps || [],
                message: `Action failed: ${error.message}`
            };
        }
    }

    // ============ OVERRIDE COMMANDS ============

    /**
     * Undo the last reversible action
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async undoLast() {
        // Find last reversible action that hasn't been undone
        const lastAction = [...this.actionHistory]
            .reverse()
            .find(a => a.reversible && !a.undone);

        if (!lastAction) {
            return { success: false, message: 'Nothing to undo - no reversible actions in history' };
        }

        if (!lastAction.undoSteps || lastAction.undoSteps.length === 0) {
            return {
                success: false,
                message: `Cannot undo "${lastAction.type}" - no undo steps defined`
            };
        }

        try {
            // Execute undo steps
            for (const step of lastAction.undoSteps) {
                await this.executeStep(step, lastAction.context);
            }

            lastAction.undone = true;
            lastAction.undoneAt = Date.now();

            return {
                success: true,
                message: `Undid: ${lastAction.summary || lastAction.type}`,
                action: lastAction
            };
        } catch (error) {
            return {
                success: false,
                message: `Undo failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Pause the current or specified action
     * @param {string|null} actionId - Action ID, or null for active action
     * @returns {{success: boolean, message: string}}
     */
    pause(actionId = null) {
        const id = actionId || this.getActiveActionId();
        const action = this.executingActions.get(id);

        if (action) {
            action.status = 'paused';
            action.pausedAt = Date.now();
            this.pausedActions.set(id, action);

            return {
                success: true,
                message: `Paused: ${action.summary || action.type}`,
                action: action
            };
        }

        return { success: false, message: 'No active action to pause' };
    }

    /**
     * Resume a paused action
     * @param {string|null} actionId - Action ID, or null for first paused action
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async resume(actionId = null) {
        const id = actionId || this.getPausedActionId();
        const action = this.pausedActions.get(id);

        if (action) {
            action.status = 'executing';
            action.resumedAt = Date.now();
            this.pausedActions.delete(id);
            this.executingActions.set(id, action);

            // Continue execution from where we left off
            try {
                const completedCount = action.completedSteps?.length || 0;
                const remainingSteps = action.steps.slice(completedCount);
                const results = [...(action.completedSteps || [])];

                for (const step of remainingSteps) {
                    if (action.status === 'paused' || action.status === 'cancelled') {
                        break;
                    }

                    const result = await this.executeStep(step, action.context);
                    results.push({ step, result, completedAt: Date.now() });
                    action.completedSteps = results;
                }

                if (action.status === 'executing') {
                    action.status = 'completed';
                    action.completedAt = Date.now();
                    action.results = results;
                    this.addToHistory(action);
                    this.executingActions.delete(id);
                }

                return {
                    success: true,
                    message: `Resumed and completed: ${action.summary || action.type}`,
                    status: action.status
                };
            } catch (error) {
                action.status = 'failed';
                action.error = error.message;
                this.executingActions.delete(id);

                return {
                    success: false,
                    message: `Resume failed: ${error.message}`,
                    error: error.message
                };
            }
        }

        return { success: false, message: 'No paused action to resume' };
    }

    /**
     * Cancel/stop the current or specified action
     * @param {string|null} actionId - Action ID, or null for any active action
     * @returns {{success: boolean, message: string}}
     */
    cancel(actionId = null) {
        const id = actionId ||
                   this.getActiveActionId() ||
                   this.getPendingActionId() ||
                   this.getPausedActionId();

        let action = this.executingActions.get(id) ||
                     this.pendingActions.get(id) ||
                     this.pausedActions.get(id);

        if (action) {
            action.status = 'cancelled';
            action.cancelledAt = Date.now();

            // Remove from all maps
            this.executingActions.delete(id);
            this.pendingActions.delete(id);
            this.pausedActions.delete(id);

            return {
                success: true,
                message: `Cancelled: ${action.summary || action.type}`,
                action: action
            };
        }

        return { success: false, message: 'No action to cancel' };
    }

    /**
     * Explain the current or pending action in detail
     * @param {string|null} actionId - Action ID, or null for pending/active action
     * @returns {{success: boolean, message: string}}
     */
    explain(actionId = null) {
        const id = actionId || this.getPendingActionId() || this.getActiveActionId();
        const action = this.pendingActions.get(id) ||
                       this.executingActions.get(id) ||
                       this.pausedActions.get(id);

        if (!action) {
            return { success: false, message: 'No action to explain' };
        }

        return {
            success: true,
            message: this.formatDetailedExplanation(action),
            action: action
        };
    }

    /**
     * Suggest alternative approaches for current action
     * @param {string|null} actionId - Action ID, or null for pending action
     * @param {string|null} newApproach - User-suggested approach
     * @returns {Promise<{success: boolean, message: string, alternatives?: Array}>}
     */
    async changeApproach(actionId = null, newApproach = null) {
        const id = actionId || this.getPendingActionId();
        const action = this.pendingActions.get(id);

        if (!action) {
            return { success: false, message: 'No pending action to change' };
        }

        // Cancel current approach
        this.cancel(id);

        // Generate alternative approaches
        const alternatives = await this.generateAlternatives(action.intent, newApproach);

        return {
            success: true,
            message: 'Here are alternative approaches:',
            alternatives: alternatives,
            originalAction: action
        };
    }

    // ============ HELPER METHODS ============

    /**
     * Get the first active action ID
     * @returns {string|undefined}
     */
    getActiveActionId() {
        return this.executingActions.keys().next().value;
    }

    /**
     * Get the first pending action ID
     * @returns {string|undefined}
     */
    getPendingActionId() {
        return this.pendingActions.keys().next().value;
    }

    /**
     * Get the first paused action ID
     * @returns {string|undefined}
     */
    getPausedActionId() {
        return this.pausedActions.keys().next().value;
    }

    /**
     * Add action to history
     * @param {Object} action - Completed action
     */
    addToHistory(action) {
        this.actionHistory.push(action);

        // Trim history if needed
        if (this.actionHistory.length > this.maxHistory) {
            this.actionHistory.shift();
        }
    }

    /**
     * Plan execution steps for an intent
     * @param {Object} intent - The intent object
     * @returns {Promise<Array>}
     */
    async planSteps(intent) {
        // If intent already has steps, use them
        if (intent.steps && intent.steps.length > 0) {
            return intent.steps;
        }

        // Default step based on action type
        const stepMap = {
            'deploy': [
                { type: 'git_pull', description: 'Pull latest code' },
                { type: 'npm_install', description: 'Install dependencies' },
                { type: 'restart_service', description: 'Restart service' }
            ],
            'create-page': [
                { type: 'create_branch', description: 'Create feature branch' },
                { type: 'generate_code', description: 'Generate page code' },
                { type: 'commit', description: 'Commit changes' },
                { type: 'create_pr', description: 'Create pull request' }
            ],
            'create-feature': [
                { type: 'create_branch', description: 'Create feature branch' },
                { type: 'generate_code', description: 'Generate feature code' },
                { type: 'commit', description: 'Commit changes' },
                { type: 'create_pr', description: 'Create pull request' }
            ],
            'code-task': [
                { type: 'analyze', description: 'Analyze codebase' },
                { type: 'generate_solution', description: 'Generate solution' },
                { type: 'create_pr', description: 'Create pull request' }
            ],
            'create-task': [
                { type: 'create_issue', description: 'Create GitHub issue' }
            ],
            'check-status': [
                { type: 'fetch_status', description: 'Fetch project status' }
            ]
        };

        return stepMap[intent.actionType] || [
            { type: 'execute', command: intent.command, description: intent.summary || 'Execute action' }
        ];
    }

    /**
     * Plan undo steps based on action type
     * @param {Object} intent - The intent object
     * @returns {Array}
     */
    planUndoSteps(intent) {
        const undoMap = {
            'deploy': [
                { type: 'rollback', description: 'Rollback to previous version' }
            ],
            'create-page': [
                { type: 'delete_branch', description: 'Delete feature branch' },
                { type: 'close_pr', description: 'Close pull request' }
            ],
            'create-feature': [
                { type: 'delete_branch', description: 'Delete feature branch' },
                { type: 'close_pr', description: 'Close pull request' }
            ],
            'create_file': [
                { type: 'delete_file', path: intent.path, description: 'Delete created file' }
            ],
            'git_commit': [
                { type: 'git_revert', commit: 'HEAD', description: 'Revert last commit' }
            ],
            'create_branch': [
                { type: 'delete_branch', branch: intent.branch, description: 'Delete created branch' }
            ],
            'create-task': [
                { type: 'close_issue', description: 'Close created issue' }
            ]
        };

        return undoMap[intent.actionType] || [];
    }

    /**
     * Check if an action type is reversible
     * @param {Object} intent - The intent object
     * @returns {boolean}
     */
    isReversible(intent) {
        const reversibleTypes = [
            'deploy',
            'create-page',
            'create-feature',
            'create_file',
            'git_commit',
            'create_branch',
            'create-task'
        ];
        return reversibleTypes.includes(intent.actionType);
    }

    /**
     * Assess risks of an action
     * @param {Object} intent - The intent object
     * @returns {{level: string, factors: Array}}
     */
    assessRisks(intent) {
        const risks = { level: 'low', factors: [] };

        // Action type risks
        if (intent.actionType === 'deploy') {
            risks.factors.push('Production deployment');
            risks.level = 'medium';
        }
        if (intent.actionType === 'delete' || intent.actionType?.includes('delete')) {
            risks.factors.push('Destructive action');
            risks.level = 'high';
        }

        // Target risks
        const target = intent.target || intent.branch || '';
        if (['main', 'master', 'production', 'prod'].includes(target.toLowerCase())) {
            risks.factors.push('Affects main/production branch');
            risks.level = 'high';
        }

        // Confidence risks
        if (intent.confidence && intent.confidence < 0.7) {
            risks.factors.push('Low confidence classification');
            if (risks.level === 'low') risks.level = 'medium';
        }

        return risks;
    }

    /**
     * Generate action summary
     * @param {Object} action - The action object
     * @returns {string}
     */
    generateSummary(action) {
        const type = action.type || action.intent?.actionType || 'action';
        const target = action.target || action.intent?.target || '';

        const summaryMap = {
            'deploy': `Deploy ${target}`,
            'create-page': `Create page in ${target}`,
            'create-feature': `Add feature to ${target}`,
            'create-task': `Create issue in ${target}`,
            'code-task': `Code task for ${target}`,
            'check-status': `Check status of ${target}`
        };

        return summaryMap[type] || `${type} ${target}`.trim();
    }

    /**
     * Execute a single step
     * @param {Object} step - Step definition
     * @param {Object} context - Execution context
     * @returns {Promise<Object>}
     */
    async executeStep(step, context) {
        // Lazy-load action executor
        if (!this._executor) {
            try {
                this._executor = require('./action-executor');
            } catch (e) {
                console.log('[ActionController] Action executor not available:', e.message);
            }
        }

        // If we have an executor with step support, use it
        if (this._executor && typeof this._executor.execute === 'function') {
            return await this._executor.execute(step.type, step, context);
        }

        // Fallback: simulate step execution
        console.log(`[ActionController] Executing step: ${step.type} - ${step.description}`);
        return {
            success: true,
            step: step.type,
            message: step.description || 'Step completed'
        };
    }

    /**
     * Generate alternative approaches using AI
     * @param {Object} intent - Original intent
     * @param {string|null} userSuggestion - User's suggestion
     * @returns {Promise<Array>}
     */
    async generateAlternatives(intent, userSuggestion = null) {
        // Try to use AI handler for suggestions
        try {
            const aiHandler = require('../ai-handler');
            const prompt = userSuggestion
                ? `For the task "${intent.summary || intent.actionType}": suggest 3 alternative approaches, considering the user's preference for: "${userSuggestion}"`
                : `Suggest 3 alternative approaches to: "${intent.summary || intent.actionType}"`;

            const response = await aiHandler.processQuery(prompt, { taskType: 'planning' });

            // Parse response into alternatives
            return [{
                description: response,
                confidence: 0.7
            }];
        } catch (e) {
            console.log('[ActionController] AI alternative generation failed:', e.message);
        }

        // Fallback: generic alternatives
        return [
            { description: 'Try a different approach', confidence: 0.5 },
            { description: 'Break into smaller steps', confidence: 0.5 },
            { description: 'Ask for more details', confidence: 0.5 }
        ];
    }

    // ============ MESSAGE FORMATTING ============

    /**
     * Format message for auto-execute flow
     * @param {Object} action - The action
     * @returns {string}
     */
    formatAutoExecuteMessage(action) {
        return `Executing: ${action.summary}\n(High confidence, low risk - proceeding automatically)`;
    }

    /**
     * Format message for confirmation flow
     * @param {Object} action - The action
     * @returns {string}
     */
    formatConfirmMessage(action) {
        const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[action.risks.level];

        let msg = `${riskEmoji} *${action.summary}*\n\n`;

        // Steps preview
        if (action.steps.length > 0) {
            msg += `Steps:\n`;
            action.steps.forEach((s, i) => {
                msg += `${i + 1}. ${s.description || s.type}\n`;
            });
            msg += '\n';
        }

        // Risk info
        msg += `Risk: ${action.risks.level}`;
        if (action.risks.factors.length > 0) {
            msg += ` (${action.risks.factors.join(', ')})`;
        }
        msg += '\n';

        // Reversibility
        msg += action.reversible ? '↩️ Can be undone\n' : '⚠️ Cannot be undone\n';

        msg += '\nReply: *yes* to confirm, *explain* for details, *cancel* to abort';

        return msg;
    }

    /**
     * Format message for clarification flow
     * @param {Object} action - The action
     * @returns {string}
     */
    formatClarifyMessage(action) {
        return `I'm ${Math.round(action.confidence * 100)}% sure you want to: ${action.summary}\n\n` +
               `Could you clarify:\n` +
               `• Which project/repo?\n` +
               `• What exactly should I do?\n\n` +
               `Or reply *yes* if this is correct.`;
    }

    /**
     * Format message for reject flow
     * @param {Object} action - The action
     * @returns {string}
     */
    formatRejectMessage(action) {
        return `I'm not sure what you want to do (${Math.round(action.confidence * 100)}% confidence).\n\n` +
               `Could you rephrase? For example:\n` +
               `• "deploy aws-clawd-bot"\n` +
               `• "create a login page for LusoTown"\n` +
               `• "check status of judo-website"`;
    }

    /**
     * Format detailed explanation
     * @param {Object} action - The action
     * @returns {string}
     */
    formatDetailedExplanation(action) {
        let msg = `📋 *Action Explanation*\n\n`;
        msg += `*What:* ${action.summary}\n`;
        msg += `*Type:* ${action.type}\n`;

        if (action.target) {
            msg += `*Target:* ${action.target}\n`;
        }

        msg += `*Confidence:* ${Math.round((action.confidence || 0) * 100)}%\n`;
        msg += `*Status:* ${action.status}\n\n`;

        // Steps
        if (action.steps && action.steps.length > 0) {
            msg += `*Steps:*\n`;
            action.steps.forEach((s, i) => {
                const done = action.completedSteps?.find(cs => cs.step === s);
                const status = done ? '✅' : '⬜';
                msg += `${status} ${i + 1}. ${s.description || s.type}\n`;
            });
            msg += '\n';
        }

        // Risks
        msg += `*Risks:*\n`;
        if (action.risks.factors.length > 0) {
            action.risks.factors.forEach(f => {
                msg += `• ${f}\n`;
            });
        } else {
            msg += `• None identified\n`;
        }
        msg += '\n';

        // Reversibility
        msg += `*Reversible:* ${action.reversible ? 'Yes' : 'No'}\n`;
        if (action.reversible && action.undoSteps?.length > 0) {
            msg += `*Undo steps:*\n`;
            action.undoSteps.forEach(s => {
                msg += `• ${s.description || s.type}\n`;
            });
        }

        return msg;
    }

    /**
     * Format completion message
     * @param {Object} action - The completed action
     * @returns {string}
     */
    formatCompletionMessage(action) {
        const duration = action.completedAt - action.startedAt;
        const seconds = Math.round(duration / 1000);

        let msg = `✅ *${action.summary}* completed`;

        if (seconds > 0) {
            msg += ` (${seconds}s)`;
        }

        if (action.reversible) {
            msg += '\n\n↩️ Say "undo" to reverse this action';
        }

        return msg;
    }

    // ============ STATUS & INFO ============

    /**
     * Get current status of all actions
     * @returns {Object}
     */
    getStatus() {
        return {
            pending: Array.from(this.pendingActions.values()).map(a => ({
                id: a.id,
                summary: a.summary,
                status: a.status,
                type: a.type,
                confidence: a.confidence,
                proposedAt: a.proposedAt
            })),
            executing: Array.from(this.executingActions.values()).map(a => ({
                id: a.id,
                summary: a.summary,
                status: a.status,
                progress: `${a.completedSteps?.length || 0}/${a.steps?.length || 0}`,
                startedAt: a.startedAt
            })),
            paused: Array.from(this.pausedActions.values()).map(a => ({
                id: a.id,
                summary: a.summary,
                status: a.status,
                pausedAt: a.pausedAt
            })),
            lastCompleted: this.actionHistory.slice(-3).map(a => ({
                id: a.id,
                summary: a.summary,
                status: a.status,
                undoAvailable: a.reversible && !a.undone,
                completedAt: a.completedAt
            }))
        };
    }

    /**
     * Get action by ID
     * @param {string} actionId - Action ID
     * @returns {Object|null}
     */
    getAction(actionId) {
        return this.pendingActions.get(actionId) ||
               this.executingActions.get(actionId) ||
               this.pausedActions.get(actionId) ||
               this.actionHistory.find(a => a.id === actionId) ||
               null;
    }

    /**
     * Check if there are any active actions
     * @returns {boolean}
     */
    hasActiveActions() {
        return this.pendingActions.size > 0 ||
               this.executingActions.size > 0 ||
               this.pausedActions.size > 0;
    }

    /**
     * Clear all pending/paused actions (cleanup)
     */
    clearPending() {
        this.pendingActions.clear();
        this.pausedActions.clear();
        console.log('[ActionController] Cleared pending and paused actions');
    }

    /**
     * Clear action history
     */
    clearHistory() {
        this.actionHistory = [];
        console.log('[ActionController] Cleared action history');
    }
}

// Singleton instance
const actionController = new ActionController();

module.exports = {
    ActionController,
    actionController
};
