/** A curved "redo" arrow glyph, `currentColor`-stroked, matching `LockIcon`/`TrashIcon`'s own conventions. Used by the screen editor toolbar's own redo button. */
export function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 10H9a5 5 0 0 0 0 10h1" />
      <path d="M17 10l-4-4" />
      <path d="M17 10l-4 4" />
    </svg>
  )
}
