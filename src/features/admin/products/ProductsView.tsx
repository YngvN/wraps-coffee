import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ChevronRightIcon, EditDeleteButtons, Modal, SlideTransition, TranslatedText } from '../../../components'
import { useBackLevel } from '../../../hooks/useBackLevel'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useRecentlyOpened } from '../../../hooks/useRecentlyOpened'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import { AllProductsView } from './AllProductsView'
import { CatalogueForm } from './CatalogueForm'
import { CategoriesView } from './CategoriesView'
import { ProductListView } from './ProductListView'
import './ProductsView.scss'

/** Admin view for the Products hierarchy: catalogues (e.g. "Food menu", a separate "Merch" catalogue for non-food items) → each catalogue's own categories → each category's own products. Edits show up live on the kiosk display. */
export function ProductsView() {
  const { t, language } = useLanguage()
  const [catalogues, setCatalogues] = useCatalogues()
  const { record: recordRecentlyOpened } = useRecentlyOpened()
  const [editingCatalogue, setEditingCatalogue] = useState<Catalogue | null | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [openCatalogueId, setOpenCatalogueId] = useState<string | null>(null)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(false)
  /** Set from `?productId=` (search deep link) — passed to `ProductListView` so it opens that exact product's edit form on arrival. Cleared via `onConsumeInitialEditProduct` once consumed, so navigating back to categories and into the same one again doesn't reopen it. */
  const [openProductId, setOpenProductId] = useState<string | null>(null)
  /** `1` while drilling into a deeper view, `-1` while going back — see `SlideTransition`. */
  const [direction, setDirection] = useState<1 | -1>(1)
  /** Guards the deep-link effect below so it only ever actually opens the drill-down once — `catalogues` starts out as the bundled seed and only gets its real contents once the WS snapshot arrives a moment later, so this effect has to keep re-checking as `catalogues` updates rather than running once on mount; without this ref it would re-open the drill-down on every later `catalogues` change too, even long after the admin has since navigated elsewhere. */
  const consumedDeepLinkRef = useRef(false)

  /**
   * Deep-link support: `?catalogueId=<id>&categoryId=<id>&productId=<id>`
   * opens straight into that catalogue (and, if given, that category and
   * product) instead of requiring clicks through the list — what the
   * sidebar's tier-2 flyout, "recently opened" entries, and the global
   * search results (see `useGlobalSearchIndex`) actually navigate to.
   * Depends on
   * `catalogues` (not just mount) since the target may not exist yet in it
   * on the very first render (see `consumedDeepLinkRef`); once found, the
   * state updates are deferred via `queueMicrotask` rather than called
   * directly in the effect body, which is what this codebase's own "no
   * synchronous setState in an effect" lint rule requires (see
   * `useIdleTimer.ts` for the same rule hit elsewhere) — `setSearchParams`
   * itself is exempt from that rule, so stripping the params happens
   * directly, right here.
   */
  useEffect(() => {
    if (consumedDeepLinkRef.current) return
    const catalogueId = searchParams.get('catalogueId')
    const catalogue = catalogueId ? catalogues.find((candidate) => candidate.id === catalogueId) : undefined
    if (!catalogue) return
    consumedDeepLinkRef.current = true
    const categoryId = searchParams.get('categoryId')
    const category = categoryId ? catalogue.categories.find((candidate) => candidate.id === categoryId) : undefined
    const wantsAllProducts = Boolean(searchParams.get('allProducts'))
    const productId = searchParams.get('productId')
    queueMicrotask(() => {
      setOpenCatalogueId(catalogue.id)
      if (category) {
        setOpenCategoryId(category.id)
        recordRecentlyOpened('category', category.id, category.name[language])
        if (productId) setOpenProductId(productId)
      } else if (wantsAllProducts) {
        setShowAllProducts(true)
      }
    })
    setSearchParams((current) => {
      current.delete('catalogueId')
      current.delete('categoryId')
      current.delete('allProducts')
      current.delete('productId')
      return current
    })
  }, [catalogues, searchParams, setSearchParams, language, recordRecentlyOpened])

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
    setShowAllProducts(false)
  }
  const handleOpenCategory = (categoryId: string) => {
    setDirection(1)
    setOpenCategoryId(categoryId)
    const category = openCatalogue?.categories.find((candidate) => candidate.id === categoryId)
    if (category) recordRecentlyOpened('category', category.id, category.name[language])
  }
  const handleBackToCategories = () => {
    setDirection(-1)
    setOpenCategoryId(null)
  }
  const handleOpenAllProducts = () => {
    setDirection(1)
    setShowAllProducts(true)
  }
  const handleBackFromAllProducts = () => {
    setDirection(-1)
    setShowAllProducts(false)
  }

  /**
   * Registers each level of the catalogue → category/all-products drill-down
   * with the shared browser-back stack (see `useBackLevel`), so the mouse's
   * back button closes one level at a time, exactly the way each level's own
   * Back button does. `openCategoryId`/`showAllProducts` nest one level
   * deeper than `openCatalogueId`, matching the actual view hierarchy.
   */
  useBackLevel(openCatalogueId !== null, handleBackToCatalogues)
  useBackLevel(openCategoryId !== null, handleBackToCategories)
  useBackLevel(showAllProducts, handleBackFromAllProducts)

  const saveOpenCatalogue = (catalogue: Catalogue) => setCatalogues(catalogues.map((existing) => (existing.id === catalogue.id ? catalogue : existing)))

  const view = openCatalogue && openCategory ? 'products' : openCatalogue && showAllProducts ? 'allProducts' : openCatalogue ? 'categories' : 'catalogues'

  return (
    <>
      <SlideTransition viewKey={view} direction={direction}>
        {view === 'products' && openCatalogue && openCategory ? (
          <ProductListView
            category={openCategory}
            catalogueCategories={openCatalogue.categories}
            cataloguePrice={openCatalogue.price}
            catalogueName={openCatalogue.name[language]}
            initialEditProductId={openProductId ?? undefined}
            onConsumeInitialEditProduct={() => setOpenProductId(null)}
          />
        ) : view === 'allProducts' && openCatalogue ? (
          <AllProductsView catalogue={openCatalogue} />
        ) : view === 'categories' && openCatalogue ? (
          <CategoriesView
            catalogue={openCatalogue}
            onSaveCatalogue={saveOpenCatalogue}
            onOpenCategory={handleOpenCategory}
            onOpenAllProducts={handleOpenAllProducts}
          />
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
