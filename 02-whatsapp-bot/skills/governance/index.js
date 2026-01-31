/**
 * Governance Skill for ClawdBot
 *
 * Provides UK corporate governance guidance - determines what level of approval
 * is needed for various corporate actions based on UK company law.
 *
 * Commands:
 *   can I <action>?              - Check approval requirements for an action
 *   who approves <action>?       - Same as above
 *   governance <action>          - Same as above
 *   approval for <action>        - Same as above
 *
 * Approval Levels (UK Company Law):
 *   1. Director Decision    - Day-to-day operations, contracts under threshold
 *   2. Board Resolution     - Major contracts, borrowing, hiring, strategy
 *   3. Ordinary Resolution  - 50%+ shareholder approval (dividends, director appointments)
 *   4. Special Resolution   - 75%+ shareholder approval (articles changes, name change)
 *   5. Written Resolution   - Can be used instead of meeting for private companies
 */

const BaseSkill = require('../base-skill');

// UK corporate governance rules mapping actions to approval requirements
const GOVERNANCE_RULES = {
  // Director decisions (day-to-day)
  'pay invoice': {
    level: 'Director',
    notes: 'Under 5,000',
    process: ['Director authorises payment', 'Ensure sufficient funds', 'Record in accounts'],
    warnings: ['Over 5,000 may need dual authorisation depending on articles']
  },
  'sign contract': {
    level: 'Director',
    notes: 'Under 10,000, in ordinary course',
    process: ['Director reviews terms', 'Signs on company letterhead', 'Keep copy on file'],
    warnings: ['Material contracts over 10,000 require board approval', 'Check articles for signing authority limits']
  },
  'file confirmation statement': {
    level: 'Director',
    notes: 'Any director can sign CS01',
    process: ['Review company details', 'Confirm or update as needed', 'File at Companies House within 14 days of review date'],
    warnings: ['Late filing = 250 penalty', 'Check SIC codes are accurate']
  },
  'file ct600': {
    level: 'Director',
    notes: 'Tax return submission',
    process: ['Ensure accounts are finalised', 'Calculate corporation tax', 'Submit via HMRC online'],
    warnings: ['Must file within 12 months of accounting period end', 'Pay tax within 9 months + 1 day']
  },

  // Board resolutions
  'hire employee': {
    level: 'Board',
    notes: 'Requires board resolution',
    process: ['Board approves role and salary', 'Issue employment contract', 'Set up payroll'],
    warnings: ['Directors require shareholder approval for service contracts over 2 years']
  },
  'open bank account': {
    level: 'Board',
    notes: 'Board resolution + bank mandate',
    process: ['Board resolves to open account', 'Complete bank mandate form', 'Submit certified documents'],
    warnings: ['Banks may require personal guarantees from directors']
  },
  'borrow money': {
    level: 'Board',
    notes: 'Over 5,000 requires board approval',
    process: ['Board approves borrowing terms', 'Review security requirements', 'Execute loan agreement'],
    warnings: ['Check articles for borrowing limits', 'Personal guarantees may expose directors']
  },
  'make loan': {
    level: 'Board',
    notes: 'Intercompany loans need board approval',
    process: ['Board approves loan terms and interest rate', 'Document loan agreement', 'Consider s455 tax on loans to participators'],
    warnings: ['Loans to directors need shareholder approval (s197 CA 2006)', 'Intercompany loans must be at arms length']
  },
  'transfer money': {
    level: 'Board',
    notes: 'Over 10,000 between companies',
    process: ['Board authorises transfer', 'Document purpose', 'Maintain paper trail'],
    warnings: ['Intercompany transfers need proper documentation', 'Consider transfer pricing rules']
  },
  'approve accounts': {
    level: 'Board',
    notes: 'Directors must approve before filing',
    process: ['Review financial statements', 'Directors sign balance sheet', 'File at Companies House'],
    warnings: ['Small company: file within 9 months', 'Micro company: can file filleted accounts']
  },
  'file accounts': {
    level: 'Board',
    notes: 'Board must approve first',
    process: ['Board approves accounts', 'Director signs', 'Submit to Companies House'],
    warnings: ['Late filing penalties: 150-1,500', 'Accounts must give true and fair view']
  },
  'change registered office': {
    level: 'Board',
    notes: 'File AD01 within 14 days',
    process: ['Board resolves to change address', 'File form AD01', 'Update letterheads and website'],
    warnings: ['New address must be in same jurisdiction', 'Ensure mail redirection set up']
  },

  // Board + Ordinary Resolution
  'appoint director': {
    level: 'Board + OR',
    notes: 'Board recommends, shareholders approve',
    process: ['Board nominates candidate', 'Shareholders pass ordinary resolution', 'File AP01 at Companies House within 14 days'],
    warnings: ['Check articles for appointment procedure', 'Consent to act required']
  },
  'declare dividend': {
    level: 'Board + OR',
    notes: 'Board recommends, shareholders declare',
    process: ['Board recommends dividend amount', 'Shareholders pass ordinary resolution', 'Payment date set'],
    warnings: ['Must have sufficient distributable profits', 'Directors personally liable if insufficient reserves']
  },

  // Ordinary Resolutions (50%+)
  'remove director': {
    level: 'Ordinary Resolution',
    notes: 'Special notice required',
    process: ['Give 28 days special notice to company', 'Company gives 14 days notice of meeting', 'Pass OR with 50%+ majority'],
    warnings: ['Director entitled to make representations', 'Cannot use written resolution', 'May trigger unfair prejudice claims']
  },
  'increase share capital': {
    level: 'Ordinary Resolution',
    notes: 'Unless articles restrict',
    process: ['Directors recommend increase', 'Shareholders pass OR', 'File SH01 at Companies House'],
    warnings: ['Check pre-emption rights', 'May need valuation for non-cash consideration']
  },

  // Special Resolutions (75%+)
  'change company name': {
    level: 'Special Resolution',
    notes: '75% shareholder approval',
    process: ['Check name availability', 'Pass special resolution', 'File NM01 at Companies House'],
    warnings: ['Name must not be too similar to existing', 'Update all stationery and contracts']
  },
  'change articles': {
    level: 'Special Resolution',
    notes: '75% shareholder approval',
    process: ['Draft amended articles', 'Pass special resolution', 'File with Companies House within 15 days'],
    warnings: ['Entrenched provisions may need unanimity', 'Consider minority shareholder rights']
  },
  'reduce share capital': {
    level: 'Special Resolution',
    notes: 'Court confirmation may be needed',
    process: ['Pass special resolution', 'Court confirmation (or solvency statement)', 'File at Companies House'],
    warnings: ['Creditor protection applies', 'Directors sign solvency statement if no court confirmation']
  },
  'wind up company': {
    level: 'Special Resolution',
    notes: 'Voluntary liquidation',
    process: ['Directors declare solvency (MVL) or insolvency (CVL)', 'Pass special resolution', 'Appoint liquidator'],
    warnings: ['Wrong type of liquidation = personal liability', 'Consider striking off for dormant companies']
  },

  // Additional common actions
  'buy shares': {
    level: 'Board',
    notes: 'Investment decision',
    process: ['Board evaluates investment', 'Approve purchase', 'Update PSC register if acquiring control'],
    warnings: ['Check articles for investment restrictions', 'May need FCA authorisation']
  },
  'sell shares': {
    level: 'Board + Shareholder',
    notes: 'Depends on articles',
    process: ['Check share transfer restrictions in articles', 'Execute stock transfer form', 'Update register of members'],
    warnings: ['Pre-emption rights may apply', 'May trigger CGT', 'Check any shareholders agreement']
  },
  'grant share options': {
    level: 'Board',
    notes: 'Unless articles restrict',
    process: ['Board approves option scheme', 'Issue option agreements', 'Consider EMI scheme for tax efficiency'],
    warnings: ['Dilution to existing shareholders', 'Employment law considerations']
  },
  'issue shares': {
    level: 'Board + OR',
    notes: 'Directors need authority',
    process: ['Shareholders grant authority (s551)', 'Disapply pre-emption rights if needed (s571)', 'File SH01 within 1 month'],
    warnings: ['Pre-emption rights apply to existing shareholders', 'Check authorised share capital in articles']
  },
  'allot shares': {
    level: 'Board + OR',
    notes: 'Same as issue shares',
    process: ['Check directors have authority', 'Pass resolution to allot', 'File return of allotment'],
    warnings: ['s549-551 CA 2006 authority required', 'Inform HMRC of new shareholders']
  },
  'pay bonus': {
    level: 'Board',
    notes: 'Discretionary bonus to employees',
    process: ['Board approves bonus pool', 'Calculate individual amounts', 'Process through payroll with PAYE/NI'],
    warnings: ['Must be consistent with contracts', 'Consider discrimination risks']
  },
  'terminate employee': {
    level: 'Board',
    notes: 'Depends on seniority',
    process: ['Follow contractual procedure', 'Document reasons', 'Issue notice or PILON'],
    warnings: ['Unfair dismissal risk after 2 years service', 'Protected characteristics', 'Settlement agreements']
  },
  'enter lease': {
    level: 'Board',
    notes: 'Material commitment',
    process: ['Board approves heads of terms', 'Legal review', 'Execute as deed if over 3 years'],
    warnings: ['Personal guarantees often required', 'Break clauses', 'Dilapidations liability']
  }
};

// Keywords for fuzzy matching
const ACTION_KEYWORDS = {
  'dividend': 'declare dividend',
  'dividends': 'declare dividend',
  'pay dividend': 'declare dividend',
  'interim dividend': 'declare dividend',
  'final dividend': 'declare dividend',
  'director': 'appoint director',
  'new director': 'appoint director',
  'add director': 'appoint director',
  'sack director': 'remove director',
  'fire director': 'remove director',
  'dismiss director': 'remove director',
  'name change': 'change company name',
  'rename company': 'change company name',
  'rename': 'change company name',
  'company name': 'change company name',
  'articles': 'change articles',
  'amend articles': 'change articles',
  'update articles': 'change articles',
  'memorandum': 'change articles',
  'capital increase': 'increase share capital',
  'more shares': 'increase share capital',
  'new shares': 'issue shares',
  'issue stock': 'issue shares',
  'allotment': 'allot shares',
  'capital reduction': 'reduce share capital',
  'reduce capital': 'reduce share capital',
  'buy back': 'reduce share capital',
  'buyback': 'reduce share capital',
  'close company': 'wind up company',
  'liquidate': 'wind up company',
  'liquidation': 'wind up company',
  'dissolve': 'wind up company',
  'strike off': 'wind up company',
  'bank account': 'open bank account',
  'new bank': 'open bank account',
  'loan': 'make loan',
  'lend money': 'make loan',
  'borrow': 'borrow money',
  'borrowing': 'borrow money',
  'debt': 'borrow money',
  'transfer funds': 'transfer money',
  'send money': 'transfer money',
  'move money': 'transfer money',
  'hire': 'hire employee',
  'recruit': 'hire employee',
  'employ': 'hire employee',
  'new employee': 'hire employee',
  'new staff': 'hire employee',
  'fire employee': 'terminate employee',
  'sack employee': 'terminate employee',
  'dismiss employee': 'terminate employee',
  'redundancy': 'terminate employee',
  'invoice': 'pay invoice',
  'pay bill': 'pay invoice',
  'payment': 'pay invoice',
  'contract': 'sign contract',
  'agreement': 'sign contract',
  'sign agreement': 'sign contract',
  'sign deal': 'sign contract',
  'accounts': 'approve accounts',
  'annual accounts': 'approve accounts',
  'financial statements': 'approve accounts',
  'submit accounts': 'file accounts',
  'confirmation statement': 'file confirmation statement',
  'cs01': 'file confirmation statement',
  'annual return': 'file confirmation statement',
  'corporation tax': 'file ct600',
  'tax return': 'file ct600',
  'ct600': 'file ct600',
  'registered office': 'change registered office',
  'company address': 'change registered office',
  'office address': 'change registered office',
  'share options': 'grant share options',
  'options': 'grant share options',
  'emi scheme': 'grant share options',
  'employee shares': 'grant share options',
  'bonus': 'pay bonus',
  'bonuses': 'pay bonus',
  'staff bonus': 'pay bonus',
  'lease': 'enter lease',
  'rent office': 'enter lease',
  'property': 'enter lease',
  'premises': 'enter lease'
};

class GovernanceSkill extends BaseSkill {
  name = 'governance';
  description = 'UK corporate governance guidance - check approval levels for company actions';
  priority = 24;

  commands = [
    {
      pattern: /^can\s+i\s+(.+?)[\?]?$/i,
      description: 'Check if you can do an action and what approval is needed',
      usage: 'can I <action>?'
    },
    {
      pattern: /^who\s+approves?\s+(.+?)[\?]?$/i,
      description: 'Find out who approves a specific action',
      usage: 'who approves <action>?'
    },
    {
      pattern: /^governance\s+(.+)$/i,
      description: 'Check governance requirements for an action',
      usage: 'governance <action>'
    },
    {
      pattern: /^approval\s+(?:for|needed\s+for)?\s*(.+)$/i,
      description: 'Check what approval is needed for an action',
      usage: 'approval for <action>'
    },
    {
      pattern: /^what\s+(?:level|type)\s+(?:of\s+)?approval\s+(?:for|do\s+i\s+need\s+for)?\s*(.+?)[\?]?$/i,
      description: 'Check approval level for an action',
      usage: 'what approval for <action>?'
    },
    {
      pattern: /^do\s+i\s+need\s+(?:shareholder\s+)?approval\s+(?:for|to)?\s*(.+?)[\?]?$/i,
      description: 'Check if shareholder approval is needed',
      usage: 'do I need approval for <action>?'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.rules = GOVERNANCE_RULES;
    this.keywords = ACTION_KEYWORDS;
  }

  /**
   * Execute the governance check command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    // Extract the action from the command
    const action = this.extractAction(raw);

    if (!action) {
      return this.success(this.formatHelpMessage());
    }

    // Find matching governance rule
    const match = this.findRule(action);

    if (!match) {
      return this.success(this.formatNotFoundMessage(action));
    }

    return this.success(this.formatGovernanceResponse(match.action, match.rule));
  }

  /**
   * Extract the action from the command string
   */
  extractAction(command) {
    const normalised = command.toLowerCase().trim();

    // Try each pattern
    const patterns = [
      /^can\s+i\s+(.+?)[\?]?$/i,
      /^who\s+approves?\s+(.+?)[\?]?$/i,
      /^governance\s+(.+)$/i,
      /^approval\s+(?:for|needed\s+for)?\s*(.+)$/i,
      /^what\s+(?:level|type)\s+(?:of\s+)?approval\s+(?:for|do\s+i\s+need\s+for)?\s*(.+?)[\?]?$/i,
      /^do\s+i\s+need\s+(?:shareholder\s+)?approval\s+(?:for|to)?\s*(.+?)[\?]?$/i
    ];

    for (const pattern of patterns) {
      const match = normalised.match(pattern);
      if (match && match[1]) {
        return match[1].trim().replace(/[\?\.!]+$/, '');
      }
    }

    return null;
  }

  /**
   * Find the matching governance rule using fuzzy matching
   */
  findRule(action) {
    const normalised = action.toLowerCase().trim();

    // 1. Direct match in rules
    if (this.rules[normalised]) {
      return { action: normalised, rule: this.rules[normalised] };
    }

    // 2. Keyword mapping
    if (this.keywords[normalised]) {
      const mappedAction = this.keywords[normalised];
      return { action: mappedAction, rule: this.rules[mappedAction] };
    }

    // 3. Partial keyword match
    for (const [keyword, mappedAction] of Object.entries(this.keywords)) {
      if (normalised.includes(keyword) || keyword.includes(normalised)) {
        return { action: mappedAction, rule: this.rules[mappedAction] };
      }
    }

    // 4. Partial match on rule keys
    for (const [ruleAction, rule] of Object.entries(this.rules)) {
      if (ruleAction.includes(normalised) || normalised.includes(ruleAction)) {
        return { action: ruleAction, rule };
      }
    }

    // 5. Word overlap matching
    const actionWords = normalised.split(/\s+/).filter(w => w.length > 2);
    let bestMatch = null;
    let bestScore = 0;

    for (const [ruleAction, rule] of Object.entries(this.rules)) {
      const ruleWords = ruleAction.split(/\s+/);
      const score = actionWords.filter(w => ruleWords.some(rw => rw.includes(w) || w.includes(rw))).length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { action: ruleAction, rule };
      }
    }

    if (bestScore > 0) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Format the governance check response
   */
  formatGovernanceResponse(action, rule) {
    const levelEmoji = this.getLevelEmoji(rule.level);

    let output = `GOVERNANCE CHECK\n\n`;
    output += `Action: "${this.capitalise(action)}"\n`;
    output += `Approval Level: ${levelEmoji} ${rule.level}\n\n`;

    // Process steps
    if (rule.process && rule.process.length > 0) {
      output += `Process:\n`;
      rule.process.forEach((step, i) => {
        output += `${i + 1}. ${step}\n`;
      });
      output += '\n';
    }

    // Notes
    if (rule.notes) {
      output += `Notes:\n`;
      output += `- ${rule.notes}\n\n`;
    }

    // Warnings
    if (rule.warnings && rule.warnings.length > 0) {
      output += `Warnings:\n`;
      rule.warnings.forEach(warning => {
        output += `- ${warning}\n`;
      });
      output += '\n';
    }

    // Giquina Group context
    output += `For Giquina Group:\n`;
    output += `MAG is sole shareholder of GMH, GACC, GQCARS, GSPV\n`;
    output += `Written resolution sufficient (no meeting needed)`;

    return output;
  }

  /**
   * Get emoji for approval level
   */
  getLevelEmoji(level) {
    const normalised = level.toLowerCase();

    if (normalised.includes('director') && !normalised.includes('board')) {
      return 'OK';
    }
    if (normalised.includes('board') && normalised.includes('or')) {
      return 'BOARD+VOTE';
    }
    if (normalised.includes('board')) {
      return 'BOARD';
    }
    if (normalised.includes('ordinary')) {
      return '50%+';
    }
    if (normalised.includes('special')) {
      return '75%+';
    }

    return '';
  }

  /**
   * Format help message when no action specified
   */
  formatHelpMessage() {
    let output = `GOVERNANCE CHECK\n\n`;
    output += `Ask me about approval levels for company actions.\n\n`;
    output += `Examples:\n`;
    output += `- can I declare a dividend?\n`;
    output += `- who approves hiring?\n`;
    output += `- governance change company name\n`;
    output += `- approval for issuing shares\n\n`;
    output += `Approval Levels:\n`;
    output += `Director - Day-to-day decisions\n`;
    output += `Board - Major decisions, contracts\n`;
    output += `OR (50%+) - Ordinary resolution\n`;
    output += `SR (75%+) - Special resolution`;

    return output;
  }

  /**
   * Format not found message with suggestions
   */
  formatNotFoundMessage(action) {
    // Get some suggestions
    const suggestions = Object.keys(this.rules).slice(0, 5);

    let output = `GOVERNANCE CHECK\n\n`;
    output += `Sorry, I don't have governance rules for "${action}".\n\n`;
    output += `Try asking about:\n`;
    suggestions.forEach(s => {
      output += `- ${s}\n`;
    });
    output += `\n...or type "governance" for help.`;

    return output;
  }

  /**
   * Capitalise first letter of each word
   */
  capitalise(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }
}

module.exports = GovernanceSkill;
