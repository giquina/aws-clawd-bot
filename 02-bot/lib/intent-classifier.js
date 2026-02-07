/**
 * Intent Classifier v2.1
 *
 * Enhanced AI-powered intent classification with:
 * - Confidence scoring (0.0 to 1.0) with breakdown factors
 * - Fixed weighted confidence calculation (always uses total weights)
 * - Ambiguity detection and clarifying questions
 * - Risk assessment integration
 * - Learning from user corrections with pattern mapping
 * - Fuzzy company name matching
 * - AI call timeout protection
 * - Bounded user history (LRU eviction)
 * - Alternative interpretations
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

class IntentClassifier {
  constructor() {
    this.claude = null;
    this.registry = null;
    this.cache = new Map();
    this.cacheMaxAge = 10 * 60 * 1000; // 10 min cache

    // User history for pattern learning (bounded)
    this.userHistory = new Map(); // userId -> { actions: [], patterns: {} }
    this.maxUsers = 1000; // LRU cap on tracked users
    this.maxActionsPerUser = 100;

    // Corrections storage for learning
    this.corrections = [];
    this.correctionsFile = path.join(__dirname, '../data/intent-corrections.json');
    this.maxCorrections = 500;

    // Correction pattern mappings: learned substitutions
    this.correctionPatterns = new Map(); // "original_key" -> { correctedIntent, correctedProject, count }

    // AI timeout
    this.aiTimeoutMs = 5000; // 5s timeout

    // Risk configuration
    this.riskLevels = {
      high: ['delete', 'deploy', 'file-taxes', 'submit-filing', 'pay', 'publish'],
      medium: ['create-page', 'create-feature', 'create-task', 'code-task', 'restart'],
      low: ['check-status', 'process-receipt', 'check-deadlines', 'list', 'view', 'get']
    };

    // Ambiguity thresholds (tunable)
    this.ambiguityThreshold = 0.5;
    this.clarificationThreshold = 0.3;

    // Confidence weights (fixed: always sums to 1.0)
    this.confidenceWeights = {
      keywordMatch: 0.4,
      contextMatch: 0.25,
      historyMatch: 0.15,
      specificity: 0.2
    };
  }

  initialize() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    try {
      this.registry = require('../../config/project-registry.json');
      console.log(`[IntentClassifier] Loaded ${Object.keys(this.registry.projects).length} projects`);
    } catch (err) {
      console.error('[IntentClassifier] Failed to load registry:', err.message);
      this.registry = { projects: {}, intents: {}, companies: {} };
    }

    this.loadCorrections();
    console.log('[IntentClassifier] Initialized with confidence scoring v2.1');
  }

  /**
   * Load saved corrections from disk
   */
  loadCorrections() {
    try {
      const dataDir = path.dirname(this.correctionsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.correctionsFile)) {
        const data = fs.readFileSync(this.correctionsFile, 'utf8');
        const parsed = JSON.parse(data);

        // Support both old (array) and new (object with patterns) format
        if (Array.isArray(parsed)) {
          this.corrections = parsed;
        } else {
          this.corrections = parsed.corrections || [];
          // Restore learned patterns
          if (parsed.patterns) {
            for (const [key, value] of Object.entries(parsed.patterns)) {
              this.correctionPatterns.set(key, value);
            }
          }
        }
        console.log(`[IntentClassifier] Loaded ${this.corrections.length} corrections, ${this.correctionPatterns.size} learned patterns`);
      }
    } catch (err) {
      console.error('[IntentClassifier] Failed to load corrections:', err.message);
      this.corrections = [];
    }
  }

  /**
   * Save corrections and learned patterns to disk
   */
  saveCorrections() {
    try {
      const dataDir = path.dirname(this.correctionsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = {
        corrections: this.corrections,
        patterns: Object.fromEntries(this.correctionPatterns)
      };

      fs.writeFileSync(this.correctionsFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[IntentClassifier] Failed to save corrections:', err.message);
    }
  }

  /**
   * Classify user intent from a message (v2.1)
   */
  async classify(message, context = {}) {
    if (!message && !context.hasMedia) {
      return this.defaultResult('empty');
    }

    // Check for correction patterns first
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

    // Check learned correction patterns for direct overrides
    this._applyLearnedPatterns(quickMatch, message);

    if (quickMatch.confidence > 0.8) {
      const result = this.assessRisk(quickMatch);
      console.log(`[IntentClassifier] Quick match: ${result.intent} → ${result.project} (confidence: ${result.confidence.toFixed(2)})`);
      return result;
    }

    // Use AI for complex classification — with timeout
    if (this.claude) {
      try {
        const aiResult = await this.aiClassify(message, context);

        if (context.userId) {
          this.enhanceWithHistory(aiResult, context.userId, message);
        }

        this.detectAmbiguity(aiResult, message, context);

        if (aiResult.confidence > 0.5) {
          const result = this.assessRisk(aiResult);
          console.log(`[IntentClassifier] AI match: ${result.intent} → ${result.project} (confidence: ${result.confidence.toFixed(2)})`);

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
   */
  async classifyIntent(message, context = {}) {
    const result = await this.classify(message, context);

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
   * Quick pattern matching for common intents (v2.1 with fixed confidence)
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

    let projectMatches = [];

    // Check for receipt/expense (with or without image)
    if (context.hasMedia && context.mediaType === 'image') {
      const receiptKeywords = ['receipt', 'expense', 'paid', 'bought', 'invoice', 'bill'];
      const matchedKeywords = receiptKeywords.filter(k => msg.includes(k));

      if (matchedKeywords.length > 0 || msg === '') {
        result.intent = 'process-receipt';
        result.project = 'giquina-accountancy';
        result.action = 'process-receipt';
        result.confidenceFactors.keywordMatch = matchedKeywords.length > 0 ? 0.95 : 0.7;
        result.confidenceFactors.contextMatch = 1.0;
        result.confidenceFactors.specificity = 0.85;
        result.confidence = this.calculateOverallConfidence(result.confidenceFactors);
        result.summary = 'Process receipt for expense tracking';

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
          matchStrength = Math.max(matchStrength, keyword.length / 15);
        }
      }

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

    if (projectMatches.length > 0) {
      projectMatches.sort((a, b) => b.strength - a.strength);
      result.project = projectMatches[0].project;
      result.confidenceFactors.keywordMatch = projectMatches[0].strength;

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

    // Check for intent patterns
    let intentMatches = [];
    for (const [intentId, intent] of Object.entries(this.registry.intents)) {
      let matchStrength = 0;
      const matchedPatterns = [];

      for (const pattern of intent.patterns || []) {
        if (msg.includes(pattern.toLowerCase())) {
          matchedPatterns.push(pattern);
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

    if (intentMatches.length > 0) {
      intentMatches.sort((a, b) => b.strength - a.strength);
      const bestIntent = intentMatches[0];

      result.intent = bestIntent.intent;
      result.action = bestIntent.action;
      result.confidenceFactors.keywordMatch = Math.max(
        result.confidenceFactors.keywordMatch,
        bestIntent.strength
      );

      if (!result.project && bestIntent.requiredCapability) {
        result.project = this.findProjectByCapability(bestIntent.requiredCapability);
      } else if (!result.project && bestIntent.projectTypes) {
        result.project = this.findProjectByType(bestIntent.projectTypes[0]);
      }

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

    // Check for company mentions (with fuzzy matching)
    if (!result.company) {
      result.company = this.detectCompany(msg);
      if (result.company && !result.project) {
        result.project = 'giquina-accountancy';
        result.confidenceFactors.contextMatch = 0.7;
      }
    }

    // Calculate specificity
    result.confidenceFactors.specificity = this.calculateSpecificity(msg, result);

    // Context match from active project
    if (!result.project && context.activeProject) {
      result.project = context.activeProject;
      result.confidenceFactors.contextMatch = 0.6;
    } else if (result.project && context.activeProject === result.project) {
      result.confidenceFactors.contextMatch = 0.9;
    }

    result.summary = this.buildSummary(result, msg);
    result.confidence = this.calculateOverallConfidence(result.confidenceFactors);

    return result;
  }

  /**
   * Calculate specificity score based on message clarity
   */
  calculateSpecificity(msg, result) {
    let score = 0.5;

    if (msg.length < 10) score -= 0.2;
    if (msg.length > 30) score += 0.1;

    if (result.intent && result.project) score += 0.2;
    if (result.company) score += 0.1;

    const wordCount = msg.split(/\s+/).length;
    if (wordCount === 1) score -= 0.2;
    if (wordCount >= 3) score += 0.1;

    const vaguePatterns = ['do the thing', 'do that', 'do it', 'the usual', 'you know', 'same as before'];
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
   * FIXED: Always uses total weights sum (1.0), not just present factors.
   * This prevents inflated scores when only one factor matches.
   */
  calculateOverallConfidence(factors) {
    const weights = this.confidenceWeights;
    let weightedSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
      weightedSum += (factors[key] || 0) * weight;
    }

    // Total weights always sum to 1.0, so weightedSum IS the confidence
    return Math.min(weightedSum, 1.0);
  }

  /**
   * Build a human-readable summary of the classification
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
   * AI-powered classification with timeout protection
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

    // Race against timeout
    const aiPromise = this.claude.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI classify timeout')), this.aiTimeoutMs)
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);

    try {
      const jsonStr = response.content[0].text.trim();
      const result = JSON.parse(jsonStr);

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
      const aiPromise = this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('extractTasks timeout')), this.aiTimeoutMs)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);
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
   * Detect company from message — with fuzzy matching
   */
  detectCompany(message) {
    const msg = message.toLowerCase();

    // Exact keyword matching first
    for (const [code, company] of Object.entries(this.registry.companies)) {
      for (const keyword of company.keywords || []) {
        if (msg.includes(keyword.toLowerCase())) {
          return code;
        }
      }
    }

    // Fuzzy matching: Levenshtein distance for company names
    const companyNames = Object.entries(this.registry.companies).map(([code, c]) => ({
      code,
      name: (c.name || '').toLowerCase(),
      keywords: (c.keywords || []).map(k => k.toLowerCase())
    }));

    // Extract words from message for fuzzy matching
    const words = msg.split(/\s+/).filter(w => w.length >= 3);

    for (const word of words) {
      for (const company of companyNames) {
        // Check fuzzy match against company name
        if (this._fuzzyMatch(word, company.name, 2)) {
          return company.code;
        }
        // Check fuzzy match against keywords
        for (const kw of company.keywords) {
          if (kw.length >= 3 && this._fuzzyMatch(word, kw, 1)) {
            return company.code;
          }
        }
      }
    }

    return null;
  }

  /**
   * Fuzzy string matching using Levenshtein distance
   * @param {string} a - Source string
   * @param {string} b - Target string
   * @param {number} maxDistance - Maximum allowed edit distance
   * @returns {boolean} Whether strings are within edit distance
   */
  _fuzzyMatch(a, b, maxDistance) {
    if (Math.abs(a.length - b.length) > maxDistance) return false;
    if (a === b) return true;

    const matrix = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
      for (let j = 1; j <= b.length; j++) {
        if (i === 0) {
          matrix[i][j] = j;
        } else {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
    }

    return matrix[a.length][b.length] <= maxDistance;
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
   * Default result (v2.1)
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

  assessRisk(intent) {
    const action = intent.action || intent.intent;
    let risk = 'low';

    if (this.riskLevels.high.some(a => action?.includes(a))) {
      risk = 'high';
    } else if (this.riskLevels.medium.some(a => action?.includes(a))) {
      risk = 'medium';
    }

    const target = intent.project || intent.target || '';
    if (/prod|production|live|master|main/i.test(target)) {
      // Escalate one level: low→medium, medium→high (not both in one step)
      if (risk === 'low') risk = 'medium';
      else if (risk === 'medium') risk = 'high';
    }

    intent.risk = risk;
    intent.requiresConfirmation = risk !== 'low';

    return intent;
  }

  // ============================================================================
  // AMBIGUITY DETECTION
  // ============================================================================

  detectAmbiguity(result, message, context = {}) {
    const questions = [];

    if (result.confidence < this.ambiguityThreshold) {
      result.ambiguous = true;

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

    if (result.confidence < this.clarificationThreshold) {
      result.ambiguous = true;
      if (questions.length === 0) {
        questions.push('I\'m not sure what you want me to do. Can you be more specific?');
      }
    }

    if (result.alternatives && result.alternatives.length > 0) {
      const strongAlts = result.alternatives.filter(a => a.confidence > 0.4);
      if (strongAlts.length > 0 && result.confidence < 0.7) {
        result.ambiguous = true;
        questions.push(`Did you mean ${result.intent} or ${strongAlts[0].actionType}?`);
      }
    }

    const vaguePatterns = ['do the thing', 'do that', 'do it', 'the usual', 'you know'];
    const msg = message.toLowerCase();
    for (const pattern of vaguePatterns) {
      if (msg.includes(pattern)) {
        result.ambiguous = true;
        questions.push('Can you be more specific about what you\'d like me to do?');
        break;
      }
    }

    result.clarifyingQuestions = [...new Set(questions)];
  }

  // ============================================================================
  // USER HISTORY AND LEARNING (with bounded memory)
  // ============================================================================

  enhanceWithHistory(result, userId, message) {
    const history = this.userHistory.get(userId);
    if (!history || history.actions.length === 0) {
      return;
    }

    const recentActions = history.actions.slice(-20);
    let historyBoost = 0;

    // Check if user frequently uses this project
    const projectCounts = {};
    for (const action of recentActions) {
      if (action.project) {
        projectCounts[action.project] = (projectCounts[action.project] || 0) + 1;
      }
    }

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

    result.confidenceFactors.historyMatch = Math.min(historyBoost, 1.0);
    result.confidence = this.calculateOverallConfidence(result.confidenceFactors);
  }

  /**
   * Track user action for future pattern learning (bounded)
   */
  trackUserAction(userId, result) {
    // Enforce LRU user limit
    if (!this.userHistory.has(userId) && this.userHistory.size >= this.maxUsers) {
      // Evict oldest user (first key in Map)
      const oldestUser = this.userHistory.keys().next().value;
      this.userHistory.delete(oldestUser);
    }

    if (!this.userHistory.has(userId)) {
      this.userHistory.set(userId, {
        actions: [],
        patterns: {}
      });
    }

    const history = this.userHistory.get(userId);

    history.actions.push({
      intent: result.intent,
      project: result.project,
      company: result.company,
      timestamp: Date.now()
    });

    // Keep only recent actions per user
    if (history.actions.length > this.maxActionsPerUser) {
      history.actions = history.actions.slice(-this.maxActionsPerUser);
    }
  }

  // ============================================================================
  // CORRECTIONS AND LEARNING (with pattern mapping)
  // ============================================================================

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
        const correctionText = match[1];
        this.recordCorrection(context.lastClassification, { correctionText }, context.userId);
        console.log(`[IntentClassifier] Correction detected: "${correctionText}"`);
        return null; // Let classify method handle the correctionText
      }
    }

    return null;
  }

  /**
   * Record a correction and learn pattern mappings
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

    if (this.corrections.length > this.maxCorrections) {
      this.corrections = this.corrections.slice(-this.maxCorrections);
    }

    // Learn a pattern mapping: "when intent=X and project=Y, user actually meant Z"
    const patternKey = `${originalIntent.intent || 'unknown'}:${originalIntent.project || 'unknown'}`;
    const existing = this.correctionPatterns.get(patternKey) || { count: 0 };

    if (correctedIntent.correctionText) {
      this.correctionPatterns.set(patternKey, {
        correctedText: correctedIntent.correctionText,
        count: existing.count + 1,
        lastUsed: Date.now()
      });
    }

    this.saveCorrections();
    console.log(`[IntentClassifier] Recorded correction: ${patternKey} (${existing.count + 1}x)`);
  }

  /**
   * Apply learned correction patterns to adjust confidence
   */
  _applyLearnedPatterns(result, message) {
    const patternKey = `${result.intent || 'unknown'}:${result.project || 'unknown'}`;
    const learned = this.correctionPatterns.get(patternKey);

    if (learned && learned.count >= 2) {
      // This classification was corrected multiple times — reduce confidence
      const penalty = Math.min(learned.count * 0.1, 0.4);
      result.confidence = Math.max(0, result.confidence - penalty);
      result.ambiguous = true;
      result.clarifyingQuestions = result.clarifyingQuestions || [];
      result.clarifyingQuestions.push(
        `Last time you corrected this to "${learned.correctedText}". Did you mean that again?`
      );
    }
  }

  /**
   * Learn from past corrections to adjust future classifications
   */
  enhanceWithCorrections(result, message) {
    if (this.corrections.length === 0) return;

    const relevantCorrections = this.corrections.filter(c => {
      return c.original.intent === result.intent ||
        c.original.project === result.project;
    });

    if (relevantCorrections.length === 0) return;

    const correctionRate = relevantCorrections.length / this.corrections.length;
    if (correctionRate > 0.2) {
      result.confidence *= (1 - correctionRate * 0.3);
      result.confidenceFactors.historyMatch *= (1 - correctionRate * 0.3);

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
   */
  getCorrectionStats() {
    const stats = {
      totalCorrections: this.corrections.length,
      learnedPatterns: this.correctionPatterns.size,
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

  getUserHistory(userId) {
    return this.userHistory.get(userId) || null;
  }

  clearUserHistory(userId) {
    this.userHistory.delete(userId);
    console.log(`[IntentClassifier] Cleared history for user ${userId}`);
  }

  getThresholds() {
    return {
      ambiguityThreshold: this.ambiguityThreshold,
      clarificationThreshold: this.clarificationThreshold
    };
  }

  setThresholds(thresholds) {
    if (typeof thresholds.ambiguityThreshold === 'number') {
      this.ambiguityThreshold = thresholds.ambiguityThreshold;
    }
    if (typeof thresholds.clarificationThreshold === 'number') {
      this.clarificationThreshold = thresholds.clarificationThreshold;
    }
  }

  /**
   * Get tracked user count for diagnostics
   */
  getTrackedUserCount() {
    return this.userHistory.size;
  }
}

// Singleton
const classifier = new IntentClassifier();
module.exports = classifier;
