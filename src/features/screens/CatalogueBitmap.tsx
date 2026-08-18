import { getFontEmbedCSS, toPng } from 'html-to-image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRasterFitScale } from '../../hooks/useRasterFitScale'
import './CatalogueBitmap.scss'

/**
 * **Experiment (2026-08-17) — render a catalogue once into a bitmap, then fit that bitmap to the
 * pane with `transform: scale()` instead of re-laying-out the real DOM at every new box shape.**
 *
 * The consolidated kiosk-performance report's §8 step 4 explicitly lists `CatalogueSlide` as a
 * *wrong* candidate for this treatment, on the grounds that a catalogue must genuinely re-wrap at a
 * new size and a scaled bitmap keeps the old line breaks. That objection is about **appearance**, and
 * it stands. This exists to settle the separate, purely-empirical question it does not answer: how
 * much of a catalogue pane's measured 48ms/frame is layout/paint of its own DOM at all — because if
 * a bitmap lands the pane on the fixture's 20ms floor, reflow is the whole story, and the appearance
 * trade-off becomes a product decision that can be taken on real numbers.
 *
 * Mechanism is fact 17's, unchanged: a compositor layer re-rasterises when its own **layout size**
 * changes, so laying content out once at a fixed size and fitting it with a transform makes every
 * subsequent resize a compositor-only change. See `useRasterFitScale`.
 *
 * **The capture itself is deliberately not on the transition path.** `html-to-image` is expensive
 * (the report clocks a full-screen capture at 250ms on a 10-core desktop, against this TV's 4 cores),
 * which is exactly why the report rules out *live* capture as a way to hide a stall. Here it runs
 * **once per distinct content**, at mount, and every transition afterwards touches only the finished
 * bitmap — so the cost model is "pay once when the menu changes, then transitions are free", not
 * "pay on every transition".
 *
 * Known limitations, all real, all out of scope for the measurement this was built for:
 *
 * - **Aspect ratio.** The bitmap is fitted, not re-wrapped, so a pane whose shape differs from the
 *   raster's letterboxes rather than re-flowing to fill. This is the appearance objection above,
 *   made concrete.
 * - **Live data.** A catalogue whose products change needs a re-capture; `captureKey` triggers one,
 *   but nothing here debounces a rapidly-changing catalogue.
 * - **Fidelity.** `html-to-image` inlines computed styles and does not reproduce every effect
 *   (a custom font still loading, a backdrop filter) exactly.
 */
interface CatalogueBitmapProps {
  /** The real catalogue tree to rasterise. Rendered live until the capture succeeds, then replaced by the bitmap. */
  children: ReactNode
  /** Changes whenever the rendered content would differ — a new capture runs on every change. Keep it cheap to compute and stable across unrelated re-renders. */
  captureKey: string
  /**
   * Skip the capture entirely and leave the **live DOM** in the fixed-size raster host permanently.
   *
   * This is the more interesting half of the experiment, and worth understanding as its own arm
   * rather than as a degraded bitmap. The catalogue's measured cost has two parts (see the report's
   * fact 18): re-running the shrink-to-fit search, and re-**laying-out** the catalogue DOM at each
   * new box shape. Pinning the DOM to one fixed layout size removes the second part outright — the
   * pane's resize becomes a `transform` change, so no layout is invalidated — while keeping the text
   * as real vector glyphs rather than a rasterised photograph of them. It also makes the
   * shrink search settle in a single probe, since the content can no longer overflow the host.
   *
   * What it does **not** fix is the aspect-ratio problem, which is inherent to fitting rather than
   * re-flowing and applies identically to both arms.
   */
  liveOnly?: boolean
}

/** Which of the three states the capture is in — surfaced as `data-catalogue-bitmap` so a TV run (which has no devtools, see the report's §1) can tell "the bitmap path is genuinely being measured" from "the capture failed and this is silently still the baseline". Those two are otherwise identical numbers with opposite meanings. */
type CaptureStatus = 'capturing' | 'ready' | 'failed'

/**
 * How long a capture may run before it is abandoned as failed.
 *
 * Not defensive padding — a bound is **required for the measurement to mean anything**. `toPng`
 * neither resolved nor rejected on the TV (observed directly via `bitmapProbe.mts`: status stuck on
 * `'capturing'` for a whole run), which left the pane showing the live tree while the arm was being
 * recorded as though it were the bitmap path. A hang must land in `'failed'`, which is visible, rather
 * than in `'capturing'` forever, which is indistinguishable from slow.
 *
 * 10s because the capture is explicitly off the transition path and runs once per content change —
 * there is no latency budget here, only a need to terminate.
 */
const CAPTURE_TIMEOUT_MS = 10_000

/**
 * Finished bitmaps, keyed on the exact inputs that produced them, shared across every mount in the
 * process.
 *
 * **Module-level, not component state, for the reason the report's fact 16 documents:**
 * `useCrossfadeSlot` mounts a *fresh* slide instance into the alternate slot on **every** stage
 * transition, so anything held in a component's own state is thrown away and recomputed each time.
 * Measured directly here — a per-instance capture turned the arm bimodal (windows that reused a
 * bitmap were free; windows that re-captured cost seconds), i.e. it was measuring "capture on every
 * transition", the exact opposite of the proposal being tested. This is the same cross-mount-cache
 * shape as `qrCodePath.ts`'s own `geometryCache` and `shrinkScaleStore`, and it exists for the same
 * reason.
 *
 * Bounded because each entry is a full-resolution data URL (tens of KB) and a catalogue whose items
 * change walks a new key each time; a handful covers every catalogue a screen actually cycles through.
 */
const bitmapCache = new Map<string, string>()

/** How many distinct captures to keep — see `bitmapCache`. Most-recently-used last, so eviction drops the stalest. */
const BITMAP_CACHE_LIMIT = 8

function readCachedBitmap(key: string): string | undefined {
  const hit = bitmapCache.get(key)
  if (hit === undefined) return undefined
  // Re-insert so this counts as most-recently-used against the eviction below.
  bitmapCache.delete(key)
  bitmapCache.set(key, hit)
  return hit
}

function writeCachedBitmap(key: string, dataUrl: string) {
  bitmapCache.delete(key)
  bitmapCache.set(key, dataUrl)
  while (bitmapCache.size > BITMAP_CACHE_LIMIT) bitmapCache.delete(bitmapCache.keys().next().value as string)
}

interface CaptureState {
  status: CaptureStatus
  /** The finished bitmap, or `null` while the live DOM is still showing (before the first capture, or after one failed). */
  dataUrl: string | null
  /** The `captureKey` this state was produced for — compared during render so a content change drops the stale bitmap without a ref read (see the render body below). */
  key: string
}

/**
 * The fixed box, in CSS px, the catalogue is laid out and rasterised at before being scaled to fit.
 *
 * Sized to the **whole viewport**, not to any one pane: the fit transform must only ever scale down
 * (fact 17's rule — downscaling stays crisp, upscaling blurs), and a pane can never be larger than
 * the screen it is on, so the viewport is the smallest size guaranteed sharp in every pane on this
 * display. On this TV that is the WebView's own 960x540 CSS viewport rather than the panel's
 * 1920x1080 (see the report's §1), so the raster stays cheap.
 *
 * Read once per mount for the same reason `QrCodeSlide`'s own `rasterSizePx` does: a kiosk's viewport
 * never changes, and re-capturing mid-session would reintroduce exactly the cost this avoids.
 */
function rasterBox(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 960, height: 540 }
  return { width: Math.ceil(window.innerWidth), height: Math.ceil(window.innerHeight) }
}

/** `bitmapCache`'s address. Includes the raster size because the same content captured at a different size is a genuinely different bitmap, and reusing one across sizes would silently upscale (fact 17's scale-down-only rule). */
function cacheKey(captureKey: string, raster: { width: number; height: number }): string {
  return `${raster.width}x${raster.height}|${captureKey}`
}

/**
 * How long to allow the one-off web-font inlining before giving up and capturing in fallback type.
 *
 * Generous on purpose. This runs **once per page load**, off the transition path, and the result is
 * reused by every capture afterwards — so the only thing a long timeout costs is a slower *first*
 * bitmap, while a short one costs the custom typeface for the entire session.
 */
const FONT_EMBED_TIMEOUT_MS = 60_000

/**
 * The inlined `@font-face` CSS for this page's web fonts, computed at most once.
 *
 * **Why this is memoised rather than left to `toPng`.** An SVG `foreignObject` renders in an isolated
 * context that cannot reach the page's own font resources, so `html-to-image` has to base64-inline
 * every `@font-face` source into the capture. This app loads its fonts cross-origin from Google Fonts
 * (see `index.html`), and Google splits each family/weight into many
 * `unicode-range` subsets — roughly a hundred woff2 requests across the seven families loaded here.
 * Paying that on *every* capture is what made the first TV run of this arm look like a hang; paying
 * it once and reusing the string makes every capture after the first one cheap.
 *
 * `null` once an attempt has failed or timed out, which makes the caller fall back to `skipFonts`
 * rather than retrying a slow operation on every content change.
 *
 * **A kiosk should not depend on this at all.** Self-hosting the woff2 files from the local server
 * would make the whole step same-origin, fast, and available offline — which matters for a display
 * that must survive an internet outage. This is the in-place fix; that is the right one.
 */
let fontEmbedCssPromise: Promise<string | null> | null = null

function ensureFontEmbedCss(node: HTMLElement): Promise<string | null> {
  if (fontEmbedCssPromise) return fontEmbedCssPromise
  fontEmbedCssPromise = Promise.race([
    // `woff2` alone, rather than every format Google offers — this WebView is Chromium 116 (report
    // §1) and has supported woff2 for years, so the other formats would be fetched and inlined into
    // the capture without anything ever using them.
    getFontEmbedCSS(node, { preferredFontFormat: 'woff2' }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FONT_EMBED_TIMEOUT_MS)),
  ])
  return fontEmbedCssPromise
}

/** The `--slide-*-size` custom properties a slide's type scale is built from — the same set `textSizesToCssVars` writes and `useShrinkToFitFontScale` searches over. */
const SLIDE_SIZE_VARS = ['--slide-heading-size', '--slide-item-title-size', '--slide-description-size', '--slide-price-size', '--slide-item-price-size'] as const

/** Convergence tolerance for `fitIntoRaster`'s search, matching `useShrinkToFitFontScale`'s own `SCALE_TOLERANCE` so both resolve type at the same precision. */
const FIT_TOLERANCE = 1 / 2 ** 8

/** Never search below this — a degenerate scale has nothing legible left, and the raster is meant to hold a *readable* menu, not to prove it can shrink one to nothing. */
const MIN_FIT_SCALE = 0.05

/**
 * Shrinks the catalogue's own type scale until it genuinely fits the fixed raster, then leaves that
 * scale applied.
 *
 * **Without this the bitmap is a lie.** The raster is a fixed window with `overflow: hidden`, and a
 * real catalogue (55 items across 7 categories) is several times taller than it — so the capture
 * silently kept only the first category and dropped the rest, which is exactly what the first TV run
 * of this arm showed. The pane's own `useShrinkToFitFontScale` cannot prevent that: it measures the
 * *pane*, and content inside the raster can never overflow the pane, so it settles at scale 1 on its
 * first probe and never shrinks anything.
 *
 * The same binary search `useShrinkToFitFontScale` runs, but deliberately **synchronous and
 * undeferred**: that hook is frame-sliced because it runs on the transition path, whereas this runs
 * once per content change immediately before a capture that itself costs seconds. There is no frame
 * budget here to protect, and slicing it would only make the capture wait longer.
 *
 * Reads its base sizes from the *computed* style rather than an inline one, because unlike
 * `LayoutPane`'s own outer element the raster host never has them set inline — it inherits them from
 * the pane. Writes the scaled values back onto the host, where ordinary inheritance carries them to
 * every descendant, the same mechanism the hook uses.
 */
function fitIntoRaster(host: HTMLElement, raster: { width: number; height: number }) {
  // The slide root, not the host: `.catalogue-slide` is `height: 100%; overflow-y: hidden`, so it is
  // exactly the raster's height while its `scrollHeight` still reports the full content height — which
  // is the overflow signal being searched on. Same `firstElementChild` idiom, and same reason, as
  // `useShrinkToFitFontScale`'s own `fitsAt`.
  const content = (host.firstElementChild as HTMLElement | null) ?? host
  const computed = getComputedStyle(host)
  const baseSizes = SLIDE_SIZE_VARS.map((name) => {
    const match = /^([\d.]+)cqmin$/.exec(computed.getPropertyValue(name).trim())
    return { name, value: match ? parseFloat(match[1]) : null }
  })

  const applyScale = (scale: number) => {
    for (const { name, value } of baseSizes) {
      if (value === null) continue
      host.style.setProperty(name, `${value * scale}cqmin`)
    }
    // Kept in step with the text scale exactly as `useShrinkToFitFontScale` does, so a slide's own
    // `--fit-gap-scale`-aware spacing reclaims whitespace at the same rate here as it does live.
    host.style.setProperty('--fit-gap-scale', `${scale ** 2}`)
  }

  const fitsAt = (scale: number): boolean => {
    applyScale(scale)
    return content.scrollHeight <= raster.height && content.scrollWidth <= raster.width
  }

  if (fitsAt(1)) return
  let low = MIN_FIT_SCALE
  let high = 1
  while (high - low > FIT_TOLERANCE) {
    const mid = (low + high) / 2
    if (fitsAt(mid)) low = mid
    else high = mid
  }
  applyScale(low)
}

export function CatalogueBitmap({ children, captureKey, liveOnly }: CatalogueBitmapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const captureRef = useRef<HTMLDivElement | null>(null)
  const [raster] = useState(rasterBox)
  // Seeded straight from the shared cache, so a remount that already has a bitmap for this exact
  // content renders it on its very first frame and never shows the live tree at all. Seeding at
  // `useState`'s initialiser rather than in an effect is what keeps the *mount* free, which matters
  // because a slide's mount lands in the transition's busiest commit (fact 16).
  const [capture, setCapture] = useState<CaptureState>(() => {
    const cached = liveOnly ? undefined : readCachedBitmap(cacheKey(captureKey, raster))
    return { status: cached ? 'ready' : 'capturing', dataUrl: cached ?? null, key: captureKey }
  })

  // Content changed — swap to that content's own cached bitmap, or drop back to the live tree for the
  // effect below to capture. Applied directly in the render body (React's documented "adjusting state
  // when a prop changes" pattern, the same idiom `useCrossfadeSlot` uses) rather than in an effect,
  // because this codebase's lint config flags both a synchronous `setState` in a `useEffect` body and
  // a ref read during render. `key` lives inside the same state object for exactly that reason: it is
  // ordinary committed state, so comparing against it during render is safe.
  if (capture.key !== captureKey) {
    const cached = liveOnly ? undefined : readCachedBitmap(cacheKey(captureKey, raster))
    setCapture({ status: cached ? 'ready' : 'capturing', dataUrl: cached ?? null, key: captureKey })
  }

  // Fits whatever is currently showing — the live DOM before the first capture, the bitmap after —
  // by the same rule either way, so the swap never changes the pane's apparent size.
  useRasterFitScale(hostRef, '--catalogue-raster-scale', true, raster.width, raster.height)

  // Fit the type scale to the raster on **both** arms, not just before a capture.
  //
  // The raster is a fixed window with `overflow: hidden`, so a catalogue too tall for it is silently
  // truncated — and the pane's own `useShrinkToFitFontScale` cannot notice, because content inside
  // the raster can never overflow the *pane*. That is a rendering bug in the `liveOnly` arm exactly
  // as much as it is a capture bug in the bitmap arm (observed on the TV: only the first of seven
  // categories survived), so the fit has to happen for both. Runs once per mount/content change,
  // never on the transition path.
  useEffect(() => {
    const node = captureRef.current
    if (!node) return
    const frame = requestAnimationFrame(() => fitIntoRaster(node, raster))
    return () => cancelAnimationFrame(frame)
    // `raster` rather than its two fields: it is `useState`-initialised once per mount and never
    // reassigned, so the object reference is stable by construction and depending on it whole is
    // both accurate and what the linter can actually verify.
  }, [captureKey, raster, liveOnly])

  useEffect(() => {
    const node = captureRef.current
    // `liveOnly` leaves the status on `'capturing'` deliberately — the live tree is what that arm
    // measures, so there is nothing to capture and nothing to fall back from.
    if (!node || liveOnly) return
    let cancelled = false

    // A frame's delay so the live tree has actually been laid out and painted before it is read —
    // capturing in the same commit it mounts in reliably produces a blank bitmap.
    const frame = requestAnimationFrame(() => {
      // Re-run rather than relying on the effect above having already landed: effect ordering between
      // the two is not something to depend on, and `fitIntoRaster` exits after a single probe when the
      // content already fits, so repeating it costs nothing.
      fitIntoRaster(node, raster)
      // Resolve the page's own web fonts first so the capture renders in the real typeface rather
      // than a fallback. Only the first capture of a session actually waits — see
      // `ensureFontEmbedCss`. A `null` result (failed or timed out) degrades to `skipFonts`, which is
      // the previous behaviour: a bitmap in the wrong font still beats no bitmap.
      const bounded = ensureFontEmbedCss(node).then((fontEmbedCSS) => {
        // Surfaced on the host so a TV run can tell an embedded-font capture from a fallback one
        // without decoding the bitmap — the two are otherwise indistinguishable at kiosk scale, and
        // this device has no devtools (report §1). Bytes rather than a boolean: an empty-but-non-null
        // result would still mean no fonts were actually inlined.
        hostRef.current?.setAttribute('data-catalogue-font-css', String(fontEmbedCSS ? fontEmbedCSS.length : 0))
        const capture = toPng(node, {
          width: raster.width,
          height: raster.height,
          cacheBust: false,
          pixelRatio: 1,
          ...(fontEmbedCSS ? { fontEmbedCSS } : { skipFonts: true }),
        })
        // Bounded rather than awaited outright, so a stall resolves to a state the probe can see —
        // see `CAPTURE_TIMEOUT_MS`. Applied to the rasterisation only: the font step has its own,
        // much longer bound, since it is a once-per-session cost rather than a per-capture one.
        return Promise.race([capture, new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS))])
      })
      bounded
        .then((dataUrl) => {
          if (cancelled) return
          // Falls back to the live DOM rather than showing nothing: a failed or timed-out capture must
          // degrade to the ordinary (merely slower) rendering, never to a blank pane.
          if (dataUrl === null) {
            setCapture({ status: 'failed', dataUrl: null, key: captureKey })
            return
          }
          // Cached before it is rendered, so the *next* mount of this same content — which on a
          // crossfading pane is the very next stage transition — skips the capture entirely.
          writeCachedBitmap(cacheKey(captureKey, raster), dataUrl)
          setCapture({ status: 'ready', dataUrl, key: captureKey })
        })
        .catch(() => {
          if (!cancelled) setCapture({ status: 'failed', dataUrl: null, key: captureKey })
        })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
    // See the sibling effect above on why this is `raster` and not its two dimensions.
  }, [captureKey, raster, liveOnly])

  return (
    <div ref={hostRef} className="catalogue-bitmap" data-catalogue-bitmap={capture.status}>
      {capture.dataUrl === null ? (
        <div ref={captureRef} className="catalogue-bitmap__raster" style={{ width: raster.width, height: raster.height }}>
          {children}
        </div>
      ) : (
        <img
          className="catalogue-bitmap__image"
          src={capture.dataUrl}
          alt=""
          style={{ width: raster.width, height: raster.height, marginLeft: -raster.width / 2, marginTop: -raster.height / 2 }}
        />
      )}
    </div>
  )
}
