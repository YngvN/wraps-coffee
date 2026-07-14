/** A simple pencil glyph — `currentColor`-stroked, matching `CopyIcon`/`TrashIcon`'s own conventions, so it follows whatever color its own button is drawn in. */
export function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7 21l-4 1 1-4Z" />
      <path d="M15 5l4 4" />
    </svg>
  )
}
