/**
 * Deadlines Skill - UK Company Deadline Tracker for ClawdBot
 *
 * Tracks statutory deadlines for UK limited companies including:
 * - Confirmation Statement (CS01) - Annual, due 14 days after review period
 * - Annual Accounts - Due 9 months after year end (private companies)
 * - Corporation Tax Return (CT600) - Due 12 months after accounting period
 * - Corporation Tax Payment - Due 9 months + 1 day after period end
 * - VAT Returns - Quarterly (if VAT registered)
 * - PAYE/NI - Monthly (if employees)
 *
 * Commands:
 *   deadlines | upcoming           - Show all upcoming deadlines
 *   deadlines <company>            - Show deadlines for specific company
 *   due this week                  - Show deadlines due this week
 *   due this month                 - Show deadlines due this month
 *   overdue                        - Show any overdue items
 *   add deadline <company> <type> <date> - Add custom deadline
 *   remove deadline <id>           - Remove a custom deadline
 */

const BaseSkill = require('../base-skill');

class DeadlinesSkill extends BaseSkill {
  name = 'deadlines';
  description = 'Track UK company statutory deadlines and filing dates';
  priority = 28;

  // Hardcoded company data with incorporation dates
  companies = {
    'GMH': {
      name: 'Giquina Management Holdings Ltd',
      number: '15425137',
      incorporated: '2024-08-14',
      vatRegistered: false,
      hasEmployees: false,
      shortName: 'GMH'
    },
    'GACC': {
      name: 'Giquina Accountancy Ltd',
      number: '16396650',
      incorporated: '2025-04-23',
      vatRegistered: false,
      hasEmployees: false,
      shortName: 'GACC'
    },
    'GCAP': {
      name: 'Giquina Capital Ltd',
      number: '16360342',
      incorporated: '2025-04-08',
      vatRegistered: false,
      hasEmployees: false,
      shortName: 'GCAP'
    },
    'GQCARS': {
      name: 'GQ Cars Ltd',
      number: '15389347',
      incorporated: '2024-08-02',
      vatRegistered: false,
      hasEmployees: false,
      shortName: 'GQCARS'
    },
    'GSPV': {
      name: 'Giquina Structured Asset SPV Ltd',
      number: '16369465',
      incorporated: '2025-04-11',
      vatRegistered: false,
      hasEmployees: false,
      shortName: 'GSPV'
    }
  };

  // Deadline type definitions
  deadlineTypes = {
    'CS01': {
      name: 'Confirmation Statement',
      description: 'Annual confirmation statement to Companies House',
      calculateDue: (company, baseDate) => {
        // Due 14 days after the review period ends (anniversary of incorporation)
        const reviewDate = this.getNextAnniversary(company.incorporated, baseDate);
        return this.addDays(reviewDate, 14);
      }
    },
    'ACCOUNTS': {
      name: 'Annual Accounts',
      description: 'File accounts with Companies House',
      calculateDue: (company, baseDate) => {
        // First accounts: 21 months from incorporation
        // Subsequent: 9 months after financial year end
        const incDate = new Date(company.incorporated);
        const firstAccountsDue = this.addMonths(incDate, 21);

        if (baseDate < firstAccountsDue) {
          return firstAccountsDue;
        }

        // Get next year end (usually anniversary of incorporation month)
        const yearEnd = this.getAccountingYearEnd(company, baseDate);
        return this.addMonths(yearEnd, 9);
      }
    },
    'CT600': {
      name: 'Corporation Tax Return',
      description: 'File CT600 with HMRC',
      calculateDue: (company, baseDate) => {
        // Due 12 months after the end of the accounting period
        const yearEnd = this.getAccountingYearEnd(company, baseDate);
        return this.addMonths(yearEnd, 12);
      }
    },
    'CT_PAYMENT': {
      name: 'Corporation Tax Payment',
      description: 'Pay corporation tax to HMRC',
      calculateDue: (company, baseDate) => {
        // Due 9 months and 1 day after the accounting period ends
        const yearEnd = this.getAccountingYearEnd(company, baseDate);
        const dueDate = this.addMonths(yearEnd, 9);
        return this.addDays(dueDate, 1);
      }
    },
    'VAT': {
      name: 'VAT Return',
      description: 'Quarterly VAT return and payment',
      calculateDue: (company, baseDate) => {
        if (!company.vatRegistered) return null;
        // Due 1 month and 7 days after the quarter end
        const quarterEnd = this.getNextQuarterEnd(baseDate);
        const dueDate = this.addMonths(quarterEnd, 1);
        return this.addDays(dueDate, 7);
      }
    },
    'PAYE': {
      name: 'PAYE/NI',
      description: 'Monthly PAYE and National Insurance',
      calculateDue: (company, baseDate) => {
        if (!company.hasEmployees) return null;
        // Due 22nd of the following month (or 19th for cheque payments)
        const nextMonth = this.addMonths(baseDate, 1);
        return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 22);
      }
    }
  };

  commands = [
    {
      pattern: /^(deadlines|upcoming)$/i,
      description: 'Show all upcoming deadlines',
      usage: 'deadlines'
    },
    {
      pattern: /^deadlines?\s+(\w+)$/i,
      description: 'Show deadlines for a specific company',
      usage: 'deadlines <company>'
    },
    {
      pattern: /^due\s+this\s+week$/i,
      description: 'Show deadlines due this week',
      usage: 'due this week'
    },
    {
      pattern: /^due\s+this\s+month$/i,
      description: 'Show deadlines due this month',
      usage: 'due this month'
    },
    {
      pattern: /^overdue$/i,
      description: 'Show any overdue items',
      usage: 'overdue'
    },
    {
      pattern: /^add\s+deadline\s+(\w+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})$/i,
      description: 'Add a custom deadline',
      usage: 'add deadline <company> <description> <YYYY-MM-DD>'
    },
    {
      pattern: /^remove\s+deadline\s+(\d+)$/i,
      description: 'Remove a custom deadline',
      usage: 'remove deadline <id>'
    }
  ];

  /**
   * Execute deadline commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const raw = parsed.raw;
    const lowerCommand = raw.toLowerCase();

    try {
      // Show all deadlines
      if (/^(deadlines|upcoming)$/i.test(lowerCommand)) {
        return this.handleShowAllDeadlines();
      }

      // Show deadlines for specific company
      const companyMatch = raw.match(/^deadlines?\s+(\w+)$/i);
      if (companyMatch) {
        return this.handleShowCompanyDeadlines(companyMatch[1].toUpperCase());
      }

      // Due this week
      if (/^due\s+this\s+week$/i.test(lowerCommand)) {
        return this.handleDueThisWeek();
      }

      // Due this month
      if (/^due\s+this\s+month$/i.test(lowerCommand)) {
        return this.handleDueThisMonth();
      }

      // Overdue items
      if (/^overdue$/i.test(lowerCommand)) {
        return this.handleOverdue();
      }

      // Add custom deadline
      const addMatch = raw.match(/^add\s+deadline\s+(\w+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})$/i);
      if (addMatch) {
        return this.handleAddDeadline(addMatch[1].toUpperCase(), addMatch[2], addMatch[3]);
      }

      // Remove custom deadline
      const removeMatch = raw.match(/^remove\s+deadline\s+(\d+)$/i);
      if (removeMatch) {
        return this.handleRemoveDeadline(parseInt(removeMatch[1]));
      }

      return this.error('Unknown deadlines command. Try "deadlines" or "deadlines GMH"');

    } catch (err) {
      this.log('error', 'Deadlines command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  /**
   * Show all upcoming deadlines for all companies
   */
  handleShowAllDeadlines() {
    const now = new Date();
    const allDeadlines = [];

    // Calculate statutory deadlines for each company
    for (const [code, company] of Object.entries(this.companies)) {
      const companyDeadlines = this.calculateCompanyDeadlines(company, now);
      allDeadlines.push(...companyDeadlines);
    }

    // Add custom deadlines from memory
    const customDeadlines = this.getCustomDeadlines();
    allDeadlines.push(...customDeadlines);

    // Sort by due date
    allDeadlines.sort((a, b) => a.dueDate - b.dueDate);

    // Filter to show next 90 days only
    const cutoff = this.addDays(now, 90);
    const upcoming = allDeadlines.filter(d => d.dueDate <= cutoff && d.dueDate >= now);

    if (upcoming.length === 0) {
      return this.success(
        '*No upcoming deadlines in the next 90 days*\n\n' +
        'All statutory filings are up to date.'
      );
    }

    let output = '*Upcoming Deadlines*\n';
    output += '━━━━━━━━━━━━━━━━━━━━━\n\n';

    upcoming.forEach(deadline => {
      const indicator = this.getStatusIndicator(deadline.dueDate, now);
      const daysLeft = this.getDaysRemaining(deadline.dueDate, now);
      const dateStr = this.formatDateShort(deadline.dueDate);

      output += `${indicator} *${deadline.companyCode}* - ${deadline.type}\n`;
      output += `   ${dateStr} (${daysLeft})\n`;
      if (deadline.description) {
        output += `   _${deadline.description}_\n`;
      }
      output += '\n';
    });

    output += '━━━━━━━━━━━━━━━━━━━━━\n';
    output += `_${upcoming.length} deadline(s) in next 90 days_`;

    return this.success(output);
  }

  /**
   * Show deadlines for a specific company
   */
  handleShowCompanyDeadlines(companyCode) {
    const company = this.companies[companyCode];

    if (!company) {
      const validCodes = Object.keys(this.companies).join(', ');
      return this.error(
        `Company "${companyCode}" not found.\n\n` +
        `Valid companies: ${validCodes}`
      );
    }

    const now = new Date();
    const deadlines = this.calculateCompanyDeadlines(company, now);

    // Add custom deadlines for this company
    const customDeadlines = this.getCustomDeadlines().filter(
      d => d.companyCode === companyCode
    );
    deadlines.push(...customDeadlines);

    // Sort by due date
    deadlines.sort((a, b) => a.dueDate - b.dueDate);

    let output = `*${company.name}*\n`;
    output += `Company No: ${company.number}\n`;
    output += `Incorporated: ${this.formatDateShort(new Date(company.incorporated))}\n`;
    output += '━━━━━━━━━━━━━━━━━━━━━\n\n';

    deadlines.forEach(deadline => {
      const indicator = this.getStatusIndicator(deadline.dueDate, now);
      const daysLeft = this.getDaysRemaining(deadline.dueDate, now);
      const dateStr = this.formatDateShort(deadline.dueDate);

      output += `${indicator} *${deadline.type}*\n`;
      output += `   Due: ${dateStr} (${daysLeft})\n`;
      if (deadline.description) {
        output += `   _${deadline.description}_\n`;
      }
      output += '\n';
    });

    // Show company status flags
    output += '━━━━━━━━━━━━━━━━━━━━━\n';
    output += `VAT Registered: ${company.vatRegistered ? 'Yes' : 'No'}\n`;
    output += `Has Employees: ${company.hasEmployees ? 'Yes' : 'No'}`;

    return this.success(output);
  }

  /**
   * Show deadlines due this week
   */
  handleDueThisWeek() {
    const now = new Date();
    const weekEnd = this.addDays(now, 7);

    return this.handleFilteredDeadlines(now, weekEnd, 'This Week');
  }

  /**
   * Show deadlines due this month
   */
  handleDueThisMonth() {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return this.handleFilteredDeadlines(now, monthEnd, 'This Month');
  }

  /**
   * Show any overdue items
   */
  handleOverdue() {
    const now = new Date();
    const allDeadlines = [];

    for (const [code, company] of Object.entries(this.companies)) {
      const companyDeadlines = this.calculateCompanyDeadlines(company, now, true);
      allDeadlines.push(...companyDeadlines);
    }

    const customDeadlines = this.getCustomDeadlines();
    allDeadlines.push(...customDeadlines);

    // Filter to overdue only
    const overdue = allDeadlines.filter(d => d.dueDate < now);
    overdue.sort((a, b) => a.dueDate - b.dueDate);

    if (overdue.length === 0) {
      return this.success(
        '*No Overdue Items*\n\n' +
        'All filings are up to date!'
      );
    }

    let output = '*OVERDUE ITEMS*\n';
    output += '━━━━━━━━━━━━━━━━━━━━━\n\n';

    overdue.forEach(deadline => {
      const daysOverdue = Math.abs(this.getDaysDiff(deadline.dueDate, now));
      const dateStr = this.formatDateShort(deadline.dueDate);

      output += `*${deadline.companyCode}* - ${deadline.type}\n`;
      output += `   Was due: ${dateStr} (${daysOverdue} days overdue)\n`;
      if (deadline.description) {
        output += `   _${deadline.description}_\n`;
      }
      output += '\n';
    });

    output += '━━━━━━━━━━━━━━━━━━━━━\n';
    output += `_${overdue.length} overdue item(s)_`;

    return this.success(output);
  }

  /**
   * Filter deadlines by date range
   */
  handleFilteredDeadlines(startDate, endDate, periodLabel) {
    const now = new Date();
    const allDeadlines = [];

    for (const [code, company] of Object.entries(this.companies)) {
      const companyDeadlines = this.calculateCompanyDeadlines(company, now);
      allDeadlines.push(...companyDeadlines);
    }

    const customDeadlines = this.getCustomDeadlines();
    allDeadlines.push(...customDeadlines);

    // Filter by date range
    const filtered = allDeadlines.filter(d =>
      d.dueDate >= startDate && d.dueDate <= endDate
    );
    filtered.sort((a, b) => a.dueDate - b.dueDate);

    if (filtered.length === 0) {
      return this.success(
        `*No Deadlines ${periodLabel}*\n\n` +
        'Nothing due in this period.'
      );
    }

    let output = `*Deadlines: ${periodLabel}*\n`;
    output += '━━━━━━━━━━━━━━━━━━━━━\n\n';

    filtered.forEach(deadline => {
      const indicator = this.getStatusIndicator(deadline.dueDate, now);
      const daysLeft = this.getDaysRemaining(deadline.dueDate, now);
      const dateStr = this.formatDateShort(deadline.dueDate);

      output += `${indicator} *${deadline.companyCode}* - ${deadline.type}\n`;
      output += `   ${dateStr} (${daysLeft})\n\n`;
    });

    output += '━━━━━━━━━━━━━━━━━━━━━\n';
    output += `_${filtered.length} deadline(s)_`;

    return this.success(output);
  }

  /**
   * Add a custom deadline
   */
  handleAddDeadline(companyCode, description, dateStr) {
    // Validate company
    if (!this.companies[companyCode]) {
      const validCodes = Object.keys(this.companies).join(', ');
      return this.error(
        `Company "${companyCode}" not found.\n\n` +
        `Valid companies: ${validCodes}`
      );
    }

    // Validate date
    const dueDate = new Date(dateStr);
    if (isNaN(dueDate.getTime())) {
      return this.error('Invalid date format. Use YYYY-MM-DD');
    }

    if (!this.memory) {
      return this.error('Memory system not available. Cannot save custom deadlines.');
    }

    try {
      // Store as a fact with special format
      const factContent = `DEADLINE:${companyCode}:${dateStr}:${description}`;
      const factId = this.memory.saveFact('system', factContent, 'deadline', 'user_added');

      const now = new Date();
      const daysLeft = this.getDaysRemaining(dueDate, now);

      return this.success(
        `*Deadline Added*\n\n` +
        `Company: ${this.companies[companyCode].name}\n` +
        `Due: ${this.formatDateShort(dueDate)} (${daysLeft})\n` +
        `Description: ${description}\n\n` +
        `_Deadline ID: ${factId}_`
      );
    } catch (err) {
      this.log('error', 'Failed to save deadline', err);
      return this.error('Failed to save the deadline. Please try again.');
    }
  }

  /**
   * Remove a custom deadline
   */
  handleRemoveDeadline(deadlineId) {
    if (!this.memory) {
      return this.error('Memory system not available.');
    }

    try {
      const deleted = this.memory.deleteFact('system', deadlineId);

      if (deleted) {
        return this.success(`*Deadline Removed*\n\nDeadline #${deadlineId} has been deleted.`);
      } else {
        return this.error(`Deadline #${deadlineId} not found.`);
      }
    } catch (err) {
      this.log('error', 'Failed to remove deadline', err);
      return this.error('Failed to remove the deadline. Please try again.');
    }
  }

  // ============ Helper Methods ============

  /**
   * Calculate all statutory deadlines for a company
   */
  calculateCompanyDeadlines(company, baseDate, includeOverdue = false) {
    const deadlines = [];
    const now = new Date();

    for (const [typeCode, deadlineType] of Object.entries(this.deadlineTypes)) {
      const dueDate = deadlineType.calculateDue(company, baseDate);

      if (dueDate === null) continue; // Skip if not applicable

      // Include if upcoming or if we want overdue items
      if (dueDate >= now || includeOverdue) {
        deadlines.push({
          companyCode: company.shortName,
          companyName: company.name,
          type: deadlineType.name,
          typeCode: typeCode,
          description: deadlineType.description,
          dueDate: dueDate,
          isCustom: false
        });
      }
    }

    return deadlines;
  }

  /**
   * Get custom deadlines from memory
   */
  getCustomDeadlines() {
    if (!this.memory) return [];

    try {
      const facts = this.memory.getFacts('system');
      const deadlines = [];

      facts.forEach(fact => {
        if (fact.fact.startsWith('DEADLINE:')) {
          const parts = fact.fact.split(':');
          if (parts.length >= 4) {
            const companyCode = parts[1];
            const dateStr = parts[2];
            const description = parts.slice(3).join(':');

            deadlines.push({
              id: fact.id,
              companyCode: companyCode,
              companyName: this.companies[companyCode]?.name || companyCode,
              type: 'Custom',
              typeCode: 'CUSTOM',
              description: description,
              dueDate: new Date(dateStr),
              isCustom: true
            });
          }
        }
      });

      return deadlines;
    } catch (err) {
      this.log('warn', 'Failed to load custom deadlines', err);
      return [];
    }
  }

  /**
   * Get the next anniversary of incorporation date
   */
  getNextAnniversary(incorporatedDate, fromDate) {
    const inc = new Date(incorporatedDate);
    const now = new Date(fromDate);

    let anniversary = new Date(now.getFullYear(), inc.getMonth(), inc.getDate());

    // If we've passed this year's anniversary, use next year
    if (anniversary < now) {
      anniversary.setFullYear(anniversary.getFullYear() + 1);
    }

    return anniversary;
  }

  /**
   * Get the accounting year end date (ARD - Accounting Reference Date)
   * For UK companies, this is typically the last day of the month
   * of incorporation anniversary
   */
  getAccountingYearEnd(company, fromDate) {
    const inc = new Date(company.incorporated);
    const now = new Date(fromDate);

    // Year end is last day of the month containing the incorporation anniversary
    let yearEnd = new Date(now.getFullYear(), inc.getMonth() + 1, 0);

    // If we've passed this year's year end, use next year
    if (yearEnd < now) {
      yearEnd = new Date(now.getFullYear() + 1, inc.getMonth() + 1, 0);
    }

    return yearEnd;
  }

  /**
   * Get the next quarter end date
   */
  getNextQuarterEnd(fromDate) {
    const date = new Date(fromDate);
    const month = date.getMonth();
    const year = date.getFullYear();

    // Quarter ends are Mar 31, Jun 30, Sep 30, Dec 31
    const quarterEnds = [
      new Date(year, 2, 31),  // Mar 31
      new Date(year, 5, 30),  // Jun 30
      new Date(year, 8, 30),  // Sep 30
      new Date(year, 11, 31)  // Dec 31
    ];

    for (const qEnd of quarterEnds) {
      if (qEnd >= date) {
        return qEnd;
      }
    }

    // If past Dec 31, return next year's Mar 31
    return new Date(year + 1, 2, 31);
  }

  /**
   * Add days to a date
   */
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Add months to a date
   */
  addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  /**
   * Get days difference between two dates
   */
  getDaysDiff(date1, date2) {
    const diffTime = date1 - date2;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days remaining until deadline
   */
  getDaysRemaining(dueDate, fromDate) {
    const days = this.getDaysDiff(dueDate, fromDate);

    if (days < 0) {
      return `${Math.abs(days)} days overdue`;
    } else if (days === 0) {
      return 'Due today';
    } else if (days === 1) {
      return '1 day left';
    } else {
      return `${days} days left`;
    }
  }

  /**
   * Get status indicator emoji based on urgency
   */
  getStatusIndicator(dueDate, fromDate) {
    const days = this.getDaysDiff(dueDate, fromDate);

    if (days < 0) {
      return '\uD83D\uDD34'; // Red circle - overdue
    } else if (days <= 7) {
      return '\uD83D\uDFE1'; // Yellow circle - urgent (<7 days)
    } else {
      return '\uD83D\uDFE2'; // Green circle - OK (>7 days)
    }
  }

  /**
   * Format date in short readable format
   */
  formatDateShort(date) {
    const options = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };
    return date.toLocaleDateString('en-GB', options);
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', `Deadlines skill initialized with ${Object.keys(this.companies).length} companies`);
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      companies: Object.keys(this.companies),
      deadlineTypes: Object.keys(this.deadlineTypes)
    };
  }
}

module.exports = DeadlinesSkill;
