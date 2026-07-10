import { useEffect, useState } from 'react'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useTransitDepartures } from '../../hooks/useTransitDepartures'
import { useLanguage } from '../../i18n'
import { TransitModeIcon } from './TransitModeIcon'
import './TransitSlide.scss'

interface TransitSlideProps {
  /** The stop to show departures for, referencing `ExtensionsConfig['transit']['selectedStops']` — falls back to the first configured stop if unset or no longer among the configured ones (e.g. removed from Extensions after this slide was set up). */
  stopId?: string
}

/** Fullscreen rendering of real-time departures from one of the cafe's configured nearby stops (see the admin's Extensions tab), for a screen display's "transit" slot. */
export function TransitSlide({ stopId }: TransitSlideProps) {
  const { t } = useLanguage()
  const [config] = useExtensionsConfig()
  const selectedStops = config.transit.selectedStops
  const effectiveStopId = stopId && selectedStops.some((stop) => stop.id === stopId) ? stopId : selectedStops[0]?.id
  const { stopName, departures, loading } = useTransitDepartures(effectiveStopId, config.transit.departureCount)

  /** `Date.now()` can't be called directly during render (an impure call) — ticking this every 30s keeps each departure's "in X min" reasonably fresh between refetches without reading the clock at render time. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!effectiveStopId) {
    return (
      <div className="transit-slide transit-slide--empty">
        <p>{t('admin.screens.transitNoStopsConfiguredLabel')}</p>
      </div>
    )
  }

  return (
    <div className="transit-slide">
      <h1>{stopName ?? selectedStops.find((stop) => stop.id === effectiveStopId)?.name}</h1>
      {departures.length === 0 && !loading ? (
        <p className="transit-slide__empty">{t('admin.screens.transitNoDeparturesLabel')}</p>
      ) : (
        <ul className="transit-slide__list">
          {departures.map((departure) => {
            const minutesUntil = Math.max(0, Math.round((new Date(departure.expectedDepartureTime).getTime() - now) / 60_000))
            return (
              <li key={`${departure.line}-${departure.destination}-${departure.expectedDepartureTime}`} className="transit-slide__item">
                <TransitModeIcon mode={departure.mode} className="transit-slide__mode-icon" />
                <span className="transit-slide__line">{departure.line}</span>
                <span className="transit-slide__destination">{departure.destination}</span>
                <span className="transit-slide__time">{t('admin.screens.transitMinutesLabel', { minutes: minutesUntil })}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
