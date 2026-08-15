import { useState } from 'react'
import { Badge, BackButton, Modal, TranslatedText } from '../../../components'
import { useDisplayName } from '../../../hooks/useDisplayName'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import { ImagesIcon } from '../layout/AdminNavIcons'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { isProductOutOfStock } from '../../../utils/productStock'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { ProductForm } from './ProductForm'
import './AllProductsView.scss'

/** Whether `product` belongs to this catalogue at all — either via a real category, or (see `Product.catalogueId`) directly with no category. */
function belongsToCatalogue(product: Product, catalogue: Catalogue): boolean {
  if (product.category) return catalogue.categories.some((category) => category.id === product.category)
  return product.catalogueId === catalogue.id
}

interface AllProductsViewProps {
  catalogue: Catalogue
}

/**
 * Every product across every category in this catalogue (plus any with no
 * category at all — see `Product.catalogueId`), as an image-forward card
 * grid — a quick visual scan across the whole catalogue at once, distinct
 * from `CategoriesView`'s own per-category drag-and-drop board, which this
 * doesn't replace. A product with no image shows a
 * placeholder icon in its place rather than an empty gap. Clicking a card
 * opens the same edit form every other product view already uses. Rendered
 * from `ProductsView` as a submenu, not a route of its own — its own Back
 * level (returning to the categories view) is registered by `ProductsView`
 * itself, not here.
 */
export function AllProductsView({ catalogue }: AllProductsViewProps) {
  const { t } = useLanguage()
  const displayName = useDisplayName()
  const [products, setProducts] = useProducts()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const categoryById = new Map(catalogue.categories.map((category) => [category.id, category]))
  const items = products.filter((product) => belongsToCatalogue(product, catalogue))

  const closeForm = () => setEditingProduct(null)
  const handleSave = (product: Product) => {
    setProducts(products.map((existing) => (existing.itemID === product.itemID ? product : existing)))
    closeForm()
  }

  return (
    <div className="products-view">
      <div className="products-view__sub-header">
        <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: displayName(catalogue.name) })}</BackButton>
        <h1>{t('admin.products.allProductsTitle')}</h1>
      </div>
      <TranslatedText as="p" id="admin.products.allProductsDescription" className="admin-page-description" />

      {items.length === 0 ? (
        <p className="products-view__empty">{t('admin.products.noProducts')}</p>
      ) : (
        <div className="all-products-view__grid">
          {items.map((product) => (
            <button key={product.itemID} type="button" className="all-products-view__card" onClick={() => setEditingProduct(product)}>
              <div className="all-products-view__card-image">
                {product.image ? <img src={getThumbnailUrl(product.image)} alt="" /> : <ImagesIcon className="all-products-view__placeholder-icon" />}
              </div>
              <div className="all-products-view__card-body">
                <span className="all-products-view__card-name">{displayName(product.name)}</span>
                <span className="all-products-view__card-category">
                  {product.category ? displayName(categoryById.get(product.category)?.name) : t('admin.products.noCategoryColumnLabel')}
                </span>
                <div className="all-products-view__card-badges">
                  {!product.available && <Badge variant="neutral">{t('admin.products.hiddenLabel')}</Badge>}
                  {isProductOutOfStock(product) && <Badge variant="warning">{t('admin.products.soldOutLabel')}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={editingProduct !== null} onClose={closeForm} title={t('admin.products.editProduct')}>
        {editingProduct && (
          <ProductForm
            product={editingProduct}
            catalogueId={catalogue.id}
            defaultCategoryId={editingProduct.category}
            catalogueCategories={catalogue.categories}
            onSave={handleSave}
            onCancel={closeForm}
          />
        )}
      </Modal>
    </div>
  )
}
