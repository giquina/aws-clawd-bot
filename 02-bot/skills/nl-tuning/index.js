/**
 * NL Tuning Skill - Live-tune NL command routing thresholds and view diagnostics
 *
 * Commands:
 *   nl status / nl stats / nl metrics  - Show NL routing metrics
 *   nl thresholds                      - Show all current thresholds
 *   nl set <param> <value>             - Set a threshold value at runtime
 *   nl cache clear                     - Clear SmartRouter cache
 *   nl cache stats                     - Show cache statistics
 *   nl corrections                     - Show correction learning stats
 *   nl test "<message>"                - Test how a message would be routed
 */

const BaseSkill = require('../base-skill');

// Lazy-loaded singletons (avoid circular dependency issues at require time)
let smartRouter = null;
let intentClassifier = null;

function getSmartRouter() {
  if (!smartRouter) {
    try {
      smartRouter = require('../../hooks/smart-router');
    } catch (e) {
      console.error('[NLTuning] Failed to load SmartRouter:', e.message);
    }
  }
  return smartRouter;
}

function getIntentClassifier() {
  if (!intentClassifier) {
    try {
      intentClassifier = require('../../lib/intent-classifier');
    } catch (e) {
      console.error('[NLTuning] Failed to load IntentClassifier:', e.message);
    }
  }
  return intentClassifier;
}

class NLTuningSkill extends BaseSkill {
  name = 'nl-tuning';
  description = 'Live-tune NL routing thresholds and view diagnostics';
  priority = 15;

  commands = [
    { pattern: /^nl\s+(status|stats|metrics)$/i, description: 'Show NL routing stats', usage: 'nl status' },
    { pattern: /^nl\s+thresholds$/i, description: 'Show all current thresholds', usage: 'nl thresholds' },
    { pattern: /^nl\s+set\s+\S+\s+\S+$/i, description: 'Set a threshold value', usage: 'nl set ambiguity 0.6' },
    { pattern: /^nl\s+cache\s+clear$/i, description: 'Clear SmartRouter cache', usage: 'nl cache clear' },
    { pattern: /^nl\s+cache\s+stats$/i, description: 'Show cache statistics', usage: 'nl cache stats' },
    { pattern: /^nl\s+corrections$/i, description: 'Show correction learning stats', usage: 'nl corrections' },
    { pattern: /^nl\s+test\s+.+$/i, description: 'Test message routing without executing', usage: 'nl test "deploy judo"' }
  ];

  async execute(command, context) {
    const cmd = (command || '').trim();
    const lowerCmd = cmd.toLowerCase();

    // nl status / nl stats / nl metrics
    if (/^nl\s+(status|stats|metrics)$/i.test(lowerCmd)) {
      return this.showStatus();
    }

    // nl thresholds
    if (/^nl\s+thresholds$/i.test(lowerCmd)) {
      return this.showThresholds();
    }

    // nl set <param> <value>
    const setMatch = lowerCmd.match(/^nl\s+set\s+(\S+)\s+(\S+)$/i);
    if (setMatch) {
      return this.setThreshold(setMatch[1], setMatch[2]);
    }

    // nl cache clear
    if (/^nl\s+cache\s+clear$/i.test(lowerCmd)) {
      return this.clearCache();
    }

    // nl cache stats
    if (/^nl\s+cache\s+stats$/i.test(lowerCmd)) {
      return this.showCacheStats();
    }

    // nl corrections
    if (/^nl\s+corrections$/i.test(lowerCmd)) {
      return this.showCorrections();
    }

    // nl test "<message>" or nl test <message>
    const testMatch = cmd.match(/^nl\s+test\s+(.+)$/i);
    if (testMatch) {
      const testMsg = testMatch[1].replace(/^["']|["']$/g, '').trim();
      return this.testRoute(testMsg, context);
    }

    return this.error('Unknown nl-tuning command', null, {
      suggestion: 'Try: nl status, nl thresholds, nl set <param> <value>, nl cache clear, nl cache stats, nl corrections, nl test "<msg>"'
    });
  }

  // ---------------------------------------------------------------------------
  // nl status / nl stats / nl metrics
  // ---------------------------------------------------------------------------

  showStatus() {
    const router = getSmartRouter();
    const classifier = getIntentClassifier();

    if (!router && !classifier) {
      return this.error('Neither SmartRouter nor IntentClassifier are available');
    }

    let response = '*NL Routing Diagnostics*\n\n';

    // SmartRouter metrics
    if (router) {
      const metrics = router.getMetrics();
      response += '*SmartRouter*\n';
      response += '```\n';
      response += `Pattern hits:    ${String(metrics.patternHits).padStart(6)}\n`;
      response += `AI hits:         ${String(metrics.aiHits).padStart(6)}\n`;
      response += `Passthroughs:    ${String(metrics.passthroughs).padStart(6)}\n`;
      response += `Cache hits:      ${String(metrics.cacheHits).padStart(6)}\n`;
      response += `Total:           ${String(metrics.total).padStart(6)}\n`;
      response += `Pattern rate:    ${metrics.patternRate.padStart(6)}\n`;
      response += `Cache rate:      ${metrics.cacheRate.padStart(6)}\n`;
      response += '```\n\n';
    }

    // IntentClassifier stats
    if (classifier) {
      const corrStats = classifier.getCorrectionStats();
      const thresholds = classifier.getThresholds();
      const trackedUsers = classifier.getTrackedUserCount();

      response += '*IntentClassifier*\n';
      response += '```\n';
      response += `Corrections:     ${String(corrStats.totalCorrections).padStart(6)}\n`;
      response += `Learned patterns:${String(corrStats.learnedPatterns).padStart(6)}\n`;
      response += `Tracked users:   ${String(trackedUsers).padStart(6)}\n`;
      response += `Ambiguity thr:   ${String(thresholds.ambiguityThreshold).padStart(6)}\n`;
      response += `Clarify thr:     ${String(thresholds.clarificationThreshold).padStart(6)}\n`;
      response += '```\n';
    }

    return this.success(response);
  }

  // ---------------------------------------------------------------------------
  // nl thresholds
  // ---------------------------------------------------------------------------

  showThresholds() {
    const router = getSmartRouter();
    const classifier = getIntentClassifier();

    if (!router && !classifier) {
      return this.error('Neither SmartRouter nor IntentClassifier are available');
    }

    let response = '*NL Routing Thresholds*\n\n';

    if (router) {
      response += '*SmartRouter*\n';
      response += '```\n';
      response += `cache-ttl:       ${String(router.cacheMaxAge).padStart(8)} ms\n`;
      response += `cache-size:      ${String(router.cacheMaxSize).padStart(8)}\n`;
      response += `ai-timeout:      ${String(router.aiTimeoutMs).padStart(8)} ms\n`;
      response += '```\n\n';
    }

    if (classifier) {
      const thresholds = classifier.getThresholds();
      const weights = classifier.confidenceWeights;

      response += '*IntentClassifier*\n';
      response += '```\n';
      response += `ambiguity:       ${String(thresholds.ambiguityThreshold).padStart(8)}\n`;
      response += `clarification:   ${String(thresholds.clarificationThreshold).padStart(8)}\n`;
      response += '```\n\n';

      response += '*Confidence Weights*\n';
      response += '```\n';
      response += `keywordMatch:    ${String(weights.keywordMatch).padStart(8)}\n`;
      response += `contextMatch:    ${String(weights.contextMatch).padStart(8)}\n`;
      response += `historyMatch:    ${String(weights.historyMatch).padStart(8)}\n`;
      response += `specificity:     ${String(weights.specificity).padStart(8)}\n`;
      response += '```\n';
    }

    return this.success(response);
  }

  // ---------------------------------------------------------------------------
  // nl set <param> <value>
  // ---------------------------------------------------------------------------

  setThreshold(param, rawValue) {
    const router = getSmartRouter();
    const classifier = getIntentClassifier();
    const value = parseFloat(rawValue);

    if (isNaN(value)) {
      return this.error(`Invalid value "${rawValue}". Must be a number.`);
    }

    switch (param.toLowerCase()) {
      // IntentClassifier thresholds (0-1 range)
      case 'ambiguity': {
        if (value < 0 || value > 1) {
          return this.error('ambiguity must be between 0 and 1');
        }
        if (!classifier) {
          return this.error('IntentClassifier not available');
        }
        classifier.setThresholds({ ambiguityThreshold: value });
        return this.success(`*ambiguity* threshold set to *${value}*\n\nMessages with confidence below ${value} will be flagged as ambiguous.`);
      }

      case 'clarification': {
        if (value < 0 || value > 1) {
          return this.error('clarification must be between 0 and 1');
        }
        if (!classifier) {
          return this.error('IntentClassifier not available');
        }
        classifier.setThresholds({ clarificationThreshold: value });
        return this.success(`*clarification* threshold set to *${value}*\n\nMessages with confidence below ${value} will trigger clarifying questions.`);
      }

      // SmartRouter thresholds
      case 'ai-timeout': {
        if (value < 500 || value > 30000) {
          return this.error('ai-timeout must be between 500 and 30000 ms');
        }
        if (!router) {
          return this.error('SmartRouter not available');
        }
        router.aiTimeoutMs = value;
        return this.success(`*ai-timeout* set to *${value}ms*\n\nAI routing calls will timeout after ${value}ms.`);
      }

      case 'cache-ttl': {
        if (value < 0 || value > 3600000) {
          return this.error('cache-ttl must be between 0 and 3600000 ms (1 hour)');
        }
        if (!router) {
          return this.error('SmartRouter not available');
        }
        router.cacheMaxAge = value;
        return this.success(`*cache-ttl* set to *${value}ms*\n\nCached route entries will expire after ${(value / 1000).toFixed(1)}s.`);
      }

      case 'cache-size': {
        if (value < 10 || value > 10000) {
          return this.error('cache-size must be between 10 and 10000');
        }
        if (!router) {
          return this.error('SmartRouter not available');
        }
        router.cacheMaxSize = Math.floor(value);
        return this.success(`*cache-size* set to *${Math.floor(value)}*\n\nSmartRouter will keep at most ${Math.floor(value)} cached entries.`);
      }

      default:
        return this.error(`Unknown parameter "${param}"`, null, {
          suggestion: 'Supported: ambiguity, clarification, ai-timeout, cache-ttl, cache-size'
        });
    }
  }

  // ---------------------------------------------------------------------------
  // nl cache clear
  // ---------------------------------------------------------------------------

  clearCache() {
    const router = getSmartRouter();
    if (!router) {
      return this.error('SmartRouter not available');
    }

    const previousSize = router.cache.size;
    router.cache.clear();

    return this.success(`SmartRouter cache cleared\n\nRemoved *${previousSize}* cached entries.`);
  }

  // ---------------------------------------------------------------------------
  // nl cache stats
  // ---------------------------------------------------------------------------

  showCacheStats() {
    const router = getSmartRouter();
    if (!router) {
      return this.error('SmartRouter not available');
    }

    const stats = router.getCacheStats();

    let response = '*SmartRouter Cache*\n\n';
    response += '```\n';
    response += `Entries:         ${String(stats.size).padStart(6)} / ${stats.maxSize}\n`;
    response += `Max age:         ${String(stats.maxAge).padStart(6)} ms (${(stats.maxAge / 1000).toFixed(0)}s)\n`;
    response += `AI enabled:      ${String(stats.aiEnabled).padStart(6)}\n`;
    response += `AI timeout:      ${String(stats.aiTimeoutMs).padStart(6)} ms\n`;
    response += '```\n\n';

    response += '*Routing Metrics*\n';
    response += '```\n';
    response += `Pattern hits:    ${String(stats.metrics.patternHits).padStart(6)}\n`;
    response += `AI hits:         ${String(stats.metrics.aiHits).padStart(6)}\n`;
    response += `Passthroughs:    ${String(stats.metrics.passthroughs).padStart(6)}\n`;
    response += `Cache hits:      ${String(stats.metrics.cacheHits).padStart(6)}\n`;
    response += '```\n';

    // Utilization percentage
    const utilPct = stats.maxSize > 0 ? ((stats.size / stats.maxSize) * 100).toFixed(1) : '0.0';
    response += `\n_Cache utilization: ${utilPct}%_`;

    return this.success(response);
  }

  // ---------------------------------------------------------------------------
  // nl corrections
  // ---------------------------------------------------------------------------

  showCorrections() {
    const classifier = getIntentClassifier();
    if (!classifier) {
      return this.error('IntentClassifier not available');
    }

    const stats = classifier.getCorrectionStats();

    let response = '*Intent Correction Stats*\n\n';
    response += '```\n';
    response += `Total corrections:  ${stats.totalCorrections}\n`;
    response += `Learned patterns:   ${stats.learnedPatterns}\n`;
    response += '```\n';

    // By intent breakdown
    const intentEntries = Object.entries(stats.byIntent);
    if (intentEntries.length > 0) {
      response += '\n*Corrections by Intent*\n';
      response += '```\n';
      intentEntries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([intent, count]) => {
          response += `${intent.padEnd(22)} ${String(count).padStart(4)}\n`;
        });
      response += '```\n';
    }

    // By project breakdown
    const projectEntries = Object.entries(stats.byProject);
    if (projectEntries.length > 0) {
      response += '\n*Corrections by Project*\n';
      response += '```\n';
      projectEntries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([project, count]) => {
          response += `${project.padEnd(22)} ${String(count).padStart(4)}\n`;
        });
      response += '```\n';
    }

    // Recent corrections
    if (stats.recentCorrections && stats.recentCorrections.length > 0) {
      response += '\n*Recent Corrections*\n';
      response += '```\n';
      stats.recentCorrections.slice(-5).forEach(c => {
        const ago = this._timeAgo(c.timestamp);
        const orig = c.original.intent || '?';
        const proj = c.original.project || '?';
        response += `${ago.padEnd(10)} ${orig} -> ${proj}\n`;
      });
      response += '```\n';
    }

    if (stats.totalCorrections === 0) {
      response += '\n_No corrections recorded yet._';
    }

    return this.success(response);
  }

  // ---------------------------------------------------------------------------
  // nl test "<message>"
  // ---------------------------------------------------------------------------

  async testRoute(message, context) {
    const router = getSmartRouter();
    const classifier = getIntentClassifier();

    if (!router && !classifier) {
      return this.error('Neither SmartRouter nor IntentClassifier are available');
    }

    let response = `*NL Route Test*\n\nInput: "${message}"\n\n`;

    // Test SmartRouter
    if (router) {
      try {
        const routeContext = {};
        if (context.autoRepo) routeContext.autoRepo = context.autoRepo;
        if (context.autoCompany) routeContext.autoCompany = context.autoCompany;

        // Check pattern match first (no side effects)
        const patternResult = router.patternMatch(message, routeContext);

        // Check passthrough guards
        const isPassthrough = router._isPassthrough(message.trim());
        const isCodingInstruction = router._isCodingInstruction(message.trim());
        const isConversationalBuild = router._isConversationalBuild(message.trim());
        const looksLikeCommand = router.looksLikeCommand(message.trim());
        const isQuestion = /\?\s*$/.test(message.trim());

        response += '*SmartRouter*\n';
        response += '```\n';
        if (patternResult) {
          response += `Pattern match:   ${patternResult}\n`;
        } else {
          response += `Pattern match:   (none)\n`;
        }
        response += `Is question:     ${isQuestion}\n`;
        response += `Passthrough:     ${isPassthrough}\n`;
        response += `Coding instr:    ${isCodingInstruction}\n`;
        response += `Conv. build:     ${isConversationalBuild}\n`;
        response += `Looks like cmd:  ${looksLikeCommand}\n`;
        response += '```\n';

        // Determine what would happen
        let verdict;
        if (isQuestion) {
          verdict = 'Passthrough (question mark detected)';
        } else if (patternResult) {
          verdict = `Route to command: ${patternResult}`;
        } else if (isPassthrough) {
          verdict = 'Passthrough (conversational)';
        } else if (isConversationalBuild) {
          verdict = 'Passthrough (conversational build request)';
        } else if (looksLikeCommand) {
          verdict = 'Treated as structured command';
        } else if (isCodingInstruction) {
          verdict = 'Passthrough (coding instruction -> AI)';
        } else {
          verdict = 'Would attempt AI routing, then fallback to passthrough';
        }
        response += `\n*Verdict:* ${verdict}\n`;
      } catch (err) {
        response += `*SmartRouter:* Error - ${err.message}\n`;
      }
    }

    // Test IntentClassifier
    if (classifier) {
      try {
        const classifyContext = {
          activeProject: context.autoRepo || null,
          userId: context.userId || 'test'
        };
        const result = await classifier.classify(message, classifyContext);

        response += '\n*IntentClassifier*\n';
        response += '```\n';
        response += `Intent:          ${result.intent || '(none)'}\n`;
        response += `Action:          ${result.action || '(none)'}\n`;
        response += `Project:         ${result.project || '(none)'}\n`;
        response += `Company:         ${result.company || '(none)'}\n`;
        response += `Confidence:      ${(result.confidence || 0).toFixed(3)}\n`;
        response += `Ambiguous:       ${result.ambiguous || false}\n`;
        response += `Risk:            ${result.risk || 'low'}\n`;
        response += `Needs confirm:   ${result.requiresConfirmation || false}\n`;
        response += '```\n';

        // Confidence factor breakdown
        if (result.confidenceFactors) {
          const cf = result.confidenceFactors;
          response += '\n*Confidence Factors*\n';
          response += '```\n';
          response += `keywordMatch:    ${(cf.keywordMatch || 0).toFixed(3)}\n`;
          response += `contextMatch:    ${(cf.contextMatch || 0).toFixed(3)}\n`;
          response += `historyMatch:    ${(cf.historyMatch || 0).toFixed(3)}\n`;
          response += `specificity:     ${(cf.specificity || 0).toFixed(3)}\n`;
          response += '```\n';
        }

        // Alternatives
        if (result.alternatives && result.alternatives.length > 0) {
          response += '\n*Alternatives*\n';
          response += '```\n';
          result.alternatives.slice(0, 3).forEach(alt => {
            response += `${(alt.actionType || '?').padEnd(18)} conf: ${(alt.confidence || 0).toFixed(2)}\n`;
          });
          response += '```\n';
        }

        // Clarifying questions
        if (result.clarifyingQuestions && result.clarifyingQuestions.length > 0) {
          response += '\n*Clarifying Questions*\n';
          result.clarifyingQuestions.forEach(q => {
            response += `  - ${q}\n`;
          });
        }

        if (result.summary) {
          response += `\n*Summary:* ${result.summary}`;
        }
      } catch (err) {
        response += `\n*IntentClassifier:* Error - ${err.message}\n`;
      }
    }

    return this.success(response);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _timeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

module.exports = NLTuningSkill;
