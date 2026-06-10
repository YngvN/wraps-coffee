import type { InputHTMLAttributes } from 'react'
import './Checkbox.scss'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function Checkbox({ label, id, ...props }: CheckboxProps) {
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}
