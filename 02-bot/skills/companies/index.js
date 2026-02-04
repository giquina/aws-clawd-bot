/**
 * Companies Skill for ClawdBot
 *
 * Provides quick company information lookup for the 5 Giquina group companies.
 *
 * Commands:
 *   companies, my companies     - List all 5 companies with short codes
 *   company <code>              - Full company details
 *   company info <code>         - Full company details (alias)
 *   directors                   - List all directors across companies
 *   directors <code>            - List directors for specific company
 *   company number <code>       - Just the company number (for quick copy)
 *   ch link <code>              - Companies House public link
 */

const BaseSkill = require('../base-skill');

// Company data for the Giquina group
const COMPANIES = {
  GMH: {
    name: 'Giquina Management Holdings Ltd',
    number: '15425137',
    shortCode: 'GMH',
    role: 'Parent / FIC (Family Investment Company)',
    incorporated: '2024-01-18',
    address: '10B Bushey Mill Lane, Watford, Hertfordshire, WD24 7QS',
    directors: ['Muhammad Ali Giquina'],
    status: 'Active'
  },
  GACC: {
    name: 'Giquina Accountancy Ltd',
    number: '16396650',
    shortCode: 'GACC',
    role: 'GCS / Tax Agent',
    incorporated: '2025-04-20',
    address: '10B Bushey Mill Lane, Watford, Hertfordshire, WD24 7QS',
    directors: ['Muhammad Ali Giquina'],
    status: 'Active'
  },
  GCAP: {
    name: 'Giquina Capital Ltd',
    number: '16360342',
    shortCode: 'GCAP',
    role: 'Investment Arm',
    incorporated: '2025-04-02',
    address: '10B Bushey Mill Lane, Watford, Hertfordshire, WD24 7QS',
    directors: ['Muhammad Ali Giquina', 'Raheem Evangelista Conte'],
    status: 'Active'
  },
  GQCARS: {
    name: 'GQ Cars Ltd',
    number: '15389347',
    shortCode: 'GQCARS',
    role: 'Trading Company',
    incorporated: '2024-01-05',
    address: '10B Bushey Mill Lane, Watford, Hertfordshire, WD24 7QS',
    directors: ['Muhammad Ali Giquina'],
    status: 'Active'
  },
  GSPV: {
    name: 'Giquina Structured Asset SPV Ltd',
    number: '16369465',
    shortCode: 'GSPV',
    role: 'Property SPV',
    incorporated: '2025-04-07',
    address: '10B Bushey Mill Lane, Watford, Hertfordshire, WD24 7QS',
    directors: ['Muhammad Ali Giquina'],
    status: 'Active'
  }
};

class CompaniesSkill extends BaseSkill {
  name = 'companies';
  description = 'Quick lookup for Giquina group company information';
  priority = 26;

  commands = [
    {
      pattern: /^(companies|my companies)$/i,
      description: 'List all 5 companies with short codes',
      usage: 'companies'
    },
    {
      pattern: /^company\s+info\s+(\w+)$/i,
      description: 'Full company details',
      usage: 'company info <code>'
    },
    {
      pattern: /^company\s+(\w+)$/i,
      description: 'Full company details',
      usage: 'company <code>'
    },
    {
      pattern: /^directors$/i,
      description: 'List all directors across companies',
      usage: 'directors'
    },
    {
      pattern: /^directors\s+(\w+)$/i,
      description: 'List directors for specific company',
      usage: 'directors <code>'
    },
    {
      pattern: /^company\s+number\s+(\w+)$/i,
      description: 'Get company number for quick copy',
      usage: 'company number <code>'
    },
    {
      pattern: /^ch\s+link\s+(\w+)$/i,
      description: 'Get Companies House public link',
      usage: 'ch link <code>'
    }
  ];

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // List all companies
      if (/^(companies|my companies)$/i.test(raw)) {
        return this.handleListCompanies();
      }

      // Company info (full details)
      if (/^company\s+info\s+(\w+)$/i.test(raw)) {
        const match = raw.match(/^company\s+info\s+(\w+)$/i);
        return this.handleCompanyInfo(match[1]);
      }

      if (/^company\s+(\w+)$/i.test(raw)) {
        const match = raw.match(/^company\s+(\w+)$/i);
        // Make sure it's not "company number" or "company info"
        if (!/^(number|info)$/i.test(match[1])) {
          return this.handleCompanyInfo(match[1]);
        }
      }

      // Directors - all or specific
      if (/^directors$/i.test(raw)) {
        return this.handleAllDirectors();
      }

      if (/^directors\s+(\w+)$/i.test(raw)) {
        const match = raw.match(/^directors\s+(\w+)$/i);
        return this.handleDirectors(match[1]);
      }

      // Company number only
      if (/^company\s+number\s+(\w+)$/i.test(raw)) {
        const match = raw.match(/^company\s+number\s+(\w+)$/i);
        return this.handleCompanyNumber(match[1]);
      }

      // Companies House link
      if (/^ch\s+link\s+(\w+)$/i.test(raw)) {
        const match = raw.match(/^ch\s+link\s+(\w+)$/i);
        return this.handleCHLink(match[1]);
      }

      return this.error('Command not recognized. Try "companies" for a list.');

    } catch (err) {
      this.log('error', 'Companies command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  /**
   * Find company by short code (case-insensitive)
   */
  findCompany(code) {
    const upperCode = code.toUpperCase();
    return COMPANIES[upperCode] || null;
  }

  /**
   * Format incorporation date for display
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  /**
   * Get Companies House URL for a company
   */
  getCHUrl(companyNumber) {
    return `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;
  }

  /**
   * Shorten address for display
   */
  shortenAddress(address) {
    // Remove "Hertfordshire, " to make it shorter for WhatsApp
    return address.replace('Hertfordshire, ', '');
  }

  // ============ Command Handlers ============

  /**
   * List all companies
   */
  handleListCompanies() {
    this.log('info', 'Listing all companies');

    let output = `🏢 *GIQUINA GROUP COMPANIES*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    Object.values(COMPANIES).forEach((company) => {
      output += `*${company.shortCode}* - ${company.name}\n`;
      output += `   📋 ${company.number} | ${company.role}\n\n`;
    });

    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    output += `_Use "company <code>" for full details_`;

    return this.success(output);
  }

  /**
   * Get full company info
   */
  handleCompanyInfo(code) {
    this.log('info', `Getting company info for: ${code}`);

    const company = this.findCompany(code);
    if (!company) {
      const validCodes = Object.keys(COMPANIES).join(', ');
      return this.error(`Company "${code}" not found.\n\nValid codes: ${validCodes}`);
    }

    let output = `🏢 *${company.name.toUpperCase()}* (${company.shortCode})\n\n`;
    output += `📋 Company Number: ${company.number}\n`;
    output += `📍 Role: ${company.role}\n`;
    output += `📅 Incorporated: ${this.formatDate(company.incorporated)}\n`;
    output += `📫 Address: ${this.shortenAddress(company.address)}\n\n`;

    output += `👤 Directors:\n`;
    company.directors.forEach(director => {
      output += `• ${director}\n`;
    });

    output += `\n🔗 Companies House:\n`;
    output += this.getCHUrl(company.number);

    return this.success(output);
  }

  /**
   * List all directors across all companies
   */
  handleAllDirectors() {
    this.log('info', 'Listing all directors');

    // Collect unique directors and their companies
    const directorMap = new Map();

    Object.values(COMPANIES).forEach((company) => {
      company.directors.forEach(director => {
        if (!directorMap.has(director)) {
          directorMap.set(director, []);
        }
        directorMap.get(director).push(company.shortCode);
      });
    });

    let output = `👥 *GIQUINA GROUP DIRECTORS*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    directorMap.forEach((companies, director) => {
      output += `👤 *${director}*\n`;
      output += `   Director of: ${companies.join(', ')}\n\n`;
    });

    return this.success(output);
  }

  /**
   * List directors for a specific company
   */
  handleDirectors(code) {
    this.log('info', `Getting directors for: ${code}`);

    const company = this.findCompany(code);
    if (!company) {
      const validCodes = Object.keys(COMPANIES).join(', ');
      return this.error(`Company "${code}" not found.\n\nValid codes: ${validCodes}`);
    }

    let output = `👥 *Directors: ${company.name}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    company.directors.forEach(director => {
      output += `👤 ${director}\n`;
    });

    return this.success(output);
  }

  /**
   * Get just the company number
   */
  handleCompanyNumber(code) {
    this.log('info', `Getting company number for: ${code}`);

    const company = this.findCompany(code);
    if (!company) {
      const validCodes = Object.keys(COMPANIES).join(', ');
      return this.error(`Company "${code}" not found.\n\nValid codes: ${validCodes}`);
    }

    // Just return the number for easy copy
    return this.success(`${company.number}`);
  }

  /**
   * Get Companies House link
   */
  handleCHLink(code) {
    this.log('info', `Getting CH link for: ${code}`);

    const company = this.findCompany(code);
    if (!company) {
      const validCodes = Object.keys(COMPANIES).join(', ');
      return this.error(`Company "${code}" not found.\n\nValid codes: ${validCodes}`);
    }

    const url = this.getCHUrl(company.number);

    let output = `🔗 *${company.shortCode}* - Companies House\n\n`;
    output += url;

    return this.success(output);
  }
}

module.exports = CompaniesSkill;
