// Imported from `translate` directly, not the `../i18n` barrel — the barrel also re-exports
// `LanguageProvider.tsx`, which requires `--jsx` to type-check; `server/`'s own tsconfig doesn't set
// that, and this file is now imported from server-side entity adapters too.
import type { LanguageCode } from '../i18n/translate'
import type { BilingualText } from '../types/bilingual'

/** Every language among `fields` that already has non-blank content, in `languageCodes`' own order — used to decide which language tabs should already be open when editing an existing bilingual-content record (see `LanguageTabs`), so an existing translation is never hidden behind an "Add language" click. */
export function languagesWithContent(fields: (BilingualText | undefined)[], languageCodes: LanguageCode[]): LanguageCode[] {
  return languageCodes.filter((code) => fields.some((field) => field?.[code]?.trim()))
}

/** The language tabs a bilingual-content form should start with: the cafe's own standard pane language always first, plus (when editing an existing record) any other language among `languageCodes` that already has content in `fields` — a brand-new record starts with just the one tab. */
export function initialActiveLanguages(defaultLanguage: LanguageCode, fields: (BilingualText | undefined)[], languageCodes: LanguageCode[]): LanguageCode[] {
  const withContent = languagesWithContent(fields, languageCodes)
  return [defaultLanguage, ...withContent.filter((code) => code !== defaultLanguage)]
}

/** Reads a bilingual name/title for display, falling back to the other language's variant when the preferred one is blank — mirrors `src/i18n/translate.ts`'s own fallback-to-`FALLBACK_LANGUAGE` idiom, applied to record content instead of UI strings. Without this, a record filled in on only one language tab renders with a blank name the moment the admin's UI language differs from it. Returns `''` only when neither variant has content. */
export function resolveBilingualField(value: BilingualText | undefined, preferredLanguage: LanguageCode): string {
  if (!value) return ''
  const fallbackLanguage: LanguageCode = preferredLanguage === 'no' ? 'en' : 'no'
  return value[preferredLanguage] || value[fallbackLanguage] || ''
}
