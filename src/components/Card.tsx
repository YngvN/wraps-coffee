import type { ReactNode, Ref } from 'react'
import './Card.scss'

interface CardProps {
  /** `ReactNode` rather than `string` so a `HelpTip` can sit inline beside the title text, matching `Input`/`Checkbox`'s own label props. */
  title?: ReactNode
  children: ReactNode
  className?: string
  /** Forwarded to the outer `div` — e.g. for `useScrollToAndHighlight`'s `registerRef`, to scroll to and flash a specific card from a deep link. */
  ref?: Ref<HTMLDivElement>
}

export function Card({ title, children, className, ref }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes}>
      {title && <h3 className="card__title">{title}</h3>}
      <div className="card__body">{children}</div>
    </div>
  )
}
