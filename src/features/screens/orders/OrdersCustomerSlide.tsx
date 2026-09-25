import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useFoodoraOrders } from '../../../hooks/useFoodoraOrders'
import { useNow } from '../../../hooks/useNow'
import { useOrders } from '../../../hooks/useOrders'
import { useWoltOrders } from '../../../hooks/useWoltOrders'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderSource } from '../../../types/order'
import { formatClockTime } from '../../../utils/clockFormat'
import { columnOf, customerOrderLabel, filterBySources, sortByPickup } from './orderColumns'
import { useFitRowScale } from './useFitRowScale'
import { useOfflineSince } from './useOfflineSince'
import './OrdersBoard.scss'
import './OrdersCustomer.scss'

interface OrdersCustomerSlideProps {
  sources?: OrderSource[]
  readyAutoHideMinutes?: number
}

/**
 * One order on the customer board: its short order number only (see `customerOrderLabel`) — no name,
 * phone, items or price, since the screen faces the public. Wolt/Foodora orders are told apart by their
 * platform's colour as the cell background rather than a logo, which stays legible however small the
 * rows get. Shares its `layoutId` across both sections, so an order visibly glides from "Lages nå" to
 * "Ferdig" — the moment customers are watching for.
 */
function CustomerOrderRow({ order }: { order: OrderRecord }) {
  return (
    <motion.li
      layout
      layoutId={order.id}
      className={`orders-customer__row orders-customer__row--${order.source ?? 'website'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 260, damping: 32 }}
    >
      <span className="orders-customer__number">#{customerOrderLabel(order).number}</span>
    </motion.li>
  )
}

/**
 * The customer-facing pickup board for an `'orders'` pane in `'customer'` mode: "Being made"
 * (received/accepted/preparing) and "Ready for pickup" (ready). An order leaves the board when it's
 * picked up or cancelled — or, with `readyAutoHideMinutes` set, that long after this board first saw
 * it Ready (orders carry no status timestamp, so the clock starts when this page noticed). Always
 * read-only, and shows order numbers only. Each section lays its orders out two wide, and when the
 * queue outgrows the pane every row shrinks together (`useFitRowScale`) so nothing is ever cut off.
 */
export function OrdersCustomerSlide({ sources, readyAutoHideMinutes }: OrdersCustomerSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [websiteOrders] = useOrders()
  const [woltOrders] = useWoltOrders()
  const [foodoraOrders] = useFoodoraOrders()
  const nowMs = useNow(15_000)
  const offlineSince = useOfflineSince()

  const orders = useMemo(() => filterBySources([...websiteOrders, ...woltOrders, ...foodoraOrders], sources), [websiteOrders, woltOrders, foodoraOrders, sources])
  const beingMade = useMemo(() => sortByPickup(orders.filter((order) => columnOf(order.status) === 'incoming' || order.status === 'preparing')), [orders])
  const ready = useMemo(() => sortByPickup(orders.filter((order) => order.status === 'ready')), [orders])

  // When this board first saw each Ready order — kept in sync with `ready` during render (React's
  // recommended pattern for state derived from props), adding new arrivals and dropping ones that left.
  const [readySince, setReadySince] = useState<Record<string, number>>({})
  const readyIds = ready.map((order) => order.id)
  const added = readyIds.filter((id) => !(id in readySince))
  const removed = Object.keys(readySince).filter((id) => !readyIds.includes(id))
  if (added.length > 0 || removed.length > 0) {
    const next: Record<string, number> = {}
    for (const id of readyIds) next[id] = readySince[id] ?? nowMs
    setReadySince(next)
  }

  const hideAfterMs = readyAutoHideMinutes && readyAutoHideMinutes > 0 ? readyAutoHideMinutes * 60_000 : null
  const visibleReady = hideAfterMs === null ? ready : ready.filter((order) => nowMs - (readySince[order.id] ?? nowMs) < hideAfterMs)
  const beingMadeList = useRef<HTMLUListElement>(null)
  const readyList = useRef<HTMLUListElement>(null)
  const rowScale = useFitRowScale([beingMadeList, readyList], beingMade.length + visibleReady.length)

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="orders-customer" style={{ '--row-scale': rowScale } as CSSProperties}>
          {offlineSince && (
            <div className="orders-board__offline">
              {t('screenDisplay.orders.offline', {
                time: formatClockTime(offlineSince, language, clockFormat),
              })}
            </div>
          )}
          <section className="orders-customer__column">
            <h2 className="orders-customer__title">{t('screenDisplay.orders.beingMade')}</h2>
            <ul className="orders-customer__list" ref={beingMadeList}>
              <AnimatePresence initial={false} mode="popLayout">
                {beingMade.map((order) => (
                  <CustomerOrderRow key={order.id} order={order} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
          <section className="orders-customer__column orders-customer__column--ready">
            <h2 className="orders-customer__title">{t('screenDisplay.orders.readyForPickup')}</h2>
            <ul className="orders-customer__list" ref={readyList}>
              <AnimatePresence initial={false} mode="popLayout">
                {visibleReady.map((order) => (
                  <CustomerOrderRow key={order.id} order={order} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        </div>
      </LayoutGroup>
    </MotionConfig>
  )
}
