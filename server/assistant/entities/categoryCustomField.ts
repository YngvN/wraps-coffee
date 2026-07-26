import { validateCustomFieldDefinitions } from '../../../src/lib/assistantValidation'
import type { Catalogue, Category } from '../../../src/types/category'
import type { CustomFieldDefinition, CustomFieldType } from '../../../src/types/customFields'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveCatalogues(): Catalogue[] {
  return (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
}

/** Scans every catalogue for the category with this id — same "no independent category store" reasoning as `category.ts`'s own `findCategory` (duplicated here rather than shared, matching this registry's existing convention of small self-contained per-entity helpers). */
function findCategory(id: string): { catalogue: Catalogue; category: Category } | null {
  for (const catalogue of liveCatalogues()) {
    const category = catalogue.categories.find((candidate) => candidate.id === id)
    if (category) return { catalogue, category }
  }
  return null
}

/**
 * "Add a custom field to a category" is a single `update` action against a
 * category's own `customFields` array — not a full field entity of its own,
 * since a field has no meaningful identity outside the category it lives on
 * (same posture as `appearanceThemeColor.ts`'s "add a color to a theme").
 * `fields` always mirrors the category's live schema plus the one new field
 * so the review form can show the resulting schema in full.
 */
export interface AssistantCategoryCustomFieldDraft {
  categoryId: string
  categoryLabel: string
  fields: CustomFieldDefinition[]
}

interface CustomFieldProposal {
  label: string | null
  type: CustomFieldType | null
  options: string[] | null
}

export const categoryCustomFieldEntity: AssistantEntity<AssistantCategoryCustomFieldDraft> = {
  key: 'categoryCustomField',
  supportedActions: ['update'],
  section: 'products',

  fillFieldsSchema(_action, context: AssistantFillContext): AssistantJsonSchema {
    const languageName = context.uiLanguage === 'no' ? 'Norwegian' : 'English'
    return {
      type: 'object',
      properties: {
        label: nullable({ type: 'string', description: `The new field's own name, in ${languageName} (e.g. "Bedrooms", "Fuel type").` }),
        type: nullable({ type: 'string', enum: ['text', 'number', 'boolean', 'select'], description: '"select" = the admin picks from a fixed list of choices — only then does "options" apply.' }),
        options: nullable({ type: 'array', items: { type: 'string' }, description: `Only for type "select" — the list of choices, in ${languageName}. Null for every other type.` }),
      },
      required: ['label', 'type', 'options'],
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

  async getCurrent(id: string, context: AssistantFillContext): Promise<AssistantCategoryCustomFieldDraft | null> {
    const found = findCategory(id)
    if (!found) return null
    return { categoryId: found.category.id, categoryLabel: found.category.name[context.uiLanguage], fields: found.category.customFields ?? [] }
  },

  mergeDraft(_action, current, rawFields, context: AssistantFillContext): AssistantCategoryCustomFieldDraft {
    const fields = rawFields as CustomFieldProposal
    if (!current) throw new Error('categoryCustomField requires an existing category')
    const newField: CustomFieldDefinition = {
      id: crypto.randomUUID(),
      label: { no: '', en: '', [context.uiLanguage]: fields.label ?? '' },
      type: fields.type ?? 'text',
      options: fields.type === 'select' ? (fields.options ?? []).map((label) => ({ id: crypto.randomUUID(), label: { no: '', en: '', [context.uiLanguage]: label } })) : undefined,
    }
    return { ...current, fields: [...current.fields, newField] }
  },

  validate(_action, draft: AssistantCategoryCustomFieldDraft): AssistantValidationIssue[] {
    return validateCustomFieldDefinitions(draft.fields)
  },

  reviewComponent() {
    return 'existingForm'
  },
}
