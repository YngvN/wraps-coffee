import { useLayoutEffect, useRef, type RefObject } from 'react'
import { SLIDE_SIZE_VAR_NAMES } from '../utils/textSizeVars'
import { createShrinkToFitScheduler, RESIZE_SETTLE_MS } from './shrinkToFitScheduler'

/** Same settle window as `useShrinkToFitScale` — see its own doc comment for why a DOM-mutation-triggered remeasure waits rather than firing on the very next frame. */
const MUTATION_SETTLE_MS = 500

/** See `useShrinkToFitScale`'s own doc comment for why a periodic safety-net remeasure exists on top of the resize/mutation triggers. */
const POLL_INTERVAL_MS = 2000

/**
 * How close the search below has to bracket the true largest fitting scale before stopping —
 * `1 / 2**8`, i.e. exactly the precision the previous fixed 8-iteration search over
 * `[MIN_SCALE, 1]` reached, so this is a like-for-like replacement rather than a quality change.
 *
 * A tolerance rather than a fixed iteration count because the search is now *seeded* (see
 * `measureAndScale`): starting from a known-good bracket, converging to the same precision usually
 * takes far fewer probes, and a fixed count would throw that saving away.
 */
const SCALE_TOLERANCE = 1 / 2 ** 8

/**
 * How much larger than the last resolved scale to probe when re-confirming it (1%).
 *
 * The re-confirm is what makes the common case cheap. Measurement on the kiosk showed **100% of this
 * hook's passes ran the full 8-iteration search** — never once hitting the `fitsAt(1)` fast path —
 * and that most passes come from the safety poll and the mutation observer firing on a pane whose
 * size has not actually changed (one pane ran 44 full searches in 40 seconds). For such a pane the
 * answer is simply last time's scale, and proving it takes three probes in total — scale 1 does not
 * fit, the seed does, and the seed nudged up does not.
 *
 * Floored at `SCALE_TOLERANCE` in absolute terms where it is applied, because a purely relative
 * margin is *narrower* than the search's own convergence tolerance for any seed below ~0.4, which
 * would land the nudge inside a bracket already declared converged and send the pass into a needless
 * full-range search.
 */
const SEED_PROBE_MARGIN = 0.01

/** How many distinct box sizes a pane remembers a resolved scale for — comfortably more than the number of stages any real screen cycles through, while staying bounded against a divider drag walking a new size every frame. */
const SCALE_CACHE_LIMIT = 8

/** Never literally `0` — a degenerate zero font size has nothing left to search from; effectively "no minimum" for any real content. */
const MIN_SCALE = 0.01

/** CSS custom property this hook exposes alongside the `--slide-*-size` ones — see its own doc comment below for what it's for. */
const FIT_GAP_SCALE_VAR = '--fit-gap-scale'

/** How much faster `--fit-gap-scale` shrinks than the text scale it's derived from (`scale ** GAP_SCALE_EXPONENT`) — e.g. at a text scale of 0.7, gap scale is 0.7**2 = 0.49. An exponent > 1 always shrinks faster than plain `scale` for any scale below 1, and is a no-op (still exactly 1) right at scale 1, i.e. whenever nothing needs shrinking at all. */
const GAP_SCALE_EXPONENT = 2

/**
 * Shrinks a pane's content by reducing its *actual* font size rather than
 * `useShrinkToFitScale`'s paint-only `transform: scale()`. Use this instead
 * for content whose own layout is a *responsive, width-filling* grid/flex
 * (e.g. `TransitSlide`'s departure grid, `WeatherSlide`'s hourly row) —
 * such content's measured width is already ≈ its pane's own width by
 * design, so a uniform transform driven by *height* (too many rows) ends up
 * shrinking that already-correctly-filled width too, leaving dead space on
 * the sides that a paint-only transform can never reclaim. Reducing the
 * real font size instead lets the grid/flex genuinely re-flow and re-fill
 * whatever width is available at the smaller size. `useShrinkToFitScale`
 * remains the right choice for a single visual block with its own image
 * (e.g. `NewsSlide`'s headline + thumbnail), where a uniform photocopy-style
 * reduction is exactly the desired look.
 *
 * Checks height only by default, *not* width: this hook is mainly used on
 * content whose own width axis already has a graceful, CSS-only fallback of
 * its own (`TransitSlide`'s destination column shrinks via its `1fr` grid
 * track and, failing that, ellipsis-truncates) — shrinking the *whole
 * pane's* text preemptively just because one row's own content wants a
 * little more room, while there's still slack elsewhere, produces a worse
 * result than letting that one row's own fallback handle it. Height has no
 * equivalent fallback (there's no "vertical ellipsis" for a whole list), so
 * it's the one axis this hook needs to solve for in that case.
 *
 * `checkWidth` opts a caller *into* the width check too, for content with
 * no such fallback of its own — `EventMonthSlide`'s CSS multi-column list
 * has no "stop adding columns" behavior; left unchecked, it would just keep
 * growing sideways past the pane's own edge forever rather than ever
 * shrinking to fit.
 *
 * Reads its pane's own base `--slide-*-size` values once per measurement
 * pass — plain values (see `textSizesToCssVars`'s own doc comment for why
 * they're not pre-multiplied by a nested `--fit-scale` custom property
 * instead, the more "elegant"-looking approach this replaced after it
 * proved unreliable in practice) — off `outerRef`, and writes already-
 * scaled replacement values straight onto `innerRef`, a single direct
 * override every descendant's own `var(--slide-*-size, ...)` picks up
 * automatically via ordinary CSS inheritance (no `calc()`/`var()` nesting
 * involved at all). Since changing font size is a genuine layout change,
 * finding the right value takes a search — each candidate is applied, then
 * `scrollHeight` (forcing a synchronous reflow) is read back to see whether
 * it now fits, narrowing the bracket until it converges to
 * `SCALE_TOLERANCE` on the largest scale that still does. Two shortcuts keep
 * the usual cost far below a full bisection: scale `1` is checked first and
 * skips everything when nothing needs shrinking at all, and otherwise the
 * search is *seeded* from this pane's own last resolved scale, which is
 * still the answer on the majority of passes and takes three probes to
 * confirm rather than nine to rediscover (see `SEED_PROBE_MARGIN`). No
 * minimum floor beyond `MIN_SCALE`'s own numerical safety margin.
 *
 * Same triggers and signature as `useShrinkToFitScale` (see its own doc
 * comment) — a debounced `ResizeObserver` on `outerRef`, a debounced
 * `MutationObserver` on `innerRef` for a slide's own internal async content
 * changes, `deps` for external (e.g. text-size edit) changes, and a periodic
 * safety-net poll — so `LayoutPane.tsx` can point both hooks at the exact
 * same ref pair and just switch which one is actually `enabled` per pane.
 * The resize debounce matters even more here than in `useShrinkToFitScale`:
 * every candidate in the search below forces its own synchronous layout, so
 * an un-debounced resize burst (e.g. an automated stage transition's
 * ~30-tick, ~0.5s geometry animation) would force a whole search's worth of
 * layouts on every single tick, not just once per resize.
 *
 * Also exposes `--fit-gap-scale` on `innerRef`, alongside the `--slide-*-
 * size` vars — a *steeper* multiplier (see `GAP_SCALE_EXPONENT`) a slide's
 * own `.scss` can optionally fold into its own gap/spacing values (on top
 * of those already shrinking 1:1 with an `em`-relative text size, the same
 * way `TransitSlide`'s own padding already does) for a list dense enough
 * that reclaiming whitespace matters more than shrinking text does — e.g.
 * `EventMonthSlide`'s own inter-column and inter-item spacing. Defaults to
 * `1` (a no-op) wherever a slide's own CSS doesn't reference it at all, and
 * wherever this hook isn't the active one for a given pane (`inner` only
 * ever has *one* of `--fit-gap-scale`/`useShrinkToFitScale`'s own `transform`
 * applied at a time, per `LayoutPane.tsx`'s own `enabled` gating).
 */
export function useShrinkToFitFontScale(
  outerRef: RefObject<HTMLElement | null>,
  innerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: readonly unknown[],
  checkWidth = false,
  /** See `useShrinkToFitScale`'s own doc comment on the same parameter. */
  trackResize = true,
) {
  /**
   * Scales this pane has already resolved, keyed by the box size they were resolved *for*.
   *
   * Keyed by size rather than being a single last-value because of what measurement showed: seeding
   * from the last scale alone removed 43% of this hook's forced layouts but **did not improve stage
   * transitions at all** on the kiosk (forced layouts during `'holding'` went 167 -> 166). All the
   * saving landed on the safety poll, where the pane's box had not changed. At a transition the box
   * *has* changed, so a single last-value seed is always wrong exactly when it matters.
   *
   * Stages cycle, though, so a pane returning to a shape it has held before asks for a size it has
   * already solved — and then the seed is not merely close, it is the answer, confirmable in three
   * probes instead of rediscovered in nine.
   *
   * A ref (not state) because it must survive the effect *re-running*, which happens on every
   * `contentPhase` flip as well as any content change — the very passes this exists to make cheap.
   */
  const scaleCacheRef = useRef(new Map<string, number>())
  /** Fallback seed for a size never seen before — better than nothing, since a pane's scale at a new size is usually nearer its last one than it is to the middle of the whole range. */
  const lastScaleRef = useRef(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    /** This pane's own base sizes (e.g. `11` from `"11cqmin"`), read fresh each pass from wherever `LayoutPane` sets them (`outer`) — what every candidate scale below multiplies. `null` for a name whose value isn't parseable (shouldn't normally happen; skipped rather than throwing). */
    const baseSizes = SLIDE_SIZE_VAR_NAMES.map((name) => {
      const raw = outer.style.getPropertyValue(name).trim()
      const match = /^([\d.]+)cqmin$/.exec(raw)
      return { name, value: match ? parseFloat(match[1]) : null }
    })

    const applyScale = (scale: number) => {
      for (const { name, value } of baseSizes) {
        if (value === null) continue
        inner.style.setProperty(name, `${value * scale}cqmin`)
      }
      inner.style.setProperty(FIT_GAP_SCALE_VAR, `${scale ** GAP_SCALE_EXPONENT}`)
    }

    const clearOverride = () => {
      for (const { name } of baseSizes) inner.style.removeProperty(name)
      inner.style.removeProperty(FIT_GAP_SCALE_VAR)
    }

    /** Applies `scale`, then reports whether the measured content now fits — the style write plus the `scrollHeight`/`scrollWidth` reads together force one synchronous layout pass. */
    const fitsAt = (scale: number): boolean => {
      applyScale(scale)
      const measured = (inner.firstElementChild as HTMLElement | null) ?? inner
      return measured.scrollHeight <= outer.clientHeight && (!checkWidth || measured.scrollWidth <= outer.clientWidth)
    }

    /** Records `scale` as this pane's answer at `sizeKey`, most-recently-used last so the eviction below drops the stalest entry. */
    const remember = (sizeKey: string, scale: number) => {
      const cache = scaleCacheRef.current
      cache.delete(sizeKey)
      cache.set(sizeKey, scale)
      // Bounded because a divider drag walks through a new size every frame, which would otherwise
      // grow this map without limit for as long as the kiosk stays up. A handful of entries is enough
      // to cover every stage a screen actually cycles through, which is the case that matters.
      while (cache.size > SCALE_CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
      lastScaleRef.current = scale
    }

    const measureAndScale = () => {
      if (!enabled) {
        clearOverride()
        return
      }

      // Every `fitsAt` below is one forced synchronous layout — the unit this whole function exists
      // to spend as few of as possible.
      const fitsAtFullSize = fitsAt(1)
      // Read straight after a `fitsAt`, which has just forced layout — so these are free rather than
      // forcing another pass of their own. Reading them at the top of the function instead would cost
      // an extra forced layout on every single pass.
      const sizeKey = `${outer.clientWidth}x${outer.clientHeight}`

      if (fitsAtFullSize) {
        remember(sizeKey, 1)
        return
      }

      const seed = scaleCacheRef.current.get(sizeKey) ?? lastScaleRef.current
      let low = MIN_SCALE
      let high = 1

      // Re-confirm last time's answer before searching for a new one. See `SEED_PROBE_MARGIN` for
      // why this is the case worth optimising: if the seed still fits and a nudge up does not, it is
      // still the largest fitting scale, reached in three probes rather than nine.
      if (seed > MIN_SCALE && seed < 1) {
        if (fitsAt(seed)) {
          // Floored at `SCALE_TOLERANCE` above the seed, not just 1% of it. A purely relative margin
          // is *smaller* than the search's own absolute convergence tolerance for any seed below
          // ~0.4 — so the nudge would land inside the bracket the previous search had already
          // declared converged, still fit, and send this pass down the "room opened up" path into a
          // full-range search. That made the seeding a near no-op for exactly the small-scale panes
          // it was supposed to help most.
          const nudged = Math.min(1, Math.max(seed * (1 + SEED_PROBE_MARGIN), seed + SCALE_TOLERANCE))
          if (nudged >= 1 || !fitsAt(nudged)) {
            // That last probe left `nudged` applied, so the answer has to be written back explicitly.
            remember(sizeKey, seed)
            applyScale(seed)
            return
          }
          // Room has genuinely opened up (the pane grew, or its content shrank) — `nudged` is a
          // known-fitting lower bound, and `fitsAt(1)` already failed, so `1` is a valid upper one.
          low = nudged
        } else {
          // The seed no longer fits (the pane shrank, or its content grew) — the answer is below it.
          high = seed
        }
      }

      while (high - low > SCALE_TOLERANCE) {
        const mid = (low + high) / 2
        if (fitsAt(mid)) low = mid
        else high = mid
      }
      applyScale(low)
      remember(sizeKey, low)
    }

    const scheduler = createShrinkToFitScheduler(measureAndScale)

    measureAndScale()
    // Disabled panes (e.g. `overflowMode: 'scroll'`, or a slide kind that
    // uses the transform-based `useShrinkToFitScale` instead) have nothing
    // left to measure — installing a live `ResizeObserver`/`MutationObserver`/
    // poll for them anyway would just be background work with no purpose,
    // times every such pane on every screen, for as long as the kiosk stays up.
    if (!enabled) return

    let resizeObserver: ResizeObserver | undefined
    let mutationObserver: MutationObserver | undefined
    let pollInterval: ReturnType<typeof setInterval> | undefined
    if (trackResize) {
      resizeObserver = new ResizeObserver(() => scheduler.scheduleMeasureAfterSettle(RESIZE_SETTLE_MS))
      resizeObserver.observe(outer)

      // Deliberately doesn't watch `attributes` — this hook's own
      // `inner.style.setProperty(...)` writes would otherwise re-trigger
      // themselves.
      mutationObserver = new MutationObserver(() => scheduler.scheduleMeasureAfterSettle(MUTATION_SETTLE_MS))
      mutationObserver.observe(inner, { childList: true, subtree: true, characterData: true })

      pollInterval = setInterval(scheduler.scheduleMeasure, POLL_INTERVAL_MS)
    }

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if (pollInterval !== undefined) clearInterval(pollInterval)
      scheduler.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures on every entry in `deps` (content identity) in addition to `enabled`/`checkWidth`/`trackResize`, not just when the refs themselves change.
  }, [enabled, checkWidth, trackResize, ...deps])
}
