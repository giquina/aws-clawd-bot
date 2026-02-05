/**
 * SuperDesign Skill - AI-powered design system for ClawdBot
 *
 * Integrates @superdesign/cli for automated design system generation and UI component
 * creation. Uses AI to analyze repositories and generate production-ready design tokens,
 * components, and documentation.
 *
 * Commands:
 *   superdesign init                  - Initialize SuperDesign for current repo
 *   superdesign help                  - Show SuperDesign commands and usage
 *   help me design                    - Get design assistance
 *   design <description>              - Start design workflow for a feature
 *
 * Voice Support:
 *   "help me design a login page"
 *   "initialize SuperDesign for JUDO"
 *   "design a dashboard layout"
 *
 * Features:
 *   - Auto-detects repo from chat context
 *   - Installs and configures @superdesign/cli automatically
 *   - Verifies user authentication status
 *   - Progress updates via status-messenger
 *   - Integration with remote-exec for execution
 *
 * Requirements:
 *   - Node.js and npm installed on EC2
 *   - Repository must be cloned under /opt/projects/ or /opt/clawd-bot
 *   - SuperDesign API credentials (configured via CLI login)
 *
 * @module skills/superdesign
 */

const BaseSkill = require('../base-skill');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const chatRegistry = require('../../lib/chat-registry');
const statusMessenger = require('../../lib/status-messenger');

const execAsync = promisify(exec);

// Repo path mappings (EC2)
const REPO_PATHS = {
  'aws-clawd-bot': '/opt/clawd-bot',
  'clawd-bot': '/opt/clawd-bot',
  'judo': '/opt/projects/JUDO',
  'lusotown': '/opt/projects/LusoTown',
  'armora': '/opt/projects/armora',
  'gqcars-manager': '/opt/projects/gqcars-manager',
  'gq-cars-driver-app': '/opt/projects/gq-cars-driver-app',
  'giquina-accountancy-direct-filing': '/opt/projects/giquina-accountancy-direct-filing',
  'giquina-accountancy': '/opt/projects/giquina-accountancy-direct-filing',
  'giquina-website': '/opt/projects/giquina-website',
  'gq-cars': '/opt/projects/gq-cars',
  'giquina-portal': '/opt/projects/giquina-portal',
  'moltbook': '/opt/projects/moltbook',
};

class SuperDesignSkill extends BaseSkill {
  name = 'superdesign';
  description = 'AI-powered design system generation and UI component creation';
  priority = 25; // Higher than generic commands, lower than critical skills

  commands = [
    {
      pattern: /^superdesign\s+init$/i,
      description: 'Initialize SuperDesign for current repository',
      usage: 'superdesign init'
    },
    {
      pattern: /^superdesign\s+help$/i,
      description: 'Show SuperDesign commands and usage',
      usage: 'superdesign help'
    },
    {
      pattern: /^help\s+me\s+design/i,
      description: 'Get AI-powered design assistance',
      usage: 'help me design <what you need>'
    },
    {
      pattern: /^design\s+/i,
      description: 'Start design workflow for a feature',
      usage: 'design <description>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.isEC2 = process.platform === 'linux';
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const lowerCommand = raw.toLowerCase();

    try {
      // SuperDesign init
      if (/^superdesign\s+init$/i.test(lowerCommand)) {
        return await this.handleInit(context);
      }

      // SuperDesign help
      if (/^superdesign\s+help$/i.test(lowerCommand)) {
        return this.handleHelp();
      }

      // Help me design
      if (/^help\s+me\s+design/i.test(lowerCommand)) {
        const match = lowerCommand.match(/^help\s+me\s+design\s+(.+)/i);
        const description = match ? match[1].trim() : null;
        return await this.handleDesignWorkflow(description, context);
      }

      // Design workflow
      if (/^design\s+/i.test(lowerCommand)) {
        const match = lowerCommand.match(/^design\s+(.+)/i);
        const description = match ? match[1].trim() : null;
        return await this.handleDesignWorkflow(description, context);
      }

      return this.error('Unknown SuperDesign command. Try: superdesign help');

    } catch (err) {
      this.log('error', 'SuperDesign error', err);
      return this.error(
        'SuperDesign command failed',
        err,
        {
          attempted: raw,
          suggestion: 'Try: superdesign help for available commands'
        }
      );
    }
  }

  // ============ Command Handlers ============

  /**
   * Initialize SuperDesign for current repository
   */
  async handleInit(context) {
    const repo = this.getRepoFromContext(context);

    if (!repo) {
      return this.error(
        'No repository context',
        'Could not determine which repository to initialize',
        {
          suggestion: 'Try running this command from a registered Telegram group, or specify the repo: superdesign init judo'
        }
      );
    }

    const repoPath = this.getRepoPath(repo);
    if (!repoPath) {
      return this.error(
        `Unknown repository: ${repo}`,
        `Repository '${repo}' is not configured`,
        {
          suggestion: `Available repos: ${Object.keys(REPO_PATHS).join(', ')}`
        }
      );
    }

    this.log('info', `Initializing SuperDesign for ${repo} at ${repoPath}`);

    try {
      // Send "starting work" message
      const startMsg = statusMessenger.startingWork(
        'initializing SuperDesign',
        [
          'Checking SuperDesign CLI installation',
          'Verifying authentication',
          'Analyzing repository structure',
          'Generating design system configuration'
        ],
        '2-5 minutes'
      );

      // Send via context if available (Telegram/WhatsApp handler)
      if (context.sendMessage) {
        await context.sendMessage(startMsg);
      }

      // Step 1: Ensure CLI is installed
      await this.ensureCLI(context);

      // Step 2: Check login status
      const isLoggedIn = await this.checkLogin();
      if (!isLoggedIn) {
        return this.error(
          'SuperDesign not authenticated',
          'You need to login to SuperDesign first',
          {
            attempted: 'Checking authentication status',
            suggestion: 'Run: npx @superdesign/cli login (on your local machine or EC2)'
          }
        );
      }

      // Step 3: Run SuperDesign init
      const result = await this.executeCommand(
        'npx @superdesign/cli init',
        repoPath,
        180000 // 3 minutes timeout
      );

      if (!result.success) {
        return this.error(
          `SuperDesign init failed for ${repo}`,
          result.error,
          {
            attempted: `Running 'npx @superdesign/cli init' in ${repoPath}`,
            suggestion: 'Check repository structure and try again'
          }
        );
      }

      // Success response
      const completeMsg = statusMessenger.complete(
        `SuperDesign initialized for ${repo}`,
        {
          nextSteps: 'You can now use design commands like:\n• design a login page\n• design a dashboard layout\n• superdesign help'
        }
      );

      return this.success(
        completeMsg,
        {
          repo,
          repoPath,
          output: this.truncateOutput(result.output, 1000)
        },
        {
          time: '2-5 min'
        }
      );

    } catch (error) {
      this.log('error', 'SuperDesign init failed', error);
      return this.error(
        `Failed to initialize SuperDesign for ${repo}`,
        error,
        {
          attempted: `Installing and configuring SuperDesign in ${repoPath}`,
          suggestion: 'Check EC2 logs and repository permissions'
        }
      );
    }
  }

  /**
   * Show SuperDesign help
   */
  handleHelp() {
    let response = '🎨 **SuperDesign - AI Design System**\n';
    response += '━━━━━━━━━━━━━━━━━━━━\n\n';
    response += 'SuperDesign uses AI to generate production-ready design systems, ';
    response += 'UI components, and documentation for your projects.\n\n';

    response += '**Commands:**\n';
    response += '• `superdesign init` - Initialize for current repo\n';
    response += '• `design <description>` - Generate UI components\n';
    response += '• `help me design <what>` - Get design assistance\n';
    response += '• `superdesign help` - Show this help\n\n';

    response += '**Examples:**\n';
    response += '• "design a login page with email and password"\n';
    response += '• "help me design a dashboard layout"\n';
    response += '• "design a responsive navbar"\n\n';

    response += '**Features:**\n';
    response += '✨ AI-powered component generation\n';
    response += '🎨 Automatic design token extraction\n';
    response += '📦 Production-ready React/Vue/Svelte components\n';
    response += '📚 Comprehensive documentation\n';
    response += '🔄 Version-controlled design system\n\n';

    response += '**Requirements:**\n';
    response += '• Repository must be initialized: `superdesign init`\n';
    response += '• Authentication required (first-time setup)\n';
    response += '• Node.js and npm installed\n\n';

    response += '**Voice Support:**\n';
    response += 'You can also use voice commands like:\n';
    response += '• "Initialize SuperDesign for JUDO"\n';
    response += '• "Help me design a login page"\n';
    response += '• "Design a dashboard layout"';

    return this.success(response);
  }

  /**
   * Handle design workflow
   */
  async handleDesignWorkflow(description, context) {
    if (!description) {
      return this.error(
        'Missing design description',
        'Please describe what you want to design',
        {
          suggestion: 'Try: design a login page with email and password'
        }
      );
    }

    const repo = this.getRepoFromContext(context);

    if (!repo) {
      return this.error(
        'No repository context',
        'Could not determine which repository to design for',
        {
          suggestion: 'Try running this command from a registered Telegram group'
        }
      );
    }

    const repoPath = this.getRepoPath(repo);
    if (!repoPath) {
      return this.error(
        `Unknown repository: ${repo}`,
        `Repository '${repo}' is not configured`,
        {
          suggestion: `Available repos: ${Object.keys(REPO_PATHS).join(', ')}`
        }
      );
    }

    this.log('info', `Starting design workflow for ${repo}: ${description}`);

    try {
      // Send "starting work" message
      const startMsg = statusMessenger.startingWork(
        `designing "${description}" for ${repo}`,
        [
          'Analyzing design requirements',
          'Generating component structure',
          'Creating design tokens',
          'Writing documentation'
        ],
        '3-10 minutes'
      );

      if (context.sendMessage) {
        await context.sendMessage(startMsg);
      }

      // Ensure CLI is installed
      await this.ensureCLI(context);

      // Check login
      const isLoggedIn = await this.checkLogin();
      if (!isLoggedIn) {
        return this.error(
          'SuperDesign not authenticated',
          'You need to login to SuperDesign first',
          {
            suggestion: 'Run: npx @superdesign/cli login'
          }
        );
      }

      // Run SuperDesign generate command
      const escapedDescription = description.replace(/"/g, '\\"');
      const cmd = `npx @superdesign/cli generate --prompt "${escapedDescription}"`;

      const result = await this.executeCommand(
        cmd,
        repoPath,
        600000 // 10 minutes timeout
      );

      if (!result.success) {
        return this.error(
          `Design generation failed for ${repo}`,
          result.error,
          {
            attempted: `Generating design for: ${description}`,
            suggestion: 'Try simplifying your description or check repository configuration'
          }
        );
      }

      // Success response
      const completeMsg = statusMessenger.complete(
        `Design generated for "${description}" in ${repo}`,
        {
          nextSteps: 'Review the generated components and commit to your repository:\n• git status\n• git add .\n• git commit -m "feat: add generated design components"'
        }
      );

      return this.success(
        completeMsg,
        {
          repo,
          description,
          output: this.truncateOutput(result.output, 1500)
        },
        {
          time: '3-10 min'
        }
      );

    } catch (error) {
      this.log('error', 'Design workflow failed', error);
      return this.error(
        `Failed to generate design for ${repo}`,
        error,
        {
          attempted: `Generating design: ${description}`,
          suggestion: 'Check EC2 logs and try again with a simpler description'
        }
      );
    }
  }

  // ============ Helper Methods ============

  /**
   * Ensure SuperDesign CLI is installed
   */
  async ensureCLI(context) {
    this.log('info', 'Checking SuperDesign CLI installation');

    try {
      // Check if @superdesign/cli is available
      const checkResult = await this.executeCommand(
        'npx @superdesign/cli --version',
        '/tmp',
        10000
      );

      if (checkResult.success) {
        this.log('info', 'SuperDesign CLI is installed');
        return true;
      }

      // Not installed, install it globally
      this.log('info', 'Installing SuperDesign CLI...');

      if (context.sendMessage) {
        await context.sendMessage('📦 Installing SuperDesign CLI (first-time setup)...');
      }

      const installResult = await this.executeCommand(
        'npm install -g @superdesign/cli',
        '/tmp',
        120000 // 2 minutes
      );

      if (!installResult.success) {
        throw new Error(`Failed to install SuperDesign CLI: ${installResult.error}`);
      }

      this.log('info', 'SuperDesign CLI installed successfully');
      return true;

    } catch (error) {
      this.log('error', 'Failed to ensure CLI installation', error);
      throw new Error(`Could not install SuperDesign CLI: ${error.message}`);
    }
  }

  /**
   * Check if user is logged in to SuperDesign
   */
  async checkLogin() {
    this.log('info', 'Checking SuperDesign login status');

    try {
      const result = await this.executeCommand(
        'npx @superdesign/cli whoami',
        '/tmp',
        10000
      );

      // If whoami succeeds, user is logged in
      if (result.success && !result.output.includes('not logged in')) {
        this.log('info', 'User is logged in to SuperDesign');
        return true;
      }

      this.log('warn', 'User is not logged in to SuperDesign');
      return false;

    } catch (error) {
      this.log('error', 'Failed to check login status', error);
      return false;
    }
  }

  /**
   * Get repository from context (chat registry or activeProject)
   */
  getRepoFromContext(context) {
    // Try chat registry first (auto-repo from Telegram groups)
    if (context?.chatId) {
      const chatContext = chatRegistry.getContext(context.chatId);
      if (chatContext?.type === 'repo' && chatContext.value) {
        return chatContext.value;
      }
    }

    // Fall back to autoRepo or activeProject
    if (context?.autoRepo) {
      return context.autoRepo;
    }

    if (context?.activeProject) {
      // activeProject can be "owner/repo" or just "repo"
      const parts = String(context.activeProject).split('/');
      return parts[parts.length - 1];
    }

    return null;
  }

  /**
   * Get EC2 path for a repository
   */
  getRepoPath(repoName) {
    if (!repoName) return null;
    const normalized = repoName.toLowerCase();
    return REPO_PATHS[normalized] || null;
  }

  /**
   * Execute a command with timeout (EC2 only)
   */
  async executeCommand(command, cwd, timeout = 30000) {
    // On non-EC2 (Windows dev), simulate success
    if (!this.isEC2) {
      this.log('warn', `[DEV MODE] Would execute: ${command} in ${cwd}`);
      return {
        success: true,
        output: `[DEV MODE] Simulated execution of: ${command}`,
        simulated: true
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      return {
        success: true,
        output: stdout || stderr || 'Command completed successfully'
      };
    } catch (err) {
      // Check if it's a timeout
      if (err.killed) {
        return {
          success: false,
          error: `Command timed out after ${timeout / 1000}s`
        };
      }

      return {
        success: false,
        error: err.stderr || err.stdout || err.message
      };
    }
  }

  /**
   * Truncate output for messaging platforms
   */
  truncateOutput(output, maxLength = 2000) {
    if (!output) return '';

    // Remove ANSI color codes
    const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '');

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Keep start and end
    const halfLength = Math.floor(maxLength / 2) - 20;
    return (
      cleaned.substring(0, halfLength) +
      '\n\n... truncated ...\n\n' +
      cleaned.substring(cleaned.length - halfLength)
    );
  }
}

module.exports = SuperDesignSkill;
