import type { ScreenConfig } from '../types/screen'

/** A screen field holding one adjustable divider's position, as a percentage. */
export type RatioField = 'splitRatio' | 'tripleBigRatio' | 'tripleSmallRatio' | 'quadColumnRatio' | 'quadRowRatio'

/** One or more ratio fields' new values at once — a single-divider drag only ever touches one, but a combined cross handle (see `crossHandle`) moves both of an arrangement's dividers together. */
export type RatioPatch = Partial<Record<RatioField, number>>

/** Never let a pane collapse to nothing (or swallow its neighbor) — both dragging and the admin's arrow nudges clamp to this range. */
export const MIN_RATIO = 10
export const MAX_RATIO = 90

export function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

/** A field's current value, clamped, falling back to an even 50/50 split when absent. */
function ratio(screen: ScreenConfig, field: RatioField): number {
  return clampRatio(screen[field] ?? 50)
}

/** Resolves the CSS grid-template-columns/rows for a screen's current arrangement, from its own adjustable divider ratios. Pure sizing — `grid-template-areas` (which named pane goes where) is unaffected and stays in `SplitLayout.scss`. */
export function splitGridTemplate(screen: ScreenConfig): { gridTemplateColumns?: string; gridTemplateRows?: string } {
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (screen.slotCount === 2) {
    const split = ratio(screen, 'splitRatio')
    const track = `${split}% ${100 - split}%`
    return direction === 'row' ? { gridTemplateColumns: track } : { gridTemplateRows: track }
  }

  if (screen.slotCount === 4) {
    const column = ratio(screen, 'quadColumnRatio')
    const row = ratio(screen, 'quadRowRatio')
    return { gridTemplateColumns: `${column}% ${100 - column}%`, gridTemplateRows: `${row}% ${100 - row}%` }
  }

  if (screen.slotCount === 3) {
    const big = ratio(screen, 'tripleBigRatio')
    const small = ratio(screen, 'tripleSmallRatio')
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

/** Converts a raw on-screen position (e.g. from a pointer drag) into the value to actually write to `divider.field`, accounting for `inverted`. */
export function dividerFieldValue(divider: Pick<DividerDescriptor, 'inverted'>, position: number): number {
  return clampRatio(divider.inverted ? 100 - position : position)
}

/** Every divider a screen's current arrangement actually has, for rendering their drag handles — `[]` for 1 slot (nothing to divide). */
export function screenDividers(screen: ScreenConfig): DividerDescriptor[] {
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (screen.slotCount === 2) {
    const value = ratio(screen, 'splitRatio')
    return [{ field: 'splitRatio', orientation: direction === 'row' ? 'vertical' : 'horizontal', value, span: {}, inverted: false }]
  }

  if (screen.slotCount === 4) {
    return [
      { field: 'quadColumnRatio', orientation: 'vertical', value: ratio(screen, 'quadColumnRatio'), span: {}, inverted: false },
      { field: 'quadRowRatio', orientation: 'horizontal', value: ratio(screen, 'quadRowRatio'), span: {}, inverted: false },
    ]
  }

  if (screen.slotCount === 3) {
    const big = ratio(screen, 'tripleBigRatio')
    const small = ratio(screen, 'tripleSmallRatio')
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

export function crossHandle(screen: ScreenConfig): CrossHandleDescriptor | null {
  if (screen.slotCount !== 3 && screen.slotCount !== 4) return null
  const dividers = screenDividers(screen)
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
 * current arrangement, and by how much (already signed and clamped) — or
 * `null` if that direction has no divider to move (e.g. up/down for a
 * 2-slot side-by-side row). Shared by the admin form's arrow buttons; the
 * live display's own drag handles don't need this mapping since each one
 * already knows its own field directly (see `screenDividers`).
 */
export function nudgeRatio(screen: ScreenConfig, direction: ResizeDirection, step = 1): Partial<ScreenConfig> | null {
  const isRowAxis = direction === 'up' || direction === 'down' // moves a horizontal divider line
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  const divider = screenDividers(screen).find((candidate) => (candidate.orientation === 'horizontal') === isRowAxis)
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

  const current = clampRatio(screen[divider.field] ?? 50)
  return { [divider.field]: clampRatio(current + fieldSign * step) }
}
