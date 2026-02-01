/**
 * Project Scanner Module for ClawdBot
 *
 * Scans repositories and identifies high-leverage tasks for autonomous execution.
 * Analyzes issues, PRs, TODOs, documentation, tests, and dependencies.
 *
 * Usage:
 *   const projectScanner = require('./autonomous/project-scanner');
 *   const tasks = await projectScanner.scanAllRepos();
 *   const topTasks = await projectScanner.getHighLeverageTasks(5);
 */

const GitHubAutomation = require('../../03-github-automation/code-analyzer');
const crypto = require('crypto');

// Constants
const STALE_PR_DAYS = 7;
const TODO_PATTERNS = [
    /TODO[:\s]/i,
    /FIXME[:\s]/i,
    /HACK[:\s]/i,
    /XXX[:\s]/i,
    /BUG[:\s]/i,
    /OPTIMIZE[:\s]/i
];
const README_REQUIRED_SECTIONS = [
    'install',
    'usage',
    'configuration',
    'api',
    'contributing'
];

class ProjectScanner {
    constructor() {
        this.github = new GitHubAutomation();
        this.octokit = this.github.octokit;
        this.username = this.github.username;
        this.taskCache = new Map();
        this.lastScanTime = null;
    }

    /**
     * Generate a unique task ID
     * @param {string} repo - Repository name
     * @param {string} type - Task type
     * @param {string} identifier - Unique identifier within type
     * @returns {string}
     */
    generateTaskId(repo, type, identifier) {
        const hash = crypto.createHash('md5')
            .update(`${repo}:${type}:${identifier}`)
            .digest('hex')
            .substring(0, 8);
        return `${repo.substring(0, 10)}-${type}-${hash}`;
    }

    /**
     * Scan a single repository for high-leverage tasks
     * @param {string} repoName - Name of the repository to scan
     * @returns {Promise<Array>} Array of task objects
     */
    async scanRepo(repoName) {
        console.log(`[ProjectScanner] Scanning ${repoName}...`);
        const tasks = [];

        try {
            // Run all scans in parallel for performance
            const [
                issueTasks,
                prTasks,
                todoTasks,
                docsTasks,
                testTasks,
                depTasks
            ] = await Promise.allSettled([
                this.scanIssues(repoName),
                this.scanStalePRs(repoName),
                this.scanTodos(repoName),
                this.scanMissingDocs(repoName),
                this.scanMissingTests(repoName),
                this.scanOutdatedDeps(repoName)
            ]);

            // Collect results, handling failures gracefully
            if (issueTasks.status === 'fulfilled') tasks.push(...issueTasks.value);
            if (prTasks.status === 'fulfilled') tasks.push(...prTasks.value);
            if (todoTasks.status === 'fulfilled') tasks.push(...todoTasks.value);
            if (docsTasks.status === 'fulfilled') tasks.push(...docsTasks.value);
            if (testTasks.status === 'fulfilled') tasks.push(...testTasks.value);
            if (depTasks.status === 'fulfilled') tasks.push(...depTasks.value);

            console.log(`[ProjectScanner] Found ${tasks.length} tasks in ${repoName}`);
            return tasks;

        } catch (error) {
            console.error(`[ProjectScanner] Error scanning ${repoName}:`, error.message);
            return [];
        }
    }

    /**
     * Scan all monitored repositories
     * @returns {Promise<Array>} Array of all tasks across repos
     */
    async scanAllRepos() {
        const reposEnv = process.env.REPOS_TO_MONITOR || '';
        const repos = reposEnv.split(',').map(r => r.trim()).filter(Boolean);

        if (repos.length === 0) {
            console.warn('[ProjectScanner] No repos configured in REPOS_TO_MONITOR');
            return [];
        }

        console.log(`[ProjectScanner] Scanning ${repos.length} repositories...`);

        const allTasks = [];
        const scanPromises = repos.map(repo => this.scanRepo(repo));
        const results = await Promise.allSettled(scanPromises);

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allTasks.push(...result.value);
            } else {
                console.error(`[ProjectScanner] Failed to scan ${repos[index]}:`, result.reason);
            }
        });

        // Cache results
        this.taskCache.set('all', allTasks);
        this.lastScanTime = new Date();

        console.log(`[ProjectScanner] Total tasks found: ${allTasks.length}`);
        return allTasks;
    }

    /**
     * Prioritize tasks by scoring algorithm
     * @param {Array} tasks - Array of task objects
     * @returns {Array} Sorted array of tasks with scores
     */
    prioritizeTasks(tasks) {
        const scored = tasks.map(task => {
            let score = 0;

            // Impact scoring (0-40 points)
            switch (task.impact) {
                case 'high': score += 40; break;
                case 'medium': score += 25; break;
                case 'low': score += 10; break;
            }

            // Effort scoring - prefer quick wins (0-30 points)
            switch (task.effort) {
                case 'quick': score += 30; break;
                case 'medium': score += 15; break;
                case 'complex': score += 5; break;
            }

            // Safety bonus (0-20 points)
            if (task.safe) {
                score += 20;
            }

            // Type-based adjustments
            switch (task.type) {
                case 'docs':
                    score += 10; // Docs are safe and valuable
                    break;
                case 'issue':
                    // Bonus for labeled issues (easier to understand)
                    if (task.context?.labels?.includes('good first issue')) score += 15;
                    if (task.context?.labels?.includes('bug')) score += 10;
                    break;
                case 'pr':
                    // Stale PRs need attention
                    if (task.context?.staleDays > 14) score += 10;
                    break;
                case 'todo':
                    // FIXMEs are more urgent than TODOs
                    if (task.context?.pattern === 'FIXME') score += 8;
                    if (task.context?.pattern === 'HACK') score += 5;
                    break;
                case 'test':
                    score += 5; // Tests are valuable but effort-intensive
                    break;
                case 'refactor':
                    score -= 5; // Refactoring is riskier
                    break;
            }

            // Dependency penalty (tasks that depend on others)
            if (task.context?.dependencies?.length > 0) {
                score -= 10;
            }

            return { ...task, score };
        });

        // Sort by score descending
        return scored.sort((a, b) => b.score - a.score);
    }

    /**
     * Get top N high-leverage tasks
     * @param {number} limit - Maximum number of tasks to return
     * @param {boolean} forceScan - Force a fresh scan (default: use cache if <1 hour old)
     * @returns {Promise<Array>}
     */
    async getHighLeverageTasks(limit = 10, forceScan = false) {
        let tasks = this.taskCache.get('all');

        // Rescan if cache is stale or forced
        const cacheAge = this.lastScanTime
            ? (new Date() - this.lastScanTime) / 1000 / 60
            : Infinity;

        if (forceScan || !tasks || cacheAge > 60) {
            tasks = await this.scanAllRepos();
        }

        const prioritized = this.prioritizeTasks(tasks);
        return prioritized.slice(0, limit);
    }

    // ============ Individual Scanners ============

    /**
     * Scan for open issues and categorize them
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanIssues(repoName) {
        const tasks = [];

        try {
            const response = await this.octokit.issues.listForRepo({
                owner: this.username,
                repo: repoName,
                state: 'open',
                per_page: 50
            });

            // Filter out PRs (GitHub API returns PRs as issues)
            const issues = response.data.filter(issue => !issue.pull_request);

            for (const issue of issues) {
                const labels = issue.labels.map(l => l.name);
                const daysSinceUpdate = this.daysSince(issue.updated_at);

                // Determine impact based on labels
                let impact = 'medium';
                if (labels.some(l => ['critical', 'urgent', 'high-priority'].includes(l.toLowerCase()))) {
                    impact = 'high';
                } else if (labels.some(l => ['enhancement', 'nice-to-have', 'low-priority'].includes(l.toLowerCase()))) {
                    impact = 'low';
                } else if (labels.includes('bug')) {
                    impact = 'high';
                }

                // Determine effort based on labels
                let effort = 'medium';
                if (labels.some(l => ['good first issue', 'easy', 'quick'].includes(l.toLowerCase()))) {
                    effort = 'quick';
                } else if (labels.some(l => ['complex', 'difficult', 'major'].includes(l.toLowerCase()))) {
                    effort = 'complex';
                }

                // Safety: feature requests are generally safer than bug fixes
                const safe = !labels.includes('bug');

                tasks.push({
                    id: this.generateTaskId(repoName, 'issue', String(issue.number)),
                    repo: repoName,
                    type: 'issue',
                    title: `Issue #${issue.number}: ${issue.title}`,
                    impact,
                    effort,
                    safe,
                    action: labels.includes('bug')
                        ? `Fix bug: ${issue.title}`
                        : `Implement: ${issue.title}`,
                    context: {
                        issueNumber: issue.number,
                        labels,
                        author: issue.user.login,
                        daysSinceUpdate,
                        url: issue.html_url,
                        body: issue.body?.substring(0, 500) || ''
                    }
                });
            }

        } catch (error) {
            console.error(`[ProjectScanner] Issue scan failed for ${repoName}:`, error.message);
        }

        return tasks;
    }

    /**
     * Scan for stale pull requests
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanStalePRs(repoName) {
        const tasks = [];

        try {
            const response = await this.octokit.pulls.list({
                owner: this.username,
                repo: repoName,
                state: 'open',
                per_page: 30
            });

            for (const pr of response.data) {
                const daysSinceUpdate = this.daysSince(pr.updated_at);

                if (daysSinceUpdate >= STALE_PR_DAYS) {
                    tasks.push({
                        id: this.generateTaskId(repoName, 'pr', String(pr.number)),
                        repo: repoName,
                        type: 'pr',
                        title: `Stale PR #${pr.number}: ${pr.title}`,
                        impact: 'medium',
                        effort: 'quick',
                        safe: true,
                        action: `Review and resolve stale PR: ${pr.title}`,
                        context: {
                            prNumber: pr.number,
                            staleDays: daysSinceUpdate,
                            author: pr.user.login,
                            branch: pr.head.ref,
                            baseBranch: pr.base.ref,
                            url: pr.html_url,
                            additions: pr.additions,
                            deletions: pr.deletions
                        }
                    });
                }
            }

        } catch (error) {
            console.error(`[ProjectScanner] PR scan failed for ${repoName}:`, error.message);
        }

        return tasks;
    }

    /**
     * Scan for TODO/FIXME/HACK comments in code
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanTodos(repoName) {
        const tasks = [];

        try {
            // Search for TODO comments using GitHub code search
            for (const pattern of ['TODO', 'FIXME', 'HACK']) {
                try {
                    const response = await this.octokit.search.code({
                        q: `${pattern} repo:${this.username}/${repoName}`,
                        per_page: 20
                    });

                    for (const item of response.data.items) {
                        // Skip node_modules, vendor, etc.
                        if (item.path.includes('node_modules') ||
                            item.path.includes('vendor') ||
                            item.path.includes('.min.')) {
                            continue;
                        }

                        const impact = pattern === 'FIXME' ? 'high'
                            : pattern === 'HACK' ? 'medium'
                            : 'low';

                        tasks.push({
                            id: this.generateTaskId(repoName, 'todo', `${item.path}:${item.sha.substring(0, 8)}`),
                            repo: repoName,
                            type: 'todo',
                            title: `${pattern} in ${item.name}`,
                            impact,
                            effort: 'medium',
                            safe: false, // Code changes are inherently risky
                            action: `Address ${pattern} comment in ${item.path}`,
                            context: {
                                pattern,
                                filePath: item.path,
                                fileName: item.name,
                                url: item.html_url
                            }
                        });
                    }

                    // Rate limit protection
                    await this.delay(500);

                } catch (searchError) {
                    // Code search can fail for various reasons, continue with other patterns
                    console.warn(`[ProjectScanner] Code search for ${pattern} failed:`, searchError.message);
                }
            }

        } catch (error) {
            console.error(`[ProjectScanner] TODO scan failed for ${repoName}:`, error.message);
        }

        // Deduplicate by file path
        const uniqueTasks = this.deduplicateByKey(tasks, 'context.filePath');
        return uniqueTasks;
    }

    /**
     * Scan for missing README sections
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanMissingDocs(repoName) {
        const tasks = [];

        try {
            // Try to get README
            let readmeContent = '';
            try {
                const response = await this.octokit.repos.getContent({
                    owner: this.username,
                    repo: repoName,
                    path: 'README.md'
                });
                readmeContent = Buffer.from(response.data.content, 'base64').toString('utf8').toLowerCase();
            } catch (e) {
                // No README found
                tasks.push({
                    id: this.generateTaskId(repoName, 'docs', 'readme-missing'),
                    repo: repoName,
                    type: 'docs',
                    title: 'Missing README.md',
                    impact: 'high',
                    effort: 'medium',
                    safe: true,
                    action: 'Create README.md with project documentation',
                    context: {
                        missingFile: 'README.md'
                    }
                });
                return tasks;
            }

            // Check for missing sections
            const missingSections = README_REQUIRED_SECTIONS.filter(section => {
                // Check for section header variations
                const patterns = [
                    `## ${section}`,
                    `# ${section}`,
                    `**${section}**`,
                    `### ${section}`
                ];
                return !patterns.some(p => readmeContent.includes(p));
            });

            if (missingSections.length > 0) {
                tasks.push({
                    id: this.generateTaskId(repoName, 'docs', `readme-sections-${missingSections.length}`),
                    repo: repoName,
                    type: 'docs',
                    title: `README missing ${missingSections.length} sections`,
                    impact: 'medium',
                    effort: 'quick',
                    safe: true,
                    action: `Add missing sections: ${missingSections.join(', ')}`,
                    context: {
                        missingSections,
                        file: 'README.md'
                    }
                });
            }

            // Check for CHANGELOG
            try {
                await this.octokit.repos.getContent({
                    owner: this.username,
                    repo: repoName,
                    path: 'CHANGELOG.md'
                });
            } catch (e) {
                tasks.push({
                    id: this.generateTaskId(repoName, 'docs', 'changelog-missing'),
                    repo: repoName,
                    type: 'docs',
                    title: 'Missing CHANGELOG.md',
                    impact: 'low',
                    effort: 'quick',
                    safe: true,
                    action: 'Create CHANGELOG.md to track releases',
                    context: {
                        missingFile: 'CHANGELOG.md'
                    }
                });
            }

        } catch (error) {
            console.error(`[ProjectScanner] Docs scan failed for ${repoName}:`, error.message);
        }

        return tasks;
    }

    /**
     * Scan for files without corresponding tests
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanMissingTests(repoName) {
        const tasks = [];

        try {
            // Get repository contents
            const response = await this.octokit.repos.getContent({
                owner: this.username,
                repo: repoName,
                path: ''
            });

            // Check if there's a test directory or test files
            const contents = response.data;
            const hasTestDir = contents.some(item =>
                item.type === 'dir' && ['test', 'tests', '__tests__', 'spec'].includes(item.name)
            );

            const hasPackageJson = contents.some(item =>
                item.type === 'file' && item.name === 'package.json'
            );

            // For Node.js projects, check package.json for test script
            if (hasPackageJson && !hasTestDir) {
                try {
                    const pkgResponse = await this.octokit.repos.getContent({
                        owner: this.username,
                        repo: repoName,
                        path: 'package.json'
                    });
                    const packageJson = JSON.parse(
                        Buffer.from(pkgResponse.data.content, 'base64').toString('utf8')
                    );

                    if (!packageJson.scripts?.test || packageJson.scripts.test.includes('no test')) {
                        tasks.push({
                            id: this.generateTaskId(repoName, 'test', 'no-test-setup'),
                            repo: repoName,
                            type: 'test',
                            title: 'No test framework configured',
                            impact: 'high',
                            effort: 'medium',
                            safe: true,
                            action: 'Set up testing framework (Jest recommended)',
                            context: {
                                projectType: 'nodejs',
                                currentTestScript: packageJson.scripts?.test || 'none'
                            }
                        });
                    }
                } catch (e) {
                    // Couldn't parse package.json
                }
            }

            // Check for source files without tests (simplified check)
            const sourceFiles = contents.filter(item =>
                item.type === 'file' &&
                item.name.endsWith('.js') &&
                !item.name.includes('.test.') &&
                !item.name.includes('.spec.') &&
                !item.name.includes('.config.')
            );

            if (sourceFiles.length > 3 && !hasTestDir) {
                tasks.push({
                    id: this.generateTaskId(repoName, 'test', 'missing-tests'),
                    repo: repoName,
                    type: 'test',
                    title: `${sourceFiles.length} source files without tests`,
                    impact: 'medium',
                    effort: 'complex',
                    safe: true,
                    action: 'Add unit tests for core functionality',
                    context: {
                        sourceFileCount: sourceFiles.length,
                        sampleFiles: sourceFiles.slice(0, 5).map(f => f.name)
                    }
                });
            }

        } catch (error) {
            console.error(`[ProjectScanner] Test scan failed for ${repoName}:`, error.message);
        }

        return tasks;
    }

    /**
     * Scan for outdated dependencies
     * @param {string} repoName
     * @returns {Promise<Array>}
     */
    async scanOutdatedDeps(repoName) {
        const tasks = [];

        try {
            // Check for package.json
            const response = await this.octokit.repos.getContent({
                owner: this.username,
                repo: repoName,
                path: 'package.json'
            });

            const packageJson = JSON.parse(
                Buffer.from(response.data.content, 'base64').toString('utf8')
            );

            const deps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            // Check for obviously outdated patterns
            const outdatedIndicators = [];

            // Check for very old Node version requirements
            if (packageJson.engines?.node) {
                const nodeVersion = packageJson.engines.node;
                if (nodeVersion.includes('8') || nodeVersion.includes('10') || nodeVersion.includes('12')) {
                    outdatedIndicators.push(`Old Node.js requirement: ${nodeVersion}`);
                }
            }

            // Check for deprecated packages (common ones)
            const deprecatedPackages = ['request', 'node-uuid', 'colors@<1.4.0'];
            for (const pkg of Object.keys(deps)) {
                if (deprecatedPackages.some(d => d.startsWith(pkg))) {
                    outdatedIndicators.push(`Deprecated package: ${pkg}`);
                }
            }

            // Check for security-sensitive packages that should be updated
            const securitySensitive = ['express', 'axios', 'lodash', 'moment'];
            const foundSensitive = Object.keys(deps).filter(pkg =>
                securitySensitive.includes(pkg)
            );

            if (foundSensitive.length > 0 || outdatedIndicators.length > 0) {
                tasks.push({
                    id: this.generateTaskId(repoName, 'refactor', 'deps-review'),
                    repo: repoName,
                    type: 'refactor',
                    title: 'Dependencies may need review',
                    impact: outdatedIndicators.length > 0 ? 'high' : 'medium',
                    effort: 'medium',
                    safe: false,
                    action: 'Review and update dependencies',
                    context: {
                        outdatedIndicators,
                        securitySensitivePackages: foundSensitive,
                        totalDependencies: Object.keys(deps).length
                    }
                });
            }

            // Check for package-lock.json (security best practice)
            try {
                await this.octokit.repos.getContent({
                    owner: this.username,
                    repo: repoName,
                    path: 'package-lock.json'
                });
            } catch (e) {
                tasks.push({
                    id: this.generateTaskId(repoName, 'refactor', 'no-lockfile'),
                    repo: repoName,
                    type: 'refactor',
                    title: 'Missing package-lock.json',
                    impact: 'medium',
                    effort: 'quick',
                    safe: true,
                    action: 'Generate package-lock.json for reproducible builds',
                    context: {
                        missingFile: 'package-lock.json'
                    }
                });
            }

        } catch (error) {
            // No package.json or other error - skip dependency scan
            if (error.status !== 404) {
                console.error(`[ProjectScanner] Deps scan failed for ${repoName}:`, error.message);
            }
        }

        return tasks;
    }

    // ============ Helper Methods ============

    /**
     * Calculate days since a date
     * @param {string} dateString - ISO date string
     * @returns {number}
     */
    daysSince(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Delay execution (for rate limiting)
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Deduplicate tasks by a nested key path
     * @param {Array} tasks - Array of tasks
     * @param {string} keyPath - Dot-notation path to key (e.g., 'context.filePath')
     * @returns {Array}
     */
    deduplicateByKey(tasks, keyPath) {
        const seen = new Set();
        const keys = keyPath.split('.');

        return tasks.filter(task => {
            let value = task;
            for (const key of keys) {
                value = value?.[key];
            }

            if (value && seen.has(value)) {
                return false;
            }
            if (value) {
                seen.add(value);
            }
            return true;
        });
    }

    /**
     * Get scan statistics
     * @returns {Object}
     */
    getStats() {
        const allTasks = this.taskCache.get('all') || [];

        const byType = {};
        const byRepo = {};
        const byImpact = { high: 0, medium: 0, low: 0 };

        for (const task of allTasks) {
            byType[task.type] = (byType[task.type] || 0) + 1;
            byRepo[task.repo] = (byRepo[task.repo] || 0) + 1;
            byImpact[task.impact]++;
        }

        return {
            totalTasks: allTasks.length,
            lastScan: this.lastScanTime,
            byType,
            byRepo,
            byImpact
        };
    }

    /**
     * Clear the task cache
     */
    clearCache() {
        this.taskCache.clear();
        this.lastScanTime = null;
    }
}

// Export singleton instance
module.exports = new ProjectScanner();
