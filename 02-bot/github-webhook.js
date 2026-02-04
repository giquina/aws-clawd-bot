// GitHub Webhook Handler
// Formats GitHub events into mobile-friendly WhatsApp notifications
// Now routes alerts to repo-specific chats via ChatRegistry
// Integrates with AlertEscalation for critical event auto-escalation

const crypto = require('crypto');
const chatRegistry = require('./lib/chat-registry');

// Import alert escalation (lazy load to avoid circular deps)
let alertEscalation = null;
function getAlertEscalation() {
    if (!alertEscalation) {
        try {
            const { alertEscalation: ae } = require('./lib/alert-escalation');
            alertEscalation = ae;
        } catch (e) {
            console.log('[GitHub Webhook] Alert escalation not available:', e.message);
        }
    }
    return alertEscalation;
}

class GitHubWebhookHandler {
    constructor() {
        this.secret = process.env.GITHUB_WEBHOOK_SECRET || null;
    }

    /**
     * Verify GitHub webhook signature
     * @param {string} payload - Raw request body
     * @param {string} signature - X-Hub-Signature-256 header value
     * @returns {boolean} - Whether signature is valid
     */
    verifySignature(payload, signature) {
        if (!this.secret) {
            // No secret configured, skip verification
            return true;
        }

        if (!signature) {
            console.log('[GitHub Webhook] Missing signature header');
            return false;
        }

        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', this.secret)
            .update(payload, 'utf8')
            .digest('hex');

        const isValid = crypto.timingSafeEquals(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );

        if (!isValid) {
            console.log('[GitHub Webhook] Invalid signature');
        }

        return isValid;
    }

    /**
     * Format a GitHub event into a WhatsApp message
     * @param {string} eventType - GitHub event type from X-GitHub-Event header
     * @param {object} payload - GitHub webhook payload
     * @returns {string|null} - Formatted message or null if event should be ignored
     */
    formatEvent(eventType, payload) {
        const repo = payload.repository?.name || 'unknown';

        switch (eventType) {
            case 'push':
                return this.formatPush(repo, payload);

            case 'pull_request':
                return this.formatPullRequest(repo, payload);

            case 'issues':
                return this.formatIssue(repo, payload);

            case 'workflow_run':
                return this.formatWorkflowRun(repo, payload);

            case 'create':
                return this.formatCreate(repo, payload);

            case 'release':
                return this.formatRelease(repo, payload);

            case 'ping':
                return `[${repo}] Webhook connected successfully`;

            default:
                console.log(`[GitHub Webhook] Unhandled event type: ${eventType}`);
                return null;
        }
    }

    /**
     * Format push event
     */
    formatPush(repo, payload) {
        const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
        const commitCount = payload.commits?.length || 0;
        const pusher = payload.pusher?.name || payload.sender?.login || 'someone';

        // Skip if no commits (e.g., branch deletion)
        if (commitCount === 0) {
            return null;
        }

        const commitWord = commitCount === 1 ? 'commit' : 'commits';
        let message = `[${repo}] Push: ${commitCount} ${commitWord} to ${branch} by @${pusher}`;

        // Add first commit message if available
        if (payload.commits?.[0]?.message) {
            const firstCommit = payload.commits[0].message.split('\n')[0];
            const truncated = firstCommit.length > 50
                ? firstCommit.substring(0, 47) + '...'
                : firstCommit;
            message += `\n"${truncated}"`;
        }

        return message;
    }

    /**
     * Format pull request event
     */
    formatPullRequest(repo, payload) {
        const action = payload.action;
        const pr = payload.pull_request;
        const number = pr?.number || '?';
        const title = pr?.title || 'Untitled';
        const user = pr?.user?.login || 'someone';

        // Truncate long titles
        const truncatedTitle = title.length > 50
            ? title.substring(0, 47) + '...'
            : title;

        // Determine emoji and action text
        let emoji = '';
        let actionText = '';

        switch (action) {
            case 'opened':
                emoji = 'PR opened';
                actionText = `by @${user}`;
                break;
            case 'closed':
                if (pr?.merged) {
                    emoji = 'PR merged';
                    actionText = `by @${pr.merged_by?.login || user}`;
                } else {
                    emoji = 'PR closed';
                    actionText = '';
                }
                break;
            case 'reopened':
                emoji = 'PR reopened';
                actionText = `by @${user}`;
                break;
            case 'ready_for_review':
                emoji = 'PR ready for review';
                actionText = '';
                break;
            default:
                // Ignore other PR actions (edited, assigned, etc.)
                return null;
        }

        return `[${repo}] ${emoji} #${number}: "${truncatedTitle}" ${actionText}`.trim();
    }

    /**
     * Format issue event
     */
    formatIssue(repo, payload) {
        const action = payload.action;
        const issue = payload.issue;
        const number = issue?.number || '?';
        const title = issue?.title || 'Untitled';
        const user = issue?.user?.login || 'someone';

        // Truncate long titles
        const truncatedTitle = title.length > 50
            ? title.substring(0, 47) + '...'
            : title;

        let actionText = '';

        switch (action) {
            case 'opened':
                actionText = `Issue opened by @${user}`;
                break;
            case 'closed':
                actionText = 'Issue closed';
                break;
            case 'reopened':
                actionText = `Issue reopened by @${user}`;
                break;
            default:
                // Ignore other issue actions
                return null;
        }

        return `[${repo}] ${actionText} #${number}: "${truncatedTitle}"`;
    }

    /**
     * Format workflow run event
     */
    formatWorkflowRun(repo, payload) {
        const action = payload.action;
        const workflow = payload.workflow_run;

        // Only notify on completion
        if (action !== 'completed') {
            return null;
        }

        const workflowName = workflow?.name || 'Workflow';
        const conclusion = workflow?.conclusion;
        const branch = workflow?.head_branch || 'unknown';

        let emoji = '';
        let status = '';

        switch (conclusion) {
            case 'success':
                emoji = 'CI passed';
                status = 'passed';
                break;
            case 'failure':
                emoji = 'CI failed';
                status = 'failed';
                break;
            case 'cancelled':
                emoji = 'CI cancelled';
                status = 'cancelled';
                break;
            case 'skipped':
                // Don't notify for skipped workflows
                return null;
            default:
                emoji = 'CI';
                status = conclusion || 'completed';
        }

        return `[${repo}] ${emoji} on ${branch}\n${workflowName}: ${status}`;
    }

    /**
     * Format create event (branch/tag creation)
     */
    formatCreate(repo, payload) {
        const refType = payload.ref_type; // 'branch' or 'tag'
        const refName = payload.ref;
        const user = payload.sender?.login || 'someone';

        if (!refType || !refName) {
            return null;
        }

        const typeLabel = refType === 'branch' ? 'Branch' : 'Tag';
        return `[${repo}] ${typeLabel} created: ${refName} by @${user}`;
    }

    /**
     * Format release event
     */
    formatRelease(repo, payload) {
        const action = payload.action;
        const release = payload.release;

        // Only notify on published releases
        if (action !== 'published') {
            return null;
        }

        const tagName = release?.tag_name || 'unknown';
        const name = release?.name || tagName;
        const user = release?.author?.login || 'someone';
        const isPrerelease = release?.prerelease;

        const releaseType = isPrerelease ? 'Pre-release' : 'Release';

        // Use release name if different from tag
        const displayName = name !== tagName ? `${name} (${tagName})` : tagName;

        return `[${repo}] ${releaseType} published: ${displayName} by @${user}`;
    }

    /**
     * Determine if an event is critical (CI failures, etc.)
     * @param {string} eventType - GitHub event type
     * @param {object} payload - GitHub webhook payload
     * @returns {boolean} - Whether the event is critical
     */
    isCriticalEvent(eventType, payload) {
        // CI failures are critical
        if (eventType === 'workflow_run' && payload.workflow_run?.conclusion === 'failure') {
            return true;
        }

        // Could extend to include other critical events (security alerts, etc.)
        return false;
    }

    /**
     * Trigger alert escalation for critical GitHub events
     * This enables automatic Telegram -> WhatsApp -> Voice Call escalation
     * @param {string} eventType - GitHub event type
     * @param {object} payload - GitHub webhook payload
     * @returns {Promise<string|null>} - Alert ID if escalation created, null otherwise
     */
    async escalateIfCritical(eventType, payload) {
        const escalation = getAlertEscalation();
        if (!escalation) {
            return null;
        }

        const repo = payload.repository?.name || 'unknown';

        // CI failure on main/master branch
        if (eventType === 'workflow_run' && payload.workflow_run?.conclusion === 'failure') {
            const branch = payload.workflow_run.head_branch;
            const workflowName = payload.workflow_run?.name || 'CI';

            if (branch === 'main' || branch === 'master') {
                // Critical: CI failed on main branch
                return await escalation.createAlert('CI_FAILURE_MAIN',
                    `${repo}: ${workflowName} failed on ${branch}`,
                    {
                        metadata: {
                            repo,
                            branch,
                            workflow: workflowName,
                            runUrl: payload.workflow_run?.html_url
                        }
                    }
                );
            } else {
                // Warning: CI failed on other branch (no voice escalation)
                return await escalation.createAlert('CI_FAILURE_OTHER',
                    `${repo}: ${workflowName} failed on ${branch}`,
                    {
                        metadata: {
                            repo,
                            branch,
                            workflow: workflowName,
                            runUrl: payload.workflow_run?.html_url
                        }
                    }
                );
            }
        }

        // Security advisory alert
        if (eventType === 'security_advisory') {
            return await escalation.createAlert('SECURITY_ALERT',
                `${repo}: Security vulnerability detected`,
                {
                    metadata: {
                        repo,
                        severity: payload.security_advisory?.severity
                    }
                }
            );
        }

        return null;
    }

    /**
     * Determine which chats should receive this notification based on event type
     * @param {string} eventType - GitHub event type
     * @param {object} payload - GitHub webhook payload
     * @returns {Object} - { targets: ChatRegistration[], isCritical: boolean }
     */
    getNotificationTargets(eventType, payload) {
        const repo = payload.repository?.name || 'unknown';
        const isCritical = this.isCriticalEvent(eventType, payload);

        // Get all chats that should receive this notification
        const targets = chatRegistry.getNotificationTargets(repo, isCritical);

        console.log(`[GitHub Webhook] Notification targets for ${repo} (critical: ${isCritical}): ${targets.length} chat(s)`);

        return {
            targets,
            isCritical,
            repo
        };
    }

    /**
     * Check if a specific chat should receive this event based on its notification level
     * @param {Object} chatRegistration - Chat registration from registry
     * @param {string} eventType - GitHub event type
     * @param {object} payload - GitHub webhook payload
     * @returns {boolean} - Whether to send the notification
     */
    shouldNotifyChat(chatRegistration, eventType, payload) {
        const level = chatRegistration.notifications || 'all';

        // 'all' level receives everything
        if (level === 'all') {
            return true;
        }

        // 'critical' level only receives CI failures
        if (level === 'critical') {
            return this.isCriticalEvent(eventType, payload);
        }

        // 'digest' level doesn't receive real-time notifications
        if (level === 'digest') {
            return false;
        }

        // Unknown level defaults to receiving
        return true;
    }

    /**
     * Get the default HQ chat (fallback when no repo-specific chat is found)
     * Prefers Telegram HQ, falls back to WhatsApp
     * @returns {Object|null} - { chatId, platform } or null
     */
    getDefaultHQChat() {
        // Use chat-registry's getDefaultChat which prefers Telegram
        const defaultChat = chatRegistry.getDefaultChat();
        if (defaultChat) {
            return defaultChat;
        }

        // Legacy fallback: try TELEGRAM_HQ_CHAT_ID first
        const telegramHQ = process.env.TELEGRAM_HQ_CHAT_ID;
        if (telegramHQ) {
            return { chatId: telegramHQ, platform: 'telegram' };
        }

        // Last resort: WhatsApp
        return process.env.YOUR_WHATSAPP
            ? { chatId: `whatsapp:${process.env.YOUR_WHATSAPP}`, platform: 'whatsapp' }
            : null;
    }

    /**
     * Get the default HQ chat ID (fallback when no repo-specific chat is found)
     * @deprecated Use getDefaultHQChat() instead for platform awareness
     * @returns {string|null} - HQ chat ID or null
     */
    getDefaultHQChatId() {
        const defaultChat = this.getDefaultHQChat();
        return defaultChat ? defaultChat.chatId : null;
    }
}

module.exports = new GitHubWebhookHandler();
