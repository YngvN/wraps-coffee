import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Button, EditDeleteButtons, Modal, SlideTransition, TranslatedText } from '../../../components'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import { CatalogueForm } from './CatalogueForm'
import { CategoriesView } from './CategoriesView'
import { ChevronRightIcon } from './ChevronRightIcon'
import { ProductListView } from './ProductListView'
import './ProductsView.scss'

/** Admin view for the Products hierarchy: catalogues (e.g. "Food menu", a separate "Merch" catalogue for non-food items) → each catalogue's own categories → each category's own products. Edits show up live on the kiosk display. */
export function ProductsView() {
  const { t, language } = useLanguage()
  const [catalogues, setCatalogues] = useCatalogues()
  const [editingCatalogue, setEditingCatalogue] = useState<Catalogue | null | undefined>(undefined)
  const [openCatalogueId, setOpenCatalogueId] = useState<string | null>(null)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  /** `1` while drilling into a deeper view, `-1` while going back — see `SlideTransition`. */
  const [direction, setDirection] = useState<1 | -1>(1)

  const isFormOpen = editingCatalogue !== undefined
  const closeForm = () => setEditingCatalogue(undefined)

  const handleSave = (catalogue: Catalogue) => {
    const exists = catalogues.some((existing) => existing.id === catalogue.id)
    setCatalogues(exists ? catalogues.map((existing) => (existing.id === catalogue.id ? catalogue : existing)) : [...catalogues, catalogue])
    closeForm()
  }

  /** Deleting a catalogue removes it and every category nested inside it — since categories live inside `Catalogue.categories`, this alone is enough for those; their own products (a separate flat list, `admin.products`) still need their own cleanup pass. */
  const handleDelete = (catalogue: Catalogue) => {
    if (!window.confirm(t('admin.products.confirmDeleteCatalogue'))) return
    setCatalogues(catalogues.filter((existing) => existing.id !== catalogue.id))
  }

  const openCatalogue = catalogues.find((catalogue) => catalogue.id === openCatalogueId)
  const openCategory = openCatalogue?.categories.find((category) => category.id === openCategoryId)

  const handleOpenCatalogue = (catalogueId: string) => {
    setDirection(1)
    setOpenCatalogueId(catalogueId)
  }
  const handleBackToCatalogues = () => {
    setDirection(-1)
    setOpenCatalogueId(null)
    setOpenCategoryId(null)
  }
  const handleOpenCategory = (categoryId: string) => {
    setDirection(1)
    setOpenCategoryId(categoryId)
  }
  const handleBackToCategories = () => {
    setDirection(-1)
    setOpenCategoryId(null)
  }

  const saveOpenCatalogue = (catalogue: Catalogue) => setCatalogues(catalogues.map((existing) => (existing.id === catalogue.id ? catalogue : existing)))

  const view = openCatalogue && openCategory ? 'products' : openCatalogue ? 'categories' : 'catalogues'

  return (
    <>
      <SlideTransition viewKey={view} direction={direction}>
        {view === 'products' && openCatalogue && openCategory ? (
          <ProductListView
            category={openCategory}
            catalogueCategories={openCatalogue.categories}
            cataloguePrice={openCatalogue.price}
            onBack={handleBackToCategories}
          />
        ) : view === 'categories' && openCatalogue ? (
          <CategoriesView catalogue={openCatalogue} onSaveCatalogue={saveOpenCatalogue} onOpenCategory={handleOpenCategory} onBack={handleBackToCatalogues} />
        ) : (
          <div className="products-view">
            <div className="products-view__header">
              <TranslatedText as="h1" id="admin.products.title" />
              <Button onClick={() => setEditingCatalogue(null)}>{t('admin.products.addCatalogue')}</Button>
            </div>
            <TranslatedText as="p" id="admin.products.description" className="admin-page-description" />

            {catalogues.length === 0 ? (
              <p className="products-view__empty">{t('admin.products.noCatalogues')}</p>
            ) : (
              <ul className="products-view__list">
                <AnimatePresence initial={false}>
                  {catalogues.map((catalogue) => (
                    <motion.li
                      key={catalogue.id}
                      className="products-view__item"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <button type="button" className="products-view__item-open" onClick={() => handleOpenCatalogue(catalogue.id)}>
                        <span className="products-view__item-name">{catalogue.name[language]}</span>
                        <ChevronRightIcon />
                      </button>
                      <div className="products-view__item-actions">
                        <EditDeleteButtons onEdit={() => setEditingCatalogue(catalogue)} onDelete={() => handleDelete(catalogue)} />
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </SlideTransition>

      <Modal open={isFormOpen} onClose={closeForm} title={editingCatalogue ? t('admin.products.editCatalogue') : t('admin.products.addCatalogue')}>
        {isFormOpen && <CatalogueForm catalogue={editingCatalogue ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>
    </>
  )
}
