/**
 * Action Executor
 *
 * Takes classified intents from Project Intelligence and EXECUTES them.
 * Has a registry of action handlers for different intent types.
 *
 * Supported actions:
 *   - create-page: Creates a new page/component in a web project
 *   - create-feature: Creates a new feature
 *   - process-receipt: Processes an expense receipt
 *   - deploy: Deploys a project
 *   - check-status: Checks project status
 *   - create-task: Creates a GitHub issue
 *   - code-task: Generic code task
 */

const projectManager = require('./project-manager');
const commandWhitelist = require('./command-whitelist');

/**
 * @typedef {Object} ActionResult
 * @property {boolean} success - Whether the action succeeded
 * @property {string} action - The action that was executed
 * @property {string} message - Human-readable result message
 * @property {Object} [data] - Any data produced by the action
 * @property {boolean} [needsConfirmation] - If true, action needs user confirmation
 * @property {string} [confirmationPrompt] - The prompt to show user for confirmation
 * @property {Error} [error] - Error if action failed
 */

/**
 * @typedef {Object} ActionContext
 * @property {string} userId - User ID
 * @property {string} [projectId] - Project ID from registry
 * @property {Object} [projectDetails] - Full project details from registry
 * @property {string} [projectRepo] - Repository path (e.g., "giquina/aws-clawd-bot")
 * @property {string} [company] - Company code (for accountancy)
 * @property {number} [confidence] - Classification confidence
 * @property {string} [mediaUrl] - URL of attached media
 * @property {string} [mediaType] - Type of media (image, audio, etc.)
 */

/**
 * @typedef {Function} ActionHandler
 * @param {Object} params - Action parameters
 * @param {ActionContext} context - Execution context
 * @returns {Promise<ActionResult>}
 */

class ActionExecutor {
  constructor() {
    /** @type {Map<string, ActionHandler>} */
    this.handlers = new Map();

    /** @type {Map<string, Object>} */
    this.pendingConfirmations = new Map(); // userId -> pending action

    /** @type {Set<string>} */
    this.actionsRequiringConfirmation = new Set([
      'deploy',
      'create-page',
      'create-feature',
      'create-task',
      'code-task'
    ]);

    this.registerDefaultHandlers();
    console.log('[ActionExecutor] Initialized with default handlers');
  }

  /**
   * Initialize the executor
   */
  initialize() {
    console.log('[ActionExecutor] Ready');
  }

  /**
   * Register default action handlers
   */
  registerDefaultHandlers() {
    // Create Page Handler
    this.registerHandler('create-page', async (params, context) => {
      const { pageName, pageType = 'page', route } = params;

      if (!pageName) {
        return this.errorResult('create-page', 'Page name is required');
      }

      if (!context.projectRepo) {
        return this.errorResult('create-page', 'No project specified for page creation');
      }

      // Check project type supports pages
      const supportedTypes = ['web-app', 'mobile-app'];
      if (context.projectDetails && !supportedTypes.includes(context.projectDetails.type)) {
        return this.errorResult('create-page',
          `Project type "${context.projectDetails.type}" does not support page creation`);
      }

      // Build the page creation task
      const task = {
        type: 'create-page',
        pageName,
        pageType,
        route: route || `/${pageName.toLowerCase()}`,
        projectRepo: context.projectRepo,
        stack: context.projectDetails?.stack || []
      };

      return {
        success: true,
        action: 'create-page',
        message: `Ready to create ${pageType} "${pageName}" at route ${task.route}`,
        data: task,
        needsConfirmation: this.needsConfirmation('create-page', context),
        confirmationPrompt: `Create a new ${pageType} called "${pageName}" in ${context.projectId || context.projectRepo}?`
      };
    });

    // Create Feature Handler
    this.registerHandler('create-feature', async (params, context) => {
      const { featureName, description } = params;

      if (!featureName) {
        return this.errorResult('create-feature', 'Feature name is required');
      }

      if (!context.projectRepo) {
        return this.errorResult('create-feature', 'No project specified for feature creation');
      }

      const task = {
        type: 'create-feature',
        featureName,
        description: description || `Implement ${featureName} feature`,
        projectRepo: context.projectRepo,
        stack: context.projectDetails?.stack || []
      };

      return {
        success: true,
        action: 'create-feature',
        message: `Ready to create feature "${featureName}"`,
        data: task,
        needsConfirmation: this.needsConfirmation('create-feature', context),
        confirmationPrompt: `Create feature "${featureName}" in ${context.projectId || context.projectRepo}?\n\n${description || ''}`
      };
    });

    // Process Receipt Handler
    this.registerHandler('process-receipt', async (params, context) => {
      const { imageUrl, company } = params;

      if (!imageUrl && !context.mediaUrl) {
        return this.errorResult('process-receipt', 'No receipt image provided');
      }

      // Receipt processing is handled by the receipts skill
      // This handler prepares the context for skill routing
      return {
        success: true,
        action: 'process-receipt',
        message: 'Receipt ready for processing',
        data: {
          imageUrl: imageUrl || context.mediaUrl,
          company: company || context.company,
          suggestedSkill: 'receipts'
        },
        needsConfirmation: false // Receipts have their own confirm flow
      };
    });

    // Deploy Handler
    this.registerHandler('deploy', async (params, context) => {
      const { projectName, environment = 'production' } = params;

      const targetProject = projectName || context.projectId;

      if (!targetProject) {
        return this.errorResult('deploy', 'No project specified for deployment');
      }

      // Check if project is known for deployment
      const projectPath = commandWhitelist.getProjectPath(targetProject);
      if (!projectPath.valid) {
        return this.errorResult('deploy',
          `Unknown deployment target: ${targetProject}. Known projects: ${projectPath.knownProjects?.join(', ')}`);
      }

      const task = {
        type: 'deploy',
        project: projectPath.matched || targetProject,
        path: projectPath.path,
        environment,
        commands: ['git pull', 'npm ci', 'pm2 restart']
      };

      return {
        success: true,
        action: 'deploy',
        message: `Ready to deploy ${task.project} to ${environment}`,
        data: task,
        needsConfirmation: true, // Always confirm deployments
        confirmationPrompt: `Deploy ${task.project} to ${environment}?\n\nThis will:\n1. Pull latest code\n2. Install dependencies\n3. Restart the service`
      };
    });

    // Check Status Handler
    this.registerHandler('check-status', async (params, context) => {
      const { projectName } = params;
      const targetProject = projectName || context.projectId;

      if (!targetProject && !context.projectRepo) {
        return this.errorResult('check-status', 'No project specified');
      }

      try {
        // Parse repo path
        const repoPath = context.projectRepo || `giquina/${targetProject}`;
        const [owner, repo] = repoPath.split('/');

        // Fetch TODO.md for status
        const todoContent = await projectManager.fetchTodoMd(owner, repo);

        let statusInfo = {
          project: targetProject || repo,
          repo: repoPath,
          hasTodo: !!todoContent
        };

        if (todoContent) {
          // Parse TODO content (basic parsing)
          const lines = todoContent.split('\n');
          const incomplete = lines.filter(l =>
            l.match(/^[-*]\s*\[\s*\]/) ||
            l.includes('⬜') ||
            l.includes('🟡')
          );
          const complete = lines.filter(l =>
            l.match(/^[-*]\s*\[x\]/i) ||
            l.includes('✅')
          );

          statusInfo.tasks = {
            incomplete: incomplete.length,
            complete: complete.length,
            total: incomplete.length + complete.length,
            items: incomplete.slice(0, 5).map(l => l.replace(/^[-*]\s*\[\s*\]/, '').replace('⬜', '').replace('🟡', '').trim())
          };
        }

        return {
          success: true,
          action: 'check-status',
          message: this.formatStatusMessage(statusInfo),
          data: statusInfo,
          needsConfirmation: false
        };
      } catch (error) {
        console.error('[ActionExecutor] check-status error:', error);
        return this.errorResult('check-status', `Failed to check status: ${error.message}`);
      }
    });

    // Create Task Handler (GitHub Issue)
    this.registerHandler('create-task', async (params, context) => {
      const { title, body, labels = [] } = params;

      if (!title) {
        return this.errorResult('create-task', 'Task title is required');
      }

      if (!context.projectRepo) {
        return this.errorResult('create-task', 'No project specified for task creation');
      }

      const task = {
        type: 'github-issue',
        title,
        body: body || '',
        labels,
        repo: context.projectRepo
      };

      return {
        success: true,
        action: 'create-task',
        message: `Ready to create GitHub issue: "${title}"`,
        data: task,
        needsConfirmation: this.needsConfirmation('create-task', context),
        confirmationPrompt: `Create GitHub issue in ${context.projectRepo}?\n\nTitle: ${title}\n${body ? `\nDescription: ${body.substring(0, 100)}...` : ''}`
      };
    });

    // Code Task Handler (Generic)
    this.registerHandler('code-task', async (params, context) => {
      const { task, description, files = [] } = params;

      if (!task) {
        return this.errorResult('code-task', 'Task description is required');
      }

      if (!context.projectRepo) {
        return this.errorResult('code-task', 'No project specified');
      }

      const codeTask = {
        type: 'code-task',
        task,
        description: description || task,
        files,
        projectRepo: context.projectRepo,
        stack: context.projectDetails?.stack || []
      };

      return {
        success: true,
        action: 'code-task',
        message: `Ready to execute code task: "${task}"`,
        data: codeTask,
        needsConfirmation: this.needsConfirmation('code-task', context),
        confirmationPrompt: `Execute coding task in ${context.projectId || context.projectRepo}?\n\nTask: ${task}`
      };
    });

    console.log(`[ActionExecutor] Registered ${this.handlers.size} default handlers`);
  }

  /**
   * Register a new action handler
   * @param {string} actionName - Name of the action
   * @param {ActionHandler} handler - Handler function
   */
  registerHandler(actionName, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for ${actionName} must be a function`);
    }
    this.handlers.set(actionName, handler);
    console.log(`[ActionExecutor] Registered handler: ${actionName}`);
  }

  /**
   * Check if an action needs confirmation
   * @param {string} action - Action name
   * @param {ActionContext} context - Execution context
   * @returns {boolean}
   */
  needsConfirmation(action, context = {}) {
    // High confidence (>0.9) can skip confirmation for non-critical actions
    if (context.confidence && context.confidence >= 0.9) {
      const criticalActions = ['deploy'];
      if (!criticalActions.includes(action)) {
        return false;
      }
    }

    return this.actionsRequiringConfirmation.has(action);
  }

  /**
   * Execute an action
   * @param {string} action - Action name
   * @param {Object} params - Action parameters
   * @param {ActionContext} context - Execution context
   * @returns {Promise<ActionResult>}
   */
  async execute(action, params = {}, context = {}) {
    console.log(`[ActionExecutor] Executing action: ${action}`);

    // Check for handler
    const handler = this.handlers.get(action);
    if (!handler) {
      console.log(`[ActionExecutor] No handler for action: ${action}`);
      return this.errorResult(action, `Unknown action: ${action}. Available actions: ${Array.from(this.handlers.keys()).join(', ')}`);
    }

    try {
      // Execute the handler
      const result = await handler(params, context);

      // If confirmation needed, store for later
      if (result.needsConfirmation && context.userId) {
        this.pendingConfirmations.set(context.userId, {
          action,
          params,
          context,
          result,
          createdAt: Date.now()
        });
        console.log(`[ActionExecutor] Stored pending confirmation for user ${context.userId}`);
      }

      return result;
    } catch (error) {
      console.error(`[ActionExecutor] Handler error for ${action}:`, error);
      return this.errorResult(action, `Action failed: ${error.message}`, error);
    }
  }

  /**
   * Confirm a pending action
   * @param {string} userId - User ID
   * @returns {Promise<ActionResult>}
   */
  async confirmPendingAction(userId) {
    const pending = this.pendingConfirmations.get(userId);

    if (!pending) {
      return this.errorResult('confirm', 'No pending action to confirm');
    }

    // Check if expired (10 minute timeout)
    const age = Date.now() - pending.createdAt;
    if (age > 10 * 60 * 1000) {
      this.pendingConfirmations.delete(userId);
      return this.errorResult('confirm', 'Pending action expired. Please try again.');
    }

    // Clear pending
    this.pendingConfirmations.delete(userId);

    // Execute the confirmed action
    console.log(`[ActionExecutor] Executing confirmed action: ${pending.action}`);

    // Mark as confirmed
    const confirmedContext = {
      ...pending.context,
      confirmed: true,
      confidence: 1.0 // Force high confidence since user confirmed
    };

    // Re-execute without confirmation requirement
    return this.executeConfirmed(pending.action, pending.params, confirmedContext);
  }

  /**
   * Execute a confirmed action (skips confirmation check)
   * @param {string} action - Action name
   * @param {Object} params - Action parameters
   * @param {ActionContext} context - Execution context
   * @returns {Promise<ActionResult>}
   */
  async executeConfirmed(action, params, context) {
    const handler = this.handlers.get(action);
    if (!handler) {
      return this.errorResult(action, `Unknown action: ${action}`);
    }

    try {
      const result = await handler(params, context);
      // Override confirmation requirement since already confirmed
      result.needsConfirmation = false;
      result.confirmed = true;
      return result;
    } catch (error) {
      console.error(`[ActionExecutor] Confirmed action error for ${action}:`, error);
      return this.errorResult(action, `Action failed: ${error.message}`, error);
    }
  }

  /**
   * Reject a pending action
   * @param {string} userId - User ID
   * @returns {ActionResult}
   */
  rejectPendingAction(userId) {
    const pending = this.pendingConfirmations.get(userId);

    if (!pending) {
      return this.errorResult('reject', 'No pending action to reject');
    }

    this.pendingConfirmations.delete(userId);

    return {
      success: true,
      action: 'reject',
      message: `Cancelled pending ${pending.action} action`,
      data: { cancelledAction: pending.action }
    };
  }

  /**
   * Check if user has a pending confirmation
   * @param {string} userId - User ID
   * @returns {Object|null}
   */
  getPendingConfirmation(userId) {
    const pending = this.pendingConfirmations.get(userId);
    if (!pending) return null;

    // Check if expired
    const age = Date.now() - pending.createdAt;
    if (age > 10 * 60 * 1000) {
      this.pendingConfirmations.delete(userId);
      return null;
    }

    return pending;
  }

  /**
   * Get list of available actions
   * @returns {string[]}
   */
  getAvailableActions() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Format status message for check-status result
   * @param {Object} statusInfo - Status information
   * @returns {string}
   */
  formatStatusMessage(statusInfo) {
    let msg = `*${statusInfo.project}* Status\n`;
    msg += `Repository: ${statusInfo.repo}\n\n`;

    if (statusInfo.tasks) {
      const { tasks } = statusInfo;
      msg += `Tasks: ${tasks.complete}/${tasks.total} complete\n`;

      if (tasks.incomplete > 0) {
        msg += `\n*Remaining (${tasks.incomplete}):*\n`;
        for (const item of tasks.items) {
          msg += `- ${item}\n`;
        }
        if (tasks.incomplete > 5) {
          msg += `... and ${tasks.incomplete - 5} more\n`;
        }
      } else {
        msg += `\nAll tasks complete!\n`;
      }
    } else {
      msg += `No TODO.md found in repository.\n`;
    }

    return msg;
  }

  /**
   * Create an error result
   * @param {string} action - Action name
   * @param {string} message - Error message
   * @param {Error} [error] - Optional error object
   * @returns {ActionResult}
   */
  errorResult(action, message, error = null) {
    return {
      success: false,
      action,
      message,
      error,
      needsConfirmation: false
    };
  }

  /**
   * Clean up expired pending confirmations
   */
  cleanupExpiredConfirmations() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes

    for (const [userId, pending] of this.pendingConfirmations.entries()) {
      if (now - pending.createdAt > timeout) {
        this.pendingConfirmations.delete(userId);
        console.log(`[ActionExecutor] Cleaned up expired confirmation for user ${userId}`);
      }
    }
  }
}

// Singleton instance
const executor = new ActionExecutor();

// Run cleanup every 5 minutes
setInterval(() => executor.cleanupExpiredConfirmations(), 5 * 60 * 1000);

module.exports = executor;
