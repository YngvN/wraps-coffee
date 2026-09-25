import type { MouseEvent, ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderStatus } from '../../../types/order'
import { nextStatus, prevStatus } from './orderColumns'

interface OrderArrowsProps {
  order: OrderRecord
  onMove: (to: OrderStatus) => void
  /** Disables both arrows, e.g. while this order's last change is still in flight or the board is offline. */
  disabled?: boolean
  /** `'large'` for the detail sheet. */
  size?: 'normal' | 'large'
  /** A control placed between ← and → — the print button on Done cards and in the details view. */
  middle?: ReactNode
}

/**
 * The ← / → pair that moves an order one column back or forward — shared by the card and the detail
 * sheet so both behave identically. An arrow with nowhere to go (← on Incoming) is left out rather
 * than disabled, so a wet thumb can't land on a dead button. Taps stop propagating, so pressing an
 * arrow on a card never also opens that card's details.
 */
export function OrderArrows({ order, onMove, disabled, size = 'normal', middle }: OrderArrowsProps) {
  const { t } = useLanguage()
  const back = prevStatus(order.status)
  const forward = nextStatus(order.status)

  const handle = (to: OrderStatus) => (event: MouseEvent) => {
    event.stopPropagation()
    onMove(to)
  }

  return (
    <div className={`order-arrows order-arrows--${size}`}>
      {back ? (
        <button type="button" className="order-arrows__button" onClick={handle(back)} disabled={disabled} aria-label={t('screenDisplay.orders.moveBack')}>
          <ChevronLeftIcon />
        </button>
      ) : (
        <span className="order-arrows__spacer" />
      )}
      {middle}
      {forward && (
        <button
          type="button"
          className="order-arrows__button order-arrows__button--forward"
          onClick={handle(forward)}
          disabled={disabled}
          aria-label={t('screenDisplay.orders.moveForward')}
        >
          <ChevronRightIcon />
        </button>
      )}
    </div>
  )
}
