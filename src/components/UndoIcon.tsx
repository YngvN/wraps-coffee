/** A curved "undo" arrow glyph, `currentColor`-stroked, matching `RedoIcon`/`LockIcon`/`TrashIcon`'s own conventions — the horizontal mirror of `RedoIcon`. */
export function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10h8a5 5 0 0 1 0 10h-1" />
      <path d="M7 10l4-4" />
      <path d="M7 10l4 4" />
    </svg>
  )
}
