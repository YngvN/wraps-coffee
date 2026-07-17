import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { YrLogo } from '../../components'
import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useLanguage } from '../../i18n'
import type { ExtensionsConfig, WeatherHour, WeatherLocationStatus } from '../../types/extensions'
import { DEFAULT_WEATHER_FORECAST_HOURS } from '../../types/screen'
import { formatClockTime } from '../../utils/clockFormat'
import { weatherLocationKey } from '../../utils/weatherLocationKey'
import { weatherSymbolToEmoji } from '../../utils/weatherSymbols'
import './WeatherSlide.scss'

// Each hour card slides in from the right and out to the left, unlike
// `TransitSlide`'s split leading/trailing halves — a weather hour is one
// self-contained card, not two pieces moving in opposite directions, so a
// single set of variants directly on the `motion.li` (rather than a nested
// `motion.span`) is all this needs. `layout="position"` (not plain `layout`
// — see `TransitSlide.tsx`'s own comment on why) animates the remaining
// cards sliding over to close the gap once one leaves/before one arrives.
const weatherItemVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
}
const weatherItemTransition = { duration: 0.4, ease: 'easeInOut' as const }

/**
 * Decouples what's actually rendered (`displayed`) from the raw incoming
 * hourly window (`target`) so the hour that's just passed and the new hour
 * that just entered the forecast window never animate in the same step —
 * the passed hour always slides fully off (left) and the rest have shifted
 * over to fill the gap *before* the new hour slides in (from the right),
 * never all three at once. Opposite priority from `TransitSlide`'s own
 * sequencer (which adds before removing) since a departures board reads
 * better introducing the new row before dropping the old one, while an
 * hour-by-hour timeline reads better retiring the passed hour first.
 * `resetKey` forces an instant, unstaged replace instead (e.g. switching to
 * a whole different location, or changing how many hours are shown) —
 * there's nothing meaningful to stage a card-by-card transition from in
 * that case, just stale data to discard.
 */
function useSequencedHours(target: WeatherHour[], resetKey: string): WeatherHour[] {
  const [displayed, setDisplayed] = useState<WeatherHour[]>([])
  const [lastResetKey, setLastResetKey] = useState(resetKey)

  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setDisplayed(target)
  } else if (displayed.length === 0 && target.length > 0) {
    // Nothing on screen yet (first load) — reveal the whole target window
    // directly rather than staging it in one card at a time.
    setDisplayed(target)
  }

  const displayedKeys = new Set(displayed.map((hour) => hour.time))
  const targetKeys = new Set(target.map((hour) => hour.time))
  const pendingAddition = target.some((hour) => !displayedKeys.has(hour.time))
  const topIsStale = displayed.length > 0 && !targetKeys.has(displayed[0].time)

  useEffect(() => {
    if (!pendingAddition && !topIsStale) return

    // Matches `weatherItemTransition`'s own 0.4s duration plus a little
    // buffer, so one card's slide finishes before the next one starts.
    const timeout = setTimeout(() => {
      setDisplayed((current) => {
        const currentTargetKeys = new Set(target.map((hour) => hour.time))
        // The passed hour always retires before the new one arrives (see
        // the doc comment above) — checked first, unconditionally, unlike
        // `TransitSlide`'s own capacity-cap dance for the opposite priority.
        if (current.length > 0 && !currentTargetKeys.has(current[0].time)) return current.slice(1)
        const currentKeys = new Set(current.map((hour) => hour.time))
        const nextAddition = target.find((hour) => !currentKeys.has(hour.time))
        if (nextAddition) return [...current, nextAddition]
        return current
      })
    }, 500)
    return () => clearTimeout(timeout)
    // `displayed` is a real dependency, not an incidental one: each step's
    // `setDisplayed` call needs this effect to re-fire afterward so it can
    // schedule the *next* step — without it, only the very first card would
    // ever animate away/in, and the rest would stall in place forever.
  }, [target, displayed, pendingAddition, topIsStale])

  return displayed
}

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
  /** Overrides the pane's own background/font/text colors with a Yr look-alike theme. Falls back to `true`. */
  useBrandTheme?: boolean
  /** Shows the Yr logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
  showBrandLogo?: boolean
}

/** Fullscreen rendering of an hourly forecast for one of the cafe's configured locations (see the admin's Integrations tab), for a screen display's "weather" slot. */
export function WeatherSlide({
  locationId,
  forecastHours,
  showWind,
  showHumidity,
  showPrecipitationProbability,
  showUvIndex,
  showPressure,
  useBrandTheme,
  showBrandLogo,
}: WeatherSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [config, setConfig] = useExtensionsConfig()
  const coordinates = resolveWeatherCoordinates(config, locationId)
  const { hourly, loading, stale } = useWeatherForecast(coordinates?.lat, coordinates?.lon, forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS)
  // Changing location or how many hours are shown isn't the natural
  // hour-by-hour churn `useSequencedHours` staggers — it's a wholesale
  // replacement, so it's included in the reset key to bypass staging.
  const displayedHours = useSequencedHours(hourly, `${coordinates?.lat ?? ''},${coordinates?.lon ?? ''}:${forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS}`)

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

  if (!loading && displayedHours.length === 0) {
    return (
      <div className="weather-slide weather-slide--empty">
        <p>{t('admin.screens.weatherNoDataLabel')}</p>
      </div>
    )
  }

  const branded = useBrandTheme ?? true

  return (
    <div className={`weather-slide${branded ? ' weather-slide--branded-yr' : ''}`}>
      {/* White, not `YrLogo`'s own default blue fill — the branded theme's background is now Yr's own blue (see `WeatherSlide.scss`), so the logo needs to be the light-on-dark variant to stay visible against it. */}
      {branded && (showBrandLogo ?? true) && <YrLogo fill="#ffffff" className="weather-slide__brand-logo" />}
      <ul className="weather-slide__list">
        <AnimatePresence initial={false} mode="popLayout">
          {displayedHours.map((hour, index) => (
            <motion.li
              key={hour.time}
              layout="position"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={weatherItemVariants}
              transition={weatherItemTransition}
              className="weather-slide__item"
            >
              {/* The leading card is always the current hour (the list is time-sorted, oldest-first) — reads better as "Now" than repeating the clock's own current hour back at it. Naturally lands on whichever card the sequencer has just reflowed into position 0, right as `useSequencedHours` retires the previous one. */}
              <span className="weather-slide__time">{index === 0 ? t('admin.screens.weatherNowLabel') : formatClockTime(new Date(hour.time), language, clockFormat)}</span>
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
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {stale && <p className="weather-slide__stale-notice">{t('admin.screens.weatherStaleNotice')}</p>}
    </div>
  )
}
