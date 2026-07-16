import { useState } from 'react'
import { Badge, BackButton, Modal, TranslatedText } from '../../../components'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { ImagesIcon } from '../layout/AdminNavIcons'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { isProductOutOfStock } from '../../../utils/productStock'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { ProductForm } from './ProductForm'
import './AllProductsView.scss'

interface AllProductsViewProps {
  catalogue: Catalogue
  onBack: () => void
}

/**
 * Every product across every category in this catalogue, as an
 * image-forward card grid — a quick visual scan across the whole catalogue
 * at once, instead of drilling into it category by category (see
 * `CategoriesView`, which links here, and `ProductListView`, the per-category
 * row list this doesn't replace). A product with no image shows a
 * placeholder icon in its place rather than an empty gap. Clicking a card
 * opens the same edit form every other product view already uses.
 */
export function AllProductsView({ catalogue, onBack }: AllProductsViewProps) {
  const { t, language } = useLanguage()
  const [products, setProducts] = useProducts()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const categoryById = new Map(catalogue.categories.map((category) => [category.id, category]))
  const items = products.filter((product) => categoryById.has(product.category))

  const closeForm = () => setEditingProduct(null)
  const handleSave = (product: Product) => {
    setProducts(products.map((existing) => (existing.itemID === product.itemID ? product : existing)))
    closeForm()
  }

  return (
    <div className="products-view">
      <div className="products-view__header">
        <BackButton onClick={onBack}>{t('admin.common.back')}</BackButton>
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
                <span className="all-products-view__card-name">{product.name[language]}</span>
                <span className="all-products-view__card-category">{categoryById.get(product.category)?.name[language]}</span>
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
          <ProductForm product={editingProduct} defaultCategoryId={editingProduct.category} catalogueCategories={catalogue.categories} onSave={handleSave} onCancel={closeForm} />
        )}
      </Modal>
    </div>
  )
}
