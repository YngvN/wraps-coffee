import { useEffect } from 'react'
import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useLanguage } from '../../i18n'
import type { ExtensionsConfig, WeatherLocationStatus } from '../../types/extensions'
import { DEFAULT_WEATHER_FORECAST_HOURS } from '../../types/screen'
import { formatClockTime } from '../../utils/clockFormat'
import { weatherLocationKey } from '../../utils/weatherLocationKey'
import { weatherSymbolToEmoji } from '../../utils/weatherSymbols'
import './WeatherSlide.scss'

/**
 * Which coordinates a `'weather'` slide actually shows, in priority order:
 * its own `locationId` (if it still matches one of `config.weather.locations`),
 * else the store's own address while `useStoreLocation` is on, else the
 * first remaining configured location — so a slide left pointing at a
 * since-deleted location (or never set at all) still shows *something*
 * rather than going blank, same posture as `TransitSlide`'s `effectiveStopId`.
 */
function resolveWeatherCoordinates(config: ExtensionsConfig, locationId: string | undefined) {
  const customLocation = locationId ? config.weather.locations.find((location) => location.id === locationId) : undefined
  if (customLocation) return customLocation.coordinates ?? undefined
  if (config.weather.useStoreLocation) return config.addressLookup?.coordinates
  return config.weather.locations[0]?.coordinates
}

interface WeatherSlideProps {
  /** Which of `ExtensionsConfig['weather']['locations']` to show, by id — see `resolveWeatherCoordinates`. */
  locationId?: string
  /** How many hours ahead the forecast list shows. Falls back to `DEFAULT_WEATHER_FORECAST_HOURS`. */
  forecastHours?: number
  /** Show wind speed (m/s) alongside temperature. Falls back to `false`. */
  showWind?: boolean
  /** Show relative humidity (%). Falls back to `false`. */
  showHumidity?: boolean
  /** Show precipitation probability (%), when MET's forecast includes one for that hour. Falls back to `false`. */
  showPrecipitationProbability?: boolean
  /** Show the UV index, when MET reports one (daylight hours only). Falls back to `false`. */
  showUvIndex?: boolean
  /** Show air pressure at sea level (hPa). Falls back to `false`. */
  showPressure?: boolean
}

/** Fullscreen rendering of an hourly forecast for one of the cafe's configured locations (see the admin's Integrations tab), for a screen display's "weather" slot. */
export function WeatherSlide({ locationId, forecastHours, showWind, showHumidity, showPrecipitationProbability, showUvIndex, showPressure }: WeatherSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [config, setConfig] = useExtensionsConfig()
  const coordinates = resolveWeatherCoordinates(config, locationId)
  const { hourly, loading, stale } = useWeatherForecast(coordinates?.lat, coordinates?.lon, forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS)

  // Reports this location's fetch outcome back into the synced config, so the
  // Integrations page's own status dot (a different device/browser) can show
  // it — see `ExtensionsConfig['weather']['locationStatus']`. Only fires on a
  // genuine transition (not merely because `config`/`setConfig` are fresh
  // references every render, which they always are).
  useEffect(() => {
    if (!coordinates || loading) return
    const state: WeatherLocationStatus['state'] = hourly.length === 0 ? 'error' : stale ? 'stale' : 'live'
    const key = weatherLocationKey(coordinates.lat, coordinates.lon)
    if (config.weather.locationStatus[key]?.state === state) return
    setConfig((current) => ({
      ...current,
      weather: { ...current.weather, locationStatus: { ...current.weather.locationStatus, [key]: { state, updatedAt: Date.now() } } },
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `config`/`setConfig` intentionally excluded: `useExtensionsConfig` re-wraps both fresh every render, so including them would re-run this on every render instead of only on a genuine fetch-outcome change.
  }, [coordinates?.lat, coordinates?.lon, loading, stale, hourly.length])

  if (!coordinates) {
    return (
      <div className="weather-slide weather-slide--empty">
        <p>{t('admin.screens.weatherNotConfiguredLabel')}</p>
      </div>
    )
  }

  return (
    <div className="weather-slide">
      <ul className="weather-slide__list">
        {hourly.map((hour) => (
          <li key={hour.time} className="weather-slide__item">
            <span className="weather-slide__time">{formatClockTime(new Date(hour.time), language, clockFormat)}</span>
            <span className="weather-slide__icon" aria-hidden="true">
              {weatherSymbolToEmoji(hour.symbolCode)}
            </span>
            <span className="weather-slide__temp">{Math.round(hour.temperatureC)}°</span>
            {(showWind || showHumidity || showPrecipitationProbability || showUvIndex || showPressure) && (
              <span className="weather-slide__details">
                {showWind && hour.windSpeedMs !== undefined && <span>{t('admin.screens.weatherWindValue', { value: Math.round(hour.windSpeedMs) })}</span>}
                {showHumidity && hour.humidityPercent !== undefined && <span>{t('admin.screens.weatherHumidityValue', { value: Math.round(hour.humidityPercent) })}</span>}
                {showPrecipitationProbability && hour.precipitationProbabilityPercent !== undefined && (
                  <span>{t('admin.screens.weatherPrecipitationProbabilityValue', { value: Math.round(hour.precipitationProbabilityPercent) })}</span>
                )}
                {showUvIndex && hour.uvIndex !== undefined && <span>{t('admin.screens.weatherUvIndexValue', { value: Math.round(hour.uvIndex) })}</span>}
                {showPressure && hour.pressureHpa !== undefined && <span>{t('admin.screens.weatherPressureValue', { value: Math.round(hour.pressureHpa) })}</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
      {stale && <p className="weather-slide__stale-notice">{t('admin.screens.weatherStaleNotice')}</p>}
    </div>
  )
}
