import { validateThemeDraft } from '../../../src/lib/assistantValidation'
import type { AppearanceSettings, AppearanceTheme } from '../../../src/types/appearanceTheme'
import { LOCKED_APPEARANCE_COLORS } from '../../../src/types/appearanceTheme'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantActionName, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveAppearanceSettings(): AppearanceSettings {
  return (store.get('admin.appearanceThemes')?.value as AppearanceSettings | undefined) ?? { themes: [], activeThemeId: '' }
}

interface ThemeFields {
  name: string | null
  bodyFont: string | null
  headingFont: string | null
  subheadingFont: string | null
}

/**
 * Lite CRUD for a theme's own name/fonts, plus a `trigger` action for
 * "make this theme active" (`AppearanceSettingsView.tsx`'s own `setActive`).
 * Deliberately excludes generating a full custom color palette on `create` —
 * a new theme is always seeded with just the 3 locked colors, matching
 * `ThemeEditorForm`'s own default for a blank theme; custom colors are added
 * one at a time afterward via `appearanceThemeColor`.
 */
export const themeEntity: AssistantEntity<AppearanceTheme> = {
  key: 'theme',
  supportedActions: ['create', 'update', 'delete', 'trigger'],
  section: 'store',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action !== 'create' && action !== 'update') {
      return { type: 'object', properties: {}, required: [], additionalProperties: false }
    }
    return {
      type: 'object',
      properties: {
        name: nullable({ type: 'string', description: 'The theme\'s own name (e.g. "Autumn", "Summer sale").' }),
        bodyFont: nullable({ type: 'string', description: 'Google Font family name for body text.' }),
        headingFont: nullable({ type: 'string', description: 'Google Font family name for headings.' }),
        subheadingFont: nullable({ type: 'string', description: 'Google Font family name for subheadings.' }),
      },
      required: ['name', 'bodyFont', 'headingFont', 'subheadingFont'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveAppearanceSettings().themes.filter((theme) => !needle || theme.name.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((theme) => ({ id: theme.id, label: theme.name }))
  },

  async getCurrent(id: string): Promise<AppearanceTheme | null> {
    return liveAppearanceSettings().themes.find((theme) => theme.id === id) ?? null
  },

  mergeDraft(action, current, rawFields): AppearanceTheme {
    if (action !== 'create' && action !== 'update') {
      if (!current) throw new Error(`theme ${action} requires an existing theme`)
      return current
    }
    const fields = rawFields as ThemeFields
    const base: AppearanceTheme =
      current ?? { id: crypto.randomUUID(), name: '', fonts: { body: '', heading: '', subheading: '' }, colors: LOCKED_APPEARANCE_COLORS }
    return {
      ...base,
      name: fields.name ?? base.name,
      fonts: {
        body: fields.bodyFont ?? base.fonts.body,
        heading: fields.headingFont ?? base.fonts.heading,
        subheading: fields.subheadingFont ?? base.fonts.subheading,
      },
    }
  },

  validate(action: AssistantActionName, draft: AppearanceTheme, context: AssistantFillContext): AssistantValidationIssue[] {
    const { themes, activeThemeId } = liveAppearanceSettings()
    void context
    return validateThemeDraft(draft, action as 'create' | 'update' | 'delete' | 'trigger', draft.id === activeThemeId, themes.length)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<AppearanceSettings> {
    return liveAppearanceSettings()
  },

  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      { key: 'isActive', label: 'Currently active', type: 'boolean', description: 'Whether this is the theme currently shown on the screens right now.' },
      { key: 'fonts', label: 'Fonts', type: 'string', description: 'Body/heading/subheading font names, as text.' },
    ]
  },

  async listQueryableRecords(): Promise<LookupQueryRecord[]> {
    const { themes, activeThemeId } = liveAppearanceSettings()
    return themes.map((theme) => ({
      id: theme.id,
      label: theme.name,
      fields: {
        isActive: theme.id === activeThemeId,
        fonts: `Body: ${theme.fonts.body}, Heading: ${theme.fonts.heading}, Subheading: ${theme.fonts.subheading}`,
      },
    }))
  },

  countLabel: { no: { singular: 'tema', plural: 'temaer' }, en: { singular: 'theme', plural: 'themes' } },
}
