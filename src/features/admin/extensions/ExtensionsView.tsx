import { useState } from 'react'
import { Alert, Button, Checkbox, Input, Modal, SlideTransition, TranslatedText } from '../../../components'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useExtensionsConfig } from '../../../hooks/useExtensionsConfig'
import { useLanguage } from '../../../i18n'
import { lookupAddress } from '../../../lib/localServer'
import type { NearbyStop, WeatherLocation } from '../../../types/extensions'
import { TransitModeIcon } from '../../screens/TransitModeIcon'
import { weatherSymbolToEmoji } from '../../../utils/weatherSymbols'
import { ActivationToggle } from './ActivationToggle'
import { AnimatedDetails } from './AnimatedDetails'
import { YrLogo } from './BrandLogos'
import { ComingSoonSection } from './ComingSoonSection'
import { ExtensionSearchBar } from './ExtensionSearchBar'
import { ExtensionSearchResults } from './ExtensionSearchResults'
import { FetchedLogo } from './FetchedLogo'
import './ExtensionsView.scss'

/** Every Entur `TransportMode` value `TransitModeIcon` recognizes, paired with its own i18n label — shown as a legend in the "View transit icons" modal so the admin can see what each glyph on a live departures slide means. */
const TRANSIT_MODES: { mode: string; labelKey: string }[] = [
  { mode: 'bus', labelKey: 'admin.extensions.transitModeBus' },
  { mode: 'coach', labelKey: 'admin.extensions.transitModeCoach' },
  { mode: 'tram', labelKey: 'admin.extensions.transitModeTram' },
  { mode: 'rail', labelKey: 'admin.extensions.transitModeRail' },
  { mode: 'metro', labelKey: 'admin.extensions.transitModeMetro' },
  { mode: 'water', labelKey: 'admin.extensions.transitModeWater' },
  { mode: 'air', labelKey: 'admin.extensions.transitModeAir' },
  { mode: 'cableway', labelKey: 'admin.extensions.transitModeCableway' },
  { mode: 'funicular', labelKey: 'admin.extensions.transitModeFunicular' },
  { mode: 'lift', labelKey: 'admin.extensions.transitModeLift' },
  { mode: 'unknown', labelKey: 'admin.extensions.transitModeUnknown' },
]

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
 * (`SlotEditor.tsx`), since both share `SlideFields.tsx`. Transit's own
 * display settings (stops, departure count, detail toggles, mode filter)
 * are still edited here, cafe-wide; weather's own display settings
 * (forecast length, which extra details to show) instead live on each
 * `'weather'` slide itself (see `SlideFields.tsx`/`ScreenSlotContent`), so
 * this page's weather card only has the on/off switch, a short description
 * of what enabling it unlocks, and *which locations* a weather pane can
 * choose from: the store's own address (`addressLookup`, toggled via "Use
 * store location", on by default) plus any number of extra named locations
 * added here, each independently geocoded through the same address-lookup
 * proxy. A `'weather'` slide then picks one of these by id (see
 * `SlideFields.tsx`'s location `<select>`), defaulting to the store's own
 * address when unset.
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

  const toggleMode = (mode: string) => {
    const modeFilter = config.transit.modeFilter.includes(mode) ? config.transit.modeFilter.filter((selected) => selected !== mode) : [...config.transit.modeFilter, mode]
    setConfig({ ...config, transit: { ...config.transit, modeFilter } })
  }

  /** Whether weather has *any* coordinate source to enable with — the store's own address (only while `useStoreLocation` is on) or at least one already-looked-up extra location. Gates the weather `ActivationToggle`, same posture as transit's own "needs nearby stops first" gate. */
  const hasWeatherCoordinates = (config.weather.useStoreLocation && Boolean(addressLookup?.coordinates)) || config.weather.locations.some((location) => location.coordinates)

  const addWeatherLocation = () => {
    const location: WeatherLocation = { id: crypto.randomUUID(), name: '', address: '', coordinates: null }
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
          <span className={`status-dot${config.weather.enabled ? ' status-dot--active' : ' status-dot--inactive'}`} title={t(config.weather.enabled ? 'admin.extensions.statusEnabled' : 'admin.extensions.statusDisabled')} />
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
          <FetchedLogo slug="ruter" label="Ruter" className="extension-submenu__icon" />
          <span className="extension-submenu__title">
            <span className="extension-submenu__brand">{t('admin.extensions.transitBrandName')}</span>
            <span className="extension-submenu__label">{t('admin.extensions.transitLabel')}</span>
          </span>
          <span className={`status-dot${config.transit.enabled ? ' status-dot--active' : ' status-dot--inactive'}`} title={t(config.transit.enabled ? 'admin.extensions.statusEnabled' : 'admin.extensions.statusDisabled')} />
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
              <Input
                id="extensions-departure-count"
                type="number"
                min={1}
                max={20}
                label={t('admin.extensions.departureCountLabel')}
                value={config.transit.departureCount}
                onChange={(event) => setConfig({ ...config, transit: { ...config.transit, departureCount: Number(event.target.value) } })}
              />
              <p className="extensions-view__stops-label">{t('admin.extensions.nearbyStopsLabel')}</p>
              {addressLookup && addressLookup.nearbyStops.length > 0 ? (
                <ul className="extensions-view__stop-list">
                  {addressLookup.nearbyStops.map((stop) => (
                    <li key={stop.id}>
                      <Checkbox
                        id={`extensions-stop-${stop.id}`}
                        label={stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}
                        checked={config.transit.selectedStops.some((selected) => selected.id === stop.id)}
                        onChange={() => toggleStop(stop)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="extensions-view__hint">{t('admin.extensions.noStopsFoundHint')}</p>
              )}

              <p className="extensions-view__stops-label">{t('admin.extensions.transitDetailsLabel')}</p>
              <p className="extensions-view__hint">{t('admin.extensions.transitDetailsHint')}</p>
              <Checkbox
                id="extensions-transit-platform"
                label={t('admin.extensions.transitShowPlatformLabel')}
                checked={config.transit.showPlatform}
                onChange={(event) => setConfig({ ...config, transit: { ...config.transit, showPlatform: event.target.checked } })}
              />
              <Checkbox
                id="extensions-transit-line-name"
                label={t('admin.extensions.transitShowLineNameLabel')}
                checked={config.transit.showLineName}
                onChange={(event) => setConfig({ ...config, transit: { ...config.transit, showLineName: event.target.checked } })}
              />
              <Checkbox
                id="extensions-transit-realtime-only"
                label={t('admin.extensions.transitRealtimeOnlyLabel')}
                checked={config.transit.realtimeOnly}
                onChange={(event) => setConfig({ ...config, transit: { ...config.transit, realtimeOnly: event.target.checked } })}
              />

              <p className="extensions-view__stops-label">{t('admin.extensions.transitModeFilterLabel')}</p>
              <p className="extensions-view__hint">{t('admin.extensions.transitModeFilterHint')}</p>
              <ul className="extensions-view__stop-list">
                {TRANSIT_MODES.filter((entry) => entry.mode !== 'unknown').map(({ mode, labelKey }) => (
                  <li key={mode}>
                    <Checkbox id={`extensions-mode-${mode}`} label={t(labelKey)} checked={config.transit.modeFilter.includes(mode)} onChange={() => toggleMode(mode)} />
                  </li>
                ))}
              </ul>
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
          <span className={`status-dot${config.entur.enabled ? ' status-dot--active' : ' status-dot--inactive'}`} title={t(config.entur.enabled ? 'admin.extensions.statusEnabled' : 'admin.extensions.statusDisabled')} />
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
          <Input
            id="extensions-entur-departure-count"
            type="number"
            min={1}
            max={20}
            label={t('admin.extensions.departureCountLabel')}
            value={config.transit.departureCount}
            onChange={(event) => setConfig({ ...config, transit: { ...config.transit, departureCount: Number(event.target.value) } })}
          />
          <p className="extensions-view__stops-label">{t('admin.extensions.nearbyStopsLabel')}</p>
          {addressLookup && addressLookup.nearbyStops.length > 0 ? (
            <ul className="extensions-view__stop-list">
              {addressLookup.nearbyStops.map((stop) => (
                <li key={stop.id}>
                  <Checkbox
                    id={`extensions-entur-stop-${stop.id}`}
                    label={stop.modes.length ? `${stop.name} (${stop.modes.join(', ')})` : stop.name}
                    checked={config.transit.selectedStops.some((selected) => selected.id === stop.id)}
                    onChange={() => toggleStop(stop)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="extensions-view__hint">{t('admin.extensions.noStopsFoundHint')}</p>
          )}

          <p className="extensions-view__stops-label">{t('admin.extensions.transitDetailsLabel')}</p>
          <p className="extensions-view__hint">{t('admin.extensions.transitDetailsHint')}</p>
          <Checkbox
            id="extensions-entur-platform"
            label={t('admin.extensions.transitShowPlatformLabel')}
            checked={config.transit.showPlatform}
            onChange={(event) => setConfig({ ...config, transit: { ...config.transit, showPlatform: event.target.checked } })}
          />
          <Checkbox
            id="extensions-entur-line-name"
            label={t('admin.extensions.transitShowLineNameLabel')}
            checked={config.transit.showLineName}
            onChange={(event) => setConfig({ ...config, transit: { ...config.transit, showLineName: event.target.checked } })}
          />
          <Checkbox
            id="extensions-entur-realtime-only"
            label={t('admin.extensions.transitRealtimeOnlyLabel')}
            checked={config.transit.realtimeOnly}
            onChange={(event) => setConfig({ ...config, transit: { ...config.transit, realtimeOnly: event.target.checked } })}
          />

          <p className="extensions-view__stops-label">{t('admin.extensions.transitModeFilterLabel')}</p>
          <p className="extensions-view__hint">{t('admin.extensions.transitModeFilterHint')}</p>
          <ul className="extensions-view__stop-list">
            {TRANSIT_MODES.filter((entry) => entry.mode !== 'unknown').map(({ mode, labelKey }) => (
              <li key={mode}>
                <Checkbox id={`extensions-entur-mode-${mode}`} label={t(labelKey)} checked={config.transit.modeFilter.includes(mode)} onChange={() => toggleMode(mode)} />
              </li>
            ))}
          </ul>
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
