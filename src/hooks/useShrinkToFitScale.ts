import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Shrinks a pane's whole rendered content — fonts, padding, gaps, and any
 * images alike — down to fit its available space, all in the same ratio (a
 * single scale factor, like a photocopy reduction), rather than reflowing
 * text or shrinking font sizes independently of everything else around
 * them. No minimum floor: content shrinks as far as it needs to rather than
 * ever overflow.
 *
 * `outerRef` is the pane's own fixed-size box (what defines "available
 * space"). `innerRef` is the content wrapper actually transformed — its
 * *first element child* (a slide's own root, e.g. `.news-slide`) is what
 * gets measured: `scrollHeight`/`scrollWidth` on an element always reports
 * its own natural, unclipped content size regardless of its own explicit
 * `height`/`overflow: hidden` — that's what makes every slide's existing
 * "fill 100% of the pane, clip anything taller" markup already measurable
 * with no structural changes of its own needed.
 *
 * Disabled outright (leaves content at its natural size, free to overflow)
 * whenever `enabled` is false — e.g. a pane whose own `overflowMode` is
 * `'scroll'` instead of `'shrink'`.
 *
 * Re-measures on every resize of `outerRef` (a `ResizeObserver`, so divider
 * drags, stage changes, and window resizes are all covered), on any DOM
 * content change inside `innerRef` (a `MutationObserver` — a slide's own
 * *internal* async data, e.g. `TransitSlide`'s live departures or
 * `NewsSlide`'s rotating headline, changes the page's DOM without ever
 * resizing the pane itself or changing this hook's own `deps`, which are
 * only the *static* pane config passed down from `LayoutPane` — a plain
 * `ResizeObserver` on the pane box alone would miss that entirely, since
 * the box's own size never changes even though its content just did), and
 * whenever an entry in `deps` changes (so a text-size edit gets its own
 * fresh measurement even on content that happens not to mutate its DOM).
 *
 * A DOM mutation's own remeasure is debounced (not just deferred a single
 * frame, like a resize's) — several slides animate a content change in over
 * ~0.4s (e.g. `TransitSlide`'s own departure rows sliding in/out one at a
 * time via framer-motion), and measuring mid-transition can catch a
 * transient DOM/layout state that doesn't match where things actually
 * settle, computing a scale that's already stale by the time it's applied.
 * Waiting for mutations to go quiet for a bit longer than that settles on
 * the real final size instead.
 *
 * On top of those two triggers, a `POLL_INTERVAL_MS` safety-net remeasure
 * runs on a plain interval regardless — a slide's own async content (a
 * fetch resolving, framer-motion's `AnimatePresence`/`layout` choreography
 * temporarily pulling exiting elements out of flow) doesn't always land as
 * one cleanly-observable "mutations went quiet" moment relative to
 * `innerRef` in practice, so this is what guarantees the shrink
 * self-corrects within a couple of seconds even when a specific
 * event-driven trigger was missed or caught a transient in-between state.
 * Cheap enough for a kiosk display nobody's actively interacting with.
 */
const MUTATION_SETTLE_MS = 500
const POLL_INTERVAL_MS = 2000

export function useShrinkToFitScale(outerRef: RefObject<HTMLElement | null>, innerRef: RefObject<HTMLElement | null>, enabled: boolean, deps: readonly unknown[]) {
  const frameRef = useRef<number | undefined>(undefined)
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const measureAndScale = () => {
      if (!enabled) {
        inner.style.transform = ''
        return
      }
      inner.style.transform = 'none'
      const measured = (inner.firstElementChild as HTMLElement | null) ?? inner
      const naturalHeight = measured.scrollHeight
      const naturalWidth = measured.scrollWidth
      const scale = Math.min(1, naturalHeight > 0 ? outer.clientHeight / naturalHeight : 1, naturalWidth > 0 ? outer.clientWidth / naturalWidth : 1)
      inner.style.transform = scale < 1 ? `scale(${scale})` : ''
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
    // `inner.style.transform` write would otherwise re-trigger itself.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures on every entry in `deps` (content identity) in addition to `enabled`, not just when the refs themselves change.
  }, [enabled, ...deps])
}
