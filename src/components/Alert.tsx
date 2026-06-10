import type { ReactNode } from 'react'
import './Alert.scss'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: ReactNode
}

export function Alert({ variant = 'info', title, children }: AlertProps) {
  return (
    <div className={`alert alert--${variant}`} role="alert">
      {title && <strong className="alert__title">{title}</strong>}
      <div className="alert__body">{children}</div>
    </div>
  )
}
