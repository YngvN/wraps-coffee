/** Returns a new `Date` at local midnight for `date`, discarding time of day. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Returns a new `Date` `amount` days after `date` (or before, if negative). */
export function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

/** Returns whether `a` and `b` fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Returns the Monday (at midnight) that starts the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = startOfDay(date)
  const daysSinceMonday = (start.getDay() + 6) % 7
  return addDays(start, -daysSinceMonday)
}

/** Returns the 7 days of the week starting on `weekStart` (a Monday). */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

/**
 * Returns a 42-day (6-week) grid of days covering the month containing
 * `date`, starting on the Monday on/before the 1st. The grid always spans
 * full weeks so it lines up with a Monday-first weekday header.
 */
export function getMonthGrid(date: Date): Date[] {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}
