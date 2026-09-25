import { useLanguage } from '../../../i18n'
import type { OrderRecord } from '../../../types/order'
import './OrderSummary.scss'

/** The order's contents at a glance, under a card's buttons: every item with its quantity, then the total. No per-item prices — the details view and the receipt have those. Items a register sale already handed over at the counter (`servedAtCounter`, e.g. a soda) are dimmed and tagged, so the kitchen sees the whole order but knows not to make them. */
export function OrderSummary({ order }: { order: OrderRecord }) {
  const { t } = useLanguage()
  return (
    <div className="order-summary">
      <ul className="order-summary__items">
        {order.items.map((item) => (
          <li key={item.itemID} className={order.servedAtCounter?.includes(item.itemID) ? 'order-summary__item--served' : undefined}>
            <span className="order-summary__quantity">{item.quantity}×</span> {item.name}
            {order.servedAtCounter?.includes(item.itemID) && <span className="order-summary__served">{t('screenDisplay.orders.servedAtCounter')}</span>}
          </li>
        ))}
      </ul>
      <span className="order-summary__total">
        {t('screenDisplay.orders.total')}: {order.totalPrice.toFixed(0)} kr
      </span>
    </div>
  )
}
