// GitHub Webhook Handler
// Formats GitHub events into mobile-friendly WhatsApp notifications

const crypto = require('crypto');

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
}

module.exports = new GitHubWebhookHandler();
