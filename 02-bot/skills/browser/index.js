/**
 * Browser Skill - Web Automation for ClawdBot
 *
 * Enables browser automation capabilities for OpenClaw compatibility.
 * Uses puppeteer-core for headless browser control.
 *
 * Commands:
 *   browse <url>                - Fetch and summarize a webpage
 *   screenshot <url>            - Take a screenshot of a webpage
 *   search <query>              - Search Google and return results
 *   extract <url> <selector>    - Extract text from CSS selector
 *   browser status              - Show browser configuration
 *
 * Environment Variables:
 *   CHROME_PATH - Path to Chrome/Chromium executable
 *   BROWSER_HEADLESS - Set to 'false' for headed mode (default: true)
 *
 * @example
 * browse https://example.com
 * screenshot https://github.com
 * search OpenClaw AI assistant
 * extract https://example.com h1
 */

const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs');

class BrowserSkill extends BaseSkill {
  name = 'browser';
  description = 'Web browser automation - browse pages, take screenshots, search, extract content';
  priority = 25;

  commands = [
    {
      pattern: /^browse\s+(.+)$/i,
      description: 'Fetch and summarize a webpage',
      usage: 'browse <url>'
    },
    {
      pattern: /^screenshot\s+(.+)$/i,
      description: 'Take a screenshot of a webpage',
      usage: 'screenshot <url>'
    },
    {
      pattern: /^search\s+(.+)$/i,
      description: 'Search Google and return results',
      usage: 'search <query>'
    },
    {
      pattern: /^extract\s+(\S+)\s+(.+)$/i,
      description: 'Extract text from CSS selector on a page',
      usage: 'extract <url> <selector>'
    },
    {
      pattern: /^browser\s+status$/i,
      description: 'Show browser configuration and status',
      usage: 'browser status'
    }
  ];

  constructor(context = {}) {
    super(context);

    this.browser = null;
    this.puppeteer = null;
    this.isInitialized = false;

    // Configuration
    this.headless = process.env.BROWSER_HEADLESS !== 'false';
    this.timeout = 30000; // 30 seconds
    this.maxContentLength = 3000; // Truncate for messaging limits

    // Find Chrome executable
    this.executablePath = this.findChromePath();
  }

  /**
   * Find Chrome/Chromium executable path
   */
  findChromePath() {
    // Check environment variable first
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    // Common paths by platform
    const paths = {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      ],
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/usr/bin/microsoft-edge'
      ]
    };

    const platform = process.platform;
    const candidates = paths[platform] || paths.linux;

    for (const chromePath of candidates) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }

  /**
   * Initialize puppeteer lazily
   */
  async initBrowser() {
    if (this.isInitialized) return true;

    try {
      this.puppeteer = require('puppeteer-core');
      this.isInitialized = true;
      return true;
    } catch (err) {
      this.log('error', 'Failed to load puppeteer-core', err);
      return false;
    }
  }

  /**
   * Launch browser instance
   */
  async launchBrowser() {
    if (!this.executablePath) {
      throw new Error('Chrome/Chromium not found. Set CHROME_PATH environment variable.');
    }

    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await this.puppeteer.launch({
        executablePath: this.executablePath,
        headless: this.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      });
    }

    return this.browser;
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        // Ignore close errors
      }
      this.browser = null;
    }
  }

  /**
   * Execute browser commands
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    // Initialize puppeteer
    if (!await this.initBrowser()) {
      return this.error('Browser automation not available. Install puppeteer-core.');
    }

    try {
      // Browser status
      if (/^browser\s+status$/i.test(raw)) {
        return this.getStatus();
      }

      // Browse URL
      const browseMatch = raw.match(/^browse\s+(.+)$/i);
      if (browseMatch) {
        const url = this.normalizeUrl(browseMatch[1].trim());
        return await this.browseUrl(url, context);
      }

      // Screenshot
      const screenshotMatch = raw.match(/^screenshot\s+(.+)$/i);
      if (screenshotMatch) {
        const url = this.normalizeUrl(screenshotMatch[1].trim());
        return await this.takeScreenshot(url, context);
      }

      // Search
      const searchMatch = raw.match(/^search\s+(.+)$/i);
      if (searchMatch) {
        const query = searchMatch[1].trim();
        return await this.searchGoogle(query, context);
      }

      // Extract
      const extractMatch = raw.match(/^extract\s+(\S+)\s+(.+)$/i);
      if (extractMatch) {
        const url = this.normalizeUrl(extractMatch[1].trim());
        const selector = extractMatch[2].trim();
        return await this.extractContent(url, selector, context);
      }

      return this.error('Unknown browser command. Try: browse <url>, screenshot <url>, search <query>');
    } catch (err) {
      this.log('error', 'Browser command failed', err);
      return this.error(`Browser error: ${err.message}`);
    }
  }

  /**
   * Normalize URL (add https if missing)
   */
  normalizeUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'https://' + url;
    }
    return url;
  }

  /**
   * Get browser status
   */
  getStatus() {
    const status = {
      puppeteer: this.isInitialized ? 'Loaded' : 'Not loaded',
      chromePath: this.executablePath || 'Not found',
      headless: this.headless ? 'Yes' : 'No',
      browserActive: this.browser?.isConnected() ? 'Yes' : 'No',
      timeout: `${this.timeout / 1000}s`
    };

    let response = `*Browser Status*\n\n`;
    response += `Puppeteer: ${status.puppeteer}\n`;
    response += `Chrome Path: ${status.chromePath ? '✓ Found' : '✗ Not found'}\n`;
    response += `Headless Mode: ${status.headless}\n`;
    response += `Browser Active: ${status.browserActive}\n`;
    response += `Page Timeout: ${status.timeout}\n`;

    if (!this.executablePath) {
      response += `\n_Set CHROME_PATH environment variable to enable browser features._`;
    }

    return this.success(response);
  }

  /**
   * Browse a URL and extract content
   */
  async browseUrl(url, context) {
    if (!this.executablePath) {
      return this.error('Chrome not found. Set CHROME_PATH to enable browsing.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      // Extract page info
      const pageData = await page.evaluate(() => {
        const title = document.title || 'No title';
        const description = document.querySelector('meta[name="description"]')?.content || '';

        // Get main content text
        const body = document.body;
        const scripts = body.querySelectorAll('script, style, nav, header, footer, aside');
        scripts.forEach(el => el.remove());

        let text = body.innerText || '';
        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Get links
        const links = Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 5)
          .map(a => ({ text: a.innerText.trim().slice(0, 50), href: a.href }))
          .filter(l => l.text && l.href.startsWith('http'));

        return { title, description, text, links };
      });

      // Truncate content
      let content = pageData.text.slice(0, this.maxContentLength);
      if (pageData.text.length > this.maxContentLength) {
        content += '...';
      }

      let response = `*${pageData.title}*\n`;
      response += `${url}\n\n`;

      if (pageData.description) {
        response += `_${pageData.description.slice(0, 200)}_\n\n`;
      }

      response += `*Content:*\n${content}\n`;

      if (pageData.links.length > 0) {
        response += `\n*Links:*\n`;
        pageData.links.forEach(link => {
          response += `• ${link.text}\n`;
        });
      }

      return this.success(response);
    } finally {
      await page.close();
    }
  }

  /**
   * Take a screenshot of a URL
   */
  async takeScreenshot(url, context) {
    if (!this.executablePath) {
      return this.error('Chrome not found. Set CHROME_PATH to enable screenshots.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.timeout
      });

      // Wait a bit for any animations
      await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));

      // Take screenshot
      const screenshotPath = path.join(
        process.env.TEMP || '/tmp',
        `screenshot_${Date.now()}.png`
      );

      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        type: 'png'
      });

      const title = await page.title();

      return this.success(
        `*Screenshot captured*\n\n` +
        `URL: ${url}\n` +
        `Title: ${title}\n` +
        `Saved to: ${screenshotPath}\n\n` +
        `_Screenshot saved locally. Use file sharing to send._`
      );
    } finally {
      await page.close();
    }
  }

  /**
   * Search Google and return results
   */
  async searchGoogle(query, context) {
    if (!this.executablePath) {
      return this.error('Chrome not found. Set CHROME_PATH to enable search.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      // Extract search results
      const results = await page.evaluate(() => {
        const items = [];
        const resultElements = document.querySelectorAll('div.g');

        resultElements.forEach((el, index) => {
          if (index >= 5) return; // Limit to 5 results

          const titleEl = el.querySelector('h3');
          const linkEl = el.querySelector('a');
          const snippetEl = el.querySelector('div[data-sncf], div.VwiC3b');

          if (titleEl && linkEl) {
            items.push({
              title: titleEl.innerText,
              url: linkEl.href,
              snippet: snippetEl?.innerText?.slice(0, 150) || ''
            });
          }
        });

        return items;
      });

      if (results.length === 0) {
        return this.success(
          `*Search: "${query}"*\n\n` +
          `No results found or Google blocked the request.\n` +
          `_Try using the research skill instead._`
        );
      }

      let response = `*Search: "${query}"*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      results.forEach((result, index) => {
        response += `*${index + 1}. ${result.title}*\n`;
        if (result.snippet) {
          response += `${result.snippet}...\n`;
        }
        response += `${result.url}\n\n`;
      });

      return this.success(response);
    } finally {
      await page.close();
    }
  }

  /**
   * Extract content using CSS selector
   */
  async extractContent(url, selector, context) {
    if (!this.executablePath) {
      return this.error('Chrome not found. Set CHROME_PATH to enable extraction.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      // Extract content from selector
      const extracted = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        if (elements.length === 0) {
          return { found: false, count: 0, content: [] };
        }

        const content = Array.from(elements).map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.innerText?.trim().slice(0, 500) || '',
          html: el.outerHTML?.slice(0, 200) || ''
        }));

        return { found: true, count: elements.length, content: content.slice(0, 10) };
      }, selector);

      if (!extracted.found) {
        return this.error(
          `No elements found matching selector: ${selector}\n\n` +
          `URL: ${url}`
        );
      }

      let response = `*Extracted from ${url}*\n`;
      response += `Selector: \`${selector}\`\n`;
      response += `Found: ${extracted.count} element(s)\n`;
      response += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      extracted.content.forEach((item, index) => {
        response += `*[${index + 1}] <${item.tag}>*\n`;
        response += `${item.text.slice(0, 300)}${item.text.length > 300 ? '...' : ''}\n\n`;
      });

      return this.success(response);
    } finally {
      await page.close();
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    if (this.executablePath) {
      this.log('info', `Browser skill ready - Chrome found at: ${this.executablePath}`);
    } else {
      this.log('warn', 'Browser skill: Chrome not found. Set CHROME_PATH to enable.');
    }
  }

  /**
   * Shutdown the skill
   */
  async shutdown() {
    await this.closeBrowser();
    await super.shutdown();
  }
}

module.exports = BrowserSkill;
