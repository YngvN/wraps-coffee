import { availableLanguages, type LanguageCode } from '../../../src/i18n/translate'
import { DEFAULT_SIDEBAR_SETTINGS, type ToggleableSidebarItem } from '../../../src/types/sidebarSettings'
import * as store from '../../store'
import { nullable, type AssistantEntity, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** Duplicated from `src/hooks/useClockFormatPreference.ts` rather than imported — that file (like every `useX` hook) pulls in `useLocalStorage.ts`, which references DOM globals (`window`, `StorageEvent`) the server's own tsconfig has no `dom` lib for, even via a type-only import (TS still needs to resolve the whole module graph). Keep this in sync if the hook's own type ever changes. */
type ClockFormat = '24h' | '12h'
/** Duplicated from `src/hooks/useDateFormatPreference.ts` — see `ClockFormat`'s own comment above for why. */
type DateFormat = 'dmy' | 'mdy'

const TOGGLEABLE_SIDEBAR_ITEMS: ToggleableSidebarItem[] = ['messages', 'products', 'events', 'orders', 'screens', 'media', 'messageboard']
const LANGUAGE_CODES = availableLanguages.map((language) => language.code)

/**
 * Bundles four independently-synced-keyed device/store preferences
 * (`admin.clockFormat`/`admin.dateFormat`/`admin.paneLanguage`/`admin.sidebarSettings`)
 * into one draft — despite living behind separate `useX` hooks client-side,
 * all four are real entries in `SYNCED_KEYS` (`src/types/sync.ts`), so this
 * needs no special contract beyond the ordinary `store.get` read every other
 * synced-key entity already uses. `section: null` — Settings is a
 * personal/device preference, not a permissioned `DashboardSection` (see that
 * type's own doc comment) — same posture as `user`. Deliberately excludes
 * screen-address mode / window-launch method (`AdvancedSettingsView.tsx`):
 * those are genuinely machine-local (read from standalone JSON files, not a
 * synced key) single-kiosk-hardware settings, not meaningfully requested via
 * cross-device chat.
 */
export interface SettingsDraft {
  clockFormat: ClockFormat
  dateFormat: DateFormat
  paneLanguage: LanguageCode
  hiddenSidebarItems: ToggleableSidebarItem[]
}

function liveSettings(): SettingsDraft {
  return {
    clockFormat: (store.get('admin.clockFormat')?.value as ClockFormat | undefined) ?? '24h',
    dateFormat: (store.get('admin.dateFormat')?.value as DateFormat | undefined) ?? 'dmy',
    paneLanguage: (store.get('admin.paneLanguage')?.value as LanguageCode | undefined) ?? 'no',
    hiddenSidebarItems: (store.get('admin.sidebarSettings')?.value as { hiddenItems: ToggleableSidebarItem[] } | undefined)?.hiddenItems ?? DEFAULT_SIDEBAR_SETTINGS.hiddenItems,
  }
}

interface SettingsFields {
  clockFormat: ClockFormat | null
  dateFormat: DateFormat | null
  paneLanguage: LanguageCode | null
  hiddenSidebarItems: ToggleableSidebarItem[] | null
}

export const settingsEntity: AssistantEntity<SettingsDraft> = {
  key: 'settings',
  supportedActions: ['update'],
  section: null,
  // `hiddenSidebarItems` asks the model to reconstruct the FULL list on every touch (there's no
  // per-item add/remove field) — confirmed via real testing that a local model asked an unrelated
  // question ("switch to 12-hour clock") filled this with every possible item anyway, silently
  // hiding the entire sidebar. Stripped under 'safe'/local-default posture; still available under
  // Claude/'full', which didn't show this failure mode.
  confabulationRiskFields: ['hiddenSidebarItems'],

  fillFieldsSchema(): AssistantJsonSchema {
    return {
      type: 'object',
      properties: {
        clockFormat: nullable({ type: 'string', enum: ['24h', '12h'], description: 'Whether a wall-clock time is shown as 24-hour or 12-hour with AM/PM.' }),
        dateFormat: nullable({ type: 'string', enum: ['dmy', 'mdy'], description: '"dmy" = day-month-year with dots (31.12.2026, Norwegian/European); "mdy" = month-day-year with slashes (12/31/2026, US).' }),
        paneLanguage: nullable({ type: 'string', enum: LANGUAGE_CODES, description: "The store's default language for kiosk pane content (menu items, event descriptions, etc.) — independent of the admin dashboard's own interface language." }),
        hiddenSidebarItems: nullable({
          type: 'array',
          items: { type: 'string', enum: TOGGLEABLE_SIDEBAR_ITEMS },
          description:
            'The FULL replacement list of sidebar items to hide (not just the ones to add/remove) — see the current values given above for what\'s currently hidden. To hide one more item, include every already-hidden item plus the new one; to unhide one, include every currently-hidden item except it.',
        }),
      },
      required: ['clockFormat', 'dateFormat', 'paneLanguage', 'hiddenSidebarItems'],
      additionalProperties: false,
    }
  },

  async getCurrent(): Promise<SettingsDraft | null> {
    return liveSettings()
  },

  mergeDraft(_action, current, rawFields): SettingsDraft {
    const fields = rawFields as SettingsFields
    const base = current ?? liveSettings()
    return {
      clockFormat: fields.clockFormat ?? base.clockFormat,
      dateFormat: fields.dateFormat ?? base.dateFormat,
      paneLanguage: fields.paneLanguage ?? base.paneLanguage,
      hiddenSidebarItems: fields.hiddenSidebarItems ?? base.hiddenSidebarItems,
    }
  },

  validate(): AssistantValidationIssue[] {
    return []
  },

  reviewComponent() {
    return 'existingForm'
  },

  async listAll(): Promise<SettingsDraft> {
    return liveSettings()
  },
}
