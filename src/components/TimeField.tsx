import type { ClockFormat } from '../hooks/useClockFormatPreference'
import './TimeField.scss'

interface TimeFieldProps {
  id: string
  label: string
  /** Always a plain 24-hour `"HH:MM"` string, regardless of `format` — only the on-screen controls change with it, never what's stored. */
  value: string
  onChange: (value: string) => void
  format: ClockFormat
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

function parseTime(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number)
  return { hours: clamp(h, 0, 23), minutes: clamp(m, 0, 59) }
}

/** A 24-hour hour → its 12-hour clock face number (1-12) and whether it's PM. */
function to12Hour(hours24: number): { hour: number; isPM: boolean } {
  const isPM = hours24 >= 12
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12
  return { hour, isPM }
}

/** A 12-hour clock face number (1-12) plus AM/PM back to its 24-hour hour. */
function to24Hour(hour12: number, isPM: boolean): number {
  if (isPM) return hour12 === 12 ? 12 : hour12 + 12
  return hour12 === 12 ? 0 : hour12
}

/**
 * A time-of-day field that always stores (and reports via `onChange`) a
 * plain 24-hour `"HH:MM"` string, but is entered as either a 24-hour or a
 * 12-hour AM/PM clock depending on `format`. Built from plain number
 * inputs (plus an AM/PM toggle in 12-hour mode) rather than a native
 * `<input type="time">`, since that element's displayed format is decided
 * by the browser/OS locale and can't reliably be forced either way from
 * the page — this makes the format an explicit, always-honored choice.
 */
export function TimeField({ id, label, value, onChange, format }: TimeFieldProps) {
  const { hours, minutes } = parseTime(value)
  const { hour: hour12, isPM } = to12Hour(hours)

  const setTime = (nextHours: number, nextMinutes: number) => onChange(`${pad(nextHours)}:${pad(nextMinutes)}`)

  const handleHourChange = (raw: number) => {
    if (format === '24h') {
      setTime(clamp(raw, 0, 23), minutes)
    } else {
      setTime(to24Hour(clamp(raw, 1, 12), isPM), minutes)
    }
  }

  const handleMinuteChange = (raw: number) => setTime(hours, clamp(raw, 0, 59))

  const handleMeridiemChange = (nextIsPM: boolean) => setTime(to24Hour(hour12, nextIsPM), minutes)

  return (
    <div className="time-field">
      <label htmlFor={`${id}-hour`}>{label}</label>
      <div className="time-field__controls">
        <input
          id={`${id}-hour`}
          className="time-field__number"
          type="number"
          inputMode="numeric"
          min={format === '24h' ? 0 : 1}
          max={format === '24h' ? 23 : 12}
          value={format === '24h' ? hours : hour12}
          onChange={(event) => handleHourChange(Number(event.target.value))}
        />
        <span className="time-field__colon" aria-hidden="true">
          :
        </span>
        <input
          id={`${id}-minute`}
          className="time-field__number"
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          value={pad(minutes)}
          onChange={(event) => handleMinuteChange(Number(event.target.value))}
        />
        {format === '12h' && (
          <div className="time-field__meridiem" role="group" aria-label="AM/PM">
            <button type="button" className={`time-field__meridiem-option${!isPM ? ' time-field__meridiem-option--active' : ''}`} onClick={() => handleMeridiemChange(false)}>
              AM
            </button>
            <button type="button" className={`time-field__meridiem-option${isPM ? ' time-field__meridiem-option--active' : ''}`} onClick={() => handleMeridiemChange(true)}>
              PM
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
