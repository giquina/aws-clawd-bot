/**
 * Code Review Skill for ClawdBot
 *
 * AI-powered code review via WhatsApp.
 * Uses Claude AI for intelligent code analysis and GitHub API to fetch code.
 *
 * Commands:
 *   review pr <repo> #<n>        - Get AI code review of a pull request
 *   review file <repo> <path>    - Get AI review of a specific file
 *   improve <repo> <path>        - Get improvement suggestions for a file
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');
const Anthropic = require('@anthropic-ai/sdk');

class ReviewSkill extends BaseSkill {
  name = 'review';
  description = 'AI code review - review PRs, files, and get improvement suggestions';
  priority = 15;

  commands = [
    {
      pattern: /^review\s+pr\s+(\S+)\s+#?(\d+)$/i,
      description: 'Get AI code review of a pull request',
      usage: 'review pr <repo> #<number>'
    },
    {
      pattern: /^review\s+file\s+(\S+)\s+(\S+)$/i,
      description: 'Get AI review of a specific file',
      usage: 'review file <repo> <path>'
    },
    {
      pattern: /^improve\s+(\S+)\s+(\S+)$/i,
      description: 'Get improvement suggestions for a file',
      usage: 'improve <repo> <path>'
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
      // Review PR
      if (/^review\s+pr\s+/i.test(raw)) {
        const match = raw.match(/^review\s+pr\s+(\S+)\s+#?(\d+)$/i);
        if (match) {
          return await this.reviewPR(match[1], parseInt(match[2]));
        }
      }

      // Review file
      if (/^review\s+file\s+/i.test(raw)) {
        const match = raw.match(/^review\s+file\s+(\S+)\s+(\S+)$/i);
        if (match) {
          return await this.reviewFile(match[1], match[2]);
        }
      }

      // Improve file
      if (/^improve\s+/i.test(raw)) {
        const match = raw.match(/^improve\s+(\S+)\s+(\S+)$/i);
        if (match) {
          return await this.improveFile(match[1], match[2]);
        }
      }

      return this.error('Unknown command. Try: review pr <repo> #<n>');
    } catch (err) {
      this.log('error', 'Review error', err);
      return this.error(`Review error: ${err.message}`);
    }
  }

  /**
   * Review a pull request
   */
  async reviewPR(repoName, prNumber) {
    this.log('info', `Reviewing PR #${prNumber} in ${repoName}`);

    // 1. Get PR details
    const pr = await this.octokit.pulls.get({
      owner: this.username,
      repo: repoName,
      pull_number: prNumber
    });

    const prTitle = pr.data.title;
    const prBody = pr.data.body || 'No description provided';
    const prAuthor = pr.data.user.login;

    // 2. Get PR files and their diffs
    const files = await this.octokit.pulls.listFiles({
      owner: this.username,
      repo: repoName,
      pull_number: prNumber,
      per_page: 20
    });

    // Build diff summary for review
    let diffSummary = '';
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const file of files.data.slice(0, 10)) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;

      diffSummary += `\n--- ${file.filename} ---\n`;
      diffSummary += `Status: ${file.status} | +${file.additions} -${file.deletions}\n`;

      // Include patch (diff) if available, truncated
      if (file.patch) {
        const patchPreview = file.patch.substring(0, 1500);
        diffSummary += `${patchPreview}${file.patch.length > 1500 ? '\n...truncated...' : ''}\n`;
      }
    }

    if (files.data.length > 10) {
      diffSummary += `\n... and ${files.data.length - 10} more files`;
    }

    // 3. Ask Claude to review
    const review = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `You are a senior code reviewer. Review this pull request and provide constructive feedback.

PR #${prNumber}: ${prTitle}
Author: ${prAuthor}
Description: ${prBody}

Changes (+${totalAdditions} -${totalDeletions}):
${diffSummary}

Provide a code review with:
1. SUMMARY: Brief overview of what the PR does (1-2 sentences)
2. POSITIVES: What's good about the code (2-3 points)
3. ISSUES: Potential bugs, security issues, or problems (if any)
4. SUGGESTIONS: Improvements to consider (2-4 points)
5. VERDICT: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION

Keep it concise - this will be sent via WhatsApp. Use short bullet points.`
      }]
    });

    const reviewText = review.content[0].text;

    let response = `*PR #${prNumber} Review*\n`;
    response += `${prTitle}\n`;
    response += `Author: ${prAuthor}\n`;
    response += `Changes: +${totalAdditions} -${totalDeletions} in ${files.data.length} files\n`;
    response += `\n${reviewText.substring(0, 2500)}\n`;
    response += `\n${pr.data.html_url}`;

    return this.success(response);
  }

  /**
   * Review a specific file
   */
  async reviewFile(repoName, filePath) {
    this.log('info', `Reviewing file ${filePath} in ${repoName}`);

    // 1. Get file content
    let fileContent;
    try {
      const file = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repoName,
        path: filePath
      });
      fileContent = Buffer.from(file.data.content, 'base64').toString('utf8');
    } catch (err) {
      if (err.status === 404) {
        return this.error(`File not found: ${filePath}`);
      }
      throw err;
    }

    // Truncate very large files
    const maxContentLength = 8000;
    const truncated = fileContent.length > maxContentLength;
    const contentForReview = truncated
      ? fileContent.substring(0, maxContentLength)
      : fileContent;

    // 2. Ask Claude to review
    const review = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a senior code reviewer. Review this file and provide feedback.

FILE: ${filePath}
${truncated ? '(Truncated - first 8000 chars)' : ''}

\`\`\`
${contentForReview}
\`\`\`

Provide a code review with:
1. PURPOSE: What does this file do? (1 sentence)
2. QUALITY: Overall code quality assessment (1-2 sentences)
3. ISSUES: Bugs, security issues, or anti-patterns found
4. BEST PRACTICES: Are standards being followed?
5. RECOMMENDATIONS: Top 3 things to improve

Keep it concise for WhatsApp. Use short bullet points.`
      }]
    });

    const reviewText = review.content[0].text;
    const lineCount = fileContent.split('\n').length;

    let response = `*File Review: ${filePath}*\n`;
    response += `Repository: ${repoName}\n`;
    response += `Lines: ${lineCount}${truncated ? ' (truncated for review)' : ''}\n`;
    response += `\n${reviewText.substring(0, 2500)}`;

    return this.success(response);
  }

  /**
   * Get improvement suggestions for a file
   */
  async improveFile(repoName, filePath) {
    this.log('info', `Getting improvements for ${filePath} in ${repoName}`);

    // 1. Get file content
    let fileContent;
    try {
      const file = await this.octokit.repos.getContent({
        owner: this.username,
        repo: repoName,
        path: filePath
      });
      fileContent = Buffer.from(file.data.content, 'base64').toString('utf8');
    } catch (err) {
      if (err.status === 404) {
        return this.error(`File not found: ${filePath}`);
      }
      throw err;
    }

    // Truncate very large files
    const maxContentLength = 8000;
    const truncated = fileContent.length > maxContentLength;
    const contentForReview = truncated
      ? fileContent.substring(0, maxContentLength)
      : fileContent;

    // 2. Get file extension for context
    const ext = filePath.split('.').pop().toLowerCase();
    const langContext = this.getLanguageContext(ext);

    // 3. Ask Claude for improvements
    const improvements = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `You are a senior developer helping improve code quality. Analyze this ${langContext} file and suggest specific improvements.

FILE: ${filePath}
${truncated ? '(Truncated - first 8000 chars)' : ''}

\`\`\`${ext}
${contentForReview}
\`\`\`

Provide ACTIONABLE improvements:

1. PERFORMANCE: How to make it faster/more efficient
2. READABILITY: How to make it clearer/more maintainable
3. SECURITY: Any security concerns to address
4. MODERN PRACTICES: Updates to use current best practices
5. QUICK WINS: Easy changes with big impact

For each suggestion:
- Be specific (reference line numbers or function names)
- Explain WHY it matters
- Keep it brief - this goes to WhatsApp

End with a priority order: which improvements to tackle first.`
      }]
    });

    const improvementText = improvements.content[0].text;
    const lineCount = fileContent.split('\n').length;

    let response = `*Improvements: ${filePath}*\n`;
    response += `Repository: ${repoName}\n`;
    response += `Language: ${langContext}\n`;
    response += `Lines: ${lineCount}${truncated ? ' (truncated)' : ''}\n`;
    response += `\n${improvementText.substring(0, 2500)}\n`;
    response += `\n_To apply changes: edit file ${repoName} ${filePath} <instructions>_`;

    return this.success(response);
  }

  /**
   * Get language context from file extension
   */
  getLanguageContext(ext) {
    const langMap = {
      'js': 'JavaScript',
      'ts': 'TypeScript',
      'jsx': 'React JSX',
      'tsx': 'React TypeScript',
      'py': 'Python',
      'java': 'Java',
      'rb': 'Ruby',
      'go': 'Go',
      'rs': 'Rust',
      'cpp': 'C++',
      'c': 'C',
      'cs': 'C#',
      'php': 'PHP',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'scala': 'Scala',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sql': 'SQL',
      'sh': 'Shell',
      'ps1': 'PowerShell',
      'yml': 'YAML',
      'yaml': 'YAML',
      'json': 'JSON',
      'md': 'Markdown'
    };
    return langMap[ext] || ext.toUpperCase();
  }
}

module.exports = ReviewSkill;
