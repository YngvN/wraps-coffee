import { useEffect, useState } from 'react'
import { Badge, BackButton, ChevronRightIcon, DiscountedPrice, EditDeleteButtons, Modal, PlusIcon, TranslatedText } from '../../../components'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import type { Category } from '../../../types/category'
import type { Price, Product } from '../../../types/product'
import { getEffectivePrice } from '../../../utils/price'
import { isProductOutOfStock } from '../../../utils/productStock'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { ProductForm } from './ProductForm'
import { SortableList } from './SortableList'
import './ProductsView.scss'

interface ProductListViewProps {
  category: Category
  /** Every category in the same catalogue — lets `ProductForm`'s recategorize `<select>` list every one of them, not just this one. */
  catalogueCategories: Category[]
  /** The owning catalogue's own default price — the fallback beneath the category's own default, in turn beneath a product's own override. */
  cataloguePrice: Price | undefined
  onBack: () => void
  /** Set by `ProductsView` from a `?productId=` search deep link — opens that exact product's edit form on arrival instead of requiring a click. */
  initialEditProductId?: string
  /** Called once `initialEditProductId` has been consumed (the form opened), so `ProductsView` can clear it and a later remount of this view doesn't reopen the same product's form unprompted. */
  onConsumeInitialEditProduct?: () => void
}

/** One category's own products: drag-reorderable, existing create/edit/delete CRUD (clicking a row, same as its own explicit Edit button, opens its editor — marked with a trailing chevron, same affordance the catalogue/category rows use for drilling in a level), each row showing a thumbnail (if set). A price only shows on the row itself when the product has its own individual price or a discount — a plain product just inheriting the category/catalogue default already has that shown once, in the category price editor above, so repeating it on every row would be noise. A discounted product's price is struck-through + the new one shown, and the row itself gets a gold border/glow. */
export function ProductListView({ category, catalogueCategories, cataloguePrice, onBack, initialEditProductId, onConsumeInitialEditProduct }: ProductListViewProps) {
  const { t, language } = useLanguage()
  const [products, setProducts] = useProducts()
  const [categoryPrices] = useCategoryPrices()
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined)

  const items = products.filter((product) => product.category === category.id)

  // Opens `initialEditProductId`'s own edit form as soon as it shows up in
  // `products` — guarded by checking `onConsumeInitialEditProduct` was
  // actually called yet (via the prop itself going away once `ProductsView`
  // clears it), since `products` may still be the seed snapshot for a
  // moment after mount, same posture as `ProductsView`'s own deep-link
  // effect for catalogue/category.
  useEffect(() => {
    if (!initialEditProductId) return
    const product = products.find((candidate) => candidate.itemID === initialEditProductId)
    if (!product) return
    queueMicrotask(() => {
      setEditingProduct(product)
      onConsumeInitialEditProduct?.()
    })
  }, [initialEditProductId, products, onConsumeInitialEditProduct])
  const isFormOpen = editingProduct !== undefined
  const closeForm = () => setEditingProduct(undefined)

  const handleSave = (product: Product) => {
    const exists = products.some((existing) => existing.itemID === product.itemID)
    setProducts(exists ? products.map((existing) => (existing.itemID === product.itemID ? product : existing)) : [...products, product])
    closeForm()
  }

  const handleDelete = (product: Product) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setProducts(products.filter((existing) => existing.itemID !== product.itemID))
  }

  const handleReorder = (reordered: Product[]) => {
    setProducts([...products.filter((product) => product.category !== category.id), ...reordered])
  }

  /** Fast inline quantity edit right in the list (see `.products-view__stock-quick-edit`), for when stock changes throughout the day and opening the full edit form each time would be too slow — writes through the same synced-key setter every other edit in this file already uses. */
  const handleStockQuantityChange = (product: Product, stockQuantity: number) => {
    setProducts(products.map((existing) => (existing.itemID === product.itemID ? { ...existing, stockQuantity } : existing)))
  }

  return (
    <div className="products-view">
      <div className="products-view__header">
        <BackButton onClick={onBack}>{t('admin.common.back')}</BackButton>
        <h1>{category.name[language]}</h1>
      </div>
      <TranslatedText as="p" id="admin.products.productsDescription" className="admin-page-description" />

      {items.length === 0 ? (
        <p className="products-view__empty">{t('admin.products.noProducts')}</p>
      ) : (
        <SortableList
          items={items}
          getId={(product) => product.itemID}
          onReorder={handleReorder}
          renderItem={(product) => {
            const showPrice = product.discount !== undefined || product.price !== undefined
            const effective = showPrice ? getEffectivePrice(product.price ?? categoryPrices[category.id] ?? cataloguePrice, product.discount) : undefined
            return (
              <div
                className={`products-view__item${product.discount ? ' products-view__item--discounted' : ''}${isProductOutOfStock(product) ? ' products-view__item--out-of-stock' : ''}`}
              >
                <button type="button" className="products-view__item-open" onClick={() => setEditingProduct(product)}>
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
                    <Badge variant={product.available ? 'success' : 'neutral'}>
                      {product.available ? t('admin.products.availableLabel') : t('admin.products.hiddenLabel')}
                    </Badge>
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
                      onChange={(event) => handleStockQuantityChange(product, Math.max(0, Math.round(Number(event.target.value)) || 0))}
                    />
                  )}
                  <EditDeleteButtons onEdit={() => setEditingProduct(product)} onDelete={() => handleDelete(product)} />
                </div>
              </div>
            )
          }}
        />
      )}

      <button type="button" className="products-view__add-row" onClick={() => setEditingProduct(null)}>
        <PlusIcon />
        {t('admin.products.addProduct')}
      </button>

      <Modal open={isFormOpen} onClose={closeForm} title={editingProduct ? t('admin.products.editProduct') : t('admin.products.addProduct')}>
        {isFormOpen && (
          <ProductForm
            product={editingProduct ?? null}
            defaultCategoryId={editingProduct?.category ?? category.id}
            catalogueCategories={catalogueCategories}
            onSave={handleSave}
            onCancel={closeForm}
          />
        )}
      </Modal>
    </div>
  )
}
