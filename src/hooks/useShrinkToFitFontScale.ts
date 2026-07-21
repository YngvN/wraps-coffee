import { useLayoutEffect, useRef, type RefObject } from 'react'
import { SLIDE_SIZE_VAR_NAMES } from '../utils/textSizeVars'

/** Same settle window as `useShrinkToFitScale` — see its own doc comment for why a DOM-mutation-triggered remeasure waits rather than firing on the very next frame. */
const MUTATION_SETTLE_MS = 500

/** See `useShrinkToFitScale`'s own doc comment for why a periodic safety-net remeasure exists on top of the resize/mutation triggers. */
const POLL_INTERVAL_MS = 2000

/** Iterations of the binary search below — 8 gets within ~0.4% of the true largest fitting scale, plenty for a visual font size. */
const SEARCH_ITERATIONS = 8

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
 * finding the right value takes a binary search — each candidate is
 * applied, then `scrollHeight` (forcing a synchronous reflow) is read back
 * to see whether it now fits, narrowing the search until it converges on
 * the largest scale that still does. A fast path checks scale `1` first and
 * skips the search entirely when nothing needs shrinking at all (the common
 * case). No minimum floor beyond `MIN_SCALE`'s own numerical safety margin.
 *
 * Same triggers and signature as `useShrinkToFitScale` (see its own doc
 * comment) — a `ResizeObserver` on `outerRef`, a debounced `MutationObserver`
 * on `innerRef` for a slide's own internal async content changes, `deps`
 * for external (e.g. text-size edit) changes, and a periodic safety-net
 * poll — so `LayoutPane.tsx` can point both hooks at the exact same ref
 * pair and just switch which one is actually `enabled` per pane.
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
export function useShrinkToFitFontScale(outerRef: RefObject<HTMLElement | null>, innerRef: RefObject<HTMLElement | null>, enabled: boolean, deps: readonly unknown[], checkWidth = false) {
  const frameRef = useRef<number | undefined>(undefined)
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

    const measureAndScale = () => {
      if (!enabled) {
        clearOverride()
        return
      }
      if (fitsAt(1)) return
      let low = MIN_SCALE
      let high = 1
      for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        const mid = (low + high) / 2
        if (fitsAt(mid)) low = mid
        else high = mid
      }
      applyScale(low)
    }

    const scheduleMeasure = () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(measureAndScale)
    }

    const scheduleMeasureAfterSettle = () => {
      if (settleTimeoutRef.current !== undefined) clearTimeout(settleTimeoutRef.current)
      settleTimeoutRef.current = setTimeout(scheduleMeasure, MUTATION_SETTLE_MS)
    }

    measureAndScale()

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(outer)

    // Deliberately doesn't watch `attributes` — this hook's own
    // `inner.style.setProperty(...)` writes would otherwise re-trigger
    // themselves.
    const mutationObserver = new MutationObserver(scheduleMeasureAfterSettle)
    mutationObserver.observe(inner, { childList: true, subtree: true, characterData: true })

    const pollInterval = setInterval(scheduleMeasure, POLL_INTERVAL_MS)

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      clearInterval(pollInterval)
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      if (settleTimeoutRef.current !== undefined) clearTimeout(settleTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures on every entry in `deps` (content identity) in addition to `enabled`/`checkWidth`, not just when the refs themselves change.
  }, [enabled, checkWidth, ...deps])
}
