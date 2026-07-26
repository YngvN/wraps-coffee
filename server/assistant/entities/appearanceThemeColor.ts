import { validateThemeColorDraft } from '../../../src/lib/assistantValidation'
import type { AppearanceSettings, AppearanceTheme } from '../../../src/types/appearanceTheme'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** Matches `ThemeColorListEditor.tsx`'s own default swatch color for a freshly-added custom color, used here only as a fallback when the model doesn't propose one. */
const NEW_CUSTOM_COLOR_HEX = '#dfa93e'

function liveAppearanceSettings(): AppearanceSettings {
  return (store.get('admin.appearanceThemes')?.value as AppearanceSettings | undefined) ?? { themes: [], activeThemeId: '' }
}

/**
 * "Add a color to a theme" is a single `update` action against a theme's own
 * `colors` array — not a full entity of its own, since a color has no
 * meaningful identity outside the theme it lives on. `themeId` names which
 * theme this draft's one new color gets appended to; `colors` always mirrors
 * the theme's live palette plus the one new (not-yet-locked) swatch so the
 * review form can show the full resulting palette.
 */
export interface AssistantThemeColorDraft {
  themeId: string
  themeName: string
  colors: AppearanceTheme['colors']
}

interface ThemeColorFields {
  hex: string | null
}

export const appearanceThemeColorEntity: AssistantEntity<AssistantThemeColorDraft> = {
  key: 'appearanceThemeColor',
  supportedActions: ['update'],
  section: 'store',

  fillFieldsSchema(): AssistantJsonSchema {
    return {
      type: 'object',
      properties: { hex: nullable({ type: 'string', description: 'The new color, as a #rrggbb hex value.' }) },
      required: ['hex'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveAppearanceSettings().themes.filter((theme) => !needle || theme.name.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((theme) => ({ id: theme.id, label: theme.name }))
  },

  async getCurrent(id: string): Promise<AssistantThemeColorDraft | null> {
    const theme = liveAppearanceSettings().themes.find((candidate) => candidate.id === id)
    if (!theme) return null
    return { themeId: theme.id, themeName: theme.name, colors: theme.colors }
  },

  mergeDraft(_action, current, rawFields): AssistantThemeColorDraft {
    const fields = rawFields as ThemeColorFields
    if (!current) throw new Error('appearanceThemeColor requires an existing theme')
    const newColor = { id: crypto.randomUUID(), hex: fields.hex ?? NEW_CUSTOM_COLOR_HEX }
    return { ...current, colors: [...current.colors, newColor] }
  },

  validate(_action, draft: AssistantThemeColorDraft): AssistantValidationIssue[] {
    const newColor = draft.colors[draft.colors.length - 1]
    return validateThemeColorDraft(newColor.hex)
  },

  reviewComponent() {
    return 'existingForm'
  },
}
