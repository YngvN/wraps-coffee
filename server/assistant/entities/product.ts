import { validateProductDraft } from '../../../src/lib/assistantValidation'
import type { Catalogue, Category } from '../../../src/types/category'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Discount, type Price, type Product } from '../../../src/types/product'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantSession, type AssistantValidationIssue } from '../types'

function liveProducts(): Product[] {
  return (store.get('admin.products')?.value as Product[] | undefined) ?? []
}

function liveCategories(): Category[] {
  const catalogues = (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
  return catalogues.flatMap((catalogue) => catalogue.categories)
}

/** The raw shape Claude proposes — a single-language `name`/`description` (whichever side `context.uiLanguage` is), never both at once, per the plan's language-handling rule. */
interface ProductFields {
  category: string | null
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
}

const ALLERGEN_CODES = ALLERGEN_OPTIONS.map((option) => option.code)

export const productEntity: AssistantEntity<Product> = {
  key: 'product',
  supportedActions: ['create', 'update', 'delete'],
  section: 'products',
  imageField: 'image',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(_action, context: AssistantFillContext): AssistantJsonSchema {
    const categoryIds = liveCategories().map((category) => category.id)
    return {
      type: 'object',
      properties: {
        category: nullable({ type: 'string', enum: categoryIds, description: 'The category this product belongs to.' }),
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
      },
      required: [
        'category',
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
      ],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _session: AssistantSession, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveProducts().filter((product) => !needle || product.name.no.toLowerCase().includes(needle) || product.name.en.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((product) => ({ id: product.itemID, label: `${product.name.no} / ${product.name.en}` }))
  },

  async getCurrent(id: string): Promise<Product | null> {
    return liveProducts().find((product) => product.itemID === id) ?? null
  },

  mergeDraft(_action, current, rawFields, context: AssistantFillContext): Product {
    const fields = rawFields as ProductFields
    const base: Product =
      current ?? {
        itemID: `${fields.category ?? 'uncategorized'}-${Date.now()}`,
        category: '',
        name: { no: '', en: '' },
        description: { no: '', en: '' },
        allergens: [],
        dietaryTags: [],
        available: true,
      }

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
      category: fields.category ?? base.category,
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
    }
  },

  validate(_action, draft: Product): AssistantValidationIssue[] {
    return validateProductDraft(draft, liveCategories())
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },
}
