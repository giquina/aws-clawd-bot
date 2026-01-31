// Scheduler Module - Manages scheduled jobs using node-cron
// Supports persistent jobs, timezone handling, and built-in job types

const cron = require('node-cron');

/**
 * Scheduler class for managing cron jobs
 * Jobs persist to database and can send proactive WhatsApp messages
 */
class Scheduler {
    constructor(db, sendMessage) {
        this.db = db;                     // Memory manager for persistence
        this.sendMessage = sendMessage;   // Function to send WhatsApp messages
        this.jobs = new Map();            // Active cron jobs { jobId: cronTask }
        this.handlers = new Map();        // Job handlers { handlerName: function }
        this.timezone = 'Europe/London';  // Default timezone
        this.isRunning = false;

        // Register built-in handlers
        this._registerBuiltInHandlers();
    }

    /**
     * Register built-in job handlers
     * @private
     */
    _registerBuiltInHandlers() {
        this.registerHandler('morning-brief', this.handleMorningBrief.bind(this));
        this.registerHandler('evening-report', this.handleEveningReport.bind(this));
        this.registerHandler('health-check', this.handleHealthCheck.bind(this));
        this.registerHandler('custom', this.handleCustomJob.bind(this));
    }

    /**
     * Register a custom job handler
     * @param {string} name - Handler name
     * @param {Function} handler - Async function(params) => string|void
     */
    registerHandler(name, handler) {
        this.handlers.set(name, handler);
    }

    /**
     * Load jobs from database and start them
     * @returns {Promise<number>} Number of jobs started
     */
    async start() {
        if (this.isRunning) {
            console.log('[Scheduler] Already running');
            return 0;
        }

        console.log('[Scheduler] Starting scheduler...');
        this.isRunning = true;

        try {
            // Load all enabled jobs from database
            const jobs = await this._loadJobsFromDb();
            let startedCount = 0;

            for (const job of jobs) {
                if (job.enabled) {
                    const started = this._startCronJob(job);
                    if (started) startedCount++;
                }
            }

            console.log(`[Scheduler] Started ${startedCount} jobs`);
            return startedCount;
        } catch (error) {
            console.error('[Scheduler] Error starting scheduler:', error);
            return 0;
        }
    }

    /**
     * Stop all running jobs
     */
    stop() {
        console.log('[Scheduler] Stopping all jobs...');

        for (const [jobId, cronTask] of this.jobs) {
            cronTask.stop();
            console.log(`[Scheduler] Stopped job: ${jobId}`);
        }

        this.jobs.clear();
        this.isRunning = false;
        console.log('[Scheduler] All jobs stopped');
    }

    /**
     * Schedule a new job
     * @param {string} name - Job name (unique identifier)
     * @param {string} cronExpression - Cron expression (e.g., '0 8 * * *' for 8am daily)
     * @param {string} handler - Handler name (must be registered)
     * @param {Object} params - Parameters passed to handler
     * @returns {Promise<Object>} Created job record
     */
    async schedule(name, cronExpression, handler, params = {}) {
        // Validate cron expression
        if (!cron.validate(cronExpression)) {
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }

        // Check handler exists
        if (!this.handlers.has(handler)) {
            throw new Error(`Unknown handler: ${handler}. Available: ${[...this.handlers.keys()].join(', ')}`);
        }

        // Check for duplicate name
        const existing = await this._getJobByName(name);
        if (existing) {
            throw new Error(`Job with name '${name}' already exists. Use cancel() first to reschedule.`);
        }

        // Create job record
        const job = {
            id: this._generateId(),
            name,
            cron_expression: cronExpression,
            handler,
            params: JSON.stringify(params),
            enabled: true,
            timezone: this.timezone,
            created_at: new Date().toISOString(),
            last_run: null,
            next_run: this._calculateNextRun(cronExpression),
            run_count: 0
        };

        // Save to database
        await this._saveJobToDb(job);

        // Start the cron job if scheduler is running
        if (this.isRunning) {
            this._startCronJob(job);
        }

        console.log(`[Scheduler] Scheduled job: ${name} (${cronExpression})`);
        return job;
    }

    /**
     * Cancel a scheduled job
     * @param {string} jobId - Job ID to cancel
     * @returns {Promise<boolean>} True if cancelled
     */
    async cancel(jobId) {
        // Stop the cron task if running
        if (this.jobs.has(jobId)) {
            this.jobs.get(jobId).stop();
            this.jobs.delete(jobId);
        }

        // Remove from database
        const deleted = await this._deleteJobFromDb(jobId);

        if (deleted) {
            console.log(`[Scheduler] Cancelled job: ${jobId}`);
        }

        return deleted;
    }

    /**
     * Cancel a job by name
     * @param {string} name - Job name to cancel
     * @returns {Promise<boolean>} True if cancelled
     */
    async cancelByName(name) {
        const job = await this._getJobByName(name);
        if (job) {
            return this.cancel(job.id);
        }
        return false;
    }

    /**
     * List all scheduled jobs
     * @returns {Promise<Array>} Array of job records
     */
    async list() {
        return this._loadJobsFromDb();
    }

    /**
     * Enable a disabled job
     * @param {string} jobId - Job ID to enable
     * @returns {Promise<boolean>} True if enabled
     */
    async enable(jobId) {
        const job = await this._getJobById(jobId);
        if (!job) return false;

        job.enabled = true;
        await this._updateJobInDb(job);

        // Start the cron job if scheduler is running
        if (this.isRunning && !this.jobs.has(jobId)) {
            this._startCronJob(job);
        }

        console.log(`[Scheduler] Enabled job: ${job.name}`);
        return true;
    }

    /**
     * Disable a job (stops execution but keeps the record)
     * @param {string} jobId - Job ID to disable
     * @returns {Promise<boolean>} True if disabled
     */
    async disable(jobId) {
        const job = await this._getJobById(jobId);
        if (!job) return false;

        job.enabled = false;
        await this._updateJobInDb(job);

        // Stop the cron task if running
        if (this.jobs.has(jobId)) {
            this.jobs.get(jobId).stop();
            this.jobs.delete(jobId);
        }

        console.log(`[Scheduler] Disabled job: ${job.name}`);
        return true;
    }

    /**
     * Set timezone for new jobs
     * @param {string} timezone - IANA timezone (e.g., 'Europe/London')
     */
    setTimezone(timezone) {
        this.timezone = timezone;
    }

    /**
     * Get a job by ID
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>} Job record or null
     */
    async getJob(jobId) {
        return this._getJobById(jobId);
    }

    /**
     * Get a job by name
     * @param {string} name - Job name
     * @returns {Promise<Object|null>} Job record or null
     */
    async getJobByName(name) {
        return this._getJobByName(name);
    }

    /**
     * Manually trigger a job immediately
     * @param {string} jobId - Job ID to trigger
     * @returns {Promise<string|null>} Result message or null
     */
    async triggerNow(jobId) {
        const job = await this._getJobById(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        return this._executeJob(job);
    }

    // ==================== Built-in Job Handlers ====================

    /**
     * Morning brief handler - sends daily summary
     * @param {Object} params - Job parameters
     * @returns {Promise<string>} Message to send
     */
    async handleMorningBrief(params = {}) {
        const morningBrief = require('./jobs/morning-brief');
        return morningBrief.generate(this.db, params);
    }

    /**
     * Evening report handler - sends end-of-day summary
     * @param {Object} params - Job parameters
     * @returns {Promise<string>} Message to send
     */
    async handleEveningReport(params = {}) {
        const hour = new Date().getHours();
        let greeting = 'Good evening';

        // Build evening summary
        let message = `${greeting}! Here's your end-of-day report:\n\n`;

        try {
            // Get today's activity summary
            if (this.db) {
                const today = new Date().toISOString().split('T')[0];
                const conversations = await this.db.query(
                    'conversations',
                    { where: { date: today } }
                ) || [];

                const tasksDone = await this.db.query(
                    'tasks',
                    { where: { completed_at: today } }
                ) || [];

                message += `Today's activity:\n`;
                message += `- Conversations: ${conversations.length}\n`;
                message += `- Tasks completed: ${tasksDone.length}\n`;
            } else {
                message += `Activity tracking not available (database not connected)\n`;
            }

            message += `\nHave a good evening!`;
        } catch (error) {
            console.error('[Scheduler] Error generating evening report:', error);
            message += `Unable to generate full report. Have a good evening!`;
        }

        return message;
    }

    /**
     * Health check handler - sends system status
     * @param {Object} params - Job parameters
     * @returns {Promise<string>} Message to send
     */
    async handleHealthCheck(params = {}) {
        const uptime = Math.floor(process.uptime());
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        return `Health Check Report:\n` +
               `Status: Online\n` +
               `Uptime: ${hours}h ${minutes}m\n` +
               `Memory: ${memoryMB} MB\n` +
               `Active Jobs: ${this.jobs.size}`;
    }

    /**
     * Custom job handler - executes user-defined message
     * @param {Object} params - Job parameters including 'message'
     * @returns {Promise<string>} Message to send
     */
    async handleCustomJob(params = {}) {
        return params.message || 'Scheduled reminder (no message set)';
    }

    // ==================== Private Methods ====================

    /**
     * Start a cron job from a job record
     * @private
     */
    _startCronJob(job) {
        try {
            const cronTask = cron.schedule(
                job.cron_expression,
                async () => {
                    await this._executeJob(job);
                },
                {
                    scheduled: true,
                    timezone: job.timezone || this.timezone
                }
            );

            this.jobs.set(job.id, cronTask);
            console.log(`[Scheduler] Started cron job: ${job.name} (${job.cron_expression})`);
            return true;
        } catch (error) {
            console.error(`[Scheduler] Failed to start job ${job.name}:`, error);
            return false;
        }
    }

    /**
     * Execute a job and send the result
     * @private
     */
    async _executeJob(job) {
        console.log(`[Scheduler] Executing job: ${job.name}`);

        try {
            const handler = this.handlers.get(job.handler);
            if (!handler) {
                throw new Error(`Handler not found: ${job.handler}`);
            }

            const params = typeof job.params === 'string'
                ? JSON.parse(job.params)
                : job.params;

            // Execute the handler
            const result = await handler(params);

            // Update job stats
            job.last_run = new Date().toISOString();
            job.next_run = this._calculateNextRun(job.cron_expression);
            job.run_count = (job.run_count || 0) + 1;
            await this._updateJobInDb(job);

            // Send the message if there's a result and sendMessage is available
            if (result && this.sendMessage) {
                await this.sendMessage(result);
                console.log(`[Scheduler] Sent message for job: ${job.name}`);
            }

            return result;
        } catch (error) {
            console.error(`[Scheduler] Error executing job ${job.name}:`, error);

            // Record error
            job.last_error = error.message;
            job.last_run = new Date().toISOString();
            await this._updateJobInDb(job);

            return null;
        }
    }

    /**
     * Calculate next run time for a cron expression
     * @private
     */
    _calculateNextRun(cronExpression) {
        // Simple estimation - cron-parser could be used for accuracy
        // For now, return null (will be calculated at runtime)
        return null;
    }

    /**
     * Generate a unique job ID
     * @private
     */
    _generateId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ==================== Database Operations ====================

    /**
     * Load all jobs from database
     * @private
     */
    async _loadJobsFromDb() {
        if (!this.db) {
            console.warn('[Scheduler] No database connected, using in-memory only');
            return [];
        }

        try {
            const jobs = await this.db.query('scheduled_jobs', {}) || [];
            return jobs;
        } catch (error) {
            console.error('[Scheduler] Error loading jobs from database:', error);
            return [];
        }
    }

    /**
     * Save a job to database
     * @private
     */
    async _saveJobToDb(job) {
        if (!this.db) {
            console.warn('[Scheduler] No database connected, job not persisted');
            return;
        }

        try {
            await this.db.insert('scheduled_jobs', job);
        } catch (error) {
            console.error('[Scheduler] Error saving job to database:', error);
            throw error;
        }
    }

    /**
     * Update a job in database
     * @private
     */
    async _updateJobInDb(job) {
        if (!this.db) return;

        try {
            await this.db.update('scheduled_jobs', { id: job.id }, job);
        } catch (error) {
            console.error('[Scheduler] Error updating job in database:', error);
        }
    }

    /**
     * Delete a job from database
     * @private
     */
    async _deleteJobFromDb(jobId) {
        if (!this.db) return false;

        try {
            await this.db.delete('scheduled_jobs', { id: jobId });
            return true;
        } catch (error) {
            console.error('[Scheduler] Error deleting job from database:', error);
            return false;
        }
    }

    /**
     * Get a job by ID from database
     * @private
     */
    async _getJobById(jobId) {
        if (!this.db) return null;

        try {
            const jobs = await this.db.query('scheduled_jobs', { where: { id: jobId } }) || [];
            return jobs[0] || null;
        } catch (error) {
            console.error('[Scheduler] Error getting job by ID:', error);
            return null;
        }
    }

    /**
     * Get a job by name from database
     * @private
     */
    async _getJobByName(name) {
        if (!this.db) return null;

        try {
            const jobs = await this.db.query('scheduled_jobs', { where: { name } }) || [];
            return jobs[0] || null;
        } catch (error) {
            console.error('[Scheduler] Error getting job by name:', error);
            return null;
        }
    }
}

// Factory function to create scheduler instance
function createScheduler(db, sendMessage) {
    return new Scheduler(db, sendMessage);
}

// Singleton instance (initialized later with dependencies)
let schedulerInstance = null;

/**
 * Get or create the scheduler singleton
 * @param {Object} db - Memory manager instance
 * @param {Function} sendMessage - Function to send WhatsApp messages
 * @returns {Scheduler} Scheduler instance
 */
function getScheduler(db, sendMessage) {
    if (!schedulerInstance) {
        schedulerInstance = new Scheduler(db, sendMessage);
    }
    return schedulerInstance;
}

module.exports = {
    Scheduler,
    createScheduler,
    getScheduler
};
