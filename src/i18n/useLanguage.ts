import { useContext } from 'react'
import { LanguageContext } from './LanguageContext'

/**
 * Access the active language, `setLanguage`, and the `t` translation
 * function. Must be used within a `LanguageProvider`.
 */
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
