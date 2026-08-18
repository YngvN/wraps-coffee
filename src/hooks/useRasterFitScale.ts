import { useLayoutEffect, type RefObject } from 'react'

/**
 * Keeps a CSS custom property on `hostRef` equal to "how much of a fixed `rasterWidth` x
 * `rasterHeight` raster the host's own box can actually show", so a fixed-size, absolutely-positioned
 * child can be fitted to a changing box with `transform: scale()` alone.
 *
 * This is the mechanism behind the consolidated kiosk-performance report's fact 17. A layer
 * re-rasterises whenever its own **layout size** changes — promoting it to its own compositor layer
 * (`will-change`) does not avoid that. Laying the content out once at a fixed size and fitting it
 * with a transform turns every subsequent resize into a compositor-only property change, which is
 * what took a QR pane's resize cost on the `Empty test` fixture from 400ms of budget debt to 120ms.
 *
 * The scale is a **contain** fit (`min` of the two axes' own ratios), so the raster always fits
 * inside the host on both axes and keeps its aspect ratio, letterboxing rather than cropping when
 * the two shapes disagree. A square raster in a square host reduces to the obvious single ratio.
 *
 * Two properties the callers depend on, both load-bearing:
 *
 * - **No forced layout.** The observer reads its own entry's `contentRect` rather than
 *   `clientWidth`/`clientHeight`, so nothing here forces a synchronous layout — the same discipline
 *   `useShrinkToFitFontScale` follows, for the same reason. The single read at mount happens before
 *   this effect writes anything, so it is a clean read off layout the browser has already done.
 * - **No feedback loop.** Writing the scale cannot change the observed size, because the scaled
 *   element is absolutely positioned and therefore contributes nothing to the host's own layout.
 *
 * Callers are responsible for the **scale-down-only** rule: the raster must be at least as large as
 * the biggest box the content will ever be fitted into, since downscaling a raster stays crisp while
 * upscaling blurs. See `QrCodeSlide`'s own `rasterSizePx` for how that size is derived per display
 * rather than hardcoded.
 *
 * @param hostRef The element whose box the raster is fitted into, and which the custom property is written on.
 * @param varName The custom property to write, e.g. `'--qr-raster-scale'` — named per caller so two different rasters on one screen can never read each other's value.
 * @param enabled Whether to observe at all; `false` skips the observer entirely and leaves the property unwritten (so the CSS fallback applies).
 * @param rasterWidth The fixed width, in CSS px, the content is laid out at before being scaled.
 * @param rasterHeight The fixed height, in CSS px. Pass the same value as `rasterWidth` for a square raster.
 */
export function useRasterFitScale(hostRef: RefObject<HTMLElement | null>, varName: string, enabled: boolean, rasterWidth: number, rasterHeight: number) {
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !enabled) return

    const write = (width: number, height: number) => {
      host.style.setProperty(varName, `${Math.min(width / rasterWidth, height / rasterHeight)}`)
    }
    write(host.clientWidth, host.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1].contentRect
      write(rect.width, rect.height)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [hostRef, varName, enabled, rasterWidth, rasterHeight])
}
