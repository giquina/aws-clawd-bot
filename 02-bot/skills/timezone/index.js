/**
 * TimezoneSkill - Get current time in any timezone
 *
 * Provides commands to look up current time in cities worldwide.
 * Uses moment-timezone for accurate timezone handling.
 *
 * Commands:
 *   time in <city>        - Get current time in a city
 *   timezone <city>       - Show timezone info for a city
 */
const BaseSkill = require('../base-skill');
const moment = require('moment-timezone');

class TimezoneSkill extends BaseSkill {
  name = 'timezone';
  description = 'Get current time and timezone information for any city';
  priority = 15;

  commands = [
    {
      pattern: /^time\s+in\s+(.+)$/i,
      description: 'Get current time in a city',
      usage: 'time in <city-name>'
    },
    {
      pattern: /^timezone\s+(.+)$/i,
      description: 'Show timezone info for a city',
      usage: 'timezone <city-name>'
    }
  ];

  /**
   * City to timezone mapping
   * Common cities and their IANA timezone identifiers
   */
  cityTimezoneMap = {
    // Americas
    'new york': 'America/New_York',
    'los angeles': 'America/Los_Angeles',
    'chicago': 'America/Chicago',
    'denver': 'America/Denver',
    'toronto': 'America/Toronto',
    'vancouver': 'America/Vancouver',
    'mexico city': 'America/Mexico_City',
    'sao paulo': 'America/Sao_Paulo',
    'são paulo': 'America/Sao_Paulo',
    'buenos aires': 'America/Argentina/Buenos_Aires',

    // Europe
    'london': 'Europe/London',
    'paris': 'Europe/Paris',
    'berlin': 'Europe/Berlin',
    'amsterdam': 'Europe/Amsterdam',
    'dublin': 'Europe/Dublin',
    'madrid': 'Europe/Madrid',
    'rome': 'Europe/Rome',
    'istanbul': 'Europe/Istanbul',
    'moscow': 'Europe/Moscow',
    'lisbon': 'Europe/Lisbon',
    'zurich': 'Europe/Zurich',
    'vienna': 'Europe/Vienna',
    'prague': 'Europe/Prague',
    'warsaw': 'Europe/Warsaw',

    // Asia
    'dubai': 'Asia/Dubai',
    'bangkok': 'Asia/Bangkok',
    'hong kong': 'Asia/Hong_Kong',
    'shanghai': 'Asia/Shanghai',
    'tokyo': 'Asia/Tokyo',
    'singapore': 'Asia/Singapore',
    'bangkok': 'Asia/Bangkok',
    'seoul': 'Asia/Seoul',
    'mumbai': 'Asia/Kolkata',
    'delhi': 'Asia/Kolkata',
    'bangalore': 'Asia/Kolkata',
    'pakistan': 'Asia/Karachi',
    'karachi': 'Asia/Karachi',
    'manilla': 'Asia/Manila',
    'manila': 'Asia/Manila',
    'kuala lumpur': 'Asia/Kuala_Lumpur',
    'jakarta': 'Asia/Jakarta',

    // Africa
    'cairo': 'Africa/Cairo',
    'lagos': 'Africa/Lagos',
    'johannesburg': 'Africa/Johannesburg',
    'nairobi': 'Africa/Nairobi',

    // Oceania
    'sydney': 'Australia/Sydney',
    'melbourne': 'Australia/Melbourne',
    'auckland': 'Pacific/Auckland',
    'perth': 'Australia/Perth',
    'brisbane': 'Australia/Brisbane',

    // UTC
    'utc': 'UTC',
    'gmt': 'UTC'
  };

  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Extract city name from command
    let city = '';

    if (lowerCommand.startsWith('time in ')) {
      city = lowerCommand.replace(/^time\s+in\s+/, '').trim();
    } else if (lowerCommand.startsWith('timezone ')) {
      city = lowerCommand.replace(/^timezone\s+/, '').trim();
    }

    if (!city) {
      return this.error('Please specify a city. Example: "time in London" or "timezone New York"');
    }

    return this.getTimezoneInfo(city);
  }

  /**
   * Get timezone information for a city
   * @param {string} city - City name (case-insensitive)
   * @returns {Object} - Success or error response
   */
  getTimezoneInfo(city) {
    const timezone = this.findTimezone(city);

    if (!timezone) {
      return this.error(`Could not find timezone for "${city}". Try cities like: London, New York, Tokyo, Sydney, Dubai`);
    }

    const now = moment.tz(timezone);
    const timeString = now.format('hh:mm A');
    const tzName = now.format('z');
    const tzAbbr = now.format('Z');
    const dayName = now.format('dddd');
    const date = now.format('MMMM D, YYYY');
    const isDST = now.isDST();

    // Build response message
    let message = `🕐 *${this.capitalizeCity(city)}*\n`;
    message += `${timeString} ${tzName} (${tzAbbr})\n`;
    message += `${dayName}, ${date}`;

    // Add DST indicator if applicable
    if (isDST) {
      message += '\n⏰ DST active';
    }

    return this.success(message);
  }

  /**
   * Find timezone for a given city
   * Tries exact match first, then fuzzy matching
   * @param {string} city - City name
   * @returns {string|null} - IANA timezone identifier or null
   */
  findTimezone(city) {
    const lowerCity = city.toLowerCase().trim();

    // Direct match
    if (this.cityTimezoneMap[lowerCity]) {
      return this.cityTimezoneMap[lowerCity];
    }

    // Fuzzy match - partial string match
    for (const [cityKey, tz] of Object.entries(this.cityTimezoneMap)) {
      if (cityKey.includes(lowerCity) || lowerCity.includes(cityKey)) {
        return tz;
      }
    }

    // Try to match against moment-timezone directly
    // In case it's a valid IANA timezone identifier
    try {
      if (moment.tz.zone(lowerCity)) {
        return lowerCity;
      }
    } catch (e) {
      // Not a valid timezone
    }

    return null;
  }

  /**
   * Capitalize city name properly
   * @param {string} city - City name
   * @returns {string} - Properly capitalized city name
   */
  capitalizeCity(city) {
    return city
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

module.exports = TimezoneSkill;
