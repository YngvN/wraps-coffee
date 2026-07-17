import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useOrders } from '../../../hooks/useOrders'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { isProductOutOfStock } from '../../../utils/productStock'
import { BellIcon } from './AdminNavIcons'
import './NotificationsDropdown.scss'

/**
 * Top navbar's bell dropdown: new orders (`status === 'received'`) and
 * out-of-stock tracked products (`trackStock` on, see
 * `isProductOutOfStock`), badge count = the two combined. Each row links
 * straight to the relevant record via the same `?orderId=`/
 * `?catalogueId=&categoryId=` deep-link query params `OrdersView`/
 * `ProductsView` already read on mount (see those views' own
 * `useSearchParams` effects) — clicking one is a real jump-to, not just a
 * generic "go look at Orders/Products" link.
 */
export function NotificationsDropdown() {
  const { t, language } = useLanguage()
  const [orders] = useOrders()
  const [products] = useProducts()
  const [catalogues] = useCatalogues()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const newOrders = orders.filter((order) => order.status === 'received')
  const outOfStockProducts = products.filter((product) => product.trackStock && isProductOutOfStock(product))
  const badgeCount = newOrders.length + outOfStockProducts.length

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  /** A product only carries its own category id (`Product.category`), not the catalogue it lives under — `ProductsView`'s deep link needs both, so this walks every catalogue's own category list to find the one that contains it. */
  const catalogueIdForCategory = (categoryId: string): string | undefined =>
    catalogues.find((catalogue) => catalogue.categories.some((category) => category.id === categoryId))?.id

  return (
    <div className="notifications-dropdown" ref={containerRef}>
      <button
        type="button"
        className="admin-top-navbar__icon-link"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('admin.notifications.title')}
        title={t('admin.notifications.title')}
      >
        <BellIcon />
        {badgeCount > 0 && <span className="notifications-dropdown__badge">{badgeCount}</span>}
      </button>

      {open && (
        <div className="notifications-dropdown__panel">
          <div className="notifications-dropdown__header">{t('admin.notifications.title')}</div>
          {badgeCount === 0 ? (
            <p className="notifications-dropdown__empty">{t('admin.notifications.empty')}</p>
          ) : (
            <ul className="notifications-dropdown__list">
              {newOrders.map((order) => (
                <li key={order.id}>
                  <Link to={`/admin/dashboard/orders?orderId=${order.id}`} onClick={() => setOpen(false)}>
                    <span className="notifications-dropdown__item-title">{t('admin.notifications.newOrder', { name: order.customerName })}</span>
                    <span className="notifications-dropdown__item-meta">{order.pickupTime}</span>
                  </Link>
                </li>
              ))}
              {outOfStockProducts.map((product) => {
                const catalogueId = catalogueIdForCategory(product.category)
                const href = catalogueId ? `/admin/dashboard/products?catalogueId=${catalogueId}&categoryId=${product.category}` : '/admin/dashboard/products'
                return (
                  <li key={product.itemID}>
                    <Link to={href} onClick={() => setOpen(false)}>
                      <span className="notifications-dropdown__item-title">{t('admin.notifications.outOfStock', { name: product.name[language] })}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
