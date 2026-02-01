/**
 * Project Intelligence - The Brain
 *
 * Orchestrates intent classification, project routing, and context management.
 * Makes ClawdBot understand which project to work on based on natural language.
 */

const intentClassifier = require('./intent-classifier');
const activeProject = require('./active-project');
const projectManager = require('./project-manager'); // Functions, not a class

class ProjectIntelligence {
  constructor() {
    this.projectManager = projectManager; // Use the exported functions directly
    this.userContexts = new Map(); // Extended context per user
  }

  initialize() {
    intentClassifier.initialize();
    console.log('[ProjectIntelligence] Initialized');
  }

  /**
   * Process a message with full intelligence
   *
   * @param {string} message - User message (text or transcribed)
   * @param {Object} context - Context including userId, media info, etc.
   * @returns {Object} Intelligence result with routing info
   */
  async process(message, context = {}) {
    const { userId } = context;

    // Get user's active project context
    const userActiveProject = activeProject.get(userId);

    // Build classification context
    const classifyContext = {
      activeProject: userActiveProject?.repo,
      hasMedia: context.numMedia > 0,
      mediaType: this.getMediaType(context.mediaContentType),
      userId
    };

    // Classify intent
    const classification = await intentClassifier.classify(message, classifyContext);

    // If we identified a project, get its full details
    let projectDetails = null;
    if (classification.project) {
      projectDetails = intentClassifier.getProject(classification.project);

      // Auto-switch active project if high confidence
      if (classification.confidence > 0.7 && projectDetails) {
        activeProject.set(userId, {
          repo: projectDetails.repo,
          name: classification.project,
          type: projectDetails.type
        });
      }
    }

    // Build the intelligence result
    const result = {
      // Classification results
      intent: classification.intent,
      confidence: classification.confidence,
      tasks: classification.tasks,
      summary: classification.summary,

      // Project routing
      project: classification.project,
      projectDetails: projectDetails,
      projectRepo: projectDetails?.repo || null,

      // Company (for accountancy)
      company: classification.company,

      // Action to take
      action: classification.action,

      // Context for AI
      aiContext: this.buildAIContext(classification, projectDetails, context),

      // Suggested skill/command
      suggestedSkill: this.suggestSkill(classification),

      // Whether this needs confirmation
      needsConfirmation: this.needsConfirmation(classification)
    };

    console.log(`[ProjectIntelligence] Processed: intent=${result.intent}, project=${result.project}, confidence=${result.confidence}`);

    return result;
  }

  /**
   * Process a long voice message - extract multiple tasks
   */
  async processVoiceTranscript(transcript, context = {}) {
    const { userId } = context;

    // Extract tasks from the transcript
    const extraction = await intentClassifier.extractTasks(transcript, {
      activeProject: activeProject.get(userId)?.repo
    });

    // Process each task
    const processedTasks = [];
    for (const task of extraction.tasks || []) {
      const projectDetails = intentClassifier.getProject(task.project);
      processedTasks.push({
        ...task,
        projectDetails,
        projectRepo: projectDetails?.repo
      });
    }

    return {
      summary: extraction.summary,
      tasks: processedTasks,
      taskCount: processedTasks.length,

      // Group by project
      byProject: this.groupTasksByProject(processedTasks),

      // AI context for follow-up
      aiContext: this.buildMultiTaskContext(processedTasks, context)
    };
  }

  /**
   * Get media type from content type
   */
  getMediaType(contentType) {
    if (!contentType) return null;
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.includes('pdf') || contentType.includes('document')) return 'document';
    return 'other';
  }

  /**
   * Build AI context for intelligent responses
   */
  buildAIContext(classification, projectDetails, context) {
    const parts = [];

    if (projectDetails) {
      parts.push(`Active Project: ${classification.project}`);
      parts.push(`Repository: ${projectDetails.repo}`);
      parts.push(`Type: ${projectDetails.type}`);
      parts.push(`Tech Stack: ${(projectDetails.stack || []).join(', ')}`);
      parts.push(`Capabilities: ${(projectDetails.capabilities || []).join(', ')}`);
    }

    if (classification.company) {
      const companyInfo = intentClassifier.registry.companies[classification.company];
      if (companyInfo) {
        parts.push(`Company: ${companyInfo.name} (${classification.company})`);
        parts.push(`Company Number: ${companyInfo.number}`);
      }
    }

    if (classification.intent) {
      parts.push(`Detected Intent: ${classification.intent}`);
    }

    if (classification.tasks && classification.tasks.length > 0) {
      parts.push(`Extracted Tasks: ${classification.tasks.join('; ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Build context for multiple tasks
   */
  buildMultiTaskContext(tasks, context) {
    if (tasks.length === 0) return '';

    const parts = ['Multiple tasks extracted from voice message:'];

    const byProject = this.groupTasksByProject(tasks);
    for (const [project, projectTasks] of Object.entries(byProject)) {
      parts.push(`\n${project}:`);
      for (const task of projectTasks) {
        parts.push(`  - [${task.priority}] ${task.task}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Group tasks by project
   */
  groupTasksByProject(tasks) {
    const grouped = {};
    for (const task of tasks) {
      const project = task.project || 'unassigned';
      if (!grouped[project]) {
        grouped[project] = [];
      }
      grouped[project].push(task);
    }
    return grouped;
  }

  /**
   * Suggest which skill should handle this
   */
  suggestSkill(classification) {
    const intentToSkill = {
      'process-receipt': 'receipts',
      'file-taxes': 'deadlines',
      'check-deadlines': 'deadlines',
      'deploy': 'remote-exec',
      'check-status': 'project-context',
      'create-page': 'coder',
      'create-feature': 'coder',
      'code-task': 'coder'
    };

    return intentToSkill[classification.intent] || null;
  }

  /**
   * Check if action needs user confirmation
   */
  needsConfirmation(classification) {
    const confirmRequired = ['deploy', 'file-taxes', 'create-page', 'create-feature'];
    return confirmRequired.includes(classification.intent) && classification.confidence < 0.9;
  }

  /**
   * Get project summary for a user
   */
  async getProjectSummary(projectId) {
    const project = intentClassifier.getProject(projectId);
    if (!project) return null;

    // Fetch TODO if available
    let todos = null;
    try {
      const todoParser = require('./todo-parser');
      const todoContent = await this.projectManager.getFile(project.repo, 'TODO.md');
      if (todoContent) {
        todos = todoParser.parse(todoContent);
      }
    } catch (err) {
      // No TODO or error fetching
    }

    return {
      ...project,
      id: projectId,
      todos: todos?.incomplete || [],
      todoCount: todos?.incomplete?.length || 0
    };
  }

  /**
   * Get all projects with their status
   */
  async getAllProjectsStatus() {
    const projects = intentClassifier.getAllProjects();
    const summaries = [];

    for (const [id, project] of Object.entries(projects)) {
      summaries.push({
        id,
        name: id,
        type: project.type,
        repo: project.repo,
        description: project.description
      });
    }

    // Sort by priority
    return summaries.sort((a, b) => {
      const pA = projects[a.id]?.priority || 99;
      const pB = projects[b.id]?.priority || 99;
      return pA - pB;
    });
  }

  /**
   * Find the best project for an action
   */
  findBestProject(action, keywords = []) {
    const projects = intentClassifier.getAllProjects();

    // Score each project
    let bestProject = null;
    let bestScore = 0;

    for (const [id, project] of Object.entries(projects)) {
      let score = 0;

      // Check capabilities
      if (project.capabilities?.includes(action)) {
        score += 10;
      }

      // Check keywords
      for (const keyword of keywords) {
        if (project.keywords?.some(k => k.toLowerCase().includes(keyword.toLowerCase()))) {
          score += 5;
        }
      }

      // Priority bonus
      score += (10 - (project.priority || 5));

      if (score > bestScore) {
        bestScore = score;
        bestProject = { id, ...project };
      }
    }

    return bestProject;
  }
}

// Singleton
const intelligence = new ProjectIntelligence();
module.exports = intelligence;
