import { useState, type ChangeEvent } from 'react'

interface UseNumberInputValueOptions {
  /** Formats `value` for display when it's not being actively edited (e.g. zero-padding). Defaults to `String`. */
  format?: (value: number) => string
}

/** Matches a string that could be a number as the user is still typing it (e.g. `"-"`, `"4."`, `""`). */
const PARTIAL_NUMBER = /^-?\d*\.?\d*$/

/** Strips a leading zero immediately followed by another digit (`"04"` → `"4"`), leaving `"0"` and `"0.5"` alone. */
function stripLeadingZero(digits: string): string {
  const negative = digits.startsWith('-')
  const unsigned = negative ? digits.slice(1) : digits
  const stripped = unsigned.replace(/^0+(?=\d)/, '')
  return negative ? `-${stripped}` : stripped
}

/**
 * Backs a controlled `<input type="number">` with local string state instead of binding `value`
 * straight to a number.
 *
 * React's DOM reconciliation for `type="number"` inputs compares the input's current string
 * against the numeric `value` prop with loose equality (`!=`), which coerces the string side
 * (`"04" != 4` → `4 != 4` → `false`). So once the underlying number is already correct, React
 * decides nothing changed and skips rewriting the DOM string, leaving a leading zero the user
 * typed (or any other stale formatting) stuck on screen even though the tracked value is right.
 * Keeping the displayed text as its own string avoids that comparison entirely — but only once
 * this hook actually strips the leading zero from what it tracks; also rejects (and immediately
 * reverts) any keystroke that wouldn't leave the field looking like a valid in-progress number,
 * since a native `type="number"` input still lets through characters like `e`/`+`.
 *
 * @param value - The current numeric value, as tracked by the caller.
 * @param onChange - Called with the parsed number whenever the typed text is a valid number.
 * @param options.format - Formats `value` for display when not actively being edited.
 * @returns Props to spread onto the `<input>`: `value` (string), `onChange`, `onBlur`.
 */
export function useNumberInputValue(value: number, onChange: (value: number) => void, options?: UseNumberInputValueOptions) {
  const format = options?.format ?? String
  const [text, setText] = useState(() => format(value))
  const [lastSyncedValue, setLastSyncedValue] = useState(value)

  // Resyncs the displayed text when `value` changes for a reason other than this hook's own
  // `handleChange` (switching records, the caller clamping/rounding what it was handed) — done
  // during render, per React's "adjusting state when a prop changes" pattern, rather than in a
  // `useEffect`, so the corrected text is never one extra render late.
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value)
    setText(format(value))
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value

    if (!PARTIAL_NUMBER.test(typed)) {
      event.target.value = text // reject the keystroke — revert the DOM before the browser paints it
      return
    }

    const sanitized = stripLeadingZero(typed)
    if (sanitized !== typed) {
      event.target.value = sanitized
    }
    setText(sanitized)

    const parsed = Number(sanitized)
    if (sanitized !== '' && sanitized !== '-' && !Number.isNaN(parsed)) {
      setLastSyncedValue(parsed)
      onChange(parsed)
    }
  }

  const handleBlur = () => {
    const parsed = Number(text)
    if (text === '' || text === '-' || Number.isNaN(parsed)) {
      setText(format(value))
    }
  }

  return { value: text, onChange: handleChange, onBlur: handleBlur }
}
