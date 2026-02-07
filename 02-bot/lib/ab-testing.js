/**
 * A/B Testing Framework for NL Routing Parameters
 *
 * Allows testing different SmartRouter/IntentClassifier thresholds on different
 * user groups to find optimal values. Uses consistent hashing for deterministic
 * variant assignment so the same user always sees the same variant.
 *
 * Persistence: saves to data/ab-experiments.json
 * Export: singleton instance
 *
 * @example
 *   const abTesting = require('./lib/ab-testing');
 *   abTesting.createExperiment('nl-thresholds-v1', {
 *     description: 'Test different ambiguity thresholds',
 *     variants: [
 *       { name: 'control', weight: 50, params: { ambiguityThreshold: 0.5 } },
 *       { name: 'aggressive', weight: 25, params: { ambiguityThreshold: 0.4 } },
 *       { name: 'conservative', weight: 25, params: { ambiguityThreshold: 0.6 } }
 *     ]
 *   });
 *   const params = abTesting.applyVariant('nl-thresholds-v1', userId);
 *   // params = { ambiguityThreshold: 0.4 } (for users assigned to 'aggressive')
 */

const path = require('path');
const fs = require('fs');

/** @type {string} Path to persisted experiments file */
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ab-experiments.json');

/**
 * @typedef {Object} VariantConfig
 * @property {string} name - Variant name (e.g., 'control', 'aggressive')
 * @property {number} weight - Relative weight for assignment (e.g., 50, 25)
 * @property {Object} params - Parameter overrides to apply for this variant
 * @property {number} [params.ambiguityThreshold] - IntentClassifier ambiguity threshold
 * @property {number} [params.clarificationThreshold] - IntentClassifier clarification threshold
 * @property {number} [params.aiTimeoutMs] - AI call timeout in milliseconds
 * @property {Object} [params.confidenceWeights] - Confidence weight overrides
 */

/**
 * @typedef {Object} OutcomeRecord
 * @property {string} variant - Which variant the user was assigned to
 * @property {boolean} success - Whether the routing was successful
 * @property {boolean} corrected - Whether the user corrected the routing
 * @property {number} latencyMs - Response latency in milliseconds
 * @property {number} timestamp - When the outcome was recorded
 */

/**
 * @typedef {Object} Experiment
 * @property {string} id - Unique experiment identifier
 * @property {string} description - Human-readable description
 * @property {string} status - 'active' | 'paused' | 'completed'
 * @property {number} createdAt - Creation timestamp
 * @property {number} [endedAt] - Completion timestamp
 * @property {string} [promotedVariant] - Winning variant if promoted
 * @property {VariantConfig[]} variants - Array of variant configurations
 * @property {Object.<string, OutcomeRecord[]>} outcomes - userId -> outcome records
 */

/**
 * @typedef {Object} VariantStats
 * @property {number} participants - Number of unique users assigned
 * @property {number} successRate - Fraction of successful outcomes (0.0-1.0)
 * @property {number} correctionRate - Fraction of corrected outcomes (0.0-1.0)
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} outcomes - Total number of outcome records
 */

/**
 * @typedef {Object} ExperimentResults
 * @property {string} experimentId - Experiment identifier
 * @property {string} status - Current experiment status
 * @property {number} totalParticipants - Total unique users across all variants
 * @property {Object.<string, VariantStats>} variants - Stats per variant
 * @property {string|null} winner - Name of the winning variant, or null if insufficient data
 */

/**
 * DJB2 hash function. Simple, fast, deterministic string hash.
 * Not cryptographic -- just needs consistent distribution.
 *
 * @param {string} str - Input string to hash
 * @returns {number} Non-negative 32-bit integer hash
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

class ABTestingFramework {
  constructor() {
    /** @type {Map<string, Experiment>} */
    this.experiments = new Map();

    /** @type {boolean} Whether data has been loaded from disk */
    this._loaded = false;

    this.load();
  }

  // ============================================================================
  // EXPERIMENT LIFECYCLE
  // ============================================================================

  /**
   * Create a new A/B testing experiment.
   *
   * @param {string} experimentId - Unique identifier for the experiment
   * @param {Object} config - Experiment configuration
   * @param {string} config.description - Human-readable description
   * @param {VariantConfig[]} config.variants - Array of variant definitions
   * @returns {Experiment} The created experiment
   * @throws {Error} If experimentId already exists or config is invalid
   */
  createExperiment(experimentId, config) {
    if (!experimentId || typeof experimentId !== 'string') {
      throw new Error('experimentId must be a non-empty string');
    }

    if (this.experiments.has(experimentId)) {
      throw new Error(`Experiment "${experimentId}" already exists`);
    }

    if (!config || !Array.isArray(config.variants) || config.variants.length < 2) {
      throw new Error('config.variants must be an array with at least 2 variants');
    }

    // Validate each variant
    const variantNames = new Set();
    for (const variant of config.variants) {
      if (!variant.name || typeof variant.name !== 'string') {
        throw new Error('Each variant must have a non-empty string name');
      }
      if (variantNames.has(variant.name)) {
        throw new Error(`Duplicate variant name: "${variant.name}"`);
      }
      variantNames.add(variant.name);

      if (typeof variant.weight !== 'number' || variant.weight <= 0) {
        throw new Error(`Variant "${variant.name}" must have a positive weight`);
      }
      if (!variant.params || typeof variant.params !== 'object') {
        throw new Error(`Variant "${variant.name}" must have a params object`);
      }
    }

    /** @type {Experiment} */
    const experiment = {
      id: experimentId,
      description: config.description || '',
      status: 'active',
      createdAt: Date.now(),
      variants: config.variants.map(v => ({
        name: v.name,
        weight: v.weight,
        params: { ...v.params }
      })),
      outcomes: {}
    };

    this.experiments.set(experimentId, experiment);
    this.save();

    console.log(`[ABTesting] Created experiment "${experimentId}" with ${config.variants.length} variants`);
    return experiment;
  }

  /**
   * End an experiment and optionally promote the winning variant.
   * Once ended, the experiment moves to 'completed' status and no new
   * outcomes can be recorded. If promoteWinner is true, the variant with
   * the best composite score is identified and returned.
   *
   * @param {string} experimentId - Experiment to end
   * @param {boolean} [promoteWinner=false] - Whether to identify and promote the winner
   * @returns {{ experiment: Experiment, winner: string|null, winnerParams: Object|null }}
   * @throws {Error} If experiment not found or already completed
   */
  endExperiment(experimentId, promoteWinner = false) {
    const experiment = this._getExperiment(experimentId);

    if (experiment.status === 'completed') {
      throw new Error(`Experiment "${experimentId}" is already completed`);
    }

    experiment.status = 'completed';
    experiment.endedAt = Date.now();

    let winner = null;
    let winnerParams = null;

    if (promoteWinner) {
      const results = this.getResults(experimentId);
      if (results.winner) {
        winner = results.winner;
        experiment.promotedVariant = winner;
        const winnerVariant = experiment.variants.find(v => v.name === winner);
        winnerParams = winnerVariant ? { ...winnerVariant.params } : null;
      }
    }

    this.save();
    console.log(`[ABTesting] Ended experiment "${experimentId}"${winner ? `, promoted winner: "${winner}"` : ''}`);

    return { experiment, winner, winnerParams };
  }

  /**
   * List all experiments with their status.
   *
   * @returns {Array<{ id: string, description: string, status: string, variants: number, totalOutcomes: number, createdAt: number }>}
   */
  listExperiments() {
    const list = [];

    for (const experiment of this.experiments.values()) {
      let totalOutcomes = 0;
      for (const userOutcomes of Object.values(experiment.outcomes)) {
        totalOutcomes += userOutcomes.length;
      }

      list.push({
        id: experiment.id,
        description: experiment.description,
        status: experiment.status,
        variants: experiment.variants.length,
        totalOutcomes,
        createdAt: experiment.createdAt
      });
    }

    return list;
  }

  // ============================================================================
  // VARIANT ASSIGNMENT
  // ============================================================================

  /**
   * Get the variant assignment for a user in a given experiment.
   * Uses consistent hashing so the same user always gets the same variant.
   *
   * @param {string} experimentId - Experiment identifier
   * @param {string} userId - User identifier (chat ID, etc.)
   * @returns {{ name: string, params: Object }} The assigned variant's name and parameters
   * @throws {Error} If experiment not found
   */
  getVariant(experimentId, userId) {
    const experiment = this._getExperiment(experimentId);

    if (!userId || typeof userId !== 'string') {
      // Default to first variant for invalid userId
      const fallback = experiment.variants[0];
      return { name: fallback.name, params: { ...fallback.params } };
    }

    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const hash = djb2Hash(experimentId + ':' + userId);
    const bucket = hash % totalWeight;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return { name: variant.name, params: { ...variant.params } };
      }
    }

    // Should not reach here, but fallback to last variant
    const last = experiment.variants[experiment.variants.length - 1];
    return { name: last.name, params: { ...last.params } };
  }

  /**
   * Apply a variant's parameters to the SmartRouter and IntentClassifier
   * for the current request. Returns the variant parameters that were applied.
   *
   * Supported parameters:
   * - ambiguityThreshold: sets IntentClassifier.ambiguityThreshold
   * - clarificationThreshold: sets IntentClassifier.clarificationThreshold
   * - aiTimeoutMs: sets IntentClassifier.aiTimeoutMs and SmartRouter.aiTimeoutMs
   * - confidenceWeights: sets IntentClassifier.confidenceWeights
   *
   * @param {string} experimentId - Experiment identifier
   * @param {string} userId - User identifier
   * @returns {{ variantName: string, params: Object }} Applied variant info
   * @throws {Error} If experiment not found or not active
   */
  applyVariant(experimentId, userId) {
    const experiment = this._getExperiment(experimentId);

    if (experiment.status !== 'active') {
      // For non-active experiments, return variant info but do not apply
      const variant = this.getVariant(experimentId, userId);
      return { variantName: variant.name, params: variant.params, applied: false };
    }

    const variant = this.getVariant(experimentId, userId);
    const params = variant.params;

    // Lazy-load to avoid circular dependencies
    try {
      const intentClassifier = require('./intent-classifier');

      if (typeof params.ambiguityThreshold === 'number') {
        intentClassifier.ambiguityThreshold = params.ambiguityThreshold;
      }
      if (typeof params.clarificationThreshold === 'number') {
        intentClassifier.clarificationThreshold = params.clarificationThreshold;
      }
      if (typeof params.aiTimeoutMs === 'number') {
        intentClassifier.aiTimeoutMs = params.aiTimeoutMs;
      }
      if (params.confidenceWeights && typeof params.confidenceWeights === 'object') {
        Object.assign(intentClassifier.confidenceWeights, params.confidenceWeights);
      }
    } catch (err) {
      console.warn('[ABTesting] Could not load intent-classifier:', err.message);
    }

    try {
      const smartRouter = require('../hooks/smart-router');

      if (typeof params.aiTimeoutMs === 'number') {
        smartRouter.aiTimeoutMs = params.aiTimeoutMs;
      }
    } catch (err) {
      console.warn('[ABTesting] Could not load smart-router:', err.message);
    }

    return { variantName: variant.name, params, applied: true };
  }

  // ============================================================================
  // OUTCOME TRACKING
  // ============================================================================

  /**
   * Record an outcome for a user's variant in an experiment.
   *
   * @param {string} experimentId - Experiment identifier
   * @param {string} userId - User identifier
   * @param {Object} outcome - Outcome data
   * @param {boolean} outcome.success - Whether the routing was successful
   * @param {boolean} [outcome.corrected=false] - Whether the user corrected the result
   * @param {number} [outcome.latencyMs=0] - Response latency in milliseconds
   * @returns {OutcomeRecord} The recorded outcome
   * @throws {Error} If experiment not found or completed
   */
  recordOutcome(experimentId, userId, outcome) {
    const experiment = this._getExperiment(experimentId);

    if (experiment.status === 'completed') {
      throw new Error(`Experiment "${experimentId}" is completed; cannot record new outcomes`);
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }

    if (!outcome || typeof outcome !== 'object') {
      throw new Error('outcome must be an object with at least a "success" boolean');
    }

    if (typeof outcome.success !== 'boolean') {
      throw new Error('outcome.success must be a boolean');
    }

    const variant = this.getVariant(experimentId, userId);

    /** @type {OutcomeRecord} */
    const record = {
      variant: variant.name,
      success: outcome.success,
      corrected: outcome.corrected === true,
      latencyMs: typeof outcome.latencyMs === 'number' ? outcome.latencyMs : 0,
      timestamp: Date.now()
    };

    if (!experiment.outcomes[userId]) {
      experiment.outcomes[userId] = [];
    }
    experiment.outcomes[userId].push(record);

    this.save();
    return record;
  }

  // ============================================================================
  // RESULTS AND ANALYSIS
  // ============================================================================

  /**
   * Get experiment results with statistical summary for each variant.
   *
   * The winner is determined by a composite score:
   *   score = successRate - (correctionRate * 0.5)
   * This rewards high success and penalizes frequent corrections.
   * Ties are broken by lower average latency.
   * A variant needs at least 5 outcomes to be eligible as winner.
   *
   * @param {string} experimentId - Experiment identifier
   * @returns {ExperimentResults} Results with per-variant statistics
   * @throws {Error} If experiment not found
   */
  getResults(experimentId) {
    const experiment = this._getExperiment(experimentId);

    /** @type {Object.<string, { participants: Set<string>, successes: number, corrections: number, totalLatency: number, count: number }>} */
    const variantAccumulators = {};

    // Initialize accumulators for each variant
    for (const variant of experiment.variants) {
      variantAccumulators[variant.name] = {
        participants: new Set(),
        successes: 0,
        corrections: 0,
        totalLatency: 0,
        count: 0
      };
    }

    // Aggregate outcomes across all users
    for (const [userId, userOutcomes] of Object.entries(experiment.outcomes)) {
      for (const outcome of userOutcomes) {
        const acc = variantAccumulators[outcome.variant];
        if (!acc) continue; // Skip outcomes for removed variants

        acc.participants.add(userId);
        acc.count++;
        if (outcome.success) acc.successes++;
        if (outcome.corrected) acc.corrections++;
        acc.totalLatency += outcome.latencyMs;
      }
    }

    // Build variant stats
    /** @type {Object.<string, VariantStats>} */
    const variantStats = {};
    let totalParticipants = new Set();

    for (const [name, acc] of Object.entries(variantAccumulators)) {
      for (const uid of acc.participants) {
        totalParticipants.add(uid);
      }

      variantStats[name] = {
        participants: acc.participants.size,
        successRate: acc.count > 0 ? acc.successes / acc.count : 0,
        correctionRate: acc.count > 0 ? acc.corrections / acc.count : 0,
        avgLatencyMs: acc.count > 0 ? Math.round(acc.totalLatency / acc.count) : 0,
        outcomes: acc.count
      };
    }

    // Determine winner using composite score
    const minOutcomesForWinner = 5;
    let winner = null;
    let bestScore = -Infinity;
    let bestLatency = Infinity;

    for (const [name, stats] of Object.entries(variantStats)) {
      if (stats.outcomes < minOutcomesForWinner) continue;

      // Composite score: high success, low corrections
      const score = stats.successRate - (stats.correctionRate * 0.5);

      if (score > bestScore || (score === bestScore && stats.avgLatencyMs < bestLatency)) {
        bestScore = score;
        bestLatency = stats.avgLatencyMs;
        winner = name;
      }
    }

    return {
      experimentId,
      status: experiment.status,
      totalParticipants: totalParticipants.size,
      variants: variantStats,
      winner
    };
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Load experiments from disk. Called automatically on construction.
   * Creates the data directory if it does not exist.
   */
  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (Array.isArray(data.experiments)) {
          for (const exp of data.experiments) {
            if (exp && exp.id) {
              this.experiments.set(exp.id, exp);
            }
          }
        }

        console.log(`[ABTesting] Loaded ${this.experiments.size} experiment(s) from disk`);
      }

      this._loaded = true;
    } catch (err) {
      console.error('[ABTesting] Failed to load experiments:', err.message);
      this._loaded = true; // Mark as loaded even on error to prevent re-attempts
    }
  }

  /**
   * Save all experiments to disk. Called automatically after every state change.
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        _version: 1,
        _savedAt: new Date().toISOString(),
        experiments: Array.from(this.experiments.values())
      };

      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[ABTesting] Failed to save experiments:', err.message);
    }
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /**
   * Retrieve an experiment by ID or throw.
   *
   * @param {string} experimentId - Experiment identifier
   * @returns {Experiment}
   * @throws {Error} If experiment not found
   * @private
   */
  _getExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" not found`);
    }
    return experiment;
  }
}

// Export as singleton
const abTesting = new ABTestingFramework();
module.exports = abTesting;
