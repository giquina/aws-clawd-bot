/**
 * Command Decomposer - Splits compound natural language commands into sequential steps
 *
 * Handles patterns like:
 * - "Run tests on JUDO and then deploy if they pass"
 * - "Check logs and restart clawd-bot"
 * - "Deploy JUDO and then deploy LusoTown"
 *
 * @module lib/command-decomposer
 */

/**
 * @typedef {Object} DecomposedPlan
 * @property {string[]} steps - Individual command strings
 * @property {boolean} isConditional - Whether steps have success conditions
 * @property {string|null} condition - Condition type ('success', null)
 * @property {string} original - Original compound message
 */

// Conjunction patterns that split compound commands
const SPLIT_PATTERNS = [
  /\s+and\s+then\s+/i,
  /\s+then\s+/i,
  /\s+after\s+that\s+/i,
  /\s+followed\s+by\s+/i,
  /\s+and\s+also\s+/i,
  /,\s+then\s+/i,
  /\.\s+Then\s+/,
  /;\s+/,
];

// Conditional patterns
const CONDITIONAL_PATTERNS = [
  /^(.+?)\s+(?:and\s+)?if\s+(?:they|it|that|tests?)\s+pass(?:es)?\s*(?:,?\s*then\s+)?(.+)$/i,
  /^(.+?)\s+(?:and\s+)?if\s+(?:it's|its|that's|that is)\s+(?:ok|okay|good|successful|fine)\s*(?:,?\s*then\s+)?(.+)$/i,
  /^if\s+(.+?)\s+(?:passes?|succeeds?|works?)\s*(?:,?\s*then\s+)?(.+)$/i,
];

// Command verbs that indicate this is actually a compound command
const COMMAND_VERBS = [
  'deploy', 'restart', 'build', 'install', 'run', 'test', 'check',
  'logs', 'status', 'vercel', 'exec', 'create', 'delete', 'push'
];

/**
 * Attempt to decompose a compound command into sequential steps
 * @param {string} message - The user's message
 * @param {Object} [context={}] - Optional context (autoRepo, etc.)
 * @returns {DecomposedPlan|null} Decomposed plan, or null if not a compound command
 */
function decompose(message, context = {}) {
  if (!message || typeof message !== 'string') return null;

  const trimmed = message.trim();

  // Must be long enough to be compound (at least 2 command-like parts)
  if (trimmed.split(/\s+/).length < 5) return null;

  // Check for conditional patterns first (higher priority)
  for (const pattern of CONDITIONAL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const step1 = match[1].trim();
      const step2 = match[2].trim();

      // Both parts must look like commands
      if (looksLikeCommand(step1) && looksLikeCommand(step2)) {
        return {
          steps: [step1, step2],
          isConditional: true,
          condition: 'success',
          original: trimmed
        };
      }
    }
  }

  // Try splitting on conjunction patterns
  for (const pattern of SPLIT_PATTERNS) {
    if (pattern.test(trimmed)) {
      const parts = trimmed.split(pattern).map(p => p.trim()).filter(p => p.length > 0);

      if (parts.length >= 2) {
        // All parts must look like commands
        const allCommands = parts.every(p => looksLikeCommand(p));
        if (allCommands) {
          return {
            steps: parts,
            isConditional: false,
            condition: null,
            original: trimmed
          };
        }
      }
    }
  }

  // Special case: "X and Y" where both X and Y start with command verbs
  const andSplit = trimmed.split(/\s+and\s+/i);
  if (andSplit.length === 2) {
    const [part1, part2] = andSplit.map(p => p.trim());
    if (looksLikeCommand(part1) && looksLikeCommand(part2)) {
      return {
        steps: [part1, part2],
        isConditional: false,
        condition: null,
        original: trimmed
      };
    }
  }

  return null;
}

/**
 * Check if a string fragment looks like it could be a command
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function looksLikeCommand(text) {
  if (!text) return false;
  const firstWord = text.trim().split(/\s+/)[0].toLowerCase();
  return COMMAND_VERBS.includes(firstWord);
}

/**
 * Format a decomposed plan for user confirmation
 * @param {DecomposedPlan} plan - The decomposed plan
 * @returns {string} Formatted confirmation message
 */
function formatPlan(plan) {
  const lines = ["I'll do this in order:"];

  plan.steps.forEach((step, i) => {
    const prefix = plan.isConditional && i > 0 ? `If step ${i} succeeds → ` : '';
    lines.push(`${i + 1}. ${prefix}${step}`);
  });

  lines.push('');
  lines.push('Reply "yes" to proceed or "no" to cancel.');

  return lines.join('\n');
}

module.exports = { decompose, formatPlan, looksLikeCommand };
