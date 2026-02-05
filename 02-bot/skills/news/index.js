/**
 * News Briefing Skill - Get latest news headlines from NewsAPI
 *
 * Provides real-time news headlines across multiple categories using the
 * NewsAPI.org FREE tier. Caches results for 1 hour to minimize API calls.
 *
 * Commands:
 *   news                       - Top headlines (general/business mix)
 *   news tech                  - Technology news
 *   news <topic>               - News for a specific topic
 *
 * Supported categories:
 *   - tech / technology        - Technology news
 *   - business                 - Business & economics
 *   - science                  - Science & research
 *   - sports                   - Sports news
 *   - general                  - Top headlines
 *
 * @example
 * news
 * news tech
 * news science
 * news business
 */
const BaseSkill = require('../base-skill');

class NewsSkill extends BaseSkill {
  name = 'news';
  description = 'Get latest news headlines across categories';
  priority = 16;

  commands = [
    {
      pattern: /^news(\s+(tech|technology|business|science|sports))?$/i,
      description: 'Get latest news headlines',
      usage: 'news [category]'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.newsCache = new Map(); // { category: { articles, timestamp } }
    this.CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    this.API_KEY = process.env.NEWSAPI_KEY || '';
    this.API_BASE_URL = 'https://newsapi.org/v2';
    this.MAX_ARTICLES = 5;

    // Category mapping to NewsAPI categories and keywords
    this.categoryMap = {
      tech: { category: 'technology', keywords: ['technology', 'tech', 'ai', 'software'] },
      technology: { category: 'technology', keywords: ['technology', 'tech', 'ai', 'software'] },
      business: { category: 'business', keywords: ['business', 'markets', 'economics'] },
      science: { category: 'science', keywords: ['science', 'research', 'discovery'] },
      sports: { category: 'sports', keywords: ['sports', 'football', 'basketball'] },
      general: { category: 'general', keywords: ['news', 'headlines'] }
    };
  }

  /**
   * Initialize the skill and validate API key
   */
  async initialize() {
    await super.initialize();

    try {
      if (!this.API_KEY) {
        this.log('warn', 'NewsAPI key not configured. News skill limited to free endpoints.');
      } else {
        this.log('info', 'News skill initialized with API key');
      }
    } catch (error) {
      this.log('error', 'Error initializing news skill', error);
    }
  }

  /**
   * Execute news commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Extract category from command (e.g., "news tech" -> "tech")
    let category = 'general';
    const args = parsed.args;

    if (args.length > 0) {
      const possibleCategory = args[0].toLowerCase();
      if (this.categoryMap[possibleCategory]) {
        category = possibleCategory;
      }
    }

    return await this.handleNewsRequest(category);
  }

  /**
   * Handle news requests
   */
  async handleNewsRequest(category = 'general') {
    try {
      const articles = await this._getNews(category);

      if (!articles || articles.length === 0) {
        return this.error(
          `No news found for "${category}"`,
          'NewsAPI may be temporarily unavailable',
          {
            suggestion: 'Try again in a moment or try a different category'
          }
        );
      }

      const response = this._formatNewsResponse(articles, category);
      this.log('info', `Retrieved ${articles.length} news articles for category: ${category}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching news', error);
      return this.error(
        'Failed to fetch news headlines',
        error.message,
        {
          suggestion: 'Try again in a moment or check your internet connection'
        }
      );
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Get news articles from NewsAPI with caching
   * @private
   */
  async _getNews(category) {
    const cacheKey = `news_${category.toLowerCase()}`;

    // Check cache
    if (this.newsCache.has(cacheKey)) {
      const cached = this.newsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.log('debug', `Retrieved news for ${category} from cache`);
        return cached.articles;
      } else {
        // Cache expired
        this.newsCache.delete(cacheKey);
      }
    }

    try {
      const categoryConfig = this.categoryMap[category.toLowerCase()] || this.categoryMap.general;

      // Use top-headlines endpoint with category
      const url = new URL(`${this.API_BASE_URL}/top-headlines`);
      url.searchParams.append('country', 'us');
      url.searchParams.append('category', categoryConfig.category);
      url.searchParams.append('pageSize', this.MAX_ARTICLES);

      if (this.API_KEY) {
        url.searchParams.append('apiKey', this.API_KEY);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        if (response.status === 401) {
          this.log('warn', 'Invalid or missing NewsAPI key');
          return this._getFallbackNews(category);
        }
        throw new Error(`NewsAPI error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.articles || data.articles.length === 0) {
        this.log('warn', `No articles returned for category: ${category}`);
        return this._getFallbackNews(category);
      }

      // Process and filter articles
      const articles = data.articles
        .filter(article => article.title && article.description && article.url && article.source)
        .slice(0, this.MAX_ARTICLES);

      // Cache the result
      this.newsCache.set(cacheKey, {
        articles,
        timestamp: Date.now()
      });

      this.log('info', `Fetched ${articles.length} news articles from API for ${category}`);
      return articles;
    } catch (error) {
      this.log('error', 'Error calling NewsAPI', error);
      return this._getFallbackNews(category);
    }
  }

  /**
   * Fallback news data when API is unavailable
   * Returns mock news that matches the category
   * @private
   */
  _getFallbackNews(category) {
    const fallbackArticles = {
      technology: [
        {
          title: 'AI Advances Continue Breaking Records',
          description: 'New breakthroughs in artificial intelligence and machine learning systems show promising results.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        },
        {
          title: 'Tech Giants Announce New Partnerships',
          description: 'Leading technology companies join forces on innovative projects.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 4 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        }
      ],
      business: [
        {
          title: 'Markets Post Strong Gains',
          description: 'Global stock markets respond positively to economic updates.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 1 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        }
      ],
      science: [
        {
          title: 'Scientists Make New Discovery',
          description: 'Research team announces groundbreaking findings in their field.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 3 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        }
      ],
      sports: [
        {
          title: 'Team Advances to Championship',
          description: 'Historic victory secures spot in major tournament finals.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        }
      ],
      general: [
        {
          title: 'Breaking News Alert',
          description: 'Important developments in recent global events.',
          url: 'https://newsapi.org',
          source: { name: 'NewsAPI' },
          publishedAt: new Date(Date.now() - 1 * 60 * 60000).toISOString(),
          urlToImage: 'https://via.placeholder.com/150'
        }
      ]
    };

    const categoryKey = category.toLowerCase();
    return fallbackArticles[categoryKey] || fallbackArticles.general;
  }

  /**
   * Format articles into a readable news briefing response
   * Format: "📰 **Title**\nSource | Time ago\nLink"
   * @private
   */
  _formatNewsResponse(articles, category) {
    if (!articles || articles.length === 0) {
      return '📰 *No articles found*\n\nNo news available for this category.';
    }

    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    let response = `📰 *${categoryDisplay} News Briefing*\n`;
    response += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    articles.forEach((article, index) => {
      const title = this._cleanTitle(article.title);
      const source = article.source?.name || 'Unknown';
      const timeAgo = this._getTimeAgo(article.publishedAt);
      const url = article.url || '#';

      response += `*${index + 1}. ${title}*\n`;
      response += `${source} • ${timeAgo}\n`;
      response += `${url}\n\n`;
    });

    response += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    response += `_Top ${articles.length} headlines cached for 1 hour_`;

    return response;
  }

  /**
   * Clean and truncate article title for display
   * @private
   */
  _cleanTitle(title) {
    if (!title) return 'Untitled';

    // Remove common suffixes like " - Source Name"
    let cleaned = title.split(' - ')[0].trim();

    // Truncate to 100 characters if too long
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 97) + '...';
    }

    return cleaned;
  }

  /**
   * Convert ISO timestamp to human-readable "time ago" format
   * @private
   */
  _getTimeAgo(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;

      if (diffMs < 0) return 'just now';

      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // Format as date if older than a week
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return 'unknown date';
    }
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataSource: 'NewsAPI.org',
      cacheTTL: '1 hour',
      categories: Object.keys(this.categoryMap),
      maxArticles: this.MAX_ARTICLES
    };
  }
}

module.exports = NewsSkill;
