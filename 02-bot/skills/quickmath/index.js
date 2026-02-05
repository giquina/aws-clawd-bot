/**
 * QuickMathSkill - Fast mathematical calculations with safe evaluation
 *
 * Provides quick math calculations with support for:
 * - Basic arithmetic operations
 * - Percentage calculations
 * - Currency/tip calculations
 * - Safe sandboxed evaluation using mathjs
 *
 * Commands:
 *   calc <expression>        - Calculate a mathematical expression
 *   calculate <expression>   - Alias for calc
 *   tip <amount> [percent]   - Calculate tip on amount (default 15%)
 */

const BaseSkill = require('../base-skill');

// Try to require mathjs - warn if not available
let math = null;
try {
  math = require('mathjs');
} catch (e) {
  console.warn('[QuickMathSkill] mathjs not installed. Install with: npm install mathjs');
}

class QuickMathSkill extends BaseSkill {
  name = 'quickmath';
  description = 'Fast safe math calculations with percentage and currency support';
  priority = 15;

  commands = [
    {
      pattern: /^calc(?:ulate)?\s+(.+)$/i,
      description: 'Calculate a mathematical expression',
      usage: 'calc <expression> or calculate <expression>'
    },
    {
      pattern: /^tip\s+([\d.]+)\s*(?:(\d+)%?)?$/i,
      description: 'Calculate tip on amount (default 15%)',
      usage: 'tip <amount> [percent]'
    },
    {
      pattern: /^([\d.]+)%\s+of\s+([\d.]+)$/i,
      description: 'Calculate percentage of amount',
      usage: '<percent>% of <amount>'
    }
  ];

  async execute(command, context) {
    if (!math) {
      return this.error(
        'Math calculations unavailable',
        'mathjs library not installed',
        { suggestion: 'Contact administrator to install mathjs' }
      );
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    try {
      // Handle "tip" command
      if (lowerCommand.startsWith('tip ')) {
        return this.calculateTip(lowerCommand);
      }

      // Handle "X% of Y" pattern
      const percentMatch = lowerCommand.match(/^([\d.]+)%\s+of\s+([\d.]+)$/);
      if (percentMatch) {
        const percentage = parseFloat(percentMatch[1]);
        const amount = parseFloat(percentMatch[2]);
        return this.calculatePercentage(percentage, amount);
      }

      // Handle general calculation
      if (lowerCommand.startsWith('calc') || lowerCommand.startsWith('calculate')) {
        const expressionMatch = lowerCommand.match(/^(?:calc(?:ulate)?)\s+(.+)$/);
        if (expressionMatch) {
          const expression = expressionMatch[1];
          return this.evaluateExpression(expression);
        }
      }

      return this.error(
        'Invalid calculation format',
        'Could not parse calculation',
        { suggestion: 'Try: calc 2+2, tip 50, or 15% of 100' }
      );
    } catch (error) {
      this.log('error', 'Calculation error', error);
      return this.error(
        'Calculation failed',
        error,
        { suggestion: 'Check your expression and try again' }
      );
    }
  }

  /**
   * Evaluate a mathematical expression safely
   * @param {string} expression - The expression to evaluate
   * @returns {Object} Success or error response
   */
  evaluateExpression(expression) {
    // Sanitize: only allow safe characters
    const sanitized = this.sanitizeExpression(expression);

    if (!sanitized) {
      return this.error(
        'Invalid characters in expression',
        'Expression contains unsafe characters',
        { suggestion: 'Only use numbers, operators (+, -, *, /, ^, %), and parentheses' }
      );
    }

    try {
      // Evaluate using mathjs (safe, sandboxed)
      const result = math.evaluate(sanitized);

      // Format result
      const formatted = this.formatNumber(result);

      return this.success(
        `${formatted}`,
        { expression: sanitized, result }
      );
    } catch (error) {
      return this.error(
        'Calculation error',
        error.message,
        { attempted: sanitized }
      );
    }
  }

  /**
   * Calculate percentage of an amount
   * @param {number} percentage - The percentage (0-100)
   * @param {number} amount - The amount to calculate from
   * @returns {Object} Success response
   */
  calculatePercentage(percentage, amount) {
    const result = (percentage / 100) * amount;
    const formatted = this.formatCurrency(result);

    return this.success(
      `${formatted}`,
      {
        expression: `${percentage}% of ${amount}`,
        percentage,
        amount,
        result
      }
    );
  }

  /**
   * Calculate tip on an amount
   * @param {string} command - The tip command string
   * @returns {Object} Success response
   */
  calculateTip(command) {
    const match = command.match(/^tip\s+([\d.]+)\s*(?:(\d+)%?)?/);

    if (!match) {
      return this.error(
        'Invalid tip format',
        'Could not parse tip calculation',
        { suggestion: 'Try: tip 50 (15% default) or tip 50 20 (20% tip)' }
      );
    }

    const amount = parseFloat(match[1]);
    const tipPercent = match[2] ? parseInt(match[2]) : 15;

    if (isNaN(amount) || amount < 0) {
      return this.error(
        'Invalid amount',
        'Amount must be a positive number'
      );
    }

    if (tipPercent < 0 || tipPercent > 100) {
      return this.error(
        'Invalid tip percentage',
        'Tip percent must be between 0 and 100'
      );
    }

    const tip = (tipPercent / 100) * amount;
    const total = amount + tip;

    const amountStr = this.formatCurrency(amount);
    const tipStr = this.formatCurrency(tip);
    const totalStr = this.formatCurrency(total);

    const message = `Tip (${tipPercent}%): ${tipStr}\nTotal: ${totalStr}`;

    return this.success(
      message,
      {
        amount,
        tipPercent,
        tip,
        total
      }
    );
  }

  /**
   * Sanitize expression to allow only safe characters
   * @param {string} expression - Raw expression
   * @returns {string|null} Sanitized expression or null if unsafe
   */
  sanitizeExpression(expression) {
    // Allow numbers, operators, parentheses, decimal point, and common functions
    // Format: numbers, +, -, *, /, ^, %, (, ), ., spaces, common math functions
    const allowed = /^[0-9+\-*/(). ^%a-z]+$/i;

    if (!allowed.test(expression)) {
      return null;
    }

    // Additional check: no semicolons or dangerous patterns
    if (expression.includes(';') || expression.includes(',')) {
      return null;
    }

    // Replace common variations with mathjs equivalents
    let cleaned = expression
      .toLowerCase()
      .trim()
      // Convert "X times Y" to "X * Y"
      .replace(/\s+times\s+/gi, ' * ')
      // Convert "X divided by Y" to "X / Y"
      .replace(/\s+divided\s+by\s+/gi, ' / ')
      // Convert "X to the power of Y" or "X**Y" or "X^Y"
      .replace(/\s+to\s+the\s+power\s+of\s+/gi, '^')
      .replace(/\*\*/g, '^');

    return cleaned;
  }

  /**
   * Format a number for display
   * @param {number} num - Number to format
   * @returns {string} Formatted number
   */
  formatNumber(num) {
    // Handle special cases
    if (num === null || num === undefined) return '0';
    if (typeof num === 'object') {
      // mathjs can return complex types
      return String(num);
    }

    const n = parseFloat(num);
    if (isNaN(n)) return String(num);

    // Round to 2 decimal places for display
    const rounded = Math.round(n * 100) / 100;

    // Format with thousands separator if large
    if (Math.abs(rounded) >= 1000) {
      return rounded.toLocaleString('en-GB', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
      });
    }

    // For small numbers, show up to 2 decimal places
    return rounded.toString();
  }

  /**
   * Format a number as currency (GBP)
   * @param {number} num - Amount to format
   * @returns {string} Currency formatted string (e.g., "£9.00")
   */
  formatCurrency(num) {
    const n = parseFloat(num);
    if (isNaN(n)) return '£0.00';

    return '£' + Math.abs(n).toLocaleString('en-GB', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }
}

module.exports = QuickMathSkill;
