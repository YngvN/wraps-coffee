import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_PREVIEW_ASPECT_RATIO, type PreviewAspectRatio } from '../../types/screen'
import './ScaledScreenPreview.scss'

/** The longer of the two reference dimensions, in px — the exact number doesn't matter, only that it stays fixed across every ratio choice, so switching ratios doesn't itself change how large text/panes look in absolute terms (matching how a real 1920x1080 landscape screen and a real 1080x1920 portrait screen both read at a similar physical text size, just in a different overall shape). */
const REFERENCE_LONG_SIDE = 1920

interface ScaledScreenPreviewProps {
  children: ReactNode
  /** Falls back to 16:9 (a standard landscape display) when omitted. */
  aspectRatio?: PreviewAspectRatio
  /**
   * `'width'` (the default): the outer box is *shaped* to `aspectRatio`
   * itself (via CSS `aspect-ratio`, filling whatever width its parent
   * gives it) — right for the screen editor's own preview, which is free
   * to take whatever shape the ratio dictates. `'contain'`: the outer box
   * instead fills whatever fixed size its parent already gives it
   * (typically a fixed-size grid card), and the scaled canvas is centered
   * and shrunk to fit *within* that box without cropping — like an
   * `<img>`'s own `object-fit: contain` — so screens of different shapes
   * (portrait vs. landscape) can sit in same-sized cards side by side,
   * letterboxed rather than stretched or clipped.
   */
  fit?: 'width' | 'contain'
}

/**
 * Renders `children` (a `SplitLayout`) at a fixed "real" resolution shaped
 * to `aspectRatio`, then shrinks the whole result down with a CSS
 * `transform: scale()` to fit however large this component's own box
 * actually ends up being — tracked live via `ResizeObserver`, so it stays
 * correct across window resizes. This is deliberately *not* the same as
 * just letting `SplitLayout` fill a smaller `width:100%`/`height:100%` box
 * directly: its own text sizes are `rem`-based (relative to the page's root
 * font size, not this container), so a naively-shrunk container would show
 * the exact same, real-kiosk-sized text stuffed into a tiny box instead of
 * a proportionally-scaled-down miniature. A `transform: scale()` is a
 * paint-time operation applied to the *whole already-laid-out result* —
 * pane sizes and text sizes alike — so it reproduces exactly how the real
 * display would look, just smaller. See `fit` for the two ways the outer
 * box itself can be sized.
 */
export function ScaledScreenPreview({ children, aspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO, fit = 'width' }: ScaledScreenPreviewProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  const longSideUnits = Math.max(aspectRatio.width, aspectRatio.height)
  const unitToPx = REFERENCE_LONG_SIDE / longSideUnits
  const referenceWidth = aspectRatio.width * unitToPx
  const referenceHeight = aspectRatio.height * unitToPx

  useEffect(() => {
    const node = outerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setScale(fit === 'contain' ? Math.min(entry.contentRect.width / referenceWidth, entry.contentRect.height / referenceHeight) : entry.contentRect.width / referenceWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `referenceWidth`/`referenceHeight` only ever change alongside `aspectRatio` itself, re-observing on every render is unnecessary.
  }, [aspectRatio.width, aspectRatio.height, fit])

  return (
    <div
      ref={outerRef}
      className={`scaled-screen-preview${fit === 'contain' ? ' scaled-screen-preview--contain' : ''}`}
      style={fit === 'width' ? { aspectRatio: `${aspectRatio.width} / ${aspectRatio.height}` } : undefined}
    >
      <div
        className={`scaled-screen-preview__canvas${fit === 'contain' ? ' scaled-screen-preview__canvas--contain' : ''}`}
        style={{ width: referenceWidth, height: referenceHeight, transform: fit === 'contain' ? `translate(-50%, -50%) scale(${scale})` : `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
