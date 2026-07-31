/** Four corner brackets pointing outward — `currentColor`-stroked, matching `MoveIcon`/`EditIcon`'s own conventions — the standard "expand to fullscreen" glyph, used to mark an action that opens a dedicated fullscreen view rather than an in-page form. */
export function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="8 3 3 3 3 8" />
      <polyline points="16 3 21 3 21 8" />
      <polyline points="3 16 3 21 8 21" />
      <polyline points="21 16 21 21 16 21" />
    </svg>
  )
}
