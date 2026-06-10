import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LanguageContext } from './LanguageContext'
import { availableLanguages, FALLBACK_LANGUAGE, translate, type LanguageCode } from './translate'

const STORAGE_KEY = 'language'

/** Type guard for whether `value` is one of the languages in `languages.json`. */
function isSupportedLanguage(value: string): value is LanguageCode {
  return availableLanguages.some((language) => language.code === value)
}

/** Reads the user's previously saved language choice, if any. */
function getStoredLanguage(): LanguageCode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && isSupportedLanguage(stored) ? stored : null
}

/**
 * Determines the language to start with by checking, in order:
 * 1. A previously saved choice in `localStorage`.
 * 2. The browser's preferred language (`navigator.language`).
 * 3. `FALLBACK_LANGUAGE`.
 */
function getInitialLanguage(): LanguageCode {
  const stored = getStoredLanguage()
  if (stored) return stored

  const browserLanguage = window.navigator.language.split('-')[0]
  if (isSupportedLanguage(browserLanguage)) return browserLanguage

  return FALLBACK_LANGUAGE
}

/**
 * Provides the active language, a `setLanguage` setter, and a `t`
 * translation function (see `useLanguage`) to the component tree.
 * Persists explicit language choices to `localStorage`.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((next: LanguageCode) => {
    window.localStorage.setItem(STORAGE_KEY, next)
    setLanguageState(next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
