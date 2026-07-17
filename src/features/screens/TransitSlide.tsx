import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { FetchedLogo } from '../../components'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useTransitDepartures } from '../../hooks/useTransitDepartures'
import { useLanguage } from '../../i18n'
import { DEFAULT_TRANSIT_DEPARTURE_COUNT } from '../../types/screen'
import type { DepartureInfo } from '../../types/extensions'
import { TransitModeIcon } from './TransitModeIcon'
import './TransitSlide.scss'

interface TransitSlideProps {
  /** Which brand's own stop pool `stopId` (below) refers to — `ExtensionsConfig['transit']['selectedStops']` for `'ruter'`, `ExtensionsConfig['entur']['selectedStops']` for `'entur'`. Falls back to `'ruter'` for panes saved before this field existed. */
  brand?: 'ruter' | 'entur'
  /** The stop to show departures for, referencing `brand`'s own stop pool — falls back to the first available stop in that same pool if unset or no longer among the configured ones (e.g. removed from Extensions after this slide was set up). */
  stopId?: string
  /** How many upcoming departures the list shows. Falls back to `DEFAULT_TRANSIT_DEPARTURE_COUNT`. */
  departureCount?: number
  /** Show each departure's quay/platform, when Entur reports one. Falls back to `false`. */
  showPlatform?: boolean
  /** Show the line's full name instead of just its public code. Falls back to `false`. */
  showLineName?: boolean
  /** Hide schedule-only departures, keeping only `realtime: true` ones. Falls back to `false`. */
  realtimeOnly?: boolean
  /** Transport modes to include — empty/unset means every mode at the stop is shown. */
  modeFilter?: string[]
  /** Overrides the pane's own background/font/text colors with a look-alike of `brand`. Falls back to `true`. */
  useBrandTheme?: boolean
  /** Shows `brand`'s own logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
  showBrandLogo?: boolean
}

// A departure row splits into two halves that slide out to opposite edges
// on the way in/out (new departures arriving, expired ones dropping off the
// end) — icon/line/destination to the left, platform/time to the right —
// rather than the row just fading in place or the whole `<li>` moving as
// one block. `variants` (rather than each `motion.span` getting its own
// `initial`/`animate`/`exit`) so both halves pick up the parent `motion.li`'s
// own animation state automatically; only the `<li>` needs `initial`/
// `animate`/`exit`. Each half also gets `layout="position"` (see below, on
// `.transit-slide__leading`/`__trailing` themselves — `<li>` is `display:
// contents` in `TransitSlide.scss`, so it has no box of its own to apply
// `layout` to) so that when a departure above a row disappears, the row
// smoothly slides *up* into its new spot instead of snapping there — plain
// `layout` (not `"position"`) also interpolates *size* via an inverse-scale
// transform (Framer Motion's FLIP technique), which once visually desynced
// a grid column's transform-scaled size from its real layout size and
// overflowed the row; `"position"` animates only the x/y shift, sidestepping
// that entirely, and is all a same-width column reflowing upward needs.
const transitLeadingVariants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
}
const transitTrailingVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: '100%', opacity: 0 },
}
const transitItemTransition = { duration: 0.4, ease: 'easeInOut' as const }

/** A departure's own identity for diffing — matches the `key` given to its `motion.li` further down. */
function departureKey(departure: DepartureInfo) {
  return `${departure.line}-${departure.destination}-${departure.expectedDepartureTime}`
}

/** Ascending by actual departure time — a stale/expired departure's own time is necessarily in the past, so it always sorts to the front (`displayed[0]`, the "top" `useSequencedDepartures` removes from) without needing its own special case. */
function byExpectedDepartureTime(a: DepartureInfo, b: DepartureInfo) {
  return new Date(a.expectedDepartureTime).getTime() - new Date(b.expectedDepartureTime).getTime()
}

/**
 * Decouples what's actually rendered (`displayed`) from the raw incoming
 * list (`target`, straight off the poll) so a departure expiring and a new
 * one becoming available never animate in the same step — only ever one
 * row enters or leaves `displayed` at a time, new ones inserted in their
 * correct sorted position before the stale top one is dropped, the way a
 * real departure board updates (never several rows reshuffling in a single
 * jump). `resetKey` forces an instant, unstaged replace instead (e.g.
 * switching to a whole different stop) — there's nothing meaningful to
 * stage a row-by-row transition from in that case, just stale data to
 * discard.
 */
function useSequencedDepartures(target: DepartureInfo[], resetKey: string): DepartureInfo[] {
  const [displayed, setDisplayed] = useState<DepartureInfo[]>([])
  const [lastResetKey, setLastResetKey] = useState(resetKey)

  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setDisplayed([...target].sort(byExpectedDepartureTime))
  } else if (displayed.length === 0 && target.length > 0) {
    // Nothing on screen yet (first load) — reveal the whole target list
    // directly rather than staging it in one row at a time.
    setDisplayed([...target].sort(byExpectedDepartureTime))
  }

  const displayedKeys = new Set(displayed.map(departureKey))
  const targetKeys = new Set(target.map(departureKey))
  const pendingAddition = target.some((departure) => !displayedKeys.has(departureKey(departure)))
  const topIsStale = displayed.length > 0 && !targetKeys.has(departureKey(displayed[0]))

  // A real-time update can change a departure's own `expectedDepartureTime`
  // (now running earlier than a row still above it) even while an unrelated
  // addition/removal is *also* pending elsewhere in the list — re-sort
  // whenever the order doesn't already match, regardless of what else is
  // pending, rather than only once everything else has settled (that left
  // a mid-churn list stuck out of order far more often than intended).
  // `layout="position"` on each row (`TransitSlide.tsx`) animates the
  // resulting swap as a smooth slide instead of a jump.
  const sortedDisplayed = [...displayed].sort(byExpectedDepartureTime)
  if (sortedDisplayed.some((departure, index) => departureKey(departure) !== departureKey(displayed[index]))) setDisplayed(sortedDisplayed)

  useEffect(() => {
    if (!pendingAddition && !topIsStale) return

    // Matches `transitItemTransition`'s own 0.4s duration plus a little
    // buffer, so one row's slide finishes before the next one starts.
    const timeout = setTimeout(() => {
      setDisplayed((current) => {
        const currentTargetKeys = new Set(target.map(departureKey))
        // Already one row over the configured count — a prior step added a
        // new row before its matching stale one had a chance to leave yet.
        // Until that clears, the *next* step must be a removal, never
        // another addition, or a steady stream of arrivals could keep
        // cutting in line ahead of the backlog and grow the list without
        // bound instead of holding at +1.
        const currentIsOverCapacity = current.length > target.length
        if (!currentIsOverCapacity) {
          const currentKeys = new Set(current.map(departureKey))
          const nextAddition = target.find((departure) => !currentKeys.has(departureKey(departure)))
          if (nextAddition) return [...current, nextAddition].sort(byExpectedDepartureTime)
        }
        if (current.length > 0 && !currentTargetKeys.has(departureKey(current[0]))) return current.slice(1)
        return current
      })
    }, 500)
    return () => clearTimeout(timeout)
    // `displayed` is a real dependency, not an incidental one: each step's
    // `setDisplayed` call needs this effect to re-fire afterward so it can
    // schedule the *next* step — without it, only the very first row would
    // ever animate away/in, and the rest would stall in place forever.
  }, [target, displayed, pendingAddition, topIsStale])

  return displayed
}

/** Fullscreen rendering of real-time departures from one of the cafe's configured nearby stops (see the admin's Integrations tab), for a screen display's "transit" slot. */
export function TransitSlide({ brand, stopId, departureCount, showPlatform, showLineName, realtimeOnly, modeFilter, useBrandTheme, showBrandLogo }: TransitSlideProps) {
  const { t } = useLanguage()
  const [config] = useExtensionsConfig()
  const resolvedBrand = brand ?? 'ruter'
  const selectedStops = resolvedBrand === 'entur' ? config.entur.selectedStops : config.transit.selectedStops
  const effectiveStopId = stopId && selectedStops.some((stop) => stop.id === stopId) ? stopId : selectedStops[0]?.id
  const { stopName, departures: fetchedDepartures, loading, stale } = useTransitDepartures(effectiveStopId, departureCount ?? DEFAULT_TRANSIT_DEPARTURE_COUNT)
  // Memoized so its reference only actually changes when the underlying
  // data or filters do — `useSequencedDepartures`'s own effect depends on
  // this array, and a fresh `.filter()` result every render (e.g. from the
  // unrelated 30s `now` tick below) would otherwise reset its staging timer
  // before it ever gets to fire.
  const targetDepartures = useMemo(
    () => fetchedDepartures.filter((departure) => (!realtimeOnly || departure.realtime) && (!modeFilter?.length || modeFilter.includes(departure.mode))),
    [fetchedDepartures, realtimeOnly, modeFilter],
  )
  const departures = useSequencedDepartures(targetDepartures, effectiveStopId ?? '')
  const branded = useBrandTheme ?? true

  /** `Date.now()` can't be called directly during render (an impure call) — ticking this every 30s keeps each departure's "in X min" reasonably fresh between refetches without reading the clock at render time. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!effectiveStopId) {
    return (
      <div className="transit-slide transit-slide--empty">
        <p>{t('admin.screens.transitNoStopsConfiguredLabel')}</p>
      </div>
    )
  }

  return (
    <div className={`transit-slide${branded ? ` transit-slide--branded-${resolvedBrand}` : ''}`}>
      {branded && (showBrandLogo ?? true) && <FetchedLogo slug={resolvedBrand} label={resolvedBrand === 'ruter' ? 'Ruter#' : 'Entur'} className="transit-slide__brand-logo" />}
      <h1>{stopName ?? selectedStops.find((stop) => stop.id === effectiveStopId)?.name}</h1>
      {departures.length === 0 && !loading ? (
        <p className="transit-slide__empty">{t('admin.screens.transitNoDeparturesLabel')}</p>
      ) : (
        <ul className="transit-slide__list">
          <AnimatePresence initial={false} mode="popLayout">
            {departures.map((departure) => {
              const minutesUntil = Math.max(0, Math.round((new Date(departure.expectedDepartureTime).getTime() - now) / 60_000))
              return (
                <motion.li
                  key={departureKey(departure)}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={`transit-slide__item${departure.cancelled ? ' transit-slide__item--cancelled' : ''}`}
                >
                  <motion.span layout="position" className="transit-slide__leading" variants={transitLeadingVariants} transition={transitItemTransition}>
                    <span className="transit-slide__mode-icon-wrap">
                      <TransitModeIcon mode={departure.mode} className="transit-slide__mode-icon" />
                      {departure.realtime && <span className="transit-slide__realtime-dot" title={t('admin.screens.transitRealtimeDotTitle')} />}
                    </span>
                    <span className="transit-slide__line">{departure.line}</span>
                    <span className="transit-slide__destination">
                      {departure.destination}
                      {showLineName && departure.lineName && <span className="transit-slide__line-name">{departure.lineName}</span>}
                    </span>
                  </motion.span>
                  <motion.span layout="position" className="transit-slide__trailing" variants={transitTrailingVariants} transition={transitItemTransition}>
                    {showPlatform && (
                      <span className="transit-slide__platform">{departure.platform && t('admin.screens.transitPlatformValue', { platform: departure.platform })}</span>
                    )}
                    <span className="transit-slide__time">{departure.cancelled ? t('admin.screens.transitCancelledLabel') : t('admin.screens.transitMinutesLabel', { minutes: minutesUntil })}</span>
                  </motion.span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
      {stale && <p className="transit-slide__stale-notice">{t('admin.screens.transitStaleNotice')}</p>}
    </div>
  )
}
