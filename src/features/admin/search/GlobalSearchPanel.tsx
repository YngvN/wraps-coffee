import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRecentlyOpened, type RecentlyOpenedType } from '../../../hooks/useRecentlyOpened'
import { useLanguage } from '../../../i18n'
import { searchEntries } from './searchMatch'
import type { SearchResultEntry } from './searchTypes'
import { useGlobalSearchIndex } from './useGlobalSearchIndex'
import './GlobalSearchPanel.scss'

/** Which `SearchResultType`s double as a `RecentlyOpenedType` — the only kinds worth remembering as "recently opened" (an integration or a settings page is always just one click away in its own right, unlike a specific product/event/screen/category buried a few levels deep). */
const RECORDABLE_TYPES: RecentlyOpenedType[] = ['product', 'event', 'screen', 'category']

/** Splits a `SearchResultEntry.id` (e.g. `product:abc123`) back into its raw entity id — the part after the first `:`. */
function rawEntityId(entryId: string): string {
  return entryId.slice(entryId.indexOf(':') + 1)
}

interface GlobalSearchPanelProps {
  /** Called right after navigating to a clicked result, so the panel closes the same way `NotificationsDropdown`'s own rows do. */
  onNavigate: () => void
}

/**
 * The global search panel's actual content: a search box plus a flat,
 * ranked result list (see `searchEntries`) built from `useGlobalSearchIndex`
 * — every entity type across the admin dashboard in one place. Each row
 * renders as `` `${title}${subtitle ? ' - ' + subtitle : ''}` ``, which is
 * what produces both "Ruter# - Integration" and "Kylling Fajitas - Wraps".
 * Clicking a row navigates straight to that entry's own deep link (see
 * `SearchResultEntry.url`), which every target view already knows how to
 * consume via its own `useSearchParams` effect.
 */
export function GlobalSearchPanel({ onNavigate }: GlobalSearchPanelProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const index = useGlobalSearchIndex()
  const results = searchEntries(index, query)
  const isSearching = query.trim().length > 0
  const { entries: recentlyOpened, record: recordRecentlyOpened } = useRecentlyOpened()

  /** Recorded the same way `ProductsView`/`ScreensView` already record their own row clicks — re-derived against the current index on every render (rather than stored on the recents entry itself) so its `url`/`subtitle`/`icon` always stay fresh, e.g. if a product moves categories after being recorded. */
  const recentResults = recentlyOpened
    .map((recent) => index.find((entry) => entry.id === `${recent.type}:${recent.id}`))
    .filter((entry): entry is SearchResultEntry => entry !== undefined)

  const handleResultClick = (result: SearchResultEntry) => {
    if (RECORDABLE_TYPES.includes(result.type as RecentlyOpenedType)) recordRecentlyOpened(result.type as RecentlyOpenedType, rawEntityId(result.id), result.title)
    onNavigate()
  }

  return (
    <div className="global-search-panel">
      <div className="global-search-panel__input-row">
        <input
          type="search"
          name="search"
          className="global-search-panel__input"
          placeholder={t('admin.search.placeholder')}
          aria-label={t('admin.search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        {query ? (
          <button type="button" className="global-search-panel__clear" aria-label={t('admin.search.clearLabel')} onClick={() => setQuery('')}>
            ×
          </button>
        ) : (
          <svg className="global-search-panel__icon" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {!isSearching ? (
        recentResults.length > 0 ? (
          <>
            <p className="global-search-panel__section-title">{t('admin.nav.recentlyOpened')}</p>
            <ul className="global-search-panel__list">
              {recentResults.map((result) => (
                <li key={result.id}>
                  <Link to={result.url} onClick={() => handleResultClick(result)}>
                    {result.icon && <span className="global-search-panel__result-icon">{result.icon}</span>}
                    <span className="global-search-panel__result-text">
                      {result.title}
                      {result.subtitle && <span className="global-search-panel__result-subtitle"> - {result.subtitle}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="global-search-panel__hint">{t('admin.search.emptyStateHint')}</p>
        )
      ) : results.length === 0 ? (
        <p className="global-search-panel__hint">{t('admin.search.noResultsLabel', { query })}</p>
      ) : (
        <ul className="global-search-panel__list">
          {results.map((result) => (
            <li key={result.id}>
              <Link to={result.url} onClick={() => handleResultClick(result)}>
                {result.icon && <span className="global-search-panel__result-icon">{result.icon}</span>}
                <span className="global-search-panel__result-text">
                  {result.title}
                  {result.subtitle && <span className="global-search-panel__result-subtitle"> - {result.subtitle}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
