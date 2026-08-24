import { useState } from 'react'
import { Badge, Button, Checkbox, Modal, TranslatedText } from '../../../components'
import { useDisplayName } from '../../../hooks/useDisplayName'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { MoveToCatalogueModal } from './MoveToCatalogueModal'
import './UnassignedProductsModal.scss'

interface UnassignedProductsModalProps {
  /** Every product whose `category`/`catalogueId` no longer resolves to any real catalogue (see `resolveProductCatalogue`) — orphaned by a catalogue getting deleted before this pane existed to catch it. */
  products: Product[]
  catalogues: Catalogue[]
  onMoveProduct: (updated: Product) => void
  /** Removes every product passed in, in one batch — a single row's own Delete button calls this with a one-item array too, so there's only ever one delete path to keep in sync with the outbound sync push. */
  onDeleteProducts: (products: Product[]) => void
  onClose: () => void
}

/**
 * Recovery pane for products left behind by a deleted catalogue: since a
 * product's only route into any other admin view is through the catalogue it
 * belongs to (`AllProductsView`, `CategoriesView`'s board), one whose
 * catalogue no longer exists becomes otherwise unreachable in the UI even
 * though it's still sitting in `admin.products` — and, until acted on here,
 * still gets pushed to the external website on every full-replace sync. Each
 * row offers "move" (reuses `MoveToCatalogueModal`, same as any other
 * product row) or "delete", since there's no catalogue context left to open
 * a full edit form against; a checkbox per row plus a "select all" toggle
 * back a bulk delete for clearing out a whole deleted catalogue's worth at
 * once, rather than one confirm dialog per product.
 */
export function UnassignedProductsModal({ products, catalogues, onMoveProduct, onDeleteProducts, onClose }: UnassignedProductsModalProps) {
  const { t } = useLanguage()
  const displayName = useDisplayName()
  const [movingProduct, setMovingProduct] = useState<Product | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allSelected = products.length > 0 && products.every((product) => selectedIds.has(product.itemID))

  const toggleSelected = (itemID: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(itemID)) next.delete(itemID)
      else next.add(itemID)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(products.map((product) => product.itemID)))
  }

  const handleDelete = (toDelete: Product[]) => {
    if (!window.confirm(t('admin.products.confirmDeleteSelected', { count: toDelete.length }))) return
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const product of toDelete) next.delete(product.itemID)
      return next
    })
    onDeleteProducts(toDelete)
  }

  return (
    <Modal open onClose={onClose} title={t('admin.products.unassignedProductsTitle')}>
      <div className="unassigned-products-modal">
        <TranslatedText as="p" id="admin.products.unassignedProductsDescription" className="admin-page-description" />

        {products.length === 0 ? (
          <p className="products-view__empty">{t('admin.products.unassignedProductsResolved')}</p>
        ) : (
          <>
            <div className="unassigned-products-modal__toolbar">
              <Checkbox label={t('admin.products.selectAllLabel')} checked={allSelected} onChange={toggleSelectAll} />
              <Button type="button" variant="danger" disabled={selectedIds.size === 0} onClick={() => handleDelete(products.filter((product) => selectedIds.has(product.itemID)))}>
                {t('admin.products.deleteSelectedButton', { count: selectedIds.size })}
              </Button>
            </div>

            <ul className="products-view__list">
              {products.map((product) => (
                <li key={product.itemID} className="products-view__item">
                  <div className="products-view__item-info">
                    <label className="checkbox unassigned-products-modal__item-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.itemID)}
                        onChange={() => toggleSelected(product.itemID)}
                        aria-label={t('admin.products.selectProductAria', { name: displayName(product.name) })}
                      />
                      <span className="checkbox__box" aria-hidden="true" />
                    </label>
                    {product.image && <img className="products-view__item-thumb" src={getThumbnailUrl(product.image)} alt="" />}
                    <span className="products-view__item-name">{displayName(product.name)}</span>
                    <Badge variant={product.available ? 'success' : 'neutral'}>{product.available ? t('admin.products.availableLabel') : t('admin.products.hiddenLabel')}</Badge>
                  </div>
                  <div className="products-view__item-actions">
                    <Button type="button" variant="secondary" onClick={() => setMovingProduct(product)} aria-label={t('admin.products.moveToOtherCatalogue')}>
                      {t('admin.products.moveConfirmButton')}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => handleDelete([product])}>
                      {t('admin.common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {movingProduct && (
        <MoveToCatalogueModal
          product={movingProduct}
          catalogues={catalogues}
          onMove={(updated) => {
            setMovingProduct(null)
            onMoveProduct(updated)
          }}
          onCancel={() => setMovingProduct(null)}
        />
      )}
    </Modal>
  )
}
