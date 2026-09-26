import { useMemo, useState } from 'react'
import { EditIcon, PlusIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { unitPriceFor, type PricingCatalogue, type Serving } from '../../../lib/registerPricing'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { computeProductOrderRanks } from '../../../utils/productCatalogue'
import { isProductOutOfStock } from '../../../utils/productStock'
import { groupByCategory, matchesProductSearch, sortProducts, type ProductSort } from './productList'
import { RegisterProductToolbar } from './RegisterProductToolbar'

interface RegisterProductGridProps {
  catalogue: PricingCatalogue
  /** The catalogues this pane offers (all of them when the pane doesn't narrow it). */
  catalogues: Catalogue[]
  serving: Serving
  /** A manager is signed in: each tile gets an edit button, and a "New product" tile appears. */
  canEdit: boolean
  onAdd: (product: Product) => void
  onEdit: (product: Product) => void
  onCreate: () => void
  /** Units sold per product lately, for the "most popular" sort (see `productPopularity`). */
  popularity: Map<string, number>
  sort: ProductSort
  onSortChange: (sort: ProductSort) => void
  /** A barcode scanned while the search box had focus. */
  onScan: (code: string) => void
}

/** `'none'` is the chip for products placed directly in a catalogue, outside any category. */
type CategoryChoice = 'all' | 'none' | string

/**
 * The register's product tiles: a search box and sort order (see `RegisterProductToolbar`), a tab per
 * catalogue, category chips, then one big tile per available product with its photo, name and current
 * price. While searching, the tiles show the matches from every catalogue instead of the tab and chip.
 * Whenever the tiles mix categories (searching, or the "All" chip) they show which category each one
 * is from: in menu order under a small header per category, in the other orders on each tile. Sold-out products stay visible but dimmed (staff
 * can still sell one after confirming, since the stock count can drift from the shelf). While the
 * a manager is signed in each tile gets an edit button and a "New product" tile appears.
 */
export function RegisterProductGrid({ catalogue, catalogues, serving, canEdit, onAdd, onEdit, onCreate, popularity, sort, onSortChange, onScan }: RegisterProductGridProps) {
  const { t, language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'no'
  const [catalogueId, setCatalogueId] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryChoice>('all')
  const [query, setQuery] = useState('')
  const active = catalogues.find((candidate) => candidate.id === catalogueId) ?? catalogues[0]
  const searching = query.trim() !== ''
  const ranks = useMemo(() => computeProductOrderRanks(catalogue.products, catalogue.catalogues), [catalogue.products, catalogue.catalogues])

  const products = useMemo(() => {
    // While searching, every catalogue this pane sells from is searched, whatever tab or chip is picked.
    const shown = searching ? catalogues : active ? [active] : []
    const categoryIds = new Set(shown.flatMap((option) => option.categories.map((candidate) => candidate.id)))
    const catalogueIds = new Set(shown.map((option) => option.id))
    const list = catalogue.products.filter((product) => {
      if (!product.available) return false
      const inCatalogue = product.category ? categoryIds.has(product.category) : Boolean(product.catalogueId && catalogueIds.has(product.catalogueId))
      if (!inCatalogue) return false
      if (searching) return matchesProductSearch(product, query)
      if (category === 'all') return true
      return category === 'none' ? !product.category : product.category === category
    })
    return sortProducts(list, sort, ranks, popularity, lang)
  }, [catalogue.products, catalogues, active, category, searching, query, sort, ranks, popularity, lang])

  /** Where a product lives ("Wraps", or the catalogue for a product outside any category) — shown when the tiles mix categories (search results and "All"), since names repeat across them. */
  const placeOf = (product: Product) => {
    for (const option of catalogues) {
      const found = option.categories.find((candidate) => candidate.id === product.category)
      if (found) return found.name[lang] || found.name.no
    }
    const owner = catalogues.find((option) => option.id === product.catalogueId)
    return owner ? owner.name[lang] || owner.name.no : ''
  }

  const mixed = searching || category === 'all'
  // In menu order a mixed list is split under a small header per category; in other orders the
  // categories interleave, so each tile names its own instead.
  const grouped = mixed && sort === 'menu'
  const showPlace = mixed && !grouped
  const groups = grouped ? groupByCategory(products) : [{ key: 'all', products }]
  const hasUncategorised = Boolean(active && catalogue.products.some((product) => product.available && !product.category && product.catalogueId === active.id))

  const chip = (value: CategoryChoice, label: string) => (
    <button key={value} type="button" className={category === value ? 'register__chip register__chip--active' : 'register__chip'} onClick={() => setCategory(value)}>
      {label}
    </button>
  )

  return (
    <section className="register__products" aria-label={t('screenDisplay.register.products')}>
      <RegisterProductToolbar query={query} onQueryChange={setQuery} sort={sort} onSortChange={onSortChange} onScan={onScan} />
      {searching && <p className="register__search-count">{t('screenDisplay.register.searchResults', { count: products.length, query: query.trim() })}</p>}
      {!searching && catalogues.length > 1 && (
        <div className="register__tabs" role="tablist">
          {catalogues.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={option.id === active?.id}
              className={option.id === active?.id ? 'register__tab register__tab--active' : 'register__tab'}
              onClick={() => {
                setCatalogueId(option.id)
                setCategory('all')
              }}
            >
              {option.name[lang] || option.name.no}
            </button>
          ))}
        </div>
      )}
      {!searching && active && (
        <div className="register__chips">
          {chip('all', t('screenDisplay.register.allCategories'))}
          {active.categories.map((option) => chip(option.id, option.name[lang] || option.name.no))}
          {hasUncategorised && chip('none', t('screenDisplay.register.otherProducts'))}
        </div>
      )}
      <div className="register__tiles">
        {groups.map((group) => [
          grouped && group.products[0] && (
            <h3 key={`header-${group.key}`} className="register__group-header">
              {placeOf(group.products[0])}
            </h3>
          ),
          ...group.products.map((product) => {
            const price = unitPriceFor(product, catalogue, serving)
            const soldOut = isProductOutOfStock(product)
            return (
              <div key={product.itemID} className={soldOut ? 'register__tile register__tile--sold-out' : 'register__tile'}>
                <button type="button" className="register__tile-main" onClick={() => onAdd(product)} disabled={price === undefined}>
                  {product.image ? (
                    <img className="register__tile-image" src={getThumbnailUrl(product.image)} alt="" loading="lazy" />
                  ) : (
                    <span className="register__tile-image register__tile-image--empty" />
                  )}
                  <span className="register__tile-name">{product.name[lang] || product.name.no}</span>
                  {showPlace && <span className="register__tile-place">{placeOf(product)}</span>}
                  <span className="register__tile-price">
                    {soldOut ? t('screenDisplay.register.soldOut') : price === undefined ? t('screenDisplay.register.noPrice') : t('menu.price', { price })}
                  </span>
                </button>
                {canEdit && (
                  <button type="button" className="register__tile-edit" onClick={() => onEdit(product)} aria-label={t('screenDisplay.register.editProduct')}>
                    <EditIcon />
                  </button>
                )}
              </div>
            )
          }),
        ])}
        {canEdit && (
          <button type="button" className="register__tile register__tile--new" onClick={onCreate}>
            <PlusIcon />
            <span>{t('screenDisplay.register.newProduct')}</span>
          </button>
        )}
        {products.length === 0 && !canEdit && <p className="orders-board__muted">{t(searching ? 'screenDisplay.register.searchEmpty' : 'screenDisplay.register.noProducts')}</p>}
      </div>
    </section>
  )
}
