import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useLanguage } from '../../../i18n'
import type { ProductCategory } from '../../../types/product'
import './CategoryPriceEditor.scss'

type PriceMode = 'none' | 'flat' | 'dual'

interface CategoryPriceEditorProps {
  category: ProductCategory
}

/** Inline editor for a category's default price (shown in its menu header and used as the fallback for products without their own price), either a flat amount or separate takeaway/eat-in amounts. */
export function CategoryPriceEditor({ category }: CategoryPriceEditorProps) {
  const { t } = useLanguage()
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  const price = categoryPrices[category]
  const mode: PriceMode = price === undefined ? 'none' : typeof price === 'number' ? 'flat' : 'dual'

  const setMode = (nextMode: PriceMode) => {
    const nextPrice =
      nextMode === 'none'
        ? undefined
        : nextMode === 'flat'
          ? typeof price === 'number'
            ? price
            : 0
          : typeof price === 'object'
            ? price
            : { takeaway: 0, eatIn: 0 }
    setCategoryPrices({ ...categoryPrices, [category]: nextPrice })
  }

  const setFlat = (value: number) => setCategoryPrices({ ...categoryPrices, [category]: value })

  const setDual = (patch: Partial<{ takeaway: number; eatIn: number }>) => {
    const current = typeof price === 'object' ? price : { takeaway: 0, eatIn: 0 }
    setCategoryPrices({ ...categoryPrices, [category]: { ...current, ...patch } })
  }

  return (
    <fieldset className="category-price-editor">
      <legend>{t('admin.products.categoryPriceLabel')}</legend>
      <label>
        <input type="radio" name={`category-price-${category}`} checked={mode === 'none'} onChange={() => setMode('none')} />
        {t('admin.products.priceNoneLabel')}
      </label>
      <label>
        <input type="radio" name={`category-price-${category}`} checked={mode === 'flat'} onChange={() => setMode('flat')} />
        <input
          type="number"
          min={0}
          aria-label={t('admin.products.priceLabel')}
          value={typeof price === 'number' ? price : 0}
          disabled={mode !== 'flat'}
          onChange={(event) => setFlat(Number(event.target.value))}
        />
      </label>
      <label>
        <input type="radio" name={`category-price-${category}`} checked={mode === 'dual'} onChange={() => setMode('dual')} />
        <input
          type="number"
          min={0}
          aria-label={t('admin.products.priceTakeawayLabel')}
          value={typeof price === 'object' ? price.takeaway : 0}
          disabled={mode !== 'dual'}
          onChange={(event) => setDual({ takeaway: Number(event.target.value) })}
        />
        {' / '}
        <input
          type="number"
          min={0}
          aria-label={t('admin.products.priceEatInLabel')}
          value={typeof price === 'object' ? price.eatIn : 0}
          disabled={mode !== 'dual'}
          onChange={(event) => setDual({ eatIn: Number(event.target.value) })}
        />
      </label>
    </fieldset>
  )
}
