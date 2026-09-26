/**
 * Adding or editing one product from a Register, by a signed-in manager. Only a narrow set of fields can be
 * changed here — what staff need at the counter (name, price, barcode, photo, placement, allergens,
 * stock) — while everything else about an existing product (description, dietary tags, custom
 * fields, discount) is kept exactly as it was. Pure: the route reads `admin.products`, calls this,
 * and writes the result back without any `await` in between.
 */
import type { Catalogue } from '../../src/types/category'
import { ALLERGEN_OPTIONS, type AllergenCode, type Price, type Product, type VatCategory } from '../../src/types/product'
import { VAT_CATEGORIES } from '../../src/lib/vat'
import type { BilingualText } from '../../src/types/bilingual'
import { isValidGtin } from '../../src/lib/gtin'

/** The fields a register may set. `itemID` absent means "create". The register form always sends the whole set, so an absent `barcode`, `category` or `catalogueId` clears it; other absent fields keep their current value. */
export interface RegisterProductInput {
  itemID?: string
  name: BilingualText
  price?: Price
  barcode?: string
  image?: string
  available?: boolean
  readyToServe?: boolean
  /** How the product is taxed; `food` is stored as absent, like everywhere else. */
  vatCategory?: VatCategory
  trackStock?: boolean
  stockQuantity?: number
  allergens?: AllergenCode[]
  /** Exactly one of `category`/`catalogueId`, as on `Product`. */
  category?: string
  catalogueId?: string
}

/** Why an edit was refused. */
export type RegisterProductError = 'unknownProduct' | 'noName' | 'badPrice' | 'badBarcode' | 'duplicateBarcode' | 'badPlacement' | 'badAllergens' | 'badStock' | 'badVatCategory'

const ALLERGEN_CODES = new Set<string>(ALLERGEN_OPTIONS.map((option) => option.code))
const MAX_NAME_LENGTH = 80

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000
}

function isPrice(value: unknown): value is Price {
  if (isAmount(value)) return true
  const dual = value as { takeaway?: unknown; eatIn?: unknown } | null
  return typeof dual === 'object' && dual !== null && isAmount(dual.takeaway) && isAmount(dual.eatIn)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : ''
}

/** Whether exactly one of `category`/`catalogueId` is set and it exists. */
function placementExists(input: RegisterProductInput, catalogues: Catalogue[]): boolean {
  if (Boolean(input.category) === Boolean(input.catalogueId)) return false
  if (input.category) return catalogues.some((catalogue) => catalogue.categories.some((category) => category.id === input.category))
  return catalogues.some((catalogue) => catalogue.id === input.catalogueId)
}

/** Validates `input` and returns the full product list with the one product created or updated. */
export function upsertRegisterProduct(
  products: Product[],
  catalogues: Catalogue[],
  input: RegisterProductInput,
  newId: () => string,
): { ok: true; products: Product[]; product: Product } | { ok: false; reason: RegisterProductError } {
  const existing = input.itemID ? products.find((product) => product.itemID === input.itemID) : undefined
  if (input.itemID && !existing) return { ok: false, reason: 'unknownProduct' }

  const name = { no: cleanText(input.name?.no), en: cleanText(input.name?.en) }
  if (!name.no && !name.en) return { ok: false, reason: 'noName' }
  if (input.price !== undefined && !isPrice(input.price)) return { ok: false, reason: 'badPrice' }
  const barcode = input.barcode?.trim() || undefined
  if (barcode && !isValidGtin(barcode)) return { ok: false, reason: 'badBarcode' }
  if (barcode && products.some((product) => product.barcode === barcode && product.itemID !== existing?.itemID)) return { ok: false, reason: 'duplicateBarcode' }
  if (!placementExists(input, catalogues)) return { ok: false, reason: 'badPlacement' }
  if (input.allergens && !input.allergens.every((code) => ALLERGEN_CODES.has(code))) return { ok: false, reason: 'badAllergens' }
  if (input.stockQuantity !== undefined && (!Number.isInteger(input.stockQuantity) || input.stockQuantity < 0)) return { ok: false, reason: 'badStock' }
  if (input.vatCategory !== undefined && !VAT_CATEGORIES.includes(input.vatCategory)) return { ok: false, reason: 'badVatCategory' }

  const base: Product = existing ?? { itemID: newId(), name, description: { no: '', en: '' }, allergens: [], dietaryTags: [], available: true }
  const product: Product = {
    ...base,
    name,
    price: input.price ?? base.price,
    barcode,
    image: input.image ?? base.image,
    available: input.available ?? base.available,
    readyToServe: input.readyToServe ?? base.readyToServe,
    vatCategory: input.vatCategory === undefined ? base.vatCategory : input.vatCategory === 'food' ? undefined : input.vatCategory,
    trackStock: input.trackStock ?? base.trackStock,
    stockQuantity: input.stockQuantity ?? base.stockQuantity,
    allergens: input.allergens ? [...new Set(input.allergens)] : base.allergens,
    category: input.category,
    catalogueId: input.catalogueId,
  }
  // Leave optional fields absent rather than stored as `undefined`, like every other product.
  for (const key of Object.keys(product) as (keyof Product)[]) if (product[key] === undefined) delete product[key]

  const next = existing ? products.map((candidate) => (candidate.itemID === existing.itemID ? product : candidate)) : [...products, product]
  return { ok: true, products: next, product }
}
