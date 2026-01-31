// Morning Brief Job Handler
// Generates a morning summary with tasks, overnight activity, and greeting

/**
 * Generate a morning brief message
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters
 * @returns {Promise<string>} Morning brief message
 */
async function generate(db, params = {}) {
    const now = new Date();
    const hour = now.getHours();

    // Time-appropriate greeting
    const greeting = getGreeting(hour);

    // Build the morning brief
    let brief = `${greeting}\n\n`;

    try {
        // Section 1: Pending Tasks
        brief += await getPendingTasksSummary(db);

        // Section 2: Overnight Activity
        brief += await getOvernightActivity(db);

        // Section 3: Quick Stats
        brief += await getQuickStats(db);

        // Section 4: Motivational close
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
 * @returns {Promise<string>} Tasks summary section
 */
async function getPendingTasksSummary(db) {
    let section = `PENDING TASKS\n`;
    section += `${'='.repeat(20)}\n`;

    if (!db) {
        section += `Task tracking not available.\n\n`;
        return section;
    }

    try {
        const tasks = await db.query('tasks', {
            where: { status: 'pending' },
            orderBy: { priority: 'desc' }
        }) || [];

        if (tasks.length === 0) {
            section += `No pending tasks - you're all caught up!\n\n`;
        } else {
            // Group by priority
            const high = tasks.filter(t => t.priority === 'high');
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
 * Get overnight activity summary
 * @param {Object} db - Memory manager
 * @returns {Promise<string>} Overnight activity section
 */
async function getOvernightActivity(db) {
    let section = `OVERNIGHT ACTIVITY\n`;
    section += `${'='.repeat(20)}\n`;

    if (!db) {
        section += `Activity tracking not available.\n\n`;
        return section;
    }

    try {
        // Get conversations from the last 12 hours
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        const conversations = await db.query('conversations', {
            where: {
                timestamp: { $gte: twelveHoursAgo }
            },
            orderBy: { timestamp: 'desc' }
        }) || [];

        // Get completed tasks from overnight
        const completedTasks = await db.query('tasks', {
            where: {
                completed_at: { $gte: twelveHoursAgo }
            }
        }) || [];

        // Get scheduled jobs that ran overnight
        const jobsRun = await db.query('scheduled_jobs', {
            where: {
                last_run: { $gte: twelveHoursAgo }
            }
        }) || [];

        if (conversations.length === 0 && completedTasks.length === 0 && jobsRun.length === 0) {
            section += `Quiet night - no activity recorded.\n\n`;
        } else {
            if (conversations.length > 0) {
                section += `- ${conversations.length} conversation(s)\n`;
            }
            if (completedTasks.length > 0) {
                section += `- ${completedTasks.length} task(s) completed\n`;
            }
            if (jobsRun.length > 0) {
                section += `- ${jobsRun.length} scheduled job(s) ran\n`;
            }

            // Show last conversation snippet
            if (conversations.length > 0 && conversations[0].summary) {
                section += `\nLast activity: ${conversations[0].summary.substring(0, 50)}...\n`;
            }

            section += `\n`;
        }
    } catch (error) {
        console.error('[MorningBrief] Error fetching overnight activity:', error);
        section += `Unable to fetch activity.\n\n`;
    }

    return section;
}

/**
 * Get quick stats
 * @param {Object} db - Memory manager
 * @returns {Promise<string>} Stats section
 */
async function getQuickStats(db) {
    let section = `QUICK STATS\n`;
    section += `${'='.repeat(20)}\n`;

    // System stats (always available)
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    section += `Bot uptime: ${hours}h ${minutes}m\n`;
    section += `Memory usage: ${memoryMB} MB\n`;

    if (db) {
        try {
            // Try to get additional stats
            const totalTasks = await db.count('tasks') || 0;
            const totalConversations = await db.count('conversations') || 0;

            section += `Total tasks: ${totalTasks}\n`;
            section += `Total conversations: ${totalConversations}\n`;
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
    getOvernightActivity,
    getQuickStats,
    getClosingMessage
};
