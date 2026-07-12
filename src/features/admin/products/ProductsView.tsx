import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Badge, Button, Modal, TranslatedText } from '../../../components'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import type { Product } from '../../../types/product'
import { CategoryPriceEditor } from './CategoryPriceEditor'
import { CATEGORY_ORDER } from './categoryMeta'
import { ProductForm } from './ProductForm'
import './ProductsView.scss'

/** Admin view for creating, editing and deleting menu products, grouped by category. Edits show up live on the public Menu page. */
export function ProductsView() {
  const { t, language } = useLanguage()
  const [products, setProducts] = useProducts()
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined)

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

  return (
    <div className="products-view">
      <div className="products-view__header">
        <TranslatedText as="h1" id="admin.products.title" />
        <Button onClick={() => setEditingProduct(null)}>{t('admin.products.addProduct')}</Button>
      </div>

      {CATEGORY_ORDER.map((categoryKey) => {
        const items = products.filter((product) => product.category === categoryKey)

        return (
          <section key={categoryKey} className="products-view__category">
            <h2>{t(`menu.categories.${categoryKey}.title`)}</h2>
            <CategoryPriceEditor category={categoryKey} />
            {items.length === 0 ? (
              <p className="products-view__empty">{t('admin.products.noProducts')}</p>
            ) : (
              <ul className="products-view__list">
                <AnimatePresence initial={false}>
                  {items.map((product) => (
                    <motion.li
                      key={product.itemID}
                      className="products-view__item"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="products-view__item-info">
                        <span className="products-view__item-name">{product.name[language]}</span>
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
                      </div>
                      <div className="products-view__item-actions">
                        <Button variant="secondary" onClick={() => setEditingProduct(product)}>
                          {t('admin.common.edit')}
                        </Button>
                        <Button variant="secondary" onClick={() => handleDelete(product)}>
                          {t('admin.common.delete')}
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        )
      })}

      <Modal open={isFormOpen} onClose={closeForm} title={editingProduct ? t('admin.products.editProduct') : t('admin.products.addProduct')}>
        {isFormOpen && (
          <ProductForm
            product={editingProduct ?? null}
            defaultCategory={editingProduct?.category ?? CATEGORY_ORDER[0]}
            onSave={handleSave}
            onCancel={closeForm}
          />
        )}
      </Modal>
    </div>
  )
}
