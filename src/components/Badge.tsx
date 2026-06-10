import type { ReactNode } from 'react'
import './Badge.scss'

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{children}</span>
}
