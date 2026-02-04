// scheduler/jobs/nightly-autonomous.js
// Nightly Autonomous Job Runner for ClawdBot
// Uses Claude Opus to analyze repos and identify high-leverage tasks
// Uses Claude Sonnet to execute safe autonomous tasks (docs, tests, refactoring)

const Anthropic = require('@anthropic-ai/sdk');
const { Octokit } = require('@octokit/rest');

/**
 * Configuration for nightly autonomous job
 * Can be overridden via environment variables
 */
const config = {
    // Master switch for the job
    enabled: process.env.NIGHTLY_AUTONOMOUS_ENABLED !== 'false',

    // Run time (24h format, default 2:00 AM)
    runTime: process.env.NIGHTLY_RUN_TIME || '02:00',

    // Maximum tasks to execute per night
    maxTasks: parseInt(process.env.NIGHTLY_MAX_TASKS || '5', 10),

    // Safe mode: only docs/tests (true) vs full code changes (false)
    safeMode: process.env.NIGHTLY_SAFE_MODE !== 'false',

    // Minimum impact score to consider a task (0-100)
    minImpactScore: parseInt(process.env.NIGHTLY_MIN_IMPACT || '40', 10),

    // Maximum effort score to auto-execute (0-100, lower = easier)
    maxEffortScore: parseInt(process.env.NIGHTLY_MAX_EFFORT || '60', 10),

    // Dry run mode (analyze but don't execute)
    dryRun: process.env.NIGHTLY_DRY_RUN === 'true',

    // Repos to monitor (comma-separated in env)
    repos: (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean)
};

/**
 * NightlyAutonomous class - Main job handler
 * Scans repos, identifies tasks, and executes safe improvements
 */
class NightlyAutonomous {
    constructor() {
        this.octokit = null;
        this.anthropic = null;
        this.username = process.env.GITHUB_USERNAME;
        this.initialized = false;

        // Track what was done this run
        this.runLog = {
            startTime: null,
            endTime: null,
            reposScanned: [],
            tasksIdentified: [],
            tasksExecuted: [],
            tasksFailed: [],
            morningReport: null
        };

        // Models for different tasks
        this.models = {
            opus: 'claude-opus-4-20250514',     // For analysis and planning
            sonnet: 'claude-sonnet-4-20250514'  // For execution
        };
    }

    /**
     * Initialize GitHub and Anthropic clients
     */
    async initialize() {
        if (this.initialized) return;

        // Initialize Octokit
        if (process.env.GITHUB_TOKEN) {
            this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        } else {
            throw new Error('GITHUB_TOKEN not configured');
        }

        // Initialize Anthropic
        if (process.env.ANTHROPIC_API_KEY) {
            this.anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        } else {
            throw new Error('ANTHROPIC_API_KEY not configured');
        }

        this.initialized = true;
        console.log('[NightlyAutonomous] Initialized successfully');
    }

    /**
     * Main entry point - runs the nightly autonomous job
     * @param {Object} db - Memory manager instance
     * @param {Object} params - Job parameters
     * @returns {Promise<string|null>} Summary message or null
     */
    async run(db, params = {}) {
        console.log('[NightlyAutonomous] Starting nightly run...');
        this.runLog.startTime = new Date().toISOString();

        if (!config.enabled) {
            console.log('[NightlyAutonomous] Job disabled via config');
            return null;
        }

        try {
            await this.initialize();

            // Phase 1: Scan all repos and gather data
            const repoData = await this.scanAllRepos();

            // Phase 2: Use Opus to analyze and prioritize tasks
            const prioritizedTasks = await this.analyzeAndPrioritize(repoData);

            // Phase 3: Execute tasks using Sonnet (respecting limits)
            const results = await this.executeTasks(prioritizedTasks);

            // Phase 4: Generate morning report
            const report = await this.generateMorningReport(results);

            this.runLog.endTime = new Date().toISOString();
            this.runLog.morningReport = report;

            // Store the report for morning delivery
            if (db && typeof db.set === 'function') {
                db.set('nightly_autonomous_report', {
                    date: new Date().toISOString().split('T')[0],
                    report: report,
                    runLog: this.runLog
                });
            }

            console.log('[NightlyAutonomous] Completed successfully');
            return report;

        } catch (error) {
            console.error('[NightlyAutonomous] Failed:', error.message);
            this.runLog.endTime = new Date().toISOString();

            // Return error summary for morning report
            return `*NIGHTLY AUTONOMOUS - ERROR*\n\nThe nightly job encountered an error:\n${error.message}\n\nCheck logs for details.`;
        }
    }

    /**
     * Phase 1: Scan all monitored repositories
     * Gathers: open issues, stale PRs, TODO comments, recent activity
     */
    async scanAllRepos() {
        const repos = config.repos;
        console.log(`[NightlyAutonomous] Scanning ${repos.length} repos...`);

        const repoData = [];

        for (const repoName of repos) {
            try {
                console.log(`[NightlyAutonomous] Scanning: ${repoName}`);
                const data = await this.scanRepo(repoName.trim());
                repoData.push(data);
                this.runLog.reposScanned.push(repoName);
            } catch (error) {
                console.error(`[NightlyAutonomous] Failed to scan ${repoName}:`, error.message);
            }
        }

        return repoData;
    }

    /**
     * Scan a single repository for opportunities
     */
    async scanRepo(repoName) {
        const data = {
            name: repoName,
            issues: [],
            stalePRs: [],
            todos: [],
            recentCommits: [],
            readme: null,
            hasTests: false,
            hasCI: false
        };

        // Get open issues
        try {
            const { data: issues } = await this.octokit.issues.listForRepo({
                owner: this.username,
                repo: repoName,
                state: 'open',
                per_page: 20
            });
            data.issues = issues.filter(i => !i.pull_request).map(i => ({
                number: i.number,
                title: i.title,
                body: i.body?.substring(0, 500) || '',
                labels: i.labels.map(l => l.name),
                createdAt: i.created_at,
                daysOpen: this.daysSince(i.created_at)
            }));
        } catch (e) {
            console.log(`[NightlyAutonomous] Could not fetch issues for ${repoName}`);
        }

        // Get stale PRs (open > 7 days)
        try {
            const { data: prs } = await this.octokit.pulls.list({
                owner: this.username,
                repo: repoName,
                state: 'open',
                per_page: 10
            });
            data.stalePRs = prs
                .filter(pr => this.daysSince(pr.created_at) >= 7)
                .map(pr => ({
                    number: pr.number,
                    title: pr.title,
                    daysOpen: this.daysSince(pr.created_at),
                    author: pr.user.login
                }));
        } catch (e) {
            console.log(`[NightlyAutonomous] Could not fetch PRs for ${repoName}`);
        }

        // Search for TODO comments
        try {
            const { data: searchResults } = await this.octokit.search.code({
                q: `TODO repo:${this.username}/${repoName}`,
                per_page: 30
            });
            data.todos = searchResults.items.map(item => ({
                path: item.path,
                url: item.html_url
            }));
        } catch (e) {
            console.log(`[NightlyAutonomous] Could not search TODOs for ${repoName}`);
        }

        // Get recent commits
        try {
            const { data: commits } = await this.octokit.repos.listCommits({
                owner: this.username,
                repo: repoName,
                per_page: 10
            });
            data.recentCommits = commits.map(c => ({
                sha: c.sha.substring(0, 7),
                message: c.commit.message.split('\n')[0].substring(0, 100),
                date: c.commit.author.date
            }));
        } catch (e) {
            console.log(`[NightlyAutonomous] Could not fetch commits for ${repoName}`);
        }

        // Check for README
        try {
            const { data: readme } = await this.octokit.repos.getReadme({
                owner: this.username,
                repo: repoName
            });
            const content = Buffer.from(readme.content, 'base64').toString('utf8');
            data.readme = content.substring(0, 2000);
        } catch (e) {
            data.readme = null;
        }

        // Check for tests directory
        try {
            await this.octokit.repos.getContent({
                owner: this.username,
                repo: repoName,
                path: 'tests'
            });
            data.hasTests = true;
        } catch (e) {
            try {
                await this.octokit.repos.getContent({
                    owner: this.username,
                    repo: repoName,
                    path: '__tests__'
                });
                data.hasTests = true;
            } catch (e2) {
                data.hasTests = false;
            }
        }

        // Check for CI workflows
        try {
            const { data: workflows } = await this.octokit.actions.listRepoWorkflows({
                owner: this.username,
                repo: repoName
            });
            data.hasCI = workflows.total_count > 0;
        } catch (e) {
            data.hasCI = false;
        }

        return data;
    }

    /**
     * Phase 2: Use Claude Opus to analyze and prioritize tasks
     * @param {Array} repoData - Data from all scanned repos
     * @returns {Array} Prioritized list of tasks
     */
    async analyzeAndPrioritize(repoData) {
        console.log('[NightlyAutonomous] Analyzing with Opus...');

        const analysisPrompt = `You are an AI code maintainer analyzing repositories for autonomous improvement opportunities.

REPOSITORIES SCANNED:
${JSON.stringify(repoData, null, 2)}

CONFIGURATION:
- Safe Mode: ${config.safeMode} (${config.safeMode ? 'Only documentation, tests, and minor refactoring' : 'Full code changes allowed'})
- Max Tasks Tonight: ${config.maxTasks}
- Min Impact Score: ${config.minImpactScore}/100
- Max Effort Score: ${config.maxEffortScore}/100

YOUR TASK:
Analyze the repositories and identify high-leverage autonomous tasks. Focus on:
1. Open issues that could be quickly resolved
2. Missing or outdated documentation
3. Missing tests for critical functionality
4. TODO comments that can be addressed
5. Stale PRs that need attention (comments, updates)
6. Code quality improvements (in non-safe mode)

For each task, provide:
- repo: Repository name
- type: "docs" | "tests" | "issue" | "todo" | "pr" | "refactor"
- title: Short description
- description: What needs to be done
- impactScore: 0-100 (higher = more valuable)
- effortScore: 0-100 (higher = more complex)
- files: Array of file paths to modify (if known)
- safeToAutomate: boolean (can this be done safely without human review?)

IMPORTANT:
- In safe mode, only suggest docs, tests, and minor changes
- Prioritize quick wins with high impact/effort ratio
- Be conservative - only suggest changes you're confident about
- Consider repository context and coding style

Return a JSON array of tasks, sorted by impact/effort ratio (best first).
Return ONLY valid JSON, no explanation text.`;

        try {
            const response = await this.anthropic.messages.create({
                model: this.models.opus,
                max_tokens: 4096,
                messages: [{ role: 'user', content: analysisPrompt }]
            });

            const responseText = response.content[0]?.text?.trim() || '[]';

            // Parse JSON response
            const tasks = JSON.parse(this.extractJson(responseText));

            // Filter and validate tasks
            const validTasks = tasks.filter(task => {
                // Must meet impact threshold
                if (task.impactScore < config.minImpactScore) return false;

                // Must not exceed effort threshold
                if (task.effortScore > config.maxEffortScore) return false;

                // In safe mode, only allow safe task types
                if (config.safeMode && !['docs', 'tests', 'todo'].includes(task.type)) {
                    return false;
                }

                // Must be safe to automate
                if (!task.safeToAutomate) return false;

                return true;
            });

            console.log(`[NightlyAutonomous] Identified ${validTasks.length} valid tasks`);
            this.runLog.tasksIdentified = validTasks;

            return validTasks.slice(0, config.maxTasks);
        } catch (error) {
            console.error('[NightlyAutonomous] Opus analysis failed:', error.message);
            return [];
        }
    }

    /**
     * Phase 3: Execute tasks using Claude Sonnet
     * @param {Array} tasks - Prioritized tasks to execute
     * @returns {Array} Execution results
     */
    async executeTasks(tasks) {
        console.log(`[NightlyAutonomous] Executing ${tasks.length} tasks...`);
        const results = [];

        for (const task of tasks) {
            if (config.dryRun) {
                console.log(`[NightlyAutonomous] DRY RUN: Would execute: ${task.title}`);
                results.push({
                    task,
                    status: 'dry_run',
                    message: 'Skipped in dry run mode'
                });
                continue;
            }

            try {
                console.log(`[NightlyAutonomous] Executing: ${task.title}`);
                const result = await this.executeTask(task);
                results.push(result);

                if (result.status === 'success') {
                    this.runLog.tasksExecuted.push(task);
                } else {
                    this.runLog.tasksFailed.push({ task, error: result.message });
                }

                // Small delay between tasks to avoid rate limits
                await this.sleep(2000);
            } catch (error) {
                console.error(`[NightlyAutonomous] Task failed: ${task.title}`, error.message);
                results.push({
                    task,
                    status: 'error',
                    message: error.message
                });
                this.runLog.tasksFailed.push({ task, error: error.message });
            }
        }

        return results;
    }

    /**
     * Execute a single task
     */
    async executeTask(task) {
        switch (task.type) {
            case 'docs':
                return await this.executeDocsTask(task);
            case 'tests':
                return await this.executeTestsTask(task);
            case 'todo':
                return await this.executeTodoTask(task);
            case 'issue':
                return await this.executeIssueTask(task);
            case 'pr':
                return await this.executePRTask(task);
            case 'refactor':
                return await this.executeRefactorTask(task);
            default:
                return {
                    task,
                    status: 'skipped',
                    message: `Unknown task type: ${task.type}`
                };
        }
    }

    /**
     * Execute documentation task
     */
    async executeDocsTask(task) {
        const { repo, files, description } = task;

        // Read current file content if updating
        let currentContent = '';
        const filePath = files?.[0] || 'README.md';

        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.username,
                repo,
                path: filePath
            });
            currentContent = Buffer.from(data.content, 'base64').toString('utf8');
        } catch (e) {
            currentContent = '';
        }

        // Generate improved documentation with Sonnet
        const docPrompt = `You are improving documentation for a codebase.

TASK: ${description}
FILE: ${filePath}
CURRENT CONTENT:
${currentContent || '(New file)'}

Generate improved documentation that:
1. Is clear and concise
2. Follows markdown best practices
3. Includes code examples where helpful
4. Has proper formatting

Return ONLY the new file content, no explanation.`;

        const response = await this.anthropic.messages.create({
            model: this.models.sonnet,
            max_tokens: 4096,
            messages: [{ role: 'user', content: docPrompt }]
        });

        const newContent = response.content[0]?.text?.trim() || '';

        if (!newContent || newContent === currentContent) {
            return {
                task,
                status: 'skipped',
                message: 'No changes needed'
            };
        }

        // Create a branch and commit the changes
        const branchName = `auto/docs-${Date.now()}`;
        await this.createBranchAndCommit(repo, branchName, filePath, newContent, `docs: ${task.title}`);

        // Create a PR
        const pr = await this.createPullRequest(repo, branchName, task);

        return {
            task,
            status: 'success',
            message: `Created PR #${pr.number}: ${pr.html_url}`,
            pr: pr.number
        };
    }

    /**
     * Execute test creation task
     */
    async executeTestsTask(task) {
        const { repo, description, files } = task;

        // Read the source file to create tests for
        const sourceFile = files?.[0];
        if (!sourceFile) {
            return {
                task,
                status: 'skipped',
                message: 'No source file specified'
            };
        }

        let sourceContent = '';
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.username,
                repo,
                path: sourceFile
            });
            sourceContent = Buffer.from(data.content, 'base64').toString('utf8');
        } catch (e) {
            return {
                task,
                status: 'error',
                message: `Could not read source file: ${sourceFile}`
            };
        }

        // Generate tests with Sonnet
        const testPrompt = `You are writing tests for a JavaScript/Node.js codebase.

SOURCE FILE: ${sourceFile}
SOURCE CODE:
${sourceContent}

TASK: ${description}

Generate comprehensive tests that:
1. Cover main functionality
2. Include edge cases
3. Use Jest or a compatible testing framework
4. Follow testing best practices
5. Are well-documented

Return ONLY the test file content, no explanation.`;

        const response = await this.anthropic.messages.create({
            model: this.models.sonnet,
            max_tokens: 4096,
            messages: [{ role: 'user', content: testPrompt }]
        });

        const testContent = response.content[0]?.text?.trim() || '';

        if (!testContent) {
            return {
                task,
                status: 'error',
                message: 'Failed to generate tests'
            };
        }

        // Determine test file path
        const testPath = this.getTestFilePath(sourceFile);

        // Create branch, commit, and PR
        const branchName = `auto/tests-${Date.now()}`;
        await this.createBranchAndCommit(repo, branchName, testPath, testContent, `test: add tests for ${sourceFile}`);
        const pr = await this.createPullRequest(repo, branchName, task);

        return {
            task,
            status: 'success',
            message: `Created PR #${pr.number}: ${pr.html_url}`,
            pr: pr.number
        };
    }

    /**
     * Execute TODO resolution task
     */
    async executeTodoTask(task) {
        const { repo, files, description } = task;
        const filePath = files?.[0];

        if (!filePath) {
            return {
                task,
                status: 'skipped',
                message: 'No file path specified'
            };
        }

        // Read current file
        let currentContent = '';
        let fileSha = '';
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.username,
                repo,
                path: filePath
            });
            currentContent = Buffer.from(data.content, 'base64').toString('utf8');
            fileSha = data.sha;
        } catch (e) {
            return {
                task,
                status: 'error',
                message: `Could not read file: ${filePath}`
            };
        }

        // Resolve TODO with Sonnet
        const todoPrompt = `You are resolving TODO comments in code.

FILE: ${filePath}
CURRENT CONTENT:
${currentContent}

TASK: ${description}

Resolve the TODO comment(s) by:
1. Implementing the requested functionality
2. Removing the TODO comment
3. Keeping the code style consistent
4. Not breaking existing functionality

Return ONLY the updated file content, no explanation.`;

        const response = await this.anthropic.messages.create({
            model: this.models.sonnet,
            max_tokens: 4096,
            messages: [{ role: 'user', content: todoPrompt }]
        });

        const newContent = response.content[0]?.text?.trim() || '';

        if (!newContent || newContent === currentContent) {
            return {
                task,
                status: 'skipped',
                message: 'No changes made'
            };
        }

        // Create branch, commit, and PR
        const branchName = `auto/todo-${Date.now()}`;
        await this.createBranchAndCommit(repo, branchName, filePath, newContent, `chore: resolve TODO in ${filePath}`);
        const pr = await this.createPullRequest(repo, branchName, task);

        return {
            task,
            status: 'success',
            message: `Created PR #${pr.number}: ${pr.html_url}`,
            pr: pr.number
        };
    }

    /**
     * Execute issue resolution task
     */
    async executeIssueTask(task) {
        // For now, add a helpful comment to the issue
        // Full implementation would analyze and fix the issue
        const { repo, description } = task;
        const issueNumber = task.issueNumber || parseInt(description.match(/#(\d+)/)?.[1] || '0');

        if (!issueNumber) {
            return {
                task,
                status: 'skipped',
                message: 'No issue number found'
            };
        }

        // Add analysis comment to issue
        const comment = `*Automated analysis by ClawdBot Nightly*\n\n${description}\n\nThis issue has been flagged for autonomous resolution. A PR may be created shortly.`;

        await this.octokit.issues.createComment({
            owner: this.username,
            repo,
            issue_number: issueNumber,
            body: comment
        });

        return {
            task,
            status: 'partial',
            message: `Added analysis comment to #${issueNumber}`
        };
    }

    /**
     * Execute stale PR task (add comment/nudge)
     */
    async executePRTask(task) {
        const { repo, description } = task;
        const prNumber = task.prNumber || parseInt(description.match(/#(\d+)/)?.[1] || '0');

        if (!prNumber) {
            return {
                task,
                status: 'skipped',
                message: 'No PR number found'
            };
        }

        // Add helpful comment to stale PR
        const comment = `*Automated reminder from ClawdBot Nightly*\n\nThis PR has been open for a while. Consider:\n- Rebasing if needed\n- Addressing any pending review comments\n- Merging if approved\n\nLet me know if you need help!`;

        await this.octokit.issues.createComment({
            owner: this.username,
            repo,
            issue_number: prNumber,
            body: comment
        });

        return {
            task,
            status: 'success',
            message: `Added reminder to PR #${prNumber}`
        };
    }

    /**
     * Execute refactoring task (only in non-safe mode)
     */
    async executeRefactorTask(task) {
        if (config.safeMode) {
            return {
                task,
                status: 'skipped',
                message: 'Refactoring disabled in safe mode'
            };
        }

        // Similar to TODO resolution but for code improvements
        return await this.executeTodoTask(task);
    }

    /**
     * Phase 4: Generate morning report
     */
    async generateMorningReport(results) {
        const executed = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'error').length;
        const skipped = results.filter(r => r.status === 'skipped' || r.status === 'dry_run').length;

        let report = `*NIGHTLY AUTONOMOUS REPORT*\n`;
        report += `${'='.repeat(25)}\n\n`;
        report += `Run: ${new Date().toLocaleDateString('en-GB')}\n`;
        report += `Mode: ${config.safeMode ? 'Safe' : 'Full'} ${config.dryRun ? '(DRY RUN)' : ''}\n\n`;

        // Summary
        report += `*Summary*\n`;
        report += `- Repos scanned: ${this.runLog.reposScanned.length}\n`;
        report += `- Tasks identified: ${this.runLog.tasksIdentified.length}\n`;
        report += `- Tasks executed: ${executed}\n`;
        report += `- Tasks failed: ${failed}\n`;
        report += `- Tasks skipped: ${skipped}\n\n`;

        // Executed tasks
        if (executed > 0) {
            report += `*Completed*\n`;
            results
                .filter(r => r.status === 'success')
                .forEach(r => {
                    report += `- ${r.task.title}\n  ${r.message}\n`;
                });
            report += `\n`;
        }

        // Failed tasks
        if (failed > 0) {
            report += `*Failed*\n`;
            results
                .filter(r => r.status === 'error')
                .forEach(r => {
                    report += `- ${r.task.title}: ${r.message}\n`;
                });
            report += `\n`;
        }

        // Pending high-impact tasks
        const pending = this.runLog.tasksIdentified
            .filter(t => !results.find(r => r.task === t && r.status === 'success'))
            .slice(0, 3);

        if (pending.length > 0) {
            report += `*Pending High-Impact Tasks*\n`;
            pending.forEach(t => {
                report += `- [${t.repo}] ${t.title} (impact: ${t.impactScore})\n`;
            });
        }

        return report;
    }

    // ==================== Helper Methods ====================

    /**
     * Create a branch and commit changes
     */
    async createBranchAndCommit(repo, branchName, filePath, content, commitMessage) {
        // Get default branch SHA
        const { data: refData } = await this.octokit.git.getRef({
            owner: this.username,
            repo,
            ref: 'heads/main'
        });
        const baseSha = refData.object.sha;

        // Create new branch
        await this.octokit.git.createRef({
            owner: this.username,
            repo,
            ref: `refs/heads/${branchName}`,
            sha: baseSha
        });

        // Get current file SHA if exists
        let fileSha = null;
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.username,
                repo,
                path: filePath,
                ref: branchName
            });
            fileSha = data.sha;
        } catch (e) {
            // File doesn't exist, will create new
        }

        // Create or update file
        await this.octokit.repos.createOrUpdateFileContents({
            owner: this.username,
            repo,
            path: filePath,
            message: commitMessage,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
            sha: fileSha
        });

        return branchName;
    }

    /**
     * Create a pull request
     */
    async createPullRequest(repo, branchName, task) {
        const { data: pr } = await this.octokit.pulls.create({
            owner: this.username,
            repo,
            title: `[Auto] ${task.title}`,
            head: branchName,
            base: 'main',
            body: `## Automated PR by ClawdBot Nightly

**Task Type:** ${task.type}
**Impact Score:** ${task.impactScore}/100
**Effort Score:** ${task.effortScore}/100

### Description
${task.description}

---
*This PR was automatically generated by ClawdBot's nightly autonomous job.*
*Please review before merging.*`
        });

        return pr;
    }

    /**
     * Get test file path from source file
     */
    getTestFilePath(sourceFile) {
        const dir = sourceFile.includes('/') ? sourceFile.substring(0, sourceFile.lastIndexOf('/')) : '';
        const filename = sourceFile.includes('/') ? sourceFile.substring(sourceFile.lastIndexOf('/') + 1) : sourceFile;
        const baseName = filename.replace(/\.[^.]+$/, '');
        const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '.js';

        // Try __tests__ directory first, then tests/
        return `__tests__/${baseName}.test${ext}`;
    }

    /**
     * Calculate days since a date
     */
    daysSince(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        return Math.floor((now - date) / (1000 * 60 * 60 * 24));
    }

    /**
     * Extract JSON from a response that might have extra text
     */
    extractJson(text) {
        // Try to find JSON array or object
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) return arrayMatch[0];

        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) return objectMatch[0];

        return text;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
const nightlyAutonomous = new NightlyAutonomous();

/**
 * Generate function for scheduler integration
 * Called by the scheduler's handler when the job runs
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters
 * @returns {Promise<string|null>} Report message or null
 */
async function generate(db, params = {}) {
    return nightlyAutonomous.run(db, params);
}

/**
 * Job definition for scheduler registration
 */
const job = {
    name: 'nightly-autonomous',
    schedule: `0 ${config.runTime.split(':')[1] || '0'} ${config.runTime.split(':')[0] || '2'} * * *`, // Default: 2:00 AM
    enabled: config.enabled,
    execute: generate
};

module.exports = {
    NightlyAutonomous,
    generate,
    job,
    config,
    instance: nightlyAutonomous
};
