/**
 * Research Skill for ClawdBot
 *
 * Provides web searching and content summarization through WhatsApp commands.
 * Uses Brave Search API when available, falls back to AI-powered responses.
 *
 * Commands:
 *   research [topic]         - Search the web and summarize findings
 *   summarize [url]          - Fetch and summarize a webpage
 *   trending [category]      - Get trending topics (tech, ai, news)
 */

const BaseSkill = require('../base-skill');
const axios = require('axios');

class ResearchSkill extends BaseSkill {
  name = 'research';
  description = 'Web searching and content summarization - research topics, summarize URLs, get trending topics';
  priority = 5;

  commands = [
    {
      pattern: /^research\s+(.+)$/i,
      description: 'Search the web and summarize findings on a topic',
      usage: 'research <topic>'
    },
    {
      pattern: /^summarize\s+(https?:\/\/\S+)$/i,
      description: 'Fetch and summarize a webpage',
      usage: 'summarize <url>'
    },
    {
      pattern: /^trending(?:\s+(tech|ai|news))?$/i,
      description: 'Get trending topics in a category',
      usage: 'trending [tech|ai|news]'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.braveApiKey = process.env.BRAVE_API_KEY || null;
    this.maxResponseLength = 500; // WhatsApp readability limit
  }

  /**
   * Check if Brave Search API is available
   */
  hasBraveApi() {
    return !!this.braveApiKey;
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);

    try {
      // Route to appropriate handler based on command pattern
      const researchMatch = raw.match(/^research\s+(.+)$/i);
      if (researchMatch) {
        return await this.handleResearch(researchMatch[1]);
      }

      const summarizeMatch = raw.match(/^summarize\s+(https?:\/\/\S+)$/i);
      if (summarizeMatch) {
        return await this.handleSummarize(summarizeMatch[1]);
      }

      const trendingMatch = raw.match(/^trending(?:\s+(tech|ai|news))?$/i);
      if (trendingMatch) {
        return await this.handleTrending(trendingMatch[1] || 'tech');
      }

      return this.error('Command not recognized. Try "research AI trends" or "trending tech"');

    } catch (err) {
      this.log('error', 'Research command failed', err);
      return this.error(`Research failed: ${err.message}`);
    }
  }

  // ============ Command Handlers ============

  /**
   * Research a topic using web search or AI
   */
  async handleResearch(topic) {
    this.log('info', `Researching topic: ${topic}`);

    if (this.hasBraveApi()) {
      return await this.searchWithBrave(topic);
    } else {
      return await this.searchWithAI(topic);
    }
  }

  /**
   * Search using Brave Search API
   */
  async searchWithBrave(topic) {
    try {
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.braveApiKey
        },
        params: {
          q: topic,
          count: 5,
          safesearch: 'moderate'
        }
      });

      const results = response.data.web?.results || [];

      if (results.length === 0) {
        return this.success(`No results found for "${topic}". Try different keywords.`);
      }

      // Format results for WhatsApp
      let summary = `*Research: ${topic}*\n\n`;

      // Get top 3 results
      const topResults = results.slice(0, 3);
      topResults.forEach((result, i) => {
        const title = this.truncate(result.title, 50);
        const desc = this.truncate(result.description, 80);
        summary += `${i + 1}. *${title}*\n${desc}\n\n`;
      });

      // Use AI to synthesize if available
      if (this.ai) {
        const synthesis = await this.synthesizeResults(topic, topResults);
        if (synthesis) {
          summary += `*Summary:* ${synthesis}`;
        }
      }

      return this.success(this.truncate(summary, this.maxResponseLength));

    } catch (err) {
      this.log('error', 'Brave search failed', err);
      // Fall back to AI
      return await this.searchWithAI(topic);
    }
  }

  /**
   * Search using AI handler (fallback when no Brave API)
   */
  async searchWithAI(topic) {
    if (!this.ai) {
      return this.error('Research unavailable. Configure BRAVE_API_KEY or ANTHROPIC_API_KEY.');
    }

    try {
      const prompt = `Provide a brief, factual summary about "${topic}". Include:
- Key points (2-3 bullet points)
- Recent developments if relevant
- One recommended resource or next step

Keep response under 400 characters for WhatsApp.`;

      const response = await this.ai.processQuery(prompt);

      let result = `*Research: ${topic}*\n\n${response}`;
      result += '\n\n_Note: AI-generated. For live data, set BRAVE_API_KEY._';

      return this.success(this.truncate(result, this.maxResponseLength));

    } catch (err) {
      this.log('error', 'AI research failed', err);
      return this.error('Research failed. Please try again.');
    }
  }

  /**
   * Synthesize search results into a summary using AI
   */
  async synthesizeResults(topic, results) {
    if (!this.ai) return null;

    try {
      const context = results.map(r => `${r.title}: ${r.description}`).join('\n');
      const prompt = `Based on these search results about "${topic}", give a 2-sentence synthesis:\n${context}`;

      const response = await this.ai.processQuery(prompt);
      return this.truncate(response, 200);

    } catch (err) {
      this.log('warn', 'Synthesis failed', err);
      return null;
    }
  }

  /**
   * Summarize a webpage
   */
  async handleSummarize(url) {
    this.log('info', `Summarizing URL: ${url}`);

    try {
      // Fetch the page content
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'ClawdBot/1.0 (WhatsApp Assistant)',
          'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: 10000,
        maxRedirects: 3
      });

      const html = response.data;
      const text = this.extractText(html);

      if (!text || text.length < 100) {
        return this.error('Could not extract meaningful content from this URL.');
      }

      // Use AI to summarize
      if (!this.ai) {
        // Basic extraction without AI
        const preview = this.truncate(text, 400);
        return this.success(`*Page Preview:*\n\n${preview}\n\n_For better summaries, configure ANTHROPIC_API_KEY._`);
      }

      const prompt = `Summarize this webpage content in 3-4 sentences for WhatsApp (under 350 chars):\n\n${this.truncate(text, 2000)}`;
      const summary = await this.ai.processQuery(prompt);

      let result = `*Summary:*\n\n${summary}`;
      result += `\n\n_Source: ${this.truncate(url, 50)}_`;

      return this.success(this.truncate(result, this.maxResponseLength));

    } catch (err) {
      this.log('error', 'URL summarization failed', err);

      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return this.error('Could not reach that URL. Check the address and try again.');
      }
      if (err.response?.status === 403 || err.response?.status === 401) {
        return this.error('Access denied to that URL. The site may block automated access.');
      }
      if (err.response?.status === 404) {
        return this.error('Page not found. Check the URL and try again.');
      }

      return this.error('Failed to summarize URL. Try a different page.');
    }
  }

  /**
   * Get trending topics
   */
  async handleTrending(category) {
    this.log('info', `Getting trending topics: ${category}`);

    const categoryMap = {
      tech: 'technology programming software',
      ai: 'artificial intelligence machine learning AI',
      news: 'breaking news current events'
    };

    const searchTerm = `trending ${categoryMap[category] || category} 2024`;

    if (this.hasBraveApi()) {
      try {
        const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': this.braveApiKey
          },
          params: {
            q: searchTerm,
            count: 5,
            freshness: 'pd' // Past day
          }
        });

        const results = response.data.web?.results || [];

        if (results.length === 0) {
          return this.success(`No trending topics found for ${category}. Try again later.`);
        }

        let output = `*Trending in ${category.toUpperCase()}:*\n\n`;
        results.slice(0, 4).forEach((result, i) => {
          output += `${i + 1}. ${this.truncate(result.title, 60)}\n`;
        });

        return this.success(this.truncate(output, this.maxResponseLength));

      } catch (err) {
        this.log('error', 'Brave trending search failed', err);
        // Fall through to AI fallback
      }
    }

    // AI fallback for trending topics
    if (this.ai) {
      const prompt = `List 4 current trending topics in ${category} (${categoryMap[category]}).
Format as numbered list, one line each. Keep total under 350 characters.`;

      try {
        const response = await this.ai.processQuery(prompt);
        let result = `*Trending in ${category.toUpperCase()}:*\n\n${response}`;
        result += '\n\n_AI-generated. May not reflect real-time trends._';
        return this.success(this.truncate(result, this.maxResponseLength));

      } catch (err) {
        this.log('error', 'AI trending failed', err);
      }
    }

    return this.error('Trending unavailable. Configure BRAVE_API_KEY for live data.');
  }

  // ============ Helper Methods ============

  /**
   * Extract readable text from HTML
   */
  extractText(html) {
    if (!html) return '';

    // Remove scripts, styles, and other non-content elements
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract text from remaining HTML
    text = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  /**
   * Truncate text to specified length
   */
  truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = ResearchSkill;
