import { useEffect, useState } from 'react'
import { fetchDepartures } from '../lib/localServer'
import type { DepartureInfo } from '../types/extensions'

/** How often `TransitSlide` re-fetches — frequent enough to feel "live" without hammering Entur (the server itself also caches responses briefly, see `server/extensions.ts`). */
const POLL_INTERVAL_MS = 30_000

interface TransitDeparturesState {
  stopName: string | null
  departures: DepartureInfo[]
  loading: boolean
}

/**
 * Polls `GET /extensions/departures` for `stopId` every 30s. On a failed
 * refresh (local server down, Entur unreachable), keeps whatever data it
 * last had rather than clearing it — a public kiosk display should never
 * flash blank/error where a moment ago there was real data.
 */
export function useTransitDepartures(stopId: string | undefined, count: number): TransitDeparturesState {
  const [state, setState] = useState<TransitDeparturesState>({ stopName: null, departures: [], loading: Boolean(stopId) })

  useEffect(() => {
    if (!stopId) return

    let cancelled = false
    const refresh = () => {
      fetchDepartures(stopId, count)
        .then((result) => {
          if (!cancelled) setState({ stopName: result.stopName, departures: result.departures, loading: false })
        })
        .catch(() => {
          if (!cancelled) setState((current) => ({ ...current, loading: false }))
        })
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [stopId, count])

  return state
}
