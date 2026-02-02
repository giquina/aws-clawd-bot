/**
 * Alert Escalation Manager
 *
 * Handles multi-tier alert escalation: Telegram -> WhatsApp -> Voice Call
 *
 * Features:
 * - Automatic escalation based on unacknowledged alerts
 * - Configurable delays between escalation tiers
 * - Do Not Disturb mode (bypassed for emergencies)
 * - Alert acknowledgement to stop escalation
 * - Integration with voice calling for critical alerts
 *
 * Escalation Flow:
 * 1. Alert created -> Send to Telegram
 * 2. No acknowledgement after 15 min -> Escalate to WhatsApp
 * 3. No acknowledgement after 30 min -> Escalate to Voice Call
 *
 * @module lib/alert-escalation
 */

// Import voice handler lazily to avoid circular dependencies
let voiceHandler = null;
function getVoiceHandler() {
    if (!voiceHandler) {
        try {
            const { voiceHandler: vh } = require('../voice-handler');
            voiceHandler = vh;
        } catch (e) {
            console.log('[AlertEscalation] Voice handler not available:', e.message);
        }
    }
    return voiceHandler;
}

/**
 * Alert severity levels
 * @constant {Object}
 */
const LEVELS = {
    INFO: 'info',           // Telegram only, no escalation
    WARNING: 'warning',     // Telegram -> WhatsApp after delay
    CRITICAL: 'critical',   // Full escalation including voice
    EMERGENCY: 'emergency'  // Immediate voice call
};

/**
 * Predefined trigger types with their default levels and messages
 * @constant {Object}
 */
const TRIGGERS = {
    // CI/CD Events
    CI_FAILURE_MAIN: {
        level: LEVELS.CRITICAL,
        message: 'CI failed on main branch',
        category: 'ci'
    },
    CI_FAILURE_OTHER: {
        level: LEVELS.WARNING,
        message: 'CI failed on feature branch',
        category: 'ci'
    },
    DEPLOY_FAILURE: {
        level: LEVELS.CRITICAL,
        message: 'Deployment failed',
        category: 'deploy'
    },

    // Server Health
    SERVER_DOWN: {
        level: LEVELS.EMERGENCY,
        message: 'Server unresponsive',
        category: 'server'
    },
    SERVER_HIGH_CPU: {
        level: LEVELS.WARNING,
        message: 'Server CPU usage high',
        category: 'server'
    },
    SERVER_HIGH_MEMORY: {
        level: LEVELS.WARNING,
        message: 'Server memory usage high',
        category: 'server'
    },
    SERVER_DISK_FULL: {
        level: LEVELS.CRITICAL,
        message: 'Server disk nearly full',
        category: 'server'
    },

    // Deadlines
    DEADLINE_7D: {
        level: LEVELS.INFO,
        message: 'Deadline in 7 days',
        category: 'deadline'
    },
    DEADLINE_24H: {
        level: LEVELS.CRITICAL,
        message: 'Deadline in 24 hours',
        category: 'deadline'
    },
    DEADLINE_1H: {
        level: LEVELS.EMERGENCY,
        message: 'Deadline in 1 hour',
        category: 'deadline'
    },
    DEADLINE_MISSED: {
        level: LEVELS.EMERGENCY,
        message: 'Deadline missed!',
        category: 'deadline'
    },

    // Security
    SECURITY_ALERT: {
        level: LEVELS.EMERGENCY,
        message: 'Security alert detected',
        category: 'security'
    },
    UNAUTHORIZED_ACCESS: {
        level: LEVELS.CRITICAL,
        message: 'Unauthorized access attempt',
        category: 'security'
    },

    // Financial
    PAYMENT_FAILED: {
        level: LEVELS.CRITICAL,
        message: 'Payment processing failed',
        category: 'financial'
    },
    PAYMENT_RECEIVED: {
        level: LEVELS.INFO,
        message: 'Payment received',
        category: 'financial'
    },

    // Monitoring
    ANOMALY_DETECTED: {
        level: LEVELS.WARNING,
        message: 'Unusual activity detected',
        category: 'monitoring'
    },
    ERROR_SPIKE: {
        level: LEVELS.CRITICAL,
        message: 'Error rate spike detected',
        category: 'monitoring'
    },

    // GitHub Events
    PR_NEEDS_REVIEW: {
        level: LEVELS.INFO,
        message: 'Pull request needs review',
        category: 'github'
    },
    PR_MERGE_CONFLICT: {
        level: LEVELS.WARNING,
        message: 'Pull request has merge conflicts',
        category: 'github'
    }
};

/**
 * Alert Escalation Manager Class
 */
class AlertEscalation {
    constructor() {
        /** @type {Map<string, Object>} Alert storage: alertId -> alert object */
        this.pendingAlerts = new Map();

        /** @type {Map<string, NodeJS.Timeout>} Escalation timers: alertId -> timeout */
        this.escalationTimers = new Map();

        /** @type {Object} Send functions injected from index.js */
        this.senders = {
            telegram: null,
            whatsapp: null
        };

        // Configurable thresholds (can be overridden via env)
        this.config = {
            telegramToWhatsappDelay: parseInt(process.env.ESCALATE_TELEGRAM_TO_WHATSAPP_MS) || 15 * 60 * 1000,  // 15 min
            whatsappToVoiceDelay: parseInt(process.env.ESCALATE_WHATSAPP_TO_VOICE_MS) || 30 * 60 * 1000,       // 30 min
            doNotDisturbStart: parseInt(process.env.DND_START_HOUR) || 23,  // 11 PM
            doNotDisturbEnd: parseInt(process.env.DND_END_HOUR) || 7,       // 7 AM
            bypassDNDForCritical: process.env.BYPASS_DND_FOR_CRITICAL !== 'false',
            enabled: process.env.AUTO_CALL_ENABLED !== 'false',
            maxAlertsPerHour: parseInt(process.env.MAX_ALERTS_PER_HOUR) || 10,
            alertCooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS) || 5 * 60 * 1000  // 5 min cooldown for same type
        };

        // Rate limiting
        this.alertHistory = [];  // Array of { type, timestamp }
        this.lastAlertByType = new Map();  // type -> timestamp

        console.log('[AlertEscalation] Initialized with config:', {
            telegramToWhatsappDelay: `${this.config.telegramToWhatsappDelay / 60000} min`,
            whatsappToVoiceDelay: `${this.config.whatsappToVoiceDelay / 60000} min`,
            dndHours: `${this.config.doNotDisturbStart}:00 - ${this.config.doNotDisturbEnd}:00`,
            enabled: this.config.enabled
        });
    }

    /**
     * Initialize with message senders from index.js
     * @param {Object} senders - Object with telegram and whatsapp send functions
     */
    initialize(senders) {
        this.senders = { ...this.senders, ...senders };
        console.log('[AlertEscalation] Senders initialized:', {
            telegram: !!this.senders.telegram,
            whatsapp: !!this.senders.whatsapp
        });
    }

    /**
     * Create an alert and start escalation process
     * @param {string} type - Alert type (e.g., 'CI_FAILURE_MAIN', 'SERVER_DOWN')
     * @param {string} details - Detailed message about the alert
     * @param {Object} options - Additional options
     * @param {string} [options.level] - Override the default level for this type
     * @param {string} [options.message] - Override the default message for this type
     * @param {Object} [options.metadata] - Additional metadata to store with alert
     * @returns {Promise<string>} Alert ID
     */
    async createAlert(type, details, options = {}) {
        // Check if enabled
        if (!this.config.enabled) {
            console.log('[AlertEscalation] Disabled, skipping alert:', type);
            return null;
        }

        // Rate limiting: check cooldown for same type
        const lastAlert = this.lastAlertByType.get(type);
        if (lastAlert && Date.now() - lastAlert < this.config.alertCooldownMs) {
            console.log(`[AlertEscalation] Rate limited - ${type} in cooldown`);
            return null;
        }

        // Rate limiting: check hourly limit
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        this.alertHistory = this.alertHistory.filter(a => a.timestamp > oneHourAgo);
        if (this.alertHistory.length >= this.config.maxAlertsPerHour) {
            console.log('[AlertEscalation] Rate limited - max alerts per hour reached');
            return null;
        }

        // Get trigger configuration
        const trigger = TRIGGERS[type] || { level: LEVELS.WARNING, message: type, category: 'custom' };

        // Generate unique alert ID
        const alertId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const shortId = alertId.slice(-6);  // Short ID for acknowledgement

        // Create alert object
        const alert = {
            id: alertId,
            shortId,
            type,
            category: trigger.category,
            level: options.level || trigger.level,
            message: options.message || trigger.message,
            details,
            metadata: options.metadata || {},
            timestamp: Date.now(),
            acknowledged: false,
            escalationStep: 0,  // 0=telegram, 1=whatsapp, 2=voice
            escalationHistory: []
        };

        // Store alert
        this.pendingAlerts.set(alertId, alert);

        // Update rate limiting
        this.alertHistory.push({ type, timestamp: Date.now() });
        this.lastAlertByType.set(type, Date.now());

        console.log(`[AlertEscalation] Created alert: ${type} (${alert.level}) - ID: ${shortId}`);

        // Send initial alert
        await this.sendAlert(alert);

        // Schedule escalation (unless emergency - that goes straight to voice)
        if (alert.level === LEVELS.EMERGENCY) {
            alert.escalationStep = 2;
            await this.sendAlert(alert);
        } else if (alert.level !== LEVELS.INFO) {
            this.scheduleEscalation(alert);
        }

        return alertId;
    }

    /**
     * Acknowledge an alert (stops escalation)
     * @param {string} alertIdOrShortId - Full alert ID or short ID (last 6 chars)
     * @returns {boolean} True if alert was found and acknowledged
     */
    acknowledge(alertIdOrShortId) {
        // Find alert by full ID or short ID
        let alert = this.pendingAlerts.get(alertIdOrShortId);

        if (!alert) {
            // Try to find by short ID
            for (const [id, a] of this.pendingAlerts) {
                if (a.shortId === alertIdOrShortId || id.endsWith(alertIdOrShortId)) {
                    alert = a;
                    break;
                }
            }
        }

        if (!alert) {
            console.log(`[AlertEscalation] Alert not found: ${alertIdOrShortId}`);
            return false;
        }

        alert.acknowledged = true;
        alert.acknowledgedAt = Date.now();
        this.clearEscalationTimer(alert.id);

        console.log(`[AlertEscalation] Alert acknowledged: ${alert.shortId} (${alert.type})`);

        // Clean up after acknowledgement (keep for 1 hour for reference)
        setTimeout(() => {
            this.pendingAlerts.delete(alert.id);
        }, 60 * 60 * 1000);

        return true;
    }

    /**
     * Send alert via appropriate channel based on escalation step
     * @param {Object} alert - Alert object
     * @private
     */
    async sendAlert(alert) {
        const formattedMessage = this.formatAlertMessage(alert);

        switch (alert.escalationStep) {
            case 0: // Telegram
                console.log(`[AlertEscalation] Sending to Telegram: ${alert.shortId}`);
                alert.escalationHistory.push({
                    step: 'telegram',
                    timestamp: Date.now()
                });

                if (this.senders.telegram) {
                    try {
                        await this.senders.telegram(formattedMessage);
                    } catch (err) {
                        console.error('[AlertEscalation] Telegram send failed:', err.message);
                    }
                } else {
                    console.log('[AlertEscalation] Telegram sender not available');
                }
                break;

            case 1: // WhatsApp
                console.log(`[AlertEscalation] Escalating to WhatsApp: ${alert.shortId}`);
                const escalatedMessage = this.formatAlertMessage(alert, 'ESCALATED');
                alert.escalationHistory.push({
                    step: 'whatsapp',
                    timestamp: Date.now()
                });

                if (this.senders.whatsapp) {
                    try {
                        await this.senders.whatsapp(escalatedMessage);
                    } catch (err) {
                        console.error('[AlertEscalation] WhatsApp send failed:', err.message);
                    }
                } else {
                    console.log('[AlertEscalation] WhatsApp sender not available');
                }
                break;

            case 2: // Voice call
                console.log(`[AlertEscalation] Escalating to Voice Call: ${alert.shortId}`);
                alert.escalationHistory.push({
                    step: 'voice',
                    timestamp: Date.now()
                });

                const vh = getVoiceHandler();
                if (vh && vh.isAvailable() && !this.isDoNotDisturb(alert)) {
                    try {
                        const voiceMessage = `${alert.message}. ${alert.details}`;
                        await vh.callUser(voiceMessage, { urgent: true });
                    } catch (err) {
                        console.error('[AlertEscalation] Voice call failed:', err.message);
                    }
                } else {
                    const reason = !vh ? 'voice handler unavailable' :
                                   !vh.isAvailable() ? 'voice not configured' :
                                   'Do Not Disturb active';
                    console.log(`[AlertEscalation] Voice call skipped: ${reason}`);
                }
                break;
        }
    }

    /**
     * Schedule the next escalation step
     * @param {Object} alert - Alert object
     * @private
     */
    scheduleEscalation(alert) {
        // Info level doesn't escalate
        if (alert.level === LEVELS.INFO) return;

        // Emergency already sent to voice
        if (alert.level === LEVELS.EMERGENCY) return;

        // Calculate delay based on current step
        const delay = alert.escalationStep === 0
            ? this.config.telegramToWhatsappDelay
            : this.config.whatsappToVoiceDelay;

        const timer = setTimeout(async () => {
            // Check if still pending (not acknowledged)
            const currentAlert = this.pendingAlerts.get(alert.id);
            if (!currentAlert || currentAlert.acknowledged) {
                return;
            }

            // Move to next step
            if (currentAlert.escalationStep < 2) {
                currentAlert.escalationStep++;
                await this.sendAlert(currentAlert);

                // Continue escalation if not at voice yet
                if (currentAlert.escalationStep < 2) {
                    this.scheduleEscalation(currentAlert);
                }
            }
        }, delay);

        // Store timer for cleanup
        this.escalationTimers.set(alert.id, timer);

        const nextStep = alert.escalationStep === 0 ? 'WhatsApp' : 'Voice';
        console.log(`[AlertEscalation] Scheduled escalation to ${nextStep} in ${delay / 60000} min for ${alert.shortId}`);
    }

    /**
     * Clear escalation timer for an alert
     * @param {string} alertId - Alert ID
     * @private
     */
    clearEscalationTimer(alertId) {
        const timer = this.escalationTimers.get(alertId);
        if (timer) {
            clearTimeout(timer);
            this.escalationTimers.delete(alertId);
        }
    }

    /**
     * Check if currently in Do Not Disturb period
     * @param {Object} alert - Alert object
     * @returns {boolean} True if DND is active (and not bypassed)
     */
    isDoNotDisturb(alert) {
        // Emergency and critical alerts can bypass DND
        if (alert.level === LEVELS.EMERGENCY ||
            (alert.level === LEVELS.CRITICAL && this.config.bypassDNDForCritical)) {
            return false;
        }

        const hour = new Date().getHours();

        // Handle overnight DND (e.g., 23:00 - 07:00)
        if (this.config.doNotDisturbStart > this.config.doNotDisturbEnd) {
            return hour >= this.config.doNotDisturbStart || hour < this.config.doNotDisturbEnd;
        }

        // Handle same-day DND (e.g., 13:00 - 15:00)
        return hour >= this.config.doNotDisturbStart && hour < this.config.doNotDisturbEnd;
    }

    /**
     * Format alert message for display
     * @param {Object} alert - Alert object
     * @param {string} [prefix] - Optional prefix (e.g., 'ESCALATED')
     * @returns {string} Formatted message
     */
    formatAlertMessage(alert, prefix = '') {
        const emoji = {
            [LEVELS.INFO]: '\u2139\uFE0F',      // info
            [LEVELS.WARNING]: '\u26A0\uFE0F',   // warning
            [LEVELS.CRITICAL]: '\uD83D\uDD34',  // red circle
            [LEVELS.EMERGENCY]: '\uD83D\uDEA8'  // siren
        }[alert.level] || '\uD83D\uDCE2';       // loudspeaker

        const levelLabel = alert.level.toUpperCase();
        const prefixStr = prefix ? `[${prefix}] ` : '';

        let message = `${emoji} ${prefixStr}*${levelLabel}*: ${alert.message}\n\n`;
        message += `${alert.details}\n\n`;
        message += `\u23F0 ${new Date(alert.timestamp).toLocaleString('en-GB')}\n`;
        message += `\uD83C\uDFF7\uFE0F Type: ${alert.type}\n`;

        if (alert.escalationHistory.length > 0) {
            const steps = alert.escalationHistory.map(h => h.step).join(' -> ');
            message += `\uD83D\uDCCA Escalation: ${steps}\n`;
        }

        message += `\n_Reply "ack ${alert.shortId}" to acknowledge_`;

        return message;
    }

    /**
     * Get all pending (unacknowledged) alerts
     * @returns {Object[]} Array of pending alerts
     */
    getPendingAlerts() {
        const alerts = [];
        for (const alert of this.pendingAlerts.values()) {
            if (!alert.acknowledged) {
                alerts.push({ ...alert });
            }
        }
        return alerts.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get alert by ID
     * @param {string} alertId - Alert ID or short ID
     * @returns {Object|null} Alert object or null
     */
    getAlert(alertId) {
        const alert = this.pendingAlerts.get(alertId);
        if (alert) return { ...alert };

        // Try short ID
        for (const a of this.pendingAlerts.values()) {
            if (a.shortId === alertId) {
                return { ...a };
            }
        }

        return null;
    }

    /**
     * Clear all pending alerts and timers
     */
    clearAll() {
        // Clear all timers
        for (const timer of this.escalationTimers.values()) {
            clearTimeout(timer);
        }
        this.escalationTimers.clear();

        // Clear alerts
        const count = this.pendingAlerts.size;
        this.pendingAlerts.clear();

        console.log(`[AlertEscalation] Cleared ${count} pending alerts`);
        return count;
    }

    /**
     * Update configuration
     * @param {Object} newConfig - Configuration updates
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[AlertEscalation] Config updated:', this.config);
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get alert statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const pending = this.getPendingAlerts();
        const byLevel = { info: 0, warning: 0, critical: 0, emergency: 0 };
        const byCategory = {};

        for (const alert of pending) {
            byLevel[alert.level]++;
            byCategory[alert.category] = (byCategory[alert.category] || 0) + 1;
        }

        return {
            pending: pending.length,
            byLevel,
            byCategory,
            recentAlerts: this.alertHistory.length,
            rateLimitRemaining: Math.max(0, this.config.maxAlertsPerHour - this.alertHistory.length)
        };
    }

    /**
     * Check if alert type is defined
     * @param {string} type - Alert type
     * @returns {boolean} True if type is defined
     */
    static isValidType(type) {
        return TRIGGERS.hasOwnProperty(type);
    }

    /**
     * Get all available trigger types
     * @returns {Object} Trigger types
     */
    static getTriggers() {
        return { ...TRIGGERS };
    }

    /**
     * Get all alert levels
     * @returns {Object} Alert levels
     */
    static getLevels() {
        return { ...LEVELS };
    }
}

// Create singleton instance
const alertEscalation = new AlertEscalation();

module.exports = {
    AlertEscalation,
    alertEscalation,
    LEVELS,
    TRIGGERS
};
