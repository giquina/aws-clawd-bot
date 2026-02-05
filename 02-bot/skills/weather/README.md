# Weather Skill

Real-time weather information and 5-day forecasts using the OpenWeatherMap API.

## Configuration

### Environment Variables

Set the following in `config/.env.local`:

```bash
OPENWEATHER_API_KEY=your_api_key_here
```

Get a free API key at: https://openweathermap.org/api

### Skills Configuration

The weather skill is configured in `skills/skills.json`:

```json
{
  "weather": {
    "cacheTTLMinutes": 30,
    "defaultCity": "London",
    "units": "metric"
  }
}
```

## Usage

### Current Weather

```
weather
weather London
weather in Paris
weather now
```

Response includes:
- Current temperature (°C)
- "Feels like" temperature
- Weather condition and description
- Humidity percentage
- Wind speed (m/s)
- Cloud cover percentage
- Sunrise/sunset times

### 5-Day Forecast

```
forecast
forecast New York
forecast in Tokyo
forecast Amsterdam
```

Response includes:
- Daily high/low temperatures
- Weather conditions for each day
- Humidity and wind speed
- Formatted for easy reading

## Features

### Caching
- Results cached for **30 minutes** to minimize API calls
- Significantly reduces OpenWeatherMap quota usage
- Per-city caching

### Default Location
- Defaults to **London** if no city is specified
- Can be changed in `skills.json` config

### Error Handling
- Validates API key on initialization
- Graceful errors for invalid city names
- Fallback suggestions for users

### Units
- Uses **metric system** by default
- Temperature in Celsius
- Wind speed in m/s
- Distances in kilometers

## Examples

### Telegram Commands

```
/weather london
/forecast paris
/weather in new york
```

### Voice Notes

- "What's the weather like?"
- "Weather in Tokyo"
- "Forecast for Berlin"
- "Current conditions in Sydney"

## API Reference

### OpenWeatherMap Endpoints Used

- **Current Weather:** `/data/2.5/weather?q={city}&units=metric&appid={apiKey}`
- **5-Day Forecast:** `/data/2.5/forecast?q={city}&units=metric&appid={apiKey}`

### Cache Behavior

| Operation | Cache Time | API Calls |
|-----------|-----------|-----------|
| 1st request | 30 min | 1 |
| Subsequent requests (same city) | < 30 min | 0 |
| Cache expiration | After 30 min | Next call = 1 |

## Development

### Testing Locally

```bash
cd 02-bot
npm install
npm run dev
```

Then send commands via Telegram:
```
/weather london
/forecast new york
```

### Debugging

Enable debug logging:

```javascript
// In the skill or context
skill.log('debug', 'Cache info', {
  size: skill.weatherCache.size,
  entries: Array.from(skill.weatherCache.keys())
});
```

## API Rate Limits

**Free Tier:** 1,000 calls/day

With 30-minute caching:
- Same city queried 8 times/hour = 1 API call
- 10 different cities/day = 10 API calls
- Well within free tier limits

## Deployment

1. **Set API Key:**
   ```bash
   export OPENWEATHER_API_KEY=your_key
   # or add to config/.env.local
   ```

2. **Restart Bot:**
   ```bash
   pm2 restart clawd-bot
   ```

3. **Test:**
   ```bash
   curl http://localhost:3000/health
   # Send /weather command via Telegram
   ```

## Future Enhancements

- [ ] Location detection by IP
- [ ] Metric/imperial unit toggle per user
- [ ] Weather alerts for extreme conditions
- [ ] Historical weather data
- [ ] Weather comparison between cities
- [ ] Integration with calendar (suggest outdoor activities)
- [ ] Multiple language support

## Troubleshooting

### "Weather service not configured"

**Issue:** OpenWeatherMap API key not set

**Fix:**
```bash
# Check environment variable
echo $OPENWEATHER_API_KEY

# Add to config/.env.local if missing
OPENWEATHER_API_KEY=your_key_here
```

### "City not found"

**Issue:** Invalid city name

**Fix:**
- Use standard city names: "London", "New York", "Paris"
- Avoid abbreviations: Use "San Francisco" not "SF"
- Check spelling

### API Rate Limit Exceeded

**Issue:** Too many requests

**Fix:**
- Cache TTL is 30 minutes
- Upgrade OpenWeatherMap plan
- Check for request loops

## Support

For issues:
1. Check logs: `pm2 logs clawd-bot`
2. Verify API key is set: `echo $OPENWEATHER_API_KEY`
3. Test API manually: `curl "https://api.openweathermap.org/data/2.5/weather?q=London&units=metric&appid=YOUR_KEY"`
