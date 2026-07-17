import type { InputHTMLAttributes } from 'react'
import './Checkbox.scss'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

/** Shared checkbox control — an outlined box whose border morphs into a checkmark when checked, adapted from a Uiverse.io design (see README credits) to this app's own theme tokens. */
export function Checkbox({ label, id, ...props }: CheckboxProps) {
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="checkbox__label">{label}</span>
    </label>
  )
}
