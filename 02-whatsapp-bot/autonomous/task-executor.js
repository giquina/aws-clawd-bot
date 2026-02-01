/**
 * Task Executor for ClawdBot Autonomous Mode
 *
 * Executes autonomous tasks identified by the project scanner.
 * Uses appropriate AI (Opus for planning, Sonnet for code) and GitHub API.
 *
 * Task Types:
 *   - docs: Update README, add documentation
 *   - test: Generate missing tests
 *   - issue: Comment on or close issues
 *   - pr: Review or merge PRs
 *   - todo: Address TODO comments in code
 *   - refactor: Refactor code (requires approval in safe mode)
 *
 * Safety:
 *   - Never deletes files without approval
 *   - Never force pushes
 *   - Never modifies .env or secrets
 *   - Always creates branch for code changes
 *   - Requires approval for breaking changes
 */

const { Octokit } = require('@octokit/rest');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

// Safe mode - requires approval for destructive operations
const SAFE_MODE = true;

// Files that should never be modified
const PROTECTED_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  'config/.env',
  'credentials.json',
  'secrets.json',
  '.secrets',
  'package-lock.json',
  'yarn.lock'
];

// Patterns for files that require extra approval
const SENSITIVE_PATTERNS = [
  /\.env/i,
  /secret/i,
  /credential/i,
  /password/i,
  /token/i,
  /\.key$/i,
  /\.pem$/i
];

class TaskExecutor {
  constructor(options = {}) {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.username = process.env.GITHUB_USERNAME;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.safeMode = options.safeMode !== undefined ? options.safeMode : SAFE_MODE;
    this.executionLogPath = path.join(__dirname, '../data/execution-log.json');

    // Task type handlers
    this.handlers = {
      docs: this.executeDocs.bind(this),
      test: this.executeTest.bind(this),
      issue: this.executeIssue.bind(this),
      pr: this.executePR.bind(this),
      todo: this.executeTodo.bind(this),
      refactor: this.executeRefactor.bind(this)
    };
  }

  /**
   * Execute a single task
   * @param {Object} task - Task object from project scanner
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} - Execution result
   */
  async executeTask(task, context = {}) {
    const startTime = Date.now();

    try {
      // Validate task
      const validation = this.validateTask(task);
      if (!validation.valid) {
        return this.createResult(false, task, null, validation.error);
      }

      // Check safety constraints
      const safetyCheck = await this.checkSafety(task);
      if (!safetyCheck.safe) {
        return this.createResult(false, task, null, safetyCheck.reason);
      }

      // Get the appropriate handler
      const handler = this.handlers[task.type];
      if (!handler) {
        return this.createResult(false, task, null, `Unknown task type: ${task.type}`);
      }

      // Execute the task
      console.log(`[TaskExecutor] Executing ${task.type} task: ${task.description || task.id}`);
      const result = await handler(task, context);

      // Log execution
      await this.logExecution(task, result, Date.now() - startTime);

      return result;
    } catch (error) {
      console.error(`[TaskExecutor] Error executing task:`, error);
      const errorResult = this.createResult(false, task, null, error.message);
      await this.logExecution(task, errorResult, Date.now() - startTime);
      return errorResult;
    }
  }

  /**
   * Validate task structure
   */
  validateTask(task) {
    if (!task) {
      return { valid: false, error: 'Task is null or undefined' };
    }
    if (!task.type) {
      return { valid: false, error: 'Task missing required field: type' };
    }
    if (!task.repo) {
      return { valid: false, error: 'Task missing required field: repo' };
    }
    return { valid: true };
  }

  /**
   * Check safety constraints
   */
  async checkSafety(task) {
    // Check for protected files
    if (task.file && this.isProtectedFile(task.file)) {
      return { safe: false, reason: `Cannot modify protected file: ${task.file}` };
    }

    // Check for sensitive file patterns
    if (task.file && this.isSensitiveFile(task.file)) {
      if (this.safeMode) {
        return { safe: false, reason: `Sensitive file requires approval: ${task.file}` };
      }
    }

    // Refactors require approval in safe mode
    if (task.type === 'refactor' && this.safeMode && !task.approved) {
      return { safe: false, reason: 'Refactor requires approval in safe mode' };
    }

    // Check for dangerous operations
    if (task.action === 'delete' && this.safeMode && !task.approved) {
      return { safe: false, reason: 'Deletion requires approval in safe mode' };
    }

    return { safe: true };
  }

  /**
   * Check if file is protected
   */
  isProtectedFile(filePath) {
    const normalized = filePath.toLowerCase();
    return PROTECTED_FILES.some(p => normalized.includes(p.toLowerCase()));
  }

  /**
   * Check if file is sensitive
   */
  isSensitiveFile(filePath) {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(filePath));
  }

  // ============ Task Type Handlers ============

  /**
   * Execute documentation task
   * - Update README
   * - Add/update documentation files
   * - Generate API docs
   */
  async executeDocs(task, context = {}) {
    const { repo, file, description, content } = task;

    // Determine what docs action to take
    const action = task.action || 'update';
    const targetFile = file || 'README.md';

    // Get current file content if updating
    let currentContent = '';
    let fileSha = null;

    if (action === 'update') {
      try {
        const existing = await this.octokit.repos.getContent({
          owner: this.username,
          repo: repo,
          path: targetFile
        });
        currentContent = Buffer.from(existing.data.content, 'base64').toString('utf8');
        fileSha = existing.data.sha;
      } catch (err) {
        if (err.status !== 404) throw err;
        // File doesn't exist, will create new
      }
    }

    // Use Opus (brain) for planning documentation structure
    const docPlan = await this.useOpus(`
You are documenting a software project. Plan the documentation update.

Repository: ${repo}
Target file: ${targetFile}
Task: ${description}

Current content:
${currentContent.substring(0, 3000)}${currentContent.length > 3000 ? '\n...(truncated)' : ''}

${content ? `Additional content to include:\n${content}` : ''}

Respond with a brief plan (2-3 sentences) for what to update or add.
`);

    // Use Sonnet (coder) to generate the actual documentation
    const newDocs = await this.useSonnet(`
You are writing documentation for a software project.

Repository: ${repo}
File: ${targetFile}
Plan: ${docPlan}

Current content:
${currentContent}

${content ? `Additional content to include:\n${content}` : ''}

Write the complete updated documentation file. Return ONLY the file content, no explanations.
`);

    // Clean up response
    const cleanContent = this.cleanCodeResponse(newDocs);

    // Create branch and commit
    const branchName = `clawd-docs-${Date.now()}`;
    const result = await this.createBranchAndCommit(
      repo,
      branchName,
      targetFile,
      cleanContent,
      `docs: ${description || 'Update documentation'}`,
      fileSha
    );

    if (!result.success) {
      return this.createResult(false, task, null, result.error);
    }

    // Create PR
    const pr = await this.createPR(
      repo,
      branchName,
      `[ClawdBot] Docs: ${description || 'Update documentation'}`,
      `## Documentation Update\n\n${description || 'Automated documentation update'}\n\n_Created by ClawdBot Autonomous Mode_`
    );

    return this.createResult(true, task, {
      action: 'Updated documentation',
      commit: result.commit,
      branch: branchName,
      pr: pr.number
    });
  }

  /**
   * Execute test generation task
   * - Generate missing unit tests
   * - Add integration tests
   */
  async executeTest(task, context = {}) {
    const { repo, file, description } = task;

    if (!file) {
      return this.createResult(false, task, null, 'Test task requires a target file');
    }

    // Get the file to test
    let fileContent;
    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repo,
        path: file
      });
      fileContent = Buffer.from(existing.data.content, 'base64').toString('utf8');
    } catch (err) {
      return this.createResult(false, task, null, `File not found: ${file}`);
    }

    // Determine test file path
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const dirName = path.dirname(file);
    const testFile = task.testFile || `${dirName}/__tests__/${baseName}.test${ext}`;

    // Check if test file exists
    let existingTests = '';
    let testFileSha = null;
    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repo,
        path: testFile
      });
      existingTests = Buffer.from(existing.data.content, 'base64').toString('utf8');
      testFileSha = existing.data.sha;
    } catch (err) {
      // No existing tests
    }

    // Use Sonnet (coder) to generate tests
    const tests = await this.useSonnet(`
You are writing unit tests for a JavaScript/TypeScript project.

Source file: ${file}
Test file: ${testFile}

Source code:
\`\`\`
${fileContent}
\`\`\`

${existingTests ? `Existing tests:\n\`\`\`\n${existingTests}\n\`\`\`` : 'No existing tests.'}

${description ? `Additional instructions: ${description}` : ''}

Write comprehensive unit tests. If tests exist, add missing test cases.
Use Jest syntax. Return ONLY the complete test file content.
`);

    const cleanTests = this.cleanCodeResponse(tests);

    // Create branch and commit
    const branchName = `clawd-tests-${Date.now()}`;
    const result = await this.createBranchAndCommit(
      repo,
      branchName,
      testFile,
      cleanTests,
      `test: Add tests for ${baseName}`,
      testFileSha
    );

    if (!result.success) {
      return this.createResult(false, task, null, result.error);
    }

    // Create PR
    const pr = await this.createPR(
      repo,
      branchName,
      `[ClawdBot] Tests: ${baseName}`,
      `## Test Generation\n\nAdded tests for \`${file}\`\n\n${description || ''}\n\n_Created by ClawdBot Autonomous Mode_`
    );

    return this.createResult(true, task, {
      action: `Generated tests for ${file}`,
      commit: result.commit,
      branch: branchName,
      pr: pr.number
    });
  }

  /**
   * Execute issue task
   * - Comment on issues
   * - Close resolved issues
   */
  async executeIssue(task, context = {}) {
    const { repo, issueNumber, action, comment } = task;

    if (!issueNumber) {
      return this.createResult(false, task, null, 'Issue task requires issueNumber');
    }

    const issueAction = action || 'comment';

    if (issueAction === 'comment') {
      // Get issue details for context
      const issue = await this.octokit.issues.get({
        owner: this.username,
        repo: repo,
        issue_number: issueNumber
      });

      // Generate comment using Opus (for thoughtful responses)
      let commentText = comment;
      if (!commentText) {
        commentText = await this.useOpus(`
You are a helpful AI assistant commenting on a GitHub issue.

Issue #${issueNumber}: ${issue.data.title}
Body: ${issue.data.body || 'No description'}

${task.description ? `Task: ${task.description}` : 'Provide a helpful comment.'}

Write a concise, helpful comment (2-4 sentences). Be friendly and professional.
`);
      }

      await this.octokit.issues.createComment({
        owner: this.username,
        repo: repo,
        issue_number: issueNumber,
        body: `${commentText}\n\n_Posted by ClawdBot_`
      });

      return this.createResult(true, task, {
        action: `Commented on issue #${issueNumber}`,
        commit: null,
        branch: null,
        pr: null
      });
    }

    if (issueAction === 'close') {
      await this.octokit.issues.update({
        owner: this.username,
        repo: repo,
        issue_number: issueNumber,
        state: 'closed'
      });

      // Add closing comment if provided
      if (comment) {
        await this.octokit.issues.createComment({
          owner: this.username,
          repo: repo,
          issue_number: issueNumber,
          body: `${comment}\n\n_Closed by ClawdBot_`
        });
      }

      return this.createResult(true, task, {
        action: `Closed issue #${issueNumber}`,
        commit: null,
        branch: null,
        pr: null
      });
    }

    return this.createResult(false, task, null, `Unknown issue action: ${issueAction}`);
  }

  /**
   * Execute PR task
   * - Review PRs
   * - Merge PRs (with approval)
   */
  async executePR(task, context = {}) {
    const { repo, prNumber, action } = task;

    if (!prNumber) {
      return this.createResult(false, task, null, 'PR task requires prNumber');
    }

    const prAction = action || 'review';

    if (prAction === 'review') {
      // Get PR details
      const pr = await this.octokit.pulls.get({
        owner: this.username,
        repo: repo,
        pull_number: prNumber
      });

      // Get PR files
      const files = await this.octokit.pulls.listFiles({
        owner: this.username,
        repo: repo,
        pull_number: prNumber,
        per_page: 20
      });

      // Build diff summary
      let diffSummary = '';
      for (const file of files.data.slice(0, 10)) {
        diffSummary += `\n--- ${file.filename} (+${file.additions}/-${file.deletions}) ---\n`;
        if (file.patch) {
          diffSummary += file.patch.substring(0, 1000) + '\n';
        }
      }

      // Use Opus (brain) for strategic review
      const review = await this.useOpus(`
You are a senior code reviewer providing feedback on a pull request.

PR #${prNumber}: ${pr.data.title}
Author: ${pr.data.user.login}
Description: ${pr.data.body || 'No description'}

Changes:
${diffSummary}

Provide a concise code review:
1. SUMMARY: What does this PR do?
2. QUALITY: Overall assessment
3. ISSUES: Any bugs or concerns?
4. VERDICT: APPROVE, REQUEST_CHANGES, or COMMENT

Keep it brief and actionable.
`);

      // Post review as comment
      await this.octokit.issues.createComment({
        owner: this.username,
        repo: repo,
        issue_number: prNumber,
        body: `## AI Code Review\n\n${review}\n\n_Reviewed by ClawdBot_`
      });

      return this.createResult(true, task, {
        action: `Reviewed PR #${prNumber}`,
        commit: null,
        branch: null,
        pr: prNumber
      });
    }

    if (prAction === 'merge') {
      // Safety check - merging requires approval in safe mode
      if (this.safeMode && !task.approved) {
        return this.createResult(false, task, null, 'PR merge requires approval in safe mode');
      }

      await this.octokit.pulls.merge({
        owner: this.username,
        repo: repo,
        pull_number: prNumber,
        merge_method: task.mergeMethod || 'squash'
      });

      return this.createResult(true, task, {
        action: `Merged PR #${prNumber}`,
        commit: null,
        branch: null,
        pr: prNumber
      });
    }

    return this.createResult(false, task, null, `Unknown PR action: ${prAction}`);
  }

  /**
   * Execute TODO task
   * - Address TODO comments in code
   */
  async executeTodo(task, context = {}) {
    const { repo, file, line, todoText, description } = task;

    if (!file) {
      return this.createResult(false, task, null, 'TODO task requires a file path');
    }

    // Get file content
    let fileContent;
    let fileSha;
    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repo,
        path: file
      });
      fileContent = Buffer.from(existing.data.content, 'base64').toString('utf8');
      fileSha = existing.data.sha;
    } catch (err) {
      return this.createResult(false, task, null, `File not found: ${file}`);
    }

    // Use Sonnet (coder) to address the TODO
    const fixedCode = await this.useSonnet(`
You are addressing a TODO comment in code.

File: ${file}
${line ? `Line: ${line}` : ''}
TODO: ${todoText || 'See the TODO in the code'}

Current code:
\`\`\`
${fileContent}
\`\`\`

${description ? `Instructions: ${description}` : ''}

Fix the TODO by implementing what it asks for. Remove the TODO comment after implementing.
Return ONLY the complete updated file content.
`);

    const cleanCode = this.cleanCodeResponse(fixedCode);

    // Create branch and commit
    const branchName = `clawd-todo-${Date.now()}`;
    const result = await this.createBranchAndCommit(
      repo,
      branchName,
      file,
      cleanCode,
      `fix: Address TODO in ${path.basename(file)}`,
      fileSha
    );

    if (!result.success) {
      return this.createResult(false, task, null, result.error);
    }

    // Create PR
    const pr = await this.createPR(
      repo,
      branchName,
      `[ClawdBot] TODO: ${todoText ? todoText.substring(0, 50) : 'Address TODO'}`,
      `## TODO Addressed\n\nFile: \`${file}\`\n${line ? `Line: ${line}\n` : ''}\n\n${todoText ? `TODO: ${todoText}` : ''}\n\n_Created by ClawdBot Autonomous Mode_`
    );

    return this.createResult(true, task, {
      action: `Addressed TODO in ${file}`,
      commit: result.commit,
      branch: branchName,
      pr: pr.number
    });
  }

  /**
   * Execute refactor task
   * - Refactor code for better quality
   * - Requires approval in safe mode
   */
  async executeRefactor(task, context = {}) {
    const { repo, file, description } = task;

    if (!file) {
      return this.createResult(false, task, null, 'Refactor task requires a file path');
    }

    // Safety check
    if (this.safeMode && !task.approved) {
      return this.createResult(false, task, null, 'Refactor requires approval in safe mode');
    }

    // Get file content
    let fileContent;
    let fileSha;
    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repo,
        path: file
      });
      fileContent = Buffer.from(existing.data.content, 'base64').toString('utf8');
      fileSha = existing.data.sha;
    } catch (err) {
      return this.createResult(false, task, null, `File not found: ${file}`);
    }

    // Use Opus (brain) to plan the refactor
    const plan = await this.useOpus(`
You are planning a code refactor.

File: ${file}
Task: ${description || 'Improve code quality'}

Current code (first 3000 chars):
\`\`\`
${fileContent.substring(0, 3000)}
\`\`\`

Create a brief refactor plan (3-5 bullet points). Focus on:
- Code quality improvements
- Better structure/organization
- Performance if relevant
- Maintainability

Keep changes conservative and safe.
`);

    // Use Sonnet (coder) to implement the refactor
    const refactoredCode = await this.useSonnet(`
You are refactoring code to improve quality.

File: ${file}
Refactor plan: ${plan}

Current code:
\`\`\`
${fileContent}
\`\`\`

Apply the refactor plan. Make conservative, safe changes.
Preserve all functionality - this is a refactor, not a rewrite.
Return ONLY the complete refactored file content.
`);

    const cleanCode = this.cleanCodeResponse(refactoredCode);

    // Create branch and commit
    const branchName = `clawd-refactor-${Date.now()}`;
    const result = await this.createBranchAndCommit(
      repo,
      branchName,
      file,
      cleanCode,
      `refactor: ${description || 'Improve code quality in ' + path.basename(file)}`,
      fileSha
    );

    if (!result.success) {
      return this.createResult(false, task, null, result.error);
    }

    // Create PR with detailed description
    const pr = await this.createPR(
      repo,
      branchName,
      `[ClawdBot] Refactor: ${path.basename(file)}`,
      `## Refactor\n\nFile: \`${file}\`\n\n### Plan\n${plan}\n\n${description ? `### Notes\n${description}` : ''}\n\n_Created by ClawdBot Autonomous Mode_`
    );

    return this.createResult(true, task, {
      action: `Refactored ${file}`,
      commit: result.commit,
      branch: branchName,
      pr: pr.number
    });
  }

  // ============ AI Helpers ============

  /**
   * Use Opus (brain) for planning/strategy
   */
  async useOpus(prompt) {
    const response = await this.claude.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  }

  /**
   * Use Sonnet (coder) for implementation
   */
  async useSonnet(prompt) {
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  }

  /**
   * Clean code response from AI
   */
  cleanCodeResponse(response) {
    return response
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  }

  // ============ GitHub Helpers ============

  /**
   * Create a branch and commit changes
   */
  async createBranchAndCommit(repo, branchName, filePath, content, message, existingSha = null) {
    try {
      // Get default branch
      const repoInfo = await this.octokit.repos.get({
        owner: this.username,
        repo: repo
      });
      const defaultBranch = repoInfo.data.default_branch;

      // Get default branch SHA
      const ref = await this.octokit.git.getRef({
        owner: this.username,
        repo: repo,
        ref: `heads/${defaultBranch}`
      });

      // Create new branch
      await this.octokit.git.createRef({
        owner: this.username,
        repo: repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.data.object.sha
      });

      // Commit the file
      const commit = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.username,
        repo: repo,
        path: filePath,
        message: message,
        content: Buffer.from(content).toString('base64'),
        branch: branchName,
        sha: existingSha
      });

      return {
        success: true,
        commit: commit.data.commit.sha,
        branch: branchName
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a pull request
   */
  async createPR(repo, branchName, title, body) {
    try {
      const repoInfo = await this.octokit.repos.get({
        owner: this.username,
        repo: repo
      });
      const defaultBranch = repoInfo.data.default_branch;

      const pr = await this.octokit.pulls.create({
        owner: this.username,
        repo: repo,
        title: title,
        body: body,
        head: branchName,
        base: defaultBranch
      });

      return {
        success: true,
        number: pr.data.number,
        url: pr.data.html_url
      };
    } catch (error) {
      return {
        success: false,
        number: null,
        error: error.message
      };
    }
  }

  // ============ Result & Logging ============

  /**
   * Create standardized result object
   */
  createResult(success, task, result, error = null) {
    return {
      success,
      task,
      result: result || {
        action: null,
        commit: null,
        pr: null,
        branch: null
      },
      error
    };
  }

  /**
   * Log execution to file
   */
  async logExecution(task, result, durationMs) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.executionLogPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Read existing log or create new
      let log = [];
      try {
        const existing = await fs.readFile(this.executionLogPath, 'utf8');
        log = JSON.parse(existing);
      } catch (err) {
        // File doesn't exist yet
      }

      // Add new entry
      log.push({
        timestamp: new Date().toISOString(),
        task: {
          type: task.type,
          repo: task.repo,
          file: task.file || null,
          description: task.description || null
        },
        result: {
          success: result.success,
          action: result.result?.action || null,
          commit: result.result?.commit || null,
          pr: result.result?.pr || null,
          branch: result.result?.branch || null,
          error: result.error || null
        },
        durationMs
      });

      // Keep last 1000 entries
      if (log.length > 1000) {
        log = log.slice(-1000);
      }

      // Write back
      await fs.writeFile(this.executionLogPath, JSON.stringify(log, null, 2));
    } catch (error) {
      console.error('[TaskExecutor] Failed to write execution log:', error);
    }
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(limit = 50) {
    try {
      const content = await fs.readFile(this.executionLogPath, 'utf8');
      const log = JSON.parse(content);
      return log.slice(-limit);
    } catch (err) {
      return [];
    }
  }

  /**
   * Get execution stats
   */
  async getStats() {
    const history = await this.getExecutionHistory(1000);

    const stats = {
      total: history.length,
      successful: history.filter(e => e.result.success).length,
      failed: history.filter(e => !e.result.success).length,
      byType: {},
      avgDurationMs: 0,
      recentErrors: []
    };

    let totalDuration = 0;
    for (const entry of history) {
      // Count by type
      const type = entry.task.type;
      if (!stats.byType[type]) {
        stats.byType[type] = { total: 0, success: 0, failed: 0 };
      }
      stats.byType[type].total++;
      if (entry.result.success) {
        stats.byType[type].success++;
      } else {
        stats.byType[type].failed++;
      }

      // Track duration
      totalDuration += entry.durationMs || 0;

      // Track recent errors
      if (!entry.result.success && entry.result.error) {
        stats.recentErrors.unshift({
          timestamp: entry.timestamp,
          type: type,
          error: entry.result.error
        });
      }
    }

    stats.avgDurationMs = history.length > 0 ? Math.round(totalDuration / history.length) : 0;
    stats.recentErrors = stats.recentErrors.slice(0, 10);

    return stats;
  }
}

module.exports = TaskExecutor;
