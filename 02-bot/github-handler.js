// GitHub Handler - Manages GitHub repository operations
// Lists repos, analyzes code, creates PRs, fixes bugs

const axios = require('axios');

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

class GitHubHandler {
    constructor() {
        this.headers = {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    /**
     * List all monitored repositories
     */
    async listRepos() {
        try {
            const monitoredRepos = process.env.REPOS_TO_MONITOR.split(',').map(r => r.trim());
            
            let output = '📚 Connected Repositories:\n\n';
            for (let i = 0; i < monitoredRepos.length; i++) {
                const repoName = monitoredRepos[i];
                const repoInfo = await this.getRepoInfo(repoName);
                
                output += `${i + 1}. ${GITHUB_USERNAME}/${repoName}\n`;
                output += `   Language: ${repoInfo.language || 'N/A'}\n`;
                output += `   Last updated: ${this.formatDate(repoInfo.updated_at)}\n\n`;
            }
            
            return output.trim();
        } catch (error) {
            console.error('Error listing repos:', error.message);
            return '❌ Failed to fetch repository list. Check your GitHub token.';
        }
    }

    /**
     * Get repository information
     */
    async getRepoInfo(repoName) {
        const response = await axios.get(
            `${GITHUB_API_URL}/repos/${GITHUB_USERNAME}/${repoName}`,
            { headers: this.headers }
        );
        return response.data;
    }

    /**
     * Analyze a repository
     */
    async analyzeRepo(repoName) {
        try {
            const repoInfo = await this.getRepoInfo(repoName);
            const issues = await this.getOpenIssues(repoName);
            const commits = await this.getRecentCommits(repoName);

            let analysis = `🔍 Analysis: ${GITHUB_USERNAME}/${repoName}\n\n`;
            analysis += `Language: ${repoInfo.language}\n`;
            analysis += `Stars: ${repoInfo.stargazers_count}\n`;
            analysis += `Open Issues: ${issues.length}\n`;
            analysis += `Recent Commits: ${commits.length}\n`;
            analysis += `Last updated: ${this.formatDate(repoInfo.updated_at)}\n\n`;

            if (issues.length > 0) {
                analysis += `Top Issues:\n`;
                issues.slice(0, 3).forEach((issue, i) => {
                    analysis += `${i + 1}. #${issue.number}: ${issue.title}\n`;
                });
            }

            return analysis;
        } catch (error) {
            console.error('Error analyzing repo:', error.message);
            return `❌ Failed to analyze ${repoName}. Make sure the repo exists.`;
        }
    }

    /**
     * Get open issues for a repo
     */
    async getOpenIssues(repoName) {
        const response = await axios.get(
            `${GITHUB_API_URL}/repos/${GITHUB_USERNAME}/${repoName}/issues`,
            { 
                headers: this.headers,
                params: { state: 'open', per_page: 10 }
            }
        );
        return response.data;
    }

    /**
     * Get recent commits
     */
    async getRecentCommits(repoName) {
        const response = await axios.get(
            `${GITHUB_API_URL}/repos/${GITHUB_USERNAME}/${repoName}/commits`,
            { 
                headers: this.headers,
                params: { per_page: 5 }
            }
        );
        return response.data;
    }

    /**
     * Fix bugs in a repository (placeholder - needs AI integration)
     */
    async fixBugs(repoName) {
        try {
            const issues = await this.getOpenIssues(repoName);
            
            if (issues.length === 0) {
                return `✅ No open issues found in ${repoName}!`;
            }

            let response = `🔧 Found ${issues.length} open issues in ${repoName}\n\n`;
            response += `I can help with:\n`;
            issues.slice(0, 3).forEach((issue, i) => {
                response += `${i + 1}. #${issue.number}: ${issue.title}\n`;
            });
            response += `\nReply with "fix issue #NUMBER" to work on a specific issue.`;

            return response;
        } catch (error) {
            console.error('Error fetching bugs:', error.message);
            return `❌ Failed to check issues in ${repoName}.`;
        }
    }

    /**
     * Format date to readable string
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return `${Math.floor(diffDays / 30)} months ago`;
    }
}

// Export singleton instance
module.exports = new GitHubHandler();
