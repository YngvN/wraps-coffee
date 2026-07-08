import { useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clampRatio, dividerFieldValue, type CrossHandleDescriptor, type RatioPatch } from '../../utils/screenLayout'
import './SplitLayoutDivider.scss'

/** Width/height (px) of the combined handle's own square hit-area, centered on the arrangement's crosspoint — bigger than a single divider's own strip (see `SplitLayoutDivider`), since grabbing it precisely matters more here (missing it just grabs one divider instead of both). */
const HANDLE_SIZE = 32

interface SplitLayoutCenterHandleProps {
  handle: CrossHandleDescriptor
  /** The grid container's own box — the drag position is read relative to it, regardless of which pane the pointer happens to be over. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Called continuously while dragging, with both fields' new values at once, so every pane resizes live together right along with the pointer. */
  onLiveChange: (patch: RatioPatch) => void
  /** Called once, on release, with both fields' final positions to persist. */
  onCommit: (patch: RatioPatch) => void
}

/**
 * A screen's own combined resize handle, sitting exactly on its two
 * dividers' crosspoint (a 4-slot arrangement) or T-junction (a 3-slot one)
 * — grabbing it and dragging moves both dividers at once (horizontal
 * position → `handle.columnField`, vertical → `handle.rowField`), resizing
 * every pane together instead of just the two on either side of a single
 * divider. Only ever rendered where `crossHandle` finds one.
 */
export function SplitLayoutCenterHandle({ handle, containerRef, onLiveChange, onCommit }: SplitLayoutCenterHandleProps) {
  const [dragging, setDragging] = useState(false)

  const positionFromPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clampRatio(((clientX - rect.left) / rect.width) * 100),
      y: clampRatio(((clientY - rect.top) / rect.height) * 100),
    }
  }

  const patchFromPosition = (position: { x: number; y: number }): RatioPatch => ({
    [handle.columnField]: dividerFieldValue({ inverted: handle.columnInverted }, position.x),
    [handle.rowField]: dividerFieldValue({ inverted: handle.rowInverted }, position.y),
  })

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const position = positionFromPointer(event.clientX, event.clientY)
    if (position) onLiveChange(patchFromPosition(position))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    const position = positionFromPointer(event.clientX, event.clientY)
    onCommit(position ? patchFromPosition(position) : { [handle.columnField]: handle.columnValue, [handle.rowField]: handle.rowValue })
  }

  return (
    <div
      className={`split-layout__divider split-layout__divider--center${dragging ? ' split-layout__divider--dragging' : ''}`}
      style={{
        left: `calc(${handle.columnValue}% - ${HANDLE_SIZE / 2}px)`,
        top: `calc(${handle.rowValue}% - ${HANDLE_SIZE / 2}px)`,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}
