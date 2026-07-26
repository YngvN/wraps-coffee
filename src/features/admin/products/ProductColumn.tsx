import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PlusIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { CategoryPrices, Product } from '../../../types/product'
import { defaultPriceForProduct } from '../../../utils/productCatalogue'
import { ProductRow } from './ProductRow'
import './ProductColumn.scss'
import './SortableList.scss'

/** The fixed pseudo-column id for a catalogue's own no-category products — never a real `Category.id`, so it can never collide with one. */
export const NO_CATEGORY_COLUMN = '__no_category__'

interface ProductColumnBodyProps {
  items: Product[]
  catalogues: Catalogue[]
  categoryPrices: CategoryPrices
  onAddProduct: () => void
  onOpenProduct: (product: Product) => void
  onDeleteProduct: (product: Product) => void
  onStockQuantityChange: (product: Product, quantity: number) => void
  onMoveProduct: (updated: Product) => void
}

/**
 * The droppable/sortable product list shared by every column of the
 * products board (`CategoriesView.tsx`'s own per-category sections, and the
 * fixed "No category" one) — deliberately without its own `useDroppable` or
 * expand/collapse chrome of its own, since each caller has a different own
 * header to attach the droppable area to (a real category's own management
 * row vs. the no-category section's plain label row) and controls expansion
 * itself; this is just the part both share.
 */
export function ProductColumnBody({ items, catalogues, categoryPrices, onAddProduct, onOpenProduct, onDeleteProduct, onStockQuantityChange, onMoveProduct }: ProductColumnBodyProps) {
  const { t } = useLanguage()
  return (
    <>
      <SortableContext items={items.map((product) => product.itemID)} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          <p className="products-view__empty">{t('admin.products.noProducts')}</p>
        ) : (
          <ul className="product-column__list">
            {items.map((product) => (
              <SortableProductRow
                key={product.itemID}
                product={product}
                defaultPrice={defaultPriceForProduct(product, catalogues, categoryPrices)}
                catalogues={catalogues}
                onOpen={() => onOpenProduct(product)}
                onDelete={() => onDeleteProduct(product)}
                onStockQuantityChange={(quantity) => onStockQuantityChange(product, quantity)}
                onMove={onMoveProduct}
              />
            ))}
          </ul>
        )}
      </SortableContext>
      <button type="button" className="products-view__add-row" onClick={onAddProduct}>
        <PlusIcon />
        {t('admin.products.addProduct')}
      </button>
    </>
  )
}

interface SortableProductRowProps {
  product: Product
  defaultPrice: ReturnType<typeof defaultPriceForProduct>
  catalogues: Catalogue[]
  onOpen: () => void
  onDelete: () => void
  onStockQuantityChange: (quantity: number) => void
  onMove: (updated: Product) => void
}

/** One draggable/sortable product card — same outer-transform/inner-content split `CategoriesView.tsx`'s own category rows use (reusing the same `.sortable-list__*` CSS classes), so it looks and behaves identically while being part of a cross-column drag instead of a same-list reorder. */
function SortableProductRow({ product, defaultPrice, catalogues, onOpen, onDelete, onStockQuantityChange, onMove }: SortableProductRowProps) {
  const { t } = useLanguage()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.itemID })

  return (
    <li ref={setNodeRef} className="sortable-list__item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <div className="sortable-list__item-inner">
        <button type="button" className="sortable-list__handle" aria-label={t('admin.common.dragToReorder')} {...attributes} {...listeners}>
          ⠿
        </button>
        <div className="sortable-list__content">
          <ProductRow product={product} defaultPrice={defaultPrice} catalogues={catalogues} onOpen={onOpen} onDelete={onDelete} onStockQuantityChange={onStockQuantityChange} onMove={onMove} />
        </div>
      </div>
    </li>
  )
}
