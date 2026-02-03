// Morning Brief Job Handler
// Generates a morning summary with tasks, overnight activity, and greeting
// Also sends repo-specific briefs to registered Telegram groups

const path = require('path');

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

// ==================== Repo-Specific Group Briefs ====================

/**
 * Resolve a repo name (e.g. "judo") to its full GitHub name (e.g. "giquina/JUDO")
 * Uses the project registry to look up the mapping
 * @param {string} repoName - Short repo name from chat registry
 * @returns {string|null} Full repo name (owner/repo) or null
 */
function resolveRepoFullName(repoName) {
    try {
        const registryPath = path.join(__dirname, '..', '..', '..', 'config', 'project-registry.json');
        const registry = require(registryPath);
        const normalizedName = repoName.toLowerCase();

        // Search through projects for a match
        for (const [key, project] of Object.entries(registry.projects || {})) {
            if (key.toLowerCase() === normalizedName) {
                return project.repo;
            }
            // Also check if the repo field contains the name
            if (project.repo && project.repo.toLowerCase().endsWith('/' + normalizedName)) {
                return project.repo;
            }
        }

        // Fallback: assume giquina org
        return `giquina/${repoName}`;
    } catch (err) {
        console.log(`[MorningBrief] Failed to resolve repo name "${repoName}":`, err.message);
        return `giquina/${repoName}`;
    }
}

/**
 * Fetch GitHub status for a single repository
 * @param {string} repoName - Short repo name (e.g. "judo")
 * @returns {Promise<Object|null>} Repo status object or null on failure
 */
async function getRepoStatus(repoName) {
    try {
        const projectManager = require('../../lib/project-manager');
        const repoFullName = resolveRepoFullName(repoName);

        if (!repoFullName) return null;

        // Fetch all three metrics in parallel
        const [openPRs, recentCommits, openIssuesCount] = await Promise.all([
            projectManager.getOpenPRs(repoFullName),
            projectManager.getRecentCommits(repoFullName, 24),
            projectManager.getOpenIssuesCount(repoFullName)
        ]);

        return {
            repoFullName,
            openPRs,
            openPRsCount: openPRs.length,
            recentCommitsCount: recentCommits.length,
            openIssuesCount
        };
    } catch (err) {
        console.log(`[MorningBrief] Failed to get status for ${repoName}:`, err.message);
        return null;
    }
}

/**
 * Format a repo-specific morning brief message
 * @param {string} repoName - Short repo name
 * @param {Object} status - Repo status from getRepoStatus()
 * @returns {string} Formatted brief message
 */
function formatRepoBrief(repoName, status) {
    if (!status) return null;

    const displayName = repoName.toUpperCase();
    let brief = `Morning Brief -- ${displayName}\n\n`;
    brief += `Open PRs: ${status.openPRsCount}\n`;
    brief += `Commits (24h): ${status.recentCommitsCount}\n`;
    brief += `Open Issues: ${status.openIssuesCount}\n`;

    // List open PRs if any
    if (status.openPRs && status.openPRs.length > 0) {
        brief += `\nOpen PRs:\n`;
        status.openPRs.slice(0, 5).forEach(pr => {
            brief += `  #${pr.number} ${pr.title}\n`;
        });
    }

    brief += `\nHave a productive day!`;

    return brief;
}

/**
 * Send repo-specific morning briefs to registered Telegram groups
 * Called after the HQ brief is sent. Each registered repo group gets
 * a tailored brief with that repo's GitHub stats.
 * @returns {Promise<number>} Number of group briefs sent
 */
async function sendGroupBriefs() {
    let sentCount = 0;

    try {
        const chatRegistry = require('../../lib/chat-registry');
        const { getTelegramHandler } = require('../../telegram-handler');
        const telegram = getTelegramHandler();

        if (!telegram || !telegram.isAvailable()) {
            console.log('[MorningBrief] Telegram not available, skipping group briefs');
            return 0;
        }

        const allChats = chatRegistry.getAll();
        // Filter for repo-type Telegram chats
        const repoChats = allChats.filter(
            chat => chat.type === 'repo' && chat.platform === 'telegram' && chat.value
        );

        if (repoChats.length === 0) {
            console.log('[MorningBrief] No repo groups registered, skipping group briefs');
            return 0;
        }

        console.log(`[MorningBrief] Sending briefs to ${repoChats.length} repo group(s)`);

        for (const chat of repoChats) {
            try {
                const repoStatus = await getRepoStatus(chat.value);
                if (repoStatus) {
                    const brief = formatRepoBrief(chat.value, repoStatus);
                    if (brief) {
                        await telegram.sendMessage(chat.chatId, brief);
                        sentCount++;
                        console.log(`[MorningBrief] Sent brief to ${chat.value} group (${chat.chatId})`);
                    }
                }
            } catch (err) {
                console.log(`[MorningBrief] Failed for ${chat.value}:`, err.message);
            }
        }
    } catch (err) {
        console.log('[MorningBrief] Group briefs failed:', err.message);
    }

    return sentCount;
}

module.exports = {
    generate,
    getGreeting,
    getPendingTasksSummary,
    getQuickStats,
    getClosingMessage,
    getRepoStatus,
    formatRepoBrief,
    sendGroupBriefs,
    resolveRepoFullName
};
