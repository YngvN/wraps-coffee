import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, CloseIcon, FetchedLogo, Input, Modal, PlusIcon, SlideTransition, TranslatedText, YrLogo } from '../../../components'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useExtensionsConfig } from '../../../hooks/useExtensionsConfig'
import { useLanguage } from '../../../i18n'
import { lookupAddress, searchStops } from '../../../lib/localServer'
import type { ExtensionsConfig, NearbyStop, WeatherLocation } from '../../../types/extensions'
import { TransitModeIcon } from '../../screens/TransitModeIcon'
import { generateId } from '../../../utils/id'
import { TRANSIT_MODES } from '../../../utils/transitModes'
import { weatherLocationKey } from '../../../utils/weatherLocationKey'
import { weatherSymbolToEmoji } from '../../../utils/weatherSymbols'
import { ActivationToggle } from './ActivationToggle'
import { AnimatedDetails } from './AnimatedDetails'
import { ComingSoonSection } from './ComingSoonSection'
import { ExtensionSearchBar } from './ExtensionSearchBar'
import { ExtensionSearchResults } from './ExtensionSearchResults'
import './ExtensionsView.scss'

/** Every base symbol code `weatherSymbolToEmoji` recognizes (i.e. every key of its own `WEATHER_EMOJI` map), paired with its own i18n label — shown as a legend in the "View weather icons" modal so the admin can see what each emoji on a live forecast slide means. Yr appends `_day`/`_night`/`_polartwilight` to these at runtime; the legend shows the base (daytime) glyph since the emoji itself doesn't change by time of day. */
const WEATHER_SYMBOLS: { code: string; labelKey: string }[] = [
  { code: 'clearsky', labelKey: 'admin.extensions.weatherSymbolClearsky' },
  { code: 'fair', labelKey: 'admin.extensions.weatherSymbolFair' },
  { code: 'partlycloudy', labelKey: 'admin.extensions.weatherSymbolPartlycloudy' },
  { code: 'cloudy', labelKey: 'admin.extensions.weatherSymbolCloudy' },
  { code: 'fog', labelKey: 'admin.extensions.weatherSymbolFog' },
  { code: 'rainshowers', labelKey: 'admin.extensions.weatherSymbolRainshowers' },
  { code: 'rainshowersandthunder', labelKey: 'admin.extensions.weatherSymbolRainshowersandthunder' },
  { code: 'sleetshowers', labelKey: 'admin.extensions.weatherSymbolSleetshowers' },
  { code: 'snowshowers', labelKey: 'admin.extensions.weatherSymbolSnowshowers' },
  { code: 'rain', labelKey: 'admin.extensions.weatherSymbolRain' },
  { code: 'heavyrain', labelKey: 'admin.extensions.weatherSymbolHeavyrain' },
  { code: 'lightrain', labelKey: 'admin.extensions.weatherSymbolLightrain' },
  { code: 'rainandthunder', labelKey: 'admin.extensions.weatherSymbolRainandthunder' },
  { code: 'sleet', labelKey: 'admin.extensions.weatherSymbolSleet' },
  { code: 'snow', labelKey: 'admin.extensions.weatherSymbolSnow' },
  { code: 'lightsnow', labelKey: 'admin.extensions.weatherSymbolLightsnow' },
  { code: 'heavysnow', labelKey: 'admin.extensions.weatherSymbolHeavysnow' },
  { code: 'snowandthunder', labelKey: 'admin.extensions.weatherSymbolSnowandthunder' },
  { code: 'sleetshowersandthunder', labelKey: 'admin.extensions.weatherSymbolSleetshowersandthunder' },
  { code: 'snowshowersandthunder', labelKey: 'admin.extensions.weatherSymbolSnowshowersandthunder' },
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
function computeWeatherStatus(config: ExtensionsConfig): WeatherStatus {
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
 * nearby stops through the local server's `/extensions/lookup` proxy; the
 * result (coordinates + candidate stops) is cached in the synced
 * `admin.extensions` config so every device sees the same options without
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
 * The search bar at the top matches every live/coming-soon extension by
 * name, description, category and tags (see `ExtensionSearchResults.tsx`)
 * and swaps in for the rest of the page's own content — lookup section,
 * categories, and the "Coming soon" directory — via `SlideTransition`, the
 * same slide-in-from-the-right treatment `SettingsView` uses for its own
 * sub-views.
 */
export function ExtensionsView() {
  const { t } = useLanguage()
  const [contactInfo] = useContactInfo()
  const [config, setConfig] = useExtensionsConfig()
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
  const [weatherSubmenuOpen, setWeatherSubmenuOpen] = useState(true)
  const [transitSubmenuOpen, setTransitSubmenuOpen] = useState(true)
  const [enturSubmenuOpen, setEnturSubmenuOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  /** `1` once the search bar has text (results slide in from the right), `-1` once it's cleared back to empty (sliding back to the normal view) — same convention `SettingsView` uses for its own sub-views. */
  const [searchDirection, setSearchDirection] = useState<1 | -1>(1)

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
      .catch(() => setLookupError(t('admin.extensions.lookupError')))
      .finally(() => setIsLookingUp(false))
  }

  const toggleStop = (stop: NearbyStop) => {
    const isSelected = config.transit.selectedStops.some((selected) => selected.id === stop.id)
    const selectedStops = isSelected ? config.transit.selectedStops.filter((selected) => selected.id !== stop.id) : [...config.transit.selectedStops, stop]
    setConfig({ ...config, transit: { ...config.transit, selectedStops } })
  }

  /** Entur's own stop pool, deliberately independent of Ruter's `config.transit.selectedStops` — see the doc comment on `ExtensionsConfig['entur']`. */
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
      .catch(() => setStopSearchError(t('admin.extensions.stopSearchError')))
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
      .catch(() => setLocationLookupError(t('admin.extensions.lookupError')))
      .finally(() => setLookingUpLocationId(null))
  }

  const weatherStatus = computeWeatherStatus(config)
  const weatherStatusDotClass =
    weatherStatus === 'live' ? 'status-dot--active' : weatherStatus === 'stale' ? 'status-dot--stale' : weatherStatus === 'error' ? 'status-dot--inactive' : 'status-dot--disabled'
  const weatherStatusTitleKey =
    weatherStatus === 'live'
      ? 'admin.extensions.statusEnabled'
      : weatherStatus === 'stale'
        ? 'admin.extensions.statusStale'
        : weatherStatus === 'error'
          ? 'admin.extensions.statusError'
          : 'admin.extensions.statusDisabled'

  const weatherSubmenu = (
    <AnimatedDetails
      className="extension-submenu"
      summaryClassName="extension-submenu__summary"
      bodyClassName="extension-submenu__body"
      open={weatherSubmenuOpen}
      onToggle={() => setWeatherSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="extensions-weather-enabled"
            label={t('admin.extensions.weatherEnableLabel')}
            checked={config.weather.enabled}
            disabled={!hasWeatherCoordinates}
            confirmMessage={t('admin.extensions.weatherDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, weather: { ...config.weather, enabled: checked } })}
          />
          <YrLogo className="extension-submenu__icon" />
          <span className="extension-submenu__title">
            <span className="extension-submenu__brand">{t('admin.extensions.weatherBrandName')}</span>
            <span className="extension-submenu__label">{t('admin.extensions.weatherLabel')}</span>
          </span>
          <span className={`status-dot ${weatherStatusDotClass}`} title={t(weatherStatusTitleKey)} />
          <span className="extension-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {config.weather.useStoreLocation && !addressLookup?.coordinates && <p className="extensions-view__hint">{t('admin.extensions.needsLookupHint')}</p>}
      <p className="extensions-view__hint">{t('admin.extensions.weatherEnabledDescription')}</p>
      <Button type="button" variant="secondary" onClick={() => setWeatherIconsOpen(true)}>
        {t('admin.extensions.weatherIconsButton')}
      </Button>

      <Checkbox
        id="extensions-weather-use-store-location"
        label={t('admin.extensions.weatherUseStoreLocationLabel')}
        checked={config.weather.useStoreLocation}
        onChange={(event) => setConfig({ ...config, weather: { ...config.weather, useStoreLocation: event.target.checked } })}
      />

      {config.weather.locations.length > 0 && (
        <ul className="extensions-view__location-list">
          {config.weather.locations.map((location) => (
            <li key={location.id} className="extensions-view__location-row">
              <Input
                id={`extensions-weather-location-name-${location.id}`}
                label={t('admin.extensions.weatherLocationNameLabel')}
                value={location.name}
                onChange={(event) => updateWeatherLocation(location.id, { name: event.target.value })}
              />
              <Input
                id={`extensions-weather-location-address-${location.id}`}
                label={t('admin.extensions.weatherLocationAddressLabel')}
                value={location.address}
                onChange={(event) => updateWeatherLocation(location.id, { address: event.target.value, coordinates: null })}
              />
              <div className="extensions-view__location-row-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleLookupWeatherLocation(location.id, location.address)}
                  disabled={!location.address.trim() || lookingUpLocationId === location.id}
                >
                  {lookingUpLocationId === location.id ? t('admin.extensions.lookupButtonLoading') : t('admin.extensions.weatherLocationLookupButton')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => removeWeatherLocation(location.id)}>
                  {t('admin.extensions.weatherLocationRemoveButton')}
                </Button>
              </div>
              {location.coordinates && (
                <span className="extensions-view__coordinates">
                  {t('admin.extensions.coordinatesLabel', { lat: location.coordinates.lat.toFixed(4), lon: location.coordinates.lon.toFixed(4) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {locationLookupError && <Alert variant="error">{locationLookupError}</Alert>}
      <Button type="button" variant="secondary" className="extensions-view__add-location" onClick={addWeatherLocation}>
        {t('admin.extensions.weatherAddLocationButton')}
      </Button>
    </AnimatedDetails>
  )

  const transitSubmenu = (
    <AnimatedDetails
      className="extension-submenu"
      summaryClassName="extension-submenu__summary"
      bodyClassName="extension-submenu__body"
      open={transitSubmenuOpen}
      onToggle={() => setTransitSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="extensions-transit-enabled"
            label={t('admin.extensions.transitEnableLabel')}
            checked={config.transit.enabled}
            disabled={!addressLookup?.nearbyStops.length}
            confirmMessage={t('admin.extensions.transitDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, transit: { ...config.transit, enabled: checked } })}
          />
          <FetchedLogo slug="ruter" label="Ruter#" className="extension-submenu__icon" />
          <span className="extension-submenu__title">
            <span className="extension-submenu__brand">{t('admin.extensions.transitBrandName')}</span>
            <span className="extension-submenu__label">{t('admin.extensions.transitLabel')}</span>
          </span>
          <span className={`status-dot${config.transit.enabled ? ' status-dot--active' : ' status-dot--disabled'}`} title={t(config.transit.enabled ? 'admin.extensions.statusEnabled' : 'admin.extensions.statusDisabled')} />
          <span className="extension-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {!addressLookup?.nearbyStops.length && <p className="extensions-view__hint">{t('admin.extensions.needsLookupHint')}</p>}
      <Button type="button" variant="secondary" onClick={() => setTransitIconsOpen(true)}>
            {t('admin.extensions.transitIconsButton')}
          </Button>
          {config.transit.enabled && (
            <>
              {config.transit.selectedStops.length > 0 && (
                <>
                  <p className="extensions-view__stops-label">{t('admin.extensions.selectedStopsLabel')}</p>
                  <ul className="extensions-view__stop-list">
                    {config.transit.selectedStops.map((stop) => (
                      <li key={stop.id} className="extensions-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button type="button" variant="secondary" className="extensions-view__icon-button" onClick={() => toggleStop(stop)} aria-label={t('admin.extensions.stopRemoveButton')}>
                          <CloseIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="extensions-view__stops-label">{t('admin.extensions.nearbyStopsLabel')}</p>
              {(() => {
                const availableNearbyStops = (addressLookup?.nearbyStops ?? []).filter((stop) => !config.transit.selectedStops.some((selected) => selected.id === stop.id))
                if (!addressLookup || addressLookup.nearbyStops.length === 0) return <p className="extensions-view__hint">{t('admin.extensions.noStopsFoundHint')}</p>
                if (availableNearbyStops.length === 0) return <p className="extensions-view__hint">{t('admin.extensions.allNearbyStopsAddedHint')}</p>
                return (
                  <ul className="extensions-view__stop-list">
                    {availableNearbyStops.map((stop) => (
                      <li key={stop.id} className="extensions-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button type="button" variant="secondary" className="extensions-view__icon-button" onClick={() => toggleStop(stop)} aria-label={t('admin.extensions.stopAddButton')}>
                          <PlusIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              })()}

              <p className="extensions-view__stops-label">{t('admin.extensions.stopSearchLabel')}</p>
              <p className="extensions-view__hint">{t('admin.extensions.stopSearchHint')}</p>
              <div className="extensions-view__stop-search">
                <Input
                  id="extensions-transit-stop-search-query"
                  label={t('admin.extensions.stopSearchLabel')}
                  value={stopSearchQuery}
                  onChange={(event) => handleStopSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearchStops()}
                />
                <Button type="button" variant="secondary" onClick={handleSearchStops} disabled={!stopSearchQuery.trim() || isSearchingStops}>
                  {isSearchingStops ? t('admin.extensions.lookupButtonLoading') : t('admin.extensions.stopSearchButton')}
                </Button>
              </div>
              {stopSearchError && <Alert variant="error">{stopSearchError}</Alert>}
              {stopSearchResults.length > 0 && (
                <ul className="extensions-view__stop-list">
                  {stopSearchResults.map((stop) => {
                    const alreadyAdded = config.transit.selectedStops.some((selected) => selected.id === stop.id)
                    return (
                      <li key={stop.id} className="extensions-view__stop-search-result">
                        <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="extensions-view__icon-button"
                          disabled={alreadyAdded}
                          onClick={() => addSearchedStop(stop)}
                          aria-label={t(alreadyAdded ? 'admin.extensions.stopAddedLabel' : 'admin.extensions.stopAddButton')}
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
  )

  const enturSubmenu = (
    <AnimatedDetails
      className="extension-submenu"
      summaryClassName="extension-submenu__summary"
      bodyClassName="extension-submenu__body"
      open={enturSubmenuOpen}
      onToggle={() => setEnturSubmenuOpen((current) => !current)}
      summary={
        <>
          <ActivationToggle
            id="extensions-entur-enabled"
            label={t('admin.extensions.enturEnableLabel')}
            checked={config.entur.enabled}
            disabled={!addressLookup?.nearbyStops.length}
            confirmMessage={t('admin.extensions.enturDeactivateConfirm')}
            onChange={(checked) => setConfig({ ...config, entur: { ...config.entur, enabled: checked } })}
          />
          <FetchedLogo slug="entur" label="Entur" className="extension-submenu__icon logo-chip" />
          <span className="extension-submenu__title">
            <span className="extension-submenu__brand">{t('admin.extensions.enturBrandName')}</span>
            <span className="extension-submenu__label">{t('admin.extensions.enturLabel')}</span>
          </span>
          <span className={`status-dot${config.entur.enabled ? ' status-dot--active' : ' status-dot--disabled'}`} title={t(config.entur.enabled ? 'admin.extensions.statusEnabled' : 'admin.extensions.statusDisabled')} />
          <span className="extension-submenu__chevron" aria-hidden="true">
            ▸
          </span>
        </>
      }
    >
      {!addressLookup?.nearbyStops.length && <p className="extensions-view__hint">{t('admin.extensions.needsLookupHint')}</p>}
      <Button type="button" variant="secondary" onClick={() => setTransitIconsOpen(true)}>
        {t('admin.extensions.transitIconsButton')}
      </Button>
      {config.entur.enabled && (
        <>
          {config.entur.selectedStops.length > 0 && (
            <>
              <p className="extensions-view__stops-label">{t('admin.extensions.selectedStopsLabel')}</p>
              <ul className="extensions-view__stop-list">
                {config.entur.selectedStops.map((stop) => (
                  <li key={stop.id} className="extensions-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button type="button" variant="secondary" className="extensions-view__icon-button" onClick={() => toggleEnturStop(stop)} aria-label={t('admin.extensions.stopRemoveButton')}>
                      <CloseIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="extensions-view__stops-label">{t('admin.extensions.nearbyStopsLabel')}</p>
          {(() => {
            const availableNearbyStops = (addressLookup?.nearbyStops ?? []).filter((stop) => !config.entur.selectedStops.some((selected) => selected.id === stop.id))
            if (!addressLookup || addressLookup.nearbyStops.length === 0) return <p className="extensions-view__hint">{t('admin.extensions.noStopsFoundHint')}</p>
            if (availableNearbyStops.length === 0) return <p className="extensions-view__hint">{t('admin.extensions.allNearbyStopsAddedHint')}</p>
            return (
              <ul className="extensions-view__stop-list">
                {availableNearbyStops.map((stop) => (
                  <li key={stop.id} className="extensions-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button type="button" variant="secondary" className="extensions-view__icon-button" onClick={() => toggleEnturStop(stop)} aria-label={t('admin.extensions.stopAddButton')}>
                      <PlusIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )
          })()}

          <p className="extensions-view__stops-label">{t('admin.extensions.stopSearchLabel')}</p>
          <p className="extensions-view__hint">{t('admin.extensions.stopSearchHint')}</p>
          <div className="extensions-view__stop-search">
            <Input
              id="extensions-entur-stop-search-query"
              label={t('admin.extensions.stopSearchLabel')}
              value={stopSearchQuery}
              onChange={(event) => handleStopSearchQueryChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSearchStops()}
            />
            <Button type="button" variant="secondary" onClick={handleSearchStops} disabled={!stopSearchQuery.trim() || isSearchingStops}>
              {isSearchingStops ? t('admin.extensions.lookupButtonLoading') : t('admin.extensions.stopSearchButton')}
            </Button>
          </div>
          {stopSearchError && <Alert variant="error">{stopSearchError}</Alert>}
          {stopSearchResults.length > 0 && (
            <ul className="extensions-view__stop-list">
              {stopSearchResults.map((stop) => {
                const alreadyAdded = config.entur.selectedStops.some((selected) => selected.id === stop.id)
                return (
                  <li key={stop.id} className="extensions-view__stop-search-result">
                    <span>{stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="extensions-view__icon-button"
                      disabled={alreadyAdded}
                      onClick={() => addSearchedEnturStop(stop)}
                      aria-label={t(alreadyAdded ? 'admin.extensions.stopAddedLabel' : 'admin.extensions.stopAddButton')}
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
  )

  return (
    <div className="extensions-view">
      <div className="extensions-view__header">
        <div>
          <TranslatedText as="h1" id="admin.extensions.title" />
          <TranslatedText as="p" id="admin.extensions.description" className="admin-page-description" />
        </div>
        <ExtensionSearchBar value={searchQuery} onChange={handleSearchQueryChange} />
      </div>

      <SlideTransition viewKey={isSearching ? 'search' : 'main'} direction={searchDirection}>
        {isSearching ? (
          <ExtensionSearchResults query={searchQuery} config={config} />
        ) : (
          <div className="extensions-view__main">
            <div className="extensions-view__lookup">
              <Button variant="secondary" onClick={handleLookupAddress} disabled={isLookingUp}>
                {isLookingUp ? t('admin.extensions.lookupButtonLoading') : t('admin.extensions.lookupButton')}
              </Button>
              {addressLookup?.coordinates && <span className="extensions-view__coordinates">{t('admin.extensions.coordinatesLabel', { lat: addressLookup.coordinates.lat.toFixed(4), lon: addressLookup.coordinates.lon.toFixed(4) })}</span>}
            </div>

            {lookupError && <Alert variant="error">{lookupError}</Alert>}
            {!lookupError && isStale && <Alert variant="warning">{t('admin.extensions.addressChangedNotice')}</Alert>}
            {!lookupError && !addressLookup && <Alert variant="info">{t('admin.extensions.noLookupYetHint')}</Alert>}

            <section className="extensions-view__category">
              <h2>{t('admin.extensions.activatedSectionTitle')}</h2>
              {config.weather.enabled && weatherSubmenu}
              {config.transit.enabled && transitSubmenu}
              {config.entur.enabled && enturSubmenu}
              {!config.weather.enabled && !config.transit.enabled && !config.entur.enabled && <p className="extensions-view__hint">{t('admin.extensions.activatedEmptyHint')}</p>}
            </section>

            <section className="extensions-view__category">
              <h2>{t('admin.extensions.availableSectionTitle')}</h2>
              {!config.weather.enabled && weatherSubmenu}
              {!config.transit.enabled && transitSubmenu}
              {!config.entur.enabled && enturSubmenu}
              {config.weather.enabled && config.transit.enabled && config.entur.enabled && <p className="extensions-view__hint">{t('admin.extensions.availableEmptyHint')}</p>}
            </section>

            <ComingSoonSection />
          </div>
        )}
      </SlideTransition>

      <Modal open={transitIconsOpen} onClose={() => setTransitIconsOpen(false)} title={t('admin.extensions.transitIconsTitle')} transparentOnSliderDrag={false}>
        <ul className="extensions-view__mode-icons">
          {TRANSIT_MODES.map(({ mode, labelKey }) => (
            <li key={mode} className="extensions-view__mode-icon-item">
              <TransitModeIcon mode={mode} className="extensions-view__mode-icon" />
              <span>{t(labelKey)}</span>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={weatherIconsOpen} onClose={() => setWeatherIconsOpen(false)} title={t('admin.extensions.weatherIconsTitle')} transparentOnSliderDrag={false}>
        <ul className="extensions-view__mode-icons">
          {WEATHER_SYMBOLS.map(({ code, labelKey }) => (
            <li key={code} className="extensions-view__mode-icon-item">
              <span className="extensions-view__mode-icon" aria-hidden="true">
                {weatherSymbolToEmoji(code)}
              </span>
              <span>{t(labelKey)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
