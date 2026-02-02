// End of Day Summary Job Handler
// Generates a 6pm daily summary with completed tasks, pending items, and tomorrow preview

/**
 * Generate an end-of-day summary message
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters (includes userId)
 * @returns {Promise<string>} End of day summary message
 */
async function generate(db, params = {}) {
    const now = new Date();
    const userId = params.userId || process.env.YOUR_WHATSAPP;

    let summary = `END OF DAY SUMMARY\n`;
    summary += `${'='.repeat(25)}\n\n`;

    try {
        // Section 1: Today's Accomplishments
        summary += getCompletedToday(db, userId);

        // Section 2: Still Pending
        summary += getPendingItems(db, userId);

        // Section 3: Quick Stats
        summary += getDayStats(db, userId);

        // Section 4: Tomorrow Preview
        summary += getTomorrowPreview(now);

        // Closing
        summary += getClosing(now);

    } catch (error) {
        console.error('[EndOfDay] Error generating summary:', error);
        summary += `\nUnable to generate full report. Have a good evening!`;
    }

    return summary.trim();
}

/**
 * Get tasks completed today
 */
function getCompletedToday(db, userId) {
    let section = `COMPLETED TODAY\n`;
    section += `${'-'.repeat(20)}\n`;

    if (!db || !userId) {
        section += `No tracking available.\n\n`;
        return section;
    }

    try {
        const tasks = db.getTasks(userId, 'completed') || [];
        const today = new Date().toISOString().split('T')[0];

        const completedToday = tasks.filter(t => {
            if (!t.completed_at) return false;
            return t.completed_at.startsWith(today);
        });

        if (completedToday.length === 0) {
            section += `No tasks marked complete today.\n\n`;
        } else {
            completedToday.slice(0, 5).forEach(t => {
                section += `  Done: ${t.title}\n`;
            });
            if (completedToday.length > 5) {
                section += `  ... and ${completedToday.length - 5} more\n`;
            }
            section += `\n`;
        }
    } catch (error) {
        console.error('[EndOfDay] Error fetching completed:', error);
        section += `Unable to fetch completed tasks.\n\n`;
    }

    return section;
}

/**
 * Get pending items summary
 */
function getPendingItems(db, userId) {
    let section = `STILL PENDING\n`;
    section += `${'-'.repeat(20)}\n`;

    if (!db || !userId) {
        section += `No tracking available.\n\n`;
        return section;
    }

    try {
        const tasks = db.getTasks(userId, 'pending') || [];

        if (tasks.length === 0) {
            section += `All clear - nothing pending!\n\n`;
        } else {
            const urgent = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
            const other = tasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

            if (urgent.length > 0) {
                section += `  Priority (${urgent.length}):\n`;
                urgent.slice(0, 3).forEach(t => {
                    section += `    - ${t.title}\n`;
                });
            }

            if (other.length > 0) {
                section += `  Other: ${other.length} item(s)\n`;
            }

            section += `\n`;
        }
    } catch (error) {
        console.error('[EndOfDay] Error fetching pending:', error);
        section += `Unable to fetch pending tasks.\n\n`;
    }

    return section;
}

/**
 * Get today's stats
 */
function getDayStats(db, userId) {
    let section = `TODAY'S ACTIVITY\n`;
    section += `${'-'.repeat(20)}\n`;

    // System stats
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    section += `  Uptime: ${hours}h ${minutes}m\n`;
    section += `  Memory: ${memoryMB} MB\n`;

    if (db && userId) {
        try {
            const stats = db.getStats(userId);
            if (stats) {
                section += `  Messages today: ${stats.messageCount || 0}\n`;
            }
        } catch (error) {
            // Stats not available
        }
    }

    section += `\n`;
    return section;
}

/**
 * Get tomorrow preview
 */
function getTomorrowPreview(now) {
    let section = `TOMORROW\n`;
    section += `${'-'.repeat(20)}\n`;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayName = tomorrow.toLocaleDateString('en-GB', { weekday: 'long' });
    const dateStr = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const isWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;

    if (isWeekend) {
        section += `  ${dayName} ${dateStr} - Weekend\n`;
        section += `  Enjoy your time off!\n\n`;
    } else {
        section += `  ${dayName} ${dateStr}\n`;
        section += `  Morning brief at 7am\n\n`;
    }

    return section;
}

/**
 * Get closing message
 */
function getClosing(now) {
    const dayOfWeek = now.getDay();
    const isFriday = dayOfWeek === 5;

    if (isFriday) {
        return `Have a great weekend! See you Monday.`;
    }

    const messages = [
        `Good work today. Rest up!`,
        `That's a wrap. Have a good evening!`,
        `Day complete. See you tomorrow!`,
        `All done. Enjoy your evening!`
    ];

    const index = now.getDate() % messages.length;
    return messages[index];
}

module.exports = {
    generate,
    getCompletedToday,
    getPendingItems,
    getDayStats,
    getTomorrowPreview,
    getClosing
};
