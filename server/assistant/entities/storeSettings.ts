import { validateStoreSettingsDraft } from '../../../src/lib/assistantValidation'
import type { StoreSettings } from '../../../src/types/storeSettings'
import * as store from '../../store'
import { nullable, type AssistantEntity, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveStoreSettings(): StoreSettings {
  return (store.get('admin.storeSettings')?.value as StoreSettings | undefined) ?? { name: '', logos: [] }
}

interface StoreSettingsFields {
  name: string | null
  slogan: string | null
  newLogoUrl: string | null
}

/**
 * A singleton — there's exactly one `StoreSettings` record, so this entity
 * has no `listCandidates`/`getCurrent`-by-search; the client always calls
 * `fillFields` with the fixed `itemID: 'singleton'` (see `useAssistantFlow.ts`),
 * which `getCurrent` below ignores in favor of just reading the live value.
 * `favicon` is the vision/asset `imageField` (same attach-image mechanism as
 * Product/Event); `logos` is append-only via chat (a new URL is added, not
 * regenerated), same reasoning as theme colors.
 */
export const storeSettingsEntity: AssistantEntity<StoreSettings> = {
  key: 'storeSettings',
  supportedActions: ['update'],
  section: 'store',
  imageField: 'favicon',

  fillFieldsSchema(): AssistantJsonSchema {
    return {
      type: 'object',
      properties: {
        name: nullable({ type: 'string', description: "The store's display name." }),
        slogan: nullable({ type: 'string', description: "The store's short slogan/tagline." }),
        newLogoUrl: nullable({ type: 'string', description: 'A new logo image URL to add to the store\'s logo list, only if the message names one explicitly.' }),
      },
      required: ['name', 'slogan', 'newLogoUrl'],
      additionalProperties: false,
    }
  },

  async getCurrent(): Promise<StoreSettings | null> {
    return liveStoreSettings()
  },

  mergeDraft(_action, current, rawFields): StoreSettings {
    const fields = rawFields as StoreSettingsFields
    const base = current ?? liveStoreSettings()
    return {
      ...base,
      name: fields.name ?? base.name,
      slogan: fields.slogan ?? base.slogan,
      logos: fields.newLogoUrl ? [...base.logos, fields.newLogoUrl] : base.logos,
    }
  },

  validate(_action, draft: StoreSettings): AssistantValidationIssue[] {
    return validateStoreSettingsDraft(draft.name)
  },

  reviewComponent() {
    return 'existingForm'
  },

  async listAll(): Promise<StoreSettings> {
    return liveStoreSettings()
  },
}
