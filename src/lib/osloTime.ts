/**
 * Norwegian time for everything legal the register prints or exports (receipts, X/Z reports, the
 * journal's dates, SAF-T): kassasystemforskrifta § 2-5 asks for a clock on Norwegian standard time with
 * daylight saving. These read the calendar in `Europe/Oslo` whatever time zone the server machine is
 * set to, so a server left on UTC still closes the day at Norwegian midnight.
 */

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function parts(date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
  const out: Record<string, string> = {}
  for (const part of PARTS.formatToParts(date)) out[part.type] = part.value
  return out as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>
}

/** The Oslo calendar date, `YYYY-MM-DD`. */
export function osloDate(date: Date): string {
  const p = parts(date)
  return `${p.year}-${p.month}-${p.day}`
}

/** The Oslo wall-clock time, `HH:MM:SS`. */
export function osloTime(date: Date): string {
  const p = parts(date)
  return `${p.hour}:${p.minute}:${p.second}`
}
