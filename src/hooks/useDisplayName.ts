import { useCallback } from 'react'
import { useLanguage } from '../i18n'
import type { BilingualText } from '../types/bilingual'
import { resolveBilingualField } from '../utils/bilingual'

/**
 * Returns a reader for a record's own bilingual name/title, safe to render
 * directly in a list, heading or picker: it falls back to the other
 * language's variant when the admin's current UI language has none (via
 * `resolveBilingualField`), and then to a translated "Untitled" placeholder
 * when neither language has content at all.
 *
 * The placeholder is the point. `resolveBilingualField` deliberately returns
 * `''` for a record with no name in any language — correct for a search
 * index, where indexing every nameless record under the literal term
 * "Untitled" would be worse than not indexing it. But rendering that `''` in
 * a list produces an anonymous row that still carries working Edit/Delete
 * buttons, which the admin has no way to identify before acting on it. Use
 * this hook wherever a name is *displayed*; call `resolveBilingualField`
 * directly wherever a name is *indexed or matched against*.
 *
 * @returns `(value) => string` — never blank.
 */
export function useDisplayName(): (value: BilingualText | undefined) => string {
  const { t, language } = useLanguage()
  return useCallback(
    (value: BilingualText | undefined) => resolveBilingualField(value, language) || t('admin.common.untitled'),
    [t, language],
  )
}
