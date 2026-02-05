# News Briefing Skill

Provides real-time news headlines across multiple categories using the **NewsAPI.org FREE tier**. Automatically caches results for 1 hour to minimize API calls.

## Features

- **5 supported news categories**: Technology, Business, Science, Sports, General
- **Top 5 headlines per category** with clean, readable formatting
- **1-hour caching** to minimize API requests
- **Fallback data** when API is unavailable
- **Time-aware display** showing "2h ago", "just now", etc.
- **Clean title formatting** with truncation for long titles

## Installation

The skill is already enabled in `skills/skills.json`. Ensure you have the `NEWSAPI_KEY` environment variable set:

```bash
# Get free API key from https://newsapi.org/
export NEWSAPI_KEY=your_api_key_here
```

If `NEWSAPI_KEY` is not set, the skill will use fallback demo data instead.

## Usage

### Basic Commands

```
news                    → Top headlines (general/business mix)
news tech              → Technology news
news technology        → Technology news (alternate syntax)
news business          → Business & economics news
news science           → Science & research news
news sports            → Sports news
```

### Example Output

```
📰 *Technology News Briefing*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*1. Tech Giants Launch New AI Model*
Tech Weekly • 2h ago
https://example.com/article1

*2. AI Breakthrough Could Change Everything*
Science Daily • 4h ago
https://example.com/article2

*3. New Software Library Simplifies Development*
Dev.to • 5h ago
https://example.com/article3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Top 3 headlines cached for 1 hour_
```

## Configuration

The skill is configured in `skills/skills.json`:

```json
{
  "news": {
    "cacheTTLMinutes": 60,
    "maxArticles": 5,
    "defaultCountry": "us",
    "categories": ["tech", "business", "science", "sports", "general"]
  }
}
```

## API Integration

- **Provider**: [NewsAPI.org](https://newsapi.org/)
- **Endpoint**: `GET /v2/top-headlines`
- **Free Tier Limit**: 100 requests/day
- **Caching**: 60 minutes per category
- **Timeout**: Automatic fallback if API unavailable

## Technical Details

### Command Parsing

The skill recognizes:
- `news` → defaults to "general" category
- `news <category>` → fetches headlines for specified category
- Case-insensitive matching

### Caching Strategy

```
Request → Check Cache
  ├── Cache Hit (< 1 hour) → Return cached data
  ├── Cache Miss or Expired → Fetch from API
  │   ├── API Success → Cache + Return
  │   └── API Failure → Return Fallback Data
```

### Time Display Format

- Less than 1 minute: "just now"
- 1-59 minutes: "5m ago"
- 1-23 hours: "2h ago"
- 1-6 days: "3d ago"
- Older: "Jan 28"

### Article Filtering

- Only articles with title, description, URL, and source are included
- Long titles are truncated to 100 characters
- Source name is cleaned from the title
- Articles are limited to 5 per request

## Troubleshooting

### No News Appearing

1. Check if `NEWSAPI_KEY` is set: `echo $NEWSAPI_KEY`
2. Verify API key is valid at [newsapi.org](https://newsapi.org/)
3. Check daily request limit (100/day on free tier)
4. Skill will automatically use fallback demo data

### Stale Headlines

Headlines are cached for 1 hour. For fresh data, wait 1 hour or:
- Clear the cache manually (requires app restart)
- Upgrade to paid API plan for more requests

### Slow Response

- First request fetches from API (1-2 seconds)
- Subsequent requests within 1 hour use cache (instant)
- Fallback data loads immediately if API is down

## Future Enhancements

- [ ] Category-specific keywords filtering
- [ ] Multi-language support
- [ ] Sentiment analysis of headlines
- [ ] Scheduling periodic news briefings
- [ ] Search by topic across all categories
- [ ] Save favorite articles

## Support

For issues or feature requests, contact the development team.
