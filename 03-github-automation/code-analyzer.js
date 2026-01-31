// GitHub Automation - Advanced Repository Operations
// Handles code analysis, PR creation, issue management

const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');

class GitHubAutomation {
    constructor() {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        this.username = process.env.GITHUB_USERNAME;
    }

    /**
     * Clone repository locally for analysis
     */
    async cloneRepo(repoName) {
        const tmpDir = `/tmp/repos/${repoName}`;
        const repoUrl = `https://github.com/${this.username}/${repoName}.git`;
        
        try {
            // Remove old clone if exists
            await fs.rm(tmpDir, { recursive: true, force: true });
            
            // Clone repo
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
                exec(`git clone ${repoUrl} ${tmpDir}`, (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolve(stdout);
                });
            });
            
            return tmpDir;
        } catch (error) {
            console.error('Clone error:', error);
            return null;
        }
    }

    /**
     * Analyze repository code structure
     */
    async analyzeCodeStructure(repoName) {
        const repoPath = await this.cloneRepo(repoName);
        if (!repoPath) {
            return { error: 'Failed to clone repository' };
        }

        try {
            const analysis = {
                files: [],
                languages: {},
                totalLines: 0,
                structure: {}
            };

            // Recursive directory scan
            async function scanDir(dir, baseDir = dir) {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(baseDir, fullPath);
                    
                    // Skip node_modules, .git, etc
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                        continue;
                    }

                    
                    if (entry.isDirectory()) {
                        await scanDir(fullPath, baseDir);
                    } else {
                        const ext = path.extname(entry.name);
                        const stats = await fs.stat(fullPath);
                        
                        // Count lines
                        let lines = 0;
                        try {
                            const content = await fs.readFile(fullPath, 'utf8');
                            lines = content.split('\n').length;
                        } catch (e) {
                            // Binary file or read error
                            lines = 0;
                        }
                        
                        analysis.files.push({
                            path: relativePath,
                            ext,
                            size: stats.size,
                            lines
                        });
                        
                        analysis.totalLines += lines;
                        
                        // Track language
                        if (!analysis.languages[ext]) {
                            analysis.languages[ext] = { files: 0, lines: 0 };
                        }
                        analysis.languages[ext].files++;
                        analysis.languages[ext].lines += lines;
                    }
                }
            }
            
            await scanDir(repoPath);
            
            // Clean up
            await fs.rm(repoPath, { recursive: true, force: true });
            
            return analysis;
        } catch (error) {
            console.error('Analysis error:', error);
            return { error: error.message };
        }
    }

    /**
     * Create a pull request
     */
    async createPR(repoName, title, body, headBranch, baseBranch = 'main') {
        try {
            const response = await this.octokit.pulls.create({
                owner: this.username,
                repo: repoName,
                title,
                body,
                head: headBranch,
                base: baseBranch
            });
            
            return {
                success: true,
                number: response.data.number,
                url: response.data.html_url
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Comment on an issue or PR
     */
    async addComment(repoName, issueNumber, comment) {
        try {
            await this.octokit.issues.createComment({
                owner: this.username,
                repo: repoName,
                issue_number: issueNumber,
                body: comment
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a new branch
     */
    async createBranch(repoName, branchName, fromBranch = 'main') {
        try {
            // Get reference of from branch
            const refResponse = await this.octokit.git.getRef({
                owner: this.username,
                repo: repoName,
                ref: `heads/${fromBranch}`
            });
            
            const sha = refResponse.data.object.sha;
            
            // Create new branch
            await this.octokit.git.createRef({
                owner: this.username,
                repo: repoName,
                ref: `refs/heads/${branchName}`,
                sha
            });
            
            return { success: true, branch: branchName };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Commit file changes
     */
    async commitFile(repoName, branch, filePath, content, message) {
        try {
            // Get current file SHA if exists
            let sha = null;
            try {
                const fileResponse = await this.octokit.repos.getContent({
                    owner: this.username,
                    repo: repoName,
                    path: filePath,
                    ref: branch
                });
                sha = fileResponse.data.sha;
            } catch (e) {
                // File doesn't exist yet
            }
            
            // Create or update file
            await this.octokit.repos.createOrUpdateFileContents({
                owner: this.username,
                repo: repoName,
                path: filePath,
                message,
                content: Buffer.from(content).toString('base64'),
                branch,
                sha
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = GitHubAutomation;
