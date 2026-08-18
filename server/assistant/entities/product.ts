import { validateProductDraft } from '../../../src/lib/assistantValidation'
import type { Catalogue, Category } from '../../../src/types/category'
import type { CustomFieldDefinition } from '../../../src/types/customFields'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type CategoryPrices, type DietaryTag, type Discount, type Price, type Product } from '../../../src/types/product'
import { resolveBilingualField } from '../../../src/utils/bilingual'
import { getEffectivePrice, type EffectivePrice } from '../../../src/utils/price'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveProducts(): Product[] {
  return (store.get('admin.products')?.value as Product[] | undefined) ?? []
}

function liveCatalogues(): Catalogue[] {
  return (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
}

function liveCategories(): Category[] {
  return liveCatalogues().flatMap((catalogue) => catalogue.categories)
}

function liveCategoryPrices(): CategoryPrices {
  return (store.get('admin.categoryPrices')?.value as CategoryPrices | undefined) ?? {}
}

/**
 * A product's real, already-computed current price — reusing the exact same
 * `getEffectivePrice`/`applyDiscount` logic (`src/utils/price.ts`) the actual
 * display uses, rather than leaving price/discount arithmetic to the
 * assistant model itself. Real testing showed even a simple percentage
 * discount gets miscalculated (a model confidently answered "60 kr" for a
 * product whose real price was 149/159 kr with no discount at all) — since
 * this exact computation already exists and is already correct/trusted
 * elsewhere in the app, there's no reason to ask a model to redo it, only to
 * report the result. `undefined` when the product has no price of its own
 * and no category default either (nothing to show).
 */
export function resolveProductEffectivePrice(product: Product): EffectivePrice | undefined {
  const price = product.price ?? (product.category ? liveCategoryPrices()[product.category] : undefined)
  return getEffectivePrice(price, product.discount)
}

/** A single representative number for the lookup query engine's numeric `price`/`originalPrice` fields — a dual (takeaway/eat-in) price has no one "the" number, so the takeaway side is used as the primary figure; `effectivePrice`'s own full `{original, discounted}` breakdown (used by `answerFromRecord`/`buildEntityDataBlock`) is unaffected by this simplification. */
function priceToNumber(price: Price): number {
  return typeof price === 'number' ? price : price.takeaway
}

/** The category (or, for a no-category product, the catalogue) a product's own candidate label names alongside it — several products can easily share the same name (e.g. "Chicken" appearing near-identically across many categories), so this is what actually lets the admin tell candidates apart in a "which one did you mean?" list. Reads only the admin's own chat language's side, not every language at once. */
export function productLocationLabel(product: Product, uiLanguage: 'no' | 'en'): string {
  if (product.category) {
    const category = liveCategories().find((candidate) => candidate.id === product.category)
    if (category) return resolveBilingualField(category.name, uiLanguage)
  } else if (product.catalogueId) {
    const catalogue = liveCatalogues().find((candidate) => candidate.id === product.catalogueId)
    if (catalogue) return resolveBilingualField(catalogue.name, uiLanguage)
  }
  return '?'
}

/**
 * Every valid `location` value the model can pick, each paired with a
 * human-readable description — `enum` alone only ever gives Claude opaque
 * ids with no names attached, so without this spelled out in the schema's
 * own `description` text, the model has no real way to match something the
 * admin actually said (e.g. "Salater") to the right id. `category`/`catalogueId`
 * are deliberately merged into this one prefixed field (`"category:<id>"` /
 * `"catalogue:<id>"`) rather than kept as two separate nullable properties —
 * Claude's own strict tool-use schema validation caps a single tool at 16
 * nullable/union-typed parameters, and this entity's other fields already
 * use every other slot.
 */
function locationOptions(): { values: string[]; description: string } {
  const values: string[] = []
  const descriptions: string[] = []
  for (const catalogue of liveCatalogues()) {
    for (const category of catalogue.categories) {
      values.push(`category:${category.id}`)
      descriptions.push(`"category:${category.id}" = ${category.name.no} / ${category.name.en} (in catalogue "${catalogue.name.no}")`)
    }
    values.push(`catalogue:${catalogue.id}`)
    descriptions.push(`"catalogue:${catalogue.id}" = directly in catalogue "${catalogue.name.no} / ${catalogue.name.en}", no category`)
  }
  return { values, description: descriptions.join('; ') }
}

/** Splits a `location` value (see `locationOptions`) back into the `category`/`catalogueId` pair it represents — `null` (or an unrecognized value) means "not addressed this pass", leaving whichever the draft already had untouched. */
function parseLocation(location: string | null): { category?: string; catalogueId?: string } | null {
  if (!location) return null
  if (location.startsWith('category:')) return { category: location.slice('category:'.length) }
  if (location.startsWith('catalogue:')) return { catalogueId: location.slice('catalogue:'.length) }
  return null
}

/** Maps a category's own custom-field type to the matching JSON Schema primitive `type` keyword (`'text'` isn't itself a valid JSON Schema type name). */
function jsonSchemaTypeFor(field: CustomFieldDefinition): 'string' | 'number' | 'boolean' {
  if (field.type === 'text' || field.type === 'select') return 'string'
  return field.type
}

/** Merges the model's own `customFieldValues` proposal (if the schema even included one — see `fillFieldsSchema`'s `knownDraft` handling) onto the base product's existing values, only ever touching keys the model actually set (non-null) for a field the target category still defines. `categoryId` is `undefined` for a no-category (catalogue-level) product — nothing to merge against, since custom fields only ever live on a `Category`. */
function mergeCustomFieldValues(base: Product, fields: ProductFields, categoryId: string | undefined): Record<string, string | number | boolean> | undefined {
  const customFieldDefs = (categoryId ? liveCategories().find((category) => category.id === categoryId) : undefined)?.customFields ?? []
  const merged = { ...base.customFieldValues }
  if (fields.customFieldValues) {
    for (const field of customFieldDefs) {
      const value = fields.customFieldValues[field.id]
      if (value !== undefined && value !== null) merged[field.id] = value
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** The raw shape Claude proposes — a single-language `name`/`description` (whichever side `context.uiLanguage` is), never both at once, per the plan's language-handling rule. `customFieldValues` is keyed by `CustomFieldDefinition.id`; only present in the schema at all once the target category is actually known (see `fillFieldsSchema`'s own `knownDraft` handling). */
interface ProductFields {
  /** `"category:<id>"` or `"catalogue:<id>"` — see `locationOptions`/`parseLocation`. */
  location: string | null
  name: string | null
  description: string | null
  priceMode: 'inherit' | 'flat' | 'dual' | null
  flatPrice: number | null
  takeawayPrice: number | null
  eatInPrice: number | null
  discountMode: 'none' | 'percentage' | 'amount' | null
  discountPercentage: number | null
  discountAmount: number | null
  allergens: AllergenCode[] | null
  dietaryTags: DietaryTag[] | null
  available: boolean | null
  trackStock: boolean | null
  stockQuantity: number | null
  outOfStock: boolean | null
  customFieldValues?: Record<string, string | number | boolean | null>
}

const ALLERGEN_CODES = ALLERGEN_OPTIONS.map((option) => option.code)

export const productEntity: AssistantEntity<Product> = {
  key: 'product',
  supportedActions: ['create', 'update', 'delete'],
  section: 'products',
  imageField: 'image',
  destructive: (action) => action === 'delete',
  confabulationRiskFields: ['discountMode', 'discountPercentage', 'discountAmount', 'allergens', 'dietaryTags', 'trackStock', 'stockQuantity', 'outOfStock'],

  fillFieldsSchema(_action, context: AssistantFillContext, knownDraft?: Partial<Product>): AssistantJsonSchema {
    const location = locationOptions()
    const properties: Record<string, unknown> = {
      location: nullable({
        type: 'string',
        enum: location.values,
        description: `Which category (or, for no category, which catalogue directly) this product belongs to — match the admin's own wording (a category/catalogue name, or "move to X") to the one real option it refers to; leave null if the message doesn't address this at all. Options: ${location.description}`,
      }),
      name: nullable({ type: 'string', description: `The product's name, in ${context.uiLanguage === 'no' ? 'Norwegian' : 'English'}.` }),
      description: nullable({ type: 'string', description: `The product's description, in ${context.uiLanguage === 'no' ? 'Norwegian' : 'English'}.` }),
      priceMode: nullable({
        type: 'string',
        enum: ['inherit', 'flat', 'dual'],
        description: '"inherit" = use the category default price, "flat" = one fixed price, "dual" = separate takeaway/eat-in prices.',
      }),
      flatPrice: nullable({ type: 'number' }),
      takeawayPrice: nullable({ type: 'number' }),
      eatInPrice: nullable({ type: 'number' }),
      discountMode: nullable({ type: 'string', enum: ['none', 'percentage', 'amount'] }),
      discountPercentage: nullable({ type: 'number' }),
      discountAmount: nullable({ type: 'number' }),
      allergens: nullable({ type: 'array', items: { type: 'string', enum: ALLERGEN_CODES } }),
      dietaryTags: nullable({ type: 'array', items: { type: 'string', enum: DIETARY_TAG_ORDER } }),
      available: nullable({ type: 'boolean' }),
      trackStock: nullable({ type: 'boolean' }),
      stockQuantity: nullable({ type: 'number' }),
      outOfStock: nullable({ type: 'boolean' }),
    }
    const required = [
      'location',
      'name',
      'description',
      'priceMode',
      'flatPrice',
      'takeawayPrice',
      'eatInPrice',
      'discountMode',
      'discountPercentage',
      'discountAmount',
      'allergens',
      'dietaryTags',
      'available',
      'trackStock',
      'stockQuantity',
      'outOfStock',
    ]

    // Which fields are even fillable depends on the target category, which may only be known from the current record (update) or the prior pass's own draft (a create's own follow-up correction) — never on a create's very first pass, since that call is what picks the category in the first place. See `AssistantEntity.fillFieldsSchema`'s own doc comment.
    const knownCategory = knownDraft?.category ? liveCategories().find((category) => category.id === knownDraft.category) : undefined
    const customFields = knownCategory?.customFields ?? []
    if (customFields.length > 0) {
      const customFieldProperties: Record<string, unknown> = {}
      const customFieldRequired: string[] = []
      for (const field of customFields) {
        customFieldRequired.push(field.id)
        customFieldProperties[field.id] =
          field.type === 'select'
            ? nullable({ type: 'string', enum: (field.options ?? []).map((option) => option.id), description: field.label.no || field.label.en })
            : nullable({ type: jsonSchemaTypeFor(field), description: field.label.no || field.label.en })
      }
      properties.customFieldValues = {
        type: 'object',
        properties: customFieldProperties,
        required: customFieldRequired,
        additionalProperties: false,
      }
      required.push('customFieldValues')
    }

    return { type: 'object', properties, required, additionalProperties: false }
  },

  async listCandidates(_action, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const nameLength = (product: Product) => Math.max(product.name.no.length, product.name.en.length)

    let matches: Product[]
    if (!needle) {
      matches = liveProducts()
    } else {
      // Forward direction first (the original, most common case: a short admin-typed phrase
      // contained within a longer real product name) — left completely unaffected by the fallback
      // below, so an ordinary search still behaves exactly as before.
      const forwardMatches = liveProducts().filter((product) => product.name.no.toLowerCase().includes(needle) || product.name.en.toLowerCase().includes(needle))
      if (forwardMatches.length > 0) {
        matches = forwardMatches
      } else {
        // No product name contains the search text as a fragment — it's likely a *longer*,
        // already-disambiguated string instead (e.g. "Kylling Fajitas (Wraps)", the same label
        // `answerLookup`'s batch scan reports for a single match, or resolved from conversation
        // history — see LOOKUP_BATCH_SCHEMA). Check the reverse direction, but keep only the most
        // specific (longest) name match: without this, a short, unrelated product name that
        // happens to be a prefix of a longer one (e.g. "Kylling" inside "Kylling Fajitas (Wraps)")
        // would slip back in as a spurious candidate, reintroducing exactly the ambiguity this
        // disambiguated string was meant to resolve.
        const reverseMatches = liveProducts().filter((product) => needle.includes(product.name.no.toLowerCase()) || needle.includes(product.name.en.toLowerCase()))
        const longestNameLength = reverseMatches.length > 0 ? Math.max(...reverseMatches.map(nameLength)) : 0
        matches = reverseMatches.filter((product) => nameLength(product) === longestNameLength)
      }
    }

    // Two real products can still share the exact same (longest) name across different categories
    // (e.g. a "Kylling Fajitas" wrap and a "Kylling Fajitas" nachos) — if the search text also
    // carries a distinguishing location/category and it actually narrows the match down further,
    // prefer that; otherwise fall back to the name match unchanged.
    const byLocation = matches.length > 1 ? matches.filter((product) => needle.includes(productLocationLabel(product, context.uiLanguage).toLowerCase())) : []
    const resolved = byLocation.length > 0 ? byLocation : matches

    return resolved.slice(0, 30).map((product) => ({ id: product.itemID, label: `${resolveBilingualField(product.name, context.uiLanguage)} - ${productLocationLabel(product, context.uiLanguage)}` }))
  },

  /** A brand-new product has no sane default category (unlike `update`, which always has `current.category` already) — worth a clarifying question rather than silently landing in whichever category happens to be first. Never asked once the model has already set `location` to a catalogue directly — that's a deliberate "no category", not an unresolved one. */
  async clarifiableFields(action, context, fields) {
    const f = fields as unknown as ProductFields
    if (action !== 'create' || f.location != null) return []
    const categories = liveCategories()
    return [
      {
        field: 'location',
        questionKey: 'admin.assistant.clarify.productCategory',
        options: categories.map((category) => ({ id: `category:${category.id}`, label: resolveBilingualField(category.name, context.uiLanguage) })),
      },
    ]
  },

  async getCurrent(id: string): Promise<(Product & { effectivePrice: EffectivePrice | null }) | null> {
    const product = liveProducts().find((candidate) => candidate.itemID === id)
    if (!product) return null
    return { ...product, effectivePrice: resolveProductEffectivePrice(product) ?? null }
  },

  mergeDraft(_action, current, rawFields, context: AssistantFillContext): Product {
    const fields = rawFields as ProductFields
    const parsedLocation = parseLocation(fields.location)
    const base: Product =
      current ?? {
        // `crypto.randomUUID()`, not `Date.now()` — a batch create (see `fillFieldsBatch`) calls
        // this synchronously once per record in one tight loop, and millisecond resolution alone
        // is nowhere near enough to keep several records' ids distinct within that loop.
        itemID: `${parsedLocation?.category ?? parsedLocation?.catalogueId ?? 'uncategorized'}-${crypto.randomUUID()}`,
        name: { no: '', en: '' },
        description: { no: '', en: '' },
        allergens: [],
        dietaryTags: [],
        available: true,
      }

    // Exactly one of `category`/`catalogueId` is ever set — a parsed `location` this pass wins outright and clears the other, matching a real move/reassignment; if the message didn't address this at all, whatever the base draft already had stands.
    const category = parsedLocation ? parsedLocation.category : base.category
    const catalogueId = parsedLocation ? parsedLocation.catalogueId : base.catalogueId

    const price: Price | undefined =
      fields.priceMode === 'inherit'
        ? undefined
        : fields.priceMode === 'flat' && fields.flatPrice !== null
          ? fields.flatPrice
          : fields.priceMode === 'dual' && fields.takeawayPrice !== null && fields.eatInPrice !== null
            ? { takeaway: fields.takeawayPrice, eatIn: fields.eatInPrice }
            : base.price

    const discount: Discount | undefined =
      fields.discountMode === 'none'
        ? undefined
        : fields.discountMode === 'percentage' && fields.discountPercentage !== null
          ? { type: 'percentage', percentage: fields.discountPercentage }
          : fields.discountMode === 'amount' && fields.discountAmount !== null
            ? { type: 'amount', amount: fields.discountAmount }
            : base.discount

    return {
      ...base,
      category,
      catalogueId,
      name: { ...base.name, [context.uiLanguage]: fields.name ?? base.name[context.uiLanguage] },
      description: { ...base.description, [context.uiLanguage]: fields.description ?? base.description[context.uiLanguage] },
      price,
      discount,
      allergens: fields.allergens ?? base.allergens,
      dietaryTags: fields.dietaryTags ?? base.dietaryTags,
      available: fields.available ?? base.available,
      trackStock: fields.trackStock ?? base.trackStock,
      stockQuantity: fields.stockQuantity ?? base.stockQuantity,
      outOfStock: fields.outOfStock ?? base.outOfStock,
      customFieldValues: mergeCustomFieldValues(base, fields, category),
    }
  },

  validate(_action, draft: Product): AssistantValidationIssue[] {
    return validateProductDraft(draft, liveCategories(), liveCatalogues())
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  /** Enriches each product with its resolved category/catalogue name (via the same `productLocationLabel` helper `listCandidates` already uses) — a raw product only carries `category`/`catalogueId` as opaque ids, useless for a lookup question like "what products are in the Drinks category" without this — and its already-computed `effectivePrice` (see `resolveProductEffectivePrice`), so a price/discount question never requires the model to do its own arithmetic. */
  async listAll(context: AssistantFillContext): Promise<(Product & { locationLabel: string; effectivePrice: EffectivePrice | null })[]> {
    return liveProducts().map((product) => ({ ...product, locationLabel: productLocationLabel(product, context.uiLanguage), effectivePrice: resolveProductEffectivePrice(product) ?? null }))
  },

  lookupGuidance:
    'A product is "on sale"/"discounted"/"på tilbud"/"på salg" if and only if its own `discount` field is present (non-null) — never infer this from a product being available, in stock, or simply a real currently-listed item. A product with no `discount` field is not on sale, regardless of anything else about it. For any price/cost question, always read the answer straight from the record\'s own `effectivePrice` field (`original` = price before any discount, `discounted` = the real current price if a discount applies, otherwise `null`) — this is already fully computed; never calculate a discounted price yourself from `price`/`discount`, and never report `price` alone as "the price" once a discount is set.',

  /** See `lookupQuery.ts`'s own module doc comment — `hasDiscount`/`price` are the exact fields behind the on-sale/price bugs real testing found in the old `lookup_batch` classifier; exposing them here lets `answerLookup` skip that classifier entirely for `product` questions. */
  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      {
        key: 'name',
        label: 'Name',
        type: 'string',
        description:
          'The product\'s own name — use "contains" for a keyword that\'s part of the name (e.g. "kylling"/"chicken" in "Kylling Fajitas"), which is what a request for "all chicken products" actually means. Never confuse a word from the product\'s own name with its category/catalogue ("locationLabel" below) — those are frequently different (e.g. a chicken product filed under a "Wraps" category).',
      },
      { key: 'available', label: 'Available', type: 'boolean', description: 'Whether the product is currently marked available for sale.' },
      {
        key: 'hasDiscount',
        label: 'On sale',
        type: 'boolean',
        description: 'True only when the product has an active discount set — the one real signal for "on sale"/"discounted"/"på tilbud".',
        filterPhrase: (value, uiLanguage) => (value === 'true' ? (uiLanguage === 'no' ? 'på tilbud' : 'on sale') : null),
      },
      { key: 'outOfStock', label: 'Out of stock', type: 'boolean' },
      { key: 'trackStock', label: 'Stock tracked', type: 'boolean', description: 'Whether stock quantity is tracked for this product at all.' },
      { key: 'locationLabel', label: 'Category/catalogue', type: 'string', description: 'Which category (or, if none, catalogue) the product belongs to.' },
      { key: 'price', label: 'Current price', type: 'number', description: 'The real price a customer pays right now — already the discounted price if one applies.' },
      { key: 'originalPrice', label: 'Price before discount', type: 'number', description: 'The price before any discount — same as "price" when there is no discount.' },
      { key: 'stockQuantity', label: 'Stock quantity', type: 'number' },
      { key: 'allergens', label: 'Allergens', type: 'string', description: 'Comma-separated list of allergen codes.' },
      { key: 'dietaryTags', label: 'Dietary tags', type: 'string', description: 'Comma-separated list of dietary tags (e.g. vegan, gluten-free).' },
    ]
  },

  async listQueryableRecords(context: AssistantFillContext): Promise<LookupQueryRecord[]> {
    return liveProducts().map((product) => {
      const effective = resolveProductEffectivePrice(product)
      return {
        id: product.itemID,
        label: resolveBilingualField(product.name, context.uiLanguage),
        sublabel: productLocationLabel(product, context.uiLanguage),
        fields: {
          // Both language variants, not just the admin's current UI language — a "contains" filter
          // (e.g. "kylling"/"chicken") must match whichever language the product's own name happens
          // to be stored in, regardless of which language the admin is asking in. The *label* above
          // still shows just one clean name; only this filterable value needs both.
          name: `${product.name.no} ${product.name.en}`.trim(),
          available: product.available,
          hasDiscount: product.discount != null,
          outOfStock: Boolean(product.outOfStock),
          trackStock: Boolean(product.trackStock),
          locationLabel: productLocationLabel(product, context.uiLanguage),
          price: effective ? priceToNumber(effective.discounted ?? effective.original) : null,
          originalPrice: effective ? priceToNumber(effective.original) : null,
          stockQuantity: product.stockQuantity ?? null,
          allergens: (product.allergens ?? []).join(', '),
          dietaryTags: (product.dietaryTags ?? []).join(', '),
        },
      }
    })
  },

  countLabel: { no: { singular: 'produkt', plural: 'produkter' }, en: { singular: 'product', plural: 'products' } },
}
