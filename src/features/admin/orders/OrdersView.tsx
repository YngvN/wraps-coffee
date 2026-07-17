import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Card, TranslatedText } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useOrders } from '../../../hooks/useOrders'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderStatus } from '../../../types/order'
import { formatDateTime } from '../../../utils/clockFormat'
import './OrdersView.scss'

const STATUS_OPTIONS: OrderStatus[] = ['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

const STATUS_BADGE_VARIANT: Record<OrderStatus, 'info' | 'warning' | 'success' | 'error'> = {
  received: 'info',
  accepted: 'info',
  preparing: 'warning',
  ready: 'success',
  completed: 'success',
  cancelled: 'error',
}

/** Admin view of online orders placed on the public website — pulled down live via the Neon bridge (see `server/neonBridge.ts`). Only `status` is editable here; every other field belongs to the customer's original submission. A status change pushes back up to the website the same way it arrived, so its own order-status page reflects it. */
export function OrdersView() {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  const [orders, setOrders] = useOrders()
  const [searchParams, setSearchParams] = useSearchParams()
  /** The order `?orderId=` deep-linked in on (see the notification bell's "new order" links) — read straight from the URL rather than mirrored into its own `useState` (no React state to seed/clear, just this one derived read), so the highlight disappears exactly when the param is stripped below. */
  const highlightedOrderId = searchParams.get('orderId')
  const orderRefs = useRef<Record<string, HTMLLIElement | null>>({})

  const updateStatus = (id: string, status: OrderStatus) => {
    setOrders(orders.map((order) => (order.id === id ? { ...order, status } : order)))
  }

  /**
   * Deep-link support: `?orderId=<id>` scrolls that order's own card into
   * view — orders are a flat list already (no sub-view to open into), so
   * unlike Screens/Products this is scroll + a brief highlight (see
   * `highlightedOrderId` above) rather than seeding any drill-down state.
   * The param is stripped after a short delay (not immediately) so the
   * highlight has time to actually be seen; only `setSearchParams` runs
   * here, not a plain `useState` setter, since a bare `setState` call
   * inside an effect is what this codebase's own lint rule flags (see
   * `useIdleTimer.ts` for the same hit elsewhere). Depends on `orders` (not
   * just mount) since the real DOM node to scroll to only exists once this
   * list has actually rendered with live data.
   */
  useEffect(() => {
    const orderId = searchParams.get('orderId')
    if (!orderId) return
    const element = orderRefs.current[orderId]
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timeout = setTimeout(() => {
      setSearchParams((current) => {
        current.delete('orderId')
        return current
      })
    }, 2000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs as `orders` loads in, but becomes a no-op once `orderId` is stripped from the URL.
  }, [orders])

  return (
    <div className="orders-view">
      <TranslatedText as="h1" id="admin.orders.title" />
      <TranslatedText as="p" id="admin.orders.description" className="admin-page-description" />

      {orders.length === 0 ? (
        <p className="orders-view__empty">{t('admin.orders.noOrders')}</p>
      ) : (
        <ul className="orders-view__list">
          {orders.map((order: OrderRecord) => (
            <li
              key={order.id}
              ref={(element) => {
                orderRefs.current[order.id] = element
              }}
              className={highlightedOrderId === order.id ? 'orders-view__item--highlighted' : undefined}
            >
              <Card>
                <div className="orders-view__header">
                  <div>
                    <span className="orders-view__customer">{order.customerName}</span>
                    <span className="orders-view__phone">{order.customerPhone}</span>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{t(`admin.orders.status.${order.status}`)}</Badge>
                </div>

                <ul className="orders-view__items">
                  {order.items.map((item) => (
                    <li key={item.itemID}>
                      <span>
                        {item.quantity}× {item.name}
                      </span>
                      <span>{(item.quantity * item.unitPrice).toFixed(0)} kr</span>
                    </li>
                  ))}
                </ul>

                <div className="orders-view__meta">
                  <span>
                    {t('admin.orders.pickupTimeLabel')}: {order.pickupTime}
                  </span>
                  <span>
                    {t('admin.orders.placedLabel')}: {formatDateTime(new Date(order.createdAt), language, clockFormat, dateFormat)}
                  </span>
                  <span className="orders-view__total">
                    {t('admin.orders.totalLabel')}: {order.totalPrice.toFixed(0)} kr
                  </span>
                </div>

                {order.notes && <p className="orders-view__notes">{order.notes}</p>}

                <label className="orders-view__status-field">
                  <span>{t('admin.orders.statusLabel')}</span>
                  <select value={order.status} onChange={(event) => updateStatus(order.id, event.target.value as OrderStatus)}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {t(`admin.orders.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
