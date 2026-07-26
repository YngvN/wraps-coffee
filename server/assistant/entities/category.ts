import { validateCategoryDraft } from '../../../src/lib/assistantValidation'
import type { Catalogue, Category } from '../../../src/types/category'
import type { CustomFieldDefinition, CustomFieldType } from '../../../src/types/customFields'
import type { CategoryPrices, Price } from '../../../src/types/product'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** Hard cap on how many custom fields (and, per field, how many `'select'` choices) a single `create` proposal can invent at once — a structural backstop, not just a prompt instruction, against a vague request ("make a catalogue for houses") spiraling into an oversized schema the admin then has to prune by hand. Chosen generously enough to cover real-world specs (a house or car easily has 5-8 meaningful fields) without being unbounded. */
const MAX_CUSTOM_FIELDS_PER_PROPOSAL = 8

/**
 * A category isn't its own top-level array — it always lives nested inside
 * some `Catalogue.categories[]` (confirmed: no independent category store
 * exists) — so every draft/candidate carries `catalogueId` alongside it, and
 * the client-side commit (`AssistantPanel.tsx`) uses that to patch the right
 * parent catalogue, exactly matching `CategoriesView.tsx`'s own
 * `onSaveCatalogue` pattern. `defaultPrice` bundles the category's own
 * default price (a *sibling* synced key, `admin.categoryPrices`, normally
 * edited via `CategoryPriceEditor`) onto the same draft, since it's too
 * small/coupled to justify its own entity.
 */
export interface AssistantCategoryDraft extends Category {
  catalogueId: string
  defaultPrice?: Price
}

function liveCatalogues(): Catalogue[] {
  return (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
}

function liveCategoryPrices(): CategoryPrices {
  return (store.get('admin.categoryPrices')?.value as CategoryPrices | undefined) ?? {}
}

/** Scans every catalogue for the category with this id — categories have no independent store, so "which catalogue" is only ever known by searching (ids are effectively unique, timestamp-generated, same as products). */
function findCategory(id: string): { catalogue: Catalogue; category: Category } | null {
  for (const catalogue of liveCatalogues()) {
    const category = catalogue.categories.find((candidate) => candidate.id === id)
    if (category) return { catalogue, category }
  }
  return null
}

/** The model's own raw proposal for one new custom field — `options` (plain label strings, never a full `CustomFieldOption`) only meaningful when `type === 'select'`; `mergeDraft` assigns real ids and slots each label into the admin's own `uiLanguage` side, exactly like every other bilingual field this entity merges. */
interface CategoryCustomFieldProposal {
  label: string
  type: CustomFieldType
  options: string[] | null
}

interface CategoryFields {
  catalogueId?: string
  name: string | null
  description: string | null
  priceMode: 'none' | 'flat' | 'dual' | null
  flatPrice: number | null
  takeawayPrice: number | null
  eatInPrice: number | null
  /** `create` only (see `fillFieldsSchema`) — never proposed/touched on `update`, which always leaves an existing category's own field schema alone (adding one field at a time is `categoryCustomField.ts`'s own job instead). */
  customFields?: CategoryCustomFieldProposal[] | null
}

export const categoryEntity: AssistantEntity<AssistantCategoryDraft> = {
  key: 'category',
  supportedActions: ['create', 'update', 'delete'],
  section: 'products',
  imageField: 'image',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action, context: AssistantFillContext): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    const languageName = context.uiLanguage === 'no' ? 'Norwegian' : 'English'
    const contentProperties = {
      name: nullable({ type: 'string', description: `The category's name, in ${languageName}.` }),
      description: nullable({ type: 'string', description: `The category's description, in ${languageName}.` }),
      priceMode: nullable({ type: 'string', enum: ['none', 'flat', 'dual'], description: "This category's own default price, falling back to the catalogue's default when unset." }),
      flatPrice: nullable({ type: 'number' }),
      takeawayPrice: nullable({ type: 'number' }),
      eatInPrice: nullable({ type: 'number' }),
    }
    if (action === 'create') {
      const catalogueIds = liveCatalogues().map((catalogue) => catalogue.id)
      return {
        type: 'object',
        properties: {
          catalogueId: { type: 'string', enum: catalogueIds, description: 'Which catalogue this new category belongs to.' },
          ...contentProperties,
          customFields: nullable({
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: `The field's own name, in ${languageName} (e.g. "Bedrooms", "Fuel type").` },
                type: { type: 'string', enum: ['text', 'number', 'boolean', 'select'], description: '"select" = the admin picks from a fixed list of choices — only then does "options" apply.' },
                options: nullable({ type: 'array', items: { type: 'string' }, description: `Only for type "select" — the list of choices, in ${languageName}. Null for every other type.` }),
              },
              required: ['label', 'type', 'options'],
              additionalProperties: false,
            },
            description: `Optional custom fields specific to this category's own kind of product (e.g. "Bedrooms"/"Bathrooms" for a Houses category, "Mileage"/"Fuel type" for a Cars category) — leave null/empty for an ordinary food category. Propose at most ${MAX_CUSTOM_FIELDS_PER_PROPOSAL} of the most relevant fields; the admin can add more by hand afterward.`,
          }),
        },
        required: ['catalogueId', 'name', 'description', 'priceMode', 'flatPrice', 'takeawayPrice', 'eatInPrice', 'customFields'],
        additionalProperties: false,
      }
    }
    // 'update' never moves a category to a different catalogue — the manual UI has no such control either.
    return {
      type: 'object',
      properties: contentProperties,
      required: ['name', 'description', 'priceMode', 'flatPrice', 'takeawayPrice', 'eatInPrice'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const rows: AssistantCandidate[] = []
    for (const catalogue of liveCatalogues()) {
      for (const category of catalogue.categories) {
        if (needle && !category.name.no.toLowerCase().includes(needle) && !category.name.en.toLowerCase().includes(needle)) continue
        rows.push({ id: category.id, label: `${category.name[context.uiLanguage]} (${catalogue.name[context.uiLanguage]})` })
      }
    }
    return rows.slice(0, 30)
  },

  /** A brand-new category has no sane default catalogue to fall back to — worth a clarifying question rather than silently landing in whichever catalogue happens to be first. */
  async clarifiableFields(action, context, fields) {
    if (action !== 'create' || (fields as unknown as CategoryFields).catalogueId != null) return []
    const catalogues = liveCatalogues()
    return [{ field: 'catalogueId', questionKey: 'admin.assistant.clarify.categoryCatalogue', options: catalogues.map((catalogue) => ({ id: catalogue.id, label: catalogue.name[context.uiLanguage] })) }]
  },

  async getCurrent(id: string): Promise<AssistantCategoryDraft | null> {
    const found = findCategory(id)
    if (!found) return null
    return { ...found.category, catalogueId: found.catalogue.id, defaultPrice: liveCategoryPrices()[id] }
  },

  mergeDraft(action, current, rawFields, context: AssistantFillContext): AssistantCategoryDraft {
    const fields = rawFields as CategoryFields
    const base: AssistantCategoryDraft =
      current ?? { id: `category-${Date.now()}`, name: { no: '', en: '' }, catalogueId: fields.catalogueId ?? '' }

    const price: Price | undefined =
      fields.priceMode === 'none'
        ? undefined
        : fields.priceMode === 'flat' && fields.flatPrice !== null
          ? fields.flatPrice
          : fields.priceMode === 'dual' && fields.takeawayPrice !== null && fields.eatInPrice !== null
            ? { takeaway: fields.takeawayPrice, eatIn: fields.eatInPrice }
            : base.defaultPrice

    const customFields: CustomFieldDefinition[] | undefined =
      action === 'create' && fields.customFields
        ? fields.customFields.slice(0, MAX_CUSTOM_FIELDS_PER_PROPOSAL).map((proposal) => ({
            id: crypto.randomUUID(),
            label: { no: '', en: '', [context.uiLanguage]: proposal.label },
            type: proposal.type,
            options:
              proposal.type === 'select'
                ? (proposal.options ?? []).slice(0, MAX_CUSTOM_FIELDS_PER_PROPOSAL).map((label) => ({ id: crypto.randomUUID(), label: { no: '', en: '', [context.uiLanguage]: label } }))
                : undefined,
          }))
        : base.customFields

    return {
      ...base,
      catalogueId: action === 'create' ? (fields.catalogueId ?? base.catalogueId) : base.catalogueId,
      name: { ...base.name, [context.uiLanguage]: fields.name ?? base.name[context.uiLanguage] },
      description: { ...(base.description ?? { no: '', en: '' }), [context.uiLanguage]: fields.description ?? base.description?.[context.uiLanguage] ?? '' },
      defaultPrice: price,
      customFields,
    }
  },

  validate(_action, draft: AssistantCategoryDraft): AssistantValidationIssue[] {
    return validateCategoryDraft(draft, draft.defaultPrice)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },
}
