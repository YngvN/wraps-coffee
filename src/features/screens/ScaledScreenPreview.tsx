import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DEFAULT_PREVIEW_ASPECT_RATIO, type PreviewAspectRatio } from '../../types/screen'
import { referenceCanvasSize } from './screenPreviewGeometry'
import './ScaledScreenPreview.scss'

interface ScaledScreenPreviewProps {
  children: ReactNode
  /** Falls back to 16:9 (a standard landscape display) when omitted. Ignored entirely when `referenceSize` is given. */
  aspectRatio?: PreviewAspectRatio
  /**
   * Overrides the `aspectRatio`-derived reference resolution with an exact
   * CSS-px size — e.g. `ScreenDisplay.tsx`'s editor-mode lock
   * (`ScreenConfig.editorTargetViewport`), which needs to match a real
   * device's own fixed layout viewport rather than the aspect-ratio-
   * normalized `REFERENCE_LONG_SIDE` canvas every other caller uses.
   */
  referenceSize?: { width: number; height: number }
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
  /** Extra class(es) merged onto the outer box — e.g. so a fullscreen caller can override the card-shaped `border-radius` baked into `.scaled-screen-preview`. */
  className?: string
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
 *
 * The resolved `scale` is also published as the `--scaled-screen-preview-scale`
 * CSS custom property on the canvas, so descendants that size a fixed hit-area
 * in this pre-transform reference space (e.g. `SplitLayoutDivider`'s drag
 * handles) can divide by it to keep a constant *physical* size regardless of
 * how much this wrapper ends up shrinking/growing the whole result. It
 * resolves to the CSS default of `1` anywhere no `ScaledScreenPreview`
 * ancestor exists.
 */
export function ScaledScreenPreview({ children, aspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO, referenceSize, fit = 'width', className }: ScaledScreenPreviewProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  const { width: referenceWidth, height: referenceHeight } = referenceSize ?? referenceCanvasSize(aspectRatio)

  useEffect(() => {
    const node = outerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setScale(fit === 'contain' ? Math.min(entry.contentRect.width / referenceWidth, entry.contentRect.height / referenceHeight) : entry.contentRect.width / referenceWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [referenceWidth, referenceHeight, fit])

  return (
    <div
      ref={outerRef}
      className={`scaled-screen-preview${fit === 'contain' ? ' scaled-screen-preview--contain' : ''}${className ? ` ${className}` : ''}`}
      style={fit === 'width' ? { aspectRatio: `${referenceWidth} / ${referenceHeight}` } : undefined}
    >
      <div
        className={`scaled-screen-preview__canvas${fit === 'contain' ? ' scaled-screen-preview__canvas--contain' : ''}`}
        style={
          {
            width: referenceWidth,
            height: referenceHeight,
            transform: fit === 'contain' ? `translate(-50%, -50%) scale(${scale})` : `scale(${scale})`,
            '--scaled-screen-preview-scale': scale || 1,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  )
}
