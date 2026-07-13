import type { LayoutNode, PaneId } from '../../../types/screen'
import { computeLayoutGeometry, type Rect } from '../../../utils/layoutGeometry'

/** A small inset margin (in the 32x24 viewBox's own units) between adjacent rects, so they read as separate panes rather than one solid block — matching the old hand-laid preview's own 2-unit gaps. */
const GAP = 1

function inset(rect: Rect): Rect {
  return { x: rect.x + GAP / 2, y: rect.y + GAP / 2, width: Math.max(0, rect.width - GAP), height: Math.max(0, rect.height - GAP) }
}

interface LayoutIconProps {
  /** `null` draws a single dashed placeholder rect (nothing configured yet) instead of walking a tree. */
  layout: LayoutNode | null
  width?: number
  height?: number
  /** Which leaf (by id) to visually fill in, rather than leaving it as an outline like the rest — e.g. so a pane's own tab button can show, at a glance, which physical position on the screen it corresponds to. `'all'` fills in every leaf instead (the screen-wide "Global" tab, which edits all of them at once). Omit to draw every pane the same outline-only way, as when picking a preset. */
  highlightId?: PaneId | 'all'
}

/** Small SVG preview of a pane arrangement, used as the visual choice in the admin Screens form's preset picker, each screen card's live preview, and (with `highlightId`) each of the form's own tab buttons. */
export function LayoutIcon({ layout, width = 32, height = 24, highlightId }: LayoutIconProps) {
  const rects = layout ? computeLayoutGeometry(layout, { x: 1, y: 1, width: 30, height: 22 }).leaves.map(({ id, rect }) => ({ id, rect: inset(rect) })) : []

  return (
    <svg viewBox="0 0 32 24" width={width} height={height} aria-hidden="true">
      {layout === null ? (
        <rect x={1} y={1} width={30} height={22} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 2" />
      ) : (
        rects.map(({ id, rect }) => {
          const isHighlighted = highlightId === 'all' || id === highlightId
          return (
            <rect
              key={id}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={1.5}
              fill={isHighlighted ? 'currentColor' : 'none'}
              fillOpacity={isHighlighted ? 0.35 : undefined}
              stroke="currentColor"
              strokeWidth={1.5}
            />
          )
        })
      )}
    </svg>
  )
}
