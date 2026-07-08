import type { ButtonHTMLAttributes } from 'react'
import './BackButton.scss'

type BackButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

/**
 * A ghost "← Back" link-style button for navigating out of a sub-view back
 * to whatever it was opened from (e.g. a modal's own sub-panel) — the arrow
 * glyph is built in; pass the label itself as children, translated by the
 * caller, since what it's going "back" to differs by usage.
 */
export function BackButton({ className, children, type = 'button', ...props }: BackButtonProps) {
  const classes = ['back-button', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} {...props}>
      <span aria-hidden="true">←</span>
      {children}
    </button>
  )
}
