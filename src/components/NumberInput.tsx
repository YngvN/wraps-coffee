import type { InputHTMLAttributes, ReactNode } from 'react'
import { useNumberInputValue } from '../hooks/useNumberInputValue'
import './Input.scss'

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label?: ReactNode
  error?: string
  value: number
  onChange: (value: number) => void
}

/**
 * Number field styled to match {@link Input}, backed by {@link useNumberInputValue} so a leading
 * zero the user types (e.g. `0` → `04`) gets cleared immediately instead of sticking around — see
 * that hook's doc comment for why a plain `value={someNumber}` binding doesn't do this on its own.
 */
export function NumberInput({ label, error, id, className, value, onChange, ...props }: NumberInputProps) {
  const numberInputProps = useNumberInputValue(value, onChange)
  const classes = ['input', error && 'input--error', className].filter(Boolean).join(' ')

  return (
    <div className="input-field">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} type="number" className={classes} {...props} {...numberInputProps} />
      {error && <p className="input-field__error">{error}</p>}
    </div>
  )
}
