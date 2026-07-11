import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useLanguage } from '../../i18n'
import { formatClockTime } from '../../utils/clockFormat'
import { weatherSymbolToEmoji } from '../../utils/weatherSymbols'
import './WeatherSlide.scss'

/** Fullscreen rendering of an hourly forecast for the cafe's own address (see the admin's Extensions tab), for a screen display's "weather" slot. */
export function WeatherSlide() {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [config] = useExtensionsConfig()
  const coordinates = config.addressLookup?.coordinates
  const { hourly } = useWeatherForecast(coordinates?.lat, coordinates?.lon, config.weather.forecastHours)

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
          </li>
        ))}
      </ul>
    </div>
  )
}
