import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clampRatio, dividerPositionToRatio } from '../../utils/screenLayout'
import './SplitLayoutDivider.scss'

/** Width/height (px) of the invisible drag hit-area, centered on the divider's own thin visual line — wider than the line itself so it's easy to grab precisely. */
const HANDLE_THICKNESS = 20

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
}

/**
 * One split node's own draggable divider, overlaid on its own 2-cell grid
 * at its current ratio (invisible — the grid's own `gap` still draws the
 * visible line; this is purely the wider hit-area on top of it). Uses
 * pointer capture so the drag keeps tracking even once the pointer leaves
 * this thin strip, and commits the final position on release wherever that
 * happens to be.
 */
export function SplitLayoutDivider({ orientation, value, containerRef, onLiveChange, onCommit }: SplitLayoutDividerProps) {
  const [dragging, setDragging] = useState(false)

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
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const position = positionFromPointer(event.clientX, event.clientY)
    if (position !== null) onLiveChange(dividerPositionToRatio(position))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    const position = positionFromPointer(event.clientX, event.clientY)
    onCommit(position !== null ? dividerPositionToRatio(position) : dividerPositionToRatio(value))
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
