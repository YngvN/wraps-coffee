import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { SLIDE_SIZE_VAR_NAMES } from '../utils/textSizeVars'
import { readShrinkScale, shrinkScaleKeyFromDom, writeShrinkScale, type ShrinkScaleKey } from './shrinkScaleStore'
import { createShrinkToFitScheduler, RESIZE_SETTLE_MS, type ShrinkToFitScheduler } from './shrinkToFitScheduler'

/**
 * **Arm B (experiment, 2026-08-16) — seed each search from the process-wide `shrinkScaleStore`
 * instead of only this hook instance's own cache.**
 *
 * The local cache is empty on a pane's very first pass, which is both the pass a viewer actually
 * sees and the only one that happens after a kiosk restart. The shared store can be filled ahead of
 * time (`warmShrinkScales.ts`), so that first pass starts from the right answer and confirms it in
 * three probes rather than rediscovering it in nine. Flip to `Boolean(0)` to fall back to the
 * per-instance cache alone. See `ARM_A_DEFERRED_SEARCH` on why this is `Boolean(1)` and not `true`.
 */
const ARM_B_SHARED_SCALE_STORE = Boolean(1)

/**
 * **Arm A (experiment, 2026-08-16) — defer and frame-slice the search instead of running it
 * synchronously.**
 *
 * Measurement (consolidated report, fact 8) localised 85–89% of a real screen's stage-transition
 * stall to `measureAndScale()` re-running from this hook's own effect, whose deps included the
 * transition-phase-derived `trackResize`. The cost is not that a single probe forces layout — it is
 * that a whole search's worth of them (up to nine) runs synchronously inside one transition frame.
 *
 * Flip to `Boolean(0)` to drain each search synchronously in a single pass, which reproduces the
 * previous behaviour exactly — the state machine below is the *same* search either way, so the two
 * arms cannot drift apart the way two separately-written code paths would. Deliberately
 * `Boolean(1)`, never a literal `true`: a literal makes the other branch unreachable, TypeScript
 * stops narrowing there, the build fails, and `dist/` silently keeps the previous arm's bundle.
 */
const ARM_A_DEFERRED_SEARCH = Boolean(1)

/**
 * **Ablation (experiment, 2026-08-17) — flip to `Boolean(1)` to make every measurement pass an
 * immediate no-op, leaving the observers and poll installed and firing at full rate.**
 *
 * This is fact 8's V1b arm, re-armed for the catalogue-cost question: `Empty test` plus a single
 * catalogue pane measures 48ms/frame against that fixture's own 20ms/0-debt floor, and the two
 * candidate explanations — the deferred shrink search still running in `idle`, versus plain
 * layout/reflow of a large catalogue DOM at 11 different box shapes — are not separable from the
 * phase split alone. Turning the search off while changing nothing else attributes the split
 * directly.
 *
 * Never commit this as `Boolean(1)`, and never write it as a literal `true` — see
 * `ARM_A_DEFERRED_SEARCH` below for why the literal breaks the build in a way that silently measures
 * the previous arm.
 */
const ABLATE_MEASUREMENT = Boolean(0)

/** Same settle window as `useShrinkToFitScale` — see its own doc comment for why a DOM-mutation-triggered remeasure waits rather than firing on the very next frame. */
const MUTATION_SETTLE_MS = 500

/** See `useShrinkToFitScale`'s own doc comment for why a periodic safety-net remeasure exists on top of the resize/mutation triggers. */
const POLL_INTERVAL_MS = 2000

/**
 * How close the search below has to bracket the true largest fitting scale before stopping —
 * `1 / 2**8`, i.e. exactly the precision the previous fixed 8-iteration search over
 * `[MIN_SCALE, 1]` reached, so this is a like-for-like replacement rather than a quality change.
 *
 * A tolerance rather than a fixed iteration count because the search is *seeded* (see
 * `beginSearch`): starting from a known-good bracket, converging to the same precision usually
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
 * One resumable binary search over candidate scales.
 *
 * Held in a ref rather than run as a `while` loop so a single pass can be spread across frames —
 * `step` names which probe comes next, and every field is the loop state that would otherwise live
 * in local variables between iterations.
 */
interface SearchState {
  /** Which probe the next `advanceSearch` call performs. Mirrors the original loop's own structure: check full size, re-confirm the seed, nudge it, then bisect. */
  step: 'full' | 'seed' | 'nudge' | 'bisect'
  /** Largest scale known to fit. */
  low: number
  /** Smallest scale known *not* to fit. */
  high: number
  /** This pane's previously resolved scale, the value `'seed'`/`'nudge'` are re-confirming. */
  seed: number
  /** The seed nudged up by `SEED_PROBE_MARGIN`, computed once at the `'seed'` step so `'nudge'` re-uses the identical value. */
  nudged: number
  /** The box size this search is resolving for, captured once so a mid-search resize cannot key the answer to a size it was not measured at. */
  sizeKey: string
  /** Best fitting scale found so far — what stays *painted* between probes, so a viewer never sees the intermediate candidates. */
  display: number
}

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
 * `SCALE_TOLERANCE` on the largest scale that still does.
 *
 * **That search is resumable and runs at most one probe per animation frame**
 * (see `ARM_A_DEFERRED_SEARCH` and `SearchState`), and only while `idle` —
 * so a stage transition, which changes every pane's box *and* its content at
 * once, no longer pays a whole search's worth of forced synchronous layouts
 * inside a single commit. The best-fitting scale found so far stays painted
 * between probes, so the intermediate candidates are never visible. Three
 * shortcuts keep the usual cost far below a full bisection: an unchanged box
 * with an already-resolved scale exits before probing at all, scale `1` is
 * checked first and skips everything when nothing needs shrinking, and
 * otherwise the search is *seeded* from this pane's own last resolved scale,
 * which is still the answer on the majority of passes and takes three probes
 * to confirm rather than nine to rediscover (see `SEED_PROBE_MARGIN`). No
 * minimum floor beyond `MIN_SCALE`'s own numerical safety margin.
 *
 * Same triggers and signature as `useShrinkToFitScale` (see its own doc
 * comment) — a debounced `ResizeObserver` on `outerRef`, a debounced
 * `MutationObserver` on `innerRef` for a slide's own internal async content
 * changes, `deps` for external (e.g. text-size edit) changes, and a periodic
 * safety-net poll — so `LayoutPane.tsx` can point both hooks at the exact
 * same ref pair and just switch which one is actually `enabled` per pane.
 * Unlike `useShrinkToFitScale`, the observers here are installed **once** and
 * are *not* torn down and rebuilt when `idle` flips: they were measured to be
 * close to free (fact 8's V1a recovered 0% of worst frame with all three
 * removed), and rebuilding them was itself part of what made every phase flip
 * re-run a full search.
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
  /**
   * Whether this pane is currently settled — `LayoutPane` passes
   * `activeContentSlot === n && contentPhase === 'idle'`. Probing is suspended
   * whenever this is false, which is what keeps a stage transition free of
   * forced synchronous layouts. Deliberately **not** a dependency of the
   * measurement effect: making it one is precisely what caused every phase
   * flip to re-run a full search on every pane (report fact 8).
   */
  idle = true,
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
   * content change — the very passes this exists to make cheap.
   */
  const scaleCacheRef = useRef(new Map<string, number>())
  /** Fallback seed for a size never seen before — better than nothing, since a pane's scale at a new size is usually nearer its last one than it is to the middle of the whole range. */
  const lastScaleRef = useRef(1)
  /** Live mirror of `idle`, read from inside the measurement effect's own closures without making it a dependency of that effect. */
  const idleRef = useRef(idle)
  /** The in-flight search, or `null` when this pane has nothing left to resolve. */
  const searchRef = useRef<SearchState | null>(null)
  /** The box size whose answer is currently *applied*, so an unchanged box can skip probing entirely. Cleared whenever content changes (the effect re-runs), since the same box can need a different scale for different content. */
  const appliedSizeKeyRef = useRef<string | null>(null)
  /** Lets the `idle` effect below poke the currently-installed scheduler without owning it. */
  const schedulerRef = useRef<ShrinkToFitScheduler | null>(null)
  /** The shared-store address of the in-flight search, captured when it opened so `settle` can write the answer back without re-reading the box (which would force a layout). `null` when Arm B is off, or when this pane has no derivable address. */
  const storeKeyRef = useRef<ShrinkScaleKey | null>(null)

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

    /** Ends the in-flight search with `scale` as the answer: paints it, caches it, and marks this box size as already solved. */
    const settle = (sizeKey: string, scale: number) => {
      applyScale(scale)
      remember(sizeKey, scale)
      // Written from the key captured when the search opened, not re-derived here: re-reading the box
      // now would be a read after this pass's own style writes, i.e. a forced synchronous layout.
      const storeKey = storeKeyRef.current
      if (storeKey) writeShrinkScale(storeKey, scale)
      appliedSizeKeyRef.current = sizeKey
      searchRef.current = null
    }

    /**
     * Opens a search, or returns `false` when this pane provably needs none.
     *
     * The box-size read here happens *before* any style write this frame, so it is a clean read off
     * the layout the browser has already done — not a forced synchronous one. That is what makes the
     * unchanged-box early-out genuinely free, and it is the case the 2-second safety poll hits ~57%
     * of the time.
     */
    const beginSearch = (): boolean => {
      const width = outer.clientWidth
      const height = outer.clientHeight
      const sizeKey = `${width}x${height}`
      if (appliedSizeKeyRef.current === sizeKey) return false

      // Preferred over the local cache rather than merged with it: the store is addressed by (screen,
      // pane, stage, aspect), so it survives this component instance being torn down and rebuilt —
      // which is exactly what a crossfade slot swap and a stage restructure both do — while the local
      // cache does not. It falls through to the local cache and then to the last resolved scale, so a
      // pane whose address cannot be derived (rendered outside a `SplitLayout`) behaves as before.
      const storeKey = ARM_B_SHARED_SCALE_STORE ? shrinkScaleKeyFromDom(outer, width, height) : null
      storeKeyRef.current = storeKey
      const seed = (storeKey ? readShrinkScale(storeKey) : undefined) ?? scaleCacheRef.current.get(sizeKey) ?? lastScaleRef.current
      searchRef.current = {
        step: 'full',
        low: MIN_SCALE,
        high: 1,
        seed,
        nudged: seed,
        sizeKey,
        // Whatever this pane last resolved stays painted until the search finds something better —
        // slicing the search across frames would otherwise make every intermediate candidate
        // visible as the text stepped its way down to the answer.
        display: seed,
      }
      return true
    }

    /** Performs exactly one probe of the in-flight search. Returns `true` while more probes remain. */
    const advanceSearch = (): boolean => {
      const state = searchRef.current
      if (!state) return false

      switch (state.step) {
        case 'full': {
          if (fitsAt(1)) {
            settle(state.sizeKey, 1)
            return false
          }
          // Nothing fits at full size, so the seed is the best guess to re-confirm first.
          if (state.seed > MIN_SCALE && state.seed < 1) state.step = 'seed'
          else state.step = 'bisect'
          applyScale(state.display)
          return true
        }
        case 'seed': {
          if (fitsAt(state.seed)) {
            // Floored at `SCALE_TOLERANCE` above the seed, not just 1% of it. A purely relative
            // margin is *smaller* than the search's own absolute convergence tolerance for any seed
            // below ~0.4 — so the nudge would land inside the bracket the previous search had
            // already declared converged, still fit, and send this pass down the "room opened up"
            // path into a full-range search. That made the seeding a near no-op for exactly the
            // small-scale panes it was supposed to help most.
            state.nudged = Math.min(1, Math.max(state.seed * (1 + SEED_PROBE_MARGIN), state.seed + SCALE_TOLERANCE))
            state.display = state.seed
            if (state.nudged >= 1) {
              settle(state.sizeKey, state.seed)
              return false
            }
            state.step = 'nudge'
          } else {
            // The seed no longer fits (the pane shrank, or its content grew) — the answer is below it.
            state.high = state.seed
            state.step = 'bisect'
          }
          applyScale(state.display)
          return true
        }
        case 'nudge': {
          if (!fitsAt(state.nudged)) {
            settle(state.sizeKey, state.seed)
            return false
          }
          // Room has genuinely opened up (the pane grew, or its content shrank) — `nudged` is a
          // known-fitting lower bound, and `fitsAt(1)` already failed, so `1` is a valid upper one.
          state.low = state.nudged
          state.display = state.nudged
          state.step = 'bisect'
          applyScale(state.display)
          return true
        }
        case 'bisect': {
          if (state.high - state.low <= SCALE_TOLERANCE) {
            settle(state.sizeKey, state.low)
            return false
          }
          const mid = (state.low + state.high) / 2
          if (fitsAt(mid)) {
            state.low = mid
            state.display = mid
          } else {
            state.high = mid
          }
          applyScale(state.display)
          return true
        }
      }
    }

    /**
     * One scheduled pass. Under Arm A this performs a single probe and re-arms itself for the next
     * frame; with the flag off it drains the whole search in one commit, which is exactly the
     * previous synchronous behaviour.
     */
    const runPass = () => {
      if (!enabled) {
        clearOverride()
        return
      }
      // Ablation: no probe, no style write, no cache read — the pane simply renders at its own base
      // size and overflows. Deliberately placed *below* the `enabled` check so a disabled pane still
      // has its override cleared exactly as it always did, and *above* everything else so not one
      // forced layout of this hook's own survives the flag.
      if (ABLATE_MEASUREMENT) return
      // Suspended mid-transition: the seed (or last resolved scale) stays painted, and the search
      // resumes from wherever it got to once the pane settles. This is the whole point of the arm.
      if (!idleRef.current) return

      if (!searchRef.current && !beginSearch()) return

      if (ARM_A_DEFERRED_SEARCH) {
        if (advanceSearch()) scheduler.scheduleMeasure()
      } else {
        while (advanceSearch()) {
          /* drained synchronously — the pre-Arm-A behaviour */
        }
      }
    }

    const scheduler = createShrinkToFitScheduler(runPass)
    schedulerRef.current = scheduler

    // Content just changed (this effect only re-runs for `enabled`/`checkWidth`/content identity),
    // so whatever scale is currently applied was resolved for *different* content and the
    // unchanged-box early-out must not short-circuit the new search.
    appliedSizeKeyRef.current = null
    scheduler.scheduleMeasure()

    // Disabled panes (e.g. `overflowMode: 'scroll'`, or a slide kind that
    // uses the transform-based `useShrinkToFitScale` instead) have nothing
    // left to measure — installing a live `ResizeObserver`/`MutationObserver`/
    // poll for them anyway would just be background work with no purpose,
    // times every such pane on every screen, for as long as the kiosk stays up.
    if (!enabled) {
      clearOverride()
      return () => {
        schedulerRef.current = null
        scheduler.cancel()
      }
    }

    const resizeObserver = new ResizeObserver(() => scheduler.scheduleMeasureAfterSettle(RESIZE_SETTLE_MS))
    resizeObserver.observe(outer)

    // Deliberately doesn't watch `attributes` — this hook's own
    // `inner.style.setProperty(...)` writes would otherwise re-trigger
    // themselves.
    const mutationObserver = new MutationObserver(() => {
      // A mutation means the content itself changed, so the currently-applied scale was resolved for
      // something else — re-open the search rather than letting the unchanged-box early-out skip it.
      appliedSizeKeyRef.current = null
      scheduler.scheduleMeasureAfterSettle(MUTATION_SETTLE_MS)
    })
    mutationObserver.observe(inner, { childList: true, subtree: true, characterData: true })

    // The safety poll deliberately clears the unchanged-box early-out before scheduling, so it still
    // re-derives the scale from scratch the way it always did. That matters for correctness rather
    // than cost: a pane whose *content* shrank (a transit board dropping a departure) has room to
    // grow back into, and nothing else would ever notice — the box has not changed, so the resize
    // observer stays quiet. Leaving the early-out in place here measurably pinned such a pane at the
    // smaller scale it had last needed. The re-derived pass is not expensive under Arm A: it is
    // sliced one probe per frame and only ever runs while the pane is idle.
    const pollInterval = setInterval(() => {
      appliedSizeKeyRef.current = null
      scheduler.scheduleMeasure()
    }, POLL_INTERVAL_MS)

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      clearInterval(pollInterval)
      schedulerRef.current = null
      scheduler.cancel()
      searchRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures on every entry in `deps` (content identity) in addition to `enabled`/`checkWidth`, not just when the refs themselves change. `idle` is deliberately excluded — see its own parameter doc comment.
  }, [enabled, checkWidth, ...deps])

  // Resume a suspended search (and pick up any resize that happened while it was suspended) the
  // moment the pane settles. Cheap on its own: it only arms a frame callback, and that callback
  // exits without probing at all when the box is unchanged and already solved.
  useEffect(() => {
    idleRef.current = idle
    if (idle) schedulerRef.current?.scheduleMeasure()
  }, [idle])
}
