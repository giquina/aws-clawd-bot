/**
 * CommandIntent - Structured command object that flows through the routing pipeline
 *
 * Replaces raw string passing between smart-router → skill-registry → skills.
 * Backward compatible: toString() produces a command string for skills that
 * haven't been updated to read structured fields.
 *
 * @module lib/command-intent
 */

class CommandIntent {
  /**
   * @param {Object} options
   * @param {string} options.action - The command verb ("deploy", "restart", "logs", "vercel deploy")
   * @param {string} [options.target] - The target ("JUDO", "clawd-bot", "GQCARS")
   * @param {Object} [options.args={}] - Additional arguments ({ production: true, force: false })
   * @param {number} [options.confidence=1.0] - Routing confidence (0.0-1.0)
   * @param {string} [options.source='direct'] - How this was routed ("pattern", "ai", "intent-classifier", "direct", "anaphoric")
   * @param {string} [options.originalMessage=''] - The user's original natural language message
   * @param {string} [options.risk='low'] - Risk level ("low", "medium", "high")
   * @param {boolean} [options.requiresConfirmation=false] - Whether this needs user confirmation
   */
  constructor({
    action,
    target = null,
    args = {},
    confidence = 1.0,
    source = 'direct',
    originalMessage = '',
    risk = 'low',
    requiresConfirmation = false
  }) {
    this.action = action;
    this.target = target;
    this.args = args;
    this.confidence = confidence;
    this.source = source;
    this.originalMessage = originalMessage;
    this.risk = risk;
    this.requiresConfirmation = requiresConfirmation;
    this.timestamp = Date.now();
  }

  /**
   * Backward-compatible string conversion.
   * Skills that haven't been updated to read structured fields
   * still see a command string.
   * @returns {string}
   */
  toString() {
    const parts = [this.action];
    if (this.target) parts.push(this.target);

    // Append any positional args
    for (const [key, value] of Object.entries(this.args)) {
      if (value === true) {
        parts.push(`--${key}`);
      } else if (value !== false && value != null) {
        parts.push(String(value));
      }
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Check if this intent was routed with high confidence
   * @param {number} [threshold=0.7] - Minimum confidence threshold
   * @returns {boolean}
   */
  isHighConfidence(threshold = 0.7) {
    return this.confidence >= threshold;
  }

  /**
   * Check if the command targets a dangerous action
   * @returns {boolean}
   */
  isDangerous() {
    return this.risk === 'high' || this.requiresConfirmation;
  }

  /**
   * Check if the transformation changed the message
   * @returns {boolean}
   */
  wasTransformed() {
    return this.originalMessage && this.toString() !== this.originalMessage;
  }

  /**
   * Create a CommandIntent from a plain string (for backward compatibility)
   * @param {string} commandStr - A command string like "deploy JUDO"
   * @param {Object} [meta={}] - Optional metadata
   * @returns {CommandIntent}
   */
  static fromString(commandStr, meta = {}) {
    const parts = commandStr.trim().split(/\s+/);
    const action = parts[0] || '';
    const target = parts[1] || null;
    const rest = parts.slice(2);

    // Parse remaining parts as args
    const args = {};
    for (const part of rest) {
      if (part.startsWith('--')) {
        args[part.slice(2)] = true;
      } else {
        // Positional arg - use index as key
        const idx = Object.keys(args).length;
        args[`arg${idx}`] = part;
      }
    }

    return new CommandIntent({
      action,
      target,
      args,
      originalMessage: meta.originalMessage || commandStr,
      source: meta.source || 'direct',
      confidence: meta.confidence || 1.0,
      risk: meta.risk || 'low',
      requiresConfirmation: meta.requiresConfirmation || false
    });
  }

  /**
   * Serialize for logging/debugging
   * @returns {Object}
   */
  toJSON() {
    return {
      action: this.action,
      target: this.target,
      args: this.args,
      confidence: this.confidence,
      source: this.source,
      originalMessage: this.originalMessage,
      risk: this.risk,
      requiresConfirmation: this.requiresConfirmation,
      command: this.toString()
    };
  }
}

module.exports = CommandIntent;
