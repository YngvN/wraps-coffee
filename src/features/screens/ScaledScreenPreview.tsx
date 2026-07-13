import { useEffect, useRef, useState, type ReactNode } from 'react'
import './ScaledScreenPreview.scss'

/** A ratio (e.g. `{ width: 16, height: 9 }` for "16:9") the preview box itself is shaped to — see `ScaledScreenPreview`'s own doc comment for how this drives its internal reference resolution too. */
export interface PreviewAspectRatio {
  width: number
  height: number
}

/** The longer of the two reference dimensions, in px — the exact number doesn't matter, only that it stays fixed across every ratio choice, so switching ratios doesn't itself change how large text/panes look in absolute terms (matching how a real 1920x1080 landscape screen and a real 1080x1920 portrait screen both read at a similar physical text size, just in a different overall shape). */
const REFERENCE_LONG_SIDE = 1920

interface ScaledScreenPreviewProps {
  children: ReactNode
  /** Falls back to 16:9 (a standard landscape display) when omitted. */
  aspectRatio?: PreviewAspectRatio
}

/**
 * Renders `children` (a `SplitLayout`) at a fixed "real" resolution shaped
 * to `aspectRatio`, then shrinks the whole result down with a CSS
 * `transform: scale()` to fit however wide this component's own box
 * actually ends up being — tracked live via `ResizeObserver`, so it stays
 * correct across window resizes. This is deliberately *not* the same as
 * just letting `SplitLayout` fill a smaller `width:100%`/`height:100%` box
 * directly: its own text sizes are `rem`-based (relative to the page's root
 * font size, not this container), so a naively-shrunk container would show
 * the exact same, real-kiosk-sized text stuffed into a tiny box instead of
 * a proportionally-scaled-down miniature. A `transform: scale()` is a
 * paint-time operation applied to the *whole already-laid-out result* —
 * pane sizes and text sizes alike — so it reproduces exactly how the real
 * display would look, just smaller.
 */
export function ScaledScreenPreview({ children, aspectRatio = { width: 16, height: 9 } }: ScaledScreenPreviewProps) {
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
      if (entry) setScale(entry.contentRect.width / referenceWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `referenceWidth` only ever changes alongside `aspectRatio` itself, re-observing on every render is unnecessary.
  }, [aspectRatio.width, aspectRatio.height])

  return (
    <div ref={outerRef} className="scaled-screen-preview" style={{ aspectRatio: `${aspectRatio.width} / ${aspectRatio.height}` }}>
      <div className="scaled-screen-preview__canvas" style={{ width: referenceWidth, height: referenceHeight, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
