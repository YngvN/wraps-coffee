/** A simple right-pointing chevron — `currentColor`-stroked, matching `EditIcon`/`TrashIcon`/`PlusIcon`'s own conventions — marks a row's own clickable area as leading somewhere (a deeper list, or straight into its edit form), the same way a native list/table row's own disclosure indicator would. */
export function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
