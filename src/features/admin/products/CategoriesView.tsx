import { useState } from 'react'
import { BackButton, Modal, PlusIcon, TranslatedText } from '../../../components'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import type { Catalogue, Category } from '../../../types/category'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { CategoryForm } from './CategoryForm'
import { ChevronRightIcon } from './ChevronRightIcon'
import { EditDeleteButtons } from './EditDeleteButtons'
import { SortableList } from './SortableList'
import './ProductsView.scss'

interface CategoriesViewProps {
  catalogue: Catalogue
  onSaveCatalogue: (catalogue: Catalogue) => void
  onOpenCategory: (categoryId: string) => void
  onBack: () => void
}

/** One catalogue's own categories: drag-reorderable, create/rename/delete (with confirm — deleting a category also drops every product inside it and its own default-price entry), click through to that category's products. */
export function CategoriesView({ catalogue, onSaveCatalogue, onOpenCategory, onBack }: CategoriesViewProps) {
  const { t, language } = useLanguage()
  const [products, setProducts] = useProducts()
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  const [editingCategory, setEditingCategory] = useState<Category | null | undefined>(undefined)

  const isFormOpen = editingCategory !== undefined
  const closeForm = () => setEditingCategory(undefined)

  const handleSave = (category: Category) => {
    const exists = catalogue.categories.some((existing) => existing.id === category.id)
    onSaveCatalogue({
      ...catalogue,
      categories: exists ? catalogue.categories.map((existing) => (existing.id === category.id ? category : existing)) : [...catalogue.categories, category],
    })
    closeForm()
  }

  const handleDelete = (category: Category) => {
    if (!window.confirm(t('admin.products.confirmDeleteCategory'))) return
    onSaveCatalogue({ ...catalogue, categories: catalogue.categories.filter((existing) => existing.id !== category.id) })
    setProducts(products.filter((product) => product.category !== category.id))
    setCategoryPrices({ ...categoryPrices, [category.id]: undefined })
  }

  return (
    <div className="products-view">
      <div className="products-view__header">
        <BackButton onClick={onBack}>{t('admin.common.back')}</BackButton>
        <h1>{catalogue.name[language]}</h1>
      </div>
      <TranslatedText as="p" id="admin.products.categoriesDescription" className="admin-page-description" />

      {catalogue.categories.length === 0 ? (
        <p className="products-view__empty">{t('admin.products.noCategories')}</p>
      ) : (
        <SortableList
          items={catalogue.categories}
          getId={(category) => category.id}
          onReorder={(categories) => onSaveCatalogue({ ...catalogue, categories })}
          renderItem={(category) => (
            <div className="products-view__item">
              <button type="button" className="products-view__item-open" onClick={() => onOpenCategory(category.id)}>
                {category.image && <img className="products-view__item-thumb" src={getThumbnailUrl(category.image)} alt="" />}
                <span className="products-view__item-name">{category.name[language]}</span>
                <ChevronRightIcon />
              </button>
              <div className="products-view__item-actions">
                <EditDeleteButtons onEdit={() => setEditingCategory(category)} onDelete={() => handleDelete(category)} />
              </div>
            </div>
          )}
        />
      )}

      <button type="button" className="products-view__add-row" onClick={() => setEditingCategory(null)}>
        <PlusIcon />
        {t('admin.products.addCategory')}
      </button>

      <Modal open={isFormOpen} onClose={closeForm} title={editingCategory ? t('admin.products.editCategory') : t('admin.products.addCategory')}>
        {isFormOpen && <CategoryForm category={editingCategory ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>
    </div>
  )
}
