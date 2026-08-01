import { validateCatalogueDraft } from '../../../src/lib/assistantValidation'
import type { Catalogue } from '../../../src/types/category'
import type { Price, Product } from '../../../src/types/product'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** Same "flatten to a display string for the query engine's `reportField`" reasoning as `category.ts`'s own `formatPrice`. */
function formatPrice(price: Price | undefined): string {
  if (price === undefined) return ''
  return typeof price === 'number' ? `${price} kr` : `Takeaway: ${price.takeaway} kr / Eat-in: ${price.eatIn} kr`
}

function liveCatalogues(): Catalogue[] {
  return (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
}

function liveProducts(): Product[] {
  return (store.get('admin.products')?.value as Product[] | undefined) ?? []
}

interface CatalogueFields {
  name: string | null
  priceMode: 'none' | 'flat' | null
  flatPrice: number | null
}

export const catalogueEntity: AssistantEntity<Catalogue> = {
  key: 'catalogue',
  supportedActions: ['create', 'update', 'delete'],
  section: 'products',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action, context: AssistantFillContext): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    const languageName = context.uiLanguage === 'no' ? 'Norwegian' : 'English'
    return {
      type: 'object',
      properties: {
        name: nullable({ type: 'string', description: `This catalogue's own name (e.g. "Food menu", "Merch", "Vehicles"), in ${languageName}.` }),
        priceMode: nullable({ type: 'string', enum: ['none', 'flat'], description: 'An optional flat fallback price for every product in this catalogue that has no price of its own.' }),
        flatPrice: nullable({ type: 'number' }),
      },
      required: ['name', 'priceMode', 'flatPrice'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveCatalogues().filter((catalogue) => !needle || catalogue.name.no.toLowerCase().includes(needle) || catalogue.name.en.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((catalogue) => ({ id: catalogue.id, label: catalogue.name[context.uiLanguage] }))
  },

  async getCurrent(id: string): Promise<Catalogue | null> {
    return liveCatalogues().find((catalogue) => catalogue.id === id) ?? null
  },

  mergeDraft(_action, current, rawFields, context: AssistantFillContext): Catalogue {
    const fields = rawFields as CatalogueFields
    const base: Catalogue = current ?? { id: `catalogue-${Date.now()}`, name: { no: '', en: '' }, categories: [] }
    const price = fields.priceMode === 'none' ? undefined : fields.priceMode === 'flat' && fields.flatPrice !== null ? fields.flatPrice : base.price
    return {
      ...base,
      name: { ...base.name, [context.uiLanguage]: fields.name ?? base.name[context.uiLanguage] },
      price,
    }
  },

  validate(action, draft: Catalogue): AssistantValidationIssue[] {
    // Counts both a category-linked product (the category itself disappears along with the catalogue) and one living directly in this catalogue with no category at all (see `Product.catalogueId`) — both are orphaned the same way.
    const dependentProductCount =
      action === 'delete'
        ? liveProducts().filter((product) => draft.categories.some((category) => category.id === product.category) || product.catalogueId === draft.id).length
        : 0
    return validateCatalogueDraft(draft, dependentProductCount)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<Catalogue[]> {
    return liveCatalogues()
  },

  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      { key: 'hasPrice', label: 'Has a default price', type: 'boolean' },
      { key: 'categoryCount', label: 'Category count', type: 'number' },
      { key: 'price', label: 'Default price', type: 'string', description: 'This catalogue\'s own default price, as text (e.g. "45 kr") — empty if none is set.' },
    ]
  },

  async listQueryableRecords(context: AssistantFillContext): Promise<LookupQueryRecord[]> {
    return liveCatalogues().map((catalogue) => ({
      id: catalogue.id,
      label: catalogue.name[context.uiLanguage],
      fields: {
        hasPrice: catalogue.price !== undefined,
        categoryCount: catalogue.categories.length,
        price: formatPrice(catalogue.price),
      },
    }))
  },
}
