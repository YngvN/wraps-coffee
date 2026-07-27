import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { BackButton, ChevronRightIcon, EditDeleteButtons, Modal, PlusIcon, TranslatedText } from '../../../components'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useProducts } from '../../../hooks/useProducts'
import { useScrollToAndHighlight } from '../../../hooks/useScrollToAndHighlight'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import type { Catalogue, Category } from '../../../types/category'
import type { CategoryPrices, Product } from '../../../types/product'
import { defaultPriceForProduct } from '../../../utils/productCatalogue'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { CategoryForm } from './CategoryForm'
import { NO_CATEGORY_COLUMN, ProductColumnBody } from './ProductColumn'
import { ProductForm } from './ProductForm'
import { ProductRow } from './ProductRow'
import './ProductsView.scss'
import './SortableList.scss'

interface CategoriesViewProps {
  catalogue: Catalogue
  onSaveCatalogue: (catalogue: Catalogue) => void
  onOpenAllProducts: () => void
  /** Set by a `?categoryId=` search deep link — expands and scrolls/flashes that category's own section (see `useScrollToAndHighlight`); there's no separate per-category page to navigate to anymore. */
  initialExpandCategoryId?: string
  /** Set by a `?productId=` search/notification deep link — expands whichever section that product is actually in and opens its editor directly. */
  initialEditProductId?: string
  onConsumeInitialDeepLink?: () => void
}

/** Which product this editor session is for (`null` = creating a new one) and which category/no-category section it should be created into. */
interface EditingProductState {
  product: Product | null
  categoryId: string | null
}

/** A column id is either a real `Category.id` or the fixed `NO_CATEGORY_COLUMN` sentinel. */
function columnIdFor(catalogue: Catalogue, product: Product): string | null {
  if (product.category) return catalogue.categories.some((category) => category.id === product.category) ? product.category : null
  return product.catalogueId === catalogue.id ? NO_CATEGORY_COLUMN : null
}

/**
 * One catalogue's own categories, reworked into an expandable products
 * board: drag-reorderable category rows, each expanding inline to show its
 * own products instead of drilling into a separate page, plus a fixed "No
 * category" section for products that live directly in this catalogue. A
 * product can be dragged between sections (or out to "No category") — see
 * `handleDragEnd`'s own doc comment for how a drop is resolved to a
 * destination. Category reordering and product cross-section dragging both
 * share this one `DndContext` deliberately — dnd-kit hooks always bind to
 * the nearest *ancestor* `DndContext`, so wrapping a second, separate
 * `DndContext` around the category rows (as this view's own previous,
 * now-removed `SortableList`-based version did) would make a product's own
 * `useSortable`/`useDroppable` register with that inner context instead of
 * this outer one, and cross-category drags would silently never reach this
 * file's own `handleDragEnd` at all. Category add/edit/delete (including the
 * existing delete cascade that removes a category's own products outright)
 * is unchanged. The "View all products" row above still opens
 * `AllProductsView`, a separate flat "quick visual scan" grid. Rendered from
 * `ProductsView` as a submenu, not a route of its own — its own Back level
 * (returning to the catalogues list) is registered by `ProductsView` itself,
 * not here.
 */
export function CategoriesView({ catalogue, onSaveCatalogue, onOpenAllProducts, initialExpandCategoryId, initialEditProductId, onConsumeInitialDeepLink }: CategoriesViewProps) {
  const { t, language } = useLanguage()
  const [products, setProducts] = useProducts()
  const [catalogues] = useCatalogues()
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  const [editingCategory, setEditingCategory] = useState<Category | null | undefined>(undefined)
  const [editingProduct, setEditingProduct] = useState<EditingProductState | undefined>(undefined)
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const { registerRef, triggerHighlight } = useScrollToAndHighlight()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columns = useMemo(() => {
    const byId = new Map<string, Product[]>()
    for (const category of catalogue.categories) byId.set(category.id, [])
    byId.set(NO_CATEGORY_COLUMN, [])
    for (const product of products) {
      const columnId = columnIdFor(catalogue, product)
      if (columnId) byId.get(columnId)?.push(product)
    }
    return byId
  }, [catalogue, products])

  useEffect(() => {
    if (initialExpandCategoryId) {
      queueMicrotask(() => {
        setExpandedColumns((current) => new Set(current).add(initialExpandCategoryId))
        triggerHighlight(initialExpandCategoryId)
        onConsumeInitialDeepLink?.()
      })
      return
    }
    if (!initialEditProductId) return
    const product = products.find((candidate) => candidate.itemID === initialEditProductId)
    if (!product) return
    const columnId = columnIdFor(catalogue, product) ?? NO_CATEGORY_COLUMN
    queueMicrotask(() => {
      setExpandedColumns((current) => new Set(current).add(columnId))
      setEditingProduct({ product, categoryId: product.category ?? null })
      onConsumeInitialDeepLink?.()
    })
  }, [initialExpandCategoryId, initialEditProductId, products, catalogue, triggerHighlight, onConsumeInitialDeepLink])

  const toggleColumn = (columnId: string) => {
    setExpandedColumns((current) => {
      const next = new Set(current)
      if (next.has(columnId)) next.delete(columnId)
      else next.add(columnId)
      return next
    })
  }

  const isFormOpen = editingCategory !== undefined
  const closeForm = () => setEditingCategory(undefined)

  const handleSaveCategory = (category: Category) => {
    const exists = catalogue.categories.some((existing) => existing.id === category.id)
    onSaveCatalogue({
      ...catalogue,
      categories: exists ? catalogue.categories.map((existing) => (existing.id === category.id ? category : existing)) : [...catalogue.categories, category],
    })
    closeForm()
  }

  const handleDeleteCategory = (category: Category) => {
    if (!window.confirm(t('admin.products.confirmDeleteCategory'))) return
    onSaveCatalogue({ ...catalogue, categories: catalogue.categories.filter((existing) => existing.id !== category.id) })
    setProducts(products.filter((product) => product.category !== category.id))
    setCategoryPrices({ ...categoryPrices, [category.id]: undefined })
  }

  const isProductFormOpen = editingProduct !== undefined
  const closeProductForm = () => setEditingProduct(undefined)

  const handleSaveProduct = (product: Product) => {
    const exists = products.some((existing) => existing.itemID === product.itemID)
    setProducts(exists ? products.map((existing) => (existing.itemID === product.itemID ? product : existing)) : [...products, product])
    closeProductForm()
  }

  const handleDeleteProduct = (product: Product) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setProducts(products.filter((existing) => existing.itemID !== product.itemID))
  }

  const handleStockQuantityChange = (product: Product, stockQuantity: number) => {
    setProducts(products.map((existing) => (existing.itemID === product.itemID ? { ...existing, stockQuantity } : existing)))
  }

  const handleMoveProduct = (updated: Product) => {
    setProducts(products.map((existing) => (existing.itemID === updated.itemID ? updated : existing)))
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  /**
   * One shared handler for both drag domains, disambiguated by what
   * `active.id` actually is:
   * - A category's own id → reordering the category list itself (`over.id`
   *   must also be a real category's id; anything else, e.g. dropping a
   *   category over some product's own row, is a no-op).
   * - Anything else → a product move. `over.id` is resolved to a
   *   destination column from whichever of these it actually is: another
   *   product's own id (its column), a `column:<id>` droppable (a section's
   *   whole area — used when dropped on an empty/collapsed one), or a bare
   *   category id (that category row's own sortable slot, when dropped
   *   directly on the row rather than its body). The touched column(s)' own
   *   items are replaced in the shared `products` array; every other
   *   product (in this catalogue or any other) is left exactly where it was.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const isCategoryDrag = catalogue.categories.some((category) => category.id === activeId)
    if (isCategoryDrag) {
      if (!catalogue.categories.some((category) => category.id === overId)) return
      const oldIndex = catalogue.categories.findIndex((category) => category.id === activeId)
      const newIndex = catalogue.categories.findIndex((category) => category.id === overId)
      if (oldIndex === -1 || newIndex === -1) return
      onSaveCatalogue({ ...catalogue, categories: arrayMove(catalogue.categories, oldIndex, newIndex) })
      return
    }

    const activeProduct = products.find((product) => product.itemID === activeId)
    if (!activeProduct) return
    const sourceColumnId = columnIdFor(catalogue, activeProduct)
    if (!sourceColumnId) return

    const overProduct = products.find((product) => product.itemID === overId)
    const destinationColumnId = overProduct
      ? columnIdFor(catalogue, overProduct)
      : overId.startsWith('column:')
        ? overId.slice('column:'.length)
        : catalogue.categories.some((category) => category.id === overId)
          ? overId
          : sourceColumnId
    if (!destinationColumnId) return

    const movedProduct: Product =
      destinationColumnId === sourceColumnId
        ? activeProduct
        : {
            ...activeProduct,
            category: destinationColumnId === NO_CATEGORY_COLUMN ? undefined : destinationColumnId,
            catalogueId: destinationColumnId === NO_CATEGORY_COLUMN ? catalogue.id : undefined,
          }

    const destinationItems = (columns.get(destinationColumnId) ?? []).filter((product) => product.itemID !== activeProduct.itemID)
    const overIndex = overProduct ? destinationItems.findIndex((product) => product.itemID === overProduct.itemID) : destinationItems.length
    const insertIndex = overIndex === -1 ? destinationItems.length : overIndex
    const nextDestinationItems = [...destinationItems]
    nextDestinationItems.splice(insertIndex, 0, movedProduct)

    const sourceRemainder = destinationColumnId === sourceColumnId ? [] : (columns.get(sourceColumnId) ?? []).filter((product) => product.itemID !== activeProduct.itemID)

    const untouched = products.filter((product) => {
      const columnId = columnIdFor(catalogue, product)
      return columnId === null || (columnId !== sourceColumnId && columnId !== destinationColumnId)
    })

    setProducts([...untouched, ...sourceRemainder, ...nextDestinationItems])
  }

  const activeProduct = products.find((product) => product.itemID === activeId)
  const activeCategory = catalogue.categories.find((category) => category.id === activeId)

  return (
    <div className="products-view">
      <div className="products-view__sub-header">
        <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.products.title') })}</BackButton>
        <h1>{catalogue.name[language]}</h1>
      </div>
      <TranslatedText as="p" id="admin.products.categoriesDescription" className="admin-page-description" />

      <div className="products-view__categories-toolbar">
        <button type="button" className="products-view__add-row" onClick={() => setEditingCategory(null)}>
          <PlusIcon />
          {t('admin.products.addCategory')}
        </button>

        <div className="products-view__item products-view__view-all-products">
          <button type="button" className="products-view__item-open" onClick={onOpenAllProducts}>
            <span className="products-view__item-name">{t('admin.products.viewAllProducts')}</span>
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        {catalogue.categories.length === 0 ? (
          <p className="products-view__empty">{t('admin.products.noCategories')}</p>
        ) : (
          <SortableContext items={catalogue.categories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence initial={false}>
              {catalogue.categories.map((category) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  items={columns.get(category.id) ?? []}
                  isExpanded={expandedColumns.has(category.id)}
                  onToggle={() => toggleColumn(category.id)}
                  catalogues={catalogues}
                  categoryPrices={categoryPrices}
                  registerRef={registerRef(category.id)}
                  onEdit={() => setEditingCategory(category)}
                  onDelete={() => handleDeleteCategory(category)}
                  onAddProduct={() => setEditingProduct({ product: null, categoryId: category.id })}
                  onOpenProduct={(product) => setEditingProduct({ product, categoryId: category.id })}
                  onDeleteProduct={handleDeleteProduct}
                  onStockQuantityChange={handleStockQuantityChange}
                  onMoveProduct={handleMoveProduct}
                />
              ))}
            </AnimatePresence>
          </SortableContext>
        )}

        <NoCategorySection
          items={columns.get(NO_CATEGORY_COLUMN) ?? []}
          isExpanded={expandedColumns.has(NO_CATEGORY_COLUMN)}
          onToggle={() => toggleColumn(NO_CATEGORY_COLUMN)}
          catalogues={catalogues}
          categoryPrices={categoryPrices}
          registerRef={registerRef(NO_CATEGORY_COLUMN)}
          onAddProduct={() => setEditingProduct({ product: null, categoryId: null })}
          onOpenProduct={(product) => setEditingProduct({ product, categoryId: null })}
          onDeleteProduct={handleDeleteProduct}
          onStockQuantityChange={handleStockQuantityChange}
          onMoveProduct={handleMoveProduct}
        />

        <DragOverlay>
          {activeProduct ? (
            <ProductRow
              product={activeProduct}
              defaultPrice={defaultPriceForProduct(activeProduct, catalogues, categoryPrices)}
              catalogues={catalogues}
              onOpen={() => {}}
              onDelete={() => {}}
              onStockQuantityChange={() => {}}
              onMove={() => {}}
            />
          ) : activeCategory ? (
            <div className="products-view__item">
              {activeCategory.image && <img className="products-view__item-thumb" src={getThumbnailUrl(activeCategory.image)} alt="" />}
              <span className="products-view__item-name">{activeCategory.name[language]}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal open={isFormOpen} onClose={closeForm} title={editingCategory ? t('admin.products.editCategory') : t('admin.products.addCategory')}>
        {isFormOpen && <CategoryForm category={editingCategory ?? null} onSave={handleSaveCategory} onCancel={closeForm} />}
      </Modal>

      <Modal open={isProductFormOpen} onClose={closeProductForm} title={editingProduct?.product ? t('admin.products.editProduct') : t('admin.products.addProduct')}>
        {isProductFormOpen && (
          <ProductForm
            product={editingProduct.product}
            catalogueId={catalogue.id}
            defaultCategoryId={editingProduct.categoryId ?? undefined}
            catalogueCategories={catalogue.categories}
            onSave={handleSaveProduct}
            onCancel={closeProductForm}
          />
        )}
      </Modal>
    </div>
  )
}

interface CategorySectionProps {
  category: Category
  items: Product[]
  isExpanded: boolean
  onToggle: () => void
  catalogues: Catalogue[]
  categoryPrices: CategoryPrices
  registerRef: (node: HTMLElement | null) => void
  onEdit: () => void
  onDelete: () => void
  onAddProduct: () => void
  onOpenProduct: (product: Product) => void
  onDeleteProduct: (product: Product) => void
  onStockQuantityChange: (product: Product, quantity: number) => void
  onMoveProduct: (updated: Product) => void
}

/**
 * One category's own row (thumbnail, name, edit/delete, drag handle for
 * reordering — same as before) plus its own expandable product section
 * right below it. Two separate dnd-kit roles live here, deliberately on
 * different nodes: `useSortable` (the row itself) is this category's own
 * slot among its siblings for *category* reordering; `useDroppable` (the
 * outer wrapper, row + body together) is a *product* drop target, active
 * even while the section is still collapsed. `CategoriesView`'s own
 * `handleDragEnd` is what tells these two apart (by checking what
 * `active.id` actually is), since both share one `DndContext`.
 */
function CategorySection({
  category,
  items,
  isExpanded,
  onToggle,
  catalogues,
  categoryPrices,
  registerRef,
  onEdit,
  onDelete,
  onAddProduct,
  onOpenProduct,
  onDeleteProduct,
  onStockQuantityChange,
  onMoveProduct,
}: CategorySectionProps) {
  const { t, language } = useLanguage()
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `column:${category.id}` })
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: category.id })

  return (
    <motion.div
      ref={(node) => {
        setDroppableRef(node)
        registerRef(node)
      }}
      className={`product-column${isOver ? ' product-column--drag-over' : ''}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <div ref={setSortableRef} className="products-view__item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
        <button type="button" className="sortable-list__handle" aria-label={t('admin.common.dragToReorder')} {...attributes} {...listeners}>
          ⠿
        </button>
        <button type="button" className="products-view__item-open" onClick={onToggle}>
          {category.image && <img className="products-view__item-thumb" src={getThumbnailUrl(category.image)} alt="" />}
          <span className="products-view__item-name">{category.name[language]}</span>
          <span className="product-column__count">{items.length}</span>
          <span className={`product-column__chevron${isExpanded ? ' product-column__chevron--open' : ''}`} aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
        <div className="products-view__item-actions">
          <EditDeleteButtons onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div className="product-column__body">
              <ProductColumnBody
                items={items}
                catalogues={catalogues}
                categoryPrices={categoryPrices}
                onAddProduct={onAddProduct}
                onOpenProduct={onOpenProduct}
                onDeleteProduct={onDeleteProduct}
                onStockQuantityChange={onStockQuantityChange}
                onMoveProduct={onMoveProduct}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

interface NoCategorySectionProps {
  items: Product[]
  isExpanded: boolean
  onToggle: () => void
  catalogues: Catalogue[]
  categoryPrices: CategoryPrices
  registerRef: (node: HTMLElement | null) => void
  onAddProduct: () => void
  onOpenProduct: (product: Product) => void
  onDeleteProduct: (product: Product) => void
  onStockQuantityChange: (product: Product, quantity: number) => void
  onMoveProduct: (updated: Product) => void
}

/** The fixed "No category" section — a catalogue's own products that don't belong to any of its categories (see `Product.catalogueId`). Not a real category: no image/edit/delete/reorder, just a label and the same droppable product list every other section gets. */
function NoCategorySection({ items, isExpanded, onToggle, catalogues, categoryPrices, registerRef, onAddProduct, onOpenProduct, onDeleteProduct, onStockQuantityChange, onMoveProduct }: NoCategorySectionProps) {
  const { t } = useLanguage()
  const { setNodeRef, isOver } = useDroppable({ id: `column:${NO_CATEGORY_COLUMN}` })

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        registerRef(node)
      }}
      className={`product-column${isOver ? ' product-column--drag-over' : ''}`}
    >
      <div className="products-view__item">
        <button type="button" className="products-view__item-open" onClick={onToggle}>
          <span className="products-view__item-name">{t('admin.products.noCategoryColumnLabel')}</span>
          <span className="product-column__count">{items.length}</span>
          <span className={`product-column__chevron${isExpanded ? ' product-column__chevron--open' : ''}`} aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div className="product-column__body">
              <ProductColumnBody
                items={items}
                catalogues={catalogues}
                categoryPrices={categoryPrices}
                onAddProduct={onAddProduct}
                onOpenProduct={onOpenProduct}
                onDeleteProduct={onDeleteProduct}
                onStockQuantityChange={onStockQuantityChange}
                onMoveProduct={onMoveProduct}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
