// scheduler/jobs/proactive-alerts.js
// Proactive Alerts Job - Sends daily alerts for deadlines, PRs, and CI status
// Primary: Telegram, Backup: WhatsApp (critical only)

const twilio = require('twilio');
const { Octokit } = require('@octokit/rest');

/**
 * ProactiveAlerts class for sending daily notification digests
 * Checks: Company deadlines, PRs waiting for review, Failed CI runs
 * Uses Telegram as primary platform, WhatsApp only for critical alerts
 */
class ProactiveAlerts {
    constructor() {
        this.twilioClient = null;
        this.telegramHandler = null;
        this.octokit = null;
        this.ownerNumber = process.env.YOUR_WHATSAPP;
        this.twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        this.telegramHQChatId = process.env.TELEGRAM_HQ_CHAT_ID;
    }

    /**
     * Initialize Twilio, Telegram, and GitHub clients
     * Called once when the job runs
     */
    initialize() {
        if (process.env.TWILIO_ACCOUNT_SID) {
            this.twilioClient = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
        }
        if (process.env.GITHUB_TOKEN) {
            this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        }
    }

    /**
     * Set the Telegram handler for sending alerts
     * @param {Object} handler - Telegram handler instance
     */
    setTelegramHandler(handler) {
        this.telegramHandler = handler;
    }

    /**
     * Main entry point - runs the daily check and sends alerts
     * @returns {Promise<string|null>} Alert message or null if no alerts
     */
    async runDailyCheck() {
        console.log('[ProactiveAlerts] Running daily check...');

        // Initialize clients if not already done
        if (!this.twilioClient && !this.octokit) {
            this.initialize();
        }

        const alerts = [];

        // Check deadlines
        const deadlineAlerts = await this.checkDeadlines();
        if (deadlineAlerts.length) alerts.push(...deadlineAlerts);

        // Check PRs
        const prAlerts = await this.checkPRs();
        if (prAlerts.length) alerts.push(...prAlerts);

        // Check failed workflows (CI failures are critical - send to WhatsApp too)
        const ciAlerts = await this.checkCI();
        const hasCritical = ciAlerts.length > 0; // CI failures are critical
        if (ciAlerts.length) alerts.push(...ciAlerts);

        if (alerts.length > 0) {
            const message = await this.sendAlert(alerts, hasCritical);
            return message;
        } else {
            console.log('[ProactiveAlerts] No alerts to send');
            return null;
        }
    }

    /**
     * Check company deadlines (CS01 filings)
     * @returns {Promise<string[]>} Array of deadline alerts
     */
    async checkDeadlines() {
        const alerts = [];

        // Company incorporation dates for CS01 deadline calculation
        const companies = {
            GMH: { name: 'Giquina Management Holdings', incorporated: '2024-01-18' },
            GACC: { name: 'Giquina Accountancy', incorporated: '2025-04-20' },
            GCAP: { name: 'Giquina Capital', incorporated: '2025-04-02' },
            GQCARS: { name: 'GQ Cars', incorporated: '2024-01-05' },
            GSPV: { name: 'Giquina SPV', incorporated: '2025-04-07' }
        };

        const now = new Date();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        for (const [code, company] of Object.entries(companies)) {
            // CS01 due annually on incorporation anniversary + 14 days
            const incDate = new Date(company.incorporated);
            const thisYearCS01 = new Date(
                now.getFullYear(),
                incDate.getMonth(),
                incDate.getDate() + 14
            );

            // If this year's deadline has passed, check next year
            if (thisYearCS01 < now) {
                thisYearCS01.setFullYear(thisYearCS01.getFullYear() + 1);
            }

            const daysUntilCS01 = Math.ceil(
                (thisYearCS01 - now) / (24 * 60 * 60 * 1000)
            );

            if (daysUntilCS01 <= 7 && daysUntilCS01 > 0) {
                alerts.push(`[!] ${code}: CS01 due in ${daysUntilCS01} days`);
            } else if (daysUntilCS01 <= 0) {
                alerts.push(`[!!] ${code}: CS01 OVERDUE by ${Math.abs(daysUntilCS01)} days!`);
            }
        }

        return alerts;
    }

    /**
     * Check for open PRs waiting for review
     * @returns {Promise<string[]>} Array of PR alerts
     */
    async checkPRs() {
        if (!this.octokit) return [];

        const alerts = [];
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const username = process.env.GITHUB_USERNAME;

        // Check first 5 repos only to avoid rate limits
        for (const repo of repos.slice(0, 5)) {
            try {
                const { data: prs } = await this.octokit.pulls.list({
                    owner: username,
                    repo: repo.trim(),
                    state: 'open',
                    per_page: 5
                });

                for (const pr of prs) {
                    const daysOpen = Math.floor(
                        (Date.now() - new Date(pr.created_at)) / (24 * 60 * 60 * 1000)
                    );

                    // Alert if PR has been open for 3+ days
                    if (daysOpen >= 3) {
                        alerts.push(`[PR] #${pr.number} in ${repo} open for ${daysOpen} days`);
                    }
                }
            } catch (e) {
                // Skip if repo not found or access denied
                console.log(`[ProactiveAlerts] Skipping repo ${repo}: ${e.message}`);
            }
        }

        return alerts;
    }

    /**
     * Check for failed CI/CD workflow runs
     * @returns {Promise<string[]>} Array of CI failure alerts
     */
    async checkCI() {
        if (!this.octokit) return [];

        const alerts = [];
        const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
        const username = process.env.GITHUB_USERNAME;

        // Check first 3 repos to avoid rate limits
        for (const repo of repos.slice(0, 3)) {
            try {
                const { data: runs } = await this.octokit.actions.listWorkflowRunsForRepo({
                    owner: username,
                    repo: repo.trim(),
                    per_page: 3
                });

                for (const run of runs.workflow_runs || []) {
                    if (run.conclusion === 'failure') {
                        alerts.push(`[CI] Failed: ${repo} - ${run.name}`);
                        break; // Only one alert per repo
                    }
                }
            } catch (e) {
                // Skip if workflows not accessible
                console.log(`[ProactiveAlerts] Skipping CI check for ${repo}: ${e.message}`);
            }
        }

        return alerts;
    }

    /**
     * Send the compiled alerts (Telegram primary, WhatsApp for critical only)
     * @param {string[]} alerts - Array of alert messages
     * @param {boolean} hasCritical - Whether any alerts are critical (CI failures)
     * @returns {Promise<string>} The formatted message that was sent
     */
    async sendAlert(alerts, hasCritical = false) {
        const message = `*DAILY CLAWDBOT ALERT*

${alerts.join('\n')}

Reply "deadlines" or "status" for more info.`;

        let sentToTelegram = false;

        // Send to Telegram first (primary platform)
        if (this.telegramHandler && this.telegramHQChatId) {
            try {
                await this.telegramHandler.sendMessage(this.telegramHQChatId, message);
                console.log('[ProactiveAlerts] Daily alert sent to Telegram');
                sentToTelegram = true;
            } catch (e) {
                console.error('[ProactiveAlerts] Failed to send to Telegram:', e.message);
            }
        }

        // Send to WhatsApp only if:
        // 1. Critical alerts (CI failures) - always backup to WhatsApp
        // 2. Telegram failed and we need a fallback
        if (hasCritical || !sentToTelegram) {
            if (this.twilioClient && this.ownerNumber) {
                try {
                    await this.twilioClient.messages.create({
                        body: message,
                        from: `whatsapp:${this.twilioNumber}`,
                        to: `whatsapp:${this.ownerNumber}`
                    });
                    const reason = hasCritical ? '(critical backup)' : '(Telegram fallback)';
                    console.log(`[ProactiveAlerts] Daily alert sent to WhatsApp ${reason}`);
                } catch (e) {
                    console.error('[ProactiveAlerts] Failed to send to WhatsApp:', e.message);
                }
            } else if (!sentToTelegram) {
                console.log('[ProactiveAlerts] No messaging platform configured, logging alert only');
                console.log(message);
            }
        }

        return message;
    }
}

// Singleton instance
const proactiveAlerts = new ProactiveAlerts();

/**
 * Generate function for scheduler integration
 * Called by the scheduler's handler when the job runs
 * @param {Object} db - Memory manager instance (not used but passed by scheduler)
 * @param {Object} params - Job parameters
 * @returns {Promise<string|null>} Alert message or null
 */
async function generate(db, params = {}) {
    return proactiveAlerts.runDailyCheck();
}

module.exports = {
    ProactiveAlerts,
    generate,
    // Export singleton for direct usage
    instance: proactiveAlerts
};
