import { getFontEmbedCSS, toBlob } from 'html-to-image'
import { createElement } from 'react'
import type { LanguageCode } from '../../i18n'
import type { PaneId, ScreenConfig } from '../../types/screen'
import { effectiveDevicePixelRatio } from '../../utils/effectiveDevicePixelRatio'
import { getPersistedSlotTextSizes } from '../../utils/screenStages'
import { resolveContentTextSizes, SLIDE_SIZE_VAR_NAMES } from '../../utils/textSizeVars'
import { withOffscreenStage } from './offscreenStageMount'
import { readSlideBitmap, recordSlideBitmapTiming, SLIDE_IDENTITY_ATTRIBUTE, SLIDE_REFLOW_ATTRIBUTE, slideBitmapKey, slideBitmapStoreSize, writeSlideBitmap } from './slideBitmapStore'
import { SplitLayout } from './SplitLayout'

/**
 * Pre-renders every pane of every stage into `slideBitmapStore`, once at kiosk startup, by mounting
 * each stage off-screen and photographing its panes where they stand.
 *
 * **The geometry comes for free.** `withOffscreenStage` mounts a real `SplitLayout` at the live
 * viewport size, so every pane inside it is already laid out at exactly the box it will occupy at that
 * stage — no rect arithmetic, no aspect buckets, no second source of truth to drift from
 * `computeLayoutGeometry`. This is the same machinery `warmShrinkScales` already uses for the same
 * reason, and the two are deliberately separate passes rather than one: a failure in either must not
 * cost the other its results.
 *
 * **Everything here is off the transition path, by construction.** Capture is expensive — the report
 * clocks a full-screen `html-to-image` capture at 250ms on a 10-core desktop, against this TV's 4
 * cores, which is why §4 rules out *live* capture as a way to hide a stall. Paying it once at boot,
 * before the rotation has reached anything, is what makes it affordable.
 *
 * Stages are warmed **sequentially**, never concurrently, matching `warmShrinkScales`/
 * `captureScreenPreviews`: mounting N live `SplitLayout` instances at once would put every one of
 * their data subscriptions and animations on the main thread simultaneously, on the exact device this
 * whole effort exists to keep responsive.
 *
 * Failure is always non-fatal, at every level — a stage that throws is skipped, a pane that fails to
 * capture is skipped, and the result is simply that those panes render live through their transitions
 * exactly as they did before this existed. A missing bitmap is a performance regression, never a
 * blank pane.
 *
 * @returns How many bitmaps this pass added.
 */
export async function warmSlideBitmaps(screen: ScreenConfig, defaultPaneLanguage: LanguageCode): Promise<number> {
  const stageCount = screen.useStages ? Math.max(1, screen.stageCount ?? 1) : 1
  const size = { width: window.innerWidth, height: window.innerHeight }
  if (size.width <= 0 || size.height <= 0) return 0

  const before = slideBitmapStoreSize()
  // Resolved once for the whole pass and reused by every capture — see `ensureFontEmbedCss`.
  let fontEmbedCSS: string | null | undefined

  for (let stage = 1; stage <= stageCount; stage++) {
    await withOffscreenStage(
      createElement(SplitLayout, {
        screen,
        stage,
        defaultPaneLanguage,
        // Matches `warmShrinkScales`/`ScreenPreviewCaptureCanvas`: the persisted per-slot sizes, not
        // whatever an open editor happens to be previewing.
        resolveTextSizes: (leafId, textSizeStage, content) => resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, leafId, textSizeStage)),
        captureMode: true,
      }),
      size,
      async (container) => {
        const panes = Array.from(container.querySelectorAll<HTMLElement>(WARM_ONLY_REFLOWING_PANES ? `[data-pane-id][${SLIDE_REFLOW_ATTRIBUTE}]` : '[data-pane-id]'))
        // Resolved only once a pane actually needs capturing — a stage (or a whole screen) with nothing
        // re-flowing must not pay the font inlining at all, which is the single most expensive step here.
        if (panes.length === 0) return
        if (fontEmbedCSS === undefined) fontEmbedCSS = await ensureFontEmbedCss(container)
        for (const pane of panes) {
          await capturePane(pane, screen, stage, fontEmbedCSS)
        }
      },
      (error) => console.warn(`[warmSlideBitmaps] stage ${stage} of screen "${screen.screenID}" failed to warm — its panes will render live instead.`, error),
    )
  }
  return slideBitmapStoreSize() - before
}

/**
 * **Experiment (2026-08-17) — capture only panes whose content actually re-flows at a new box size.**
 *
 * This is the first of the two cuts the consolidated report's fact 26 names as prerequisites for
 * reviving this feature at all: the boot warm was capturing every pane of every stage, up to 99
 * `html-to-image` captures at `devicePixelRatio` 2 on 4 cores while the rotation was already playing,
 * producing measured worst frames of 3620/3500/3540ms. A bitmap of a non-re-flowing pane can never be
 * displayed — `LayoutPane`'s `reflowHideEligible` only hides a pane whose kind is in the `usesFontScale`
 * set — so those captures were pure cost with no possible benefit.
 *
 * See `SLIDE_REFLOW_ATTRIBUTE` for how the set is identified (published by the live pane, not
 * re-derived here) and for the counts per fixture.
 *
 * Flip to `Boolean(0)` to restore the capture-everything behaviour fact 26 measured. Never write it as
 * a literal `true` — see `LayoutPane.tsx`'s `SUPPRESSED_SKIPS_LAYOUT`.
 */
const WARM_ONLY_REFLOWING_PANES = Boolean(1)

/**
 * How long a single pane's capture may run before it is abandoned.
 *
 * A bound is required for correctness, not politeness: `toBlob` was observed neither resolving nor
 * rejecting on the TV (fact 21, trap 2 — it inlines every `@font-face` source, and before fonts were
 * self-hosted that meant ~100 cross-origin subset files). A hang must end as a skipped pane, not as a
 * warm pass that never finishes and silently leaves every later stage uncaptured.
 */
const CAPTURE_TIMEOUT_MS = 10_000

/** Same generous bound as the capture's own, for the once-per-pass font inlining — see `ensureFontEmbedCss`. */
const FONT_EMBED_TIMEOUT_MS = 30_000

/**
 * How long to wait for a pane's shrink-to-fit search to finish before photographing it.
 *
 * **A capture taken mid-search is wrong forever.** `withOffscreenStage`'s settle sequence waits a fixed
 * ~1.6s, but `useShrinkToFitFontScale`'s search is frame-sliced at one probe per animation frame
 * (`ARM_A_DEFERRED_SEARCH`) and needs ~16 probes for content below `MIN_LEGIBLE_SCALE` — which a 55-item
 * catalogue always is. During the warm pass this device is running 4 cores flat out, so those frames are
 * slow and a fixed duration is not a guarantee. Observed directly: a settled screencap of `Empty test`'s
 * stage 11 (a 778x486 pane) showed the menu running off the bottom of its own pane, because the shutter
 * fired while the search was still stepping down. Nothing detects that afterwards — the bitmap simply is
 * the truncated menu from then on, and every frame metric reports it as a success (consolidated report
 * fact 21, trap 3).
 *
 * A duration is still the outer bound, because a pane whose content genuinely cannot fit never stops
 * overflowing and must not block the pass forever. Reaching it means capturing what live DOM would have
 * shown anyway, which is the correct thing to degrade to.
 */
const SHRINK_SETTLE_TIMEOUT_MS = 4_000

/**
 * How many consecutive animation frames the applied type scale must be **unchanged** before the search is
 * considered finished.
 *
 * The scale is what the search writes on every probe, so "it stopped changing" is the search's own
 * completion signal, read from the DOM rather than plumbed out of the hook. Eight frames is comfortably
 * more than the one-probe-per-frame cadence and still under 200ms on a 50Hz panel.
 */
const SHRINK_STABLE_FRAMES = 8

/**
 * The inlined `@font-face` CSS for this page's web fonts, resolved at most once per warm pass.
 *
 * An SVG `foreignObject` renders in an isolated context that cannot reach the page's own font
 * resources, so `html-to-image` base64-inlines every `@font-face` source into each capture. Doing that
 * per pane would repeat the single most expensive part of the pipeline for every pane on every stage.
 * Since fonts are now self-hosted and same-origin (§5 fix 10) this is fast — 70KB rather than 198KB,
 * and a first capture of ~5s rather than 30-60s+ — but "fast" is not "free" times pane-count.
 *
 * A `null` result degrades to `skipFonts`: a bitmap in a fallback typeface still beats no bitmap, and
 * it only ever shows for the ~0.3s a pane is in motion.
 */
async function ensureFontEmbedCss(node: HTMLElement): Promise<string | null> {
  return Promise.race([
    // `woff2` alone — this WebView is Chromium 116 (report §1) and has supported it for years, so
    // every other format would be fetched and inlined without anything ever using it.
    getFontEmbedCSS(node, { preferredFontFormat: 'woff2' }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FONT_EMBED_TIMEOUT_MS)),
  ])
}

/** One animation frame, as a promise — the cadence the shrink search itself advances at. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * Blocks until this pane's shrink-to-fit search has stopped changing the applied type scale, and
 * reports how far the content still overflows once it has.
 *
 * See `SHRINK_SETTLE_TIMEOUT_MS` for why a fixed settle is not enough. The signal is the hook's own
 * output: `useShrinkToFitFontScale` writes the scaled `--slide-*-size` values inline on the inner
 * element on every probe, so those values holding still *is* the search having converged. Read off the
 * inline style rather than the computed one, which is both cheaper and exactly what the hook writes.
 *
 * A settled-but-still-overflowing pane is given the remaining time rather than captured immediately: the
 * search deliberately re-opens below `MIN_LEGIBLE_SCALE` when nothing in the preferred range fits (the
 * `'floor'` step), and that re-opening looks momentarily like a settled state.
 *
 * @returns Pixels of vertical overflow remaining, so the caller can record whether this bitmap is a
 *   picture of content that actually fits. `0` means it fits.
 */
async function waitForShrinkToSettle(pane: HTMLElement): Promise<number> {
  const outer = pane.querySelector<HTMLElement>('.split-layout__pane-content')
  const inner = pane.querySelector<HTMLElement>('.split-layout__pane-content-inner')
  if (!outer || !inner) return 0

  const readScale = () => SLIDE_SIZE_VAR_NAMES.map((name) => inner.style.getPropertyValue(name)).join('|')
  /** Matches `fitsAt`'s own measured element exactly, so this asks the same question the search does. */
  const overflow = () => {
    const measured = (inner.firstElementChild as HTMLElement | null) ?? inner
    return Math.max(0, measured.scrollHeight - outer.clientHeight)
  }

  const deadline = performance.now() + SHRINK_SETTLE_TIMEOUT_MS
  let stableFrames = 0
  let previous = readScale()

  while (performance.now() < deadline) {
    await nextFrame()
    const current = readScale()
    if (current === previous) {
      stableFrames++
    } else {
      stableFrames = 0
      previous = current
    }
    if (stableFrames >= SHRINK_STABLE_FRAMES) {
      const remaining = overflow()
      if (remaining === 0) return 0
      // Settled but overflowing — let the clock run in case the search re-opens below the floor.
      stableFrames = 0
    }
  }
  return overflow()
}

/**
 * Captures one pane as it currently stands and stores it against its own (screen, pane, stage,
 * content) address.
 *
 * **Bodies are hidden before the shutter.** A slide that declares `data-slide-body` (see
 * `LayoutPane.tsx`'s `BODY_ONLY_REFLOW`) is deliberately photographed *without* it: during a resize
 * that body is faded out and out of layout, so a bitmap containing it would put the departures back on
 * screen at exactly the moment the design removes them. What the bitmap has to carry is the chrome —
 * the brand logo, the stop name — which is what stays visible throughout.
 *
 * Captured at the **effective** device pixel ratio, not a flat 1 and not raw `devicePixelRatio`. The
 * point is to match the backing store exactly: too low and the bitmap is visibly softer than the live
 * DOM it replaces, which makes the bitmap-to-live swap *pop* at the moment the pane settles — the one
 * moment a viewer is looking straight at it; too high and it burns capture time and decoded memory on
 * pixels the surface cannot show. With the default `width=device-width` those are the same number
 * (the TV's 1920x1080 store behind a 960x540 CSS viewport ⇒ ratio 2). With a forced layout viewport
 * (`DisplayRenderWidth`) they are not: at `width=1920` that same store is 1 device px per CSS px, and
 * capturing at the raw `devicePixelRatio` of 2 would quadruple the pixel count for no visible gain.
 * See `effectiveDevicePixelRatio`.
 */
async function capturePane(pane: HTMLElement, screen: ScreenConfig, stage: number, fontEmbedCSS: string | null): Promise<void> {
  const paneId = pane.getAttribute('data-pane-id') as PaneId | null
  if (!paneId) return
  const width = pane.clientWidth
  const height = pane.clientHeight
  if (width <= 0 || height <= 0) return

  // Read off the element rather than re-derived from `screen` — the live pane publishes the fingerprint
  // it will later look up with, so the two cannot disagree. See `SLIDE_IDENTITY_ATTRIBUTE`.
  const contentFingerprint = pane.getAttribute(SLIDE_IDENTITY_ATTRIBUTE)
  if (!contentFingerprint) return
  const key = slideBitmapKey(screen.screenID, paneId, stage, contentFingerprint)

  // Never re-capture an address that already has a picture. Beyond saving ~6s, this is a correctness
  // guard: under `SLIDE_BITMAP_AT_REST` a pane that already has a capture renders *as* that capture with
  // its shrink hooks switched off, so photographing it a second time would photograph an unshrunk pane
  // and overwrite a good bitmap with a broken one.
  if (readSlideBitmap(key)) return

  // Must happen before the shutter, never after — see `waitForShrinkToSettle`.
  const overflowPx = await waitForShrinkToSettle(pane)

  const bodies = Array.from(pane.querySelectorAll<HTMLElement>('[data-slide-body]'))
  const restore = bodies.map((body) => body.style.visibility)
  // `visibility`, not `display`/`content-visibility`: the chrome around it must keep the exact
  // position and size it has at rest, and removing the body from layout would let the chrome reflow
  // into the space it left — producing a bitmap that does not line up with the live DOM it replaces.
  for (const body of bodies) body.style.visibility = 'hidden'

  const pixelRatio = effectiveDevicePixelRatio()
  try {
    const captureStart = performance.now()
    const blob = await Promise.race([
      toBlob(pane, {
        width,
        height,
        cacheBust: false,
        pixelRatio,
        ...(fontEmbedCSS ? { fontEmbedCSS } : { skipFonts: true }),
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)),
    ])
    const captureMs = performance.now() - captureStart
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.src = url
    // Decoded here so the decode never lands on a transition — see `SlideBitmap.image` and fact 7.
    const decodeStart = performance.now()
    await image.decode()
    const decodeMs = performance.now() - decodeStart
    writeSlideBitmap(key, { url, image, width, height })
    // See `SlideBitmapTiming` — the per-pane capture cost on this device is the number that decides
    // whether captures can be spread across idle dwells or need a lower pixel ratio.
    recordSlideBitmapTiming({
      paneId,
      stage,
      captureMs: Math.round(captureMs),
      decodeMs: Math.round(decodeMs),
      bytes: blob.size,
      box: `${width}x${height}`,
      devicePixels: `${Math.round(width * pixelRatio)}x${Math.round(height * pixelRatio)}`,
      overflowPx,
    })
  } catch {
    // Non-fatal by design: this pane renders live through its transitions, as before.
  } finally {
    bodies.forEach((body, index) => {
      body.style.visibility = restore[index]
    })
  }
}
