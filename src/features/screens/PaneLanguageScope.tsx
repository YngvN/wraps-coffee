import { useMemo, type ReactNode } from 'react'
import { LanguageContext, translate, useLanguage, type LanguageCode } from '../../i18n'

interface PaneLanguageScopeProps {
  language: LanguageCode
  children: ReactNode
}

/**
 * Overrides the active language for one pane's own rendered content (menu
 * items, event descriptions, weather labels, etc.) — independent of
 * whichever language the browser viewing this kiosk display (or the admin
 * dashboard editing it) happens to have selected. A plain nested
 * `LanguageContext.Provider`: every `useLanguage()` call inside `children`
 * picks up this pane's own resolved language
 * (`resolveSlotLanguage(slot, stage) ?? defaultPaneLanguage`, see
 * `SplitLayout`'s own `renderPane`) instead of the outer one, the same way
 * a nested React context provider overrides any other value for its
 * subtree. `setLanguage` is left as the outer provider's own — nothing
 * rendered inside a pane's content ever calls it; this is a read-only
 * scope.
 */
export function PaneLanguageScope({ language, children }: PaneLanguageScopeProps) {
  const { setLanguage } = useLanguage()
  const value = useMemo(
    () => ({ language, setLanguage, t: (key: string, vars?: Record<string, string | number>) => translate(language, key, vars) }),
    [language, setLanguage],
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
