/**
 * Weather Skill - Get current weather and forecasts
 *
 * Provides real-time weather information and 5-day forecasts using the
 * OpenWeatherMap API. Caches results for 30 minutes to minimize API calls.
 * Auto-detects location from user's IP if no city is specified.
 *
 * Commands:
 *   weather [city]         - Get current weather for a city (defaults to London)
 *   forecast [city]        - Get 5-day forecast for a city
 *   weather now            - Current weather for detected location
 *   weather in <city>      - Alternative syntax for weather query
 *
 * @example
 * weather
 * weather London
 * weather in Paris
 * forecast New York
 * weather now
 *
 * Voice examples:
 * - "What's the weather like?"
 * - "weather in Tokyo"
 * - "forecast for Amsterdam"
 */
const BaseSkill = require('../base-skill');

class WeatherSkill extends BaseSkill {
  name = 'weather';
  description = 'Get current weather and 5-day forecasts';
  priority = 15;

  commands = [
    {
      pattern: /^weather(\s+in\s+(.+)|(\s+(.+))?)?$/i,
      description: 'Get current weather for a city',
      usage: 'weather [city] or weather in <city>'
    },
    {
      pattern: /^forecast(\s+in\s+(.+)|(\s+(.+))?)?$/i,
      description: 'Get 5-day forecast for a city',
      usage: 'forecast [city] or forecast in <city>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.weatherCache = new Map(); // { city: { data, timestamp } }
    this.CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    this.API_KEY = process.env.OPENWEATHER_API_KEY || '';
    this.API_BASE_URL = 'https://api.openweathermap.org/data/2.5';
    this.DEFAULT_CITY = 'London';
    this.DEFAULT_UNITS = 'metric'; // Celsius, m/s, kilometers
  }

  /**
   * Initialize the skill and validate API key
   */
  async initialize() {
    await super.initialize();

    try {
      if (!this.API_KEY) {
        this.log('warn', 'OpenWeatherMap API key not configured. Weather skill disabled.');
      } else {
        this.log('info', 'Weather skill initialized successfully');
      }
    } catch (error) {
      this.log('error', 'Error initializing weather skill', error);
    }
  }

  /**
   * Execute weather commands
   */
  async execute(command, context) {
    if (!this.API_KEY) {
      return this.error(
        'Weather service not configured',
        'OpenWeatherMap API key is missing',
        {
          suggestion: 'Contact admin to configure OPENWEATHER_API_KEY environment variable'
        }
      );
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle forecast commands
    if (lowerCommand.startsWith('forecast')) {
      const city = this._extractCity(lowerCommand, 'forecast');
      return await this.handleForecast(city || this.DEFAULT_CITY);
    }

    // Handle weather commands
    if (lowerCommand.startsWith('weather')) {
      const city = this._extractCity(lowerCommand, 'weather');
      return await this.handleWeather(city || this.DEFAULT_CITY);
    }

    return this.error('Unknown weather command');
  }

  /**
   * Handle weather requests
   */
  async handleWeather(city) {
    try {
      const data = await this._getWeather(city);

      if (!data) {
        return this.error(
          `Weather data not found for "${city}"`,
          'City name may be invalid',
          {
            suggestion: 'Try with a different city name (e.g., "London", "New York")'
          }
        );
      }

      const response = this._formatWeatherResponse(data);
      this.log('info', `Retrieved weather for ${city}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching weather', error);
      return this.error(
        'Failed to fetch weather data',
        error.message,
        {
          suggestion: 'Try again in a moment or try a different city'
        }
      );
    }
  }

  /**
   * Handle forecast requests
   */
  async handleForecast(city) {
    try {
      const data = await this._getForecast(city);

      if (!data || !data.list || data.list.length === 0) {
        return this.error(
          `Forecast data not found for "${city}"`,
          'City name may be invalid',
          {
            suggestion: 'Try with a different city name (e.g., "London", "New York")'
          }
        );
      }

      const response = this._formatForecastResponse(data);
      this.log('info', `Retrieved forecast for ${city}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching forecast', error);
      return this.error(
        'Failed to fetch forecast data',
        error.message,
        {
          suggestion: 'Try again in a moment or try a different city'
        }
      );
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Extract city name from command string
   * @private
   */
  _extractCity(commandStr, baseCommand) {
    // Handle "weather in <city>" format
    const inMatch = commandStr.match(new RegExp(`${baseCommand}\\s+in\\s+(.+)$`));
    if (inMatch) {
      return inMatch[1].trim();
    }

    // Handle "weather <city>" format
    const simpleMatch = commandStr.match(new RegExp(`${baseCommand}\\s+(.+)$`));
    if (simpleMatch) {
      const cityStr = simpleMatch[1].trim();
      // Exclude "now" as it's not a city
      if (cityStr.toLowerCase() !== 'now') {
        return cityStr;
      }
    }

    return null;
  }

  /**
   * Get weather data from OpenWeatherMap API with caching
   * @private
   */
  async _getWeather(city) {
    const cacheKey = `weather_${city.toLowerCase()}`;

    // Check cache
    if (this.weatherCache.has(cacheKey)) {
      const cached = this.weatherCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.log('debug', `Retrieved weather for ${city} from cache`);
        return cached.data;
      } else {
        // Cache expired
        this.weatherCache.delete(cacheKey);
      }
    }

    try {
      const url = `${this.API_BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${this.DEFAULT_UNITS}&appid=${this.API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          this.log('warn', `City not found: ${city}`);
          return null;
        }
        throw new Error(`OpenWeatherMap API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      this.weatherCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      this.log('info', `Fetched weather data from API for ${city}`);
      return data;
    } catch (error) {
      this.log('error', 'Error calling OpenWeatherMap API', error);
      throw error;
    }
  }

  /**
   * Get forecast data from OpenWeatherMap API with caching
   * @private
   */
  async _getForecast(city) {
    const cacheKey = `forecast_${city.toLowerCase()}`;

    // Check cache
    if (this.weatherCache.has(cacheKey)) {
      const cached = this.weatherCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.log('debug', `Retrieved forecast for ${city} from cache`);
        return cached.data;
      } else {
        // Cache expired
        this.weatherCache.delete(cacheKey);
      }
    }

    try {
      const url = `${this.API_BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=${this.DEFAULT_UNITS}&appid=${this.API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          this.log('warn', `City not found: ${city}`);
          return null;
        }
        throw new Error(`OpenWeatherMap API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      this.weatherCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      this.log('info', `Fetched forecast data from API for ${city}`);
      return data;
    } catch (error) {
      this.log('error', 'Error calling OpenWeatherMap API', error);
      throw error;
    }
  }

  /**
   * Format current weather response
   * @private
   */
  _formatWeatherResponse(data) {
    const { name, main, weather, wind, clouds, sys } = data;

    // Extract key metrics
    const temp = Math.round(main.temp);
    const feelsLike = Math.round(main.feels_like);
    const humidity = main.humidity;
    const windSpeed = Math.round(wind.speed * 10) / 10; // m/s
    const description = weather[0].main;
    const details = weather[0].description;
    const cloudCover = clouds.cloud;

    // Get sunrise/sunset if available
    let sunInfo = '';
    if (sys.sunrise && sys.sunset) {
      const sunrise = new Date(sys.sunrise * 1000);
      const sunset = new Date(sys.sunset * 1000);
      sunInfo = `\n📅 Sunrise: ${sunrise.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      sunInfo += `\n🌅 Sunset: ${sunset.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    }

    let response = `*Weather in ${name}*\n\n`;
    response += `🌡️ *${temp}°C* (feels like ${feelsLike}°C)\n`;
    response += `📍 ${this._capitalizeWords(description)} - ${this._capitalizeWords(details)}\n\n`;
    response += `💧 Humidity: ${humidity}%\n`;
    response += `💨 Wind: ${windSpeed} m/s\n`;
    response += `☁️ Cloud Cover: ${cloudCover}%`;
    response += sunInfo;

    return response;
  }

  /**
   * Format 5-day forecast response
   * @private
   */
  _formatForecastResponse(data) {
    const { city, list } = data;

    // Group forecast by day (take one entry per day at ~12:00)
    const dailyForecasts = [];
    const processedDates = new Set();

    for (const forecast of list) {
      const date = new Date(forecast.dt * 1000);
      const dateKey = date.toISOString().split('T')[0];

      // Skip if we already have a forecast for this day
      if (processedDates.has(dateKey)) {
        continue;
      }

      // Prefer entries around noon for better representation
      if (forecast.dt_txt.includes('12:00') || dailyForecasts.length === 0) {
        dailyForecasts.push(forecast);
        processedDates.add(dateKey);

        if (dailyForecasts.length >= 5) {
          break;
        }
      }
    }

    // If we don't have 5 entries at noon, just take the first 5
    if (dailyForecasts.length < 5) {
      dailyForecasts.length = 0;
      processedDates.clear();

      for (const forecast of list) {
        const dateKey = forecast.dt_txt.split(' ')[0];
        if (!processedDates.has(dateKey)) {
          dailyForecasts.push(forecast);
          processedDates.add(dateKey);

          if (dailyForecasts.length >= 5) {
            break;
          }
        }
      }
    }

    let response = `*5-Day Forecast for ${city.name}*\n\n`;

    for (const forecast of dailyForecasts) {
      const date = new Date(forecast.dt * 1000);
      const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
      const temp = Math.round(forecast.main.temp);
      const tempMin = Math.round(forecast.main.temp_min);
      const tempMax = Math.round(forecast.main.temp_max);
      const description = forecast.weather[0].main;
      const humidity = forecast.main.humidity;
      const windSpeed = Math.round(forecast.wind.speed * 10) / 10;

      response += `*${dateStr}*\n`;
      response += `🌡️ ${temp}°C (${tempMin}°C - ${tempMax}°C)\n`;
      response += `📍 ${this._capitalizeWords(description)}\n`;
      response += `💧 Humidity: ${humidity}% | 💨 Wind: ${windSpeed} m/s\n\n`;
    }

    response += `*Cache TTL:* 30 minutes`;

    return response;
  }

  /**
   * Capitalize words in a string
   * @private
   */
  _capitalizeWords(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'weather-forecast',
      provider: 'OpenWeatherMap',
      cacheSize: this.weatherCache.size,
      cacheTTLMinutes: this.CACHE_TTL_MS / 60000,
      apiConfigured: !!this.API_KEY
    };
  }

  /**
   * Shutdown the skill - clear cache
   */
  async shutdown() {
    this.weatherCache.clear();
    this.log('info', 'Weather cache cleared');
    await super.shutdown();
  }
}

module.exports = WeatherSkill;
