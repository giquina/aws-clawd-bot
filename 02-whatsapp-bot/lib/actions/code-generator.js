/**
 * Code Generator Action
 *
 * Generates code for web/mobile projects using Claude AI.
 * Handles: create-page, create-feature, fix-bug, code-task
 *
 * Flow:
 * 1. Gets project tech stack from project-registry.json
 * 2. Generates appropriate code using Claude
 * 3. Creates a GitHub branch
 * 4. Commits the code
 * 5. Creates a PR
 * 6. Returns PR URL
 */

const Anthropic = require('@anthropic-ai/sdk');
const { Octokit } = require('@octokit/rest');
const path = require('path');
const fs = require('fs');

// Load project registry
const registryPath = path.join(__dirname, '../../../config/project-registry.json');

class CodeGenerator {
  constructor() {
    this.anthropic = null;
    this.octokit = null;
    this.registry = null;
    this.initialized = false;

    // Supported actions
    this.supportedActions = [
      'create-page',
      'create-feature',
      'fix-bug',
      'code-task'
    ];

    // Tech stack to file patterns mapping
    this.stackPatterns = {
      'Next.js': {
        pageDir: 'app',
        pageExt: '.tsx',
        componentDir: 'components',
        componentExt: '.tsx',
        apiDir: 'app/api'
      },
      'React': {
        pageDir: 'src/pages',
        pageExt: '.tsx',
        componentDir: 'src/components',
        componentExt: '.tsx'
      },
      'React Native': {
        pageDir: 'src/screens',
        pageExt: '.tsx',
        componentDir: 'src/components',
        componentExt: '.tsx'
      },
      'Node.js': {
        pageDir: 'routes',
        pageExt: '.js',
        componentDir: 'lib',
        componentExt: '.js'
      },
      'Express': {
        pageDir: 'routes',
        pageExt: '.js',
        componentDir: 'lib',
        componentExt: '.js'
      }
    };
  }

  /**
   * Initialize the code generator
   */
  async initialize() {
    if (this.initialized) return this;

    // Initialize Anthropic client
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Initialize GitHub client
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN not configured');
    }
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    // Load project registry
    try {
      const registryContent = fs.readFileSync(registryPath, 'utf-8');
      this.registry = JSON.parse(registryContent);
    } catch (err) {
      console.error('[CodeGenerator] Failed to load registry:', err.message);
      this.registry = { projects: {} };
    }

    this.initialized = true;
    console.log('[CodeGenerator] Initialized');
    return this;
  }

  /**
   * Check if an action is supported
   * @param {string} action - Action name
   */
  canHandle(action) {
    return this.supportedActions.includes(action);
  }

  /**
   * Execute a code generation action
   * @param {string} action - Action type (create-page, create-feature, fix-bug, code-task)
   * @param {Object} params - Parameters for the action
   * @param {string} params.project - Project ID from registry
   * @param {string} params.description - What to create/fix
   * @param {Object} params.projectDetails - Full project info from registry (optional)
   * @param {Object} context - Additional context
   */
  async execute(action, params, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { project, description, projectDetails: providedDetails } = params;

    if (!project) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    if (!description) {
      return {
        success: false,
        error: 'Description is required'
      };
    }

    // Get project details from registry or use provided
    const projectDetails = providedDetails || this.getProjectDetails(project);
    if (!projectDetails) {
      return {
        success: false,
        error: `Project "${project}" not found in registry`
      };
    }

    console.log(`[CodeGenerator] Executing ${action} for ${project}: ${description}`);

    try {
      // Route to appropriate handler
      switch (action) {
        case 'create-page':
          return await this.createPage(project, description, projectDetails, context);

        case 'create-feature':
          return await this.createFeature(project, description, projectDetails, context);

        case 'fix-bug':
          return await this.fixBug(project, description, projectDetails, context);

        case 'code-task':
          return await this.codeTask(project, description, projectDetails, context);

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`
          };
      }
    } catch (error) {
      console.error(`[CodeGenerator] Error executing ${action}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get project details from registry
   */
  getProjectDetails(projectId) {
    if (!this.registry || !this.registry.projects) {
      return null;
    }

    // Case-insensitive search
    const normalizedId = projectId.toLowerCase();
    for (const [id, details] of Object.entries(this.registry.projects)) {
      if (id.toLowerCase() === normalizedId) {
        return { id, ...details };
      }
    }
    return null;
  }

  /**
   * Get tech stack patterns for a project
   */
  getStackPatterns(projectDetails) {
    const stack = projectDetails.stack || [];

    // Find matching stack patterns (first match wins)
    for (const tech of stack) {
      if (this.stackPatterns[tech]) {
        return this.stackPatterns[tech];
      }
    }

    // Default patterns for web-app
    if (projectDetails.type === 'web-app') {
      return this.stackPatterns['React'];
    }

    // Default patterns for mobile-app
    if (projectDetails.type === 'mobile-app') {
      return this.stackPatterns['React Native'];
    }

    // Generic default
    return {
      pageDir: 'src',
      pageExt: '.js',
      componentDir: 'src',
      componentExt: '.js'
    };
  }

  /**
   * Parse owner and repo from full repo string
   */
  parseRepo(repoString) {
    const [owner, repo] = repoString.split('/');
    return { owner, repo };
  }

  /**
   * Generate a branch name from description
   */
  generateBranchName(action, description) {
    const prefix = action === 'fix-bug' ? 'fix' : 'feature';
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 40);
    const timestamp = Date.now().toString(36);
    return `${prefix}/${slug}-${timestamp}`;
  }

  /**
   * Create a page component
   */
  async createPage(project, description, projectDetails, context) {
    const patterns = this.getStackPatterns(projectDetails);
    const { owner, repo } = this.parseRepo(projectDetails.repo);

    // Generate code using Claude
    const codeResult = await this.generateCode({
      action: 'create-page',
      description,
      projectDetails,
      patterns,
      systemPrompt: this.buildPageSystemPrompt(projectDetails, patterns)
    });

    if (!codeResult.success) {
      return codeResult;
    }

    // Create branch, commit, and PR
    return await this.createPullRequest({
      owner,
      repo,
      action: 'create-page',
      description,
      files: codeResult.files,
      projectDetails
    });
  }

  /**
   * Create a feature with multiple files
   */
  async createFeature(project, description, projectDetails, context) {
    const patterns = this.getStackPatterns(projectDetails);
    const { owner, repo } = this.parseRepo(projectDetails.repo);

    // Generate code using Claude
    const codeResult = await this.generateCode({
      action: 'create-feature',
      description,
      projectDetails,
      patterns,
      systemPrompt: this.buildFeatureSystemPrompt(projectDetails, patterns)
    });

    if (!codeResult.success) {
      return codeResult;
    }

    // Create branch, commit, and PR
    return await this.createPullRequest({
      owner,
      repo,
      action: 'create-feature',
      description,
      files: codeResult.files,
      projectDetails
    });
  }

  /**
   * Fix a bug in the codebase
   */
  async fixBug(project, description, projectDetails, context) {
    const { owner, repo } = this.parseRepo(projectDetails.repo);

    // First, analyze the bug
    const analysisResult = await this.analyzeBug({
      description,
      projectDetails,
      context
    });

    if (!analysisResult.success) {
      return analysisResult;
    }

    // Generate fix using Claude
    const codeResult = await this.generateCode({
      action: 'fix-bug',
      description,
      projectDetails,
      analysis: analysisResult.analysis,
      systemPrompt: this.buildBugFixSystemPrompt(projectDetails, analysisResult.analysis)
    });

    if (!codeResult.success) {
      return codeResult;
    }

    // Create branch, commit, and PR
    return await this.createPullRequest({
      owner,
      repo,
      action: 'fix-bug',
      description,
      files: codeResult.files,
      projectDetails,
      analysis: analysisResult.analysis
    });
  }

  /**
   * Generic code task from natural language
   */
  async codeTask(project, description, projectDetails, context) {
    const patterns = this.getStackPatterns(projectDetails);
    const { owner, repo } = this.parseRepo(projectDetails.repo);

    // Generate code using Claude
    const codeResult = await this.generateCode({
      action: 'code-task',
      description,
      projectDetails,
      patterns,
      systemPrompt: this.buildCodeTaskSystemPrompt(projectDetails, patterns)
    });

    if (!codeResult.success) {
      return codeResult;
    }

    // Create branch, commit, and PR
    return await this.createPullRequest({
      owner,
      repo,
      action: 'code-task',
      description,
      files: codeResult.files,
      projectDetails
    });
  }

  /**
   * Generate code using Claude
   */
  async generateCode({ action, description, projectDetails, patterns, systemPrompt, analysis }) {
    const userPrompt = this.buildUserPrompt(action, description, projectDetails, analysis);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      });

      const responseText = response.content[0]?.text || '';

      // Parse the generated files from the response
      const files = this.parseGeneratedFiles(responseText);

      if (files.length === 0) {
        return {
          success: false,
          error: 'No files were generated'
        };
      }

      return {
        success: true,
        files,
        rawResponse: responseText
      };
    } catch (error) {
      console.error('[CodeGenerator] Claude API error:', error);
      return {
        success: false,
        error: `Code generation failed: ${error.message}`
      };
    }
  }

  /**
   * Analyze a bug to understand what needs fixing
   */
  async analyzeBug({ description, projectDetails, context }) {
    const systemPrompt = `You are a senior software engineer analyzing a bug report.
Given the bug description and project context, identify:
1. Likely cause of the bug
2. Which files might need to be modified
3. Suggested approach to fix

Project: ${projectDetails.repo}
Tech Stack: ${(projectDetails.stack || []).join(', ')}
Type: ${projectDetails.type}

Respond in JSON format:
{
  "likelyCause": "string",
  "affectedFiles": ["array of likely file paths"],
  "suggestedFix": "string",
  "severity": "low|medium|high|critical"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Bug description: ${description}` }
        ]
      });

      const responseText = response.content[0]?.text || '';

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return { success: true, analysis };
      }

      return {
        success: true,
        analysis: {
          likelyCause: 'Unable to determine',
          affectedFiles: [],
          suggestedFix: description,
          severity: 'medium'
        }
      };
    } catch (error) {
      console.error('[CodeGenerator] Bug analysis error:', error);
      return {
        success: false,
        error: `Bug analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Build system prompt for page creation
   */
  buildPageSystemPrompt(projectDetails, patterns) {
    const stack = (projectDetails.stack || []).join(', ');

    return `You are an expert ${stack} developer creating a new page component.

Project: ${projectDetails.repo}
Tech Stack: ${stack}
Page Directory: ${patterns.pageDir}
File Extension: ${patterns.pageExt}

IMPORTANT: Respond with files in this format:
\`\`\`filepath:path/to/file.ext
// file contents here
\`\`\`

Create production-ready code following best practices:
- Use TypeScript if the project uses it
- Include proper types and interfaces
- Add comments for complex logic
- Follow the project's existing patterns
- Include any necessary imports

For Next.js pages, use the App Router conventions.
For React/React Native, create functional components with hooks.`;
  }

  /**
   * Build system prompt for feature creation
   */
  buildFeatureSystemPrompt(projectDetails, patterns) {
    const stack = (projectDetails.stack || []).join(', ');

    return `You are an expert ${stack} developer creating a new feature.

Project: ${projectDetails.repo}
Tech Stack: ${stack}
Component Directory: ${patterns.componentDir}
Page Directory: ${patterns.pageDir}
File Extension: ${patterns.pageExt}

IMPORTANT: Respond with files in this format:
\`\`\`filepath:path/to/file.ext
// file contents here
\`\`\`

Create a complete feature including:
1. Main component/page
2. Supporting components (if needed)
3. Types/interfaces (if using TypeScript)
4. Utility functions (if needed)
5. API routes (if the feature requires them)

Follow best practices:
- Separation of concerns
- Reusable components
- Proper error handling
- Loading states
- Accessibility`;
  }

  /**
   * Build system prompt for bug fixing
   */
  buildBugFixSystemPrompt(projectDetails, analysis) {
    const stack = (projectDetails.stack || []).join(', ');

    return `You are an expert ${stack} developer fixing a bug.

Project: ${projectDetails.repo}
Tech Stack: ${stack}

Bug Analysis:
- Likely Cause: ${analysis?.likelyCause || 'Unknown'}
- Affected Files: ${(analysis?.affectedFiles || []).join(', ') || 'Unknown'}
- Suggested Fix: ${analysis?.suggestedFix || 'N/A'}
- Severity: ${analysis?.severity || 'medium'}

IMPORTANT: Respond with files in this format:
\`\`\`filepath:path/to/file.ext
// complete file contents with the fix
\`\`\`

Requirements:
- Fix the bug without breaking existing functionality
- Add comments explaining the fix
- Include any necessary error handling
- If you're not sure which file to modify, create a new utility or patch file`;
  }

  /**
   * Build system prompt for generic code tasks
   */
  buildCodeTaskSystemPrompt(projectDetails, patterns) {
    const stack = (projectDetails.stack || []).join(', ');

    return `You are an expert ${stack} developer completing a coding task.

Project: ${projectDetails.repo}
Tech Stack: ${stack}
Type: ${projectDetails.type}
Capabilities: ${(projectDetails.capabilities || []).join(', ')}

IMPORTANT: Respond with files in this format:
\`\`\`filepath:path/to/file.ext
// file contents here
\`\`\`

Requirements:
- Understand the task and create appropriate files
- Follow the project's conventions
- Create production-ready code
- Include proper types if using TypeScript
- Add helpful comments`;
  }

  /**
   * Build user prompt based on action
   */
  buildUserPrompt(action, description, projectDetails, analysis) {
    let prompt = '';

    switch (action) {
      case 'create-page':
        prompt = `Create a new page: ${description}

The page should be complete and production-ready. Include:
- Proper layout and styling
- Any necessary state management
- Error handling
- Loading states if applicable`;
        break;

      case 'create-feature':
        prompt = `Create a new feature: ${description}

This should be a complete feature with all necessary files:
- Main component(s)
- Supporting utilities
- Types if using TypeScript
- API routes if needed`;
        break;

      case 'fix-bug':
        prompt = `Fix this bug: ${description}

${analysis ? `Analysis suggests: ${analysis.suggestedFix}` : ''}

Provide the complete fixed file(s).`;
        break;

      case 'code-task':
        prompt = `Complete this task: ${description}

Create the necessary files to accomplish this task.`;
        break;

      default:
        prompt = description;
    }

    return prompt;
  }

  /**
   * Parse generated files from Claude's response
   */
  parseGeneratedFiles(response) {
    const files = [];

    // Match code blocks with filepath
    const fileRegex = /```(?:filepath:|file:)?([^\n]+)\n([\s\S]*?)```/g;
    let match;

    while ((match = fileRegex.exec(response)) !== null) {
      const filepath = match[1].trim();
      const content = match[2].trim();

      // Skip if no valid filepath
      if (!filepath || filepath.includes(' ') && !filepath.includes('/')) {
        continue;
      }

      files.push({
        path: filepath,
        content
      });
    }

    // If no files found with filepath prefix, try standard code blocks
    if (files.length === 0) {
      const standardRegex = /```(?:typescript|javascript|tsx|jsx|ts|js)?\n([\s\S]*?)```/g;
      let blockIndex = 0;

      while ((match = standardRegex.exec(response)) !== null) {
        const content = match[1].trim();

        // Try to infer filename from content
        let filename = `file_${blockIndex}.tsx`;

        // Look for component name
        const componentMatch = content.match(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+(\w+)/);
        if (componentMatch) {
          filename = `${componentMatch[1]}.tsx`;
        }

        files.push({
          path: filename,
          content
        });

        blockIndex++;
      }
    }

    return files;
  }

  /**
   * Create a pull request with the generated code
   */
  async createPullRequest({ owner, repo, action, description, files, projectDetails, analysis }) {
    try {
      // Get default branch
      const { data: repoData } = await this.octokit.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;

      // Get the SHA of the default branch
      const { data: refData } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`
      });
      const baseSha = refData.object.sha;

      // Create new branch
      const branchName = this.generateBranchName(action, description);

      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      });

      console.log(`[CodeGenerator] Created branch: ${branchName}`);

      // Commit each file
      for (const file of files) {
        // Check if file exists to determine if we're creating or updating
        let existingFileSha = null;
        try {
          const { data: existingFile } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branchName
          });
          existingFileSha = existingFile.sha;
        } catch (err) {
          // File doesn't exist, that's fine
        }

        const commitParams = {
          owner,
          repo,
          path: file.path,
          message: `${action}: ${description.substring(0, 50)}`,
          content: Buffer.from(file.content).toString('base64'),
          branch: branchName
        };

        if (existingFileSha) {
          commitParams.sha = existingFileSha;
        }

        await this.octokit.repos.createOrUpdateFileContents(commitParams);
        console.log(`[CodeGenerator] Committed: ${file.path}`);
      }

      // Create PR
      const prTitle = this.generatePRTitle(action, description);
      const prBody = this.generatePRBody(action, description, files, projectDetails, analysis);

      const { data: pr } = await this.octokit.pulls.create({
        owner,
        repo,
        title: prTitle,
        body: prBody,
        head: branchName,
        base: defaultBranch
      });

      console.log(`[CodeGenerator] Created PR #${pr.number}: ${pr.html_url}`);

      return {
        success: true,
        prNumber: pr.number,
        prUrl: pr.html_url,
        branch: branchName,
        filesCreated: files.map(f => f.path),
        message: `Created PR #${pr.number}`
      };
    } catch (error) {
      console.error('[CodeGenerator] PR creation error:', error);
      return {
        success: false,
        error: `Failed to create PR: ${error.message}`
      };
    }
  }

  /**
   * Generate PR title
   */
  generatePRTitle(action, description) {
    const prefix = {
      'create-page': 'feat: Add page',
      'create-feature': 'feat: Add',
      'fix-bug': 'fix:',
      'code-task': 'feat:'
    }[action] || 'chore:';

    const shortDesc = description.length > 50
      ? description.substring(0, 47) + '...'
      : description;

    return `${prefix} ${shortDesc}`;
  }

  /**
   * Generate PR body
   */
  generatePRBody(action, description, files, projectDetails, analysis) {
    let body = `## Summary\n\n${description}\n\n`;

    if (analysis) {
      body += `## Bug Analysis\n\n`;
      body += `- **Likely Cause:** ${analysis.likelyCause}\n`;
      body += `- **Severity:** ${analysis.severity}\n`;
      body += `- **Fix:** ${analysis.suggestedFix}\n\n`;
    }

    body += `## Changes\n\n`;
    for (const file of files) {
      body += `- \`${file.path}\`\n`;
    }

    body += `\n## Project\n\n`;
    body += `- **Repository:** ${projectDetails.repo}\n`;
    body += `- **Type:** ${projectDetails.type}\n`;
    body += `- **Stack:** ${(projectDetails.stack || []).join(', ')}\n`;

    body += `\n---\n`;
    body += `*Generated by ClawdBot Code Generator*`;

    return body;
  }

  /**
   * Get supported actions
   */
  getSupportedActions() {
    return [...this.supportedActions];
  }
}

// Export singleton instance
const codeGenerator = new CodeGenerator();

module.exports = {
  CodeGenerator,
  codeGenerator,

  // Convenience methods
  execute: (action, params, context) => codeGenerator.execute(action, params, context),
  canHandle: (action) => codeGenerator.canHandle(action),
  getSupportedActions: () => codeGenerator.getSupportedActions(),

  // Direct action methods
  createPage: (project, description, projectDetails, context) =>
    codeGenerator.execute('create-page', { project, description, projectDetails }, context),

  createFeature: (project, description, projectDetails, context) =>
    codeGenerator.execute('create-feature', { project, description, projectDetails }, context),

  fixBug: (project, description, projectDetails, context) =>
    codeGenerator.execute('fix-bug', { project, description, projectDetails }, context),

  codeTask: (project, description, projectDetails, context) =>
    codeGenerator.execute('code-task', { project, description, projectDetails }, context)
};
