/**
 * Cost Tracker Skill - AI API cost monitoring and optimization
 *
 * Tracks AI API costs across all providers (Groq FREE, Claude $$$, Grok $, Perplexity $$).
 * Shows spending trends, budget alerts, and optimization suggestions.
 *
 * Commands:
 *   ai costs / cost report / api costs       - Show current cost summary
 *   cost breakdown / cost detail              - Detailed breakdown by provider
 *   cost budget <amount> / set budget <amt>   - Set monthly budget (GBP)
 *   cost history / spending history           - Show cost trends over time
 *   cost optimize / cost savings              - Suggest optimizations
 *
 * Voice examples:
 * - "show me ai costs"
 * - "how much am I spending on Claude?"
 * - "set budget 50"
 * - "any cost optimizations?"
 */

const BaseSkill = require('../base-skill');

const PROVIDER_COSTS = {
  groq: {
    name: 'Groq',
    inputPer1M: 0,
    outputPer1M: 0,
    whisperPerMinute: 0,
  },
  claude: {
    name: 'Claude',
    opusInputPer1M: 15.00,
    opusOutputPer1M: 75.00,
    sonnetInputPer1M: 3.00,
    sonnetOutputPer1M: 15.00,
  },
  grok: {
    name: 'Grok',
    inputPer1M: 5.00,
    outputPer1M: 15.00,
  },
  perplexity: {
    name: 'Perplexity',
    inputPer1M: 1.00,
    outputPer1M: 5.00,
  },
};

// USD to GBP approximate conversion
const USD_TO_GBP = 0.79;

const MAX_COST_LOG_ENTRIES = 1000;

class CostTrackerSkill extends BaseSkill {
  name = 'cost-tracker';
  description = 'Track AI API costs, set budgets, and get optimization suggestions';
  priority = 19;

  commands = [
    {
      pattern: /^(ai costs?|cost report|api costs?)$/i,
      description: 'Show current month cost summary',
      usage: 'ai costs'
    },
    {
      pattern: /^cost (breakdown|detail)$/i,
      description: 'Detailed cost breakdown by provider and model',
      usage: 'cost breakdown'
    },
    {
      pattern: /^(cost budget|set budget)\s+([\d.]+)$/i,
      description: 'Set monthly budget in GBP',
      usage: 'cost budget 50'
    },
    {
      pattern: /^(cost history|spending history)$/i,
      description: 'Show cost trends over time',
      usage: 'cost history'
    },
    {
      pattern: /^cost (optimize|optimise|savings?)$/i,
      description: 'Suggest cost optimizations',
      usage: 'cost optimize'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.costLog = [];
    this.monthlyBudget = null; // in GBP
  }

  async execute(command, context) {
    const lowerCmd = (command || '').toLowerCase().trim();

    // Cost summary
    if (/^(ai costs?|cost report|api costs?)$/i.test(lowerCmd)) {
      return this._handleCostSummary();
    }

    // Cost breakdown
    if (/^cost (breakdown|detail)$/i.test(lowerCmd)) {
      return this._handleCostBreakdown();
    }

    // Set budget
    const budgetMatch = lowerCmd.match(/^(?:cost budget|set budget)\s+([\d.]+)$/i);
    if (budgetMatch) {
      return this._handleSetBudget(parseFloat(budgetMatch[1]));
    }

    // Cost history
    if (/^(cost history|spending history)$/i.test(lowerCmd)) {
      return this._handleCostHistory();
    }

    // Cost optimize
    if (/^cost (optimize|optimise|savings?)$/i.test(lowerCmd)) {
      return this._handleOptimize();
    }

    return this.error('Unknown cost tracker command', null, {
      suggestion: 'Try "ai costs", "cost breakdown", "cost budget 50", "cost history", or "cost optimize"'
    });
  }

  /**
   * Record a cost entry from an AI provider call.
   * Called externally by the AI router or handler.
   */
  recordCost({ provider, model, inputTokens, outputTokens, taskType }) {
    const estimatedCost = this._calculateCost(provider, model, inputTokens, outputTokens);

    const entry = {
      provider,
      model: model || 'default',
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      estimatedCost,
      timestamp: new Date().toISOString(),
      taskType: taskType || 'unknown',
    };

    this.costLog.push(entry);

    // Ring buffer: trim to max entries
    if (this.costLog.length > MAX_COST_LOG_ENTRIES) {
      this.costLog = this.costLog.slice(-MAX_COST_LOG_ENTRIES);
    }

    return entry;
  }

  // ==================== Command Handlers ====================

  /**
   * Show current month cost summary
   */
  _handleCostSummary() {
    const routerStats = this._getRouterStats();
    const monthEntries = this._getCurrentMonthEntries();
    const now = new Date();
    const monthName = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    // Aggregate by provider
    const providerTotals = this._aggregateByProvider(monthEntries);

    // Build response
    let response = `AI Cost Report \u2014 ${monthName}\n`;
    response += '\u2501'.repeat(28) + '\n\n';

    let totalCost = 0;
    let totalCalls = 0;

    const providerOrder = ['groq', 'claude', 'grok', 'perplexity'];

    for (const key of providerOrder) {
      const info = PROVIDER_COSTS[key];
      const stats = providerTotals[key] || { calls: 0, cost: 0 };
      const label = key === 'groq' ? `${info.name} (FREE)` : info.name;
      const costStr = `\u00a3${stats.cost.toFixed(2)}`;

      response += `${this._padRight(label, 18)} ${this._padLeft(String(stats.calls), 5)}    ${costStr}\n`;

      totalCost += stats.cost;
      totalCalls += stats.calls;
    }

    response += '\u2501'.repeat(28) + '\n';
    response += `${this._padRight('Total', 18)} ${this._padLeft(String(totalCalls), 5)}    \u00a3${totalCost.toFixed(2)}\n`;

    // Budget info
    if (this.monthlyBudget !== null) {
      const remaining = this.monthlyBudget - totalCost;
      response += `\nBudget: \u00a3${this.monthlyBudget.toFixed(2)} | Remaining: \u00a3${remaining.toFixed(2)}`;
      if (remaining < 0) {
        response += ' (OVER BUDGET)';
      }
    }

    // Cache savings from router
    if (routerStats) {
      const cacheSavingsGBP = (routerStats.summary.estimatedCostSavings || 0) * USD_TO_GBP;
      const cacheHits = routerStats.summary.totalCacheHits || 0;
      if (cacheHits > 0) {
        response += `\nCache savings: ~\u00a3${cacheSavingsGBP.toFixed(2)} (${cacheHits} cached responses)`;
      }
    }

    if (totalCalls === 0 && !routerStats) {
      return this.success(
        `AI Cost Report \u2014 ${monthName}\n\n` +
        'No cost data recorded yet.\n' +
        'Costs will be tracked as AI providers are used.\n\n' +
        'Use "cost budget <amount>" to set a monthly budget in GBP.'
      );
    }

    return this.success(response);
  }

  /**
   * Detailed cost breakdown by provider and model
   */
  _handleCostBreakdown() {
    const monthEntries = this._getCurrentMonthEntries();
    const now = new Date();
    const monthName = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    if (monthEntries.length === 0) {
      return this.success(
        `Cost Breakdown \u2014 ${monthName}\n\n` +
        'No cost data recorded yet.\n' +
        'Use AI providers to start tracking costs.'
      );
    }

    // Aggregate by provider + model
    const breakdown = {};
    for (const entry of monthEntries) {
      const key = `${entry.provider}:${entry.model}`;
      if (!breakdown[key]) {
        breakdown[key] = {
          provider: entry.provider,
          model: entry.model,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          taskTypes: {},
        };
      }
      breakdown[key].calls++;
      breakdown[key].inputTokens += entry.inputTokens;
      breakdown[key].outputTokens += entry.outputTokens;
      breakdown[key].cost += entry.estimatedCost;

      const tt = entry.taskType || 'unknown';
      breakdown[key].taskTypes[tt] = (breakdown[key].taskTypes[tt] || 0) + 1;
    }

    let response = `Cost Breakdown \u2014 ${monthName}\n`;
    response += '\u2501'.repeat(32) + '\n\n';

    // Sort by cost descending
    const sorted = Object.values(breakdown).sort((a, b) => b.cost - a.cost);

    for (const item of sorted) {
      const providerName = (PROVIDER_COSTS[item.provider] || {}).name || item.provider;
      const modelLabel = item.model !== 'default' ? ` (${item.model})` : '';

      response += `*${providerName}${modelLabel}*\n`;
      response += `  Calls: ${item.calls}\n`;
      response += `  Input tokens: ${item.inputTokens.toLocaleString()}\n`;
      response += `  Output tokens: ${item.outputTokens.toLocaleString()}\n`;
      response += `  Cost: \u00a3${item.cost.toFixed(2)}\n`;

      // Top task types
      const topTasks = Object.entries(item.taskTypes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([type, count]) => `${type} (${count})`)
        .join(', ');
      response += `  Tasks: ${topTasks}\n\n`;
    }

    return this.success(response);
  }

  /**
   * Set monthly budget
   */
  _handleSetBudget(amount) {
    if (isNaN(amount) || amount <= 0) {
      return this.error('Invalid budget amount', null, {
        suggestion: 'Provide a positive number, e.g. "cost budget 50"'
      });
    }

    this.monthlyBudget = amount;

    // Calculate projections
    const monthEntries = this._getCurrentMonthEntries();
    const totalSpent = monthEntries.reduce((sum, e) => sum + e.estimatedCost, 0);
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    let response = `Monthly budget set to \u00a3${amount.toFixed(2)}\n\n`;
    response += `Spent so far: \u00a3${totalSpent.toFixed(2)}\n`;
    response += `Remaining: \u00a3${(amount - totalSpent).toFixed(2)}\n`;

    if (dayOfMonth > 1 && totalSpent > 0) {
      const dailyBurn = totalSpent / dayOfMonth;
      const projected = totalSpent + (dailyBurn * daysRemaining);

      response += `\nDaily burn rate: \u00a3${dailyBurn.toFixed(2)}/day\n`;
      response += `Projected month-end: \u00a3${projected.toFixed(2)}`;

      if (projected > amount) {
        response += `\n\nWarning: On track to exceed budget by \u00a3${(projected - amount).toFixed(2)}`;
        response += '\nConsider using "cost optimize" for savings tips.';
      } else {
        response += '\nOn track to stay within budget.';
      }
    }

    this.log('info', `Monthly budget set to \u00a3${amount.toFixed(2)}`);
    return this.success(response);
  }

  /**
   * Show cost trends over time
   */
  _handleCostHistory() {
    if (this.costLog.length === 0) {
      return this.success(
        'Spending History\n\n' +
        'No cost data recorded yet.\n' +
        'History will build as AI providers are used.'
      );
    }

    // Group by day for the last 14 days
    const now = new Date();
    const days = {};

    for (let i = 13; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      days[key] = { calls: 0, cost: 0 };
    }

    for (const entry of this.costLog) {
      const day = entry.timestamp.split('T')[0];
      if (days[day]) {
        days[day].calls++;
        days[day].cost += entry.estimatedCost;
      }
    }

    let response = 'Spending History (Last 14 Days)\n';
    response += '\u2501'.repeat(32) + '\n\n';

    let totalCost = 0;
    let totalCalls = 0;
    let maxDailyCost = 0;

    for (const [date, data] of Object.entries(days)) {
      if (data.cost > maxDailyCost) maxDailyCost = data.cost;
      totalCost += data.cost;
      totalCalls += data.calls;
    }

    // Simple bar chart
    for (const [date, data] of Object.entries(days)) {
      const shortDate = date.slice(5); // MM-DD
      const barLen = maxDailyCost > 0 ? Math.round((data.cost / maxDailyCost) * 12) : 0;
      const bar = '\u2588'.repeat(barLen) || (data.calls > 0 ? '\u2590' : ' ');
      response += `${shortDate}  ${bar} \u00a3${data.cost.toFixed(2)} (${data.calls})\n`;
    }

    response += `\n14-day total: \u00a3${totalCost.toFixed(2)} | ${totalCalls} calls`;

    if (totalCalls > 0) {
      const avgDaily = totalCost / 14;
      response += `\nAvg daily: \u00a3${avgDaily.toFixed(2)}`;
    }

    return this.success(response);
  }

  /**
   * Suggest cost optimizations
   */
  _handleOptimize() {
    const monthEntries = this._getCurrentMonthEntries();
    const routerStats = this._getRouterStats();
    const suggestions = [];

    if (monthEntries.length === 0 && !routerStats) {
      return this.success(
        'Cost Optimization\n\n' +
        'No usage data available yet.\n' +
        'Use AI providers for a while, then come back for optimization tips.'
      );
    }

    // Check for expensive providers used on simple tasks
    const simpleOnClaude = monthEntries.filter(
      e => e.provider === 'claude' && ['simple', 'greeting', 'chitchat'].includes(e.taskType)
    );
    if (simpleOnClaude.length > 0) {
      const wastedCost = simpleOnClaude.reduce((sum, e) => sum + e.estimatedCost, 0);
      suggestions.push(
        `${simpleOnClaude.length} Claude calls were simple/greetings \u2014 ` +
        `these could use Groq (FREE). Potential saving: \u00a3${wastedCost.toFixed(2)}`
      );
    }

    // Check for Perplexity used on basic queries
    const basicOnPerplexity = monthEntries.filter(
      e => e.provider === 'perplexity' && ['simple', 'greeting', 'chitchat'].includes(e.taskType)
    );
    if (basicOnPerplexity.length > 0) {
      const wastedCost = basicOnPerplexity.reduce((sum, e) => sum + e.estimatedCost, 0);
      suggestions.push(
        `${basicOnPerplexity.length} Perplexity calls were for basic info \u2014 ` +
        `could use Groq instead. Potential saving: \u00a3${wastedCost.toFixed(2)}`
      );
    }

    // Check Opus vs Sonnet usage
    const opusCoding = monthEntries.filter(
      e => e.provider === 'claude' && e.model === 'opus' && ['coding', 'implementation'].includes(e.taskType)
    );
    if (opusCoding.length > 0) {
      const saveable = opusCoding.reduce((sum, e) => {
        // Estimate Sonnet cost for same tokens
        const sonnetCost = this._calculateCost('claude', 'sonnet', e.inputTokens, e.outputTokens);
        return sum + (e.estimatedCost - sonnetCost);
      }, 0);
      if (saveable > 0.01) {
        suggestions.push(
          `${opusCoding.length} Opus calls were for coding tasks \u2014 ` +
          `Sonnet handles coding well at lower cost. Potential saving: \u00a3${saveable.toFixed(2)}`
        );
      }
    }

    // Cache hit rate analysis
    if (routerStats) {
      const hitRateStr = routerStats.cache.hitRate || routerStats.summary.cacheHitRate || '0%';
      const hitRate = parseFloat(hitRateStr);
      if (hitRate < 25) {
        suggestions.push(
          `Cache hit rate is ${hitRateStr} \u2014 could reach 25%+ by increasing TTL. ` +
          'Set CACHE_TTL_SECONDS=600 for longer caching.'
        );
      }
    }

    // Groq utilization
    const groqCalls = monthEntries.filter(e => e.provider === 'groq').length;
    const totalCalls = monthEntries.length;
    if (totalCalls > 10 && groqCalls / totalCalls < 0.3) {
      suggestions.push(
        `Only ${Math.round((groqCalls / totalCalls) * 100)}% of calls use Groq (FREE). ` +
        'Try "ai mode economy" to route more queries through Groq.'
      );
    }

    // Build response
    let response = 'Cost Optimization Suggestions\n';
    response += '\u2501'.repeat(32) + '\n\n';

    if (suggestions.length === 0) {
      response += 'No obvious optimizations found.\n';
      response += 'Your AI routing looks efficient!\n\n';
      response += 'Tips:\n';
      response += '\u2022 Use "ai mode economy" for maximum savings\n';
      response += '\u2022 Groq handles simple queries for FREE\n';
      response += '\u2022 Cache reduces repeated API calls automatically';
    } else {
      suggestions.forEach((suggestion, i) => {
        response += `${i + 1}. ${suggestion}\n\n`;
      });

      const totalSavings = monthEntries
        .filter(e => ['simple', 'greeting', 'chitchat'].includes(e.taskType) && e.provider !== 'groq')
        .reduce((sum, e) => sum + e.estimatedCost, 0);
      if (totalSavings > 0) {
        response += '\u2501'.repeat(32) + '\n';
        response += `Estimated potential savings: \u00a3${totalSavings.toFixed(2)}/month`;
      }
    }

    return this.success(response);
  }

  // ==================== Private Helpers ====================

  /**
   * Calculate cost for a provider call in GBP
   */
  _calculateCost(provider, model, inputTokens, outputTokens) {
    const costs = PROVIDER_COSTS[provider];
    if (!costs) return 0;

    let costUSD = 0;

    if (provider === 'claude') {
      if (model === 'opus') {
        costUSD = ((inputTokens || 0) / 1_000_000) * costs.opusInputPer1M
                + ((outputTokens || 0) / 1_000_000) * costs.opusOutputPer1M;
      } else {
        // Default to Sonnet pricing
        costUSD = ((inputTokens || 0) / 1_000_000) * costs.sonnetInputPer1M
                + ((outputTokens || 0) / 1_000_000) * costs.sonnetOutputPer1M;
      }
    } else if (provider === 'groq') {
      costUSD = 0; // FREE
    } else {
      costUSD = ((inputTokens || 0) / 1_000_000) * (costs.inputPer1M || 0)
              + ((outputTokens || 0) / 1_000_000) * (costs.outputPer1M || 0);
    }

    return costUSD * USD_TO_GBP;
  }

  /**
   * Get entries from the current calendar month
   */
  _getCurrentMonthEntries() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    return this.costLog.filter(entry => entry.timestamp >= monthStart);
  }

  /**
   * Aggregate entries by provider
   */
  _aggregateByProvider(entries) {
    const totals = {};

    for (const entry of entries) {
      if (!totals[entry.provider]) {
        totals[entry.provider] = { calls: 0, cost: 0 };
      }
      totals[entry.provider].calls++;
      totals[entry.provider].cost += entry.estimatedCost;
    }

    return totals;
  }

  /**
   * Try to read stats from the AI router if available
   */
  _getRouterStats() {
    try {
      const router = require('../../ai-providers/router');
      if (router && typeof router.getExtendedStats === 'function') {
        return router.getExtendedStats();
      }
    } catch (e) {
      // Router not available, fall back to tracked costs
    }
    return null;
  }

  /**
   * Pad string to the right
   */
  _padRight(str, len) {
    return str.length >= len ? str : str + ' '.repeat(len - str.length);
  }

  /**
   * Pad string to the left
   */
  _padLeft(str, len) {
    return str.length >= len ? str : ' '.repeat(len - str.length) + str;
  }

  async initialize() {
    await super.initialize();
    this.log('info', 'Cost tracker skill initialized');
  }

  async shutdown() {
    this.log('info', `Cost tracker shutting down with ${this.costLog.length} entries`);
    await super.shutdown();
  }
}

module.exports = CostTrackerSkill;
