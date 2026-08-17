import { fingerprintContent } from '../../hooks/shrinkScaleStore'
import type { PaneId } from '../../types/screen'

/**
 * Process-wide store of pre-rendered pane bitmaps, one per (screen, pane, stage, content), used to
 * carry a pane through the frames where its box is actually **moving**.
 *
 * **Why a bitmap only for the moving frames.** A pane's cost while its box animates is layout, not
 * paint: it sits inside a `container-type: size` pane, so every `cqmin` font size re-resolves per
 * frame and the whole slide re-flows (consolidated report fact 19). A rasterised copy has no layout to
 * redo — scaling it is a compositor transform. The trade is that a bitmap is frozen, which is
 * acceptable for the ~0.3s a glide lasts and unacceptable at rest, so the live DOM comes straight back
 * once the pane settles.
 *
 * **Captured at the box the pane is about to occupy**, never at a fixed reference size. That is what
 * makes this different from the earlier `CatalogueBitmap` experiment, whose single viewport-sized
 * raster had to be *fitted* into whatever box it landed in and letterboxed badly at extreme aspect
 * ratios (fact 21, trap 4) — observed fit scales down to 0.015. Capturing per (pane, stage) means the
 * geometry is known ahead of time and every bitmap is drawn at the shape it was rendered for.
 *
 * **Module-level, not component state** — `useCrossfadeSlot` mounts a fresh slide instance on every
 * transition (fact 16), so anything held per-instance is empty on exactly the pass that needs it. This
 * is the same cross-mount-cache shape as `qrCodePath.ts`'s `geometryCache` and `shrinkScaleStore`, and
 * it exists for the same reason; getting this wrong is what made the first bitmap arm bimodal.
 */

/** One pre-rendered pane, already decoded and resident. */
export interface SlideBitmap {
  /** Object URL for the captured PNG. Revoked when the entry is evicted. */
  url: string
  /**
   * The decoded image, held so the decode never happens on a transition.
   *
   * Report fact 7 measured a 1920x1080 PNG decode at **545-598ms on this hardware** — the same order
   * as the stall this exists to remove. An `<img>` that is only assigned a `src` at the moment it is
   * needed would pay that cost inside the transition, turning the fix into a worse version of the
   * problem. `warmSlideBitmaps` awaits `decode()` before storing, and keeping this reference alive is
   * what stops the browser discarding the decoded frame afterwards.
   */
  image: HTMLImageElement
  /** CSS-pixel size the capture was taken at — the pane's own box at that stage. The layer renders at exactly this and scales with a transform. */
  width: number
  height: number
}

/** Identifies one pane's own rendered appearance, at one stage, for one exact content. */
export interface SlideBitmapKey {
  screenID: string
  paneId: PaneId
  stage: number
  /**
   * Fingerprint of what the pane is showing — see `fingerprintContent`.
   *
   * In the address rather than checked separately so a stale bitmap is simply a miss: an edited
   * catalogue or a re-pointed transit stop produces a different key and therefore no hit, instead of a
   * hit on a picture of the old content. There is no invalidation path to get wrong.
   */
  content: string
}

function serialize(key: SlideBitmapKey): string {
  return `${key.screenID}|${key.paneId}|${key.stage}|${key.content}`
}

/**
 * Ceiling on stored bitmaps.
 *
 * Each entry is a decoded full-pane image held resident, so this is real memory on a device with
 * little of it — a 960x540 pane at `devicePixelRatio` 2 is ~8MB decoded. A screen's own pane-count
 * times stage-count is what actually needs to be resident; 24 covers every fixture in `§9` with room
 * to spare, and evicting the stalest is harmless (that pane simply renders live through its next
 * transition, exactly as it did before this existed).
 */
const STORE_LIMIT = 24

const store = new Map<string, SlideBitmap>()

/**
 * The attribute `LayoutPane` publishes its own content fingerprint on, and the **only** thing the warm
 * pass reads it from.
 *
 * Both sides of this cache have to agree byte-for-byte on what "the same content" means, and they
 * derive it from different places — the live pane from its own resolved crossfade snapshot, the warm
 * pass from a `ScreenConfig` it re-resolves itself. Computing it twice is how the two silently stop
 * matching: every lookup misses, every pane renders live, and the arm measures as though the whole
 * feature were absent while looking perfectly healthy. That exact failure has now happened three times
 * in this investigation (fact 16's per-instance caches, fact 23's store key). Publishing it once and
 * reading it back removes the possibility rather than documenting it.
 */
export const SLIDE_IDENTITY_ATTRIBUTE = 'data-slide-identity'

/**
 * The attribute `LayoutPane` publishes when this pane's own content kind **re-flows at a new box
 * size** (`usesFontScale` — transit, weather, catalogue, event-month), and the only thing the warm
 * pass selects on.
 *
 * Why the warm pass needs it: capturing *every* pane of every stage is what made this feature a net
 * regression. `Empty test` is 11 stages x 9 panes, i.e. up to 99 `html-to-image` captures at
 * `devicePixelRatio` 2 on 4 cores while the rotation is already playing, measured as 3.5-second frames
 * (see `SLIDE_BITMAP_ENABLED`). Only a re-flowing pane is ever hidden through a resize in the first
 * place (`LayoutPane`'s `reflowHideEligible` ANDs `reflowHide` with exactly this test), so a bitmap of
 * anything else can never be shown and is pure cost. On `Empty test` that is 11 captures rather than
 * 99; on `Ny test`, 12 rather than 24.
 *
 * Published rather than re-derived from `ScreenConfig` in the warm pass for the same reason
 * `SLIDE_IDENTITY_ATTRIBUTE` is: two implementations of "does this pane reflow?" drift, and the
 * failure mode is silent — the warm pass captures a set of panes that no longer matches the set that
 * hides, so bitmaps exist but are never shown.
 */
export const SLIDE_REFLOW_ATTRIBUTE = 'data-slide-reflows'

/**
 * **QA instrumentation.** Per-capture cost, in ms, recorded by `warmSlideBitmaps`.
 *
 * The one number this investigation has never had: the consolidated report knows a full-screen capture
 * costs 250ms on a 10-core desktop and that the first TV capture takes ~5s including font inlining,
 * but nothing measures *one pane's* capture on the TV at `devicePixelRatio` 2. That number is what
 * decides whether captures can be spread across idle dwells (cheap enough to hide) or need a lower
 * pixel ratio, so it is worth the handful of bytes to collect while an arm is running anyway.
 *
 * Read-only, exposed on `window` for the same reason `slideBitmapStoreSize` is — the TV runs a release
 * build with no attachable DevTools (report §1).
 */
export interface SlideBitmapTiming {
  paneId: string
  stage: number
  /** Wall-clock ms for `toBlob` alone — rasterise plus PNG encode. */
  captureMs: number
  /** Wall-clock ms for `image.decode()` alone, which report fact 7 measures at 545-598ms for a full-screen PNG. */
  decodeMs: number
  /** Encoded PNG size. A blank capture compresses to a few hundred bytes; a real pane runs to tens or hundreds of KB, so this is what separates "captured nothing" from "captured something". */
  bytes: number
  /** CSS-pixel box captured, and the device-pixel size that produced it (`pixelRatio` applied). */
  box: string
  devicePixels: string
  /**
   * Pixels of vertical overflow still present when the shutter fired — `0` for a capture of content that
   * genuinely fits.
   *
   * Recorded because a truncated capture is permanent and invisible to every frame metric (fact 21,
   * trap 3): a bitmap of a half-shrunk menu measures *better* than a correct one. This is the number that
   * says whether the warm waited long enough, and the only one that would ever say so.
   */
  overflowPx: number
}

const captureTimings: SlideBitmapTiming[] = []

/** Records one pane's capture cost — see `SlideBitmapTiming`. Bounded so a long-running kiosk cannot grow it without limit. */
export function recordSlideBitmapTiming(timing: SlideBitmapTiming): void {
  captureTimings.push(timing)
  while (captureTimings.length > 200) captureTimings.shift()
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __qaSlideBitmapTimings: () => SlideBitmapTiming[] }).__qaSlideBitmapTimings = () => [...captureTimings]
}

/**
 * Whether to capture pane bitmaps at boot and show them while a pane's box is moving.
 *
 * **Shipped off. Re-measured on the TV 2026-08-17 with the warm pass made selective (see
 * `SLIDE_REFLOW_ATTRIBUTE`), and the verdict is unchanged — the selective warm did not rescue it:**
 *
 * | arm | worst | debt | e / h / i | n |
 * |---|---:|---:|---|---:|
 * | L — baseline, this flag off, same tree | 180 ms | 720 ms | 140 / 20 / 600 | 75 |
 * | **M — this flag on, steady state** | 220 ms | 740 ms | 120 / 20 / 620 | 231 |
 * | M — during the warm pass | 380 ms | **2110 ms** | 830 / 380 / 790 | 24 |
 *
 * Steady state is **flat** under §2's own rule, with the pipeline verified live rather than assumed
 * (`slideBitmapProbe`: every layer mounted with a decoded image at its captured size, scale 1 at rest).
 * So this is not a broken arm measuring as a no-op — it is a working one with nothing left to win, for
 * the reason below.
 *
 * **And the warm pass is far worse than fact 26 knew.** Per-capture cost on this device, measured for
 * the first time (`recordSlideBitmapTiming`): **4588-9542 ms per pane**, 53.6 s for nine captures.
 * `image.decode()` is trivial next to it (29-409 ms). Critically it barely scales with area — a
 * 212x128 device-pixel capture cost 4704 ms against 8844 ms for 960x1080 — so the cost is a fixed
 * per-capture overhead, not pixel count, and **lowering `pixelRatio` cannot fix it**. Selecting only
 * re-flowing panes cut `Empty test` from 99 captures to 9 and still left 2110 ms of median debt and a
 * 3920 ms worst frame during the warm. Nine ruinous events instead of ninety-nine is still ruinous.
 *
 * The consequence for any future revival: a capture that costs 4.6-9.5 s cannot be hidden in a ~2.4 s
 * stage dwell either, so "capture lazily during idle instead of at boot" does not work as stated. A
 * bitmap-at-rest design needs a fundamentally cheaper capture path first. The next thing to test is
 * whether the fixed overhead is the 70 KB of inlined `@font-face` CSS being re-parsed and its woff2
 * re-decoded inside every capture's isolated SVG context — if so, `skipFonts` would localise it.
 *
 * The earlier measurement, kept because it is what fact 26 records:
 *
 * The idea was sound and the implementation works end-to-end (verified on desktop: 16 bitmaps warmed
 * across 4 stages, correctly addressed, layers mounting during transitions with every image decoded).
 * Measurement on the TV says it costs a great deal and buys nothing:
 *
 * | arm | worst | debt | e / h / i |
 * |---|---:|---:|---|
 * | hide-only (arm J, `SLIDE_BITMAP_ENABLED` off) | 180 ms | 720 ms | 120 / 20 / 620 |
 * | **bitmaps on (arm K)** | **300 ms** | **1840 ms** | 740 / 340 / 700 |
 *
 * Two independent reasons, both fundamental rather than tunable:
 *
 * 1. **The warm pass is ruinous on this device.** `Empty test` is 11 stages x 9 panes, so up to 99
 *    `html-to-image` captures at `devicePixelRatio` 2, on 4 cores, *while the rotation is already
 *    playing*. Individual windows during the warm measured worst frames of **3620 ms, 3500 ms and
 *    3540 ms** — two orders of magnitude past budget, and far worse than the stall being fixed.
 *    `warmShrinkScales` gets away with the same pattern only because resolving a scale is cheap next
 *    to rasterising a pane.
 * 2. **There was nothing left to win.** Once `SUPPRESSED_SKIPS_LAYOUT` takes hidden content out of
 *    layout (fact 22), `holding` debt is already **20 ms** against the empty fixture's own floor of 0.
 *    A bitmap can only ever address the moving frames, so its entire available headroom was that
 *    20 ms. The residual ~600 ms is the shrink search in `idle` (fact 23), which a bitmap covering the
 *    moving frames does not touch by construction — the design deliberately returns to live DOM at
 *    rest, and live DOM is what runs the search.
 *
 * Steady state after warming measured ~700-900 ms, i.e. flat against arm J under §2's own rule (a
 * change is real only if the median moves >30% with non-overlapping ranges).
 *
 * The *pipeline* itself is correct and is the reusable part: capture at
 * the target box (so a bitmap is drawn 1:1 and the aspect problem of fact 21 trap 4 cannot arise),
 * fingerprint published on the element and read back rather than derived twice, decode forced at warm
 * time so fact 7's 545-598 ms never lands on a transition. If a future pane kind turns out to have
 * genuinely expensive *paint* during motion — which none currently does — this is what to switch on,
 * after first making the warm pass selective and cheaper.
 *
 * Never write this as a literal `true` — see `LayoutPane.tsx`'s `SUPPRESSED_SKIPS_LAYOUT`.
 */
export const SLIDE_BITMAP_ENABLED = Boolean(0)

/** Builds a key from an already-computed content fingerprint — see `SLIDE_IDENTITY_ATTRIBUTE`. */
export function slideBitmapKey(screenID: string, paneId: PaneId, stage: number, contentFingerprint: string): SlideBitmapKey {
  return { screenID, paneId, stage, content: contentFingerprint }
}

/** Computes the fingerprint `LayoutPane` publishes, from the same content-identity array it feeds the shrink hooks. */
export function slideContentFingerprint(contentIdentity: readonly unknown[]): string {
  return fingerprintContent(contentIdentity)
}

export function readSlideBitmap(key: SlideBitmapKey): SlideBitmap | undefined {
  const serialized = serialize(key)
  const hit = store.get(serialized)
  if (!hit) return undefined
  // Re-insert so this counts as most-recently-used against the eviction below.
  store.delete(serialized)
  store.set(serialized, hit)
  return hit
}

export function writeSlideBitmap(key: SlideBitmapKey, bitmap: SlideBitmap): void {
  const serialized = serialize(key)
  const previous = store.get(serialized)
  if (previous) URL.revokeObjectURL(previous.url)
  store.delete(serialized)
  store.set(serialized, bitmap)
  while (store.size > STORE_LIMIT) {
    const oldestKey = store.keys().next().value as string
    const oldest = store.get(oldestKey)
    // Object URLs are not garbage collected on their own — dropping the map entry without this leaks
    // the underlying blob for the life of the page, which on a kiosk means for weeks.
    if (oldest) URL.revokeObjectURL(oldest.url)
    store.delete(oldestKey)
  }
}

/** How many bitmaps are resident — read by the QA probe to tell "the warm pass populated nothing" from "the warm pass worked and the bitmaps did not help", which are otherwise identical in frame numbers. */
export function slideBitmapStoreSize(): number {
  return store.size
}

// Read-only window hook, for the same reason `shrinkScaleStoreSize` exists: the TV runs a release
// build with no attachable DevTools (report §1), and "the warm pass captured nothing" is
// indistinguishable from "the bitmaps did not help" by frame numbers alone. Exposes keys rather than
// just a count, because a populated store whose keys never match what the panes look up is its own
// distinct failure — and the one this cache has hit three times in other forms.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __qaSlideBitmaps: () => { size: number; keys: string[] } }).__qaSlideBitmaps = () => ({ size: store.size, keys: [...store.keys()] })
}

/** Drops everything, revoking each object URL. For when a screen's own definition changes underneath the store and every captured pane belongs to a layout that no longer exists. */
export function clearSlideBitmaps(): void {
  for (const bitmap of store.values()) URL.revokeObjectURL(bitmap.url)
  store.clear()
}
