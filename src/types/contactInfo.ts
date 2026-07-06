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
}
