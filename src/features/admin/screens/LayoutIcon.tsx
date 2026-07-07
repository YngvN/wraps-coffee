export type LayoutIconPattern =
  | 'row'
  | 'column'
  | 'triple-row-first'
  | 'triple-row-second'
  | 'triple-column-first'
  | 'triple-column-second'
  | 'single'
  | 'quad'
  | 'empty'

interface IconRect {
  x: number
  y: number
  width: number
  height: number
  /** Dashed stroke, used for the "nothing configured" empty preview. */
  dashed?: boolean
}

/** Rectangles (in a 32x24 viewBox) previewing each arrangement, matching `SplitLayout`'s grid-template-areas 1:1. */
const RECTS: Record<LayoutIconPattern, IconRect[]> = {
  row: [
    { x: 1, y: 1, width: 14, height: 22 },
    { x: 17, y: 1, width: 14, height: 22 },
  ],
  column: [
    { x: 1, y: 1, width: 30, height: 10 },
    { x: 1, y: 13, width: 30, height: 10 },
  ],
  'triple-row-first': [
    { x: 1, y: 1, width: 30, height: 10 },
    { x: 1, y: 13, width: 14, height: 10 },
    { x: 17, y: 13, width: 14, height: 10 },
  ],
  'triple-row-second': [
    { x: 1, y: 1, width: 14, height: 10 },
    { x: 17, y: 1, width: 14, height: 10 },
    { x: 1, y: 13, width: 30, height: 10 },
  ],
  'triple-column-first': [
    { x: 1, y: 1, width: 14, height: 22 },
    { x: 17, y: 1, width: 14, height: 10 },
    { x: 17, y: 13, width: 14, height: 10 },
  ],
  'triple-column-second': [
    { x: 1, y: 1, width: 14, height: 10 },
    { x: 1, y: 13, width: 14, height: 10 },
    { x: 17, y: 1, width: 14, height: 22 },
  ],
  single: [{ x: 1, y: 1, width: 30, height: 22 }],
  quad: [
    { x: 1, y: 1, width: 14, height: 10 },
    { x: 17, y: 1, width: 14, height: 10 },
    { x: 1, y: 13, width: 14, height: 10 },
    { x: 17, y: 13, width: 14, height: 10 },
  ],
  empty: [{ x: 1, y: 1, width: 30, height: 22, dashed: true }],
}

interface LayoutIconProps {
  pattern: LayoutIconPattern
  width?: number
  height?: number
}

/** Small SVG preview of an arrangement, used both as the visual choice in the admin Screens form's layout picker and as each screen card's live preview. */
export function LayoutIcon({ pattern, width = 32, height = 24 }: LayoutIconProps) {
  return (
    <svg viewBox="0 0 32 24" width={width} height={height} aria-hidden="true">
      {RECTS[pattern].map((rect, index) => (
        <rect
          key={index}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={1.5}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray={rect.dashed ? '3 2' : undefined}
        />
      ))}
    </svg>
  )
}
