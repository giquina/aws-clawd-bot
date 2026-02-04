/**
 * Deadline Check Job
 *
 * Runs periodically (hourly recommended) to check for urgent company deadlines
 * and trigger alert escalation for:
 * - DEADLINE_MISSED: Overdue deadlines (EMERGENCY - immediate voice call)
 * - DEADLINE_1H: Due within 1 hour (EMERGENCY - immediate voice call)
 * - DEADLINE_24H: Due within 24 hours (CRITICAL - escalates to voice if unacknowledged)
 * - DEADLINE_7D: Due within 7 days (INFO - Telegram only)
 *
 * This job integrates with the AlertEscalation system to provide automatic
 * multi-tier notification: Telegram -> WhatsApp -> Voice Call
 *
 * @module scheduler/jobs/deadline-check
 */

// Lazy load to avoid circular dependencies
let deadlinesSkillInstance = null;

/**
 * Get the deadlines skill instance
 * @returns {Object|null} Deadlines skill instance
 */
function getDeadlinesSkill() {
    if (deadlinesSkillInstance) {
        return deadlinesSkillInstance;
    }

    try {
        // Try to get from skill registry
        const { registry } = require('../../skills');
        if (registry) {
            const skill = registry.getSkill('deadlines');
            if (skill) {
                deadlinesSkillInstance = skill;
                return skill;
            }
        }
    } catch (e) {
        console.log('[DeadlineCheck] Skill registry not available:', e.message);
    }

    try {
        // Fallback: instantiate directly
        const DeadlinesSkill = require('../../skills/deadlines');
        deadlinesSkillInstance = new DeadlinesSkill();
        return deadlinesSkillInstance;
    } catch (e) {
        console.log('[DeadlineCheck] Could not load deadlines skill:', e.message);
        return null;
    }
}

/**
 * Check all deadlines and trigger alerts for urgent ones
 * This is the main entry point called by the scheduler
 *
 * @param {Object} db - Memory manager instance (passed by scheduler)
 * @param {Object} params - Job parameters
 * @returns {Promise<string|null>} Summary message or null if no alerts
 */
async function generate(db, params = {}) {
    console.log('[DeadlineCheck] Running deadline check...');

    const skill = getDeadlinesSkill();
    if (!skill) {
        console.log('[DeadlineCheck] Deadlines skill not available, skipping');
        return null;
    }

    try {
        // Use the skill's built-in method to check and alert
        const result = await skill.checkAndAlertUrgentDeadlines();

        if (result.triggered && result.triggered.length > 0) {
            console.log(`[DeadlineCheck] Triggered ${result.triggered.length} alert(s)`);

            // Build summary for logging (not sent as message - alerts go through escalation)
            const summary = result.triggered.map(a =>
                `${a.type}: ${a.company} - ${a.deadline}`
            ).join('\n');

            console.log('[DeadlineCheck] Alerts triggered:\n' + summary);

            // Return null - we don't want to send a separate message
            // The AlertEscalation system handles all notifications
            return null;
        } else {
            console.log('[DeadlineCheck] No urgent deadlines found');
            return null;
        }
    } catch (error) {
        console.error('[DeadlineCheck] Error checking deadlines:', error.message);
        return null;
    }
}

/**
 * Run a quick check and return summary without triggering alerts
 * Useful for testing or manual checks
 *
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters
 * @returns {Promise<Object>} Summary object
 */
async function check(db, params = {}) {
    const skill = getDeadlinesSkill();
    if (!skill) {
        return { error: 'Deadlines skill not available' };
    }

    try {
        const urgent = skill.getUrgentDeadlines();
        return {
            urgentCount: urgent.length,
            deadlines: urgent.map(d => ({
                company: d.companyCode,
                type: d.type,
                dueDate: d.dueDate.toISOString(),
                isOverdue: d.dueDate < new Date()
            }))
        };
    } catch (error) {
        return { error: error.message };
    }
}

module.exports = {
    generate,
    check
};
