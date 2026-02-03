/**
 * Plan Executor
 * Takes a confirmed plan from voice/text instructions and actually executes it:
 * 1. Asks Claude to break the plan into concrete file operations (JSON)
 * 2. Reads reference files from GitHub repos
 * 3. Generates actual code using Claude with full context
 * 4. Creates a single branch with all changes
 * 5. Commits all files
 * 6. Opens a PR
 * 7. Returns PR URL
 */

const { Octokit } = require('@octokit/rest');
const Anthropic = require('@anthropic-ai/sdk');
const projectManager = require('./project-manager');

class PlanExecutor {
  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.claude = null;
    this.username = process.env.GITHUB_USERNAME || 'giquina';
  }

  initClaude() {
    if (!this.claude && process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.claude;
  }

  /**
   * Execute a confirmed plan
   * @param {Object} options
   * @param {string} options.transcript - Original user instruction
   * @param {string} options.plan - The plan text that was confirmed
   * @param {string} options.userId - User ID
   * @param {Function} options.sendProgress - Async function(message) to send progress updates to user
   * @returns {Promise<{success: boolean, message: string, prUrl?: string}>}
   */
  async execute({ transcript, plan, userId, sendProgress }) {
    const progress = sendProgress || (() => {});

    try {
      this.initClaude();
      if (!this.claude) {
        return { success: false, message: 'Claude API not configured (ANTHROPIC_API_KEY missing)' };
      }

      // Step 1: Ask Claude to break the plan into structured file operations
      await progress('Analyzing plan and determining file operations...');

      const operations = await this.planToOperations(transcript, plan);
      if (!operations || !operations.repo) {
        return { success: false, message: 'Could not determine which repository to modify.' };
      }

      await progress(`Target: ${operations.repo} | ${operations.operations.length} file operation(s)`);

      // Step 2: Read any reference files needed
      const referenceContent = {};
      for (const op of operations.operations) {
        if (op.action === 'read') {
          await progress(`Reading ${op.repo}/${op.path}...`);
          try {
            const content = await projectManager.fetchFile(this.username, op.repo, op.path);
            if (content) {
              referenceContent[`${op.repo}/${op.path}`] = content;
            }
          } catch (e) {
            console.log(`[PlanExecutor] Could not read ${op.repo}/${op.path}: ${e.message}`);
          }
        }
      }

      // Step 3: Get the target repo structure for context
      const targetRepo = operations.repo;
      await progress(`Reading ${targetRepo} project structure...`);

      let repoStructure = '';
      try {
        const files = await projectManager.listRepoFiles(this.username, targetRepo);
        if (files) {
          repoStructure = files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n');
        }
      } catch (e) {
        console.log(`[PlanExecutor] Could not list ${targetRepo} files: ${e.message}`);
      }

      // Step 4: Generate code for each write operation
      const fileChanges = [];
      const writeOps = operations.operations.filter(op => op.action === 'create' || op.action === 'edit');

      for (const op of writeOps) {
        await progress(`Generating code: ${op.path}...`);

        let existingContent = null;
        let fileSha = null;

        if (op.action === 'edit') {
          try {
            const file = await this.octokit.repos.getContent({
              owner: this.username,
              repo: targetRepo,
              path: op.path
            });
            existingContent = Buffer.from(file.data.content, 'base64').toString('utf8');
            fileSha = file.data.sha;
          } catch (e) {
            // File doesn't exist, treat as create
            op.action = 'create';
          }
        }

        const referenceContext = Object.entries(referenceContent)
          .map(([path, content]) => `--- ${path} ---\n${content.substring(0, 3000)}`)
          .join('\n\n');

        const codePrompt = op.action === 'edit'
          ? `Edit this file according to the instructions. Return ONLY the complete new file content.

FILE: ${op.path}
INSTRUCTIONS: ${op.instructions || transcript}

REFERENCE FILES:
${referenceContext || 'None'}

CURRENT CONTENT:
\`\`\`
${existingContent}
\`\`\`

PROJECT STRUCTURE:
${repoStructure}

Return ONLY the complete edited file content, no explanations or markdown fences.`
          : `Create a new file for this project. Return ONLY the file content.

FILE TO CREATE: ${op.path}
INSTRUCTIONS: ${op.instructions || transcript}

REFERENCE FILES:
${referenceContext || 'None'}

PROJECT STRUCTURE:
${repoStructure}

Return ONLY the complete file content, no explanations or markdown fences.`;

        const response = await this.claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          messages: [{ role: 'user', content: codePrompt }]
        });

        let generatedCode = response.content[0].text
          .replace(/^```[\w]*\n?/, '')
          .replace(/\n?```$/, '')
          .trim();

        fileChanges.push({
          path: op.path,
          content: generatedCode,
          action: op.action,
          sha: fileSha
        });
      }

      if (fileChanges.length === 0) {
        return { success: false, message: 'No file changes to make.' };
      }

      // Step 5: Create branch
      const branchName = `clawd-${targetRepo}-${Date.now()}`;
      await progress(`Creating branch: ${branchName}...`);

      const repo = await this.octokit.repos.get({
        owner: this.username,
        repo: targetRepo
      });
      const defaultBranch = repo.data.default_branch;

      const ref = await this.octokit.git.getRef({
        owner: this.username,
        repo: targetRepo,
        ref: `heads/${defaultBranch}`
      });

      await this.octokit.git.createRef({
        owner: this.username,
        repo: targetRepo,
        ref: `refs/heads/${branchName}`,
        sha: ref.data.object.sha
      });

      // Step 6: Commit each file
      for (const change of fileChanges) {
        await progress(`Committing: ${change.path}...`);

        const commitData = {
          owner: this.username,
          repo: targetRepo,
          path: change.path,
          message: `${change.action === 'edit' ? 'Edit' : 'Create'} ${change.path}\n\nFrom voice instruction via ClawdBot`,
          content: Buffer.from(change.content).toString('base64'),
          branch: branchName
        };

        if (change.sha) {
          commitData.sha = change.sha;
        }

        await this.octokit.repos.createOrUpdateFileContents(commitData);
      }

      // Step 7: Create PR
      await progress('Creating pull request...');

      const prBody = `## Voice Instruction\n> ${transcript}\n\n## Changes\n${fileChanges.map(f => `- ${f.action}: \`${f.path}\``).join('\n')}\n\n_Created via Telegram voice instruction by ClawdBot_`;

      const pr = await this.octokit.pulls.create({
        owner: this.username,
        repo: targetRepo,
        title: `[ClawdBot] ${operations.summary || transcript.substring(0, 60)}`,
        body: prBody,
        head: branchName,
        base: defaultBranch
      });

      const resultMsg = `✅ *Done!*\n\n` +
        `*PR #${pr.data.number}* created in ${targetRepo}\n` +
        `Branch: \`${branchName}\`\n` +
        `Files: ${fileChanges.map(f => `\`${f.path}\``).join(', ')}\n\n` +
        `${pr.data.html_url}`;

      return { success: true, message: resultMsg, prUrl: pr.data.html_url };

    } catch (error) {
      console.error('[PlanExecutor] Execution error:', error);
      return { success: false, message: `Execution failed: ${error.message}` };
    }
  }

  /**
   * Convert a plan + transcript into structured file operations
   */
  async planToOperations(transcript, plan) {
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a code planning assistant. Convert this plan into specific file operations.

USER INSTRUCTION: "${transcript}"

PLAN:
${plan}

Return ONLY valid JSON (no markdown fences, no explanation) in this exact format:
{
  "repo": "target-repo-name",
  "summary": "brief 1-line summary of changes",
  "operations": [
    {"action": "read", "repo": "source-repo", "path": "path/to/reference/file"},
    {"action": "create", "repo": "target-repo", "path": "path/to/new/file", "instructions": "what to create"},
    {"action": "edit", "repo": "target-repo", "path": "path/to/existing/file", "instructions": "what to change"}
  ]
}

Rules:
- "read" = read a reference file from another repo (for copying patterns)
- "create" = create a new file
- "edit" = modify an existing file
- Keep operations minimal - only files that need to change
- Use actual file paths that make sense for the project structure`
      }]
    });

    try {
      const text = response.content[0].text.trim();
      // Strip markdown fences if present
      const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[PlanExecutor] Failed to parse operations JSON:', e.message);
      return null;
    }
  }
}

module.exports = new PlanExecutor();
