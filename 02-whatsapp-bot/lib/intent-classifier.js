/**
 * Intent Classifier v2.0
 *
 * Enhanced AI-powered intent classification with:
 * - Confidence scoring (0.0 to 1.0) with breakdown factors
 * - Ambiguity detection and clarifying questions
 * - Risk assessment integration
 * - Learning from user corrections
 * - Alternative interpretations
 *
 * Handles natural language like "file my taxes" → accountancy project
 */

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

/**
 * @typedef {Object} ConfidenceFactors
 * @property {number} keywordMatch - Strength of keyword matching (0.0-1.0)
 * @property {number} contextMatch - Relevance to active project/context (0.0-1.0)
 * @property {number} historyMatch - Alignment with user patterns (0.0-1.0)
 * @property {number} specificity - How specific/clear the request is (0.0-1.0)
 */

/**
 * @typedef {Object} AlternativeIntent
 * @property {string} actionType - Alternative action type
 * @property {number} confidence - Confidence for this alternative
 * @property {string} reason - Why this could be an alternative
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} intent - Primary intent classification
 * @property {string} actionType - The action type for the action executor
 * @property {string} project - Target project ID
 * @property {string} target - Specific target (repo, file, etc.)
 * @property {string} company - Company code (for accountancy)
 * @property {number} confidence - Overall confidence (0.0-1.0)
 * @property {ConfidenceFactors} confidenceFactors - Breakdown of confidence
 * @property {AlternativeIntent[]} alternatives - Other possible interpretations
 * @property {boolean} requiresConfirmation - Based on risk assessment
 * @property {boolean} ambiguous - Whether clarification is needed
 * @property {string[]} clarifyingQuestions - Questions if ambiguous
 * @property {string} risk - Risk level: 'low', 'medium', 'high'
 * @property {string[]} tasks - Extracted task items
 * @property {string} summary - Brief summary of what user wants
 * @property {string} action - Mapped action for executor
 * @property {string} reason - Classification reason
 */

/**
 * @typedef {Object} CorrectionRecord
 * @property {Object} original - Original classification
 * @property {Object} corrected - What user actually meant
 * @property {string} userId - User who made the correction
 * @property {number} timestamp - When correction was made
 */

class IntentClassifier {
  constructor() {
    this.claude = null;
    this.registry = null;
    this.cache = new Map();
    this.cacheMaxAge = 10 * 60 * 1000; // 10 min cache

    // User history for pattern learning
    this.userHistory = new Map(); // userId -> { actions: [], patterns: {} }

    // Corrections storage for learning
    this.corrections = [];
    // Store in the whatsapp-bot data directory
    this.correctionsFile = path.join(__dirname, '../data/intent-corrections.json');
    this.maxCorrections = 500; // Keep last 500 corrections

    // Risk configuration
    this.riskLevels = {
      high: ['delete', 'deploy', 'file-taxes', 'submit-filing', 'pay', 'publish'],
      medium: ['create-page', 'create-feature', 'create-task', 'code-task', 'restart'],
      low: ['check-status', 'process-receipt', 'check-deadlines', 'list', 'view', 'get']
    };

    // Ambiguity thresholds
    this.ambiguityThreshold = 0.5; // Below this, consider ambiguous
    this.clarificationThreshold = 0.3; // Below this, always ask questions
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

    // Load saved corrections for learning
    this.loadCorrections();

    console.log('[IntentClassifier] Initialized with confidence scoring v2.0');
  }

  /**
   * Load saved corrections from disk
   */
  loadCorrections() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.correctionsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.correctionsFile)) {
        const data = fs.readFileSync(this.correctionsFile, 'utf8');
        this.corrections = JSON.parse(data);
        console.log(`[IntentClassifier] Loaded ${this.corrections.length} corrections for learning`);
      }
    } catch (err) {
      console.error('[IntentClassifier] Failed to load corrections:', err.message);
      this.corrections = [];
    }
  }

  /**
   * Save corrections to disk
   */
  saveCorrections() {
    try {
      const dataDir = path.dirname(this.correctionsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.correctionsFile, JSON.stringify(this.corrections, null, 2));
    } catch (err) {
      console.error('[IntentClassifier] Failed to save corrections:', err.message);
    }
  }

  /**
   * Classify user intent from a message (v2.0 with confidence scoring)
   * @param {string} message - User's message (text or transcribed voice)
   * @param {Object} context - Additional context (mediaType, activeProject, userId, etc.)
   * @returns {ClassificationResult} Enhanced classification result
   */
  async classify(message, context = {}) {
    if (!message && !context.hasMedia) {
      return this.defaultResult('empty');
    }

    // Check for correction patterns first ("no I meant", "change to", etc.)
    const correctionCheck = this.checkForCorrection(message, context);
    if (correctionCheck) {
      return correctionCheck;
    }

    // Quick pattern matching first (fast)
    const quickMatch = this.quickPatternMatch(message, context);

    // Enhance with history patterns if available
    if (context.userId) {
      this.enhanceWithHistory(quickMatch, context.userId, message);
    }

    // Check corrections database for similar patterns
    this.enhanceWithCorrections(quickMatch, message);

    if (quickMatch.confidence > 0.8) {
      // High confidence - apply risk assessment and return
      const result = this.assessRisk(quickMatch);
      console.log(`[IntentClassifier] Quick match: ${result.intent} → ${result.project} (confidence: ${result.confidence.toFixed(2)})`);
      return result;
    }

    // Use AI for complex classification
    if (this.claude) {
      try {
        const aiResult = await this.aiClassify(message, context);

        // Enhance AI result with history
        if (context.userId) {
          this.enhanceWithHistory(aiResult, context.userId, message);
        }

        // Check for ambiguity
        this.detectAmbiguity(aiResult, message, context);

        if (aiResult.confidence > 0.5) {
          const result = this.assessRisk(aiResult);
          console.log(`[IntentClassifier] AI match: ${result.intent} → ${result.project} (confidence: ${result.confidence.toFixed(2)})`);

          // Track for user history
          if (context.userId && result.confidence > 0.7) {
            this.trackUserAction(context.userId, result);
          }

          return result;
        }
      } catch (err) {
        console.error('[IntentClassifier] AI classification failed:', err.message);
      }
    }

    // Quick match with ambiguity detection
    this.detectAmbiguity(quickMatch, message, context);
    const result = this.assessRisk(quickMatch.confidence > 0 ? quickMatch : this.defaultResult('unknown'));

    return result;
  }

  /**
   * Simplified classifyIntent for action controller integration
   * @param {string} message - User's message
   * @param {Object} context - Context including activeProject, userId, etc.
   * @returns {ClassificationResult} Full enhanced classification
   */
  async classifyIntent(message, context = {}) {
    const result = await this.classify(message, context);

    // Map to expected format for action controller
    return {
      actionType: result.action || result.intent,
      target: result.project,
      summary: result.summary || `${result.intent} ${result.project || ''}`.trim(),
      confidence: result.confidence,
      confidenceFactors: result.confidenceFactors,
      alternatives: result.alternatives,
      requiresConfirmation: result.requiresConfirmation,
      ambiguous: result.ambiguous,
      clarifyingQuestions: result.clarifyingQuestions,
      risk: result.risk,
      ...result
    };
  }

  /**
   * Quick pattern matching for common intents (v2.0 with confidence factors)
   */
  quickPatternMatch(message, context = {}) {
    const msg = (message || '').toLowerCase();
    const result = {
      intent: null,
      project: null,
      company: null,
      confidence: 0,
      confidenceFactors: {
        keywordMatch: 0,
        contextMatch: 0,
        historyMatch: 0,
        specificity: 0
      },
      alternatives: [],
      tasks: [],
      action: null,
      summary: null,
      ambiguous: false,
      clarifyingQuestions: [],
      risk: 'low',
      requiresConfirmation: false
    };

    // Track what matches we found for specificity scoring
    let keywordMatches = [];
    let projectMatches = [];
    let intentMatches = [];

    // Check for receipt/expense (with or without image)
    if (context.hasMedia && context.mediaType === 'image') {
      // Image attached - likely a receipt
      const receiptKeywords = ['receipt', 'expense', 'paid', 'bought', 'invoice', 'bill'];
      const matchedKeywords = receiptKeywords.filter(k => msg.includes(k));

      if (matchedKeywords.length > 0 || msg === '') {
        result.intent = 'process-receipt';
        result.project = 'giquina-accountancy';
        result.action = 'process-receipt';
        result.confidenceFactors.keywordMatch = matchedKeywords.length > 0 ? 0.95 : 0.7;
        result.confidenceFactors.contextMatch = 1.0; // Image context is strong
        result.confidenceFactors.specificity = 0.85;
        result.confidence = this.calculateOverallConfidence(result.confidenceFactors);
        result.summary = 'Process receipt for expense tracking';

        // Try to detect company
        result.company = this.detectCompany(msg);
        if (result.company) {
          result.confidenceFactors.specificity = 0.95;
          result.summary += ` for ${result.company}`;
        }

        result.confidence = this.calculateOverallConfidence(result.confidenceFactors);
        return result;
      }
    }

    // Check for explicit project mentions (collect all matches)
    for (const [projectId, project] of Object.entries(this.registry.projects)) {
      let matchStrength = 0;
      const matchedKeywords = [];

      for (const keyword of project.keywords || []) {
        if (msg.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          // Longer keywords = stronger match
          matchStrength = Math.max(matchStrength, keyword.length / 15);
        }
      }

      // Check for exact project name match
      if (msg.includes(projectId.toLowerCase())) {
        matchStrength = Math.max(matchStrength, 0.95);
        matchedKeywords.push(projectId);
      }

      if (matchedKeywords.length > 0) {
        projectMatches.push({
          project: projectId,
          strength: Math.min(matchStrength, 1.0),
          keywords: matchedKeywords
        });
      }
    }

    // Sort by strength and pick best match
    if (projectMatches.length > 0) {
      projectMatches.sort((a, b) => b.strength - a.strength);
      result.project = projectMatches[0].project;
      result.confidenceFactors.keywordMatch = projectMatches[0].strength;

      // Add alternatives if there are close matches
      for (let i = 1; i < Math.min(projectMatches.length, 3); i++) {
        if (projectMatches[i].strength > 0.5) {
          result.alternatives.push({
            actionType: result.intent,
            project: projectMatches[i].project,
            confidence: projectMatches[i].strength * 0.8,
            reason: `Also matches keywords: ${projectMatches[i].keywords.join(', ')}`
          });
        }
      }
    }

    // Check for intent patterns (collect all matches)
    for (const [intentId, intent] of Object.entries(this.registry.intents)) {
      let matchStrength = 0;
      const matchedPatterns = [];

      for (const pattern of intent.patterns || []) {
        if (msg.includes(pattern.toLowerCase())) {
          matchedPatterns.push(pattern);
          // Longer patterns = stronger match
          matchStrength = Math.max(matchStrength, pattern.length / 20);
        }
      }

      if (matchedPatterns.length > 0) {
        intentMatches.push({
          intent: intentId,
          action: intent.action,
          strength: Math.min(matchStrength, 1.0),
          patterns: matchedPatterns,
          requiredCapability: intent.requiredCapability,
          projectTypes: intent.projectTypes
        });
      }
    }

    // Sort by strength and pick best intent match
    if (intentMatches.length > 0) {
      intentMatches.sort((a, b) => b.strength - a.strength);
      const bestIntent = intentMatches[0];

      result.intent = bestIntent.intent;
      result.action = bestIntent.action;
      result.confidenceFactors.keywordMatch = Math.max(
        result.confidenceFactors.keywordMatch,
        bestIntent.strength
      );

      // If no project yet, find one that matches this intent
      if (!result.project && bestIntent.requiredCapability) {
        result.project = this.findProjectByCapability(bestIntent.requiredCapability);
      } else if (!result.project && bestIntent.projectTypes) {
        result.project = this.findProjectByType(bestIntent.projectTypes[0]);
      }

      // Add alternative intents
      for (let i = 1; i < Math.min(intentMatches.length, 3); i++) {
        if (intentMatches[i].strength > 0.3) {
          result.alternatives.push({
            actionType: intentMatches[i].action || intentMatches[i].intent,
            confidence: intentMatches[i].strength * 0.7,
            reason: `Matches pattern: ${intentMatches[i].patterns[0]}`
          });
        }
      }
    }

    // Check for company mentions
    if (!result.company) {
      result.company = this.detectCompany(msg);
      if (result.company && !result.project) {
        // Company mentioned but no project - likely accountancy
        result.project = 'giquina-accountancy';
        result.confidenceFactors.contextMatch = 0.7;
      }
    }

    // Calculate specificity based on message clarity
    result.confidenceFactors.specificity = this.calculateSpecificity(msg, result);

    // Context match from active project
    if (!result.project && context.activeProject) {
      result.project = context.activeProject;
      result.confidenceFactors.contextMatch = 0.6;
    } else if (result.project && context.activeProject === result.project) {
      result.confidenceFactors.contextMatch = 0.9;
    }

    // Build summary
    result.summary = this.buildSummary(result, msg);

    // Calculate overall confidence
    result.confidence = this.calculateOverallConfidence(result.confidenceFactors);

    return result;
  }

  /**
   * Calculate specificity score based on message clarity
   * @param {string} msg - The message
   * @param {Object} result - Current classification result
   * @returns {number} Specificity score 0.0-1.0
   */
  calculateSpecificity(msg, result) {
    let score = 0.5; // Base score

    // Short vague messages are less specific
    if (msg.length < 10) score -= 0.2;
    if (msg.length > 30) score += 0.1;

    // Has both intent and project = more specific
    if (result.intent && result.project) score += 0.2;

    // Has company = even more specific
    if (result.company) score += 0.1;

    // Single word = vague
    const wordCount = msg.split(/\s+/).length;
    if (wordCount === 1) score -= 0.2;
    if (wordCount >= 3) score += 0.1;

    // Vague phrases reduce specificity
    const vaguePatterns = [
      'do the thing',
      'do that',
      'do it',
      'the usual',
      'you know',
      'same as before'
    ];
    for (const pattern of vaguePatterns) {
      if (msg.includes(pattern)) {
        score -= 0.3;
        break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate overall confidence from factors
   * @param {ConfidenceFactors} factors - The confidence factors
   * @returns {number} Overall confidence 0.0-1.0
   */
  calculateOverallConfidence(factors) {
    // Weighted average with keyword match being most important
    const weights = {
      keywordMatch: 0.4,
      contextMatch: 0.25,
      historyMatch: 0.15,
      specificity: 0.2
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (factors[key] > 0) {
        weightedSum += factors[key] * weight;
        totalWeight += weight;
      }
    }

    // If no factors, return 0
    if (totalWeight === 0) return 0;

    // Normalize to account for missing factors
    return weightedSum / totalWeight;
  }

  /**
   * Build a human-readable summary of the classification
   * @param {Object} result - Classification result
   * @param {string} msg - Original message
   * @returns {string} Summary
   */
  buildSummary(result, msg) {
    const parts = [];

    if (result.intent) {
      const intentVerb = {
        'create-page': 'Create page',
        'create-feature': 'Add feature',
        'process-receipt': 'Process receipt',
        'deploy': 'Deploy',
        'check-status': 'Check status',
        'check-deadlines': 'Check deadlines',
        'file-taxes': 'File taxes',
        'code-task': 'Code task'
      };
      parts.push(intentVerb[result.intent] || result.intent);
    }

    if (result.project) {
      parts.push(`for ${result.project}`);
    }

    if (result.company) {
      parts.push(`(${result.company})`);
    }

    return parts.length > 0 ? parts.join(' ') : msg.substring(0, 50);
  }

  /**
   * AI-powered classification for complex queries (v2.0 with enhanced output)
   */
  async aiClassify(message, context = {}) {
    const projectList = Object.entries(this.registry.projects)
      .map(([id, p]) => `- ${id}: ${p.description} (capabilities: ${(p.capabilities || []).join(', ')})`)
      .join('\n');

    const companyList = Object.entries(this.registry.companies)
      .map(([code, c]) => `- ${code}: ${c.name}`)
      .join('\n');

    const prompt = `Analyze this user message and determine their intent and which project it relates to.
Provide confidence scores and identify any ambiguity.

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
  "confidenceFactors": {
    "keywordMatch": 0.0-1.0,
    "contextMatch": 0.0-1.0,
    "specificity": 0.0-1.0
  },
  "alternatives": [
    {"intent": "alternative-intent", "confidence": 0.0-1.0, "reason": "why this could be an alternative"}
  ],
  "tasks": ["extracted task 1", "extracted task 2"],
  "summary": "brief summary of what user wants",
  "ambiguous": true/false,
  "clarifyingQuestions": ["question1 if ambiguous", "question2"]
}

Consider a message ambiguous if:
- It mentions multiple possible actions without specifying which
- It doesn't clearly identify a target project
- It uses vague language like "do the thing" or "the usual"
- Multiple intents could reasonably apply

Only respond with the JSON, nothing else.`;

    const response = await this.claude.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const jsonStr = response.content[0].text.trim();
      const result = JSON.parse(jsonStr);

      // Build enhanced result
      return {
        intent: result.intent || 'unknown',
        project: result.project,
        company: result.company,
        confidence: result.confidence || 0.5,
        confidenceFactors: result.confidenceFactors || {
          keywordMatch: result.confidence || 0.5,
          contextMatch: context.activeProject === result.project ? 0.8 : 0.5,
          historyMatch: 0,
          specificity: result.ambiguous ? 0.3 : 0.7
        },
        alternatives: (result.alternatives || []).map(alt => ({
          actionType: alt.intent,
          confidence: alt.confidence,
          reason: alt.reason
        })),
        tasks: result.tasks || [],
        summary: result.summary,
        action: this.getActionForIntent(result.intent),
        ambiguous: result.ambiguous || false,
        clarifyingQuestions: result.clarifyingQuestions || [],
        risk: 'low',
        requiresConfirmation: false
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
   * Default result (v2.0 with all required fields)
   */
  defaultResult(reason) {
    return {
      intent: 'unknown',
      actionType: 'unknown',
      project: null,
      target: null,
      company: null,
      confidence: 0,
      confidenceFactors: {
        keywordMatch: 0,
        contextMatch: 0,
        historyMatch: 0,
        specificity: 0
      },
      alternatives: [],
      tasks: [],
      action: null,
      summary: null,
      ambiguous: reason !== 'empty',
      clarifyingQuestions: reason === 'unknown' ? ['What would you like me to do?', 'Which project should I focus on?'] : [],
      risk: 'low',
      requiresConfirmation: false,
      reason
    };
  }

  // ============================================================================
  // RISK ASSESSMENT
  // ============================================================================

  /**
   * Assess risk level and set confirmation requirements
   * @param {Object} intent - The classified intent
   * @returns {Object} Intent with risk assessment added
   */
  assessRisk(intent) {
    const action = intent.action || intent.intent;
    let risk = 'low';

    // Check high risk actions
    if (this.riskLevels.high.some(a => action?.includes(a))) {
      risk = 'high';
    }
    // Check medium risk actions
    else if (this.riskLevels.medium.some(a => action?.includes(a))) {
      risk = 'medium';
    }

    // Production/live mentions increase risk
    const target = intent.project || intent.target || '';
    if (/prod|production|live|master|main/i.test(target)) {
      if (risk === 'low') risk = 'medium';
      if (risk === 'medium') risk = 'high';
    }

    intent.risk = risk;
    intent.requiresConfirmation = risk !== 'low';

    return intent;
  }

  // ============================================================================
  // AMBIGUITY DETECTION
  // ============================================================================

  /**
   * Detect if a classification result is ambiguous
   * @param {Object} result - Classification result
   * @param {string} message - Original message
   * @param {Object} context - Classification context
   */
  detectAmbiguity(result, message, context = {}) {
    const questions = [];

    // Low confidence = likely ambiguous
    if (result.confidence < this.ambiguityThreshold) {
      result.ambiguous = true;

      // Generate appropriate questions
      if (!result.project) {
        questions.push('Which project did you mean?');
      }

      if (!result.intent || result.intent === 'unknown') {
        questions.push('What action would you like me to take?');
      }

      if (result.alternatives && result.alternatives.length > 0) {
        const altActions = result.alternatives.map(a => a.actionType).join(', ');
        questions.push(`Did you want to: ${result.intent || 'unknown'}, or ${altActions}?`);
      }
    }

    // Very low confidence = definitely ask
    if (result.confidence < this.clarificationThreshold) {
      result.ambiguous = true;
      if (questions.length === 0) {
        questions.push('I\'m not sure what you want me to do. Can you be more specific?');
      }
    }

    // Multiple strong alternatives = ambiguous
    if (result.alternatives && result.alternatives.length > 0) {
      const strongAlts = result.alternatives.filter(a => a.confidence > 0.4);
      if (strongAlts.length > 0 && result.confidence < 0.7) {
        result.ambiguous = true;
        questions.push(`Did you mean ${result.intent} or ${strongAlts[0].actionType}?`);
      }
    }

    // Vague patterns
    const vaguePatterns = ['do the thing', 'do that', 'do it', 'the usual', 'you know'];
    const msg = message.toLowerCase();
    for (const pattern of vaguePatterns) {
      if (msg.includes(pattern)) {
        result.ambiguous = true;
        questions.push('Can you be more specific about what you\'d like me to do?');
        break;
      }
    }

    result.clarifyingQuestions = [...new Set(questions)]; // Remove duplicates
  }

  // ============================================================================
  // USER HISTORY AND LEARNING
  // ============================================================================

  /**
   * Enhance result with user history patterns
   * @param {Object} result - Current classification result
   * @param {string} userId - User identifier
   * @param {string} message - Original message
   */
  enhanceWithHistory(result, userId, message) {
    const history = this.userHistory.get(userId);
    if (!history || history.actions.length === 0) {
      return;
    }

    // Find similar past actions
    const recentActions = history.actions.slice(-20);
    let historyBoost = 0;

    // Check if user frequently uses this project
    const projectCounts = {};
    for (const action of recentActions) {
      if (action.project) {
        projectCounts[action.project] = (projectCounts[action.project] || 0) + 1;
      }
    }

    // If result project matches user's frequent projects, boost confidence
    if (result.project && projectCounts[result.project]) {
      const frequency = projectCounts[result.project] / recentActions.length;
      historyBoost += frequency * 0.3;
    }

    // Check for similar intent patterns
    const intentCounts = {};
    for (const action of recentActions) {
      if (action.intent) {
        intentCounts[action.intent] = (intentCounts[action.intent] || 0) + 1;
      }
    }

    if (result.intent && intentCounts[result.intent]) {
      const frequency = intentCounts[result.intent] / recentActions.length;
      historyBoost += frequency * 0.2;
    }

    // Update confidence factors
    result.confidenceFactors.historyMatch = Math.min(historyBoost, 1.0);

    // Recalculate overall confidence
    result.confidence = this.calculateOverallConfidence(result.confidenceFactors);
  }

  /**
   * Track user action for future pattern learning
   * @param {string} userId - User identifier
   * @param {Object} result - Classification result
   */
  trackUserAction(userId, result) {
    if (!this.userHistory.has(userId)) {
      this.userHistory.set(userId, {
        actions: [],
        patterns: {}
      });
    }

    const history = this.userHistory.get(userId);

    // Add to action history
    history.actions.push({
      intent: result.intent,
      project: result.project,
      company: result.company,
      timestamp: Date.now()
    });

    // Keep only last 100 actions
    if (history.actions.length > 100) {
      history.actions = history.actions.slice(-100);
    }
  }

  // ============================================================================
  // CORRECTIONS AND LEARNING
  // ============================================================================

  /**
   * Check if message is a correction of previous classification
   * @param {string} message - User message
   * @param {Object} context - Context with lastClassification
   * @returns {Object|null} New classification if correction detected, null otherwise
   */
  checkForCorrection(message, context = {}) {
    const correctionPatterns = [
      /^no,?\s*i\s*meant\s+(.+)/i,
      /^not\s+that,?\s*(.+)/i,
      /^actually,?\s*(.+)/i,
      /^i\s*meant\s+(.+)/i,
      /^change\s+(?:it\s+)?to\s+(.+)/i,
      /^switch\s+to\s+(.+)/i,
      /^use\s+(.+)\s+instead/i
    ];

    const msg = message.toLowerCase();

    for (const pattern of correctionPatterns) {
      const match = msg.match(pattern);
      if (match && context.lastClassification) {
        // Extract the correction and re-classify
        const correctionText = match[1];

        // Record the correction for learning
        this.recordCorrection(context.lastClassification, { correctionText }, context.userId);

        // Return null to trigger re-classification with the corrected text
        console.log(`[IntentClassifier] Correction detected: "${correctionText}"`);
        return null; // Let the classify method handle the correctionText
      }
    }

    return null;
  }

  /**
   * Record a correction for future learning
   * @param {Object} originalIntent - What was originally classified
   * @param {Object} correctedIntent - What user actually meant
   * @param {string} userId - User identifier
   */
  recordCorrection(originalIntent, correctedIntent, userId = 'unknown') {
    const correction = {
      original: {
        intent: originalIntent.intent,
        project: originalIntent.project,
        confidence: originalIntent.confidence
      },
      corrected: correctedIntent,
      userId,
      timestamp: Date.now()
    };

    this.corrections.push(correction);

    // Keep only the most recent corrections
    if (this.corrections.length > this.maxCorrections) {
      this.corrections = this.corrections.slice(-this.maxCorrections);
    }

    // Save to disk
    this.saveCorrections();

    console.log(`[IntentClassifier] Recorded correction: ${JSON.stringify(correction)}`);
  }

  /**
   * Learn from past corrections to adjust future classifications
   * @param {Object} result - Current classification result
   * @param {string} message - Original message
   */
  enhanceWithCorrections(result, message) {
    if (this.corrections.length === 0) return;

    const msg = message.toLowerCase();

    // Look for patterns in corrections that match current classification
    const relevantCorrections = this.corrections.filter(c => {
      // Same intent was corrected before
      return c.original.intent === result.intent ||
        c.original.project === result.project;
    });

    if (relevantCorrections.length === 0) return;

    // Reduce confidence if this type of classification was often corrected
    const correctionRate = relevantCorrections.length / this.corrections.length;
    if (correctionRate > 0.2) {
      // More than 20% of corrections were for this type
      result.confidence *= (1 - correctionRate * 0.3);
      result.confidenceFactors.historyMatch *= (1 - correctionRate * 0.3);

      // Add a note about past corrections
      if (!result.alternatives) result.alternatives = [];
      result.alternatives.push({
        actionType: 'check-with-user',
        confidence: correctionRate,
        reason: 'This type of request was often corrected before'
      });
    }
  }

  /**
   * Get correction statistics
   * @returns {Object} Correction stats
   */
  getCorrectionStats() {
    const stats = {
      totalCorrections: this.corrections.length,
      byIntent: {},
      byProject: {},
      recentCorrections: this.corrections.slice(-10)
    };

    for (const c of this.corrections) {
      if (c.original.intent) {
        stats.byIntent[c.original.intent] = (stats.byIntent[c.original.intent] || 0) + 1;
      }
      if (c.original.project) {
        stats.byProject[c.original.project] = (stats.byProject[c.original.project] || 0) + 1;
      }
    }

    return stats;
  }

  // ============================================================================
  // USER HISTORY MANAGEMENT
  // ============================================================================

  /**
   * Get user history
   * @param {string} userId - User identifier
   * @returns {Object|null} User history or null
   */
  getUserHistory(userId) {
    return this.userHistory.get(userId) || null;
  }

  /**
   * Clear user history
   * @param {string} userId - User identifier
   */
  clearUserHistory(userId) {
    this.userHistory.delete(userId);
    console.log(`[IntentClassifier] Cleared history for user ${userId}`);
  }

  /**
   * Get confidence thresholds
   * @returns {Object} Current threshold settings
   */
  getThresholds() {
    return {
      ambiguityThreshold: this.ambiguityThreshold,
      clarificationThreshold: this.clarificationThreshold
    };
  }

  /**
   * Update confidence thresholds
   * @param {Object} thresholds - New threshold values
   */
  setThresholds(thresholds) {
    if (typeof thresholds.ambiguityThreshold === 'number') {
      this.ambiguityThreshold = thresholds.ambiguityThreshold;
    }
    if (typeof thresholds.clarificationThreshold === 'number') {
      this.clarificationThreshold = thresholds.clarificationThreshold;
    }
  }
}

// Singleton
const classifier = new IntentClassifier();
module.exports = classifier;
