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

  const updateStatus = (id: string, status: OrderStatus) => {
    setOrders(orders.map((order) => (order.id === id ? { ...order, status } : order)))
  }

  return (
    <div className="orders-view">
      <TranslatedText as="h1" id="admin.orders.title" />
      <TranslatedText as="p" id="admin.orders.description" className="admin-page-description" />

      {orders.length === 0 ? (
        <p className="orders-view__empty">{t('admin.orders.noOrders')}</p>
      ) : (
        <ul className="orders-view__list">
          {orders.map((order: OrderRecord) => (
            <li key={order.id}>
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
