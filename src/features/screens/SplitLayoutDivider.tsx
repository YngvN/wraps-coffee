import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clampRatio, dividerFieldValue, type DividerDescriptor, type RatioPatch } from '../../utils/screenLayout'
import './SplitLayoutDivider.scss'

/** Width/height (px) of the invisible drag hit-area, centered on the divider's own thin visual line — wider than the line itself so it's easy to grab precisely. */
const HANDLE_THICKNESS = 20

function handleStyle(divider: DividerDescriptor): CSSProperties {
  const { orientation, value, span } = divider
  if (orientation === 'vertical') {
    return {
      top: span.top !== undefined ? `${span.top}%` : 0,
      bottom: span.bottom !== undefined ? `${span.bottom}%` : 0,
      left: `calc(${value}% - ${HANDLE_THICKNESS / 2}px)`,
      width: HANDLE_THICKNESS,
    }
  }
  return {
    left: span.left !== undefined ? `${span.left}%` : 0,
    right: span.right !== undefined ? `${span.right}%` : 0,
    top: `calc(${value}% - ${HANDLE_THICKNESS / 2}px)`,
    height: HANDLE_THICKNESS,
  }
}

interface SplitLayoutDividerProps {
  divider: DividerDescriptor
  /** The grid container's own box — the drag position is read relative to it, regardless of which pane the pointer happens to be over. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Called continuously while dragging, so the panes resize live right along with the pointer. */
  onLiveChange: (patch: RatioPatch) => void
  /** Called once, on release, with the final position to persist. */
  onCommit: (patch: RatioPatch) => void
}

/**
 * One draggable divider, overlaid on the grid at its own current position
 * (invisible — the grid's own `gap` still draws the visible line; this is
 * purely the wider hit-area on top of it). Uses pointer capture so the drag
 * keeps tracking even once the pointer leaves this thin strip, and commits
 * the final position on release wherever that happens to be.
 */
export function SplitLayoutDivider({ divider, containerRef, onLiveChange, onCommit }: SplitLayoutDividerProps) {
  const [dragging, setDragging] = useState(false)

  /** The pointer's own on-screen position along this divider's axis, as a percentage of the container — not yet the value to write to `divider.field` (see `dividerFieldValue`). */
  const positionFromPointer = (clientX: number, clientY: number): number | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const raw = divider.orientation === 'vertical' ? ((clientX - rect.left) / rect.width) * 100 : ((clientY - rect.top) / rect.height) * 100
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
    if (position !== null) onLiveChange({ [divider.field]: dividerFieldValue(divider, position) })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    const position = positionFromPointer(event.clientX, event.clientY)
    onCommit({ [divider.field]: position !== null ? dividerFieldValue(divider, position) : dividerFieldValue(divider, divider.value) })
  }

  return (
    <div
      className={`split-layout__divider split-layout__divider--${divider.orientation}${dragging ? ' split-layout__divider--dragging' : ''}`}
      style={handleStyle(divider)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}
