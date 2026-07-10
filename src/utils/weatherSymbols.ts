/**
 * Maps a MET Norway/Yr "symbol code" (e.g. `"partlycloudy_day"`) to a plain
 * emoji, keyed by its base code with the `_day`/`_night`/`_polartwilight`
 * suffix stripped — a lightweight stand-in for Yr's own icon set (which
 * would need its own asset/attribution handling) good enough for a small
 * ambient kiosk display. Falls back to a generic cloud for anything
 * unrecognized rather than showing nothing.
 */
export function weatherSymbolToEmoji(symbolCode: string): string {
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '')
  return WEATHER_EMOJI[base] ?? '☁️'
}

const WEATHER_EMOJI: Record<string, string> = {
  clearsky: '☀️',
  fair: '🌤️',
  partlycloudy: '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  rainshowers: '🌦️',
  rainshowersandthunder: '⛈️',
  sleetshowers: '🌨️',
  snowshowers: '🌨️',
  rain: '🌧️',
  heavyrain: '🌧️',
  lightrain: '🌦️',
  rainandthunder: '⛈️',
  sleet: '🌨️',
  snow: '❄️',
  lightsnow: '🌨️',
  heavysnow: '❄️',
  snowandthunder: '⛈️',
  sleetshowersandthunder: '⛈️',
  snowshowersandthunder: '⛈️',
}
