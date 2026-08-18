import { useState } from 'react'
import { Button, Modal } from '../../../components'
import { useDisplayName } from '../../../hooks/useDisplayName'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { resolveProductCatalogue } from '../../../utils/productCatalogue'

interface MoveToCatalogueModalProps {
  product: Product
  catalogues: Catalogue[]
  onMove: (updated: Product) => void
  onCancel: () => void
}

/**
 * The one case same-catalogue drag-and-drop (`ProductBoard`) and
 * `ProductForm`'s own category `<select>` can't reach: relocating a product
 * to a genuinely different catalogue. Picks a target catalogue, then a
 * category within it (or "no category"), and patches the product directly —
 * same posture as every other quick row action in this feature, no need to
 * open the full edit form just to move something.
 */
export function MoveToCatalogueModal({ product, catalogues, onMove, onCancel }: MoveToCatalogueModalProps) {
  const { t } = useLanguage()
  const displayName = useDisplayName()
  const current = resolveProductCatalogue(product, catalogues)
  const [catalogueId, setCatalogueId] = useState(current?.catalogue.id ?? catalogues[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(current?.category?.id ?? '')

  const targetCatalogue = catalogues.find((candidate) => candidate.id === catalogueId)

  const handleSelectCatalogue = (nextCatalogueId: string) => {
    setCatalogueId(nextCatalogueId)
    setCategoryId('')
  }

  const handleConfirm = () => {
    onMove({ ...product, category: categoryId || undefined, catalogueId: categoryId ? undefined : catalogueId })
  }

  return (
    <Modal open onClose={onCancel} title={t('admin.products.moveToOtherCatalogue')}>
      <div className="move-to-catalogue-modal">
        <label className="product-form__field">
          <span>{t('admin.products.catalogueLabel')}</span>
          <select value={catalogueId} onChange={(event) => handleSelectCatalogue(event.target.value)}>
            {catalogues.map((catalogue) => (
              <option key={catalogue.id} value={catalogue.id}>
                {displayName(catalogue.name)}
              </option>
            ))}
          </select>
        </label>

        <label className="product-form__field">
          <span>{t('admin.products.categoryLabel')}</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">{t('admin.products.noCategoryOption')}</option>
            {targetCatalogue?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {displayName(category.name)}
              </option>
            ))}
          </select>
        </label>

        <div className="product-form__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!catalogueId}>
            {t('admin.products.moveConfirmButton')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
