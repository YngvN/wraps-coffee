import type { ReactNode } from 'react'

/** Every kind of thing the global search can surface — drives which generic type label (see `useGlobalSearchIndex`'s `subtitle` construction) is shown when an entry has no more specific subtitle of its own. */
export type SearchResultType =
  | 'product'
  | 'catalogue'
  | 'category'
  | 'event'
  | 'screen'
  | 'integration'
  | 'newsSource'
  | 'messageBoard'
  | 'messageBoardPost'
  | 'user'
  | 'settingsPage'
  | 'navSection'

/**
 * One searchable thing in the admin dashboard, flattened by
 * `useGlobalSearchIndex` from every entity type it knows about. `title` and
 * `subtitle` are rendered as `` `${title}${subtitle ? ' - ' + subtitle : ''}` ``
 * by `GlobalSearchPanel` — this single rule is what produces both
 * "Ruter# - Integration" (a generic type label as `subtitle`) and
 * "Kylling Fajitas - Wraps" (the product's own resolved category name as
 * `subtitle`), since `subtitle` content is entity-specific rather than
 * always being a generic type word. `keywords` are extra matchable-only
 * terms (tags, synonyms) that never render on their own. `url` is a full
 * in-app path plus query string, matching exactly what the target view's
 * own deep-link effect expects to read via `useSearchParams()`.
 */
export interface SearchResultEntry {
  id: string
  type: SearchResultType
  title: string
  subtitle?: string
  keywords: string[]
  url: string
  icon?: ReactNode
}
