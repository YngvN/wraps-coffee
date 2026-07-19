import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clampRatio, dividerPositionToRatio } from '../../utils/screenLayout'
import './SplitLayoutDivider.scss'

/** Width/height (px) of the invisible drag hit-area, centered on the divider's own thin visual line — wider than the line itself so it's easy to grab precisely. */
const HANDLE_THICKNESS = 20

/** How far (px) the pointer can move between down and up before this counts as a real resize drag rather than a plain click — see `onBorderClick`. Deliberately small (a genuine drag almost always moves well past this within the first few pixels), just enough to absorb the tiny jitter a human hand can't avoid even on a "still" click. */
const CLICK_MOVE_THRESHOLD = 4

function handleStyle(orientation: 'vertical' | 'horizontal', value: number): CSSProperties {
  if (orientation === 'vertical') return { top: 0, bottom: 0, left: `calc(${value}% - ${HANDLE_THICKNESS / 2}px)`, width: HANDLE_THICKNESS }
  return { left: 0, right: 0, top: `calc(${value}% - ${HANDLE_THICKNESS / 2}px)`, height: HANDLE_THICKNESS }
}

interface SplitLayoutDividerProps {
  /** `'vertical'`: a vertical divider line, dragged left/right (a `'row'`-direction split). `'horizontal'`: a horizontal line, dragged up/down (a `'column'`-direction split). */
  orientation: 'vertical' | 'horizontal'
  /** This split's own current ratio (first child's share, 0-100). */
  value: number
  /** This one split node's own immediate grid container — the drag position is read relative to it, not the whole screen, since nested splits each have their own local coordinate space. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Called continuously while dragging, so the two sides resize live right along with the pointer. */
  onLiveChange: (ratio: number) => void
  /** Called once, on release, with the final ratio to persist. */
  onCommit: (ratio: number) => void
  /** Other dividers' own current positions on this same axis (see `LayoutTree.tsx`) — a live drag magnetically snaps to any of these once close, same as it already snaps to dead-center (see `dividerPositionToRatio`). */
  snapTargets?: number[]
  /** Called instead of `onCommit` when a press-release turns out not to have moved the pointer past `CLICK_MOVE_THRESHOLD` — a plain click on the border itself, opening the screen-wide border settings (visibility/color) rather than resizing anything. Omit to disable (the divider then only ever resizes, never opens anything). */
  onBorderClick?: () => void
}

/**
 * One split node's own draggable divider, overlaid on its own 2-cell grid
 * at its current ratio (invisible — the grid's own `gap` still draws the
 * visible line; this is purely the wider hit-area on top of it). Uses
 * pointer capture so the drag keeps tracking even once the pointer leaves
 * this thin strip, and commits the final position on release wherever that
 * happens to be — unless the pointer never really moved at all, in which
 * case release fires `onBorderClick` instead of a (no-op) resize commit.
 */
export function SplitLayoutDivider({ orientation, value, containerRef, onLiveChange, onCommit, snapTargets = [], onBorderClick }: SplitLayoutDividerProps) {
  const [dragging, setDragging] = useState(false)
  /** The pointer's own client coordinates at the start of this press, and whether it's moved past `CLICK_MOVE_THRESHOLD` since — plain refs (not state) since neither needs to trigger a re-render, only to be read back once on release. */
  const downPositionRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)

  /** The pointer's own on-screen position along this divider's axis, as a percentage of its own immediate parent grid — not yet snapped/clamped (see `dividerPositionToRatio`). */
  const positionFromPointer = (clientX: number, clientY: number): number | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const raw = orientation === 'vertical' ? ((clientX - rect.left) / rect.width) * 100 : ((clientY - rect.top) / rect.height) * 100
    return clampRatio(raw)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    downPositionRef.current = { x: event.clientX, y: event.clientY }
    movedRef.current = false
  }

  /**
   * Gated on `downPositionRef` (a ref, set synchronously in `handlePointerDown`)
   * rather than the `dragging` *state* — `setDragging(true)` above only takes
   * effect on React's next render, so a fast drag can dispatch several real
   * pointermove events before that state update ever flushes; gating on it
   * here would silently drop those events (never setting `movedRef`), making
   * `endDrag` misread a genuine fast drag as a plain click.
   */
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!downPositionRef.current) return
    if (Math.hypot(event.clientX - downPositionRef.current.x, event.clientY - downPositionRef.current.y) > CLICK_MOVE_THRESHOLD) {
      movedRef.current = true
    }
    const position = positionFromPointer(event.clientX, event.clientY)
    if (position !== null) onLiveChange(dividerPositionToRatio(position, snapTargets))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!downPositionRef.current) return
    setDragging(false)
    downPositionRef.current = null
    if (!movedRef.current) {
      onBorderClick?.()
      return
    }
    const position = positionFromPointer(event.clientX, event.clientY)
    onCommit(position !== null ? dividerPositionToRatio(position, snapTargets) : dividerPositionToRatio(value, snapTargets))
  }

  return (
    <div
      className={`split-layout__divider split-layout__divider--${orientation}${dragging ? ' split-layout__divider--dragging' : ''}`}
      style={handleStyle(orientation, value)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}
