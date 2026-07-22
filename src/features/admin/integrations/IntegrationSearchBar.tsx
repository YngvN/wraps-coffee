import { useLanguage } from '../../../i18n'
import './IntegrationSearchBar.scss'

interface IntegrationSearchBarProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Search box for the Integrations page, matching every item (both the live
 * Yr/Ruter integrations and every "Coming soon" card) against its name,
 * description, category, and tags — see `comingSoonIntegrations.tsx`'s own
 * `tags` field. Shows a search icon at rest; once there's text, an "×"
 * button replaces it to clear the field in one tap rather than requiring a
 * select-all-and-delete.
 */
export function IntegrationSearchBar({ value, onChange }: IntegrationSearchBarProps) {
  const { t } = useLanguage()

  return (
    <div className="integration-search-bar">
      <input
        type="search"
        name="search"
        className="integration-search-bar__input"
        placeholder={t('admin.integrations.searchPlaceholder')}
        aria-label={t('admin.integrations.searchPlaceholder')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="integration-search-bar__clear" aria-label={t('admin.integrations.searchClearLabel')} onClick={() => onChange('')}>
          ×
        </button>
      ) : (
        <svg className="integration-search-bar__icon" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
