import { Link } from 'react-router-dom'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { useOrders } from '../../../hooks/useOrders'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { resolveProductCatalogue } from '../../../utils/productCatalogue'
import { isProductOutOfStock } from '../../../utils/productStock'
import { AdminRightPanel } from './AdminRightPanel'
import { BellIcon } from './AdminNavIcons'
import './NotificationsDropdown.scss'

interface NotificationsDropdownProps {
  /** Whether this bell's own `AdminRightPanel` is the one currently open — owned by `AdminTopNavbar` (see `activePanel` there), not this component, so opening this panel always closes the Messages one. */
  open: boolean
  onToggle: () => void
  onClose: () => void
}

/**
 * Top navbar's bell trigger: new orders (`status === 'received'`),
 * out-of-stock tracked products (`trackStock` on, see
 * `isProductOutOfStock`), and pending display pairing requests (a new TV
 * that's heartbeated in but not yet approved, see `useDisplayPairingRequests`)
 * — badge count = all three combined. Its content opens in an
 * `AdminRightPanel` sliding in from the right edge of the screen rather than
 * a small anchored dropdown box. Each row links straight to the relevant
 * record via the same `?orderId=`/`?catalogueId=&categoryId=&productId=`/
 * `/displays?pendingMachineId=` deep link
 * `OrdersView`/`ProductsView`/`DisplayManagerView` already read on mount
 * (see those views' own `useSearchParams` effects) — clicking one is a
 * real jump-to, not just a generic "go look at X" link. No new WS plumbing
 * needed for the pairing-request source — `admin.displayPairingRequests` is
 * already a regular synced key, pushed live the same way orders/products are.
 */
export function NotificationsDropdown({ open, onToggle, onClose }: NotificationsDropdownProps) {
  const { t, language } = useLanguage()
  const [orders] = useOrders()
  const [products] = useProducts()
  const [catalogues] = useCatalogues()
  const [pairingRequests] = useDisplayPairingRequests()

  const newOrders = orders.filter((order) => order.status === 'received')
  const outOfStockProducts = products.filter((product) => product.trackStock && isProductOutOfStock(product))
  const badgeCount = newOrders.length + outOfStockProducts.length + pairingRequests.length

  return (
    <div className="notifications-dropdown">
      <button
        type="button"
        className="admin-top-navbar__icon-link"
        onClick={onToggle}
        aria-label={t('admin.notifications.title')}
        title={t('admin.notifications.title')}
      >
        <BellIcon />
        {badgeCount > 0 && <span className="notifications-dropdown__badge">{badgeCount}</span>}
      </button>

      <AdminRightPanel open={open} onClose={onClose} title={t('admin.notifications.title')}>
        {badgeCount === 0 ? (
          <p className="notifications-dropdown__empty">{t('admin.notifications.empty')}</p>
        ) : (
          <ul className="notifications-dropdown__list">
            {newOrders.map((order) => (
              <li key={order.id}>
                <Link to={`/admin/dashboard/orders?orderId=${order.id}`} onClick={onClose}>
                  <span className="notifications-dropdown__item-title">{t('admin.notifications.newOrder', { name: order.customerName })}</span>
                  <span className="notifications-dropdown__item-meta">{order.pickupTime}</span>
                </Link>
              </li>
            ))}
            {outOfStockProducts.map((product) => {
              const resolved = resolveProductCatalogue(product, catalogues)
              const categoryParam = resolved?.category ? `&categoryId=${resolved.category.id}` : ''
              const href = resolved ? `/admin/dashboard/products?catalogueId=${resolved.catalogue.id}${categoryParam}&productId=${product.itemID}` : '/admin/dashboard/products'
              return (
                <li key={product.itemID}>
                  <Link to={href} onClick={onClose}>
                    <span className="notifications-dropdown__item-title">{t('admin.notifications.outOfStock', { name: product.name[language] })}</span>
                  </Link>
                </li>
              )
            })}
            {pairingRequests.map((request) => (
              <li key={request.machineID}>
                <Link to={`/admin/dashboard/displays?pendingMachineId=${request.machineID}`} onClick={onClose}>
                  <span className="notifications-dropdown__item-title">{t('admin.notifications.newPairingRequest', { name: request.label })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminRightPanel>
    </div>
  )
}
