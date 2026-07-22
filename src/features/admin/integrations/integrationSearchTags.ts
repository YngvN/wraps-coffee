/**
 * Search-only keywords for the three live location-based integrations,
 * mirroring `ComingSoonIntegration['tags']` — untranslated and never
 * rendered, just matched against. Shared by the Integrations page's own
 * search (`IntegrationSearchResults.tsx`) and the global search index
 * (`useGlobalSearchIndex.ts`), so a term like "ruter" only has to be
 * maintained in one place.
 */
export const WEATHER_TAGS = ['vaer', 'vær', 'weather', 'temperatur', 'temperature', 'nedbor', 'nedbør', 'precipitation', 'vind', 'wind', 'yr', 'forecast', 'varsel']
export const TRANSIT_TAGS = ['transport', 'buss', 'bus', 'trikk', 'tram', 'tog', 'train', 'avganger', 'departures', 'kollektivtransport', 'public transport', 'ruter', 'holdeplass', 'stop']
/** Entur is the same underlying feed as Transit departures (Ruter), listed separately so an admin outside Oslo can find it by their own region's operator name rather than only under "Ruter". */
export const ENTUR_TAGS = [
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
