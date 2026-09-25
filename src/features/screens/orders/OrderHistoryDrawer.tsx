import { motion } from 'framer-motion'
import { ChevronLeftIcon, CloseIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderStatus } from '../../../types/order'

interface OrderHistoryDrawerProps {
  /** Already filtered and sorted (newest first) — see `historyOrders`. */
  orders: OrderRecord[]
  locked: boolean
  busy: ReadonlySet<string>
  onMove: (order: OrderRecord, to: OrderStatus) => void
  onOpen: (order: OrderRecord) => void
  onClose: () => void
}

/**
 * A panel sliding in from the right edge of the board (and back out on close, via the parent's `AnimatePresence`), listing today's picked-up and cancelled
 * orders (cancelled ones greyed out), each with a ← that puts it straight back in Done — the way to
 * recover an order moved out by mistake after its undo toast has gone. Tapping a row opens its
 * details. Stays inside the pane, like the detail sheet.
 */
export function OrderHistoryDrawer({ orders, locked, busy, onMove, onOpen, onClose }: OrderHistoryDrawerProps) {
  const { t } = useLanguage()

  return (
    <motion.div className="order-history" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.aside
        className="order-history__panel"
        onClick={(event) => event.stopPropagation()}
        aria-label={t('screenDisplay.orders.history')}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 42 }}
      >
        <header className="order-history__header">
          <h2>{t('screenDisplay.orders.history')}</h2>
          <button type="button" className="order-sheet__close" onClick={onClose} aria-label={t('screenDisplay.orders.close')}>
            <CloseIcon />
          </button>
        </header>
        {orders.length === 0 ? (
          <p className="order-history__empty">{t('screenDisplay.orders.historyEmpty')}</p>
        ) : (
          <ul className="order-history__list">
            {orders.map((order) => (
              <li key={order.id} className={order.status === 'cancelled' ? 'order-history__row order-history__row--cancelled' : 'order-history__row'}>
                <button
                  type="button"
                  className="order-history__restore"
                  disabled={locked || busy.has(order.id)}
                  onClick={() => onMove(order, 'ready')}
                  aria-label={t('screenDisplay.orders.backToDone')}
                >
                  <ChevronLeftIcon />
                  <span>{t('screenDisplay.orders.column.done')}</span>
                </button>
                <button type="button" className="order-history__open" onClick={() => onOpen(order)}>
                  <span className="order-history__name">{order.customerName}</span>
                  <span className="order-history__status">{t(`screenDisplay.orders.${order.status === 'cancelled' ? 'cancelled' : 'pickedUp'}`)}</span>
                  <span className="order-history__time">{order.pickupTime}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.aside>
    </motion.div>
  )
}
