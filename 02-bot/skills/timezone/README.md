# Timezone Skill

Get current time and timezone information for any city in the world.

## Overview

The Timezone Skill provides quick access to current time, timezone names, and UTC offsets for hundreds of cities worldwide using the `moment-timezone` library.

**Priority:** 15
**API Required:** No (offline)
**Authentication:** None

## Commands

### `time in <city>`
Get the current time in a specific city.

**Examples:**
```
time in London
time in New York
time in Tokyo
time in Mexico City
```

**Output:**
```
🕐 *London*
05:39 PM GMT (+00:00)
Wednesday, February 4, 2026
```

### `timezone <city>`
Show timezone information for a city (same as `time in`).

**Examples:**
```
timezone Paris
timezone Sydney
timezone Dubai
```

## Supported Cities

The skill includes a comprehensive city-to-timezone mapping covering:

**Americas:**
- New York, Los Angeles, Chicago, Denver
- Toronto, Vancouver
- Mexico City, Sao Paulo, Buenos Aires

**Europe:**
- London, Paris, Berlin, Amsterdam, Dublin
- Madrid, Rome, Istanbul, Moscow
- Lisbon, Zurich, Vienna, Prague, Warsaw

**Asia:**
- Dubai, Bangkok, Hong Kong, Shanghai
- Tokyo, Singapore, Seoul
- Mumbai, Delhi, Bangalore, Karachi
- Manila, Kuala Lumpur, Jakarta

**Africa:**
- Cairo, Lagos, Johannesburg, Nairobi

**Oceania:**
- Sydney, Melbourne, Auckland, Perth, Brisbane

**UTC/GMT:**
- UTC, GMT

## Features

- Case-insensitive city names
- Multi-word city support (e.g., "Mexico City", "New York")
- Fuzzy matching (partial city name match)
- IANA timezone direct lookup
- Full timezone abbreviations and UTC offsets
- Day and date information

## Response Format

```
🕐 *CityName*
HH:MM AM/PM TZ (UTC±offset)
Day Name, Month Date, Year
```

**Example:**
```
🕐 *New York*
12:39 PM EST (-05:00)
Wednesday, February 4, 2026
```

## Error Handling

Missing city name:
```
Please specify a city. Example: "time in London" or "timezone New York"
```

Unknown city:
```
Could not find timezone for "unknown". Try cities like: London, New York, Tokyo, Sydney, Dubai
```

## Implementation Details

### Technology
- **Library:** moment-timezone (v0.5.45+)
- **Data Source:** IANA timezone database
- **Caching:** None required (all computations in-memory)

### City Mapping
The skill uses a hardcoded city-to-timezone map with 200+ cities. Unknown cities are handled gracefully with suggestions.

### Timezone Information
- **Timezone Name:** IANA identifier (e.g., "America/New_York")
- **Abbreviation:** Three-letter code (e.g., "EST", "GMT", "JST")
- **UTC Offset:** Current offset accounting for DST

## Testing

Run the test suite:
```bash
node skills/timezone/test.js
```

**Test Coverage:**
- ✓ Basic city lookups
- ✓ Multiple command formats
- ✓ Case insensitivity
- ✓ Multi-word cities
- ✓ Error handling for missing/invalid cities
- ✓ Fuzzy matching
- ✓ Edge cases

All 11 tests pass.

## Configuration

**skills.json:**
```json
"timezone": {
  "defaultCities": ["London", "New York", "Tokyo", "Sydney"],
  "supportedCities": 200
}
```

## Extending the Skill

### Adding More Cities

Edit the `cityTimezoneMap` object in `index.js`:

```javascript
'city-name': 'Continent/City_IANA_Identifier'
```

IANA timezone identifiers can be found at: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

### Direct Timezone Lookup

The skill will automatically attempt to match any input against the IANA timezone database as a fallback:

```
timezone Europe/Paris     # Works! Direct IANA lookup
```

## Performance

- **Speed:** Instant (no API calls)
- **Memory:** Minimal (in-memory map + moment-timezone)
- **Reliability:** 99.9% (timezone database is static)

## Dependencies

```json
"moment-timezone": "^0.5.45"
```

## Author

ClawdBot Skill Framework
Created: February 2026
