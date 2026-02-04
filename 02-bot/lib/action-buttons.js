/**
 * Action Buttons - Telegram Inline Keyboard Button Configurations
 *
 * Provides pre-configured button layouts for common actions in ClawdBot.
 * These buttons appear inline with messages and allow quick one-tap actions.
 *
 * Usage:
 *   const ActionButtons = require('./lib/action-buttons');
 *   await telegramHandler.sendMessageWithButtons(chatId, 'Message', ActionButtons.projectStatus('my-repo'));
 *
 * Button format for Telegram inline keyboards:
 *   [[{text: 'Button 1', callback_data: 'action:param'}], [{text: 'Button 2', callback_data: 'action2:param'}]]
 *   - Outer array: rows
 *   - Inner array: buttons in that row
 *   - callback_data: max 64 bytes, format "action:params"
 */

const ActionButtons = {
    /**
     * Buttons for CI/CD failure alerts
     * Shown when a GitHub Action workflow fails
     * @param {string} repoName - Repository name
     * @returns {Array} Inline keyboard button layout
     */
    ciFailure: (repoName) => [
        [{ text: '📋 View Logs', callback_data: `logs:${repoName}` }],
        [
            { text: '🔄 Restart', callback_data: `restart:${repoName}` },
            { text: '✅ Ignore', callback_data: `ignore:${repoName}` }
        ]
    ],

    /**
     * Buttons for project status messages
     * Quick actions after viewing a project's TODO/status
     * @param {string} repoName - Repository name
     * @returns {Array} Inline keyboard button layout
     */
    projectStatus: (repoName) => [
        [{ text: '🚀 Deploy', callback_data: `deploy:${repoName}` }],
        [
            { text: '🧪 Run Tests', callback_data: `tests:${repoName}` },
            { text: '📋 Logs', callback_data: `logs:${repoName}` }
        ]
    ],

    /**
     * Buttons for task-related actions
     * Used with TODO.md task items
     * @param {string} taskId - Task identifier (can be line number or task hash)
     * @returns {Array} Inline keyboard button layout
     */
    taskActions: (taskId) => [
        [{ text: '✅ Mark Done', callback_data: `task_done:${taskId}` }],
        [{ text: '📝 Details', callback_data: `task_details:${taskId}` }]
    ],

    /**
     * Buttons for deployment confirmation
     * Shown before executing a deploy action
     * @param {string} repoName - Repository name
     * @returns {Array} Inline keyboard button layout
     */
    deployConfirm: (repoName) => [
        [
            { text: '✅ Yes, Deploy', callback_data: `deploy_confirm:${repoName}` },
            { text: '❌ Cancel', callback_data: `deploy_cancel:${repoName}` }
        ]
    ],

    /**
     * Buttons for morning brief / daily digest
     * Quick actions for daily status messages
     * @returns {Array} Inline keyboard button layout
     */
    morningBrief: () => [
        [{ text: '📊 Full Report', callback_data: 'brief:full' }],
        [
            { text: '🔄 Refresh', callback_data: 'brief:refresh' },
            { text: '⏰ Snooze 1h', callback_data: 'brief:snooze' }
        ]
    ],

    /**
     * Buttons for GitHub PR notifications
     * @param {string} repoName - Repository name
     * @param {number} prNumber - Pull request number
     * @returns {Array} Inline keyboard button layout
     */
    pullRequest: (repoName, prNumber) => [
        [{ text: '👀 Review PR', callback_data: `pr_review:${repoName}:${prNumber}` }],
        [
            { text: '✅ Approve', callback_data: `pr_approve:${repoName}:${prNumber}` },
            { text: '💬 Comment', callback_data: `pr_comment:${repoName}:${prNumber}` }
        ]
    ],

    /**
     * Buttons for receipt processing confirmation
     * @param {string} receiptId - Receipt identifier
     * @returns {Array} Inline keyboard button layout
     */
    receiptProcessed: (receiptId) => [
        [
            { text: '✅ Save', callback_data: `receipt_save:${receiptId}` },
            { text: '✏️ Edit', callback_data: `receipt_edit:${receiptId}` }
        ],
        [{ text: '🗑️ Discard', callback_data: `receipt_discard:${receiptId}` }]
    ],

    /**
     * Generic yes/no confirmation buttons
     * @param {string} actionId - Identifier for the action being confirmed
     * @returns {Array} Inline keyboard button layout
     */
    confirm: (actionId) => [
        [
            { text: '✅ Yes', callback_data: `confirm_yes:${actionId}` },
            { text: '❌ No', callback_data: `confirm_no:${actionId}` }
        ]
    ],

    /**
     * Buttons for help menu navigation
     * @returns {Array} Inline keyboard button layout
     */
    helpMenu: () => [
        [
            { text: '📁 Projects', callback_data: 'help:projects' },
            { text: '🤖 AI', callback_data: 'help:ai' }
        ],
        [
            { text: '⏰ Reminders', callback_data: 'help:reminders' },
            { text: '📊 Stats', callback_data: 'help:stats' }
        ]
    ],

    /**
     * Buttons for project selection (paginated)
     * @param {Array<string>} projects - List of project names
     * @param {number} page - Current page (0-indexed)
     * @param {number} pageSize - Items per page (default 5)
     * @returns {Array} Inline keyboard button layout
     */
    projectSelector: (projects, page = 0, pageSize = 5) => {
        const start = page * pageSize;
        const end = Math.min(start + pageSize, projects.length);
        const pageProjects = projects.slice(start, end);

        const buttons = pageProjects.map(p =>
            [{ text: `📁 ${p}`, callback_data: `select_project:${p}` }]
        );

        // Add pagination if needed
        const hasMore = end < projects.length;
        const hasPrev = page > 0;

        if (hasPrev || hasMore) {
            const navRow = [];
            if (hasPrev) {
                navRow.push({ text: '⬅️ Previous', callback_data: `projects_page:${page - 1}` });
            }
            if (hasMore) {
                navRow.push({ text: '➡️ Next', callback_data: `projects_page:${page + 1}` });
            }
            buttons.push(navRow);
        }

        return buttons;
    },

    /**
     * Parse callback data into action and parameters
     * @param {string} data - Callback data string (e.g., "deploy:my-repo")
     * @returns {Object} Parsed result with action and params
     */
    parseCallback(data) {
        if (!data || typeof data !== 'string') {
            return { action: null, params: null };
        }

        const colonIndex = data.indexOf(':');
        if (colonIndex === -1) {
            return { action: data, params: null };
        }

        const action = data.substring(0, colonIndex);
        const params = data.substring(colonIndex + 1);

        return { action, params };
    },

    /**
     * Validate callback data length (Telegram limit: 64 bytes)
     * @param {string} data - Callback data to validate
     * @returns {boolean} True if valid
     */
    isValidCallbackData(data) {
        if (!data || typeof data !== 'string') return false;
        // Telegram's callback_data limit is 64 bytes
        return Buffer.byteLength(data, 'utf8') <= 64;
    },

    /**
     * Create a safe callback data string, truncating if needed
     * @param {string} action - Action name
     * @param {string} param - Parameter value
     * @returns {string} Safe callback data string
     */
    createCallbackData(action, param) {
        const full = `${action}:${param}`;
        if (this.isValidCallbackData(full)) {
            return full;
        }
        // Truncate param to fit within 64 bytes
        const actionPart = `${action}:`;
        const maxParamBytes = 64 - Buffer.byteLength(actionPart, 'utf8');
        let truncated = param;
        while (Buffer.byteLength(truncated, 'utf8') > maxParamBytes) {
            truncated = truncated.slice(0, -1);
        }
        return actionPart + truncated;
    }
};

module.exports = ActionButtons;
