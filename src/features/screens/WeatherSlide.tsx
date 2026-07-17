import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useLanguage } from '../../i18n'
import { DEFAULT_WEATHER_FORECAST_HOURS } from '../../types/screen'
import { formatClockTime } from '../../utils/clockFormat'
import { weatherSymbolToEmoji } from '../../utils/weatherSymbols'
import './WeatherSlide.scss'

interface WeatherSlideProps {
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

/** Fullscreen rendering of an hourly forecast for the cafe's own address (see the admin's Integrations tab), for a screen display's "weather" slot. */
export function WeatherSlide({ forecastHours, showWind, showHumidity, showPrecipitationProbability, showUvIndex, showPressure }: WeatherSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [config] = useExtensionsConfig()
  const coordinates = config.addressLookup?.coordinates
  const { hourly } = useWeatherForecast(coordinates?.lat, coordinates?.lon, forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS)

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
    </div>
  )
}
