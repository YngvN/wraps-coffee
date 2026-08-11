import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Measures how wide an element actually renders, in **device pixels**, for choosing an image variant
 * that matches (see `pickImageVariant`). Returns a ref to attach and the latest measurement.
 *
 * Two things it gets deliberately right, both of which have already caused real bugs here:
 *
 * 1. **`getBoundingClientRect()`, not `clientWidth`.** A screen is rendered in more places than the
 *    kiosk: `ScreenCard`'s grid thumbnail and both editors' live previews all wrap the same
 *    `SplitLayout` in `ScaledScreenPreview`, which lays its canvas out at a full-size reference width
 *    and then shrinks it with `transform: scale()`. Layout-only reads do not see that transform, so a
 *    150px-wide thumbnail would report the full reference width and request the largest variant for an
 *    image drawn at a fraction of it. `getBoundingClientRect()` is in visual coordinates and includes
 *    every ancestor transform.
 * 2. **Quantised updates.** The measurement is only published when it crosses a meaningful boundary
 *    (`QUANTUM_PX`), so a pane being dragged, or a stage transition animating a pane's size, does not
 *    re-render this component on every frame — and does not swap the `<img>`'s `src` mid-animation.
 *    Variant widths are far apart (240/480/800/1600), so nothing is lost by ignoring small changes.
 *
 * Uses a `ResizeObserver` rather than measuring once, because a pane's size genuinely changes across
 * stages; the quantisation is what keeps that affordable.
 */
const QUANTUM_PX = 64

export function useRenderedImageWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | undefined>(undefined)

  const publish = useCallback((measured: number) => {
    setWidth((current) => {
      if (current !== undefined && Math.abs(current - measured) < QUANTUM_PX) return current
      // Rounded up to the next quantum so repeated sub-quantum growth settles instead of drifting.
      return Math.ceil(measured / QUANTUM_PX) * QUANTUM_PX
    })
  }, [])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => publish(element.getBoundingClientRect().width * (window.devicePixelRatio || 1))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [publish])

  return { ref, width }
}
