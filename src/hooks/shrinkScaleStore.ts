/**
 * **Arm B (experiment, 2026-08-16)** — a process-wide store of already-resolved shrink-to-fit font
 * scales, shared across every `useShrinkToFitFontScale` instance instead of each pane keeping its
 * own private cache.
 *
 * The point is *seeding*. `useShrinkToFitFontScale`'s search is cheapest by far when it starts from
 * the right answer and merely re-confirms it (three probes rather than nine — see that hook's own
 * `SEED_PROBE_MARGIN`), but a per-instance cache is empty on the pass that matters most: a pane's
 * very first render, and every render after a kiosk restart. A shared, pane-addressed store can be
 * filled ahead of time (see `warmShrinkScales.ts`, which renders every stage off-screen once at boot
 * and lets the real hooks populate this) so that first pass is already warm.
 *
 * **Keyed by aspect ratio, never by absolute pixels.** All slide text is sized in `cqmin` (see
 * `textSizesToCssVars`), i.e. as a percentage of the pane's own smaller dimension — so a pane that is
 * 30% x 40% of the screen renders the same text-to-box ratio at 960x540 as at 1920x1080, and the
 * scale that fits transfers between them. That is what lets a warm-up pass at one size seed a live
 * render at another. It is *not* perfectly scale-invariant — `CatalogueSlide`'s
 * `minmax(max(160px, 14ch), 1fr)` and `EventMonthSlide`'s `column-width: max(320px, 26ch)` are
 * absolute px floors that change how many columns fit at different absolute sizes — which is exactly
 * why `warmShrinkScales` renders at the live viewport size rather than a fixed reference one.
 */

/** Ceiling on stored entries. A screen's pane count times its stage count is small; this only has to stop an editor session walking a divider through thousands of distinct aspect ratios from growing the map without bound. Evicts least-recently-written first. */
const STORE_LIMIT = 512

/** Aspect ratios are bucketed to 0.5% before keying, so a one-pixel layout jitter doesn't miss an otherwise-identical entry. */
const ASPECT_BUCKETS = 200

const store = new Map<string, number>()

/** Identifies one pane's own resolved scale, at one stage, at one box shape, for one exact content. */
export interface ShrinkScaleKey {
  screenID: string
  paneId: string
  stage: string
  /** The pane box's own width/height ratio — see this module's own doc comment for why this, rather than its pixel size, is what the answer is keyed on. */
  aspect: number
  /**
   * A fingerprint of *what is inside* the pane — see `fingerprintContent`.
   *
   * **Arm H (2026-08-17).** Without this the address pins down the box but not its contents, so a
   * stored scale could only ever be used as a *seed* for a search that then re-confirmed it. Folding
   * content into the key makes a hit self-evidently valid: same pane, same stage, same shape, same
   * content resolves to the same scale, so the search can be skipped outright rather than re-run.
   *
   * It has to live in the key rather than in a hook-local "has the content changed since I last
   * probed?" ref, because `useCrossfadeSlot` mounts a **fresh** slide instance on every transition
   * (consolidated report fact 16) — per-instance memory is always empty on exactly the pass that
   * matters. This is the same cross-mount-cache shape as `qrCodePath.ts`'s `geometryCache`.
   */
  content: string
}

/**
 * Reduces a pane's own content-identity string (`LayoutPane.tsx`'s `shrinkDep0`/`shrinkDep1`, already
 * a `JSON.stringify` of the slot's content plus its text-size vars) to a short, stable token.
 *
 * Hashed rather than used whole only to keep the map's keys small — these strings run to hundreds of
 * characters for a catalogue. A collision would hand one content another's scale, which the 2-second
 * safety poll's own re-derive corrects within one interval; at the handful of entries a screen
 * actually holds, the probability is negligible either way.
 */
export function fingerprintContent(parts: readonly unknown[]): string {
  const source = parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part) ?? '')).join('\u0000')
  // FNV-1a, 32-bit — small, dependency-free, and well-distributed over the short ASCII JSON these are.
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function serialize(key: ShrinkScaleKey): string {
  return `${key.screenID}|${key.paneId}|${key.stage}|${Math.round(key.aspect * ASPECT_BUCKETS)}|${key.content}`
}

/**
 * Derives a store key from a pane's own DOM position, so nothing has to be threaded through
 * `LayoutPane`'s already very wide prop list. Reads the `data-screen-id`/`data-stage` attributes
 * `SplitLayout` publishes and the `data-pane-id` each `LayoutPane` does — the same observational
 * attributes the QA harnesses already key off.
 *
 * `width`/`height` are passed in rather than read here, because the caller has already read them for
 * its own purposes; reading them again after a style write would force a synchronous layout, which is
 * the entire cost this experiment exists to avoid.
 *
 * Returns `null` when any part of the address is missing (a pane rendered outside a `SplitLayout`, or
 * a degenerate zero-height box) — callers then simply fall back to their own local cache.
 */
export function shrinkScaleKeyFromDom(outer: HTMLElement, width: number, height: number, content: string): ShrinkScaleKey | null {
  if (height <= 0 || width <= 0) return null
  const paneId = outer.closest('[data-pane-id]')?.getAttribute('data-pane-id')
  const layout = outer.closest('.split-layout')
  const screenID = layout?.getAttribute('data-screen-id')
  const stage = layout?.getAttribute('data-stage')
  if (!paneId || !screenID || !stage) return null
  return { screenID, paneId, stage, aspect: width / height, content }
}

/**
 * Drops one entry, so the next pass re-probes instead of trusting it.
 *
 * Used when a pane's DOM content changed *without* its content-identity string changing — async
 * slide data arriving (a transit board's departures, an image finishing load), which the
 * `MutationObserver` sees but `fingerprintContent` cannot, since the fingerprint is built from the
 * stored slot config rather than the rendered result. Cross-mount for the same reason the store is.
 */
export function clearShrinkScale(key: ShrinkScaleKey): void {
  store.delete(serialize(key))
}

/** The scale this pane last resolved at this shape, if anything ever has. */
export function readShrinkScale(key: ShrinkScaleKey): number | undefined {
  return store.get(serialize(key))
}

/** Records `scale` as this pane's answer, most-recently-written last so the eviction below drops the stalest entry. */
export function writeShrinkScale(key: ShrinkScaleKey, scale: number): void {
  const serialized = serialize(key)
  store.delete(serialized)
  store.set(serialized, scale)
  while (store.size > STORE_LIMIT) store.delete(store.keys().next().value as string)
}

/** How many scales are currently held — read by the QA harnesses to confirm a warm-up pass actually populated anything, rather than silently rendering nothing. */
export function shrinkScaleStoreSize(): number {
  return store.size
}

/** Drops everything. Only used when a screen's own definition changes underneath the store, where every stored answer was resolved against a layout that no longer exists. */
export function clearShrinkScales(): void {
  store.clear()
}
