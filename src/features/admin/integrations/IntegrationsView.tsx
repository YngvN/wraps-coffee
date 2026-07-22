import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, BackButton, Button, Checkbox, CloseIcon, FetchedLogo, Input, Modal, PlusIcon, SlideTransition, TranslatedText, YrLogo } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useIntegrationsConfig } from '../../../hooks/useIntegrationsConfig'
import { useFoodoraConfig } from '../../../hooks/useFoodoraConfig'
import { useFoodoraOrders } from '../../../hooks/useFoodoraOrders'
import { useScrollToAndHighlight } from '../../../hooks/useScrollToAndHighlight'
import { useWoltConfig } from '../../../hooks/useWoltConfig'
import { useWoltOrders } from '../../../hooks/useWoltOrders'
import { useLanguage } from '../../../i18n'
import { getFoodoraCredentials, getWoltCredentials, lookupAddress, searchStops, setFoodoraCredentials, setWoltCredentials, triggerFoodoraSync, triggerWoltSync } from '../../../lib/localServer'
import type { IntegrationsConfig, NearbyStop, WeatherLocation } from '../../../types/integrations'
import { NEWS_SOURCES } from '../../../types/news'
import { TransitModeIcon } from '../../screens/TransitModeIcon'
import { WeatherSymbolIcon } from '../../screens/WeatherSymbolIcon'
import { formatDateTime } from '../../../utils/clockFormat'
import { generateId } from '../../../utils/id'
import { TRANSIT_MODES } from '../../../utils/transitModes'
import { weatherLocationKey } from '../../../utils/weatherLocationKey'
import { ActivationToggle } from './ActivationToggle'
import { AnimatedDetails } from './AnimatedDetails'
import { ComingSoonSection } from './ComingSoonSection'
import { IntegrationSearchBar } from './IntegrationSearchBar'
import { IntegrationSearchResults } from './IntegrationSearchResults'
import './IntegrationsView.scss'

/** Every base symbol code `WeatherSymbolIcon` recognizes, paired with its own i18n label — shown as a legend in the "View weather icons" modal so the admin can see what each glyph on a live forecast slide means. Yr appends `_day`/`_night`/`_polartwilight` to these at runtime; passing the bare base code here (no suffix) always renders as `WeatherSymbolIcon`'s own "day" branch. */
const WEATHER_SYMBOLS: { code: string; labelKey: string }[] = [
  { code: 'clearsky', labelKey: 'admin.integrations.weatherSymbolClearsky' },
  { code: 'fair', labelKey: 'admin.integrations.weatherSymbolFair' },
  { code: 'partlycloudy', labelKey: 'admin.integrations.weatherSymbolPartlycloudy' },
  { code: 'cloudy', labelKey: 'admin.integrations.weatherSymbolCloudy' },
  { code: 'fog', labelKey: 'admin.integrations.weatherSymbolFog' },
  { code: 'rainshowers', labelKey: 'admin.integrations.weatherSymbolRainshowers' },
  { code: 'rainshowersandthunder', labelKey: 'admin.integrations.weatherSymbolRainshowersandthunder' },
  { code: 'sleetshowers', labelKey: 'admin.integrations.weatherSymbolSleetshowers' },
  { code: 'snowshowers', labelKey: 'admin.integrations.weatherSymbolSnowshowers' },
  { code: 'rain', labelKey: 'admin.integrations.weatherSymbolRain' },
  { code: 'heavyrain', labelKey: 'admin.integrations.weatherSymbolHeavyrain' },
  { code: 'lightrain', labelKey: 'admin.integrations.weatherSymbolLightrain' },
  { code: 'rainandthunder', labelKey: 'admin.integrations.weatherSymbolRainandthunder' },
  { code: 'sleet', labelKey: 'admin.integrations.weatherSymbolSleet' },
  { code: 'snow', labelKey: 'admin.integrations.weatherSymbolSnow' },
  { code: 'lightsnow', labelKey: 'admin.integrations.weatherSymbolLightsnow' },
  { code: 'heavysnow', labelKey: 'admin.integrations.weatherSymbolHeavysnow' },
  { code: 'snowandthunder', labelKey: 'admin.integrations.weatherSymbolSnowandthunder' },
  { code: 'sleetshowersandthunder', labelKey: 'admin.integrations.weatherSymbolSleetshowersandthunder' },
  { code: 'snowshowersandthunder', labelKey: 'admin.integrations.weatherSymbolSnowshowersandthunder' },
]

/** The Weather card's own status-dot state: `'disabled'` grey (turned off), `'error'` red (turned on but genuinely not working — no live data and no cache to fall back on), `'stale'` yellow (a currently-open pane is showing cached data — see `WeatherSlide`), `'live'` green. */
type WeatherStatus = 'disabled' | 'error' | 'stale' | 'live'

/**
 * Aggregates every configured weather location's own last-reported fetch
 * outcome (`config.weather.locationStatus`, written by whichever kiosk
 * `WeatherSlide` last fetched it) into one status for the Weather card's
 * dot. Worst case wins: one broken location is enough to call the whole
 * integration `'error'`, even if others are fine. A location nobody's
 * currently displaying (no report yet) simply doesn't contribute either way.
 */
function computeWeatherStatus(config: IntegrationsConfig): WeatherStatus {
  if (!config.weather.enabled) return 'disabled'
  const activeCoordinates: { lat: number; lon: number }[] = []
  if (config.weather.useStoreLocation && config.addressLookup?.coordinates) activeCoordinates.push(config.addressLookup.coordinates)
  for (const location of config.weather.locations) if (location.coordinates) activeCoordinates.push(location.coordinates)
  const reportedStates = activeCoordinates.map((coordinates) => config.weather.locationStatus[weatherLocationKey(coordinates.lat, coordinates.lon)]?.state)
  if (reportedStates.some((state) => state === 'error')) return 'error'
  if (reportedStates.some((state) => state === 'stale')) return 'stale'
  return 'live'
}

/**
 * Admin view for the two live-data screen-slot kinds: real-time transit
 * departures (Ruter, via Entur's public APIs) and an hourly weather
 * forecast (Yr / MET Norway) — both derived from the cafe's own address, as
 * set in Contact info. "Look up address" geocodes that address and finds
 * nearby stops through the local server's `/integrations/lookup` proxy; the
 * result (coordinates + candidate stops) is cached in the synced
 * `admin.integrations` config so every device sees the same options without
 * re-looking it up.
 *
 * Each of the two lives under whichever of two categories matches its own
 * `enabled` flag — "Activated" or "Available" — moved between them via its
 * own `ActivationToggle` (which confirms before switching off, since that
 * stops it showing on any screen currently using it). A third, fixed
 * category, "Coming soon" (`ComingSoonSection`), lists integrations with no
 * real backend yet — unlike Weather/Transit, none of those are toggleable.
 * Enabling either live integration makes its matching slot content kind
 * (`'weather'`/`'transit'`) selectable in every screen's slide editor, both
 * on the dashboard (`ScreenForm.tsx`) and the kiosk's own in-place editor
 * (`SlotEditor.tsx`), since both share `SlideFields.tsx`. Only the pool of
 * stops (search, "Nearby stops", "Selected stops") is still cafe-wide, edited
 * here — every other transit display setting (departure count, detail
 * toggles, mode filter) lives on each `'transit'` slide itself instead, same
 * posture as weather's own per-slide settings (forecast length, which extra
 * details to show, and which location), so this page's Ruter#/Entur cards
 * only manage which stops exist to choose from, not how any one pane
 * displays its chosen stop. A `'weather'` slide picks its location by id
 * (see `SlideFields.tsx`'s location `<select>`), defaulting to the store's
 * own address (`addressLookup`, toggled via "Use store location" on the
 * Weather card, on by default) plus any number of extra named locations
 * added there, each independently geocoded through the same address-lookup
 * proxy.
 *
 * The search bar at the top matches every live/coming-soon integration by
 * name, description, category and tags (see `IntegrationSearchResults.tsx`)
 * and swaps in for the rest of the page's own content — lookup section,
 * categories, and the "Coming soon" directory — via `SlideTransition`, the
 * same slide-in-from-the-right treatment `SettingsView` uses for its own
 * sub-views.
 *
 * Rendered from `SettingsView` as a submenu, hence the `onBack` prop
 * instead of a route of its own — same pattern as `StoreSettingsView`.
 */
interface IntegrationsViewProps {
  /** Returns to the Settings main list — this view is reached only as a Settings submenu, not its own top-level route, so it has no back button of its own. */
  onBack: () => void
}

export function IntegrationsView({ onBack }: IntegrationsViewProps) {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  const [contactInfo] = useContactInfo()
  const [config, setConfig] = useIntegrationsConfig()
  const [woltConfig, setWoltConfig] = useWoltConfig()
  const [woltOrders] = useWoltOrders()
  const [woltSubmenuOpen, setWoltSubmenuOpen] = useState(false)
  const [woltVenueIdDraft, setWoltVenueIdDraft] = useState('')
  const [woltApiKeyDraft, setWoltApiKeyDraft] = useState('')
  /** Loaded alongside the credentials above but never edited from this card — the environment checkbox lives in Settings → Testing (see `TestingSettingsView`) — just carried through so saving venue id/API key here doesn't reset it back to production. */
  const [woltUseDevelopmentEnvironment, setWoltUseDevelopmentEnvironment] = useState(false)
  const [hasSavedWoltCredentials, setHasSavedWoltCredentials] = useState(false)
  const [isSavingWoltCredentials, setIsSavingWoltCredentials] = useState(false)
  const [woltCredentialsError, setWoltCredentialsError] = useState<string | null>(null)
  const [isSyncingWolt, setIsSyncingWolt] = useState(false)
  const [woltSyncError, setWoltSyncError] = useState<string | null>(null)
  const [foodoraConfig, setFoodoraConfig] = useFoodoraConfig()
  const [foodoraOrders] = useFoodoraOrders()
  const [foodoraSubmenuOpen, setFoodoraSubmenuOpen] = useState(false)
  const [foodoraVenueIdDraft, setFoodoraVenueIdDraft] = useState('')
  const [foodoraApiKeyDraft, setFoodoraApiKeyDraft] = useState('')
  /** Loaded alongside the credentials above but never edited from this card — the environment checkbox lives in Settings → Testing (see `TestingSettingsView`) — just carried through so saving venue id/API key here doesn't reset it back to production. */
  const [foodoraUseDevelopmentEnvironment, setFoodoraUseDevelopmentEnvironment] = useState(false)
  const [hasSavedFoodoraCredentials, setHasSavedFoodoraCredentials] = useState(false)
  const [isSavingFoodoraCredentials, setIsSavingFoodoraCredentials] = useState(false)
  const [foodoraCredentialsError, setFoodoraCredentialsError] = useState<string | null>(null)
  const [isSyncingFoodora, setIsSyncingFoodora] = useState(false)
  const [foodoraSyncError, setFoodoraSyncError] = useState<string | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookingUpLocationId, setLookingUpLocationId] = useState<string | null>(null)
  const [locationLookupError, setLocationLookupError] = useState<string | null>(null)
  const [stopSearchQuery, setStopSearchQuery] = useState('')
  const [stopSearchResults, setStopSearchResults] = useState<NearbyStop[]>([])
  const [isSearchingStops, setIsSearchingStops] = useState(false)
  const [stopSearchError, setStopSearchError] = useState<string | null>(null)
  const [transitIconsOpen, setTransitIconsOpen] = useState(false)
  const [weatherIconsOpen, setWeatherIconsOpen] = useState(false)
  const [weatherSubmenuOpen, setWeatherSubmenuOpen] = useState(false)
  const [transitSubmenuOpen, setTransitSubmenuOpen] = useState(false)
  const [enturSubmenuOpen, setEnturSubmenuOpen] = useState(false)
  const [newsSubmenuOpen, setNewsSubmenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  /** `1` once the search bar has text (results slide in from the right), `-1` once it's cleared back to empty (sliding back to the normal view) — same convention `SettingsView` uses for its own sub-views. */
  const [searchDirection, setSearchDirection] = useState<1 | -1>(1)

  const [searchParams, setSearchParams] = useSearchParams()
  /** Guards the deep-link effect below so it only ever consumes `?integration=`/`?comingSoonCategory=` once — same posture as `ProductsView`'s own deep-link effect. */
  const consumedIntegrationDeepLinkRef = useRef(false)
  const weatherSubmenuRef = useRef<HTMLDivElement>(null)
  const transitSubmenuRef = useRef<HTMLDivElement>(null)
  const enturSubmenuRef = useRef<HTMLDivElement>(null)
  const newsSubmenuRef = useRef<HTMLDivElement>(null)
  const woltSubmenuRef = useRef<HTMLDivElement>(null)
  const foodoraSubmenuRef = useRef<HTMLDivElement>(null)
  const submenuSetters = {
    weather: setWeatherSubmenuOpen,
    transit: setTransitSubmenuOpen,
    entur: setEnturSubmenuOpen,
    news: setNewsSubmenuOpen,
    wolt: setWoltSubmenuOpen,
    foodora: setFoodoraSubmenuOpen,
  } as const
  const submenuRefs = {
    weather: weatherSubmenuRef,
    transit: transitSubmenuRef,
    entur: enturSubmenuRef,
    news: newsSubmenuRef,
    wolt: woltSubmenuRef,
    foodora: foodoraSubmenuRef,
  } as const
  /** Which integration's submenu (if any) still needs to be scrolled into view after a deep link just opened it — cleared the moment the scroll fires. */
  const [scrollToIntegrationKey, setScrollToIntegrationKey] = useState<keyof typeof submenuRefs | null>(null)
  /** Set from `?newsSource=<id>` — highlighted once the News submenu has actually finished opening (see the effect below), since its checkbox rows don't exist in the DOM until then. */
  const [highlightNewsSourceId, setHighlightNewsSourceId] = useState<string | null>(null)
  const { registerRef: registerNewsSourceRef, triggerHighlight: triggerNewsSourceHighlight } = useScrollToAndHighlight()

  /**
   * Deep-link support: `?integration=<key>` (weather/transit/entur/news/wolt/foodora)
   * opens that integration's own submenu and scrolls it into view — what
   * the global search results (see `useGlobalSearchIndex`) navigate to.
   * `&newsSource=<id>` additionally scrolls to/highlights that one source's
   * checkbox inside the News submenu (see the follow-up effect below).
   *
   * The strip below is deliberately *not* guarded by `consumedIntegrationDeepLinkRef`
   * (only the state-opening part is) and instead keeps retrying on every
   * `searchParams` change until both params are actually gone: this view is
   * mounted as `SettingsView`'s own child on the very same commit as
   * `SettingsView`'s own mount-time effect that strips *its* `?view=` param,
   * and since both effects call `setSearchParams` independently in that
   * same tick, whichever commits last wins outright (it computes its own
   * "next" params from a snapshot that doesn't yet reflect the other's
   * write) — so a single one-shot strip here can silently lose that race.
   * Re-running the strip once more after `SettingsView`'s own update causes
   * a re-render (this effect's `searchParams` dependency changes again) is
   * what makes this self-healing instead of leaving `integration`/`newsSource`
   * stuck in the URL.
   */
  useEffect(() => {
    const integration = searchParams.get('integration') as keyof typeof submenuSetters | null
    const newsSource = searchParams.get('newsSource')
    if (!integration && !newsSource) return
    if (!consumedIntegrationDeepLinkRef.current && integration && integration in submenuSetters) {
      consumedIntegrationDeepLinkRef.current = true
      queueMicrotask(() => {
        submenuSetters[integration](true)
        setScrollToIntegrationKey(integration)
        if (newsSource && integration === 'news') setHighlightNewsSourceId(newsSource)
      })
    }
    setSearchParams((current) => {
      current.delete('integration')
      current.delete('newsSource')
      return current
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `submenuSetters` is a plain object literal recreated every render; only `searchParams`/`setSearchParams` should re-run this.
  }, [searchParams, setSearchParams])

  /** Scrolls the deep-linked integration's submenu into view once its ref exists — the wrapper div is always rendered (only its `AnimatedDetails` body is conditional), so this can fire immediately after the setter above opens it. */
  useEffect(() => {
    if (!scrollToIntegrationKey) return
    submenuRefs[scrollToIntegrationKey].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    queueMicrotask(() => setScrollToIntegrationKey(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `submenuRefs` is a plain object of stable `useRef` instances; only `scrollToIntegrationKey` itself should retrigger this.
  }, [scrollToIntegrationKey])

  /** Waits for the News submenu's own open animation (`AnimatedDetails`, ~250ms) to finish before scrolling to/highlighting the deep-linked source's checkbox — its DOM node doesn't exist until the accordion body has actually mounted. */
  useEffect(() => {
    if (!highlightNewsSourceId || !newsSubmenuOpen) return
    const timeout = setTimeout(() => {
      triggerNewsSourceHighlight(highlightNewsSourceId)
      setHighlightNewsSourceId(null)
    }, 300)
    return () => clearTimeout(timeout)
  }, [highlightNewsSourceId, newsSubmenuOpen, triggerNewsSourceHighlight])

  // Loads the saved Wolt credentials once a session exists, same posture as
  // `DeveloperDocsView`'s own Neon URL load — admin/subadmin only, so this
  // silently leaves the drafts empty for a `limited` account (its own
  // "missing credentials" yellow status will show either way, since it
  // can't see whether someone else has already saved real ones).
  useEffect(() => {
    if (!session) return
    getWoltCredentials(session.token)
      .then(({ venueId, apiKey, useDevelopmentEnvironment }) => {
        setWoltVenueIdDraft(venueId ?? '')
        setWoltApiKeyDraft(apiKey ?? '')
        setWoltUseDevelopmentEnvironment(useDevelopmentEnvironment)
        setHasSavedWoltCredentials(Boolean(venueId && apiKey))
      })
      .catch(() => {
        // A `limited` account gets a 403 here — expected, not worth surfacing as an error.
      })
  }, [session])

  const handleSaveWoltCredentials = () => {
    if (!session) return
    setIsSavingWoltCredentials(true)
    setWoltCredentialsError(null)
    setWoltCredentials(session.token, { venueId: woltVenueIdDraft.trim() || null, apiKey: woltApiKeyDraft.trim() || null, useDevelopmentEnvironment: woltUseDevelopmentEnvironment })
      .then(({ venueId, apiKey }) => {
        setHasSavedWoltCredentials(Boolean(venueId && apiKey))
      })
      .catch(() => setWoltCredentialsError(t('admin.integrations.woltCredentialsSaveError')))
      .finally(() => setIsSavingWoltCredentials(false))
  }

  const handleSyncWoltNow = () => {
    if (!session) return
    setIsSyncingWolt(true)
    setWoltSyncError(null)
    triggerWoltSync(session.token)
      .catch(() => setWoltSyncError(t('admin.integrations.woltSyncError')))
      .finally(() => setIsSyncingWolt(false))
  }

  // Loads the saved Foodora credentials once a session exists — same
  // posture as the Wolt effect above.
  useEffect(() => {
    if (!session) return
    getFoodoraCredentials(session.token)
      .then(({ venueId, apiKey, useDevelopmentEnvironment }) => {
        setFoodoraVenueIdDraft(venueId ?? '')
        setFoodoraApiKeyDraft(apiKey ?? '')
        setFoodoraUseDevelopmentEnvironment(useDevelopmentEnvironment)
        setHasSavedFoodoraCredentials(Boolean(venueId && apiKey))
      })
      .catch(() => {
        // A `limited` account gets a 403 here — expected, not worth surfacing as an error.
      })
  }, [session])

  const handleSaveFoodoraCredentials = () => {
    if (!session) return
    setIsSavingFoodoraCredentials(true)
    setFoodoraCredentialsError(null)
    setFoodoraCredentials(session.token, { venueId: foodoraVenueIdDraft.trim() || null, apiKey: foodoraApiKeyDraft.trim() || null, useDevelopmentEnvironment: foodoraUseDevelopmentEnvironment })
      .then(({ venueId, apiKey }) => {
        setHasSavedFoodoraCredentials(Boolean(venueId && apiKey))
      })
      .catch(() => setFoodoraCredentialsError(t('admin.integrations.foodoraCredentialsSaveError')))
      .finally(() => setIsSavingFoodoraCredentials(false))
  }

  const handleSyncFoodoraNow = () => {
    if (!session) return
    setIsSyncingFoodora(true)
    setFoodoraSyncError(null)
    triggerFoodoraSync(session.token)
      .catch(() => setFoodoraSyncError(t('admin.integrations.foodoraSyncError')))
      .finally(() => setIsSyncingFoodora(false))
  }

  const handleSearchQueryChange = (value: string) => {
    const wasSearching = searchQuery.trim().length > 0
    const isSearching = value.trim().length > 0
    if (isSearching && !wasSearching) setSearchDirection(1)
    else if (!isSearching && wasSearching) setSearchDirection(-1)
    setSearchQuery(value)
  }

  const addressLookup = config.addressLookup
  const isStale = addressLookup !== undefined && addressLookup.address !== contactInfo.address
  const isSearching = searchQuery.trim().length > 0

  const handleLookupAddress = () => {
    setIsLookingUp(true)
    setLookupError(null)
    lookupAddress(contactInfo.address)
      .then((result) => {
        setConfig({ ...config, addressLookup: { address: contactInfo.address, ...result } })
      })
      .catch(() => setLookupError(t('admin.integrations.lookupError')))
      .finally(() => setIsLookingUp(false))
  }

  const toggleStop = (stop: NearbyStop) => {
    const isSelected = config.transit.selectedStops.some((selected) => selected.id === stop.id)
    const selectedStops = isSelected ? config.transit.selectedStops.filter((selected) => selected.id !== stop.id) : [...config.transit.selectedStops, stop]
    setConfig({ ...config, transit: { ...config.transit, selectedStops } })
  }

  /** Entur's own stop pool, deliberately independent of Ruter's `config.transit.selectedStops` — see the doc comment on `IntegrationsConfig['entur']`. */
  const toggleEnturStop = (stop: NearbyStop) => {
    const isSelected = config.entur.selectedStops.some((selected) => selected.id === stop.id)
    const selectedStops = isSelected ? config.entur.selectedStops.filter((selected) => selected.id !== stop.id) : [...config.entur.selectedStops, stop]
    setConfig({ ...config, entur: { ...config.entur, selectedStops } })
  }

  /** Finds stops by name anywhere (not just near the store's own address, unlike the "Nearby stops" list) — lets a stop from a different neighborhood, or a different town's own operator, be added to `selectedStops` too. */
  const handleSearchStops = () => {
    if (!stopSearchQuery.trim()) return
    setIsSearchingStops(true)
    setStopSearchError(null)
    searchStops(stopSearchQuery)
      .then((results) => setStopSearchResults(results))
      .catch(() => setStopSearchError(t('admin.integrations.stopSearchError')))
      .finally(() => setIsSearchingStops(false))
  }

  /**
   * Live-searches as the admin types, waiting 500ms after the last keystroke
   * so each character doesn't fire its own request — the "Search" button and
   * Enter key (below) still call `handleSearchStops` directly, skipping the
   * wait for whoever doesn't want to pause while typing. Clearing the query
   * back to empty clears the results immediately instead (see
   * `handleStopSearchQueryChange`), rather than through this effect, since
   * that's a direct reaction to the edit itself, not something to debounce.
   */
  useEffect(() => {
    if (!stopSearchQuery.trim()) return
    const timeout = setTimeout(handleSearchStops, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `stopSearchQuery` should restart the debounce timer; `handleSearchStops` is recreated every render (it closes over the query) but isn't itself what should reset the wait.
  }, [stopSearchQuery])

  const handleStopSearchQueryChange = (value: string) => {
    setStopSearchQuery(value)
    if (!value.trim()) setStopSearchResults([])
  }

  const addSearchedStop = (stop: NearbyStop) => {
    if (config.transit.selectedStops.some((selected) => selected.id === stop.id)) return
    setConfig({ ...config, transit: { ...config.transit, selectedStops: [...config.transit.selectedStops, stop] } })
  }

  const addSearchedEnturStop = (stop: NearbyStop) => {
    if (config.entur.selectedStops.some((selected) => selected.id === stop.id)) return
    setConfig({ ...config, entur: { ...config.entur, selectedStops: [...config.entur.selectedStops, stop] } })
  }

  /** Whether weather has *any* coordinate source to enable with — the store's own address (only while `useStoreLocation` is on) or at least one already-looked-up extra location. Gates the weather `ActivationToggle`, same posture as transit's own "needs nearby stops first" gate. */
  const hasWeatherCoordinates = (config.weather.useStoreLocation && Boolean(addressLookup?.coordinates)) || config.weather.locations.some((location) => location.coordinates)

  const addWeatherLocation = () => {
    const location: WeatherLocation = { id: generateId(), name: '', address: '', coordinates: null }
    setConfig({ ...config, weather: { ...config.weather, locations: [...config.weather.locations, location] } })
  }

  const updateWeatherLocation = (id: string, patch: Partial<WeatherLocation>) => {
    setConfig({ ...config, weather: { ...config.weather, locations: config.weather.locations.map((location) => (location.id === id ? { ...location, ...patch } : location)) } })
  }

  const removeWeatherLocation = (id: string) => {
    setConfig({ ...config, weather: { ...config.weather, locations: config.weather.locations.filter((location) => location.id !== id) } })
  }

  const handleLookupWeatherLocation = (id: string, address: string) => {
    setLookingUpLocationId(id)
    setLocationLookupError(null)
    lookupAddress(address)
      .then((result) => updateWeatherLocation(id, { coordinates: result.coordinates }))
      .catch(() => setLocationLookupError(t('admin.integrations.lookupError')))
      .finally(() => setLookingUpLocationId(null))
  }

  const weatherStatus = computeWeatherStatus(config)
  const weatherStatusDotClass =
    weatherStatus === 'live' ? 'status-dot--active' : weatherStatus === 'stale' ? 'status-dot--stale' : weatherStatus === 'error' ? 'status-dot--inactive' : 'status-dot--disabled'
  const weatherStatusTitleKey =
    weatherStatus === 'live'
      ? 'admin.integrations.statusEnabled'
      : weatherStatus === 'stale'
        ? 'admin.integrations.statusStale'
        : weatherStatus === 'error'
          ? 'admin.integrations.statusError'
          : 'admin.integrations.statusDisabled'

  const weatherSubmenu = (
    <div ref={weatherSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={weatherSubmenuOpen}
      onToggle={() => setWeatherSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-weather-enabled"
            label={t('admin.integrations.weatherEnableLabel')}
            checked={config.weather.enabled}
            disabled={!hasWeatherCoordinates}
            confirmMessage={t('admin.integrations.weatherDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, weather: { ...config.weather, enabled: checked } })}
          />
          <YrLogo className="integration-submenu__icon" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.weatherBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.weatherLabel')}</span>
          </span>
          <span className={`status-dot ${weatherStatusDotClass}`} title={t(weatherStatusTitleKey)} />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {config.weather.useStoreLocation && !addressLookup?.coordinates && <p className="integrations-view__hint">{t('admin.integrations.needsLookupHint')}</p>}
      <p className="integrations-view__hint">{t('admin.integrations.weatherEnabledDescription')}</p>
      <Button type="button" variant="secondary" onClick={() => setWeatherIconsOpen(true)}>
        {t('admin.integrations.weatherIconsButton')}
      </Button>

      <Checkbox
        id="integrations-weather-use-store-location"
        label={t('admin.integrations.weatherUseStoreLocationLabel')}
        checked={config.weather.useStoreLocation}
        onChange={(event) => setConfig({ ...config, weather: { ...config.weather, useStoreLocation: event.target.checked } })}
      />

      {config.weather.locations.length > 0 && (
        <ul className="integrations-view__location-list">
          {config.weather.locations.map((location) => (
            <li key={location.id} className="integrations-view__location-row">
              <Input
                id={`integrations-weather-location-name-${location.id}`}
                label={t('admin.integrations.weatherLocationNameLabel')}
                value={location.name}
                onChange={(event) => updateWeatherLocation(location.id, { name: event.target.value })}
              />
              <Input
                id={`integrations-weather-location-address-${location.id}`}
                label={t('admin.integrations.weatherLocationAddressLabel')}
                value={location.address}
                onChange={(event) => updateWeatherLocation(location.id, { address: event.target.value, coordinates: null })}
              />
              <div className="integrations-view__location-row-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleLookupWeatherLocation(location.id, location.address)}
                  disabled={!location.address.trim() || lookingUpLocationId === location.id}
                >
                  {lookingUpLocationId === location.id ? t('admin.integrations.lookupButtonLoading') : t('admin.integrations.weatherLocationLookupButton')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => removeWeatherLocation(location.id)}>
                  {t('admin.integrations.weatherLocationRemoveButton')}
                </Button>
              </div>
              {location.coordinates && (
                <span className="integrations-view__coordinates">
                  {t('admin.integrations.coordinatesLabel', { lat: location.coordinates.lat.toFixed(4), lon: location.coordinates.lon.toFixed(4) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {locationLookupError && <Alert variant="error">{locationLookupError}</Alert>}
      <Button type="button" variant="secondary" className="integrations-view__add-location" onClick={addWeatherLocation}>
        {t('admin.integrations.weatherAddLocationButton')}
      </Button>
    </AnimatedDetails>
    </div>
  )

  const transitSubmenu = (
    <div ref={transitSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={transitSubmenuOpen}
      onToggle={() => setTransitSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-transit-enabled"
            label={t('admin.integrations.transitEnableLabel')}
            checked={config.transit.enabled}
            disabled={!addressLookup?.nearbyStops.length}
            confirmMessage={t('admin.integrations.transitDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, transit: { ...config.transit, enabled: checked } })}
          />
          <FetchedLogo slug="ruter" label="Ruter#" className="integration-submenu__icon" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.transitBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.transitLabel')}</span>
          </span>
          <span className={`status-dot${config.transit.enabled ? ' status-dot--active' : ' status-dot--disabled'}`} title={t(config.transit.enabled ? 'admin.integrations.statusEnabled' : 'admin.integrations.statusDisabled')} />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {!addressLookup?.nearbyStops.length && <p className="integrations-view__hint">{t('admin.integrations.needsLookupHint')}</p>}
      <Button type="button" variant="secondary" onClick={() => setTransitIconsOpen(true)}>
            {t('admin.integrations.transitIconsButton')}
          </Button>
          {config.transit.enabled && (
            <>
              {config.transit.selectedStops.length > 0 && (
                <>
                  <p className="integrations-view__stops-label">{t('admin.integrations.selectedStopsLabel')}</p>
                  <ul className="integrations-view__stop-list">
                    {config.transit.selectedStops.map((stop) => (
                      <li key={stop.id} className="integrations-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button type="button" variant="secondary" className="integrations-view__icon-button" onClick={() => toggleStop(stop)} aria-label={t('admin.integrations.stopRemoveButton')}>
                          <CloseIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="integrations-view__stops-label">{t('admin.integrations.nearbyStopsLabel')}</p>
              {(() => {
                const availableNearbyStops = (addressLookup?.nearbyStops ?? []).filter((stop) => !config.transit.selectedStops.some((selected) => selected.id === stop.id))
                if (!addressLookup || addressLookup.nearbyStops.length === 0) return <p className="integrations-view__hint">{t('admin.integrations.noStopsFoundHint')}</p>
                if (availableNearbyStops.length === 0) return <p className="integrations-view__hint">{t('admin.integrations.allNearbyStopsAddedHint')}</p>
                return (
                  <ul className="integrations-view__stop-list">
                    {availableNearbyStops.map((stop) => (
                      <li key={stop.id} className="integrations-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button type="button" variant="secondary" className="integrations-view__icon-button" onClick={() => toggleStop(stop)} aria-label={t('admin.integrations.stopAddButton')}>
                          <PlusIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              })()}

              <p className="integrations-view__stops-label">{t('admin.integrations.stopSearchLabel')}</p>
              <p className="integrations-view__hint">{t('admin.integrations.stopSearchHint')}</p>
              <div className="integrations-view__stop-search">
                <Input
                  id="integrations-transit-stop-search-query"
                  label={t('admin.integrations.stopSearchLabel')}
                  value={stopSearchQuery}
                  onChange={(event) => handleStopSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearchStops()}
                />
                <Button type="button" variant="secondary" onClick={handleSearchStops} disabled={!stopSearchQuery.trim() || isSearchingStops}>
                  {isSearchingStops ? t('admin.integrations.lookupButtonLoading') : t('admin.integrations.stopSearchButton')}
                </Button>
              </div>
              {stopSearchError && <Alert variant="error">{stopSearchError}</Alert>}
              {stopSearchResults.length > 0 && (
                <ul className="integrations-view__stop-list">
                  {stopSearchResults.map((stop) => {
                    const alreadyAdded = config.transit.selectedStops.some((selected) => selected.id === stop.id)
                    return (
                      <li key={stop.id} className="integrations-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="integrations-view__icon-button"
                          disabled={alreadyAdded}
                          onClick={() => addSearchedStop(stop)}
                          aria-label={t(alreadyAdded ? 'admin.integrations.stopAddedLabel' : 'admin.integrations.stopAddButton')}
                        >
                          {alreadyAdded ? '✓' : <PlusIcon />}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}

            </>
          )}
    </AnimatedDetails>
    </div>
  )

  const enturSubmenu = (
    <div ref={enturSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={enturSubmenuOpen}
      onToggle={() => setEnturSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-entur-enabled"
            label={t('admin.integrations.enturEnableLabel')}
            checked={config.entur.enabled}
            disabled={!addressLookup?.nearbyStops.length}
            confirmMessage={t('admin.integrations.enturDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, entur: { ...config.entur, enabled: checked } })}
          />
          <FetchedLogo slug="entur" label="Entur" className="integration-submenu__icon logo-chip" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.enturBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.enturLabel')}</span>
          </span>
          <span className={`status-dot${config.entur.enabled ? ' status-dot--active' : ' status-dot--disabled'}`} title={t(config.entur.enabled ? 'admin.integrations.statusEnabled' : 'admin.integrations.statusDisabled')} />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {!addressLookup?.nearbyStops.length && <p className="integrations-view__hint">{t('admin.integrations.needsLookupHint')}</p>}
      <Button type="button" variant="secondary" onClick={() => setTransitIconsOpen(true)}>
        {t('admin.integrations.transitIconsButton')}
      </Button>
      {config.entur.enabled && (
        <>
          {config.entur.selectedStops.length > 0 && (
            <>
              <p className="integrations-view__stops-label">{t('admin.integrations.selectedStopsLabel')}</p>
              <ul className="integrations-view__stop-list">
                {config.entur.selectedStops.map((stop) => (
                  <li key={stop.id} className="integrations-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button type="button" variant="secondary" className="integrations-view__icon-button" onClick={() => toggleEnturStop(stop)} aria-label={t('admin.integrations.stopRemoveButton')}>
                      <CloseIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="integrations-view__stops-label">{t('admin.integrations.nearbyStopsLabel')}</p>
          {(() => {
            const availableNearbyStops = (addressLookup?.nearbyStops ?? []).filter((stop) => !config.entur.selectedStops.some((selected) => selected.id === stop.id))
            if (!addressLookup || addressLookup.nearbyStops.length === 0) return <p className="integrations-view__hint">{t('admin.integrations.noStopsFoundHint')}</p>
            if (availableNearbyStops.length === 0) return <p className="integrations-view__hint">{t('admin.integrations.allNearbyStopsAddedHint')}</p>
            return (
              <ul className="integrations-view__stop-list">
                {availableNearbyStops.map((stop) => (
                  <li key={stop.id} className="integrations-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button type="button" variant="secondary" className="integrations-view__icon-button" onClick={() => toggleEnturStop(stop)} aria-label={t('admin.integrations.stopAddButton')}>
                      <PlusIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )
          })()}

          <p className="integrations-view__stops-label">{t('admin.integrations.stopSearchLabel')}</p>
          <p className="integrations-view__hint">{t('admin.integrations.stopSearchHint')}</p>
          <div className="integrations-view__stop-search">
            <Input
              id="integrations-entur-stop-search-query"
              label={t('admin.integrations.stopSearchLabel')}
              value={stopSearchQuery}
              onChange={(event) => handleStopSearchQueryChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSearchStops()}
            />
            <Button type="button" variant="secondary" onClick={handleSearchStops} disabled={!stopSearchQuery.trim() || isSearchingStops}>
              {isSearchingStops ? t('admin.integrations.lookupButtonLoading') : t('admin.integrations.stopSearchButton')}
            </Button>
          </div>
          {stopSearchError && <Alert variant="error">{stopSearchError}</Alert>}
          {stopSearchResults.length > 0 && (
            <ul className="integrations-view__stop-list">
              {stopSearchResults.map((stop) => {
                const alreadyAdded = config.entur.selectedStops.some((selected) => selected.id === stop.id)
                return (
                  <li key={stop.id} className="integrations-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="integrations-view__icon-button"
                      disabled={alreadyAdded}
                      onClick={() => addSearchedEnturStop(stop)}
                      aria-label={t(alreadyAdded ? 'admin.integrations.stopAddedLabel' : 'admin.integrations.stopAddButton')}
                    >
                      {alreadyAdded ? '✓' : <PlusIcon />}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

        </>
      )}
    </AnimatedDetails>
    </div>
  )

  const toggleNewsSource = (sourceId: string) => {
    const isEnabled = config.news.enabledSourceIds.includes(sourceId)
    const enabledSourceIds = isEnabled ? config.news.enabledSourceIds.filter((id) => id !== sourceId) : [...config.news.enabledSourceIds, sourceId]
    setConfig({ ...config, news: { ...config.news, enabledSourceIds } })
  }

  const newsSubmenu = (
    <div ref={newsSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={newsSubmenuOpen}
      onToggle={() => setNewsSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-news-enabled"
            label={t('admin.integrations.newsEnableLabel')}
            checked={config.news.enabled}
            disabled={config.news.enabledSourceIds.length === 0}
            confirmMessage={t('admin.integrations.newsDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, news: { ...config.news, enabled: checked } })}
          />
          <FetchedLogo slug="rss" label="RSS" className="integration-submenu__icon" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.newsBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.newsLabel')}</span>
          </span>
          <span
            className={`status-dot${config.news.enabled ? ' status-dot--active' : ' status-dot--disabled'}`}
            title={t(config.news.enabled ? 'admin.integrations.statusEnabled' : 'admin.integrations.statusDisabled')}
          />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      <p className="integrations-view__hint">{t('admin.integrations.newsEnabledDescription')}</p>
      {config.news.enabledSourceIds.length === 0 && <p className="integrations-view__hint">{t('admin.integrations.newsNeedsSourceHint')}</p>}
      <p className="integrations-view__stops-label">{t('admin.integrations.newsSourcesLabel')}</p>
      <ul className="integrations-view__stop-list">
        {NEWS_SOURCES.map((source) => (
          <li key={source.id} ref={registerNewsSourceRef(source.id)}>
            <Checkbox
              id={`integrations-news-source-${source.id}`}
              label={source.name}
              checked={config.news.enabledSourceIds.includes(source.id)}
              onChange={() => toggleNewsSource(source.id)}
            />
          </li>
        ))}
      </ul>
    </AnimatedDetails>
    </div>
  )

  // Forces the dot/label to read "disabled" while the toggle itself is off,
  // regardless of whatever `status.state` was last reported before it was
  // switched off — same posture as `computeWeatherStatus` above, so a stale
  // "live" reading from before a disable doesn't linger and mislead.
  //
  // Unlike Weather/Transit, the toggle itself is never gated off (an admin
  // can turn Wolt on before saving credentials) — enabled-but-uncredentialed
  // is its own yellow state instead, since that's the expected state right
  // after flipping it on but before pasting in real values.
  const woltMissingCredentials = woltConfig.enabled && !hasSavedWoltCredentials
  const woltEffectiveState = !woltConfig.enabled ? 'disabled' : woltMissingCredentials ? 'stale' : woltConfig.status.state
  const woltStatusDotClass =
    woltEffectiveState === 'live'
      ? 'status-dot--active'
      : woltEffectiveState === 'stale'
        ? 'status-dot--stale'
        : woltEffectiveState === 'error'
          ? 'status-dot--inactive'
          : 'status-dot--disabled'
  const woltStatusTitleKey = woltMissingCredentials
    ? 'admin.integrations.woltNeedsCredentialsHint'
    : woltEffectiveState === 'live'
      ? 'admin.integrations.statusEnabled'
      : woltEffectiveState === 'stale'
        ? 'admin.integrations.statusStale'
        : woltEffectiveState === 'error'
          ? 'admin.integrations.statusError'
          : 'admin.integrations.statusDisabled'
  const woltStatusLabelKey = woltMissingCredentials
    ? 'admin.integrations.woltStatusMissingCredentials'
    : woltEffectiveState === 'live'
      ? 'admin.integrations.woltStatusLive'
      : woltEffectiveState === 'stale'
        ? 'admin.integrations.woltStatusStale'
        : woltEffectiveState === 'error'
          ? 'admin.integrations.woltStatusError'
          : 'admin.integrations.woltStatusDisabled'

  const woltSubmenu = (
    <div ref={woltSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={woltSubmenuOpen}
      onToggle={() => setWoltSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-wolt-enabled"
            label={t('admin.integrations.woltEnableLabel')}
            checked={woltConfig.enabled}
            confirmMessage={t('admin.integrations.woltDeactivateConfirm')}
            onChange={(checked) => setWoltConfig({ ...woltConfig, enabled: checked })}
          />
          <FetchedLogo slug="wolt" label="Wolt" className="integration-submenu__icon" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.woltBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.woltLabel')}</span>
          </span>
          <span
            className={`status-dot ${woltStatusDotClass}`}
            title={!woltMissingCredentials && woltEffectiveState === 'error' && woltConfig.status.detail ? woltConfig.status.detail : t(woltStatusTitleKey)}
          />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      <p className="integrations-view__hint">{t('admin.integrations.woltEnabledDescription')}</p>
      {!hasSavedWoltCredentials && <p className="integrations-view__hint">{t('admin.integrations.woltNeedsCredentialsHint')}</p>}

      <Input
        id="integrations-wolt-venue-id"
        label={t('admin.integrations.woltVenueIdLabel')}
        value={woltVenueIdDraft}
        onChange={(event) => setWoltVenueIdDraft(event.target.value)}
      />
      <Input
        id="integrations-wolt-api-key"
        type="password"
        label={t('admin.integrations.woltApiKeyLabel')}
        value={woltApiKeyDraft}
        onChange={(event) => setWoltApiKeyDraft(event.target.value)}
      />
      <p className="integrations-view__hint">{t('admin.integrations.woltCredentialsHint')}</p>
      {woltCredentialsError && <Alert variant="error">{woltCredentialsError}</Alert>}
      <Button type="button" variant="secondary" onClick={handleSaveWoltCredentials} disabled={isSavingWoltCredentials || (!woltVenueIdDraft.trim() && !woltApiKeyDraft.trim())}>
        {isSavingWoltCredentials ? t('admin.integrations.woltCredentialsSavingButton') : t('admin.integrations.woltCredentialsSaveButton')}
      </Button>

      <div className="integrations-view__delivery-status">
        <p className="integrations-view__stops-label">{t('admin.integrations.woltStatusSectionTitle')}</p>
        <span>
          {t('admin.integrations.woltStatusLabel')}: {t(woltStatusLabelKey)}
        </span>
        {woltConfig.status.updatedAt > 0 && (
          <span>
            {t('admin.integrations.woltLastSyncedLabel')}: {formatDateTime(new Date(woltConfig.status.updatedAt), language, clockFormat, dateFormat)}
          </span>
        )}
        {woltConfig.status.state === 'error' && woltConfig.status.detail && (
          <span className="integrations-view__delivery-status-detail">
            {t('admin.integrations.woltLastErrorLabel')}: {woltConfig.status.detail}
          </span>
        )}
        <span>
          {t('admin.integrations.woltOrdersSyncedLabel')}: {woltOrders.length}
        </span>
        {woltConfig.status.lastOrderAt && (
          <span>
            {t('admin.integrations.woltLastOrderLabel')}: {formatDateTime(new Date(woltConfig.status.lastOrderAt), language, clockFormat, dateFormat)}
          </span>
        )}
        <span className="integrations-view__hint">{t('admin.integrations.woltPollIntervalHint')}</span>
      </div>

      {woltSyncError && <Alert variant="error">{woltSyncError}</Alert>}
      <Button type="button" variant="secondary" onClick={handleSyncWoltNow} disabled={isSyncingWolt || !hasSavedWoltCredentials}>
        {isSyncingWolt ? t('admin.integrations.woltSyncingLabel') : t('admin.integrations.woltSyncNowButton')}
      </Button>
    </AnimatedDetails>
    </div>
  )

  // Same derivation as Wolt's own status above.
  const foodoraMissingCredentials = foodoraConfig.enabled && !hasSavedFoodoraCredentials
  const foodoraEffectiveState = !foodoraConfig.enabled ? 'disabled' : foodoraMissingCredentials ? 'stale' : foodoraConfig.status.state
  const foodoraStatusDotClass =
    foodoraEffectiveState === 'live'
      ? 'status-dot--active'
      : foodoraEffectiveState === 'stale'
        ? 'status-dot--stale'
        : foodoraEffectiveState === 'error'
          ? 'status-dot--inactive'
          : 'status-dot--disabled'
  const foodoraStatusTitleKey = foodoraMissingCredentials
    ? 'admin.integrations.foodoraNeedsCredentialsHint'
    : foodoraEffectiveState === 'live'
      ? 'admin.integrations.statusEnabled'
      : foodoraEffectiveState === 'stale'
        ? 'admin.integrations.statusStale'
        : foodoraEffectiveState === 'error'
          ? 'admin.integrations.statusError'
          : 'admin.integrations.statusDisabled'
  const foodoraStatusLabelKey = foodoraMissingCredentials
    ? 'admin.integrations.foodoraStatusMissingCredentials'
    : foodoraEffectiveState === 'live'
      ? 'admin.integrations.foodoraStatusLive'
      : foodoraEffectiveState === 'stale'
        ? 'admin.integrations.foodoraStatusStale'
        : foodoraEffectiveState === 'error'
          ? 'admin.integrations.foodoraStatusError'
          : 'admin.integrations.foodoraStatusDisabled'

  const foodoraSubmenu = (
    <div ref={foodoraSubmenuRef}>
    <AnimatedDetails
      className="integration-submenu"
      summaryClassName="integration-submenu__summary"
      bodyClassName="integration-submenu__body"
      open={foodoraSubmenuOpen}
      onToggle={() => setFoodoraSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="integrations-foodora-enabled"
            label={t('admin.integrations.foodoraEnableLabel')}
            checked={foodoraConfig.enabled}
            confirmMessage={t('admin.integrations.foodoraDeactivateConfirm')}
            onChange={(checked) => setFoodoraConfig({ ...foodoraConfig, enabled: checked })}
          />
          <FetchedLogo slug="foodora" label="Foodora" className="integration-submenu__icon" />
          <span className="integration-submenu__title">
            <span className="integration-submenu__brand">{t('admin.integrations.foodoraBrandName')}</span>
            <span className="integration-submenu__label">{t('admin.integrations.foodoraLabel')}</span>
          </span>
          <span
            className={`status-dot ${foodoraStatusDotClass}`}
            title={!foodoraMissingCredentials && foodoraEffectiveState === 'error' && foodoraConfig.status.detail ? foodoraConfig.status.detail : t(foodoraStatusTitleKey)}
          />
          <span className="integration-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      <p className="integrations-view__hint">{t('admin.integrations.foodoraEnabledDescription')}</p>
      {!hasSavedFoodoraCredentials && <p className="integrations-view__hint">{t('admin.integrations.foodoraNeedsCredentialsHint')}</p>}

      <Input
        id="integrations-foodora-venue-id"
        label={t('admin.integrations.foodoraVenueIdLabel')}
        value={foodoraVenueIdDraft}
        onChange={(event) => setFoodoraVenueIdDraft(event.target.value)}
      />
      <Input
        id="integrations-foodora-api-key"
        type="password"
        label={t('admin.integrations.foodoraApiKeyLabel')}
        value={foodoraApiKeyDraft}
        onChange={(event) => setFoodoraApiKeyDraft(event.target.value)}
      />
      <p className="integrations-view__hint">{t('admin.integrations.foodoraCredentialsHint')}</p>
      {foodoraCredentialsError && <Alert variant="error">{foodoraCredentialsError}</Alert>}
      <Button type="button" variant="secondary" onClick={handleSaveFoodoraCredentials} disabled={isSavingFoodoraCredentials || (!foodoraVenueIdDraft.trim() && !foodoraApiKeyDraft.trim())}>
        {isSavingFoodoraCredentials ? t('admin.integrations.foodoraCredentialsSavingButton') : t('admin.integrations.foodoraCredentialsSaveButton')}
      </Button>

      <div className="integrations-view__delivery-status">
        <p className="integrations-view__stops-label">{t('admin.integrations.foodoraStatusSectionTitle')}</p>
        <span>
          {t('admin.integrations.foodoraStatusLabel')}: {t(foodoraStatusLabelKey)}
        </span>
        {foodoraConfig.status.updatedAt > 0 && (
          <span>
            {t('admin.integrations.foodoraLastSyncedLabel')}: {formatDateTime(new Date(foodoraConfig.status.updatedAt), language, clockFormat, dateFormat)}
          </span>
        )}
        {foodoraConfig.status.state === 'error' && foodoraConfig.status.detail && (
          <span className="integrations-view__delivery-status-detail">
            {t('admin.integrations.foodoraLastErrorLabel')}: {foodoraConfig.status.detail}
          </span>
        )}
        <span>
          {t('admin.integrations.foodoraOrdersSyncedLabel')}: {foodoraOrders.length}
        </span>
        {foodoraConfig.status.lastOrderAt && (
          <span>
            {t('admin.integrations.foodoraLastOrderLabel')}: {formatDateTime(new Date(foodoraConfig.status.lastOrderAt), language, clockFormat, dateFormat)}
          </span>
        )}
        <span className="integrations-view__hint">{t('admin.integrations.foodoraPollIntervalHint')}</span>
      </div>

      {foodoraSyncError && <Alert variant="error">{foodoraSyncError}</Alert>}
      <Button type="button" variant="secondary" onClick={handleSyncFoodoraNow} disabled={isSyncingFoodora || !hasSavedFoodoraCredentials}>
        {isSyncingFoodora ? t('admin.integrations.foodoraSyncingLabel') : t('admin.integrations.foodoraSyncNowButton')}
      </Button>
    </AnimatedDetails>
    </div>
  )

  return (
    <div className="integrations-view">
      <div className="integrations-view__header">
        <div>
          <div className="integrations-view__sub-header">
            <BackButton onClick={onBack}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.integrations.title" />
          </div>
          <TranslatedText as="p" id="admin.integrations.description" className="admin-page-description" />
        </div>
        <IntegrationSearchBar value={searchQuery} onChange={handleSearchQueryChange} />
      </div>

      <SlideTransition viewKey={isSearching ? 'search' : 'main'} direction={searchDirection}>
        {isSearching ? (
          <IntegrationSearchResults query={searchQuery} config={config} />
        ) : (
          <div className="integrations-view__main">
            <div className="integrations-view__lookup">
              <Button variant="secondary" onClick={handleLookupAddress} disabled={isLookingUp}>
                {isLookingUp ? t('admin.integrations.lookupButtonLoading') : t('admin.integrations.lookupButton')}
              </Button>
              {addressLookup?.coordinates && <span className="integrations-view__coordinates">{t('admin.integrations.coordinatesLabel', { lat: addressLookup.coordinates.lat.toFixed(4), lon: addressLookup.coordinates.lon.toFixed(4) })}</span>}
            </div>

            {lookupError && <Alert variant="error">{lookupError}</Alert>}
            {!lookupError && isStale && <Alert variant="warning">{t('admin.integrations.addressChangedNotice')}</Alert>}
            {!lookupError && !addressLookup && <Alert variant="info">{t('admin.integrations.noLookupYetHint')}</Alert>}

            <section className="integrations-view__category">
              <h2>{t('admin.integrations.activatedSectionTitle')}</h2>
              {config.weather.enabled && weatherSubmenu}
              {config.transit.enabled && transitSubmenu}
              {config.entur.enabled && enturSubmenu}
              {config.news.enabled && newsSubmenu}
              {woltConfig.enabled && woltSubmenu}
              {foodoraConfig.enabled && foodoraSubmenu}
              {!config.weather.enabled && !config.transit.enabled && !config.entur.enabled && !config.news.enabled && !woltConfig.enabled && !foodoraConfig.enabled && (
                <p className="integrations-view__hint">{t('admin.integrations.activatedEmptyHint')}</p>
              )}
            </section>

            <section className="integrations-view__category">
              <h2>{t('admin.integrations.availableSectionTitle')}</h2>
              {!config.weather.enabled && weatherSubmenu}
              {!config.transit.enabled && transitSubmenu}
              {!config.entur.enabled && enturSubmenu}
              {!config.news.enabled && newsSubmenu}
              {!woltConfig.enabled && woltSubmenu}
              {!foodoraConfig.enabled && foodoraSubmenu}
              {config.weather.enabled && config.transit.enabled && config.entur.enabled && config.news.enabled && woltConfig.enabled && foodoraConfig.enabled && (
                <p className="integrations-view__hint">{t('admin.integrations.availableEmptyHint')}</p>
              )}
            </section>

            <ComingSoonSection />
          </div>
        )}
      </SlideTransition>

      <Modal open={transitIconsOpen} onClose={() => setTransitIconsOpen(false)} title={t('admin.integrations.transitIconsTitle')} transparentOnSliderDrag={false}>
        <ul className="integrations-view__mode-icons">
          {TRANSIT_MODES.map(({ mode, labelKey }) => (
            <li key={mode} className="integrations-view__mode-icon-item">
              <TransitModeIcon mode={mode} className="integrations-view__mode-icon" />
              <span>{t(labelKey)}</span>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={weatherIconsOpen} onClose={() => setWeatherIconsOpen(false)} title={t('admin.integrations.weatherIconsTitle')} transparentOnSliderDrag={false}>
        <ul className="integrations-view__mode-icons">
          {WEATHER_SYMBOLS.map(({ code, labelKey }) => (
            <li key={code} className="integrations-view__mode-icon-item">
              <WeatherSymbolIcon symbolCode={code} className="integrations-view__mode-icon" />
              <span>{t(labelKey)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
