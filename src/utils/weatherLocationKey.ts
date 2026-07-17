/**
 * Stable per-coordinate key, rounded to ~100m — plenty precise for an
 * hourly forecast, and keeps a location's own entry stable across
 * re-lookups that nudge its geocoded coordinate by a hair. Shared by the
 * on-device forecast cache (`useWeatherForecast`) and the live fetch-health
 * signal (`ExtensionsConfig['weather']['locationStatus']`), so both always
 * agree on which location an entry belongs to.
 */
export function weatherLocationKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}
