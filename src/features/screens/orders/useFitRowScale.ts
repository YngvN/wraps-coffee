import { useLayoutEffect, useState, type RefObject } from 'react'

/** Never shrink rows below this fraction of their normal size — past it they stop being readable across a room, and a clipped queue is the lesser evil. */
const MIN_SCALE = 0.3

/** Ignore changes smaller than this, so rounding in the measurement can't make the scale oscillate between renders. */
const EPSILON = 0.01

/**
 * How wide a row's content wants to be at the current scale: every child's full width — for a text
 * child its `scrollWidth`, i.e. the width *before* its ellipsis truncation — plus the gaps and the
 * row's own horizontal padding. All of it is in `em`, so it is proportional to the scale.
 */
function rowContentWidth(row: HTMLElement): number {
  const style = getComputedStyle(row)
  const children = Array.from(row.children) as HTMLElement[]
  const childrenWidth = children.reduce((sum, child) => sum + Math.max(child.scrollWidth, child.offsetWidth), 0)
  const gaps = Math.max(0, children.length - 1) * parseFloat(style.columnGap || '0')
  return childrenWidth + gaps + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
}

/**
 * The factor the customer board's rows are scaled by (applied as `font-size: calc(1em * scale)` on
 * each list) so every order fits — vertically, all rows inside the list, and horizontally, each order number
 * without an ellipsis in its share of the width. 1 when everything already fits, smaller as the
 * queue grows, never below `MIN_SCALE`. One factor for all lists, so both sections always read at the
 * same size.
 *
 * Solved directly rather than searched: everything inside a list (row padding, gaps, the list's own
 * padding) is sized in `em`, so the content's height is proportional to the scale. Measuring the
 * content once at the current scale gives its height at scale 1, and the scale that fits is the
 * available height divided by that. Each list must be `position: relative`, so row offsets are
 * measured from its own top edge. Re-runs when `count` changes, whenever a list is resized, and whenever rows are actually added to or
 * removed from the DOM.
 */
export function useFitRowScale(lists: RefObject<HTMLElement | null>[], count: number): number {
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const elements = lists.map((ref) => ref.current).filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const measure = () => {
      let fit = 1
      for (const list of elements) {
        // Layout offsets, not `getBoundingClientRect`: the rows' enter/exit animations are transforms,
        // which offsets ignore — and an exiting row that framer's `popLayout` has taken out of the flow
        // (`position: absolute`) is skipped, since it no longer takes up a row.
        let bottom = 0
        for (const child of Array.from(list.children) as HTMLElement[]) {
          if (getComputedStyle(child).position === 'absolute') continue
          bottom = Math.max(bottom, child.offsetTop + child.offsetHeight)
          fit = Math.min(fit, child.clientWidth / (rowContentWidth(child) / scale))
        }
        if (bottom === 0) continue
        const contentAtCurrent = bottom + parseFloat(getComputedStyle(list).paddingBottom)
        const contentAtOne = contentAtCurrent / scale
        fit = Math.min(fit, list.clientHeight / contentAtOne)
      }
      const next = Math.max(MIN_SCALE, Math.min(1, fit))
      if (Math.abs(next - scale) > EPSILON) setScale(next)
    }

    measure()
    const resizeObserver = new ResizeObserver(measure)
    // Rows leaving play an exit animation first and are only removed from the DOM afterwards — after
    // `count` already changed and this effect already measured them as still present. Watching the
    // lists' children catches that removal, so the rows grow back once the queue has really shrunk.
    const mutationObserver = new MutationObserver(measure)
    for (const element of elements) {
      resizeObserver.observe(element)
      mutationObserver.observe(element, { childList: true })
    }
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
    // `lists` holds stable ref objects; `count` is what actually changes the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, scale])

  return scale
}
