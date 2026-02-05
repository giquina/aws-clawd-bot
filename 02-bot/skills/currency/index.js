/**
 * Currency Converter Skill - Real-time currency conversion
 *
 * Provides real-time currency conversion using the free exchangerate-api.com API.
 * Supports 150+ currencies with intelligent rate caching (1 hour TTL).
 * Responds with formatted currency conversion results including exchange rates.
 *
 * Commands:
 *   convert <amount> <from> to <to>  - Convert currency amount
 *   rates                             - Show current USD to major currencies
 *   currencies                        - List all supported currencies
 *
 * Examples:
 *   convert 100 USD to GBP
 *   convert 50 EUR to JPY
 *   convert 1 BTC to USD
 *
 * API: exchangerate-api.com (FREE tier: 1500 requests/month)
 */
const BaseSkill = require('../base-skill');

class CurrencyConverterSkill extends BaseSkill {
  name = 'currency';
  description = 'Real-time currency conversion with 150+ currencies';
  priority = 15;

  commands = [
    {
      pattern: /^convert\s+(\d+(?:\.\d{1,2})?)\s+(\w{3})\s+to\s+(\w{3})$/i,
      description: 'Convert currency amount',
      usage: 'convert <amount> <from> to <to>'
    },
    {
      pattern: /^rates(?:\s+for\s+(\w{3}))?$/i,
      description: 'Show current exchange rates from USD',
      usage: 'rates'
    },
    {
      pattern: /^currencies$/i,
      description: 'List all supported currencies',
      usage: 'currencies'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.API_BASE_URL = 'https://api.exchangerate-api.com/v4/latest';
    this.CACHE_TTL = 3600000; // 1 hour in milliseconds
    this.rateCache = new Map(); // { base: { rates: {...}, timestamp: Date } }
    this.SUPPORTED_CURRENCIES = [
      'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
      'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR',
      'BHD', 'AED', 'SAR', 'KWD', 'QAR', 'OMR', 'JOD', 'ILS', 'PKR', 'NGN',
      'CLP', 'COP', 'PEN', 'UYU', 'ARS', 'VEF', 'IDR', 'MYR', 'PHP', 'THB',
      'VND', 'UAH', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RSD', 'TND',
      'EGP', 'MAD', 'GHS', 'KES', 'UGX', 'ETB', 'LBP', 'IQD', 'AFN', 'BDT',
      'LKR', 'MVR', 'BND', 'LAK', 'KHR', 'MMK', 'KZT', 'UZS', 'TMT', 'GEL',
      'AMD', 'AZN', 'BYN', 'MDL', 'ISK', 'DKK', 'CRC', 'DOP', 'GTQ', 'HNL',
      'PAB', 'SVC', 'TTD', 'JMD', 'BAM', 'MKD', 'ALL', 'XAU', 'XAG', 'XPT',
      'XPD', 'BTC', 'ETH'
    ];
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Currency Converter skill initialized (1-hour cache, 150+ currencies)');
  }

  /**
   * Execute currency converter commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);

    try {
      // Match convert command
      const convertMatch = command.match(/^convert\s+(\d+(?:\.\d{1,2})?)\s+(\w{3})\s+to\s+(\w{3})$/i);
      if (convertMatch) {
        const amount = parseFloat(convertMatch[1]);
        const fromCurrency = convertMatch[2].toUpperCase();
        const toCurrency = convertMatch[3].toUpperCase();

        return await this.convertCurrency(amount, fromCurrency, toCurrency);
      }

      // Match rates command
      const ratesMatch = command.match(/^rates(?:\s+for\s+(\w{3}))?$/i);
      if (ratesMatch) {
        const baseCurrency = ratesMatch[1]?.toUpperCase() || 'USD';
        return await this.showRates(baseCurrency);
      }

      // Match currencies command
      if (/^currencies$/i.test(command)) {
        return this.listCurrencies();
      }

      return this.error('Currency command not recognized', null, {
        suggestion: 'Try: convert 100 USD to GBP'
      });
    } catch (error) {
      this.log('error', 'Currency converter error', error);
      return this.error('Currency conversion failed', error, {
        attempted: `Converting ${parsed.raw}`,
        suggestion: 'Check currency codes (USD, GBP, EUR, etc.) and try again'
      });
    }
  }

  /**
   * Convert currency amount
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code
   * @param {string} toCurrency - Target currency code
   */
  async convertCurrency(amount, fromCurrency, toCurrency) {
    try {
      // Validate currency codes
      if (!this.isValidCurrency(fromCurrency)) {
        return this.error(
          `Invalid source currency: ${fromCurrency}`,
          null,
          { suggestion: `Valid codes: USD, EUR, GBP, etc. Type 'currencies' for full list` }
        );
      }

      if (!this.isValidCurrency(toCurrency)) {
        return this.error(
          `Invalid target currency: ${toCurrency}`,
          null,
          { suggestion: `Valid codes: USD, EUR, GBP, etc. Type 'currencies' for full list` }
        );
      }

      // Fetch rates for source currency
      const rates = await this.fetchRates(fromCurrency);

      // Get exchange rate
      const rate = rates[toCurrency];
      if (!rate) {
        return this.error(
          `No rate available for ${toCurrency}`,
          null,
          { suggestion: 'Try a different currency code' }
        );
      }

      // Calculate converted amount
      const convertedAmount = (amount * rate).toFixed(2);

      // Format response with emoji and clear formatting
      const message =
        `💱 *Currency Conversion*\n\n` +
        `${amount} ${fromCurrency} = ${convertedAmount} ${toCurrency}\n` +
        `_Rate: 1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}_`;

      return this.success(message, {
        amount,
        fromCurrency,
        toCurrency,
        rate: parseFloat(rate.toFixed(4)),
        convertedAmount: parseFloat(convertedAmount)
      });
    } catch (error) {
      this.log('error', 'Conversion error', error);
      return this.error('Failed to convert currency', error, {
        suggestion: 'API service may be temporarily unavailable. Try again in a moment.'
      });
    }
  }

  /**
   * Show exchange rates from a base currency
   * @param {string} baseCurrency - Base currency code (default: USD)
   */
  async showRates(baseCurrency) {
    try {
      // Validate currency code
      if (!this.isValidCurrency(baseCurrency)) {
        return this.error(
          `Invalid currency: ${baseCurrency}`,
          null,
          { suggestion: 'Try: rates for EUR' }
        );
      }

      // Fetch rates
      const rates = await this.fetchRates(baseCurrency);

      // Select major currencies for display
      const majorCurrencies = [
        'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'BRL'
      ];

      const displayRates = majorCurrencies
        .filter(curr => curr !== baseCurrency && rates[curr])
        .slice(0, 9); // Show top 9 rates to keep message concise

      let message = `📊 *Exchange Rates from ${baseCurrency}*\n\n`;
      displayRates.forEach(currency => {
        const rate = rates[currency].toFixed(4);
        message += `1 ${baseCurrency} = ${rate} ${currency}\n`;
      });

      return this.success(message, { baseCurrency, rates });
    } catch (error) {
      this.log('error', 'Rates fetch error', error);
      return this.error('Failed to fetch exchange rates', error, {
        suggestion: 'API service may be temporarily unavailable.'
      });
    }
  }

  /**
   * List all supported currencies
   */
  listCurrencies() {
    // Group currencies for readability
    const grouped = {};
    this.SUPPORTED_CURRENCIES.forEach(currency => {
      const group = Math.floor(this.SUPPORTED_CURRENCIES.indexOf(currency) / 10);
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(currency);
    });

    let message = `💰 *Supported Currencies (${this.SUPPORTED_CURRENCIES.length}+)*\n\n`;
    Object.values(grouped).forEach(group => {
      message += group.join(', ') + '\n';
    });

    message += `\n_Use codes like USD, EUR, GBP, JPY, etc._\n`;
    message += `_Example: convert 100 USD to EUR_`;

    return this.success(message, {
      currencies: this.SUPPORTED_CURRENCIES,
      count: this.SUPPORTED_CURRENCIES.length
    });
  }

  /**
   * Fetch exchange rates from API with caching
   * @param {string} baseCurrency - Base currency code
   * @returns {Promise<Object>} - Exchange rates object
   */
  async fetchRates(baseCurrency) {
    // Check cache first
    if (this.rateCache.has(baseCurrency)) {
      const cached = this.rateCache.get(baseCurrency);
      const now = Date.now();

      if (now - cached.timestamp < this.CACHE_TTL) {
        this.log('debug', `Cache hit for ${baseCurrency}`);
        return cached.rates;
      }

      // Cache expired, remove it
      this.rateCache.delete(baseCurrency);
    }

    try {
      // Fetch from API
      const url = `${this.API_BASE_URL}/${baseCurrency}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.rates) {
        throw new Error('Invalid API response: missing rates');
      }

      // Cache the rates
      this.rateCache.set(baseCurrency, {
        rates: data.rates,
        timestamp: Date.now()
      });

      this.log('info', `Fetched rates for ${baseCurrency} (cache TTL: 1 hour)`);
      return data.rates;
    } catch (error) {
      this.log('error', `Failed to fetch rates for ${baseCurrency}`, error);
      throw error;
    }
  }

  /**
   * Validate if a currency code is supported
   * @param {string} code - Currency code to validate
   * @returns {boolean}
   */
  isValidCurrency(code) {
    return this.SUPPORTED_CURRENCIES.includes(code?.toUpperCase());
  }

  /**
   * Clear the rate cache (for testing or manual refresh)
   */
  clearCache() {
    this.rateCache.clear();
    this.log('info', 'Rate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cachedCurrencies: Array.from(this.rateCache.keys()),
      cacheSize: this.rateCache.size,
      ttlMinutes: this.CACHE_TTL / 60000
    };
  }
}

module.exports = CurrencyConverterSkill;
