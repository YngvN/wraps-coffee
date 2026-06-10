import type { ReactNode } from 'react'
import './Card.scss'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
}

export function Card({ title, children, className }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {title && <h3 className="card__title">{title}</h3>}
      <div className="card__body">{children}</div>
    </div>
  )
}
