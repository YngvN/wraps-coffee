import { motion } from 'framer-motion'
import { FetchedLogo } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderStatus } from '../../../types/order'
import { OrderArrows } from './OrderArrows'
import { ageLevel, matchesNoteKeyword, minutesSince } from './orderColumns'

interface OrderCardProps {
  order: OrderRecord
  now: Date
  ageWarnMinutes: [number, number]
  noteKeywords: string[]
  /** False on a read-only board: no arrows, and tapping does nothing. */
  interactive: boolean
  /** Arrows disabled — a change is in flight, or the board is offline. */
  locked: boolean
  /** The server's message if this order's last change was refused — kept as a tooltip only, since it is English server text; the card shows a translated line. */
  failedMessage?: string
  flashing: boolean
  onOpen: () => void
  onMove: (to: OrderStatus) => void
}

/**
 * Shared by every card: the card fades/scales in when it first appears, and `layout` + a `layoutId`
 * per order make it glide from one column (or lane) to the next instead of jumping — the move reads as
 * the result of the tap. `OrdersBoardSlide` wraps the columns in one `LayoutGroup` for this.
 */
const CARD_MOTION = {
  layout: true,
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { type: 'spring', stiffness: 500, damping: 40 },
} as const

/** `true` when a `pickupTime` like `"12:30"` is already past on `now`'s clock. Anything that isn't `HH:MM` is never treated as overdue. */
function isOverdue(pickupTime: string, now: Date): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(pickupTime.trim())
  if (!match) return false
  return now.getHours() * 60 + now.getMinutes() > Number(match[1]) * 60 + Number(match[2])
}

/**
 * One order on the staff board: customer, pickup time (red once overdue), how long ago it was placed
 * (amber/red past the pane's thresholds), item count, a red notes line when the notes match an
 * allergy-type keyword, and the platform logo plus brand stripe for Wolt/Foodora orders. Tapping the
 * card body opens its details; the arrows move it without opening anything.
 */
export function OrderCard({ order, now, ageWarnMinutes, noteKeywords, interactive, locked, failedMessage, flashing, onOpen, onMove }: OrderCardProps) {
  const { t } = useLanguage()
  const age = minutesSince(order.createdAt, now)
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const alertNote = matchesNoteKeyword(order.notes, noteKeywords)
  const classes = [
    'order-card',
    `order-card--${order.source ?? 'website'}`,
    flashing && 'order-card--flash',
    failedMessage && 'order-card--failed',
    interactive && 'order-card--interactive',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <div className="order-card__top">
        {(order.source === 'wolt' || order.source === 'foodora') && (
          <FetchedLogo slug={order.source} label={t(order.source === 'wolt' ? 'admin.orders.sourceWolt' : 'admin.orders.sourceFoodora')} className="order-card__logo" />
        )}
        <span className="order-card__name">{order.customerName}</span>
        <span className={`order-card__age order-card__age--${ageLevel(age, ageWarnMinutes)}`}>{t('screenDisplay.orders.ageMinutes', { count: age })}</span>
      </div>
      <div className="order-card__meta">
        <span className={isOverdue(order.pickupTime, now) ? 'order-card__pickup order-card__pickup--overdue' : 'order-card__pickup'}>
          {t('screenDisplay.orders.pickupAt', { time: order.pickupTime })}
        </span>
        <span>{t('screenDisplay.orders.itemCount', { count: itemCount })}</span>
      </div>
      {order.notes && <p className={alertNote ? 'order-card__notes order-card__notes--alert' : 'order-card__notes'}>{order.notes}</p>}
      {failedMessage && (
        <p className="order-card__error" title={failedMessage}>
          {t('screenDisplay.orders.pushFailed')}
        </p>
      )}
    </>
  )

  if (!interactive)
    return (
      <motion.div layoutId={order.id} className={classes} {...CARD_MOTION}>
        {body}
      </motion.div>
    )

  return (
    <motion.div layoutId={order.id} className={classes} {...CARD_MOTION}>
      <button type="button" className="order-card__open" onClick={onOpen}>
        {body}
      </button>
      <OrderArrows order={order} onMove={onMove} disabled={locked} />
    </motion.div>
  )
}
