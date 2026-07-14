import type { LanguageCode } from '../i18n'
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
