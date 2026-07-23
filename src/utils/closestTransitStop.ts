import type { NearbyStop } from '../types/integrations'

/**
 * Picks the closest-to-the-store stop out of `selectedStops` (an admin's own
 * curated pool for one transit brand, see `IntegrationsConfig`), using
 * `nearbyStops` — the last "Look up address" result, already ordered
 * nearest-first by Entur's reverse geocoder — as the distance signal.
 * `selectedStops` order itself doesn't reflect distance (admins can add/
 * remove stops in any order), so this ranks each selected stop by its own
 * position in `nearbyStops` instead, falling back to `selectedStops`'
 * own first entry when none of them appear there (e.g. a stale/missing
 * lookup, or a stop added via the "Search for a stop" box rather than the
 * proximity list).
 *
 * @returns The closest stop's id, or `''` when `selectedStops` is empty.
 */
export function closestSelectedStopId(selectedStops: NearbyStop[], nearbyStops: NearbyStop[]): string {
  if (selectedStops.length === 0) return ''

  const nearbyRank = new Map(nearbyStops.map((stop, index) => [stop.id, index]))
  const closest = selectedStops.reduce((best, stop) => {
    const rank = nearbyRank.get(stop.id) ?? Number.POSITIVE_INFINITY
    const bestRank = nearbyRank.get(best.id) ?? Number.POSITIVE_INFINITY
    return rank < bestRank ? stop : best
  })
  return closest.id
}
