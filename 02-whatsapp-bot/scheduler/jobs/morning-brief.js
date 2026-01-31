// Morning Brief Job Handler
// Generates a morning summary with tasks, overnight activity, and greeting

/**
 * Generate a morning brief message
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters (includes userId)
 * @returns {Promise<string>} Morning brief message
 */
async function generate(db, params = {}) {
    const now = new Date();
    const hour = now.getHours();
    const userId = params.userId || process.env.YOUR_WHATSAPP;

    // Time-appropriate greeting
    const greeting = getGreeting(hour);

    // Build the morning brief
    let brief = `${greeting}\n\n`;

    try {
        // Section 1: Pending Tasks
        brief += getPendingTasksSummary(db, userId);

        // Section 2: Quick Stats
        brief += getQuickStats(db, userId);

        // Section 3: Motivational close
        brief += getClosingMessage(now);

    } catch (error) {
        console.error('[MorningBrief] Error generating brief:', error);
        brief += `\nUnable to generate full report. Have a great day!`;
    }

    return brief.trim();
}

/**
 * Get time-appropriate greeting
 * @param {number} hour - Current hour (0-23)
 * @returns {string} Greeting message
 */
function getGreeting(hour) {
    const dayOfWeek = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

    if (hour < 6) {
        return `Early riser! Good morning and happy ${dayOfWeek}!`;
    } else if (hour < 9) {
        return `Good morning! Happy ${dayOfWeek}!`;
    } else if (hour < 12) {
        return `Morning! Hope your ${dayOfWeek} is going well.`;
    } else if (hour < 17) {
        return `Good afternoon! Here's your ${dayOfWeek} brief.`;
    } else {
        return `Good evening! Here's your daily summary.`;
    }
}

/**
 * Get summary of pending tasks
 * @param {Object} db - Memory manager
 * @param {string} userId - User ID
 * @returns {string} Tasks summary section
 */
function getPendingTasksSummary(db, userId) {
    let section = `PENDING TASKS\n`;
    section += `${'='.repeat(20)}\n`;

    if (!db || !userId) {
        section += `Task tracking not available.\n\n`;
        return section;
    }

    try {
        // Use actual memory manager method
        const tasks = db.getTasks(userId, 'pending') || [];

        if (tasks.length === 0) {
            section += `No pending tasks - you're all caught up!\n\n`;
        } else {
            // Group by priority
            const high = tasks.filter(t => t.priority === 'high' || t.priority === 'urgent');
            const medium = tasks.filter(t => t.priority === 'medium');
            const low = tasks.filter(t => t.priority === 'low' || !t.priority);

            if (high.length > 0) {
                section += `HIGH PRIORITY (${high.length}):\n`;
                high.slice(0, 3).forEach(t => {
                    section += `  - ${t.title}\n`;
                });
                if (high.length > 3) {
                    section += `  ... and ${high.length - 3} more\n`;
                }
            }

            if (medium.length > 0) {
                section += `MEDIUM (${medium.length}):\n`;
                medium.slice(0, 2).forEach(t => {
                    section += `  - ${t.title}\n`;
                });
                if (medium.length > 2) {
                    section += `  ... and ${medium.length - 2} more\n`;
                }
            }

            if (low.length > 0) {
                section += `OTHER: ${low.length} task(s)\n`;
            }

            section += `\n`;
        }
    } catch (error) {
        console.error('[MorningBrief] Error fetching tasks:', error);
        section += `Unable to fetch tasks.\n\n`;
    }

    return section;
}

/**
 * Get quick stats
 * @param {Object} db - Memory manager
 * @param {string} userId - User ID
 * @returns {string} Stats section
 */
function getQuickStats(db, userId) {
    let section = `QUICK STATS\n`;
    section += `${'='.repeat(20)}\n`;

    // System stats (always available)
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    section += `Bot uptime: ${hours}h ${minutes}m\n`;
    section += `Memory usage: ${memoryMB} MB\n`;

    if (db && userId) {
        try {
            // Use actual memory manager stats method
            const stats = db.getStats(userId);
            if (stats) {
                section += `Messages: ${stats.messageCount || 0}\n`;
                section += `Facts remembered: ${stats.factCount || 0}\n`;
            }
        } catch (error) {
            // Stats not available, that's okay
        }
    }

    section += `\n`;
    return section;
}

/**
 * Get motivational closing message
 * @param {Date} now - Current date
 * @returns {string} Closing message
 */
function getClosingMessage(now) {
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
        return `Have a great weekend! I'm here if you need me.`;
    }

    const messages = [
        `Ready to help when you are!`,
        `Let's make today productive!`,
        `Here to assist with anything you need.`,
        `Have a great day ahead!`
    ];

    // Pick a message based on day of month (for variety)
    const index = now.getDate() % messages.length;
    return messages[index];
}

module.exports = {
    generate,
    getGreeting,
    getPendingTasksSummary,
    getQuickStats,
    getClosingMessage
};
