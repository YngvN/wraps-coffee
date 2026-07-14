import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { PriceEditor } from './PriceEditor'

interface CategoryPriceEditorProps {
  categoryId: string
}

/** Inline editor for a category's default price (shown in its menu header and used as the fallback for products without their own price, itself falling back to the catalogue's own default — see `Catalogue.price`), either a flat amount or separate takeaway/eat-in amounts. */
export function CategoryPriceEditor({ categoryId }: CategoryPriceEditorProps) {
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  return (
    <PriceEditor
      price={categoryPrices[categoryId]}
      onChange={(price) => setCategoryPrices({ ...categoryPrices, [categoryId]: price })}
      legendKey="admin.products.categoryPriceLabel"
      fieldId={`category-${categoryId}`}
    />
  )
}
