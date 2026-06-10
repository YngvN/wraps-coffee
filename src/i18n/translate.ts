import languages from './languages.json'

/** Codes of the languages defined in `languages.json` (e.g. "en" | "no"). */
export type LanguageCode = keyof typeof languages

/** Language used when a translation is missing from the active language. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en'

/** A language available for selection, used to build language pickers. */
export interface LanguageOption {
  code: LanguageCode
  label: string
}

/** All languages defined in `languages.json`, derived automatically. */
export const availableLanguages: LanguageOption[] = (Object.keys(languages) as LanguageCode[]).map((code) => ({
  code,
  label: languages[code].label,
}))

/** Reads a dot-separated path (e.g. "nav.home") from a nested object. */
function getNestedValue(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value && typeof value === 'object' && segment in value) {
      return (value as Record<string, unknown>)[segment]
    }
    return undefined
  }, source)
}

/** Replaces `{{placeholders}}` in a translation string with the given values. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/**
 * Translates `key` (a dot-separated path into `languages.json`, e.g.
 * "nav.home") for `language`. Falls back to `FALLBACK_LANGUAGE` and finally
 * to the raw key itself if no translation is found.
 */
export function translate(language: LanguageCode, key: string, vars?: Record<string, string | number>): string {
  const value =
    getNestedValue(languages[language].translations, key) ??
    getNestedValue(languages[FALLBACK_LANGUAGE].translations, key)

  return typeof value === 'string' ? interpolate(value, vars) : key
}
