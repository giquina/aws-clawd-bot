/**
 * Receipt Processor Action
 *
 * Processes receipt images automatically using Claude Vision:
 * - Extracts vendor, amount, date, items, category
 * - Determines company allocation (GMH, GACC, GCAP, GQCARS, GSPV)
 * - Logs expenses to data/expenses.json
 * - Returns formatted summary
 *
 * @module lib/actions/receipt-processor
 */

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Data file path
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');

// Giquina Group Companies
const COMPANIES = {
  GMH: {
    code: 'GMH',
    name: 'Giquina Management Holdings Ltd',
    chNumber: '15425137',
    defaultCategories: ['Management Fees', 'Professional Services', 'Office Supplies']
  },
  GACC: {
    code: 'GACC',
    name: 'Giquina Accountancy Ltd',
    chNumber: '16396650',
    defaultCategories: ['Professional Services', 'Subscriptions', 'Office Supplies']
  },
  GCAP: {
    code: 'GCAP',
    name: 'Giquina Capital Ltd',
    chNumber: '16360342',
    defaultCategories: ['Investment', 'Professional Services', 'Travel']
  },
  GQCARS: {
    code: 'GQCARS',
    name: 'GQ Cars Ltd',
    chNumber: '15389347',
    defaultCategories: ['Fuel', 'Vehicle Maintenance', 'Transport']
  },
  GSPV: {
    code: 'GSPV',
    name: 'Giquina Structured Asset SPV Ltd',
    chNumber: '16369465',
    defaultCategories: ['Property', 'Professional Services', 'Utilities']
  }
};

// Category mappings for company detection
const CATEGORY_COMPANY_HINTS = {
  'Fuel': 'GQCARS',
  'Vehicle Maintenance': 'GQCARS',
  'Transport': 'GQCARS',
  'Property': 'GSPV',
  'Utilities': 'GSPV',
  'Investment': 'GCAP',
  'Accounting': 'GACC',
  'Audit': 'GACC'
};

// Category keywords for auto-detection
const CATEGORY_KEYWORDS = {
  'Fuel': ['shell', 'bp', 'esso', 'texaco', 'petrol', 'diesel', 'fuel', 'gas station', 'mobil', 'total', 'gulf'],
  'Office Supplies': ['staples', 'ryman', 'viking', 'officeworks', 'office depot', 'stationery', 'amazon'],
  'Travel': ['trainline', 'national rail', 'uber', 'lyft', 'taxi', 'railway', 'airlines', 'booking.com', 'airbnb', 'hotel'],
  'Food & Drink': ['restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'pret', 'mcdonald', 'subway', 'greggs', 'pub', 'bar'],
  'Meals': ['restaurant', 'cafe', 'food', 'lunch', 'dinner', 'breakfast', 'catering'],
  'Subscriptions': ['microsoft', 'adobe', 'aws', 'google cloud', 'spotify', 'netflix', 'github', 'slack', 'notion', 'figma'],
  'Utilities': ['electric', 'gas', 'water', 'phone', 'vodafone', 'ee', 'o2', 'virgin', 'bt', 'broadband'],
  'Professional Services': ['accountant', 'lawyer', 'consultant', 'solicitor', 'legal', 'audit', 'advisory'],
  'Accommodation': ['hotel', 'inn', 'lodge', 'motel', 'airbnb', 'booking'],
  'Entertainment': ['cinema', 'theatre', 'concert', 'event', 'ticket'],
  'Vehicle Maintenance': ['mot', 'service', 'repair', 'tyres', 'halfords', 'kwik-fit', 'garage']
};

class ReceiptProcessor {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the processor
   */
  initialize() {
    if (this.initialized) return this;

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.ensureDataDirectory();
    this.initialized = true;
    console.log('[ReceiptProcessor] Initialized');
    return this;
  }

  /**
   * Ensure data directory and expenses file exist
   */
  ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`[ReceiptProcessor] Created data directory: ${DATA_DIR}`);
      }

      if (!fs.existsSync(EXPENSES_FILE)) {
        const initialData = {
          expenses: [],
          nextId: 1,
          createdAt: new Date().toISOString()
        };
        fs.writeFileSync(EXPENSES_FILE, JSON.stringify(initialData, null, 2));
        console.log(`[ReceiptProcessor] Created expenses file: ${EXPENSES_FILE}`);
      }
    } catch (error) {
      console.error('[ReceiptProcessor] Failed to create data directory:', error);
      throw error;
    }
  }

  /**
   * Process a receipt image
   *
   * @param {string} imageUrl - URL of the receipt image (Twilio media URL)
   * @param {Object} context - Processing context
   * @param {string} context.userId - User ID
   * @param {string} [context.company] - Company code (GMH, GACC, GCAP, GQCARS, GSPV)
   * @param {string} [context.description] - Additional context from user
   * @returns {Promise<Object>} Processing result with extracted data and summary
   */
  async processReceipt(imageUrl, context = {}) {
    if (!this.initialized) {
      this.initialize();
    }

    const { userId, company, description } = context;
    const startTime = Date.now();

    console.log(`[ReceiptProcessor] Processing receipt for user ${userId}`);

    try {
      // Step 1: Download image from Twilio
      const imageBuffer = await this.downloadImage(imageUrl);
      const base64Image = imageBuffer.toString('base64');
      const mediaType = this.detectMediaType(imageUrl);

      // Step 2: Extract receipt data using Claude Vision
      const extractedData = await this.extractReceiptData(base64Image, mediaType, description);

      if (extractedData.extraction_failed) {
        return {
          success: false,
          error: extractedData.failure_reason || 'Could not read receipt',
          processingTime: Date.now() - startTime
        };
      }

      // Step 3: Determine company allocation
      const allocatedCompany = this.determineCompany(extractedData, company);

      // Step 4: Build expense record
      const expense = this.buildExpenseRecord(extractedData, {
        userId,
        company: allocatedCompany,
        imageUrl,
        description
      });

      // Step 5: Save to expenses.json
      const expenseId = this.saveExpense(expense);

      // Step 6: Build formatted summary
      const summary = this.formatSummary(expense, expenseId);

      const processingTime = Date.now() - startTime;
      console.log(`[ReceiptProcessor] Complete in ${processingTime}ms, saved as #${expenseId}`);

      return {
        success: true,
        expenseId,
        expense,
        extractedData,
        company: allocatedCompany,
        companyDetails: COMPANIES[allocatedCompany] || null,
        summary,
        processingTime
      };

    } catch (error) {
      console.error('[ReceiptProcessor] Processing failed:', error);
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Download image from Twilio URL with authentication
   */
  downloadImage(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      // Twilio media URLs require authentication
      const authHeader = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
        : null;

      const options = {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      };

      const makeRequest = (requestUrl) => {
        protocol.get(requestUrl, options, (res) => {
          // Handle redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location;
            console.log(`[ReceiptProcessor] Following redirect to: ${redirectUrl}`);
            makeRequest(redirectUrl);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
            return;
          }

          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      };

      makeRequest(url);
    });
  }

  /**
   * Detect media type from URL
   */
  detectMediaType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.png') || lowerUrl.includes('image/png')) return 'image/png';
    if (lowerUrl.includes('.gif') || lowerUrl.includes('image/gif')) return 'image/gif';
    if (lowerUrl.includes('.webp') || lowerUrl.includes('image/webp')) return 'image/webp';
    return 'image/jpeg'; // Default to JPEG
  }

  /**
   * Extract receipt data using Claude Vision API
   */
  async extractReceiptData(base64Image, mediaType, userDescription) {
    const extractionPrompt = `You are a receipt data extraction expert. Analyze this receipt image and extract structured data.

${userDescription ? `User context: ${userDescription}\n` : ''}
IMPORTANT: Return ONLY a valid JSON object with no additional text, markdown, or explanation.

Required fields:
- vendor: Business name exactly as shown (string)
- amount: Total amount paid as a number (e.g., 45.50)
- currency: ISO currency code (GBP, USD, EUR)
- date: Receipt date in YYYY-MM-DD format, or null if not visible
- category: One of: Fuel, Office Supplies, Travel, Food & Drink, Meals, Subscriptions, Utilities, Professional Services, Accommodation, Entertainment, Vehicle Maintenance, Other
- items: Array of items purchased, each with {description, quantity, unitPrice, lineTotal}
- extraction_confidence: Your confidence from 0 to 1

Optional fields (use null if not visible):
- address: Merchant address
- subtotal: Pre-tax amount
- vat: VAT/tax amount as number
- vatRate: VAT rate percentage (e.g., 20)
- paymentMethod: "card", "cash", "transfer"
- last4: Last 4 digits of card
- notes: Any issues, illegible parts, or special observations

If you cannot read the receipt at all, return:
{
  "extraction_failed": true,
  "failure_reason": "reason here",
  "extraction_confidence": 0
}

Return ONLY the JSON object:`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image
            }
          },
          {
            type: 'text',
            text: extractionPrompt
          }
        ]
      }]
    });

    const responseText = response.content[0].text.trim();

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);

        // Auto-detect category if not provided or is "Other"
        if (!data.category || data.category === 'Other') {
          data.category = this.autoDetectCategory(data.vendor);
        }

        return data;
      }
      throw new Error('No JSON found in response');
    } catch (parseError) {
      console.error('[ReceiptProcessor] JSON parse error:', parseError.message);
      console.error('[ReceiptProcessor] Raw response:', responseText);
      return {
        extraction_failed: true,
        failure_reason: 'Could not parse receipt data',
        extraction_confidence: 0
      };
    }
  }

  /**
   * Auto-detect expense category from vendor name
   */
  autoDetectCategory(vendorName) {
    if (!vendorName) return 'Other';

    const lowerVendor = vendorName.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerVendor.includes(keyword.toLowerCase())) {
          return category;
        }
      }
    }

    return 'Other';
  }

  /**
   * Determine which company the expense belongs to
   */
  determineCompany(extractedData, explicitCompany) {
    // If company was explicitly specified, use it
    if (explicitCompany && COMPANIES[explicitCompany.toUpperCase()]) {
      return explicitCompany.toUpperCase();
    }

    // Check if category hints at a company
    const category = extractedData.category;
    if (category && CATEGORY_COMPANY_HINTS[category]) {
      return CATEGORY_COMPANY_HINTS[category];
    }

    // Check vendor name for company hints
    const vendor = (extractedData.vendor || '').toLowerCase();

    // Fuel-related vendors -> GQCARS
    if (CATEGORY_KEYWORDS['Fuel'].some(k => vendor.includes(k.toLowerCase()))) {
      return 'GQCARS';
    }

    // Vehicle-related -> GQCARS
    if (CATEGORY_KEYWORDS['Vehicle Maintenance'].some(k => vendor.includes(k.toLowerCase()))) {
      return 'GQCARS';
    }

    // Default to GMH (Management Holdings) for general expenses
    return 'GMH';
  }

  /**
   * Build expense record for storage
   */
  buildExpenseRecord(extractedData, context) {
    const { userId, company, imageUrl, description } = context;

    return {
      vendor: extractedData.vendor || 'Unknown',
      amount: typeof extractedData.amount === 'number' ? extractedData.amount : null,
      currency: extractedData.currency || 'GBP',
      date: extractedData.date || null,
      category: extractedData.category || 'Other',
      items: extractedData.items || [],
      vat: typeof extractedData.vat === 'number' ? extractedData.vat : null,
      vatRate: extractedData.vatRate || null,
      paymentMethod: extractedData.paymentMethod || null,
      last4: extractedData.last4 || null,
      company: company,
      companyName: COMPANIES[company]?.name || company,
      userId: userId,
      imageUrl: imageUrl,
      userDescription: description || null,
      confidence: extractedData.extraction_confidence || 0,
      notes: extractedData.notes || null,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Save expense to JSON file
   */
  saveExpense(expense) {
    this.ensureDataDirectory();

    const data = this.loadExpenses();
    const id = data.nextId;

    const expenseRecord = {
      id,
      ...expense,
      savedAt: new Date().toISOString()
    };

    data.expenses.push(expenseRecord);
    data.nextId = id + 1;

    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(data, null, 2));
    console.log(`[ReceiptProcessor] Saved expense #${id} to ${EXPENSES_FILE}`);

    return id;
  }

  /**
   * Load expenses from JSON file
   */
  loadExpenses() {
    try {
      this.ensureDataDirectory();
      const data = fs.readFileSync(EXPENSES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[ReceiptProcessor] Failed to load expenses:', error);
      return { expenses: [], nextId: 1 };
    }
  }

  /**
   * Get expenses with optional filters
   */
  getExpenses(filters = {}) {
    const data = this.loadExpenses();
    let expenses = data.expenses;

    // Filter by company
    if (filters.company) {
      expenses = expenses.filter(e => e.company === filters.company.toUpperCase());
    }

    // Filter by category
    if (filters.category) {
      expenses = expenses.filter(e =>
        e.category && e.category.toLowerCase() === filters.category.toLowerCase()
      );
    }

    // Filter by month (YYYY-MM)
    if (filters.month) {
      expenses = expenses.filter(e =>
        e.date && e.date.startsWith(filters.month)
      );
    }

    // Filter by date range
    if (filters.startDate) {
      expenses = expenses.filter(e => e.date && e.date >= filters.startDate);
    }
    if (filters.endDate) {
      expenses = expenses.filter(e => e.date && e.date <= filters.endDate);
    }

    // Sort by date descending
    expenses.sort((a, b) => {
      const dateA = a.date || a.createdAt || '';
      const dateB = b.date || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });

    // Limit results
    if (filters.limit && filters.limit > 0) {
      expenses = expenses.slice(0, filters.limit);
    }

    return expenses;
  }

  /**
   * Get expense by ID
   */
  getExpenseById(id) {
    const data = this.loadExpenses();
    return data.expenses.find(e => e.id === id) || null;
  }

  /**
   * Delete expense by ID
   */
  deleteExpense(id) {
    const data = this.loadExpenses();
    const index = data.expenses.findIndex(e => e.id === id);

    if (index === -1) return null;

    const deleted = data.expenses.splice(index, 1)[0];
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(data, null, 2));
    console.log(`[ReceiptProcessor] Deleted expense #${id}`);

    return deleted;
  }

  /**
   * Format summary for WhatsApp response
   */
  formatSummary(expense, expenseId) {
    const parts = [];

    parts.push(`*Expense #${expenseId} Saved*\n`);

    // Vendor and amount
    const amountStr = expense.amount !== null
      ? `${expense.currency} ${expense.amount.toFixed(2)}`
      : 'Amount unclear';
    parts.push(`*${expense.vendor}*`);
    parts.push(`Amount: ${amountStr}`);

    // VAT if present
    if (expense.vat !== null) {
      const vatStr = `${expense.currency} ${expense.vat.toFixed(2)}`;
      parts.push(`VAT: ${vatStr}${expense.vatRate ? ` (${expense.vatRate}%)` : ''}`);
    }

    // Date
    if (expense.date) {
      parts.push(`Date: ${this.formatDate(expense.date)}`);
    }

    // Category
    parts.push(`Category: ${expense.category}`);

    // Company allocation
    parts.push(`Company: ${expense.companyName} (${expense.company})`);

    // Items if present
    if (expense.items && expense.items.length > 0 && expense.items.length <= 5) {
      parts.push('\n*Items:*');
      for (const item of expense.items) {
        const qty = item.quantity ? `x${item.quantity} ` : '';
        const price = item.lineTotal ? ` - ${expense.currency} ${item.lineTotal.toFixed(2)}` : '';
        parts.push(`- ${qty}${item.description}${price}`);
      }
    } else if (expense.items && expense.items.length > 5) {
      parts.push(`\n_${expense.items.length} items (too many to list)_`);
    }

    // Confidence
    const confidencePct = Math.round((expense.confidence || 0) * 100);
    parts.push(`\nConfidence: ${confidencePct}%`);

    // Payment method if known
    if (expense.paymentMethod) {
      let paymentStr = expense.paymentMethod;
      if (expense.last4) paymentStr += ` (****${expense.last4})`;
      parts.push(`Payment: ${paymentStr}`);
    }

    return parts.join('\n');
  }

  /**
   * Format date for display
   */
  formatDate(isoDate) {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Get summary of expenses by company
   */
  getCompanySummary(filters = {}) {
    const expenses = this.getExpenses(filters);
    const summary = {};

    for (const companyCode of Object.keys(COMPANIES)) {
      summary[companyCode] = {
        ...COMPANIES[companyCode],
        total: 0,
        vat: 0,
        count: 0,
        categories: {}
      };
    }

    // Add "Unassigned" for any expenses without a valid company
    summary['UNASSIGNED'] = {
      code: 'UNASSIGNED',
      name: 'Unassigned',
      total: 0,
      vat: 0,
      count: 0,
      categories: {}
    };

    for (const expense of expenses) {
      const company = expense.company && summary[expense.company]
        ? expense.company
        : 'UNASSIGNED';

      const amount = expense.amount || 0;
      const vat = expense.vat || 0;
      const category = expense.category || 'Other';

      summary[company].total += amount;
      summary[company].vat += vat;
      summary[company].count += 1;

      if (!summary[company].categories[category]) {
        summary[company].categories[category] = 0;
      }
      summary[company].categories[category] += amount;
    }

    // Remove companies with no expenses
    for (const code of Object.keys(summary)) {
      if (summary[code].count === 0) {
        delete summary[code];
      }
    }

    return summary;
  }

  /**
   * Get available company codes
   */
  getCompanies() {
    return { ...COMPANIES };
  }

  /**
   * Check if processor is available
   */
  isAvailable() {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

// Singleton instance
const receiptProcessor = new ReceiptProcessor();

module.exports = receiptProcessor;
