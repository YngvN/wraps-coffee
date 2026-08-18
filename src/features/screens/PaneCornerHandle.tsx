import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clampRatio } from '../../utils/screenLayout'
import './PaneCornerHandle.scss'

/** Width/height (px) of the invisible drag hit-area, centered on the corner point — same sizing convention as `SplitLayoutDivider`'s own `HANDLE_THICKNESS`. */
const HANDLE_SIZE = 24

// Same `--scaled-screen-preview-scale` compensation as `SplitLayoutDivider`'s `HANDLE_THICKNESS_EXPR` — see its comment.
const HANDLE_SIZE_EXPR = `${HANDLE_SIZE}px / var(--scaled-screen-preview-scale, 1)`

interface PaneCornerHandleProps {
  /** This corner's own current position, as a percentage of `containerRef`'s own box on each axis. */
  x: number
  y: number
  /** The enclosing `split` node's own immediate grid container — same one its regular `SplitLayoutDivider` reads against (see `LayoutTree.tsx`), since a qualifying child's box shares that container's full extent along the axis it doesn't itself split. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Called continuously while dragging, with the live x/y percentages. */
  onLiveChange: (x: number, y: number) => void
  /** Called once, on release, with the final x/y percentages to persist. */
  onCommit: (x: number, y: number) => void
}

/**
 * A small 2-axis drag handle sitting exactly where a `split` node's own
 * divider meets a qualifying child's — see `LayoutTree.tsx`'s own doc
 * comment for when this renders (a 3-pane "T-junction," or a 4-pane 2x2's
 * "+" once its two nested dividers line up). Dragging it moves the parent's
 * ratio and the qualifying child's (or, at a merged "+", both children's)
 * ratio together, in one gesture — the classic "resize like a single 4-pane
 * layout" corner-drag — while the plain single-axis dividers on either side
 * of it keep working independently, exactly as they do everywhere else.
 */
export function PaneCornerHandle({ x, y, containerRef, onLiveChange, onCommit }: PaneCornerHandleProps) {
  const [dragging, setDragging] = useState(false)

  const positionFromPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clampRatio(((clientX - rect.left) / rect.width) * 100),
      y: clampRatio(((clientY - rect.top) / rect.height) * 100),
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const position = positionFromPointer(event.clientX, event.clientY)
    if (position) onLiveChange(position.x, position.y)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    const position = positionFromPointer(event.clientX, event.clientY)
    onCommit(position ? position.x : x, position ? position.y : y)
  }

  const style: CSSProperties = {
    left: `calc(${x}% - (${HANDLE_SIZE_EXPR}) / 2)`,
    top: `calc(${y}% - (${HANDLE_SIZE_EXPR}) / 2)`,
    width: `calc(${HANDLE_SIZE_EXPR})`,
    height: `calc(${HANDLE_SIZE_EXPR})`,
  }

  return (
    <div
      className={`pane-corner-handle${dragging ? ' pane-corner-handle--dragging' : ''}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}
