import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, Modal, TranslatedText } from '../../../components'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useExtensionsConfig } from '../../../hooks/useExtensionsConfig'
import { useLanguage } from '../../../i18n'
import { lookupAddress } from '../../../lib/localServer'
import type { NearbyStop } from '../../../types/extensions'
import { TransitModeIcon } from '../../screens/TransitModeIcon'
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

/**
 * Admin view for the two live-data screen-slot kinds: real-time transit
 * departures (Ruter, via Entur's public APIs) and an hourly weather
 * forecast (Yr / MET Norway) — both derived from the cafe's own address, as
 * set in Contact info. "Look up address" geocodes that address and finds
 * nearby stops through the local server's `/extensions/lookup` proxy; the
 * result (coordinates + candidate stops) is cached in the synced
 * `admin.extensions` config so every device sees the same options without
 * re-looking it up. Enabling either integration makes its matching slot
 * content kind (`'weather'`/`'transit'`) selectable in every screen's slide
 * editor, both on the dashboard (`ScreenForm.tsx`) and the kiosk's own
 * in-place editor (`SlotEditor.tsx`), since both share `SlideFields.tsx`.
 */
export function ExtensionsView() {
  const { t } = useLanguage()
  const [contactInfo] = useContactInfo()
  const [config, setConfig] = useExtensionsConfig()
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [transitIconsOpen, setTransitIconsOpen] = useState(false)

  const addressLookup = config.addressLookup
  const isStale = addressLookup !== undefined && addressLookup.address !== contactInfo.address

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

  return (
    <div className="extensions-view">
      <TranslatedText as="h1" id="admin.extensions.title" />

      <div className="extensions-view__lookup">
        <Button variant="secondary" onClick={handleLookupAddress} disabled={isLookingUp}>
          {isLookingUp ? t('admin.extensions.lookupButtonLoading') : t('admin.extensions.lookupButton')}
        </Button>
        {addressLookup?.coordinates && <span className="extensions-view__coordinates">{t('admin.extensions.coordinatesLabel', { lat: addressLookup.coordinates.lat.toFixed(4), lon: addressLookup.coordinates.lon.toFixed(4) })}</span>}
      </div>

      {lookupError && <Alert variant="error">{lookupError}</Alert>}
      {!lookupError && isStale && <Alert variant="warning">{t('admin.extensions.addressChangedNotice')}</Alert>}
      {!lookupError && !addressLookup && <Alert variant="info">{t('admin.extensions.noLookupYetHint')}</Alert>}

      <Card title={t('admin.extensions.weatherTitle')}>
        <Checkbox
          id="extensions-weather-enabled"
          label={t('admin.extensions.weatherEnableLabel')}
          checked={config.weather.enabled}
          disabled={!addressLookup?.coordinates}
          onChange={(event) => setConfig({ ...config, weather: { ...config.weather, enabled: event.target.checked } })}
        />
        {!addressLookup?.coordinates && <p className="extensions-view__hint">{t('admin.extensions.needsLookupHint')}</p>}
        {config.weather.enabled && (
          <Input
            id="extensions-forecast-hours"
            type="number"
            min={1}
            max={48}
            label={t('admin.extensions.forecastHoursLabel')}
            value={config.weather.forecastHours}
            onChange={(event) => setConfig({ ...config, weather: { ...config.weather, forecastHours: Number(event.target.value) } })}
          />
        )}
      </Card>

      <Card title={t('admin.extensions.transitTitle')}>
        <Checkbox
          id="extensions-transit-enabled"
          label={t('admin.extensions.transitEnableLabel')}
          checked={config.transit.enabled}
          disabled={!addressLookup?.nearbyStops.length}
          onChange={(event) => setConfig({ ...config, transit: { ...config.transit, enabled: event.target.checked } })}
        />
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
          </>
        )}
      </Card>

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
    </div>
  )
}
