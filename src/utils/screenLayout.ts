import type { RatioField, ScreenConfig, SlideTransitionDirection } from '../types/screen'
import { resolveStageValue, writeStageCheckpoint } from './screenStages'

/** One or more ratio fields' new values at once — a single-divider drag only ever touches one, but a combined cross handle (see `crossHandle`) moves both of an arrangement's dividers together. */
export type RatioPatch = Partial<Record<RatioField, number>>

/** Never let a pane collapse to nothing (or swallow its neighbor) — both dragging and the admin's arrow nudges clamp to this range. */
export const MIN_RATIO = 10
export const MAX_RATIO = 90

export function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

/** Dead center — the value a divider's own field takes at an even 50/50 split. */
export const CENTER_RATIO = 50
/** How close (in percentage points) a value needs to get to `CENTER_RATIO` before it magnetically locks to it exactly — deliberately tight, so the snap only catches a drag/nudge that's already landing right around dead center rather than pulling in anything nearby. */
const CENTER_SNAP_THRESHOLD = 1.5

/** Locks `value` to dead-center once it's within `CENTER_SNAP_THRESHOLD` of it — used for a continuous pointer drag (see `dividerFieldValue`), where the position is always freshly computed from the real cursor coordinates each frame, so there's no risk of "trapping" further movement: physically dragging the pointer farther away re-escapes the snap zone on its own. */
function snapToCenter(value: number): number {
  return Math.abs(value - CENTER_RATIO) <= CENTER_SNAP_THRESHOLD ? CENTER_RATIO : value
}

/** The same magnetic snap as `snapToCenter`, but for a discrete step-based nudge (the admin form's arrow buttons) rather than a continuous pointer position — only snaps while `next` is actually *closer* to center than `previous` was, so a value already sitting exactly on 50 can still be nudged back away from it one step at a time, instead of `snapToCenter` trapping every subsequent nudge right back at center forever. */
function snapToCenterOnApproach(previous: number, next: number): number {
  const distance = Math.abs(next - CENTER_RATIO)
  if (distance > CENTER_SNAP_THRESHOLD) return next
  return distance <= Math.abs(previous - CENTER_RATIO) ? CENTER_RATIO : next
}

/** A field's current value at `stage`, clamped, falling back to an even 50/50 split when absent. */
function ratio(screen: ScreenConfig, field: RatioField, stage: number): number {
  return clampRatio(resolveStageValue(screen.ratios?.[field], stage) ?? 50)
}

/** Returns a copy of `ratios` with every field in `overrides` injected as an exact checkpoint at `stage` — used to layer a live, never-persisted override (a `resizeToFit` image's own pane-fit, or a divider actively being dragged) on top of a screen's real per-stage values for read purposes only, reusing the same timeline-resolution `ratio`/`screenDividers`/etc. already use rather than needing a parallel "flat override" code path. */
export function applyRatioOverrides(ratios: ScreenConfig['ratios'], stage: number, overrides: RatioPatch): ScreenConfig['ratios'] {
  let next = ratios
  for (const field of Object.keys(overrides) as RatioField[]) {
    const value = overrides[field]
    if (value === undefined) continue
    next = { ...next, [field]: writeStageCheckpoint(next?.[field], stage, value) }
  }
  return next
}

/** Resolves the CSS grid-template-columns/rows for a screen's current arrangement at `stage`, from its own adjustable divider ratios. Pure sizing — `grid-template-areas` (which named pane goes where) is unaffected and stays in `SplitLayout.scss`. */
export function splitGridTemplate(screen: ScreenConfig, stage: number): { gridTemplateColumns?: string; gridTemplateRows?: string } {
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (screen.slotCount === 2) {
    const split = ratio(screen, 'splitRatio', stage)
    const track = `${split}% ${100 - split}%`
    return direction === 'row' ? { gridTemplateColumns: track } : { gridTemplateRows: track }
  }

  if (screen.slotCount === 4) {
    const column = ratio(screen, 'quadColumnRatio', stage)
    const row = ratio(screen, 'quadRowRatio', stage)
    return { gridTemplateColumns: `${column}% ${100 - column}%`, gridTemplateRows: `${row}% ${100 - row}%` }
  }

  if (screen.slotCount === 3) {
    const big = ratio(screen, 'tripleBigRatio', stage)
    const small = ratio(screen, 'tripleSmallRatio', stage)
    const bigTrack = bigPosition === 'first' ? `${big}% ${100 - big}%` : `${100 - big}% ${big}%`
    const smallTrack = `${small}% ${100 - small}%`
    return direction === 'row' ? { gridTemplateRows: bigTrack, gridTemplateColumns: smallTrack } : { gridTemplateColumns: bigTrack, gridTemplateRows: smallTrack }
  }

  return {}
}

/** One divider's own drag handle: which field it adjusts, which way it resizes, its current value, and where its span sits (as insets, in %) within the arrangement — e.g. the small1/small2 divider in a 3-slot row arrangement only runs across the bottom portion, not the full height. */
export interface DividerDescriptor {
  field: RatioField
  /** `'vertical'`: a vertical divider line, dragged left/right. `'horizontal'`: a horizontal line, dragged up/down. */
  orientation: 'vertical' | 'horizontal'
  /** This divider's on-screen position, as a percentage from the container's own left/top edge — not necessarily the same number as `field`'s own value (see `inverted`). */
  value: number
  /** CSS inset percentages for the handle's own span along the axis it does *not* move on — e.g. a vertical divider's `top`/`bottom`. The axis it *does* move on is positioned separately, from `value`. */
  span: { top?: number; bottom?: number; left?: number; right?: number }
  /** True when this divider's on-screen position runs opposite to its own field's value — only `tripleBigRatio` when the big pane is second (its field is the *second* track along that axis, so the divider sits further along than the field's own share). Convert a raw drag position via `dividerFieldValue` rather than assuming `value` and the field are the same number. */
  inverted: boolean
}

/** Converts a raw on-screen position (e.g. from a pointer drag) into the value to actually write to `divider.field`, accounting for `inverted` — and magnetically snapping to dead-center once the position gets close (see `snapToCenter`), so a manual drag settles precisely on an even split instead of landing a percentage point or two off it. Never applied to the automatic `resizeToFit` image pane-fit override (`imageResizeRatioPatch`), which never calls this — that's a content-driven size, not a "moved" one. */
export function dividerFieldValue(divider: Pick<DividerDescriptor, 'inverted'>, position: number): number {
  return snapToCenter(clampRatio(divider.inverted ? 100 - position : position))
}

/** Every divider a screen's current arrangement actually has at `stage`, for rendering their drag handles — `[]` for 1 slot (nothing to divide). */
export function screenDividers(screen: ScreenConfig, stage: number): DividerDescriptor[] {
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (screen.slotCount === 2) {
    const value = ratio(screen, 'splitRatio', stage)
    return [{ field: 'splitRatio', orientation: direction === 'row' ? 'vertical' : 'horizontal', value, span: {}, inverted: false }]
  }

  if (screen.slotCount === 4) {
    return [
      { field: 'quadColumnRatio', orientation: 'vertical', value: ratio(screen, 'quadColumnRatio', stage), span: {}, inverted: false },
      { field: 'quadRowRatio', orientation: 'horizontal', value: ratio(screen, 'quadRowRatio', stage), span: {}, inverted: false },
    ]
  }

  if (screen.slotCount === 3) {
    const big = ratio(screen, 'tripleBigRatio', stage)
    const small = ratio(screen, 'tripleSmallRatio', stage)
    // The big/small divider always runs the full length of its own axis; the
    // small1/small2 divider only runs across whichever portion the two small
    // panes actually share (the rest is occupied by the big pane). When the
    // big pane is second, its own track is the *second* one along that
    // axis, so the divider's on-screen position (100 - big) runs opposite
    // to the field's own value (big) — `inverted` flags that for dragging.
    const bigInverted = bigPosition === 'second'
    const bigDividerAt = bigInverted ? 100 - big : big
    if (direction === 'row') {
      const smallSpan = bigPosition === 'first' ? { top: big, bottom: 0 } : { top: 0, bottom: big }
      return [
        { field: 'tripleBigRatio', orientation: 'horizontal', value: bigDividerAt, span: {}, inverted: bigInverted },
        { field: 'tripleSmallRatio', orientation: 'vertical', value: small, span: smallSpan, inverted: false },
      ]
    }
    const smallSpan = bigPosition === 'first' ? { left: big, right: 0 } : { left: 0, right: big }
    return [
      { field: 'tripleBigRatio', orientation: 'vertical', value: bigDividerAt, span: {}, inverted: bigInverted },
      { field: 'tripleSmallRatio', orientation: 'horizontal', value: small, span: smallSpan, inverted: false },
    ]
  }

  return []
}

/** Where a screen's own two dividers meet — a clean crosspoint for a 4-slot (2x2) arrangement, a T-junction for a 3-slot one (the small1/small2 divider only starts partway along the big/small one — see `screenDividers`) — for a combined handle that moves both fields at once. `null` for 1 or 2 slots, which only ever have a single divider with nothing to combine it with. */
export interface CrossHandleDescriptor {
  columnField: RatioField
  rowField: RatioField
  columnValue: number
  rowValue: number
  /** Whether a raw drag position needs `100 -` before it's this field's own value — see `DividerDescriptor.inverted`; only ever true for `tripleBigRatio` with the big pane second. */
  columnInverted: boolean
  rowInverted: boolean
}

export function crossHandle(screen: ScreenConfig, stage: number): CrossHandleDescriptor | null {
  if (screen.slotCount !== 3 && screen.slotCount !== 4) return null
  const dividers = screenDividers(screen, stage)
  const columnDivider = dividers.find((divider) => divider.orientation === 'vertical')
  const rowDivider = dividers.find((divider) => divider.orientation === 'horizontal')
  if (!columnDivider || !rowDivider) return null
  return {
    columnField: columnDivider.field,
    rowField: rowDivider.field,
    columnValue: columnDivider.value,
    rowValue: rowDivider.value,
    columnInverted: columnDivider.inverted,
    rowInverted: rowDivider.inverted,
  }
}

/** A cardinal nudge direction, as pressed on the admin form's 4-arrow "Resize" panel. */
export type ResizeDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Which field (if any) a given arrow direction adjusts for a screen's
 * current arrangement at `stage`, and by how much (already signed, snapped
 * and clamped) — as a ready-to-spread `ScreenConfig` patch checkpointing
 * that new value at `stage`, or `null` if that direction has no divider to
 * move (e.g. up/down for a 2-slot side-by-side row). Shared by the admin
 * form's arrow buttons; the live display's own drag handles don't need this
 * mapping since each one already knows its own field directly (see
 * `screenDividers`).
 */
export function nudgeRatio(screen: ScreenConfig, direction: ResizeDirection, stage: number, step = 1): Partial<ScreenConfig> | null {
  const isRowAxis = direction === 'up' || direction === 'down' // moves a horizontal divider line
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  const divider = screenDividers(screen, stage).find((candidate) => (candidate.orientation === 'horizontal') === isRowAxis)
  if (!divider) return null

  // A field's own value tracks its *first* track (Slot 1's share for
  // `splitRatio`, the left/top column's for the quad ratios, the small1
  // pane's for `tripleSmallRatio`) — pushing the divider toward the origin
  // (up/left) always shrinks that first track, so the sign matches the
  // arrow directly. `tripleBigRatio` is the one exception: when the big
  // pane is second, its own track is the *second* one along that axis, so
  // the relationship flips — pushing the divider up/left then *grows* the
  // (second, big) track instead of shrinking it.
  const bigPosition = screen.splitBigPosition ?? 'first'
  const fieldSign = divider.field === 'tripleBigRatio' && bigPosition === 'second' ? -sign : sign

  const current = ratio(screen, divider.field, stage)
  const next = snapToCenterOnApproach(current, clampRatio(current + fieldSign * step))
  return { ratios: { ...screen.ratios, [divider.field]: writeStageCheckpoint(screen.ratios?.[divider.field], stage, next) } }
}

/** One axis (width or height) a pane can actually be resized along — which ratio field governs it, and whether the pane's own share is that field's raw value or its complement (`100 -` it). */
export interface PaneAxis {
  field: RatioField
  isFirstShare: boolean
}

/** Which axis (or axes) of a pane's own box are governed by an adjustable ratio field at all, for `screen`'s current arrangement — the other axis (if any) is always fixed to the full container edge-to-edge (e.g. a 2-slot pane's cross-axis, or a 3-slot "big" pane's own — see `splitGridTemplate`), so it's simply omitted rather than forced to some value. */
export interface PaneResizableAxes {
  width?: PaneAxis
  height?: PaneAxis
}

/**
 * Maps `slotIndex` (0-3, in the same order `SplitLayout` renders its panes)
 * to the ratio field(s) that actually govern its own width/height, for
 * `screen`'s current arrangement — used by `imageResizeRatioPatch` to know
 * which axis (or axes) of a pane can be resized to fit an image at all.
 * Deliberately independent of `splitBigPosition`: a 3-slot arrangement's
 * "big" pane's own share is always `tripleBigRatio`'s raw value and the
 * small pair's shared cross-axis share is always its complement, regardless
 * of whether the big pane is placed first or second along the main axis —
 * only *where* it's drawn (not the numeric shares themselves) depends on
 * that.
 */
export function paneResizableAxes(screen: ScreenConfig, slotIndex: number): PaneResizableAxes {
  const direction = screen.splitDirection ?? 'row'

  if (screen.slotCount === 2) {
    const axis: PaneAxis = { field: 'splitRatio', isFirstShare: slotIndex === 0 }
    return direction === 'row' ? { width: axis } : { height: axis }
  }

  if (screen.slotCount === 4) {
    // Pane order (see `SplitLayout`'s own auto-placed 2x2 grid): 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
    const width: PaneAxis = { field: 'quadColumnRatio', isFirstShare: slotIndex === 0 || slotIndex === 2 }
    const height: PaneAxis = { field: 'quadRowRatio', isFirstShare: slotIndex === 0 || slotIndex === 1 }
    return { width, height }
  }

  if (screen.slotCount === 3) {
    if (slotIndex === 0) {
      // The "big" pane — one axis only; its cross-axis always spans the full container (see `splitGridTemplate`'s `bigTrack`).
      const axis: PaneAxis = { field: 'tripleBigRatio', isFirstShare: true }
      return direction === 'row' ? { height: axis } : { width: axis }
    }
    // Small1 (1) or small2 (2) — their own split (via `tripleSmallRatio`) plus their shared cross-axis, which comes out of the big pane's own share (so growing it here shrinks the big pane, same as dragging that divider directly).
    const ownSplit: PaneAxis = { field: 'tripleSmallRatio', isFirstShare: slotIndex === 1 }
    const sharedWithBig: PaneAxis = { field: 'tripleBigRatio', isFirstShare: false }
    return direction === 'row' ? { width: ownSplit, height: sharedWithBig } : { height: ownSplit, width: sharedWithBig }
  }

  return {}
}

/**
 * The slide-in/out direction a pane's own rotation should use by default, so
 * it only ever enters/exits through an actual screen edge and never through
 * a border it shares with a neighboring pane. A pane bordering a neighbor on
 * only one axis (a 2-slot pane, or a 3-slot arrangement's "big" one) has no
 * choice — it must slide along that axis, away from the neighbor. A pane
 * bordering a neighbor on *both* axes (3-slot small1/small2, or any of a
 * 4-slot quad's corners) has two equally valid outer edges; this always
 * picks the horizontal one, purely as a consistent tie-break (either would
 * satisfy the "never through a border" rule equally well). Unlike
 * `paneResizableAxes`, this accounts for `splitBigPosition` itself (not just
 * which ratio field governs an axis), since it needs the pane's actual
 * left/right/top/bottom placement, not just which field its share comes
 * from.
 */
export function paneDefaultSlideDirection(screen: Pick<ScreenConfig, 'slotCount' | 'splitDirection' | 'splitBigPosition'>, slotIndex: number): SlideTransitionDirection {
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (screen.slotCount === 2) {
    const isFirst = slotIndex === 0
    return direction === 'row' ? (isFirst ? 'left' : 'right') : isFirst ? 'up' : 'down'
  }

  if (screen.slotCount === 3) {
    if (slotIndex === 0) {
      // The "big" pane spans the full cross-axis — only the axis it shares with the small pair borders a neighbor, on whichever side that pair sits.
      if (direction === 'row') return bigPosition === 'first' ? 'up' : 'down'
      return bigPosition === 'first' ? 'left' : 'right'
    }
    // Small1 (1) or small2 (2) border each other *and* the big pane — pick the horizontal outer edge within their own row (row-direction) or the vertical one within their own column (column-direction), independent of `bigPosition`.
    const isFirstSmall = slotIndex === 1
    if (direction === 'row') return isFirstSmall ? 'left' : 'right'
    return isFirstSmall ? 'up' : 'down'
  }

  if (screen.slotCount === 4) {
    // 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right (see `paneResizableAxes`) — every corner borders a neighbor on both axes, so this just picks the horizontal outer edge consistently.
    const isLeft = slotIndex === 0 || slotIndex === 2
    return isLeft ? 'left' : 'right'
  }

  // 1 slot: the whole screen, no neighbor on any side — any direction is a valid screen edge.
  return 'right'
}

/** The default fraction of the screen's own viewport (standing in for `containerWidth`/`containerHeight`, since an arrangement always fills it entirely) a slide's own `resizeToFit` image's box is fit within, along either axis, until its own `resizeScale` says otherwise. */
export const IMAGE_RESIZE_MAX_VIEWPORT_FRACTION = 0.4

/** The range a `resizeToFit` image's own `resizeScale` is clamped to — same 10-90% band an arrangement's own dividers are clamped to (`MIN_RATIO`/`MAX_RATIO`), expressed as a fraction instead of a percentage, so dragging its box's border can shrink or grow it but never collapse it to nothing or blow it out past the arrangement's own bounds. */
export const MIN_IMAGE_RESIZE_SCALE = MIN_RATIO / 100
export const MAX_IMAGE_RESIZE_SCALE = MAX_RATIO / 100

export function clampImageResizeScale(scale: number): number {
  return Math.min(MAX_IMAGE_RESIZE_SCALE, Math.max(MIN_IMAGE_RESIZE_SCALE, scale))
}

/** Fits a `naturalWidth`x`naturalHeight` box within `maxWidth`x`maxHeight`, preserving aspect ratio and never exceeding either bound — the same math as CSS `object-fit: contain`. */
export function fitImageBox(naturalWidth: number, naturalHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) return { width: maxWidth, height: maxHeight }
  const aspectRatio = naturalWidth / naturalHeight
  let width = maxWidth
  let height = width / aspectRatio
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }
  return { width, height }
}

/**
 * The ratio-field overrides that resize `slotIndex`'s own pane to fit an
 * image of `naturalWidth`x`naturalHeight`, capped at `scale` (falling back
 * to `IMAGE_RESIZE_MAX_VIEWPORT_FRACTION`, its own default until dragged to
 * something else — see `ScreenSlotContent.resizeScale`) of the arrangement's
 * own `containerWidth`x`containerHeight` — meant to be applied live (never
 * persisted) while that pane's currently-showing slide is an image with
 * `resizeToFit` on, and dropped the instant it isn't (see `SplitLayout`),
 * which is what lets it slide back to the slot's own set size on its own,
 * the same transition a manual resize already animates with.
 *
 * The cap belongs to the *image* (`fitImageBox`, always capped on both axes,
 * regardless of the pane's own role) — never to the pane itself: a pane
 * only ever adopts whichever of that box's two dimensions matches an axis
 * it actually has a field for (see `paneResizableAxes`), with no cap or
 * other size of its own imposed beyond that. A pane with only one
 * resizable axis (a 2-slot pane, or a 3-slot arrangement's "big" one)
 * simply leaves its other axis alone — still the full container
 * edge-to-edge, exactly as before this override — rather than trying to
 * stretch the image to fill it.
 */
export function imageResizeRatioPatch(
  screen: ScreenConfig,
  slotIndex: number,
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  scale: number = IMAGE_RESIZE_MAX_VIEWPORT_FRACTION,
): RatioPatch {
  const axes = paneResizableAxes(screen, slotIndex)
  if (!axes.width && !axes.height) return {}
  if (containerWidth <= 0 || containerHeight <= 0) return {}

  const box = fitImageBox(naturalWidth, naturalHeight, containerWidth * scale, containerHeight * scale)

  const patch: RatioPatch = {}
  if (axes.width) {
    const share = clampRatio((box.width / containerWidth) * 100)
    patch[axes.width.field] = axes.width.isFirstShare ? share : 100 - share
  }
  if (axes.height) {
    const share = clampRatio((box.height / containerHeight) * 100)
    patch[axes.height.field] = axes.height.isFirstShare ? share : 100 - share
  }
  return patch
}

/**
 * Inverts `imageResizeRatioPatch`'s own math: given the raw ratio value a
 * pointer drag just computed for one of `slotIndex`'s own resizable axes
 * (`field`, from `paneResizableAxes`), returns the `resizeScale` that would
 * make `imageResizeRatioPatch` reproduce that exact value on that axis —
 * used so dragging the border of a pane currently fit to a `resizeToFit`
 * image changes the image's own persisted scale instead of writing straight
 * to the arrangement's own ratio fields, which are recomputed from the
 * scale every render anyway and would otherwise instantly snap back to
 * wherever the scale already put them. Both axes are always derived from
 * the very same `resizeScale` — that's what keeps the box's own aspect
 * ratio locked no matter which one is dragged — so inverting *either* axis
 * recovers it equally.
 */
export function imageResizeScaleFromDrag(
  screen: ScreenConfig,
  slotIndex: number,
  field: RatioField,
  rawValue: number,
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  const axes = paneResizableAxes(screen, slotIndex)
  const isWidthAxis = axes.width?.field === field
  const axis = isWidthAxis ? axes.width : axes.height?.field === field ? axes.height : undefined
  if (!axis || containerWidth <= 0 || containerHeight <= 0) return IMAGE_RESIZE_MAX_VIEWPORT_FRACTION

  const unscaledBox = fitImageBox(naturalWidth, naturalHeight, containerWidth, containerHeight)
  const unscaledSharePercent = isWidthAxis ? (unscaledBox.width / containerWidth) * 100 : (unscaledBox.height / containerHeight) * 100
  if (unscaledSharePercent <= 0) return IMAGE_RESIZE_MAX_VIEWPORT_FRACTION

  const sharePercent = axis.isFirstShare ? rawValue : 100 - rawValue
  return clampImageResizeScale(sharePercent / unscaledSharePercent)
}
