/** Four arrows radiating from a center cross — `currentColor`-stroked, matching `ChevronRightIcon`/`TrashIcon`'s own conventions — marks an element as freely draggable in any direction, the same glyph most desktop UIs use for a "move" affordance. Used by `FloatingPanel`'s own header to signal it can be dragged around by that title bar. */
export function MoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  )
}
