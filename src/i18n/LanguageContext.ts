import { createContext } from 'react'
import type { LanguageCode } from './translate'

/** Shape of the value provided by `LanguageProvider`. */
export interface LanguageContextValue {
  /** The currently active language code. */
  language: LanguageCode
  /** Switches the active language and persists the choice. */
  setLanguage: (language: LanguageCode) => void
  /** Translates a dot-separated key (e.g. "nav.home") for the active language. */
  t: (key: string, vars?: Record<string, string | number>) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
