/**
 * Coder Skill for ClawdBot
 *
 * AI-powered code writing and editing via WhatsApp.
 * Uses Claude AI to generate code and GitHub API to commit changes.
 *
 * Commands:
 *   fix issue <repo> #<n>              - Read issue and create fix PR
 *   edit file <repo> <path> <instructions> - Edit a file with AI
 *   create file <repo> <path> <description> - Create new file with AI
 *   commit <repo> <path> <message>     - Commit staged changes
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');
const Anthropic = require('@anthropic-ai/sdk');

class CoderSkill extends BaseSkill {
  name = 'coder';
  description = 'AI code writing - fix issues, edit files, create PRs';
  priority = 20;

  commands = [
    {
      pattern: /^fix\s+issue\s+(\S+)\s+#?(\d+)$/i,
      description: 'Read issue and create a fix PR',
      usage: 'fix issue <repo> #<number>'
    },
    {
      pattern: /^edit\s+file\s+(\S+)\s+(\S+)\s+(.+)$/i,
      description: 'Edit a file with AI assistance',
      usage: 'edit file <repo> <path> <instructions>'
    },
    {
      pattern: /^create\s+file\s+(\S+)\s+(\S+)\s+(.+)$/i,
      description: 'Create a new file with AI',
      usage: 'create file <repo> <path> <description>'
    },
    {
      pattern: /^quick\s+fix\s+(\S+)\s+(\S+)\s+(.+)$/i,
      description: 'Quick fix a file and commit',
      usage: 'quick fix <repo> <path> <what to fix>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.username = process.env.GITHUB_USERNAME;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Fix issue
      if (/^fix\s+issue\s+/i.test(raw)) {
        const match = raw.match(/^fix\s+issue\s+(\S+)\s+#?(\d+)$/i);
        if (match) {
          return await this.fixIssue(match[1], parseInt(match[2]));
        }
      }

      // Edit file
      if (/^edit\s+file\s+/i.test(raw)) {
        const match = raw.match(/^edit\s+file\s+(\S+)\s+(\S+)\s+(.+)$/i);
        if (match) {
          return await this.editFile(match[1], match[2], match[3]);
        }
      }

      // Create file
      if (/^create\s+file\s+/i.test(raw)) {
        const match = raw.match(/^create\s+file\s+(\S+)\s+(\S+)\s+(.+)$/i);
        if (match) {
          return await this.createFile(match[1], match[2], match[3]);
        }
      }

      // Quick fix
      if (/^quick\s+fix\s+/i.test(raw)) {
        const match = raw.match(/^quick\s+fix\s+(\S+)\s+(\S+)\s+(.+)$/i);
        if (match) {
          return await this.quickFix(match[1], match[2], match[3]);
        }
      }

      return this.error('Unknown command. Try: fix issue <repo> #<n>');
    } catch (err) {
      this.log('error', 'Coder error', err);
      return this.error(`Coder error: ${err.message}`);
    }
  }

  /**
   * Fix an issue by reading it, generating code, and creating a PR
   */
  async fixIssue(repoName, issueNumber) {
    this.log('info', `Fixing issue #${issueNumber} in ${repoName}`);

    // 1. Get issue details
    const issue = await this.octokit.issues.get({
      owner: this.username,
      repo: repoName,
      issue_number: issueNumber
    });

    const issueTitle = issue.data.title;
    const issueBody = issue.data.body || 'No description provided';

    // 2. Get repo structure to understand context
    const repoFiles = await this.getRepoStructure(repoName);

    // 3. Ask Claude to analyze and suggest fix
    const analysis = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a coding assistant. Analyze this GitHub issue and suggest a fix.

ISSUE #${issueNumber}: ${issueTitle}
${issueBody}

REPOSITORY FILES:
${repoFiles}

Respond with:
1. ANALYSIS: Brief analysis of the issue
2. FILE_TO_EDIT: The file path that needs to be changed (just one main file)
3. CHANGES: Describe the specific changes needed
4. Keep it concise - this will be sent via WhatsApp.`
      }]
    });

    const analysisText = analysis.content[0].text;

    // 4. Extract file to edit
    const fileMatch = analysisText.match(/FILE_TO_EDIT:\s*(\S+)/i);

    let response = `🔧 *Issue #${issueNumber} Analysis*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `${analysisText.substring(0, 1500)}\n\n`;

    if (fileMatch) {
      response += `\n_To apply fix, use:_\n`;
      response += `\`quick fix ${repoName} ${fileMatch[1]} fix issue #${issueNumber}\``;
    }

    return this.success(response);
  }

  /**
   * Edit a file with AI assistance
   */
  async editFile(repoName, filePath, instructions) {
    this.log('info', `Editing ${filePath} in ${repoName}`);

    // 1. Get current file content
    let currentContent;
    let fileSha;
    try {
      const file = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repoName,
        path: filePath
      });
      currentContent = Buffer.from(file.data.content, 'base64').toString('utf8');
      fileSha = file.data.sha;
    } catch (err) {
      return this.error(`File not found: ${filePath}`);
    }

    // 2. Ask Claude to edit the file (with quality standards)
    let qualityHint = '';
    try {
      const dqf = require('../../lib/design-quality-framework');
      qualityHint = dqf.getQualityPromptInjection({ taskType: 'coding' });
    } catch (e) { /* framework not available */ }

    const edited = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Edit this file according to the instructions. Return ONLY the complete new file content, nothing else.

FILE: ${filePath}
INSTRUCTIONS: ${instructions}
${qualityHint ? `\nQUALITY STANDARDS: ${qualityHint}` : ''}

CURRENT CONTENT:
\`\`\`
${currentContent}
\`\`\`

Return the complete edited file content only, no explanations.`
      }]
    });

    const newContent = edited.content[0].text
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    // 3. Create a branch and commit
    const branchName = `clawd-edit-${Date.now()}`;

    // Get default branch SHA
    const repo = await this.octokit.repos.get({
      owner: this.username,
      repo: repoName
    });
    const defaultBranch = repo.data.default_branch;

    const ref = await this.octokit.git.getRef({
      owner: this.username,
      repo: repoName,
      ref: `heads/${defaultBranch}`
    });

    // Create branch
    await this.octokit.git.createRef({
      owner: this.username,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: ref.data.object.sha
    });

    // Commit the change
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.username,
      repo: repoName,
      path: filePath,
      message: `Edit ${filePath}: ${instructions.substring(0, 50)}`,
      content: Buffer.from(newContent).toString('base64'),
      branch: branchName,
      sha: fileSha
    });

    // Create PR
    const pr = await this.octokit.pulls.create({
      owner: this.username,
      repo: repoName,
      title: `[ClawdBot] Edit ${filePath}`,
      body: `## Changes\n${instructions}\n\n_Created via WhatsApp by ClawdBot_`,
      head: branchName,
      base: defaultBranch
    });

    return this.success(
      `✅ *Edit Complete!*\n\n` +
      `File: \`${filePath}\`\n` +
      `Branch: ${branchName}\n` +
      `PR: #${pr.data.number}\n\n` +
      `${pr.data.html_url}`
    );
  }

  /**
   * Create a new file with AI
   */
  async createFile(repoName, filePath, description) {
    this.log('info', `Creating ${filePath} in ${repoName}`);

    // Check if file already exists
    try {
      await this.octokit.repos.getContent({
        owner: this.username,
        repo: repoName,
        path: filePath
      });
      return this.error(`File already exists: ${filePath}. Use "edit file" instead.`);
    } catch (err) {
      // File doesn't exist, good
    }

    // Get repo context
    const repoFiles = await this.getRepoStructure(repoName);

    // Ask Claude to create the file (with quality standards)
    let createQualityHint = '';
    try {
      const dqf = require('../../lib/design-quality-framework');
      createQualityHint = dqf.getQualityPromptInjection({ taskType: 'coding' });
    } catch (e) { /* framework not available */ }

    const created = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Create a new file for this project. Return ONLY the file content, nothing else.

FILE TO CREATE: ${filePath}
DESCRIPTION: ${description}
${createQualityHint ? `\nQUALITY STANDARDS: ${createQualityHint}` : ''}

EXISTING PROJECT FILES:
${repoFiles}

Return the complete file content only, no explanations.`
      }]
    });

    const content = created.content[0].text
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    // Create branch and commit
    const branchName = `clawd-create-${Date.now()}`;

    const repo = await this.octokit.repos.get({
      owner: this.username,
      repo: repoName
    });
    const defaultBranch = repo.data.default_branch;

    const ref = await this.octokit.git.getRef({
      owner: this.username,
      repo: repoName,
      ref: `heads/${defaultBranch}`
    });

    await this.octokit.git.createRef({
      owner: this.username,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: ref.data.object.sha
    });

    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.username,
      repo: repoName,
      path: filePath,
      message: `Create ${filePath}: ${description.substring(0, 50)}`,
      content: Buffer.from(content).toString('base64'),
      branch: branchName
    });

    const pr = await this.octokit.pulls.create({
      owner: this.username,
      repo: repoName,
      title: `[ClawdBot] Create ${filePath}`,
      body: `## New File\n${description}\n\n_Created via WhatsApp by ClawdBot_`,
      head: branchName,
      base: defaultBranch
    });

    return this.success(
      `✅ *File Created!*\n\n` +
      `File: \`${filePath}\`\n` +
      `Branch: ${branchName}\n` +
      `PR: #${pr.data.number}\n\n` +
      `${pr.data.html_url}`
    );
  }

  /**
   * Quick fix - edit and commit directly to a new branch with PR
   */
  async quickFix(repoName, filePath, instructions) {
    this.log('info', `Quick fix ${filePath} in ${repoName}: ${instructions}`);
    return await this.editFile(repoName, filePath, instructions);
  }

  /**
   * Get repository file structure
   */
  async getRepoStructure(repoName, path = '') {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repoName,
        path: path
      });

      let structure = '';
      const items = Array.isArray(response.data) ? response.data : [response.data];

      for (const item of items.slice(0, 30)) {
        if (item.type === 'file') {
          structure += `${item.path}\n`;
        } else if (item.type === 'dir' && !item.name.startsWith('.') && item.name !== 'node_modules') {
          structure += `${item.path}/\n`;
        }
      }

      return structure || 'No files found';
    } catch (err) {
      return 'Unable to read repo structure';
    }
  }
}

module.exports = CoderSkill;
