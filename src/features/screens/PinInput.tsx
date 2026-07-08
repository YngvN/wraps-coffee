import { useEffect } from 'react'
import './PinInput.scss'

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

interface PinInputProps {
  /** The digits entered so far. Controlled — the caller decides what happens once it reaches `length` (verify it, save it, etc.) and clears it back to `''` afterwards. */
  value: string
  onChange: (value: string) => void
  length?: number
  /** Shows a shake animation and tints the dots red, e.g. after a wrong PIN — the caller clears `value` alongside this. */
  error?: boolean
}

/**
 * A `length`-digit PIN entry: a row of filled/empty dots showing progress,
 * driven either by a physical keyboard (digits 0-9, Backspace — works
 * anywhere, since there's no real `<input>` here for it to conflict with)
 * or, only shown on small screens via `PinInput.scss`'s own media query, an
 * on-screen numeric keypad — so a phone/tablet gets big tappable buttons
 * instead of the browser's native keyboard popping up over half the modal.
 */
export function PinInput({ value, onChange, length = 4, error }: PinInputProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) {
        if (value.length < length) onChange(value + event.key)
      } else if (event.key === 'Backspace') {
        onChange(value.slice(0, -1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [value, onChange, length])

  const press = (digit: string) => {
    if (value.length < length) onChange(value + digit)
  }

  return (
    <div className="pin-input">
      <div className={`pin-input__dots${error ? ' pin-input__dots--error' : ''}`} role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, index) => (
          <span key={index} className={`pin-input__dot${index < value.length ? ' pin-input__dot--filled' : ''}`} />
        ))}
      </div>

      <div className="pin-input__keypad">
        {KEYPAD_DIGITS.map((digit) => (
          <button key={digit} type="button" className="pin-input__key" onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <span className="pin-input__key pin-input__key--empty" aria-hidden="true" />
        <button type="button" className="pin-input__key" onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="pin-input__key" onClick={() => onChange(value.slice(0, -1))} aria-label="Backspace">
          ⌫
        </button>
      </div>
    </div>
  )
}
