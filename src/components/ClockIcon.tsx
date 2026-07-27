/** A simple clock-face glyph — `currentColor`-stroked, matching `PlusIcon`/`EditIcon`/`TrashIcon`'s own conventions. Used to open a past-conversation log/history view. */
export function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}
