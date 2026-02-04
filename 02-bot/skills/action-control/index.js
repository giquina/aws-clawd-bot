/**
 * Action Control Skill
 *
 * Provides override commands for the Action Controller:
 * - undo: Reverse the last action
 * - stop/cancel: Cancel current action
 * - pause: Pause current action
 * - resume: Resume paused action
 * - explain: Get details about pending action
 * - change approach: Suggest alternatives
 * - confirm/yes: Confirm pending action
 * - status: Show action status
 */

const BaseSkill = require('../base-skill');
const { actionController } = require('../../lib/action-controller');

class ActionControlSkill extends BaseSkill {
    name = 'action-control';
    description = 'Override and control actions (undo, pause, stop, explain)';
    priority = 99; // Very high - should intercept control commands first

    commands = [
        {
            pattern: /^undo( that| last| it)?$/i,
            description: 'Undo the last action',
            usage: 'undo'
        },
        {
            pattern: /^(stop|cancel)( that| it| this)?$/i,
            description: 'Cancel current/pending action',
            usage: 'stop'
        },
        {
            pattern: /^pause( that| it)?$/i,
            description: 'Pause current action',
            usage: 'pause'
        },
        {
            pattern: /^resume( that| it)?$/i,
            description: 'Resume paused action',
            usage: 'resume'
        },
        {
            pattern: /^explain( that| it| this)?$/i,
            description: 'Explain pending/current action',
            usage: 'explain'
        },
        {
            pattern: /^change approach$/i,
            description: 'Suggest alternative approaches',
            usage: 'change approach'
        },
        {
            pattern: /^(confirm|yes|do it|proceed|go ahead|approved?)$/i,
            description: 'Confirm pending action',
            usage: 'yes'
        },
        {
            pattern: /^(no|reject|nevermind|never mind|abort)$/i,
            description: 'Reject pending action',
            usage: 'no'
        },
        {
            pattern: /^(what'?s happening|action status|actions?)$/i,
            description: 'Show action status',
            usage: 'action status'
        }
    ];

    /**
     * Check if we should handle this command
     * Only handle if there are active actions, or if it's a status check
     */
    canHandle(command, context = {}) {
        // Always allow status checks
        if (/^(what'?s happening|action status|actions?)$/i.test(command.trim())) {
            return true;
        }

        // For control commands, only handle if there are actions to control
        // or if it's an undo (which checks history)
        if (/^undo/i.test(command.trim())) {
            return actionController.actionHistory.length > 0;
        }

        // For other commands, check if there are active actions
        if (actionController.hasActiveActions()) {
            return super.canHandle(command, context);
        }

        // If no active actions, check if command matches but return false
        // This allows other skills to handle commands like "yes" when there's no pending action
        return false;
    }

    async execute(command, context) {
        const cmd = command.toLowerCase().trim();

        // Undo command
        if (/^undo/i.test(cmd)) {
            return await this.handleUndo(context);
        }

        // Stop/Cancel command
        if (/^(stop|cancel)/i.test(cmd)) {
            return this.handleCancel(context);
        }

        // Pause command
        if (/^pause/i.test(cmd)) {
            return this.handlePause(context);
        }

        // Resume command
        if (/^resume/i.test(cmd)) {
            return await this.handleResume(context);
        }

        // Explain command
        if (/^explain/i.test(cmd)) {
            return this.handleExplain(context);
        }

        // Change approach command
        if (/^change approach$/i.test(cmd)) {
            return await this.handleChangeApproach(context);
        }

        // Confirm command
        if (/^(confirm|yes|do it|proceed|go ahead|approved?)$/i.test(cmd)) {
            return await this.handleConfirm(context);
        }

        // Reject command
        if (/^(no|reject|nevermind|never mind|abort)$/i.test(cmd)) {
            return this.handleReject(context);
        }

        // Status command
        if (/^(what'?s happening|action status|actions?)$/i.test(cmd)) {
            return this.handleStatus(context);
        }

        return this.error('Unknown action control command');
    }

    /**
     * Handle undo command
     */
    async handleUndo(context) {
        this.log('info', 'Handling undo command');

        const result = await actionController.undoLast();

        if (result.success) {
            return this.success(result.message);
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle cancel/stop command
     */
    handleCancel(context) {
        this.log('info', 'Handling cancel command');

        const result = actionController.cancel();

        if (result.success) {
            return this.success(result.message);
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle pause command
     */
    handlePause(context) {
        this.log('info', 'Handling pause command');

        const result = actionController.pause();

        if (result.success) {
            return this.success(result.message);
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle resume command
     */
    async handleResume(context) {
        this.log('info', 'Handling resume command');

        const result = await actionController.resume();

        if (result.success) {
            return this.success(result.message);
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle explain command
     */
    handleExplain(context) {
        this.log('info', 'Handling explain command');

        const result = actionController.explain();

        if (result.success) {
            return { success: true, message: result.message };
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle change approach command
     */
    async handleChangeApproach(context) {
        this.log('info', 'Handling change approach command');

        const result = await actionController.changeApproach();

        if (result.success) {
            let msg = result.message;

            if (result.alternatives && result.alternatives.length > 0) {
                msg += '\n\n';
                result.alternatives.forEach((alt, i) => {
                    msg += `${i + 1}. ${alt.description}\n`;
                });
            }

            return { success: true, message: msg };
        } else {
            return this.error(result.message);
        }
    }

    /**
     * Handle confirm/yes command
     */
    async handleConfirm(context) {
        this.log('info', 'Handling confirm command');

        const pendingId = actionController.getPendingActionId();

        if (!pendingId) {
            return this.error('Nothing pending to confirm');
        }

        try {
            const result = await actionController.executeAction(pendingId);

            if (result.status === 'completed') {
                let msg = result.message || 'Done!';
                if (result.undoAvailable) {
                    msg += '\n\n↩️ Say "undo" to reverse this action';
                }
                return this.success(msg);
            } else if (result.status === 'paused') {
                return { success: true, message: result.message };
            } else if (result.status === 'failed') {
                return this.error(result.message || result.error || 'Action failed');
            } else {
                return { success: true, message: result.message || 'Action completed' };
            }
        } catch (error) {
            this.log('error', 'Confirm failed', error);
            return this.error(`Execution failed: ${error.message}`);
        }
    }

    /**
     * Handle reject/no command
     */
    handleReject(context) {
        this.log('info', 'Handling reject command');

        const result = actionController.cancel();

        if (result.success) {
            return this.success(`Cancelled: ${result.action?.summary || 'pending action'}`);
        } else {
            return this.error('Nothing to cancel');
        }
    }

    /**
     * Handle status command
     */
    handleStatus(context) {
        this.log('info', 'Handling status command');

        const status = actionController.getStatus();

        let msg = '📊 *Action Status*\n\n';

        // Executing actions
        if (status.executing.length > 0) {
            msg += '🔄 *Running:*\n';
            status.executing.forEach(a => {
                msg += `• ${a.summary} (${a.progress})\n`;
            });
            msg += '\n';
        }

        // Pending actions
        if (status.pending.length > 0) {
            msg += '⏳ *Pending confirmation:*\n';
            status.pending.forEach(a => {
                msg += `• ${a.summary}\n`;
            });
            msg += '\n';
        }

        // Paused actions
        if (status.paused.length > 0) {
            msg += '⏸️ *Paused:*\n';
            status.paused.forEach(a => {
                msg += `• ${a.summary}\n`;
            });
            msg += '\n';
        }

        // Recent completed
        if (status.lastCompleted.length > 0) {
            msg += '✅ *Recent:*\n';
            status.lastCompleted.forEach(a => {
                const undoLabel = a.undoAvailable ? ' (undo available)' : '';
                msg += `• ${a.summary}${undoLabel}\n`;
            });
        }

        // No actions
        if (status.executing.length === 0 &&
            status.pending.length === 0 &&
            status.paused.length === 0 &&
            status.lastCompleted.length === 0) {
            msg += 'No active or recent actions.\n\nStart something with natural commands like:\n• "deploy aws-clawd-bot"\n• "create a page for LusoTown"';
        }

        return { success: true, message: msg };
    }
}

module.exports = ActionControlSkill;
