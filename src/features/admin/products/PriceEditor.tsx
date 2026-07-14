import { useLanguage } from '../../../i18n'
import type { Price } from '../../../types/product'
import './CategoryPriceEditor.scss'

type PriceMode = 'none' | 'flat' | 'dual'

interface PriceEditorProps {
  price: Price | undefined
  onChange: (price: Price | undefined) => void
  /** i18n key for this editor's own `<legend>` — lets the same control read e.g. "Category default price" or "Catalogue default price" depending on where it's used. */
  legendKey: string
  /** Distinguishes each radio group's own `name` attribute when more than one price editor could conceivably render on the same page at once. */
  fieldId: string
}

/** Controlled price editor — either no price, a flat amount, or separate takeaway/eat-in amounts. Shared by `CategoryPriceEditor` (a category's own default) and `CatalogueForm` (a catalogue's own default, the fallback beneath it). */
export function PriceEditor({ price, onChange, legendKey, fieldId }: PriceEditorProps) {
  const { t } = useLanguage()
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
    onChange(nextPrice)
  }

  const setDual = (patch: Partial<{ takeaway: number; eatIn: number }>) => {
    const current = typeof price === 'object' ? price : { takeaway: 0, eatIn: 0 }
    onChange({ ...current, ...patch })
  }

  return (
    <fieldset className="category-price-editor">
      <legend>{t(legendKey)}</legend>
      <label>
        <input type="radio" name={`price-${fieldId}`} checked={mode === 'none'} onChange={() => setMode('none')} />
        {t('admin.products.priceNoneLabel')}
      </label>
      <label>
        <input type="radio" name={`price-${fieldId}`} checked={mode === 'flat'} onChange={() => setMode('flat')} />
        <input
          type="number"
          min={0}
          aria-label={t('admin.products.priceLabel')}
          value={typeof price === 'number' ? price : 0}
          disabled={mode !== 'flat'}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <label>
        <input type="radio" name={`price-${fieldId}`} checked={mode === 'dual'} onChange={() => setMode('dual')} />
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
