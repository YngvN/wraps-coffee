import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
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

/**
 * How many columns the departure list gets, by the pane's own aspect ratio
 * (width ÷ height) — a near-square or portrait pane (below a 4:3-ish 1.4)
 * stays a single column; a 16:9-ish pane and wider gets 2; a genuinely
 * ultra-wide one gets 3. Deliberately coarse, discrete tiers rather than a
 * continuous pixel-width measurement — a pane's own *shape*, not its exact
 * size, is what actually determines whether a second column reads as
 * natural or cramped, and tiers avoid the column count flickering between
 * 1 and 2 right around one arbitrary pixel boundary.
 */
function columnCountForAspectRatio(aspectRatio: number): number {
  if (aspectRatio < 1.4) return 1
  if (aspectRatio < 3) return 2
  return 3
}

// 1 or 2 columns: a departure row slides in/out sideways rather than fading
// in place. With a single column, one row splits into two halves that slide
// to *opposite* edges — icon/line/destination to the left, platform/time to
// the right (`transitLeadingVariants`/`transitTrailingVariants` on two
// separate `motion.span`s within one row, see the render logic further
// down) — since a lone column has the full pane's own width for each half
// to travel across. With 2 columns, there's only half that width each, so
// instead each column's own rows slide as *one* whole unit, toward
// whichever edge that column is nearest — the left column's own rows use
// `transitLeadingVariants` (sliding to/from the left), the right column's
// own `transitTrailingVariants` (to/from the right) — mirroring outward
// from the gap between the two columns instead of either one crossing over
// the other's own space. 3+ columns switch to a different animation
// entirely (`transitRowVariants` below) — there's no longer a nearby edge
// for a middle column's own rows to sensibly slide toward.
//
// `variants` (rather than each animated element getting its own
// `initial`/`animate`/`exit`) so everything picks up its own parent's
// animation state automatically; only the outermost animated element (the
// `motion.li`, in 2-column mode; a `motion.span` half, in single-column
// mode) needs `initial`/`animate`/`exit`. Each also gets `layout="position"`
// so that when a departure above a row disappears, the row smoothly slides
// *up* into its new spot instead of snapping there — plain `layout` (not
// `"position"`) also interpolates *size* via an inverse-scale transform
// (Framer Motion's FLIP technique), which once visually desynced a shared
// grid column's transform-scaled size from its real layout size and
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

// 3+ columns: a left/right slide would visually cross over a neighboring
// column's own content (there's no longer a full pane's width, or even half
// of it, for either half to travel across), so a row instead fades in/out
// while its own `max-height` collapses/expands — contained entirely within
// its own column, never spilling into the one next to it. `4em` is a
// generous upper bound (comfortably taller than one row ever actually
// needs, at any text size) rather than a measured value — `max-height`
// only needs to reach *at least* the row's real height for the
// collapse/expand to read correctly; it doesn't need to match it exactly.
// Deliberately no `layout` prop beyond `"position"` for reordering within a
// column (see its own use below) — the collapse/expand is a real box
// shrinking/growing in normal document flow (this AnimatePresence is *not*
// `mode="popLayout"` here, see below), so the rows below it already shift
// up/down smoothly for free, as an ordinary consequence of the browser
// reflowing around a box whose own height is changing — no extra animation
// needed to make that part happen.
const transitRowVariants = {
  hidden: { opacity: 0, maxHeight: 0 },
  visible: { opacity: 1, maxHeight: '4em' },
  exit: { opacity: 0, maxHeight: 0 },
}
const transitRowTransition = { duration: 0.4, ease: 'easeInOut' as const }

/** How long one row's own hide/reveal animation takes, plus a little buffer — every staged, one-row-at-a-time transition below (`useSequencedDepartures`'s own addition/removal steps, `useSequencedColumns`'s own column-reassignment steps) waits this long before moving on to its next step, so one row's own animation always finishes before the next one starts instead of overlapping it. */
const SEQUENCE_STEP_MS = 500

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

/**
 * How many columns the departure list currently gets — from the pane's own
 * aspect ratio (see `columnCountForAspectRatio`), tracked via a plain
 * `ResizeObserver` on the pane itself. Not CSS `column-width` (that's a
 * fine technique for independently-flowing content, but each column here
 * needs its own aligned header row — `.transit-slide__column-header` —
 * which requires actually knowing, in JS, which departures landed in which
 * column, not just letting the browser reflow them autonomously).
 */
function useColumnCount(containerRef: React.RefObject<HTMLElement | null>): number {
  const [columnCount, setColumnCount] = useState(1)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) setColumnCount(columnCountForAspectRatio(width / height))
    })
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `containerRef` is a stable ref object; only its `.current` (read inside the effect, not a dependency) can meaningfully change.
  }, [])
  return columnCount
}

/** Splits `items` into `columnCount` groups, filling the first completely before the next — matches `column-fill: auto`'s own "top-to-bottom, then next column" order (see the `TransitSlide.scss` history this replaced), so a column-count change doesn't reshuffle which departures land near the top. */
function chunkIntoColumns<T>(items: T[], columnCount: number): T[][] {
  if (columnCount <= 1) return items.length > 0 ? [items] : []
  const perColumn = Math.ceil(items.length / columnCount)
  const columns: T[][] = []
  for (let start = 0; start < items.length; start += perColumn) columns.push(items.slice(start, start + perColumn))
  return columns
}

/** Which column each departure *should* currently be in, per a fresh `chunkIntoColumns` pass — recomputed from scratch every time `departures`/`columnCount` change, since there's no cheaper way to know where a boundary departure belongs than just re-chunking. Keyed by `departureKey`, not array index, so `useSequencedColumns` below can diff it against its own currently-*displayed* assignment by identity. */
function chunkTargetAssignment(departures: DepartureInfo[], columnCount: number): Map<string, number> {
  const assignment = new Map<string, number>()
  chunkIntoColumns(departures, columnCount).forEach((column, columnIndex) => {
    for (const departure of column) assignment.set(departureKey(departure), columnIndex)
  })
  return assignment
}

/**
 * Which column each departure is *actually* rendered in right now — a
 * one-step-behind version of `chunkTargetAssignment`'s own fresh re-chunk,
 * the same posture `useSequencedDepartures` above already takes for the
 * flat list: re-chunking `departures` on every render would, whenever
 * removing the stalest (always the first, per `byExpectedDepartureTime`)
 * departure shifts every following one's global index down by one, often
 * reassign a whole boundary departure or two to a neighboring column in the
 * very same instant everything else about that step animates — popping it
 * out of one column's `<ul>` (an `AnimatePresence` exit) and into the
 * other's (an `AnimatePresence` enter) at once, rather than the hide-then-
 * reveal sequence a genuine move should read as.
 *
 * Diffs its own displayed `assignment` against the freshly-computed target
 * one every `SEQUENCE_STEP_MS`, and applies at most *one* change per step,
 * prioritized so a move always fully hides before it reveals elsewhere:
 * 1. A departure present in both, but assigned a different column (a
 *    "move") — dropped from `assignment` first (exits its current column;
 *    the rows below it in that column slide up to close the gap as an
 *    ordinary consequence of its own box shrinking in normal document flow,
 *    not an extra animation of their own — see `transitRowVariants`'s own
 *    doc comment for why no `mode="popLayout"` here is what makes that
 *    work). It now reads as merely "departed" until the step below re-adds
 *    it.
 * 2. A departure present in `assignment` but no longer in the target at all
 *    (genuinely left `displayed`, not just moved) — dropped the same way.
 * 3. A departure present in the target but not yet in `assignment` (brand
 *    new, or a move's own second half) — added, with its target's column
 *    index. Its row enters (fades + expands) there.
 *
 * A structural change — a different stop entirely (`resetKey`), or the
 * pane's own column count changing (a resize crossing an aspect-ratio
 * tier, not organic departure churn) — snaps `assignment` to the target
 * immediately instead of staging it: there's nothing meaningful to
 * animate a *from*, in the first case, and staging a whole-board reflow
 * one row at a time would read as sluggish rather than deliberate in the
 * second.
 */
function useSequencedColumns(departures: DepartureInfo[], columnCount: number, resetKey: string): DepartureInfo[][] {
  const targetAssignment = useMemo(() => chunkTargetAssignment(departures, columnCount), [departures, columnCount])
  const [assignment, setAssignment] = useState(targetAssignment)
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  const [lastColumnCount, setLastColumnCount] = useState(columnCount)

  if (resetKey !== lastResetKey || columnCount !== lastColumnCount) {
    setLastResetKey(resetKey)
    setLastColumnCount(columnCount)
    setAssignment(targetAssignment)
  }

  useEffect(() => {
    const hasPendingChange = [...assignment.keys()].some((key) => targetAssignment.get(key) !== assignment.get(key)) || [...targetAssignment.keys()].some((key) => !assignment.has(key))
    if (!hasPendingChange) return

    const timeout = setTimeout(() => {
      setAssignment((current) => {
        const next = new Map(current)
        const moving = [...next.keys()].find((key) => targetAssignment.has(key) && targetAssignment.get(key) !== next.get(key))
        if (moving !== undefined) {
          next.delete(moving)
          return next
        }
        const departed = [...next.keys()].find((key) => !targetAssignment.has(key))
        if (departed !== undefined) {
          next.delete(departed)
          return next
        }
        const arriving = [...targetAssignment.keys()].find((key) => !next.has(key))
        if (arriving !== undefined) next.set(arriving, targetAssignment.get(arriving)!)
        return next
      })
      // Re-fires (via the `assignment` dependency below) to schedule the *next* step, same reasoning as `useSequencedDepartures`'s own effect.
    }, SEQUENCE_STEP_MS)
    return () => clearTimeout(timeout)
  }, [assignment, targetAssignment])

  const departureByKey = useMemo(() => new Map(departures.map((departure) => [departureKey(departure), departure])), [departures])
  const columns: DepartureInfo[][] = Array.from({ length: columnCount }, () => [])
  for (const [key, columnIndex] of assignment) {
    const departure = departureByKey.get(key)
    if (departure && columns[columnIndex]) columns[columnIndex].push(departure)
  }
  for (const column of columns) column.sort(byExpectedDepartureTime)
  return columns
}

/** One departure's own icon/line/destination content (the row's left half) — split from `TransitDepartureTrailing` below so single-column mode can animate each half separately (sliding in from opposite edges); multi-column mode just renders both side by side inside one shared fade. */
function TransitDepartureLeading({ departure, showLineName }: { departure: DepartureInfo; showLineName?: boolean }) {
  const { t } = useLanguage()
  return (
    <>
      <span className="transit-slide__mode-icon-wrap">
        <TransitModeIcon mode={departure.mode} className="transit-slide__mode-icon" />
        {departure.realtime && <span className="transit-slide__realtime-dot" title={t('admin.screens.transitRealtimeDotTitle')} />}
      </span>
      <span className="transit-slide__line">{departure.line}</span>
      <span className="transit-slide__destination">
        {departure.destination}
        {showLineName && departure.lineName && <span className="transit-slide__line-name">{departure.lineName}</span>}
      </span>
    </>
  )
}

/** One departure's own platform/arrival-time content (the row's right half) — see `TransitDepartureLeading`'s own doc comment. */
function TransitDepartureTrailing({ departure, minutesUntil, showPlatform }: { departure: DepartureInfo; minutesUntil: number; showPlatform?: boolean }) {
  const { t } = useLanguage()
  return (
    <>
      {showPlatform && <span className="transit-slide__platform">{departure.platform && t('admin.screens.transitPlatformValue', { platform: departure.platform })}</span>}
      <span className="transit-slide__time">{departure.cancelled ? t('admin.screens.transitCancelledLabel') : t('admin.screens.transitMinutesLabel', { minutes: minutesUntil })}</span>
    </>
  )
}

/**
 * One column's own header row, labelling the line/platform/arrival cells
 * beneath it — shown above every column, single or multi (a static `<li>`,
 * not a `motion` one, so it never competes with the rows' own sliding-in-
 * from-the-edge or fade+collapse animations for the same space). Each label
 * gets its own modifier class, not just the shared
 * `transit-slide__column-header-label`, so `TransitSlide.scss` can pin it
 * to the exact same grid column its corresponding data cell
 * (`.transit-slide__line`/`__platform`/`__time`) uses — without that,
 * `.transit-slide__trailing`'s own 2-track subgrid would auto-place
 * "Arrival" into the *first* (platform's own) track whenever `showPlatform`
 * is off, same failure mode `.transit-slide__time`'s own explicit
 * `grid-column: 2` already guards against for the data rows.
 */
function TransitColumnHeader({ showPlatform }: { showPlatform?: boolean }) {
  const { t } = useLanguage()
  return (
    <li className="transit-slide__column-header" aria-hidden="true">
      <span className="transit-slide__leading">
        <span className="transit-slide__column-header-label transit-slide__column-header-label--line">{t('admin.screens.transitLineHeaderLabel')}</span>
      </span>
      <span className="transit-slide__trailing">
        {showPlatform && (
          <span className="transit-slide__column-header-label transit-slide__column-header-label--platform">{t('admin.screens.transitPlatformHeaderLabel')}</span>
        )}
        <span className="transit-slide__column-header-label transit-slide__column-header-label--arrival">{t('admin.screens.transitArrivalHeaderLabel')}</span>
      </span>
    </li>
  )
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

  // Measures the *whole pane's* own aspect ratio (not just the list area
  // below the heading/logo) — "screen type ratios" is about the pane's own
  // overall shape, the same way a real display's shape is what you'd judge
  // "should this be one column or two" against, not just whatever's left
  // over after the heading.
  const paneRef = useRef<HTMLDivElement>(null)
  const columnCount = useColumnCount(paneRef)
  // Never more columns than there are departures to fill them with.
  const effectiveColumnCount = Math.max(1, Math.min(columnCount, departures.length || 1))
  // Called unconditionally (rules of hooks) even in single-column mode,
  // where its result goes unused below — single column has no cross-column
  // reassignment to stage in the first place, so it reads straight off the
  // already-staged `departures` list directly instead, without this hook's
  // own extra step of buffering.
  const sequencedColumns = useSequencedColumns(departures, effectiveColumnCount, effectiveStopId ?? '')

  if (!effectiveStopId) {
    return (
      <div className="transit-slide transit-slide--empty">
        <p>{t('admin.screens.transitNoStopsConfiguredLabel')}</p>
      </div>
    )
  }

  const showingLogo = branded && (showBrandLogo ?? true)
  // Whether there's more than one column at all — governs the *data* side
  // (cross-column reassignment needs `useSequencedColumns`'s own staging
  // the moment there's more than one column to move between, 2 or 3+
  // alike) independently of `usesMaxHeightAnimation` below, which only
  // governs which *animation* a column's own rows use.
  const isMultiColumn = effectiveColumnCount > 1
  // 3+ columns switch from the slide-in/out animation to the fade +
  // max-height one — see `transitRowVariants`'s own doc comment for why a
  // middle column has no sensible edge left to slide a row toward.
  const usesMaxHeightAnimation = effectiveColumnCount >= 3
  const columns = isMultiColumn ? sequencedColumns : chunkIntoColumns(departures, effectiveColumnCount)

  return (
    <div ref={paneRef} className={`transit-slide${branded ? ` transit-slide--branded-${resolvedBrand}` : ''}${showingLogo ? ' transit-slide--has-logo' : ''}`}>
      {showingLogo && <FetchedLogo slug={resolvedBrand} label={resolvedBrand === 'ruter' ? 'Ruter#' : 'Entur'} className="transit-slide__brand-logo" />}
      <h1>{stopName ?? selectedStops.find((stop) => stop.id === effectiveStopId)?.name}</h1>
      {departures.length === 0 && !loading ? (
        <p className="transit-slide__empty">{t('admin.screens.transitNoDeparturesLabel')}</p>
      ) : (
        <div className={`transit-slide__list${isMultiColumn ? ' transit-slide__list--multi-column' : ''}`}>
          {columns.map((columnDepartures, columnIndex) => {
            // Only meaningful in 2-column slide-in/out mode (see
            // `transitLeadingVariants`'s own doc comment) — the left
            // column's own rows slide to/from the left, the right
            // column's own to/from the right.
            const columnSlideVariants = columnIndex === 0 ? transitLeadingVariants : transitTrailingVariants
            return (
              <ul key={columnIndex} className="transit-slide__column">
                <TransitColumnHeader showPlatform={showPlatform} />
                {
                  // `popLayout` (the slide-in/out animation's own posture,
                  // used for 1 *and* 2 columns — see `transitLeadingVariants`'s
                  // own doc comment) removes an exiting element from normal
                  // document flow by setting `position: absolute` on it —
                  // which breaks `.transit-slide__item`'s own
                  // `grid-template-columns: subgrid` (subgrid has no parent
                  // grid to inherit tracks from once it's no longer a real
                  // grid item), so the exiting row's own grid recomputes
                  // from scratch and its line badge visibly stretches to
                  // whatever width it lands with, right as it's animating
                  // out. The fade + max-height animation's own rows (3+
                  // columns) need to stay in normal flow through their own
                  // exit instead (see `transitRowVariants`'s own doc
                  // comment for why) — the default (`sync`) mode does that.
                }
                <AnimatePresence initial={false} mode={usesMaxHeightAnimation ? undefined : 'popLayout'}>
                  {columnDepartures.map((departure) => {
                    const minutesUntil = Math.max(0, Math.round((new Date(departure.expectedDepartureTime).getTime() - now) / 60_000))
                    const itemClassName = `transit-slide__item${departure.cancelled ? ' transit-slide__item--cancelled' : ''}`
                    if (usesMaxHeightAnimation) {
                      return (
                        <motion.li
                          key={departureKey(departure)}
                          layout="position"
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          variants={transitRowVariants}
                          transition={transitRowTransition}
                          className={itemClassName}
                        >
                          <span className="transit-slide__leading">
                            <TransitDepartureLeading departure={departure} showLineName={showLineName} />
                          </span>
                          <span className="transit-slide__trailing">
                            <TransitDepartureTrailing departure={departure} minutesUntil={minutesUntil} showPlatform={showPlatform} />
                          </span>
                        </motion.li>
                      )
                    }
                    if (isMultiColumn) {
                      // 2 columns: the whole row slides as one unit, toward
                      // this column's own edge (`columnSlideVariants`) —
                      // not split into independently-sliding halves like
                      // single-column mode below, since there's no longer a
                      // full pane's width for each half to travel across.
                      return (
                        <motion.li
                          key={departureKey(departure)}
                          layout="position"
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          variants={columnSlideVariants}
                          transition={transitItemTransition}
                          className={itemClassName}
                        >
                          <span className="transit-slide__leading">
                            <TransitDepartureLeading departure={departure} showLineName={showLineName} />
                          </span>
                          <span className="transit-slide__trailing">
                            <TransitDepartureTrailing departure={departure} minutesUntil={minutesUntil} showPlatform={showPlatform} />
                          </span>
                        </motion.li>
                      )
                    }
                    return (
                      <motion.li key={departureKey(departure)} initial="hidden" animate="visible" exit="exit" className={itemClassName}>
                        <motion.span layout="position" className="transit-slide__leading" variants={transitLeadingVariants} transition={transitItemTransition}>
                          <TransitDepartureLeading departure={departure} showLineName={showLineName} />
                        </motion.span>
                        <motion.span layout="position" className="transit-slide__trailing" variants={transitTrailingVariants} transition={transitItemTransition}>
                          <TransitDepartureTrailing departure={departure} minutesUntil={minutesUntil} showPlatform={showPlatform} />
                        </motion.span>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )
          })}
        </div>
      )}
      {stale && <p className="transit-slide__stale-notice">{t('admin.screens.transitStaleNotice')}</p>}
    </div>
  )
}
