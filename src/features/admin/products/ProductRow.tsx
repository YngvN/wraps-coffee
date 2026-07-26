import { useState } from 'react'
import { Badge, ChevronRightIcon, DiscountedPrice, EditDeleteButtons } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Price, Product } from '../../../types/product'
import { getEffectivePrice } from '../../../utils/price'
import { isProductOutOfStock } from '../../../utils/productStock'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { MoveToCatalogueModal } from './MoveToCatalogueModal'

interface ProductRowProps {
  product: Product
  /** The resolved default price beneath this product's own — a category's default, or (for a no-category product) the catalogue's own default. See `defaultPriceForProduct`. */
  defaultPrice: Price | undefined
  /** Every catalogue, for the "Move to another catalogue…" picker — this row has no catalogue list of its own otherwise. */
  catalogues: Catalogue[]
  onOpen: () => void
  onDelete: () => void
  onStockQuantityChange: (quantity: number) => void
  onMove: (updated: Product) => void
}

/** One product's own row: thumbnail, name, price/discount, allergen/dietary badges, availability/out-of-stock badges, a quick inline stock-quantity edit (only while `trackStock` is on), and Edit/Move/Delete actions. Shared by `ProductBoard` (one column per category, plus "No category") and, in future, anywhere else a flat product list is rendered — extracted so that layout doesn't have to duplicate this markup. */
export function ProductRow({ product, defaultPrice, catalogues, onOpen, onDelete, onStockQuantityChange, onMove }: ProductRowProps) {
  const { t, language } = useLanguage()
  const [isMoving, setIsMoving] = useState(false)

  const showPrice = product.discount !== undefined || product.price !== undefined
  const effective = showPrice ? getEffectivePrice(product.price ?? defaultPrice, product.discount) : undefined

  return (
    <div className={`products-view__item${product.discount ? ' products-view__item--discounted' : ''}${isProductOutOfStock(product) ? ' products-view__item--out-of-stock' : ''}`}>
      <button type="button" className="products-view__item-open" onClick={onOpen}>
        {product.image && <img className="products-view__item-thumb" src={getThumbnailUrl(product.image)} alt="" />}
        <div className="products-view__item-info">
          <span className="products-view__item-name">{product.name[language]}</span>
          {effective && <DiscountedPrice price={effective.original} discount={product.discount} t={t} />}
          {product.allergens.map((code) => (
            <span key={code} className="products-view__allergen">
              {code}
            </span>
          ))}
          {product.dietaryTags.map((tag) => (
            <Badge key={tag} variant="info">
              {t(`menu.dietaryTags.items.${tag}.title`)}
            </Badge>
          ))}
          <Badge variant={product.available ? 'success' : 'neutral'}>{product.available ? t('admin.products.availableLabel') : t('admin.products.hiddenLabel')}</Badge>
          {isProductOutOfStock(product) && <Badge variant="warning">{t('admin.products.soldOutLabel')}</Badge>}
        </div>
        <ChevronRightIcon />
      </button>
      <div className="products-view__item-actions">
        {product.trackStock && (
          <input
            type="number"
            min={0}
            className="products-view__stock-quick-edit"
            aria-label={t('admin.products.stockQuantityLabel')}
            title={t('admin.products.stockQuantityLabel')}
            value={product.stockQuantity ?? 0}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onStockQuantityChange(Math.max(0, Math.round(Number(event.target.value)) || 0))}
          />
        )}
        <EditDeleteButtons onEdit={onOpen} onMove={() => setIsMoving(true)} onDelete={onDelete} />
      </div>

      {isMoving && (
        <MoveToCatalogueModal
          product={product}
          catalogues={catalogues}
          onMove={(updated) => {
            setIsMoving(false)
            onMove(updated)
          }}
          onCancel={() => setIsMoving(false)}
        />
      )}
    </div>
  )
}
