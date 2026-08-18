import type { ButtonHTMLAttributes } from 'react'
import './Button.scss'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `'primary'` (default) is the filled call-to-action, `'secondary'` the
   * outlined companion. `'danger'` is the outlined-but-red treatment for an
   * irreversible action (delete, revoke) — outlined rather than filled on
   * purpose, so a Delete sitting in every list row reads as destructive
   * without out-weighting the page's own primary action.
   */
  variant?: 'primary' | 'secondary' | 'danger'
}

/** The app's shared button. Renders a plain `<button>` with `btn btn--{variant}`; every native button attribute passes straight through. */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ')
  return <button className={classes} {...props} />
}
