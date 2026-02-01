/**
 * Intent Classifier
 *
 * Uses AI to understand user intent and map to projects/actions.
 * Handles natural language like "file my taxes" → accountancy project
 */

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

class IntentClassifier {
  constructor() {
    this.claude = null;
    this.registry = null;
    this.cache = new Map();
    this.cacheMaxAge = 10 * 60 * 1000; // 10 min cache
  }

  initialize() {
    // Load Claude
    if (process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    // Load project registry
    try {
      this.registry = require('../../config/project-registry.json');
      console.log(`[IntentClassifier] Loaded ${Object.keys(this.registry.projects).length} projects`);
    } catch (err) {
      console.error('[IntentClassifier] Failed to load registry:', err.message);
      this.registry = { projects: {}, intents: {}, companies: {} };
    }

    console.log('[IntentClassifier] Initialized');
  }

  /**
   * Classify user intent from a message
   * @param {string} message - User's message (text or transcribed voice)
   * @param {Object} context - Additional context (mediaType, activeProject, etc.)
   * @returns {Object} Classification result with intent, project, confidence, tasks
   */
  async classify(message, context = {}) {
    if (!message && !context.hasMedia) {
      return this.defaultResult('empty');
    }

    // Quick pattern matching first (fast)
    const quickMatch = this.quickPatternMatch(message, context);
    if (quickMatch.confidence > 0.8) {
      console.log(`[IntentClassifier] Quick match: ${quickMatch.intent} → ${quickMatch.project}`);
      return quickMatch;
    }

    // Use AI for complex classification
    if (this.claude) {
      try {
        const aiResult = await this.aiClassify(message, context);
        if (aiResult.confidence > 0.5) {
          console.log(`[IntentClassifier] AI match: ${aiResult.intent} → ${aiResult.project}`);
          return aiResult;
        }
      } catch (err) {
        console.error('[IntentClassifier] AI classification failed:', err.message);
      }
    }

    // Return quick match even if low confidence, or default
    return quickMatch.confidence > 0 ? quickMatch : this.defaultResult('unknown');
  }

  /**
   * Quick pattern matching for common intents
   */
  quickPatternMatch(message, context = {}) {
    const msg = (message || '').toLowerCase();
    const result = {
      intent: null,
      project: null,
      company: null,
      confidence: 0,
      tasks: [],
      action: null
    };

    // Check for receipt/expense (with or without image)
    if (context.hasMedia && context.mediaType === 'image') {
      // Image attached - likely a receipt
      if (msg.includes('receipt') || msg.includes('expense') || msg.includes('paid') || msg.includes('bought') || msg === '') {
        result.intent = 'process-receipt';
        result.project = 'giquina-accountancy';
        result.action = 'process-receipt';
        result.confidence = 0.9;

        // Try to detect company
        result.company = this.detectCompany(msg);
        return result;
      }
    }

    // Check for explicit project mentions
    for (const [projectId, project] of Object.entries(this.registry.projects)) {
      for (const keyword of project.keywords || []) {
        if (msg.includes(keyword.toLowerCase())) {
          result.project = projectId;
          result.confidence = 0.7;
          break;
        }
      }
      if (result.project) break;
    }

    // Check for intent patterns
    for (const [intentId, intent] of Object.entries(this.registry.intents)) {
      for (const pattern of intent.patterns || []) {
        if (msg.includes(pattern.toLowerCase())) {
          result.intent = intentId;
          result.action = intent.action;

          // If no project yet, find one that matches this intent
          if (!result.project && intent.requiredCapability) {
            result.project = this.findProjectByCapability(intent.requiredCapability);
          } else if (!result.project && intent.projectTypes) {
            result.project = this.findProjectByType(intent.projectTypes[0]);
          }

          result.confidence = result.project ? 0.85 : 0.6;
          break;
        }
      }
      if (result.intent) break;
    }

    // Check for company mentions
    if (!result.company) {
      result.company = this.detectCompany(msg);
    }

    // If we have active project context, use it as fallback
    if (!result.project && context.activeProject) {
      result.project = context.activeProject;
      result.confidence = Math.max(result.confidence, 0.5);
    }

    return result;
  }

  /**
   * AI-powered classification for complex queries
   */
  async aiClassify(message, context = {}) {
    const projectList = Object.entries(this.registry.projects)
      .map(([id, p]) => `- ${id}: ${p.description} (capabilities: ${(p.capabilities || []).join(', ')})`)
      .join('\n');

    const companyList = Object.entries(this.registry.companies)
      .map(([code, c]) => `- ${code}: ${c.name}`)
      .join('\n');

    const prompt = `Analyze this user message and determine their intent and which project it relates to.

USER MESSAGE: "${message}"

CONTEXT:
- Has image attached: ${context.hasMedia && context.mediaType === 'image' ? 'YES' : 'NO'}
- Has audio attached: ${context.hasMedia && context.mediaType === 'audio' ? 'YES' : 'NO'}
- Active project: ${context.activeProject || 'none'}

AVAILABLE PROJECTS:
${projectList}

COMPANIES (for expenses/taxes):
${companyList}

Respond in JSON format:
{
  "intent": "create-page|create-feature|file-taxes|process-receipt|check-deadlines|deploy|check-status|general-query|code-task",
  "project": "project-id or null",
  "company": "company-code or null",
  "confidence": 0.0-1.0,
  "tasks": ["extracted task 1", "extracted task 2"],
  "summary": "brief summary of what user wants"
}

Only respond with the JSON, nothing else.`;

    const response = await this.claude.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const jsonStr = response.content[0].text.trim();
      const result = JSON.parse(jsonStr);
      return {
        intent: result.intent || 'unknown',
        project: result.project,
        company: result.company,
        confidence: result.confidence || 0.5,
        tasks: result.tasks || [],
        summary: result.summary,
        action: this.getActionForIntent(result.intent)
      };
    } catch (err) {
      console.error('[IntentClassifier] Failed to parse AI response:', err.message);
      return this.defaultResult('parse-error');
    }
  }

  /**
   * Extract multiple tasks from a long message (voice transcription)
   */
  async extractTasks(message, context = {}) {
    if (!this.claude) {
      return [{ text: message, project: context.activeProject }];
    }

    const projectList = Object.entries(this.registry.projects)
      .map(([id, p]) => `- ${id}: ${p.description}`)
      .join('\n');

    const prompt = `Extract actionable tasks from this message and assign each to the most appropriate project.

MESSAGE (possibly transcribed voice):
"${message}"

AVAILABLE PROJECTS:
${projectList}

Respond in JSON format:
{
  "summary": "brief overall summary",
  "tasks": [
    {
      "task": "what needs to be done",
      "project": "project-id",
      "priority": "high|medium|low",
      "type": "create|fix|update|check|deploy"
    }
  ]
}

Only include actual actionable tasks. If the message is just a question or greeting, return empty tasks array.
Only respond with JSON.`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const jsonStr = response.content[0].text.trim();
      const result = JSON.parse(jsonStr);
      return {
        summary: result.summary,
        tasks: result.tasks || []
      };
    } catch (err) {
      console.error('[IntentClassifier] Failed to extract tasks:', err.message);
      return {
        summary: message.substring(0, 100),
        tasks: []
      };
    }
  }

  /**
   * Detect company from message
   */
  detectCompany(message) {
    const msg = message.toLowerCase();
    for (const [code, company] of Object.entries(this.registry.companies)) {
      for (const keyword of company.keywords || []) {
        if (msg.includes(keyword.toLowerCase())) {
          return code;
        }
      }
    }
    return null;
  }

  /**
   * Find project by capability
   */
  findProjectByCapability(capability) {
    for (const [id, project] of Object.entries(this.registry.projects)) {
      if ((project.capabilities || []).includes(capability)) {
        return id;
      }
    }
    return null;
  }

  /**
   * Find project by type
   */
  findProjectByType(type) {
    // Sort by priority
    const sorted = Object.entries(this.registry.projects)
      .filter(([id, p]) => p.type === type || type === 'all')
      .sort((a, b) => (a[1].priority || 99) - (b[1].priority || 99));

    return sorted.length > 0 ? sorted[0][0] : null;
  }

  /**
   * Get action for an intent
   */
  getActionForIntent(intent) {
    const intentConfig = this.registry.intents[intent];
    return intentConfig ? intentConfig.action : null;
  }

  /**
   * Get project details
   */
  getProject(projectId) {
    return this.registry.projects[projectId] || null;
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return this.registry.projects;
  }

  /**
   * Default result
   */
  defaultResult(reason) {
    return {
      intent: 'unknown',
      project: null,
      company: null,
      confidence: 0,
      tasks: [],
      action: null,
      reason
    };
  }
}

// Singleton
const classifier = new IntentClassifier();
module.exports = classifier;
