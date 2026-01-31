/**
 * Receipts Skill - Receipt image processing and expense tracking
 *
 * Uses Claude Vision API to extract data from receipt images sent via WhatsApp.
 * Stores receipts in memory (SQLite) for expense tracking and summaries.
 *
 * Commands:
 *   [image message]          - Detect receipt, extract data, ask for confirmation
 *   expenses | my expenses   - Show recent expenses
 *   summary | expense summary - Monthly expense summary
 *   confirm | yes             - Confirm pending receipt
 *   reject | no | cancel      - Reject pending receipt
 *
 * @example
 * [User sends receipt image]
 * -> "Found receipt from Shell for 45.50 GBP. Confirm?"
 *
 * expenses
 * -> Lists recent expenses
 *
 * summary
 * -> Shows monthly breakdown
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');

// Category mappings for auto-detection
const CATEGORY_KEYWORDS = {
  'Fuel': ['shell', 'bp', 'esso', 'texaco', 'petrol', 'diesel', 'fuel', 'gas station', 'mobil', 'total', 'gulf'],
  'Office Supplies': ['staples', 'ryman', 'viking', 'officeworks', 'office depot', 'stationery', 'amazon'],
  'Travel': ['trainline', 'national rail', 'uber', 'lyft', 'taxi', 'railway', 'airlines', 'booking.com', 'airbnb', 'hotel'],
  'Food & Drink': ['restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'pret', 'mcdonald', 'subway', 'greggs', 'pub', 'bar'],
  'Subscriptions': ['microsoft', 'adobe', 'aws', 'google cloud', 'spotify', 'netflix', 'github', 'slack', 'notion', 'figma'],
  'Utilities': ['electric', 'gas', 'water', 'phone', 'vodafone', 'ee', 'o2', 'virgin', 'bt', 'broadband'],
  'Professional Services': ['accountant', 'lawyer', 'consultant', 'solicitor', 'legal', 'audit', 'advisory'],
  'Accommodation': ['hotel', 'inn', 'lodge', 'motel', 'airbnb', 'booking'],
  'Entertainment': ['cinema', 'theatre', 'concert', 'event', 'ticket'],
  'Transport': ['uber', 'lyft', 'taxi', 'bus', 'metro', 'tube', 'tfl', 'parking']
};

class ReceiptsSkill extends BaseSkill {
  name = 'receipts';
  description = 'Receipt scanning and expense tracking via images';
  priority = 30; // High priority to catch image messages

  commands = [
    {
      pattern: /^(expenses|my expenses)$/i,
      description: 'Show recent expenses',
      usage: 'expenses'
    },
    {
      pattern: /^(summary|expense summary|monthly summary)$/i,
      description: 'Show monthly expense summary',
      usage: 'summary'
    },
    {
      pattern: /^(confirm|yes)$/i,
      description: 'Confirm pending receipt',
      usage: 'confirm'
    },
    {
      pattern: /^(reject|no|cancel)$/i,
      description: 'Reject pending receipt',
      usage: 'reject'
    },
    {
      pattern: /^delete expense #?(\d+)$/i,
      description: 'Delete an expense by ID',
      usage: 'delete expense #<id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = null;
    this.pendingReceipts = new Map(); // userId -> pending receipt data
  }

  /**
   * Initialize Claude client
   */
  initClient() {
    if (!this.claude && process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    return this.claude;
  }

  /**
   * Check if this skill can handle the command
   * Override to also check for image messages
   */
  canHandle(command, context = {}) {
    // Check text commands first
    if (super.canHandle(command)) {
      return true;
    }

    // Check if there's a media URL (image message)
    if (context.mediaUrl || context.numMedia > 0) {
      return true;
    }

    return false;
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { userId, fromNumber, mediaUrl, numMedia, mediaContentType } = context;

    // Check for image message first
    if (mediaUrl || numMedia > 0) {
      return await this.handleImageMessage(context);
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle text commands
    if (/^(expenses|my expenses)$/i.test(lowerCommand)) {
      return await this.handleExpensesCommand(userId);
    }

    if (/^(summary|expense summary|monthly summary)$/i.test(lowerCommand)) {
      return await this.handleSummaryCommand(userId);
    }

    if (/^(confirm|yes)$/i.test(lowerCommand)) {
      return await this.handleConfirmCommand(userId);
    }

    if (/^(reject|no|cancel)$/i.test(lowerCommand)) {
      return await this.handleRejectCommand(userId);
    }

    const deleteMatch = lowerCommand.match(/^delete expense #?(\d+)$/i);
    if (deleteMatch) {
      return await this.handleDeleteCommand(userId, parseInt(deleteMatch[1]));
    }

    return this.error('Unknown receipts command. Try "expenses" or "summary".');
  }

  /**
   * Handle incoming image message - extract receipt data
   */
  async handleImageMessage(context) {
    const { userId, mediaUrl } = context;

    this.log('info', `Processing receipt image for user ${userId}`);

    try {
      const client = this.initClient();
      if (!client) {
        return this.error('AI service not configured. Cannot process receipt.');
      }

      // Call Claude Vision API to extract receipt data
      const receiptData = await this.extractReceiptData(mediaUrl);

      if (receiptData.extraction_failed) {
        return this.error(
          `Could not read receipt: ${receiptData.failure_reason || 'Image unclear'}\n\n` +
          'Try sending a clearer photo with good lighting.'
        );
      }

      // Store as pending receipt awaiting confirmation
      this.pendingReceipts.set(userId, {
        ...receiptData,
        imageUrl: mediaUrl,
        extractedAt: new Date().toISOString()
      });

      // Format confirmation message
      const confirmMsg = this.formatConfirmationMessage(receiptData);
      return this.success(confirmMsg);

    } catch (error) {
      this.log('error', 'Receipt extraction failed', error);
      return this.error(`Failed to process receipt: ${error.message}`);
    }
  }

  /**
   * Extract receipt data using Claude Vision API
   */
  async extractReceiptData(mediaUrl) {
    const extractionPrompt = `You are a receipt data extraction expert. Analyze this receipt image and extract the following information.

IMPORTANT: Return ONLY a valid JSON object with no additional text, markdown, or explanation.

Required fields:
- merchant_name: Business name exactly as shown (string)
- receipt_date: Date in YYYY-MM-DD format, or "Not stated" if not visible (string)
- currency: ISO currency code (GBP, USD, EUR) or "Not stated" (string)
- total: Final amount paid as a number, or "Not stated" if not visible
- payment_method: "card", "cash", "transfer", or "Not stated"
- extraction_confidence: Your confidence from 0 to 1 (number)

Optional fields (use "Not stated" or null if not visible):
- merchant_address: Full address or "Not stated"
- subtotal: Pre-tax amount as number or "Not stated"
- tax: VAT/tax amount as number or "Not stated"
- last4: Last 4 digits of card or "Not stated"
- category: One of: Travel, Food & Drink, Office Supplies, Utilities, Subscriptions, Professional Services, Transport, Fuel, Accommodation, Entertainment, Other
- category_confidence: 0-1 confidence in category
- country: Country from address or "Not stated"
- city: City from address or "Not stated"
- notes: Any issues, illegible parts, or reconciliation notes
- line_items: Array of {description, quantity, unit_price, line_total} if visible

If you cannot read the receipt at all, return:
{
  "extraction_failed": true,
  "failure_reason": "reason here",
  "extraction_confidence": 0
}

Return ONLY the JSON object:`;

    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: mediaUrl
            }
          },
          {
            type: 'text',
            text: extractionPrompt
          }
        ]
      }]
    });

    // Parse the JSON response
    const responseText = response.content[0].text.trim();

    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);

        // Auto-detect category if not provided
        if (!data.category || data.category === 'Other') {
          data.category = this.autoDetectCategory(data.merchant_name);
          data.category_confidence = data.category !== 'Other' ? 0.7 : 0.3;
        }

        return data;
      }
      throw new Error('No JSON found in response');
    } catch (parseError) {
      this.log('error', 'Failed to parse receipt JSON', { responseText, error: parseError });
      return {
        extraction_failed: true,
        failure_reason: 'Could not parse receipt data',
        extraction_confidence: 0
      };
    }
  }

  /**
   * Auto-detect expense category from merchant name
   */
  autoDetectCategory(merchantName) {
    if (!merchantName) return 'Other';

    const lowerMerchant = merchantName.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMerchant.includes(keyword.toLowerCase())) {
          return category;
        }
      }
    }

    return 'Other';
  }

  /**
   * Format confirmation message for extracted receipt
   */
  formatConfirmationMessage(receipt) {
    const amount = typeof receipt.total === 'number'
      ? `${receipt.currency || 'GBP'} ${receipt.total.toFixed(2)}`
      : 'amount unclear';

    const date = receipt.receipt_date !== 'Not stated'
      ? receipt.receipt_date
      : 'date unclear';

    const confidence = Math.round((receipt.extraction_confidence || 0) * 100);

    let msg = `Found receipt:\n\n`;
    msg += `Merchant: ${receipt.merchant_name || 'Unknown'}\n`;
    msg += `Amount: ${amount}\n`;
    msg += `Date: ${date}\n`;
    msg += `Category: ${receipt.category || 'Other'}\n`;

    if (receipt.tax && receipt.tax !== 'Not stated') {
      msg += `VAT: ${receipt.currency || 'GBP'} ${receipt.tax.toFixed(2)}\n`;
    }

    if (receipt.payment_method && receipt.payment_method !== 'Not stated') {
      msg += `Payment: ${receipt.payment_method}`;
      if (receipt.last4 && receipt.last4 !== 'Not stated') {
        msg += ` (****${receipt.last4})`;
      }
      msg += '\n';
    }

    msg += `\nConfidence: ${confidence}%\n`;
    msg += `\n*Reply "confirm" to save or "reject" to discard.*`;

    return msg;
  }

  /**
   * Handle confirm command - save pending receipt
   */
  async handleConfirmCommand(userId) {
    const pending = this.pendingReceipts.get(userId);

    if (!pending) {
      return this.error('No pending receipt to confirm. Send a receipt image first.');
    }

    // Save to memory
    if (!this.memory) {
      return this.error('Memory system not available. Cannot save receipt.');
    }

    try {
      // Store receipt as a structured fact
      const receiptRecord = {
        type: 'receipt',
        merchant_name: pending.merchant_name,
        amount: pending.total,
        currency: pending.currency || 'GBP',
        date: pending.receipt_date,
        category: pending.category || 'Other',
        tax: pending.tax,
        payment_method: pending.payment_method,
        last4: pending.last4,
        confidence: pending.extraction_confidence,
        imageUrl: pending.imageUrl,
        savedAt: new Date().toISOString()
      };

      // Save as a fact with category 'expense'
      const factText = JSON.stringify(receiptRecord);
      const factId = this.memory.saveFact(userId, factText, 'expense', 'receipt_scan');

      // Clear pending
      this.pendingReceipts.delete(userId);

      const amount = typeof pending.total === 'number'
        ? `${pending.currency || 'GBP'} ${pending.total.toFixed(2)}`
        : 'amount';

      return this.success(
        `Saved receipt #${factId}\n\n` +
        `${pending.merchant_name}: ${amount}\n` +
        `Category: ${pending.category || 'Other'}\n\n` +
        `_Use "expenses" to see your expenses_`
      );
    } catch (error) {
      this.log('error', 'Failed to save receipt', error);
      return this.error('Failed to save receipt. Please try again.');
    }
  }

  /**
   * Handle reject command - discard pending receipt
   */
  handleRejectCommand(userId) {
    const pending = this.pendingReceipts.get(userId);

    if (!pending) {
      return this.error('No pending receipt to reject.');
    }

    this.pendingReceipts.delete(userId);
    return this.success('Receipt discarded. Send another image to try again.');
  }

  /**
   * Handle expenses command - show recent expenses
   */
  async handleExpensesCommand(userId) {
    if (!this.memory) {
      return this.error('Memory system not available.');
    }

    try {
      // Get all expense facts
      const facts = this.memory.getFacts(userId);
      const expenses = facts
        .filter(f => f.category === 'expense')
        .map(f => {
          try {
            return { id: f.id, ...JSON.parse(f.fact), savedAt: f.updated_at };
          } catch {
            return null;
          }
        })
        .filter(e => e && e.type === 'receipt')
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
        .slice(0, 10); // Last 10 expenses

      if (expenses.length === 0) {
        return this.success(
          'No expenses recorded yet.\n\n' +
          'Send a receipt photo to add one!'
        );
      }

      let msg = '*Recent Expenses*\n';
      msg += '\n';

      let total = 0;
      for (const exp of expenses) {
        const amount = typeof exp.amount === 'number' ? exp.amount : 0;
        total += amount;

        const amountStr = typeof exp.amount === 'number'
          ? `${exp.currency || 'GBP'} ${exp.amount.toFixed(2)}`
          : 'N/A';

        const dateStr = exp.date !== 'Not stated'
          ? this.formatShortDate(exp.date)
          : '';

        msg += `#${exp.id} ${exp.merchant_name || 'Unknown'}\n`;
        msg += `   ${amountStr} | ${exp.category || 'Other'}`;
        if (dateStr) msg += ` | ${dateStr}`;
        msg += '\n\n';
      }

      msg += `*Total: GBP ${total.toFixed(2)}*\n\n`;
      msg += `_Showing ${expenses.length} expense(s)_\n`;
      msg += `_Use "summary" for monthly breakdown_`;

      return this.success(msg);
    } catch (error) {
      this.log('error', 'Failed to retrieve expenses', error);
      return this.error('Failed to retrieve expenses. Please try again.');
    }
  }

  /**
   * Handle summary command - monthly expense breakdown
   */
  async handleSummaryCommand(userId) {
    if (!this.memory) {
      return this.error('Memory system not available.');
    }

    try {
      const facts = this.memory.getFacts(userId);
      const expenses = facts
        .filter(f => f.category === 'expense')
        .map(f => {
          try {
            return { id: f.id, ...JSON.parse(f.fact) };
          } catch {
            return null;
          }
        })
        .filter(e => e && e.type === 'receipt');

      if (expenses.length === 0) {
        return this.success(
          'No expenses to summarize.\n\n' +
          'Send receipt photos to start tracking!'
        );
      }

      // Group by month and category
      const byMonth = {};
      const byCategory = {};
      let grandTotal = 0;

      for (const exp of expenses) {
        const amount = typeof exp.amount === 'number' ? exp.amount : 0;
        grandTotal += amount;

        // By category
        const cat = exp.category || 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + amount;

        // By month
        if (exp.date && exp.date !== 'Not stated') {
          const month = exp.date.substring(0, 7); // YYYY-MM
          if (!byMonth[month]) {
            byMonth[month] = { total: 0, count: 0 };
          }
          byMonth[month].total += amount;
          byMonth[month].count += 1;
        }
      }

      let msg = '*Expense Summary*\n';
      msg += '\n';

      // Current month highlight
      const currentMonth = new Date().toISOString().substring(0, 7);
      if (byMonth[currentMonth]) {
        const cm = byMonth[currentMonth];
        msg += `*This Month (${this.formatMonth(currentMonth)}):*\n`;
        msg += `GBP ${cm.total.toFixed(2)} (${cm.count} receipts)\n\n`;
      }

      // By category
      msg += '*By Category:*\n';
      const sortedCats = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1]);

      for (const [cat, amount] of sortedCats) {
        const pct = ((amount / grandTotal) * 100).toFixed(0);
        msg += `${cat}: GBP ${amount.toFixed(2)} (${pct}%)\n`;
      }

      msg += '\n';
      msg += `*All Time Total: GBP ${grandTotal.toFixed(2)}*\n`;
      msg += `_${expenses.length} receipt(s) tracked_`;

      return this.success(msg);
    } catch (error) {
      this.log('error', 'Failed to generate summary', error);
      return this.error('Failed to generate summary. Please try again.');
    }
  }

  /**
   * Handle delete expense command
   */
  async handleDeleteCommand(userId, expenseId) {
    if (!this.memory) {
      return this.error('Memory system not available.');
    }

    try {
      // Verify it's an expense fact belonging to this user
      const facts = this.memory.getFacts(userId);
      const expense = facts.find(f => f.id === expenseId && f.category === 'expense');

      if (!expense) {
        return this.error(`Expense #${expenseId} not found.`);
      }

      // Parse to get details for confirmation message
      let expenseData;
      try {
        expenseData = JSON.parse(expense.fact);
      } catch {
        expenseData = {};
      }

      // Delete the fact
      this.memory.deleteFact(userId, expenseId);

      const merchant = expenseData.merchant_name || 'Unknown';
      const amount = typeof expenseData.amount === 'number'
        ? `${expenseData.currency || 'GBP'} ${expenseData.amount.toFixed(2)}`
        : '';

      return this.success(
        `Deleted expense #${expenseId}\n\n` +
        `${merchant}${amount ? ': ' + amount : ''}`
      );
    } catch (error) {
      this.log('error', 'Failed to delete expense', error);
      return this.error('Failed to delete expense. Please try again.');
    }
  }

  /**
   * Format date to short display format
   */
  formatShortDate(isoDate) {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Format month string (YYYY-MM) to readable format
   */
  formatMonth(monthStr) {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return monthStr;
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.initClient();
    this.log('info', 'Receipts skill ready for image processing');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'receipts',
      provider: 'Claude Vision API',
      capabilities: ['image_processing', 'expense_tracking']
    };
  }
}

module.exports = ReceiptsSkill;
