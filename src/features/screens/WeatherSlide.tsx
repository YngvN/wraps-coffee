import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { YrLogo } from '../../components'
import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useIntegrationsConfig } from '../../hooks/useIntegrationsConfig'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useLanguage } from '../../i18n'
import type { IntegrationsConfig, WeatherHour, WeatherLocationStatus } from '../../types/integrations'
import { DEFAULT_WEATHER_FORECAST_HOURS, type WeatherIconPack } from '../../types/screen'
import { formatClockTime } from '../../utils/clockFormat'
import { weatherLocationKey } from '../../utils/weatherLocationKey'
import { WeatherSymbolIcon } from './WeatherSymbolIcon'
import './WeatherSlide.scss'

// Each hour card slides in from the right and out to the left, unlike
// `TransitSlide`'s split leading/trailing halves — a weather hour is one
// self-contained card, not two pieces moving in opposite directions, so a
// single set of variants directly on the `motion.li` (rather than a nested
// `motion.span`) is all this needs. `layout="position"` (not plain `layout`
// — see `TransitSlide.tsx`'s own comment on why) animates the remaining
// cards sliding over to close the gap once one leaves/before one arrives.
// Used in "horizontal" mode (see `useIsVerticalPane`) — hours run left to
// right, so a passing hour naturally exits toward the left and a new one
// enters from the right.
const weatherItemVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
}
// "Vertical" mode's own equivalent — hours stack top to bottom there, so
// sliding along `y` (rather than `x`) is what reads as "the next one arriving
// underneath, the passed one leaving off the top" instead of a sideways slide
// cutting across an otherwise vertically-flowing list.
const weatherRowVariants = {
  hidden: { y: '100%', opacity: 0 },
  visible: { y: 0, opacity: 1 },
  exit: { y: '-100%', opacity: 0 },
}
const weatherItemTransition = { duration: 0.4, ease: 'easeInOut' as const }

/** Below this pane aspect ratio (width ÷ height), the hourly forecast switches from a horizontal strip of hour-columns (with a shared row-label legend at the start — see `.weather-slide__list`'s own doc comment in `WeatherSlide.scss`) to a vertical list of hour-rows (with a shared column-header row on top instead, the same shape `TransitSlide` already uses) — a narrow/portrait pane has no room to add more side-by-side hour columns without either squeezing each one unreadably thin or scrolling sideways, while a plain vertical list is exactly what that shape already reads naturally. `1` (a perfect square) rather than something more forgiving like `TransitSlide`'s own `1.4` threshold — unlike a departures board's column count (which only ever *adds* columns as a pane gets wider), this is a binary either/or layout switch, so it should only kick in once a pane genuinely reads as "vertical rectangle," not merely as "not quite widescreen." */
const VERTICAL_ASPECT_RATIO_THRESHOLD = 1

/** Tracks whether `containerRef`'s own pane currently reads as a vertical rectangle (see `VERTICAL_ASPECT_RATIO_THRESHOLD`) via a plain `ResizeObserver`, the same technique `TransitSlide`'s own `useColumnCount` uses to react to the pane's own shape rather than a fixed breakpoint. */
function useIsVerticalPane(containerRef: React.RefObject<HTMLElement | null>): boolean {
  const [isVertical, setIsVertical] = useState(false)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) setIsVertical(width / height < VERTICAL_ASPECT_RATIO_THRESHOLD)
    })
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `containerRef` is a stable ref object; only its `.current` (read inside the effect, not a dependency) can meaningfully change.
  }, [])
  return isVertical
}

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
function resolveWeatherCoordinates(config: IntegrationsConfig, locationId: string | undefined) {
  const customLocation = locationId ? config.weather.locations.find((location) => location.id === locationId) : undefined
  if (customLocation) return customLocation.coordinates ?? undefined
  if (config.weather.useStoreLocation) return config.addressLookup?.coordinates
  return config.weather.locations[0]?.coordinates
}

interface WeatherSlideProps {
  /** Which of `IntegrationsConfig['weather']['locations']` to show, by id — see `resolveWeatherCoordinates`. */
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
  /** Which icon set each hour's own weather symbol is drawn from — see `WeatherIconPack`. Falls back to `DEFAULT_WEATHER_ICON_PACK`. */
  iconPack?: WeatherIconPack
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
  iconPack,
  useBrandTheme,
  showBrandLogo,
}: WeatherSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [config, setConfig] = useIntegrationsConfig()
  const coordinates = resolveWeatherCoordinates(config, locationId)
  const { hourly, todayLowC, todayHighC, loading, stale } = useWeatherForecast(coordinates?.lat, coordinates?.lon, forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS)
  // Changing location or how many hours are shown isn't the natural
  // hour-by-hour churn `useSequencedHours` staggers — it's a wholesale
  // replacement, so it's included in the reset key to bypass staging.
  const displayedHours = useSequencedHours(hourly, `${coordinates?.lat ?? ''},${coordinates?.lon ?? ''}:${forecastHours ?? DEFAULT_WEATHER_FORECAST_HOURS}`)

  // Reports this location's fetch outcome back into the synced config, so the
  // Integrations page's own status dot (a different device/browser) can show
  // it — see `IntegrationsConfig['weather']['locationStatus']`. Only fires on a
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `config`/`setConfig` intentionally excluded: `useIntegrationsConfig` re-wraps both fresh every render, so including them would re-run this on every render instead of only on a genuine fetch-outcome change.
  }, [coordinates?.lat, coordinates?.lon, loading, stale, hourly.length])

  // Measures the pane's own shape (see `useIsVerticalPane`) — same "declare
  // the ref/hook before any early return, only actually attach the ref in
  // the full-render path below" posture as `TransitSlide`'s own `paneRef`/
  // `useColumnCount`.
  const paneRef = useRef<HTMLDivElement>(null)
  const isVertical = useIsVerticalPane(paneRef)

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
  // Time + icon + temp are always shown; each toggled-on detail adds one
  // more track on top of those 3 — the shared row count in horizontal mode
  // (see `.weather-slide__list`'s own doc comment in `WeatherSlide.scss`),
  // or the shared column count in vertical mode. Computed once and fed to
  // whichever grid actually renders as a CSS custom property
  // (`--weather-track-count` below) rather than hardcoded in
  // `WeatherSlide.scss`, since `repeat(<n>, auto)` needs a concrete count —
  // unlike `TransitSlide`'s own fixed column count, this one genuinely
  // varies with which details are on. Every `grid-row`/`grid-column: 1 / -1`
  // subgrid below depends on this explicit count to resolve `-1` against —
  // without it, there's no explicit grid to anchor "last track" to, and
  // every track collapses into one.
  const trackCount = 3 + [showWind, showHumidity, showPrecipitationProbability, showUvIndex, showPressure].filter(Boolean).length

  /** One hour's own field values, in a fixed order shared by both orientations' own per-hour element (`.weather-slide__item` in horizontal mode, `.weather-slide__row` in vertical) — time, icon, temp always; each detail only when its own toggle is on, matching `renderDetailLabels`'s own conditions exactly (subgrid alignment is purely positional, so the two ever drifting out of sync would misalign every label against the wrong value). */
  const renderHourFields = (hour: WeatherHour, index: number): ReactNode => (
    <>
      {/* The leading card is always the current hour (the list is time-sorted, oldest-first) — reads better as "Now" than repeating the clock's own current hour back at it. Naturally lands on whichever card the sequencer has just reflowed into position 0, right as `useSequencedHours` retires the previous one. */}
      <span className="weather-slide__time">{index === 0 ? t('admin.screens.weatherNowLabel') : formatClockTime(new Date(hour.time), language, clockFormat)}</span>
      <WeatherSymbolIcon symbolCode={hour.symbolCode} pack={iconPack} className="weather-slide__icon" />
      <span className="weather-slide__temp">{Math.round(hour.temperatureC)}°</span>
      {showWind && <span className="weather-slide__value">{hour.windSpeedMs !== undefined && t('admin.screens.weatherWindShortValue', { value: Math.round(hour.windSpeedMs) })}</span>}
      {showHumidity && <span className="weather-slide__value">{hour.humidityPercent !== undefined && t('admin.screens.weatherHumidityShortValue', { value: Math.round(hour.humidityPercent) })}</span>}
      {showPrecipitationProbability && (
        <span className="weather-slide__value">
          {hour.precipitationProbabilityPercent !== undefined && t('admin.screens.weatherPrecipitationProbabilityShortValue', { value: Math.round(hour.precipitationProbabilityPercent) })}
        </span>
      )}
      {showUvIndex && <span className="weather-slide__value">{hour.uvIndex !== undefined && t('admin.screens.weatherUvIndexShortValue', { value: Math.round(hour.uvIndex) })}</span>}
      {showPressure && <span className="weather-slide__value">{hour.pressureHpa !== undefined && t('admin.screens.weatherPressureShortValue', { value: Math.round(hour.pressureHpa) })}</span>}
    </>
  )

  /** The shared legend's own labels — 3 empty spacers (time/icon/temp need no label, same posture `TransitSlide`'s own column header takes for its unlabeled mode-icon column) then one label per toggled-on detail, in the exact same order/conditions as `renderHourFields` above. `labelClassName` is the only thing that differs between the two orientations' own legend element — the row-label column in horizontal mode, the column-header row in vertical — since which element wraps these and how *that* positions them is what actually differs, not the labels themselves. */
  const renderDetailLabels = (labelClassName: string): ReactNode => (
    <>
      <span />
      <span />
      <span />
      {showWind && <span className={labelClassName}>{t('admin.screens.weatherWindLabel')}</span>}
      {showHumidity && <span className={labelClassName}>{t('admin.screens.weatherHumidityLabel')}</span>}
      {showPrecipitationProbability && <span className={labelClassName}>{t('admin.screens.weatherPrecipitationProbabilityLabel')}</span>}
      {showUvIndex && <span className={labelClassName}>{t('admin.screens.weatherUvIndexLabel')}</span>}
      {showPressure && <span className={labelClassName}>{t('admin.screens.weatherPressureLabel')}</span>}
    </>
  )

  const trackCountStyle = { '--weather-track-count': trackCount } as CSSProperties

  return (
    <div ref={paneRef} className={`weather-slide${branded ? ' weather-slide--branded-yr' : ''}${isVertical ? ' weather-slide--vertical' : ''}`}>
      {/* White, not `YrLogo`'s own default blue fill — the branded theme's background is now Yr's own blue (see `WeatherSlide.scss`), so the logo needs to be the light-on-dark variant to stay visible against it. */}
      {branded && (showBrandLogo ?? true) && <YrLogo fill="#ffffff" className="weather-slide__brand-logo" />}
      <div className="weather-slide__content">
        {isVertical ? (
          // Vertical mode: one row per hour, sharing column tracks via
          // `subgrid` — the exact same shape `TransitSlide`'s own
          // `.transit-slide__column` uses (a header row up top, one row per
          // item below it), not a coincidence: a narrow/portrait pane and a
          // departures board both read best as a plain top-to-bottom list.
          <ul className="weather-slide__list weather-slide__list--vertical" style={trackCountStyle}>
            <li className="weather-slide__column-header" aria-hidden="true">
              {renderDetailLabels('weather-slide__column-header-label')}
            </li>
            <AnimatePresence initial={false} mode="popLayout">
              {displayedHours.map((hour, index) => (
                <motion.li
                  key={hour.time}
                  layout="position"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={weatherRowVariants}
                  transition={weatherItemTransition}
                  className="weather-slide__row"
                >
                  {renderHourFields(hour, index)}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          // Horizontal mode (the default): one column per hour, sharing row
          // tracks via `subgrid` — the transpose of the vertical shape above
          // (there, one row per hour sharing column tracks; here, one column
          // per hour sharing row tracks), with a shared row-label legend at
          // the *start* taking the header row's own place.
          <ul className="weather-slide__list weather-slide__list--horizontal" style={trackCountStyle}>
            <li className="weather-slide__row-labels" aria-hidden="true">{renderDetailLabels('weather-slide__row-label')}</li>
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
                  {renderHourFields(hour, index)}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {/* Today's overall low/high (see `useWeatherForecast`), not any one hour's own reading — numbers only, no "L"/"H" labels, a vertical line between them. */}
        {todayLowC !== undefined && todayHighC !== undefined && (
          <p className="weather-slide__low-high">
            {Math.round(todayLowC)}° | {Math.round(todayHighC)}°
          </p>
        )}
      </div>
      {stale && <p className="weather-slide__stale-notice">{t('admin.screens.weatherStaleNotice')}</p>}
    </div>
  )
}
