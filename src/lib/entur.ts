/**
 * Entur JourneyPlanner departures — shared by the local server and every
 * display.
 */
import type { DepartureInfo, StopDepartures } from '../types/integrations'

/** Identifies this app to Entur's APIs, per their usage terms — no personal/secret info needed, just a stable `<company>-<application>` string. */
export const ENTUR_CLIENT_NAME = 'adhdisplay-cafe-kiosk'

interface EstimatedCall {
  aimedDepartureTime: string
  expectedDepartureTime: string
  realtime: boolean
  cancellation: boolean
  destinationDisplay: { frontText: string }
  quay: { publicCode: string | null } | null
  serviceJourney: {
    line: {
      publicCode: string
      name: string | null
      transportMode: string
      authority: { id: string; name: string } | null
      presentation: { colour: string | null; textColour: string | null } | null
    }
  }
}
interface StopPlaceDeparturesResponse {
  data: { stopPlace: { name: string; estimatedCalls: EstimatedCall[] } | null }
}

/**
 * Always fetched from Entur regardless of how many departures a slide is
 * actually configured to *show* (`count`, admin-capped at 20 in
 * `SlideFields.tsx`) — a schedule is effectively indefinite, so a display
 * that goes offline should have far more than just the next `count`
 * departures buffered client-side (see `useTransitDepartures.ts`) to keep
 * trimming from as departures pass, the same way
 * `handleWeather` below always caches Yr's full multi-day forecast rather
 * than only the admin-chosen display window.
 */
export const TRANSIT_FETCH_BUFFER = 100

const DEPARTURES_QUERY = `
  query StopPlaceDepartures($id: String!, $numberOfDepartures: Int!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(numberOfDepartures: $numberOfDepartures, includeCancelledTrips: false) {
        aimedDepartureTime
        expectedDepartureTime
        realtime
        cancellation
        destinationDisplay { frontText }
        quay { publicCode }
        serviceJourney { line { publicCode name transportMode authority { id name } presentation { colour textColour } } }
      }
    }
  }
`

/** Entur returns `presentation.colour`/`textColour` as bare hex (e.g. `"76A300"`) — prefixes it with `#` to match this app's own `lineColors[].hex` convention (`TransitLineColorListEditor.tsx`), so the client can use it directly as a CSS value with no further normalizing. */
function normalizeHex(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith('#') ? value : `#${value}`
}

/** Fetches the next TRANSIT_FETCH_BUFFER (or count, if larger) departures from Entur stop stopId and maps them to DepartureInfo. Uses only fetch, so it runs both in the browser (a display's direct poller, see directTransitPoller.ts) and on the server (server/integrations.ts wraps it in its short in-memory cache). Entur allows cross-origin calls with the ET-Client-Name header. `signal` lets a browser caller put a timeout on it — a browser fetch has none of its own, and a hung request would otherwise block the caller's next poll. */
export async function fetchEnturDepartures(stopId: string, count: number, signal?: AbortSignal): Promise<StopDepartures> {
  const response = await fetch('https://api.entur.io/journey-planner/v3/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ENTUR_CLIENT_NAME },
    body: JSON.stringify({ query: DEPARTURES_QUERY, variables: { id: stopId, numberOfDepartures: Math.max(count, TRANSIT_FETCH_BUFFER) } }),
    signal,
  })
  if (!response.ok) throw new Error(`journey planner failed: ${response.status}`)
  const body = (await response.json()) as StopPlaceDeparturesResponse
  if (!body.data.stopPlace) throw new Error(`unknown stop place: ${stopId}`)

  return {
    stopName: body.data.stopPlace.name,
    departures: body.data.stopPlace.estimatedCalls.map((call): DepartureInfo => ({
      line: call.serviceJourney.line.publicCode,
      lineName: call.serviceJourney.line.name ?? undefined,
      mode: call.serviceJourney.line.transportMode,
      authorityId: call.serviceJourney.line.authority?.id ?? undefined,
      authorityName: call.serviceJourney.line.authority?.name ?? undefined,
      lineColor: normalizeHex(call.serviceJourney.line.presentation?.colour),
      lineTextColor: normalizeHex(call.serviceJourney.line.presentation?.textColour),
      destination: call.destinationDisplay.frontText,
      expectedDepartureTime: call.expectedDepartureTime,
      aimedDepartureTime: call.aimedDepartureTime,
      realtime: call.realtime,
      platform: call.quay?.publicCode ?? undefined,
      cancelled: call.cancellation,
    })),
  }
}
