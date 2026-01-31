/**
 * ClawdBot Memory Manager
 *
 * Provides persistent memory capabilities for the ClawdBot WhatsApp assistant.
 * Uses SQLite (via better-sqlite3) for synchronous, efficient data storage.
 *
 * Features:
 * - Conversation history with search
 * - User facts/preferences storage
 * - Task management
 * - Scheduled jobs tracking
 *
 * @module memory-manager
 * @author ClawdBot Team
 * @created January 2026
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * @typedef {Object} Message
 * @property {number} id - Message ID
 * @property {string} user_id - User identifier (phone number)
 * @property {string} role - Message role ('user', 'assistant', 'system')
 * @property {string} content - Message content
 * @property {string} created_at - ISO timestamp
 */

/**
 * @typedef {Object} Fact
 * @property {number} id - Fact ID
 * @property {string} user_id - User identifier
 * @property {string} category - Fact category
 * @property {string} fact - The fact content
 * @property {string} source - Where fact was learned
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 */

/**
 * @typedef {Object} Task
 * @property {number} id - Task ID
 * @property {string} user_id - User identifier
 * @property {string} title - Task title
 * @property {string} description - Task description
 * @property {string} status - Task status ('pending', 'in_progress', 'completed', 'cancelled')
 * @property {string} priority - Task priority ('low', 'medium', 'high', 'urgent')
 * @property {string|null} due_date - Due date ISO timestamp
 * @property {string} created_at - ISO timestamp
 * @property {string|null} completed_at - Completion ISO timestamp
 */

/**
 * @typedef {Object} ScheduledJob
 * @property {number} id - Job ID
 * @property {string} name - Unique job name
 * @property {string} cron_expression - Cron schedule expression
 * @property {string} handler - Handler function name
 * @property {Object|null} params - Job parameters
 * @property {boolean} enabled - Whether job is active
 * @property {string|null} last_run - Last execution timestamp
 * @property {string|null} next_run - Next scheduled execution
 * @property {string} created_at - ISO timestamp
 */

/**
 * @typedef {Object} UserStats
 * @property {number} totalMessages - Total messages for user
 * @property {number} totalFacts - Total stored facts
 * @property {number} pendingTasks - Tasks pending
 * @property {number} completedTasks - Tasks completed
 * @property {string|null} firstMessage - First message timestamp
 * @property {string|null} lastMessage - Last message timestamp
 */

class MemoryManager {
    /**
     * Creates a new MemoryManager instance.
     * Initializes the SQLite database and runs schema migrations.
     *
     * @param {string} [dbPath] - Optional custom database path
     */
    constructor(dbPath = null) {
        // Determine database path
        this.dbPath = dbPath || path.join(__dirname, 'clawd.db');

        // Ensure directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Initialize database connection
        this.db = new Database(this.dbPath);

        // Enable WAL mode for better concurrent performance
        this.db.pragma('journal_mode = WAL');

        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');

        // Initialize schema
        this._initializeSchema();

        // Prepare commonly used statements for performance
        this._prepareStatements();

        console.log(`[MemoryManager] Initialized database at ${this.dbPath}`);
    }

    /**
     * Initializes the database schema from schema.sql
     * @private
     */
    _initializeSchema() {
        const schemaPath = path.join(__dirname, 'schema.sql');

        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema);
        } else {
            // Fallback: create tables inline if schema.sql not found
            this._createTablesInline();
        }
    }

    /**
     * Creates tables inline as fallback
     * @private
     */
    _createTablesInline() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                fact TEXT NOT NULL,
                source TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                priority TEXT NOT NULL DEFAULT 'medium',
                due_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS scheduled_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                cron_expression TEXT NOT NULL,
                handler TEXT NOT NULL,
                params TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run DATETIME,
                next_run DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
            CREATE INDEX IF NOT EXISTS idx_facts_user_id ON facts(user_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        `);
    }

    /**
     * Prepares commonly used SQL statements for performance
     * @private
     */
    _prepareStatements() {
        this.statements = {
            // Conversation statements
            insertMessage: this.db.prepare(`
                INSERT INTO conversations (user_id, role, content)
                VALUES (?, ?, ?)
            `),
            getHistory: this.db.prepare(`
                SELECT id, user_id, role, content, created_at
                FROM conversations
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `),
            clearHistory: this.db.prepare(`
                DELETE FROM conversations WHERE user_id = ?
            `),
            searchConversations: this.db.prepare(`
                SELECT id, user_id, role, content, created_at
                FROM conversations
                WHERE user_id = ? AND content LIKE ?
                ORDER BY created_at DESC
                LIMIT 100
            `),

            // Facts statements
            insertFact: this.db.prepare(`
                INSERT INTO facts (user_id, category, fact, source)
                VALUES (?, ?, ?, ?)
            `),
            getFacts: this.db.prepare(`
                SELECT id, user_id, category, fact, source, created_at, updated_at
                FROM facts
                WHERE user_id = ?
                ORDER BY updated_at DESC
            `),
            getFactsByCategory: this.db.prepare(`
                SELECT id, user_id, category, fact, source, created_at, updated_at
                FROM facts
                WHERE user_id = ? AND category = ?
                ORDER BY updated_at DESC
            `),
            deleteFact: this.db.prepare(`
                DELETE FROM facts WHERE user_id = ? AND id = ?
            `),
            updateFact: this.db.prepare(`
                UPDATE facts SET fact = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `),

            // Task statements
            insertTask: this.db.prepare(`
                INSERT INTO tasks (user_id, title, description, priority)
                VALUES (?, ?, ?, ?)
            `),
            getTasks: this.db.prepare(`
                SELECT id, user_id, title, description, status, priority, due_date, created_at, completed_at
                FROM tasks
                WHERE user_id = ?
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    created_at DESC
            `),
            getTasksByStatus: this.db.prepare(`
                SELECT id, user_id, title, description, status, priority, due_date, created_at, completed_at
                FROM tasks
                WHERE user_id = ? AND status = ?
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    created_at DESC
            `),
            updateTaskStatus: this.db.prepare(`
                UPDATE tasks SET status = ? WHERE id = ?
            `),
            deleteTask: this.db.prepare(`
                DELETE FROM tasks WHERE id = ? AND user_id = ?
            `),

            // Stats statements
            countMessages: this.db.prepare(`
                SELECT COUNT(*) as count FROM conversations WHERE user_id = ?
            `),
            countFacts: this.db.prepare(`
                SELECT COUNT(*) as count FROM facts WHERE user_id = ?
            `),
            countTasksByStatus: this.db.prepare(`
                SELECT status, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY status
            `),
            getMessageRange: this.db.prepare(`
                SELECT MIN(created_at) as first_message, MAX(created_at) as last_message
                FROM conversations WHERE user_id = ?
            `),

            // Scheduled jobs statements
            insertJob: this.db.prepare(`
                INSERT INTO scheduled_jobs (name, cron_expression, handler, params, enabled)
                VALUES (?, ?, ?, ?, ?)
            `),
            getEnabledJobs: this.db.prepare(`
                SELECT id, name, cron_expression, handler, params, enabled, last_run, next_run, created_at
                FROM scheduled_jobs
                WHERE enabled = 1
                ORDER BY next_run
            `),
            updateJobRun: this.db.prepare(`
                UPDATE scheduled_jobs SET last_run = CURRENT_TIMESTAMP, next_run = ? WHERE id = ?
            `),
            toggleJob: this.db.prepare(`
                UPDATE scheduled_jobs SET enabled = ? WHERE id = ?
            `)
        };
    }

    // =========================================================================
    // CONVERSATION METHODS
    // =========================================================================

    /**
     * Saves a message to conversation history.
     *
     * @param {string} userId - User identifier (typically phone number)
     * @param {string} role - Message role ('user', 'assistant', 'system')
     * @param {string} content - Message content
     * @returns {number} The inserted message ID
     * @throws {Error} If parameters are invalid
     *
     * @example
     * const msgId = memory.saveMessage('+447123456789', 'user', 'Hello!');
     */
    saveMessage(userId, role, content) {
        if (!userId || !role || !content) {
            throw new Error('userId, role, and content are required');
        }

        const validRoles = ['user', 'assistant', 'system'];
        if (!validRoles.includes(role)) {
            throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        try {
            const result = this.statements.insertMessage.run(userId, role, content);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('[MemoryManager] Error saving message:', error.message);
            throw error;
        }
    }

    /**
     * Retrieves conversation history for a user.
     * Returns messages in chronological order (oldest first).
     *
     * @param {string} userId - User identifier
     * @param {number} [limit=50] - Maximum messages to retrieve
     * @returns {Message[]} Array of messages, oldest first
     *
     * @example
     * const history = memory.getConversationHistory('+447123456789', 20);
     */
    getConversationHistory(userId, limit = 50) {
        if (!userId) {
            throw new Error('userId is required');
        }

        try {
            // Query returns DESC order, reverse for chronological
            const messages = this.statements.getHistory.all(userId, limit);
            return messages.reverse();
        } catch (error) {
            console.error('[MemoryManager] Error getting history:', error.message);
            return [];
        }
    }

    /**
     * Clears all conversation history for a user.
     *
     * @param {string} userId - User identifier
     * @returns {number} Number of messages deleted
     *
     * @example
     * const deleted = memory.clearHistory('+447123456789');
     * console.log(`Cleared ${deleted} messages`);
     */
    clearHistory(userId) {
        if (!userId) {
            throw new Error('userId is required');
        }

        try {
            const result = this.statements.clearHistory.run(userId);
            return result.changes;
        } catch (error) {
            console.error('[MemoryManager] Error clearing history:', error.message);
            throw error;
        }
    }

    /**
     * Searches conversation history for messages containing a query.
     *
     * @param {string} userId - User identifier
     * @param {string} query - Search query (case-insensitive)
     * @returns {Message[]} Matching messages, most recent first
     *
     * @example
     * const results = memory.searchConversations('+447123456789', 'github');
     */
    searchConversations(userId, query) {
        if (!userId || !query) {
            throw new Error('userId and query are required');
        }

        try {
            // Wrap query in wildcards for LIKE search
            const searchPattern = `%${query}%`;
            return this.statements.searchConversations.all(userId, searchPattern);
        } catch (error) {
            console.error('[MemoryManager] Error searching conversations:', error.message);
            return [];
        }
    }

    // =========================================================================
    // FACTS METHODS
    // =========================================================================

    /**
     * Saves a fact about a user.
     *
     * @param {string} userId - User identifier
     * @param {string} fact - The fact to store
     * @param {string} [category='general'] - Fact category (e.g., 'preference', 'personal', 'work')
     * @param {string} [source='user_stated'] - Source of the fact
     * @returns {number} The inserted fact ID
     *
     * @example
     * memory.saveFact('+447123456789', 'Prefers TypeScript', 'preference');
     * memory.saveFact('+447123456789', 'Works at TechCorp', 'work', 'inferred');
     */
    saveFact(userId, fact, category = 'general', source = 'user_stated') {
        if (!userId || !fact) {
            throw new Error('userId and fact are required');
        }

        try {
            const result = this.statements.insertFact.run(userId, category, fact, source);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('[MemoryManager] Error saving fact:', error.message);
            throw error;
        }
    }

    /**
     * Retrieves facts for a user, optionally filtered by category.
     *
     * @param {string} userId - User identifier
     * @param {string|null} [category=null] - Optional category filter
     * @returns {Fact[]} Array of facts
     *
     * @example
     * const allFacts = memory.getFacts('+447123456789');
     * const preferences = memory.getFacts('+447123456789', 'preference');
     */
    getFacts(userId, category = null) {
        if (!userId) {
            throw new Error('userId is required');
        }

        try {
            if (category) {
                return this.statements.getFactsByCategory.all(userId, category);
            }
            return this.statements.getFacts.all(userId);
        } catch (error) {
            console.error('[MemoryManager] Error getting facts:', error.message);
            return [];
        }
    }

    /**
     * Deletes a specific fact.
     *
     * @param {string} userId - User identifier
     * @param {number} factId - The fact ID to delete
     * @returns {boolean} True if fact was deleted
     *
     * @example
     * const deleted = memory.deleteFact('+447123456789', 42);
     */
    deleteFact(userId, factId) {
        if (!userId || !factId) {
            throw new Error('userId and factId are required');
        }

        try {
            const result = this.statements.deleteFact.run(userId, factId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error deleting fact:', error.message);
            throw error;
        }
    }

    /**
     * Updates an existing fact.
     *
     * @param {string} userId - User identifier
     * @param {number} factId - The fact ID to update
     * @param {string} newFact - The new fact content
     * @returns {boolean} True if fact was updated
     */
    updateFact(userId, factId, newFact) {
        if (!userId || !factId || !newFact) {
            throw new Error('userId, factId, and newFact are required');
        }

        try {
            const result = this.statements.updateFact.run(newFact, factId, userId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error updating fact:', error.message);
            throw error;
        }
    }

    // =========================================================================
    // TASK METHODS
    // =========================================================================

    /**
     * Creates a new task for a user.
     *
     * @param {string} userId - User identifier
     * @param {string} title - Task title
     * @param {string} [description=''] - Task description
     * @param {string} [priority='medium'] - Priority ('low', 'medium', 'high', 'urgent')
     * @returns {number} The created task ID
     *
     * @example
     * const taskId = memory.createTask('+447123456789', 'Review PR #123', 'Check code quality', 'high');
     */
    createTask(userId, title, description = '', priority = 'medium') {
        if (!userId || !title) {
            throw new Error('userId and title are required');
        }

        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(priority)) {
            throw new Error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
        }

        try {
            const result = this.statements.insertTask.run(userId, title, description, priority);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('[MemoryManager] Error creating task:', error.message);
            throw error;
        }
    }

    /**
     * Retrieves tasks for a user, optionally filtered by status.
     * Tasks are ordered by priority (urgent first) then by creation date.
     *
     * @param {string} userId - User identifier
     * @param {string|null} [status=null] - Optional status filter ('pending', 'in_progress', 'completed', 'cancelled')
     * @returns {Task[]} Array of tasks
     *
     * @example
     * const allTasks = memory.getTasks('+447123456789');
     * const pending = memory.getTasks('+447123456789', 'pending');
     */
    getTasks(userId, status = null) {
        if (!userId) {
            throw new Error('userId is required');
        }

        try {
            if (status) {
                const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
                if (!validStatuses.includes(status)) {
                    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
                }
                return this.statements.getTasksByStatus.all(userId, status);
            }
            return this.statements.getTasks.all(userId);
        } catch (error) {
            console.error('[MemoryManager] Error getting tasks:', error.message);
            return [];
        }
    }

    /**
     * Updates the status of a task.
     *
     * @param {number} taskId - The task ID
     * @param {string} status - New status ('pending', 'in_progress', 'completed', 'cancelled')
     * @returns {boolean} True if task was updated
     *
     * @example
     * memory.updateTaskStatus(42, 'completed');
     */
    updateTaskStatus(taskId, status) {
        if (!taskId || !status) {
            throw new Error('taskId and status are required');
        }

        const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        try {
            const result = this.statements.updateTaskStatus.run(status, taskId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error updating task status:', error.message);
            throw error;
        }
    }

    /**
     * Deletes a task.
     *
     * @param {string} userId - User identifier
     * @param {number} taskId - The task ID to delete
     * @returns {boolean} True if task was deleted
     */
    deleteTask(userId, taskId) {
        if (!userId || !taskId) {
            throw new Error('userId and taskId are required');
        }

        try {
            const result = this.statements.deleteTask.run(taskId, userId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error deleting task:', error.message);
            throw error;
        }
    }

    // =========================================================================
    // STATISTICS METHODS
    // =========================================================================

    /**
     * Gets usage statistics for a user.
     *
     * @param {string} userId - User identifier
     * @returns {UserStats} User statistics object
     *
     * @example
     * const stats = memory.getStats('+447123456789');
     * console.log(`Total messages: ${stats.totalMessages}`);
     */
    getStats(userId) {
        if (!userId) {
            throw new Error('userId is required');
        }

        try {
            // Get message count
            const messageCount = this.statements.countMessages.get(userId);

            // Get facts count
            const factsCount = this.statements.countFacts.get(userId);

            // Get task counts by status
            const taskCounts = this.statements.countTasksByStatus.all(userId);
            const taskStats = taskCounts.reduce((acc, row) => {
                acc[row.status] = row.count;
                return acc;
            }, {});

            // Get message date range
            const messageRange = this.statements.getMessageRange.get(userId);

            return {
                totalMessages: messageCount?.count || 0,
                totalFacts: factsCount?.count || 0,
                pendingTasks: taskStats.pending || 0,
                inProgressTasks: taskStats.in_progress || 0,
                completedTasks: taskStats.completed || 0,
                cancelledTasks: taskStats.cancelled || 0,
                firstMessage: messageRange?.first_message || null,
                lastMessage: messageRange?.last_message || null
            };
        } catch (error) {
            console.error('[MemoryManager] Error getting stats:', error.message);
            return {
                totalMessages: 0,
                totalFacts: 0,
                pendingTasks: 0,
                inProgressTasks: 0,
                completedTasks: 0,
                cancelledTasks: 0,
                firstMessage: null,
                lastMessage: null
            };
        }
    }

    // =========================================================================
    // SCHEDULED JOBS METHODS
    // =========================================================================

    /**
     * Creates a scheduled job.
     *
     * @param {string} name - Unique job name
     * @param {string} cronExpression - Cron schedule (e.g., '0 9 * * *' for 9am daily)
     * @param {string} handler - Handler function name
     * @param {Object} [params={}] - Job parameters
     * @param {boolean} [enabled=true] - Whether job is enabled
     * @returns {number} The created job ID
     */
    createScheduledJob(name, cronExpression, handler, params = {}, enabled = true) {
        if (!name || !cronExpression || !handler) {
            throw new Error('name, cronExpression, and handler are required');
        }

        try {
            const paramsJson = JSON.stringify(params);
            const result = this.statements.insertJob.run(
                name, cronExpression, handler, paramsJson, enabled ? 1 : 0
            );
            return result.lastInsertRowid;
        } catch (error) {
            console.error('[MemoryManager] Error creating scheduled job:', error.message);
            throw error;
        }
    }

    /**
     * Gets all enabled scheduled jobs.
     *
     * @returns {ScheduledJob[]} Array of enabled jobs
     */
    getEnabledJobs() {
        try {
            const jobs = this.statements.getEnabledJobs.all();
            return jobs.map(job => ({
                ...job,
                enabled: Boolean(job.enabled),
                params: job.params ? JSON.parse(job.params) : null
            }));
        } catch (error) {
            console.error('[MemoryManager] Error getting enabled jobs:', error.message);
            return [];
        }
    }

    /**
     * Updates job run timestamps.
     *
     * @param {number} jobId - Job ID
     * @param {string} nextRun - Next scheduled run ISO timestamp
     * @returns {boolean} True if updated
     */
    updateJobRun(jobId, nextRun) {
        if (!jobId) {
            throw new Error('jobId is required');
        }

        try {
            const result = this.statements.updateJobRun.run(nextRun, jobId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error updating job run:', error.message);
            throw error;
        }
    }

    /**
     * Enables or disables a scheduled job.
     *
     * @param {number} jobId - Job ID
     * @param {boolean} enabled - Enable or disable
     * @returns {boolean} True if updated
     */
    toggleJob(jobId, enabled) {
        if (jobId === undefined) {
            throw new Error('jobId is required');
        }

        try {
            const result = this.statements.toggleJob.run(enabled ? 1 : 0, jobId);
            return result.changes > 0;
        } catch (error) {
            console.error('[MemoryManager] Error toggling job:', error.message);
            throw error;
        }
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Formats conversation history for use with Claude API.
     *
     * @param {string} userId - User identifier
     * @param {number} [limit=50] - Max messages to include
     * @returns {Array<{role: string, content: string}>} Formatted messages for Claude
     */
    getConversationForClaude(userId, limit = 50) {
        const history = this.getConversationHistory(userId, limit);
        return history
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));
    }

    /**
     * Gets a summary of user context (facts) as a string.
     *
     * @param {string} userId - User identifier
     * @returns {string} Context summary for system prompts
     */
    getUserContextSummary(userId) {
        const facts = this.getFacts(userId);

        if (facts.length === 0) {
            return '';
        }

        const grouped = facts.reduce((acc, fact) => {
            if (!acc[fact.category]) {
                acc[fact.category] = [];
            }
            acc[fact.category].push(fact.fact);
            return acc;
        }, {});

        let summary = 'Known facts about this user:\n';
        for (const [category, factList] of Object.entries(grouped)) {
            summary += `\n${category}:\n`;
            factList.forEach(f => {
                summary += `  - ${f}\n`;
            });
        }

        return summary;
    }

    /**
     * Closes the database connection.
     * Should be called when shutting down the application.
     */
    close() {
        try {
            this.db.close();
            console.log('[MemoryManager] Database connection closed');
        } catch (error) {
            console.error('[MemoryManager] Error closing database:', error.message);
        }
    }

    /**
     * Runs a database backup.
     *
     * @param {string} backupPath - Path for backup file
     * @returns {Promise<void>}
     */
    async backup(backupPath) {
        return new Promise((resolve, reject) => {
            try {
                this.db.backup(backupPath)
                    .then(() => {
                        console.log(`[MemoryManager] Backup created at ${backupPath}`);
                        resolve();
                    })
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Runs VACUUM to optimize database.
     */
    optimize() {
        try {
            this.db.exec('VACUUM');
            console.log('[MemoryManager] Database optimized');
        } catch (error) {
            console.error('[MemoryManager] Error optimizing database:', error.message);
        }
    }
}

// Export singleton instance
module.exports = new MemoryManager();

// Also export class for testing or custom instances
module.exports.MemoryManager = MemoryManager;
