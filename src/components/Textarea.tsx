import type { ReactNode, TextareaHTMLAttributes } from 'react'
import './Input.scss'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  error?: string
}

/** Multi-line text field, styled to match {@link Input}. */
export function Textarea({ label, error, id, className, ...props }: TextareaProps) {
  const classes = ['input', 'textarea', error && 'input--error', className].filter(Boolean).join(' ')

  return (
    <div className="input-field">
      {label && <label htmlFor={id}>{label}</label>}
      <textarea id={id} className={classes} {...props} />
      {error && <p className="input-field__error">{error}</p>}
    </div>
  )
}
