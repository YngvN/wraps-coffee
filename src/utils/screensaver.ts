import type { ScreensaverSchedule } from '../hooks/useScreensaverSchedule'

function minutesSinceMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Whether `now` falls within a screensaver schedule's own daily window,
 * wrapping past midnight when `end` is earlier than `start` (e.g.
 * 22:00–06:00 is active from 22:00 through midnight, then again until
 * 06:00). `null` (no schedule set) or an equal start/end (a degenerate,
 * zero-length window) both mean "never active".
 */
export function isWithinScreensaverWindow(schedule: ScreensaverSchedule | null, now: Date = new Date()): boolean {
  if (!schedule) return false
  const start = minutesSinceMidnight(schedule.start)
  const end = minutesSinceMidnight(schedule.end)
  if (start === end) return false
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end
}
