/**
 * Audit Skill for ClawdBot
 *
 * Query and manage audit logs for accountability and debugging.
 *
 * Commands:
 *   audit today       - Today's summary statistics
 *   audit errors      - Recent errors
 *   audit actions     - Recent actions
 *   audit [date]      - Summary for specific date (YYYY-MM-DD)
 *   audit dates       - List available log dates
 */

const BaseSkill = require('../base-skill');
const { auditLogger } = require('../../lib/audit-logger');

class AuditSkill extends BaseSkill {
    name = 'audit';
    description = 'Query audit logs for accountability and debugging';
    priority = 15;

    commands = [
        {
            pattern: /^audit\s+today$/i,
            description: 'View today\'s audit summary',
            usage: 'audit today'
        },
        {
            pattern: /^audit\s+errors$/i,
            description: 'View recent errors',
            usage: 'audit errors'
        },
        {
            pattern: /^audit\s+actions$/i,
            description: 'View recent actions',
            usage: 'audit actions'
        },
        {
            pattern: /^audit\s+dates$/i,
            description: 'List available log dates',
            usage: 'audit dates'
        },
        {
            pattern: /^audit\s+(\d{4}-\d{2}-\d{2})$/i,
            description: 'View summary for specific date',
            usage: 'audit YYYY-MM-DD'
        },
        {
            pattern: /^audit$/i,
            description: 'View today\'s audit summary',
            usage: 'audit'
        }
    ];

    async execute(command, context) {
        const { raw } = this.parseCommand(command);
        const lowerCommand = raw.toLowerCase().trim();

        try {
            // audit today or just audit
            if (lowerCommand === 'audit today' || lowerCommand === 'audit') {
                return await this.showTodaySummary();
            }

            // audit errors
            if (lowerCommand === 'audit errors') {
                return await this.showRecentErrors();
            }

            // audit actions
            if (lowerCommand === 'audit actions') {
                return await this.showRecentActions();
            }

            // audit dates
            if (lowerCommand === 'audit dates') {
                return await this.showAvailableDates();
            }

            // audit YYYY-MM-DD
            const dateMatch = raw.match(/^audit\s+(\d{4}-\d{2}-\d{2})$/i);
            if (dateMatch) {
                return await this.showDateSummary(dateMatch[1]);
            }

            return this.error('Unknown audit command', null, {
                suggestion: 'Try: audit today, audit errors, audit actions, audit dates, audit YYYY-MM-DD'
            });
        } catch (err) {
            this.log('error', 'Audit error', err);
            return this.error('Audit query failed', err);
        }
    }

    /**
     * Show today's audit summary
     */
    async showTodaySummary() {
        const summary = await auditLogger.getDailySummary();
        return this.formatSummary(summary);
    }

    /**
     * Show summary for a specific date
     */
    async showDateSummary(date) {
        const summary = await auditLogger.getDailySummary(date);

        if (summary.totalEvents === 0) {
            return this.success(`No audit logs found for ${date}`);
        }

        return this.formatSummary(summary);
    }

    /**
     * Format summary for WhatsApp display
     */
    formatSummary(summary) {
        let output = `*Audit Summary: ${summary.date}*\n`;
        output += `${'='.repeat(24)}\n\n`;

        // Messages
        output += `*Messages*\n`;
        output += `  Received: ${summary.messagesReceived}\n`;
        output += `  Sent: ${summary.messagesSent}\n\n`;

        // Actions
        if (summary.actionsProposed > 0) {
            output += `*Actions*\n`;
            output += `  Proposed: ${summary.actionsProposed}\n`;
            output += `  Confirmed: ${summary.actionsConfirmed}\n`;
            output += `  Executed: ${summary.actionsExecuted}`;
            if (summary.actionsExecuted > 0) {
                const successRate = ((summary.actionsSuccessful / summary.actionsExecuted) * 100).toFixed(0);
                output += ` (${successRate}% success)`;
            }
            output += `\n`;
            output += `  Cancelled: ${summary.actionsCancelled}\n\n`;
        }

        // Skills
        output += `*Skills*\n`;
        output += `  Executions: ${summary.skillExecutions}`;
        if (summary.skillExecutions > 0) {
            const successRate = ((summary.skillsSuccessful / summary.skillExecutions) * 100).toFixed(0);
            output += ` (${successRate}% success)`;
        }
        output += `\n`;

        if (summary.topSkills && summary.topSkills.length > 0) {
            output += `  Top skills:\n`;
            summary.topSkills.forEach(s => {
                output += `    - ${s.name}: ${s.count}\n`;
            });
        }
        output += `\n`;

        // AI
        output += `*AI Queries*\n`;
        output += `  Total: ${summary.aiQueries}\n`;
        if (summary.totalAICost > 0) {
            output += `  Cost: $${summary.totalAICost.toFixed(4)}\n`;
        }
        if (summary.aiByProvider && Object.keys(summary.aiByProvider).length > 0) {
            output += `  By provider:\n`;
            Object.entries(summary.aiByProvider).forEach(([provider, count]) => {
                output += `    - ${provider}: ${count}\n`;
            });
        }
        output += `\n`;

        // Errors
        if (summary.errors > 0) {
            output += `*Errors*\n`;
            output += `  Count: ${summary.errors}\n\n`;
        }

        // Voice & Webhooks
        if (summary.voiceCalls > 0 || summary.webhooks > 0) {
            output += `*Other*\n`;
            if (summary.voiceCalls > 0) {
                output += `  Voice calls: ${summary.voiceCalls}\n`;
            }
            if (summary.webhooks > 0) {
                output += `  Webhooks: ${summary.webhooks}\n`;
            }
            if (summary.deployments > 0) {
                output += `  Deployments: ${summary.deployments} (${summary.deploymentsSuccessful} success)\n`;
            }
            output += `\n`;
        }

        // Platforms
        if (summary.platforms && Object.keys(summary.platforms).length > 0) {
            output += `*Platforms*\n`;
            Object.entries(summary.platforms).forEach(([platform, count]) => {
                output += `  - ${platform}: ${count}\n`;
            });
            output += `\n`;
        }

        output += `${'='.repeat(24)}\n`;
        output += `_Total events: ${summary.totalEvents}_`;

        return this.success(output);
    }

    /**
     * Show recent errors
     */
    async showRecentErrors() {
        const errors = await auditLogger.getRecentErrors(15);

        if (errors.length === 0) {
            return this.success('No recent errors found');
        }

        let output = `*Recent Errors*\n`;
        output += `${'='.repeat(24)}\n\n`;

        errors.reverse().forEach((err, i) => {
            const time = this.formatTime(err.timestamp);
            output += `${i + 1}. [${time}]\n`;
            output += `   ${err.error?.substring(0, 80) || 'Unknown error'}\n`;
            if (err.skill) {
                output += `   _Skill: ${err.skill}_\n`;
            }
            if (err.context) {
                output += `   _Context: ${JSON.stringify(err.context).substring(0, 50)}_\n`;
            }
            output += `\n`;
        });

        output += `_Showing ${errors.length} most recent errors_`;

        return this.success(output);
    }

    /**
     * Show recent actions
     */
    async showRecentActions() {
        const actions = await auditLogger.getRecentActions(20);

        if (actions.length === 0) {
            return this.success('No recent actions found');
        }

        let output = `*Recent Actions*\n`;
        output += `${'='.repeat(24)}\n\n`;

        // Group by actionId to show flow
        const grouped = {};
        actions.forEach(a => {
            const id = a.actionId || 'unknown';
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(a);
        });

        Object.entries(grouped).slice(-10).forEach(([actionId, events]) => {
            const first = events[0];
            const last = events[events.length - 1];

            output += `*${actionId.substring(0, 8)}...*\n`;

            if (first.intent) {
                output += `  Intent: ${first.intent.substring(0, 40)}\n`;
            }
            if (first.actionType) {
                output += `  Type: ${first.actionType}\n`;
            }

            const statuses = events.map(e => {
                const status = e.type.replace('action_', '');
                if (e.success === false) return `${status}(fail)`;
                return status;
            });
            output += `  Flow: ${statuses.join(' -> ')}\n`;

            if (last.duration) {
                output += `  Duration: ${last.duration}ms\n`;
            }
            output += `\n`;
        });

        output += `_Showing ${Math.min(10, Object.keys(grouped).length)} recent actions_`;

        return this.success(output);
    }

    /**
     * Show available log dates
     */
    async showAvailableDates() {
        const dates = await auditLogger.listLogDates();

        if (dates.length === 0) {
            return this.success('No audit logs available yet');
        }

        let output = `*Available Audit Logs*\n`;
        output += `${'='.repeat(24)}\n\n`;

        dates.slice(0, 14).forEach(date => {
            const isToday = date === new Date().toISOString().split('T')[0];
            output += `- ${date}${isToday ? ' (today)' : ''}\n`;
        });

        if (dates.length > 14) {
            output += `\n_...and ${dates.length - 14} more_\n`;
        }

        output += `\nTo view: audit YYYY-MM-DD`;

        return this.success(output);
    }

    /**
     * Format timestamp for display
     */
    formatTime(isoString) {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'unknown';
        }
    }

    /**
     * Initialize the skill
     */
    async initialize() {
        await super.initialize();
        this.log('info', 'Audit skill ready');
    }
}

module.exports = AuditSkill;
