/**
 * The product editor's form state, and how it's filled from each of the ways the editor opens: an
 * existing product, a new blank one, a barcode draft from the server's catalogue (Open Food Facts),
 * or a quick-add for a barcode nobody knew. Pure, so the prefill rules are testable.
 */
import type { BarcodeEntry } from '../../../types/barcode'
import type { Catalogue } from '../../../types/category'
import type { AllergenCode, Product } from '../../../types/product'

/** Why the editor is open. */
export type EditorSubject = { mode: 'edit'; product: Product } | { mode: 'create' } | { mode: 'draft'; entry: BarcodeEntry } | { mode: 'quickAdd'; barcode: string }

/** Everything the form edits, as strings where the user types. */
export interface ProductDraft {
  itemID?: string
  nameNo: string
  nameEn: string
  /** Takeaway price, or the only price. */
  price: string
  /** Eat-in price; empty means "same as takeaway". */
  eatInPrice: string
  barcode: string
  /** `"category:<id>"` or `"catalogue:<id>"` — see `placementOptions`. */
  placement: string
  readyToServe: boolean
  trackStock: boolean
  stockQuantity: string
  allergens: AllergenCode[]
  image?: string
  imageCredit?: string
  allergensToCheck: string[]
  fromOpenFoodFacts: boolean
}

/** One choice in the placement picker. */
export interface PlacementOption {
  value: string
  label: string
  group: string
}

/** Every place a product can live: each category, and each catalogue directly. */
export function placementOptions(catalogues: Catalogue[], language: 'no' | 'en', directLabel: string): PlacementOption[] {
  return catalogues.flatMap((catalogue) => {
    const group = catalogue.name[language] || catalogue.name.no
    return [
      ...catalogue.categories.map((category) => ({ value: `category:${category.id}`, label: category.name[language] || category.name.no, group })),
      { value: `catalogue:${catalogue.id}`, label: directLabel, group },
    ]
  })
}

/** The editor's initial state for `subject`. `defaultPlacement` is where a brand-new product goes unless staff change it. */
export function initialDraft(subject: EditorSubject, defaultPlacement: string): ProductDraft {
  const blank: ProductDraft = {
    nameNo: '',
    nameEn: '',
    price: '',
    eatInPrice: '',
    barcode: '',
    placement: defaultPlacement,
    readyToServe: false,
    trackStock: false,
    stockQuantity: '',
    allergens: [],
    allergensToCheck: [],
    fromOpenFoodFacts: false,
  }
  if (subject.mode === 'create') return blank
  if (subject.mode === 'quickAdd') return { ...blank, barcode: subject.barcode, readyToServe: true }
  if (subject.mode === 'draft') {
    const { entry } = subject
    // A pack size in the name ("Coca-Cola 330 ml") is what staff need to tell sizes apart at the till.
    const withSize = (name: string) => (entry.quantity && name && !name.includes(entry.quantity) ? `${name} ${entry.quantity}` : name)
    return {
      ...blank,
      nameNo: withSize(entry.name.no),
      nameEn: withSize(entry.name.en),
      barcode: entry.barcode,
      readyToServe: true,
      allergens: entry.allergens,
      image: entry.image,
      imageCredit: entry.imageCredit,
      allergensToCheck: entry.allergensToCheck,
      fromOpenFoodFacts: entry.source === 'openFoodFacts',
    }
  }
  const { product } = subject
  const price = product.price
  return {
    ...blank,
    itemID: product.itemID,
    nameNo: product.name.no,
    nameEn: product.name.en,
    price: price === undefined ? '' : String(typeof price === 'number' ? price : price.takeaway),
    eatInPrice: price !== undefined && typeof price !== 'number' ? String(price.eatIn) : '',
    barcode: product.barcode ?? '',
    placement: product.category ? `category:${product.category}` : `catalogue:${product.catalogueId ?? ''}`,
    readyToServe: product.readyToServe ?? false,
    trackStock: product.trackStock ?? false,
    stockQuantity: product.stockQuantity === undefined ? '' : String(product.stockQuantity),
    allergens: product.allergens,
    image: product.image,
  }
}

/** Parses a typed amount ("39", "39,50") into a number, or `undefined` when blank or not a number. */
function amount(text: string): number | undefined {
  const value = Number(text.replace(',', '.').trim())
  return text.trim() && Number.isFinite(value) ? value : undefined
}

/** The request body for `POST /register/products`. A price is required for anything new: nothing is sold without one. */
export function draftToInput(draft: ProductDraft): { ok: true; input: Record<string, unknown> } | { ok: false; reason: 'noPrice' } {
  const takeaway = amount(draft.price)
  const eatIn = amount(draft.eatInPrice)
  if (takeaway === undefined && !draft.itemID) return { ok: false, reason: 'noPrice' }
  const [kind, id] = draft.placement.split(':')
  return {
    ok: true,
    input: {
      itemID: draft.itemID,
      name: { no: draft.nameNo, en: draft.nameEn },
      price: takeaway === undefined ? undefined : eatIn === undefined || eatIn === takeaway ? takeaway : { takeaway, eatIn },
      barcode: draft.barcode.trim() || undefined,
      image: draft.image,
      readyToServe: draft.readyToServe,
      trackStock: draft.trackStock,
      stockQuantity: draft.trackStock ? (amount(draft.stockQuantity) ?? 0) : undefined,
      allergens: draft.allergens,
      category: kind === 'category' ? id : undefined,
      catalogueId: kind === 'catalogue' ? id : undefined,
    },
  }
}
