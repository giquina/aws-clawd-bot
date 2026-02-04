/**
 * Audit Logger
 * Tracks all actions for accountability, debugging, and compliance
 * Telegram remains single source of truth - all actions logged
 *
 * Features:
 * - Buffered writes to minimize disk I/O
 * - Daily log rotation (JSONL format)
 * - Type-specific logging methods
 * - Query and summary capabilities
 *
 * Log Types:
 * - incoming_message: Messages received from users
 * - outgoing_message: Messages sent to users
 * - action_proposed: Actions suggested by AI
 * - action_confirmed: User-confirmed actions
 * - action_executed: Completed actions
 * - action_undone: Reverted actions
 * - action_cancelled: Cancelled actions
 * - skill_execution: Skill invocations
 * - ai_query: AI provider calls
 * - escalation: Alert escalations
 * - voice_call: Voice call events
 * - error: Error events
 * - security: Security-related events
 */

const fs = require('fs').promises;
const path = require('path');

class AuditLogger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs/audit');
        this.currentLogFile = null;
        this.buffer = [];
        this.flushInterval = 5000; // Flush every 5s
        this.maxBufferSize = 100;
        this.flushTimer = null;
        this._initialized = false;

        this.init();
    }

    /**
     * Initialize the audit logger
     */
    async init() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
            this.currentLogFile = this.getLogFileName();
            this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
            this._initialized = true;
            console.log('[AuditLogger] Initialized, logging to:', this.logDir);
        } catch (error) {
            console.error('[AuditLogger] Failed to initialize:', error.message);
        }
    }

    /**
     * Get log file name for current date
     */
    getLogFileName() {
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `audit-${date}.jsonl`);
    }

    /**
     * Log an event
     * @param {Object} event - Event data
     * @returns {Object} The logged entry with timestamp
     */
    log(event) {
        const entry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        this.buffer.push(JSON.stringify(entry));

        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }

        return entry;
    }

    // ============ Specific Log Methods ============

    /**
     * Log an incoming message
     */
    logIncomingMessage(userId, platform, message, metadata = {}) {
        return this.log({
            type: 'incoming_message',
            userId: this.sanitizeUserId(userId),
            platform,
            message: message.substring(0, 500), // Truncate for privacy
            messageLength: message.length,
            hasMedia: !!metadata.mediaUrl,
            mediaType: metadata.mediaType || null,
            ...metadata
        });
    }

    /**
     * Log an outgoing message
     */
    logOutgoingMessage(userId, platform, message, metadata = {}) {
        return this.log({
            type: 'outgoing_message',
            userId: this.sanitizeUserId(userId),
            platform,
            messageLength: message.length,
            truncated: message.length > 4000,
            ...metadata
        });
    }

    /**
     * Log a proposed action
     */
    logActionProposed(actionId, intent, confidence, userId) {
        return this.log({
            type: 'action_proposed',
            actionId,
            intent: intent.summary || intent,
            actionType: intent.actionType || null,
            target: intent.target || null,
            confidence,
            userId: this.sanitizeUserId(userId)
        });
    }

    /**
     * Log an action confirmation
     */
    logActionConfirmed(actionId, userId) {
        return this.log({
            type: 'action_confirmed',
            actionId,
            userId: this.sanitizeUserId(userId)
        });
    }

    /**
     * Log an executed action
     */
    logActionExecuted(actionId, result, duration) {
        return this.log({
            type: 'action_executed',
            actionId,
            success: result.status === 'completed',
            status: result.status,
            duration,
            error: result.error || null
        });
    }

    /**
     * Log an undone action
     */
    logActionUndone(actionId, success, userId) {
        return this.log({
            type: 'action_undone',
            actionId,
            success,
            userId: this.sanitizeUserId(userId)
        });
    }

    /**
     * Log a cancelled action
     */
    logActionCancelled(actionId, reason, userId) {
        return this.log({
            type: 'action_cancelled',
            actionId,
            reason,
            userId: this.sanitizeUserId(userId)
        });
    }

    /**
     * Log a skill execution
     */
    logSkillExecution(skillName, command, success, duration, metadata = {}) {
        return this.log({
            type: 'skill_execution',
            skill: skillName,
            command: command.substring(0, 100),
            success,
            duration,
            ...metadata
        });
    }

    /**
     * Log an AI query
     */
    logAIQuery(provider, model, queryType, tokens, cost) {
        return this.log({
            type: 'ai_query',
            provider,
            model,
            queryType,
            tokens,
            cost: cost || 0
        });
    }

    /**
     * Log an escalation event
     */
    logEscalation(alertId, fromLevel, toLevel, reason) {
        return this.log({
            type: 'escalation',
            alertId,
            fromLevel,
            toLevel,
            reason
        });
    }

    /**
     * Log a voice call event
     */
    logVoiceCall(callSid, direction, duration, status) {
        return this.log({
            type: 'voice_call',
            callSid,
            direction,
            duration,
            status
        });
    }

    /**
     * Log an error
     */
    logError(error, context = {}) {
        return this.log({
            type: 'error',
            error: error.message || String(error),
            stack: error.stack?.substring(0, 500) || null,
            code: error.code || null,
            ...context
        });
    }

    /**
     * Log a security event
     */
    logSecurityEvent(event, details = {}) {
        return this.log({
            type: 'security',
            event,
            severity: details.severity || 'info',
            ...details
        });
    }

    /**
     * Log a webhook event
     */
    logWebhook(source, event, success, metadata = {}) {
        return this.log({
            type: 'webhook',
            source,
            event,
            success,
            ...metadata
        });
    }

    /**
     * Log a deployment
     */
    logDeployment(repo, success, duration, metadata = {}) {
        return this.log({
            type: 'deployment',
            repo,
            success,
            duration,
            ...metadata
        });
    }

    // ============ Utility Methods ============

    /**
     * Sanitize user ID for logging (preserve last 4 digits)
     */
    sanitizeUserId(userId) {
        if (!userId) return 'unknown';
        const str = String(userId);
        if (str.length <= 4) return str;
        return '***' + str.slice(-4);
    }

    /**
     * Flush buffer to disk
     */
    async flush() {
        if (this.buffer.length === 0) return;

        const toWrite = this.buffer.splice(0, this.buffer.length);
        const content = toWrite.join('\n') + '\n';

        // Rotate log file if date changed
        const expectedFile = this.getLogFileName();
        if (expectedFile !== this.currentLogFile) {
            this.currentLogFile = expectedFile;
        }

        try {
            await fs.appendFile(this.currentLogFile, content);
        } catch (error) {
            console.error('[AuditLogger] Failed to write logs:', error.message);
            // Re-add failed writes to buffer
            this.buffer.unshift(...toWrite);
        }
    }

    /**
     * Force flush and shutdown
     */
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
        this._initialized = false;
        console.log('[AuditLogger] Shutdown complete');
    }

    // ============ Query Methods ============

    /**
     * Query logs with filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Matching log entries
     */
    async queryLogs(options = {}) {
        const { date, type, userId, limit = 100, offset = 0 } = options;

        const logFile = date
            ? path.join(this.logDir, `audit-${date}.jsonl`)
            : this.currentLogFile;

        try {
            const content = await fs.readFile(logFile, 'utf8');
            let entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(e => e !== null);

            // Apply filters
            if (type) {
                const types = Array.isArray(type) ? type : [type];
                entries = entries.filter(e => types.includes(e.type));
            }
            if (userId) {
                entries = entries.filter(e =>
                    e.userId && e.userId.includes(userId.slice(-4))
                );
            }

            // Apply pagination
            return entries.slice(-limit - offset, entries.length - offset);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get recent errors
     */
    async getRecentErrors(limit = 20) {
        return this.queryLogs({ type: 'error', limit });
    }

    /**
     * Get recent actions
     */
    async getRecentActions(limit = 20) {
        return this.queryLogs({
            type: ['action_proposed', 'action_confirmed', 'action_executed', 'action_undone', 'action_cancelled'],
            limit
        });
    }

    /**
     * Get daily summary statistics
     * @param {string} date - Optional date in YYYY-MM-DD format
     * @returns {Promise<Object>} Summary statistics
     */
    async getDailySummary(date = null) {
        const entries = await this.queryLogs({ date, limit: 10000 });

        const summary = {
            date: date || new Date().toISOString().split('T')[0],
            totalEvents: entries.length,

            // Messages
            messagesReceived: entries.filter(e => e.type === 'incoming_message').length,
            messagesSent: entries.filter(e => e.type === 'outgoing_message').length,

            // Actions
            actionsProposed: entries.filter(e => e.type === 'action_proposed').length,
            actionsConfirmed: entries.filter(e => e.type === 'action_confirmed').length,
            actionsExecuted: entries.filter(e => e.type === 'action_executed').length,
            actionsSuccessful: entries.filter(e => e.type === 'action_executed' && e.success).length,
            actionsCancelled: entries.filter(e => e.type === 'action_cancelled').length,

            // Skills
            skillExecutions: entries.filter(e => e.type === 'skill_execution').length,
            skillsSuccessful: entries.filter(e => e.type === 'skill_execution' && e.success).length,

            // AI
            aiQueries: entries.filter(e => e.type === 'ai_query').length,
            totalAICost: entries
                .filter(e => e.type === 'ai_query')
                .reduce((sum, e) => sum + (e.cost || 0), 0),

            // By provider
            aiByProvider: this.groupBy(
                entries.filter(e => e.type === 'ai_query'),
                'provider'
            ),

            // Errors
            errors: entries.filter(e => e.type === 'error').length,

            // Voice
            voiceCalls: entries.filter(e => e.type === 'voice_call').length,

            // Webhooks
            webhooks: entries.filter(e => e.type === 'webhook').length,

            // Deployments
            deployments: entries.filter(e => e.type === 'deployment').length,
            deploymentsSuccessful: entries.filter(e => e.type === 'deployment' && e.success).length,

            // Security
            securityEvents: entries.filter(e => e.type === 'security').length,

            // Top skills used
            topSkills: this.getTopN(
                entries.filter(e => e.type === 'skill_execution'),
                'skill',
                5
            ),

            // Platforms
            platforms: this.groupBy(
                entries.filter(e => e.type === 'incoming_message'),
                'platform'
            )
        };

        return summary;
    }

    /**
     * List available log dates
     */
    async listLogDates() {
        try {
            const files = await fs.readdir(this.logDir);
            return files
                .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))
                .map(f => f.replace('audit-', '').replace('.jsonl', ''))
                .sort()
                .reverse();
        } catch (error) {
            return [];
        }
    }

    // ============ Helper Methods ============

    /**
     * Group entries by a field
     */
    groupBy(entries, field) {
        return entries.reduce((acc, e) => {
            const key = e[field] || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }

    /**
     * Get top N values for a field
     */
    getTopN(entries, field, n) {
        const counts = this.groupBy(entries, field);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([name, count]) => ({ name, count }));
    }
}

// Singleton instance
const auditLogger = new AuditLogger();

module.exports = { AuditLogger, auditLogger };
