/**
 * Intercompany Skill - Track loans and transactions between Giquina group companies
 *
 * Manages intercompany balances, loans, and repayments for the 5 Giquina group companies:
 * - GMH (Giquina Management Holdings) - Parent company
 * - GACC (Giquina Accounting)
 * - GCAP (Giquina Capital)
 * - GQCARS (GQ Cars Ltd)
 * - GSPV (Giquina SPV)
 *
 * Commands:
 *   intercompany | ic balance           - Show all intercompany balances
 *   loans | ic loans                    - Show loan summary
 *   record loan <from> to <to> <amount> - Record a new loan
 *   record payment <from> to <to> <amount> - Record loan repayment
 *   ic history                          - Show recent transactions
 *   balance <company> | ic <company>    - Show specific company's intercompany position
 *
 * Data is stored in memory via context.memory
 */
const BaseSkill = require('../base-skill');

class IntercompanySkill extends BaseSkill {
  name = 'intercompany';
  description = 'Track loans and transactions between Giquina group companies';
  priority = 23;

  // Valid company codes and their full names
  companies = {
    GMH: 'Giquina Management Holdings',
    GACC: 'Giquina Accounting',
    GCAP: 'Giquina Capital',
    GQCARS: 'GQ Cars Ltd',
    GSPV: 'Giquina SPV'
  };

  commands = [
    {
      pattern: /^(intercompany|ic\s*balance?)$/i,
      description: 'Show all intercompany balances',
      usage: 'intercompany or ic balance'
    },
    {
      pattern: /^(loans|ic\s+loans)$/i,
      description: 'Show loan summary',
      usage: 'loans or ic loans'
    },
    {
      pattern: /^record\s+loan\s+(\w+)\s+to\s+(\w+)\s+([\d,\.]+)(?:\s+(.+))?$/i,
      description: 'Record a new intercompany loan',
      usage: 'record loan <from> to <to> <amount> [description]'
    },
    {
      pattern: /^record\s+payment\s+(\w+)\s+to\s+(\w+)\s+([\d,\.]+)(?:\s+(.+))?$/i,
      description: 'Record a loan repayment',
      usage: 'record payment <from> to <to> <amount> [description]'
    },
    {
      pattern: /^ic\s+history$/i,
      description: 'Show recent intercompany transactions',
      usage: 'ic history'
    },
    {
      pattern: /^(balance\s+(\w+)|ic\s+(\w+))$/i,
      description: 'Show specific company intercompany position',
      usage: 'balance <company> or ic <company>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.MEMORY_KEY = 'intercompany_transactions';
  }

  /**
   * Initialize skill and ensure memory structure exists
   */
  async initialize() {
    await super.initialize();

    // Ensure transactions array exists in memory
    if (this.memory) {
      const existing = this.getTransactions();
      if (!existing || !Array.isArray(existing)) {
        this.saveTransactions([]);
      }
    }

    this.log('info', 'Intercompany skill initialized with companies:', Object.keys(this.companies).join(', '));
  }

  /**
   * Get transactions from memory
   */
  getTransactions() {
    if (!this.memory) return [];

    try {
      // Use memory.get if available, otherwise check if memory has a data store
      if (typeof this.memory.get === 'function') {
        return this.memory.get(this.MEMORY_KEY) || [];
      }
      // Fallback: store in memory object directly
      return this.memory[this.MEMORY_KEY] || [];
    } catch (e) {
      this.log('warn', 'Failed to get transactions from memory', e);
      return [];
    }
  }

  /**
   * Save transactions to memory
   */
  saveTransactions(transactions) {
    if (!this.memory) {
      this.log('warn', 'No memory available, using in-memory storage');
      this._inMemoryTransactions = transactions;
      return;
    }

    try {
      if (typeof this.memory.set === 'function') {
        this.memory.set(this.MEMORY_KEY, transactions);
      } else {
        // Fallback: store in memory object directly
        this.memory[this.MEMORY_KEY] = transactions;
      }
    } catch (e) {
      this.log('warn', 'Failed to save transactions to memory', e);
      this._inMemoryTransactions = transactions;
    }
  }

  /**
   * Generate next transaction ID
   */
  generateTransactionId() {
    const transactions = this.getTransactions();
    const year = new Date().getFullYear();
    const count = transactions.filter(t => t.id.startsWith(`IC_${year}`)).length + 1;
    return `IC_${year}_${String(count).padStart(3, '0')}`;
  }

  /**
   * Normalize company code
   */
  normalizeCompany(code) {
    const upper = code.toUpperCase().trim();
    // Handle common variations
    if (upper === 'GQ' || upper === 'CARS' || upper === 'QCARS') return 'GQCARS';
    if (upper === 'CAP' || upper === 'CAPITAL') return 'GCAP';
    if (upper === 'ACC' || upper === 'ACCOUNTING') return 'GACC';
    if (upper === 'SPV') return 'GSPV';
    if (upper === 'MH' || upper === 'HOLDINGS' || upper === 'PARENT') return 'GMH';
    return upper;
  }

  /**
   * Validate company code
   */
  isValidCompany(code) {
    return this.companies.hasOwnProperty(this.normalizeCompany(code));
  }

  /**
   * Parse amount string to number
   */
  parseAmount(amountStr) {
    // Remove commas and parse as float
    const cleaned = amountStr.replace(/,/g, '').trim();
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : Math.round(amount * 100) / 100;
  }

  /**
   * Format amount as currency
   */
  formatAmount(amount) {
    const absAmount = Math.abs(amount);
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(absAmount);
  }

  /**
   * Format date as readable string
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  /**
   * Calculate balances for all companies
   * Returns object with each company's receivables, payables, and net position
   */
  calculateBalances() {
    const transactions = this.getTransactions().filter(t => t.status === 'active');
    const balances = {};

    // Initialize all companies
    Object.keys(this.companies).forEach(code => {
      balances[code] = {
        receivables: {}, // money owed TO this company (by other companies)
        payables: {},    // money owed BY this company (to other companies)
        netPosition: 0
      };
    });

    // Process each transaction
    transactions.forEach(t => {
      const amount = t.type === 'repayment' ? -t.amount : t.amount;
      const from = t.from;
      const to = t.to;

      if (t.type === 'loan' || t.type === 'service_fee' || t.type === 'dividend') {
        // Lender (from) is owed money by borrower (to)
        if (!balances[from].receivables[to]) balances[from].receivables[to] = 0;
        balances[from].receivables[to] += t.amount;
        balances[from].netPosition += t.amount;

        // Borrower (to) owes money to lender (from)
        if (!balances[to].payables[from]) balances[to].payables[from] = 0;
        balances[to].payables[from] += t.amount;
        balances[to].netPosition -= t.amount;
      } else if (t.type === 'repayment') {
        // Payment reduces the debt: from pays to (from was the borrower)
        if (!balances[to].receivables[from]) balances[to].receivables[from] = 0;
        balances[to].receivables[from] -= t.amount;
        balances[to].netPosition -= t.amount;

        if (!balances[from].payables[to]) balances[from].payables[to] = 0;
        balances[from].payables[to] -= t.amount;
        balances[from].netPosition += t.amount;
      }
    });

    return balances;
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const normalized = raw.toLowerCase().trim();

    try {
      // Route to appropriate handler
      if (/^(intercompany|ic\s*balance?)$/i.test(normalized)) {
        return this.handleShowBalances();
      }

      if (/^(loans|ic\s+loans)$/i.test(normalized)) {
        return this.handleShowLoans();
      }

      if (/^record\s+loan\s+/i.test(normalized)) {
        const match = raw.match(/^record\s+loan\s+(\w+)\s+to\s+(\w+)\s+([\d,\.]+)(?:\s+(.+))?$/i);
        if (match) {
          return this.handleRecordLoan(match[1], match[2], match[3], match[4] || 'Working capital loan');
        }
      }

      if (/^record\s+payment\s+/i.test(normalized)) {
        const match = raw.match(/^record\s+payment\s+(\w+)\s+to\s+(\w+)\s+([\d,\.]+)(?:\s+(.+))?$/i);
        if (match) {
          return this.handleRecordPayment(match[1], match[2], match[3], match[4] || 'Loan repayment');
        }
      }

      if (/^ic\s+history$/i.test(normalized)) {
        return this.handleShowHistory();
      }

      // Check for company-specific balance
      const balanceMatch = raw.match(/^(?:balance\s+(\w+)|ic\s+(\w+))$/i);
      if (balanceMatch) {
        const company = balanceMatch[1] || balanceMatch[2];
        // Exclude reserved keywords
        if (!['balance', 'loans', 'history'].includes(company.toLowerCase())) {
          return this.handleCompanyBalance(company);
        }
      }

      return this.error('Unknown intercompany command. Try: intercompany, loans, ic history, or balance <company>');

    } catch (err) {
      this.log('error', 'Intercompany command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  /**
   * Handle: intercompany / ic balance
   * Show all intercompany balances
   */
  handleShowBalances() {
    const balances = this.calculateBalances();
    const transactions = this.getTransactions().filter(t => t.status === 'active');

    let output = '\ud83d\udcb0 INTERCOMPANY BALANCES\n\n';

    let totalLoans = 0;
    const companiesWithBalances = [];
    const companiesWithoutBalances = [];

    Object.keys(this.companies).forEach(code => {
      const b = balances[code];
      const hasReceivables = Object.values(b.receivables).some(v => v !== 0);
      const hasPayables = Object.values(b.payables).some(v => v !== 0);

      if (hasReceivables || hasPayables) {
        companiesWithBalances.push(code);
      } else {
        companiesWithoutBalances.push(code);
      }
    });

    // Show companies with balances
    companiesWithBalances.forEach(code => {
      const b = balances[code];
      const isParent = code === 'GMH';

      output += `*${code}${isParent ? ' (Parent)' : ''}:*\n`;

      // Show receivables (money owed to this company)
      Object.entries(b.receivables).forEach(([company, amount]) => {
        if (amount > 0) {
          output += `  \u2192 Owed by ${company}: ${this.formatAmount(amount)}\n`;
          if (code === 'GMH') totalLoans += amount;
        }
      });

      // Show payables (money owed by this company)
      Object.entries(b.payables).forEach(([company, amount]) => {
        if (amount > 0) {
          output += `  \u2192 Owes ${company}: ${this.formatAmount(amount)}\n`;
        }
      });

      // Net position
      const position = b.netPosition;
      const positionType = position >= 0 ? 'receivable' : 'payable';
      output += `  Net Position: ${position >= 0 ? '+' : ''}${this.formatAmount(position)} (${positionType})\n\n`;
    });

    // Show companies without balances
    if (companiesWithoutBalances.length > 0) {
      output += `${companiesWithoutBalances.join(', ')}: No intercompany balances\n\n`;
    }

    // Calculate total intercompany loans (from parent perspective)
    const totalReceivables = Object.values(balances.GMH.receivables).reduce((sum, v) => sum + Math.max(0, v), 0);
    output += `\ud83d\udcca Group Total: ${this.formatAmount(totalReceivables)} in intercompany loans`;

    return this.success(output);
  }

  /**
   * Handle: loans / ic loans
   * Show loan summary
   */
  handleShowLoans() {
    const transactions = this.getTransactions().filter(t =>
      t.type === 'loan' && t.status === 'active'
    );

    if (transactions.length === 0) {
      return this.success(
        '\ud83d\udcb3 *No Active Intercompany Loans*\n\n' +
        'Record a loan with:\n' +
        '`record loan GMH to GQCARS 5000`'
      );
    }

    // Calculate net loan amounts per company pair
    const loanSummary = {};

    transactions.forEach(t => {
      const key = `${t.from}->${t.to}`;
      if (!loanSummary[key]) {
        loanSummary[key] = {
          from: t.from,
          to: t.to,
          totalAmount: 0,
          count: 0,
          latestDate: t.date
        };
      }
      loanSummary[key].totalAmount += t.amount;
      loanSummary[key].count++;
      if (t.date > loanSummary[key].latestDate) {
        loanSummary[key].latestDate = t.date;
      }
    });

    // Factor in repayments
    const repayments = this.getTransactions().filter(t =>
      t.type === 'repayment' && t.status === 'active'
    );

    repayments.forEach(t => {
      // Repayment from A to B reduces the loan from B to A
      const key = `${t.to}->${t.from}`;
      if (loanSummary[key]) {
        loanSummary[key].totalAmount -= t.amount;
      }
    });

    let output = '\ud83d\udcb3 INTERCOMPANY LOANS\n';
    output += '\u2501'.repeat(20) + '\n\n';

    let totalOutstanding = 0;

    Object.values(loanSummary)
      .filter(l => l.totalAmount > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .forEach(loan => {
        output += `*${loan.from} \u2192 ${loan.to}*\n`;
        output += `  Outstanding: ${this.formatAmount(loan.totalAmount)}\n`;
        output += `  Transactions: ${loan.count}\n`;
        output += `  Latest: ${this.formatDate(loan.latestDate)}\n\n`;
        totalOutstanding += loan.totalAmount;
      });

    output += '\u2501'.repeat(20) + '\n';
    output += `*Total Outstanding: ${this.formatAmount(totalOutstanding)}*`;

    return this.success(output);
  }

  /**
   * Handle: record loan <from> to <to> <amount>
   */
  handleRecordLoan(fromCompany, toCompany, amountStr, description) {
    const from = this.normalizeCompany(fromCompany);
    const to = this.normalizeCompany(toCompany);
    const amount = this.parseAmount(amountStr);

    // Validate companies
    if (!this.isValidCompany(from)) {
      return this.error(`Unknown company: ${fromCompany}. Valid: ${Object.keys(this.companies).join(', ')}`);
    }
    if (!this.isValidCompany(to)) {
      return this.error(`Unknown company: ${toCompany}. Valid: ${Object.keys(this.companies).join(', ')}`);
    }
    if (from === to) {
      return this.error('Cannot record a loan from a company to itself');
    }
    if (amount <= 0) {
      return this.error('Amount must be greater than zero');
    }

    // Create transaction
    const transaction = {
      id: this.generateTransactionId(),
      date: new Date().toISOString().split('T')[0],
      from: from,
      to: to,
      amount: amount,
      type: 'loan',
      description: description,
      status: 'active'
    };

    // Save transaction
    const transactions = this.getTransactions();
    transactions.push(transaction);
    this.saveTransactions(transactions);

    this.log('info', 'Recorded loan:', transaction);

    // Build response
    let output = '\ud83d\udcdd LOAN RECORDED\n\n';
    output += `From: ${from} (${this.companies[from]})\n`;
    output += `To: ${to} (${this.companies[to]})\n`;
    output += `Amount: ${this.formatAmount(amount)}\n`;
    output += `Date: ${this.formatDate(transaction.date)}\n`;
    output += `Reference: ${transaction.id}\n\n`;

    // Add reminders for larger loans
    if (amount >= 5000) {
      output += '\u26a0\ufe0f Reminder: Intercompany loans should:\n';
      output += '\u2022 Be documented with loan agreement\n';
      output += '\u2022 Have board approval if >\u00a35,000\n';
      output += '\u2022 Consider interest (arm\'s length terms)';
    }

    return this.success(output);
  }

  /**
   * Handle: record payment <from> to <to> <amount>
   */
  handleRecordPayment(fromCompany, toCompany, amountStr, description) {
    const from = this.normalizeCompany(fromCompany);
    const to = this.normalizeCompany(toCompany);
    const amount = this.parseAmount(amountStr);

    // Validate companies
    if (!this.isValidCompany(from)) {
      return this.error(`Unknown company: ${fromCompany}. Valid: ${Object.keys(this.companies).join(', ')}`);
    }
    if (!this.isValidCompany(to)) {
      return this.error(`Unknown company: ${toCompany}. Valid: ${Object.keys(this.companies).join(', ')}`);
    }
    if (from === to) {
      return this.error('Cannot record a payment from a company to itself');
    }
    if (amount <= 0) {
      return this.error('Amount must be greater than zero');
    }

    // Check if there's an outstanding loan to repay
    const balances = this.calculateBalances();
    const owedAmount = balances[from].payables[to] || 0;

    // Create transaction
    const transaction = {
      id: this.generateTransactionId(),
      date: new Date().toISOString().split('T')[0],
      from: from,
      to: to,
      amount: amount,
      type: 'repayment',
      description: description,
      status: 'active'
    };

    // Save transaction
    const transactions = this.getTransactions();
    transactions.push(transaction);
    this.saveTransactions(transactions);

    this.log('info', 'Recorded payment:', transaction);

    // Build response
    let output = '\u2705 PAYMENT RECORDED\n\n';
    output += `From: ${from} (${this.companies[from]})\n`;
    output += `To: ${to} (${this.companies[to]})\n`;
    output += `Amount: ${this.formatAmount(amount)}\n`;
    output += `Date: ${this.formatDate(transaction.date)}\n`;
    output += `Reference: ${transaction.id}\n\n`;

    // Show remaining balance
    const remainingBalance = owedAmount - amount;
    if (remainingBalance > 0) {
      output += `Remaining balance owed by ${from} to ${to}: ${this.formatAmount(remainingBalance)}`;
    } else if (remainingBalance === 0) {
      output += `\u2728 Loan fully repaid! Balance: \u00a30`;
    } else if (owedAmount > 0) {
      output += `\u26a0\ufe0f Overpayment: ${from} has now paid ${this.formatAmount(Math.abs(remainingBalance))} more than owed`;
    }

    return this.success(output);
  }

  /**
   * Handle: ic history
   * Show recent transactions
   */
  handleShowHistory() {
    const transactions = this.getTransactions()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    if (transactions.length === 0) {
      return this.success(
        '\ud83d\udcc5 *No Transaction History*\n\n' +
        'Record your first transaction:\n' +
        '`record loan GMH to GQCARS 5000`'
      );
    }

    let output = '\ud83d\udcc5 INTERCOMPANY HISTORY\n';
    output += '\u2501'.repeat(20) + '\n\n';

    transactions.forEach((t, idx) => {
      const typeEmoji = t.type === 'loan' ? '\ud83d\udcb8' :
                       t.type === 'repayment' ? '\u2705' :
                       t.type === 'service_fee' ? '\ud83d\udcbc' : '\ud83d\udcb0';

      output += `${idx + 1}. ${typeEmoji} *${t.id}*\n`;
      output += `   ${t.from} \u2192 ${t.to}: ${this.formatAmount(t.amount)}\n`;
      output += `   ${t.type.charAt(0).toUpperCase() + t.type.slice(1)} \u2022 ${this.formatDate(t.date)}\n`;
      if (t.description) {
        output += `   _${t.description}_\n`;
      }
      output += '\n';
    });

    output += `_Showing ${transactions.length} most recent transactions_`;

    return this.success(output);
  }

  /**
   * Handle: balance <company> / ic <company>
   * Show specific company's intercompany position
   */
  handleCompanyBalance(companyCode) {
    const company = this.normalizeCompany(companyCode);

    if (!this.isValidCompany(company)) {
      return this.error(`Unknown company: ${companyCode}. Valid: ${Object.keys(this.companies).join(', ')}`);
    }

    const balances = this.calculateBalances();
    const b = balances[company];
    const isParent = company === 'GMH';

    let output = `\ud83c\udfe2 *${company} INTERCOMPANY POSITION*\n`;
    output += `${this.companies[company]}${isParent ? ' (Parent)' : ''}\n`;
    output += '\u2501'.repeat(20) + '\n\n';

    // Receivables
    const receivableEntries = Object.entries(b.receivables).filter(([_, v]) => v > 0);
    if (receivableEntries.length > 0) {
      output += '*Receivables (Owed TO us):*\n';
      let totalReceivables = 0;
      receivableEntries.forEach(([co, amount]) => {
        output += `  \u2022 ${co}: ${this.formatAmount(amount)}\n`;
        totalReceivables += amount;
      });
      output += `  _Subtotal: ${this.formatAmount(totalReceivables)}_\n\n`;
    } else {
      output += '*Receivables:* None\n\n';
    }

    // Payables
    const payableEntries = Object.entries(b.payables).filter(([_, v]) => v > 0);
    if (payableEntries.length > 0) {
      output += '*Payables (Owed BY us):*\n';
      let totalPayables = 0;
      payableEntries.forEach(([co, amount]) => {
        output += `  \u2022 ${co}: ${this.formatAmount(amount)}\n`;
        totalPayables += amount;
      });
      output += `  _Subtotal: ${this.formatAmount(totalPayables)}_\n\n`;
    } else {
      output += '*Payables:* None\n\n';
    }

    // Net position
    output += '\u2501'.repeat(20) + '\n';
    const position = b.netPosition;
    const positionType = position >= 0 ? 'Net Receivable (Asset)' : 'Net Payable (Liability)';
    output += `*Net Position: ${position >= 0 ? '+' : ''}${this.formatAmount(position)}*\n`;
    output += `_${positionType}_`;

    return this.success(output);
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      companies: this.companies,
      transactionCount: this.getTransactions().length
    };
  }
}

module.exports = IntercompanySkill;
