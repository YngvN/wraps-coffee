import type { ReactNode } from 'react'
import { Badge, FetchedLogo, YrLogo } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { IntegrationsConfig } from '../../../types/integrations'
import { COMING_SOON_INTEGRATIONS } from './comingSoonIntegrations'
import './IntegrationSearchResults.scss'

/** Search-only keywords for the three live integrations, mirroring `ComingSoonIntegration['tags']` — untranslated and never rendered, just matched against. */
const WEATHER_TAGS = ['vaer', 'vær', 'weather', 'temperatur', 'temperature', 'nedbor', 'nedbør', 'precipitation', 'vind', 'wind', 'yr', 'forecast', 'varsel']
const TRANSIT_TAGS = ['transport', 'buss', 'bus', 'trikk', 'tram', 'tog', 'train', 'avganger', 'departures', 'kollektivtransport', 'public transport', 'ruter', 'holdeplass', 'stop']
/** Entur is the same underlying feed as Transit departures (Ruter), listed separately so an admin outside Oslo can find it by their own region's operator name rather than only under "Ruter". */
const ENTUR_TAGS = [
  'entur',
  'nasjonal',
  'national',
  'transport',
  'buss',
  'bus',
  'trikk',
  'tram',
  'tog',
  'train',
  'ferge',
  'ferry',
  'avganger',
  'departures',
  'holdeplass',
  'stop',
  'skyss',
  'atb',
  'kolumbus',
  'brakar',
  'vy',
  'go-ahead',
  'nettbuss',
  'fram',
]

interface SearchIndexEntry {
  id: string
  name: string
  description: string
  categoryLabel: string
  logos: ReactNode[]
  tags: string[]
  /** `undefined` for "Coming soon" items — only the two live integrations have an on/off state to show a status dot for. */
  enabled?: boolean
}

/** Every searchable entry on the Integrations page: the two live integrations (Yr, Ruter) plus all 57 "Coming soon" cards, each reduced to plain matchable text. Rebuilt on every render since it depends on the active language via `t()` — cheap enough (59 short strings) not to bother memoizing across language switches. */
function buildSearchIndex(t: (key: string, vars?: Record<string, string | number>) => string, config: IntegrationsConfig): SearchIndexEntry[] {
  const live: SearchIndexEntry[] = [
    {
      id: 'live-weather',
      name: t('admin.integrations.weatherTitle'),
      description: t('admin.integrations.weatherSearchDescription'),
      categoryLabel: t('admin.integrations.weatherTitle'),
      logos: [<YrLogo key="yr" />],
      tags: WEATHER_TAGS,
      enabled: config.weather.enabled,
    },
    {
      id: 'live-transit',
      name: t('admin.integrations.transitTitle'),
      description: t('admin.integrations.transitSearchDescription'),
      categoryLabel: t('admin.integrations.transitTitle'),
      logos: [<FetchedLogo key="ruter" slug="ruter" label="Ruter#" />],
      tags: TRANSIT_TAGS,
      enabled: config.transit.enabled,
    },
    {
      id: 'live-entur',
      name: t('admin.integrations.enturBrandName'),
      description: t('admin.integrations.enturSearchDescription'),
      categoryLabel: t('admin.integrations.enturBrandName'),
      logos: [<FetchedLogo key="entur" slug="entur" label="Entur" className="logo-chip" />],
      tags: ENTUR_TAGS,
      enabled: config.entur.enabled,
    },
  ]

  const comingSoon: SearchIndexEntry[] = COMING_SOON_INTEGRATIONS.map((item) => ({
    id: item.id,
    name: t(`admin.integrations.comingSoon.categories.${item.categoryId}.items.${item.id}.name`),
    description: t(`admin.integrations.comingSoon.categories.${item.categoryId}.items.${item.id}.description`),
    categoryLabel: t(`admin.integrations.comingSoon.categories.${item.categoryId}.title`),
    logos: item.logos,
    tags: item.tags,
  }))

  return [...live, ...comingSoon]
}

/** Everything in `entry` (name, description, category, tags) concatenated into one lowercase string to substring-match `query` against — so e.g. searching "kasse" finds Vipps/Zettle/Stripe via their own `tags`, not just entries whose visible name/description happens to contain that word. */
function matches(entry: SearchIndexEntry, query: string): boolean {
  const haystack = [entry.name, entry.description, entry.categoryLabel, ...entry.tags].join(' ').toLowerCase()
  return haystack.includes(query)
}

interface IntegrationSearchResultsProps {
  query: string
  config: IntegrationsConfig
}

/** The Integrations page's search results — a flat (uncategorized) list, unlike the "Coming soon" section's own per-category accordions, since a search result set is usually small and already filtered to what's relevant. */
export function IntegrationSearchResults({ query, config }: IntegrationSearchResultsProps) {
  const { t } = useLanguage()
  const normalizedQuery = query.trim().toLowerCase()
  const results = buildSearchIndex(t, config).filter((entry) => matches(entry, normalizedQuery))

  return (
    <div className="integration-search-results">
      <p className="integration-search-results__count">{t(results.length === 1 ? 'admin.integrations.searchResultsCountLabel' : 'admin.integrations.searchResultsCountLabelPlural', { count: results.length })}</p>
      {results.length === 0 ? (
        <p className="integrations-view__hint">{t('admin.integrations.searchNoResultsLabel', { query })}</p>
      ) : (
        <ul className="integration-search-results__list">
          {results.map((entry) => (
            <li key={entry.id} className="coming-soon-item">
              <div className="coming-soon-item__logos">{entry.logos}</div>
              <div className="coming-soon-item__text">
                <p className="coming-soon-item__name">{entry.name}</p>
                <p className="coming-soon-item__description">{entry.description}</p>
              </div>
              {entry.enabled === undefined ? (
                <Badge variant="neutral">{t('admin.integrations.comingSoon.badge')}</Badge>
              ) : (
                <span
                  className={`status-dot${entry.enabled ? ' status-dot--active' : ' status-dot--disabled'}`}
                  title={t(entry.enabled ? 'admin.integrations.statusEnabled' : 'admin.integrations.statusDisabled')}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
