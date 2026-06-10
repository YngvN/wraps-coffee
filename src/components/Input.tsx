import type { InputHTMLAttributes, ReactNode } from 'react'
import './Input.scss'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
}

export function Input({ label, error, id, className, ...props }: InputProps) {
  const classes = ['input', error && 'input--error', className].filter(Boolean).join(' ')

  return (
    <div className="input-field">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={classes} {...props} />
      {error && <p className="input-field__error">{error}</p>}
    </div>
  )
}
