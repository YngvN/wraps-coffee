/** One weekday's opening hours, or closed. */
export interface DayHours {
  closed: boolean
  /** "HH:MM" 24-hour time. Present only when `closed` is false. */
  open?: string
  /** "HH:MM" 24-hour time. Present only when `closed` is false. */
  close?: string
}

/** Editable cafe contact details and opening hours, replacing the values hardcoded in the site footer. */
export interface ContactInfo {
  phone: string
  email: string
  address: string
  hours: Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', DayHours>
  /** One-off closure overriding the regular weekly `hours` (e.g. closed today for a private event) — distinct from a day's own recurring `closed` flag. Optional for backward compatibility with contact info persisted before this field existed; absent means not temporarily closed. */
  temporarilyClosed?: boolean
  /** Optional public-facing reason shown alongside `temporarilyClosed`, e.g. "Closed for a private event". Only meaningful while `temporarilyClosed` is true. */
  temporarilyClosedReason?: string
}
