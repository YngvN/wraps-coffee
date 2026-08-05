import type { DisplayConnectionType } from '../types/displayMachine'
import type { FoodoraCredentials, WoltCredentials } from '../types/delivery'
import type { DepartureInfo, NearbyStop, WeatherHour } from '../types/integrations'
import type { NewsHeadline } from '../types/news'
import type { OrderStatus } from '../types/order'
import type { ScreenAddressSettings } from '../types/screenAddress'
import type { AdminRole, AdminSession, DashboardSection } from '../types/sync'
import type { WindowLaunchSettings } from '../types/windowLaunch'

/**
 * Derives the local LAN sync server's HTTP origin from the page's own
 * hostname — the server runs on the same machine/network as the Vite dev
 * server but on a different port, so `window.location.hostname` (not
 * `localhost`) is what makes this work from a second device on the LAN too.
 */
export function serverBaseUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined
  if (override) return override.replace(/^ws/, 'http')
  const port = (import.meta.env.VITE_WS_PORT as string | undefined) ?? '4000'
  return `http://${window.location.hostname}:${port}`
}

/** The local server's WebSocket origin — same derivation as `serverBaseUrl`. */
export function wsUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined
  if (override) return override
  const port = (import.meta.env.VITE_WS_PORT as string | undefined) ?? '4000'
  return `ws://${window.location.hostname}:${port}`
}

/** This machine's own LAN-reachable IPv4 address (as seen by the local server itself), or `null` if it doesn't have one — public, no auth needed. Used by `ScreensView` to build a screen's `/screens/:id` link so it still works from a *different* device on the network even when the admin dashboard itself was opened via `localhost`. */
export async function getLanIp(): Promise<string | null> {
  const response = await fetch(`${serverBaseUrl()}/server-info`)
  if (!response.ok) throw new Error('Could not fetch server info')
  const { lanIp } = (await response.json()) as { lanIp: string | null }
  return lanIp
}

/** The running app's own version (from `package.json`, mirrored in `installer/wraps-coffee.iss`'s `AppVersion`) — public, no auth needed. Used by the Settings → About card. */
export async function getAppVersion(): Promise<string> {
  const response = await fetch(`${serverBaseUrl()}/server-info`)
  if (!response.ok) throw new Error('Could not fetch server info')
  const { version } = (await response.json()) as { version: string }
  return version
}

// --- Display Manager (Settings-adjacent, but a public/no-auth machine self-report — see server/index.ts's own comment on this route) ---

/** Self-reports this machine/tab's presence and current monitor list — best-effort, same posture as `logout`: a failure (server unreachable) just means this display doesn't show up in the Display Manager yet, not something worth surfacing to whoever's looking at an otherwise-working kiosk screen. */
export async function registerDisplayHeartbeat(input: {
  machineID: string
  label: string
  connectionType: DisplayConnectionType
  monitors: { id: string; label: string }[]
}): Promise<void> {
  try {
    await fetch(`${serverBaseUrl()}/display-machines/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    // Ignore — see above.
  }
}

/** Thrown when the local server rejects a login attempt or isn't reachable at all. */
export class LoginError extends Error {}

export async function login(username: string, password: string): Promise<AdminSession> {
  let response: Response
  try {
    response = await fetch(`${serverBaseUrl()}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new LoginError('Could not reach the local server. Is it running?')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new LoginError(body.error ?? 'Login failed')
  }

  return response.json() as Promise<AdminSession>
}

/** Best-effort — if the server isn't reachable, the caller still clears its local session. */
export async function logout(token: string): Promise<void> {
  try {
    await fetch(`${serverBaseUrl()}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  } catch {
    // Ignore — the token will simply be dropped client-side instead.
  }
}

/** Thrown when an upload is rejected (wrong type, too large) or the server is unreachable. */
export class UploadError extends Error {}

/** Thrown when the server rejects a request's token — the session is gone (e.g. logged out from another tab, or a session the server no longer recognizes) and the caller should treat this as "logged out," not a generic failure. */
export class SessionExpiredError extends Error {}

/** Runs a raw-bytes upload via `XMLHttpRequest` rather than `fetch` — `fetch` has no upload-progress event, and both `uploadImage`/`uploadVideo` need one for their own progress bars. */
function xhrUpload(url: string, file: File, token: string, onProgress?: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: unknown = {}
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        // Ignore — an empty/non-JSON body is handled by the status check below.
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () => reject(new UploadError('Could not reach the local server. Is it running?'))
    xhr.send(file)
  })
}

/** Uploads an image file, which the server also compresses into `-small`/`-thumb` companion variants. Returns the original's URL — same shape whether or not compression succeeded. `onProgress` (0-1) reports network-transfer progress only. */
export async function uploadImage(file: File, token: string, onProgress?: (fraction: number) => void): Promise<string> {
  const { status, body } = await xhrUpload(`${serverBaseUrl()}/uploads`, file, token, onProgress)
  if (status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (status < 200 || status >= 300) throw new UploadError((body as { error?: string }).error ?? 'Upload failed')
  return (body as { url: string }).url
}

/** The immediate response to a video upload/retry — transcoding hasn't started resolving yet, so this is deliberately narrower than a full `UploadedMedia` entry (no `thumbUrl`/`sizeBytes` until the poster/transcode exist). Poll `listUploads()` for this `filename` until its `status` flips to `undefined` (ready) or `'failed'`. */
export interface VideoUploadAck {
  id: string
  filename: string
  url?: string
  status: 'processing'
}

/** Uploads a video file for background transcoding into a browser-safe MP4 (also "the compressor" — see `server/videoUploads.ts`) plus a poster frame. `onProgress` (0-1) reports network-transfer progress only — the much longer server-side transcode has no meaningful percentage, see `VideoUploadAck`. */
export async function uploadVideo(file: File, token: string, onProgress?: (fraction: number) => void): Promise<VideoUploadAck> {
  const { status, body } = await xhrUpload(`${serverBaseUrl()}/uploads/video`, file, token, onProgress)
  if (status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (status < 200 || status >= 300) throw new UploadError((body as { error?: string }).error ?? 'Upload failed')
  return body as VideoUploadAck
}

/** Re-attempts a failed transcode against its still-staged source, without needing the file re-uploaded. 404s (surfaced as a thrown `UploadError`) if that staged copy is gone — already succeeded, deleted, or swept after 48h abandoned. */
export async function retryVideoUpload(id: string, token: string): Promise<VideoUploadAck> {
  let response: Response
  try {
    response = await fetch(`${serverBaseUrl()}/uploads/video/${id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new UploadError('Could not reach the local server. Is it running?')
  }
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new UploadError(body.error ?? 'Retry failed')
  }
  return response.json() as Promise<VideoUploadAck>
}

/** Sets (or, passing `''`, clears) a user-chosen label for an upload — the Media Library's "rename" action. Applies to both images and videos. */
export async function renameUpload(filename: string, displayName: string, token: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/uploads/${filename}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Could not rename this upload')
}

/** Total bytes used under the server's own uploads folder, and bytes still free on that volume — lets the Media Library warn before a kiosk's disk actually fills up. */
export async function getStorageUsage(token: string): Promise<{ usedBytes: number; availableBytes: number }> {
  const response = await fetch(`${serverBaseUrl()}/uploads/storage`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Could not load storage usage')
  return response.json() as Promise<{ usedBytes: number; availableBytes: number }>
}

/** Best-effort delete — a failure just leaves an orphaned file on the server, it doesn't block whatever edit triggered it. */
export async function deleteUpload(url: string, token: string): Promise<void> {
  try {
    const filename = url.split('/uploads/')[1]
    if (!filename) return
    await fetch(`${serverBaseUrl()}/uploads/${filename}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Ignore — see above.
  }
}

/** One entry in the Media Library — every original image/video currently stored on the server, newest first. */
export interface UploadedMedia {
  filename: string
  url: string
  thumbUrl: string
  sizeBytes: number
  uploadedAt: string
  /** Derived server-side purely from integration. */
  kind: 'image' | 'video'
  /** Omitted for images (always synchronously ready) and for a video whose transcode already succeeded. */
  status?: 'processing' | 'failed'
  /** Only present alongside `status: 'failed'`. */
  errorMessage?: string
  /** User-set label from the Media Library's rename action, if any — falls back to the raw filename in the UI when unset. */
  displayName?: string
}

export async function listUploads(token: string): Promise<UploadedMedia[]> {
  const response = await fetch(`${serverBaseUrl()}/uploads`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Failed to list uploads')
  return response.json() as Promise<UploadedMedia[]>
}

/** True if `url` was served by this same local server's `/uploads/` — the only URLs it's safe to try compressing/deleting via this server's own endpoints. */
export function isOwnUploadUrl(url: string): boolean {
  return url.startsWith(`${serverBaseUrl()}/uploads/`)
}

/** Geocodes `address` and finds nearby transit stops — backs the Integrations tab's "Look up address" action. No auth needed (public proxy of public data); throws a plain `Error` if the server or Entur is unreachable. */
export async function lookupAddress(address: string): Promise<{ coordinates: { lat: number; lon: number } | null; nearbyStops: NearbyStop[] }> {
  const response = await fetch(`${serverBaseUrl()}/integrations/lookup?address=${encodeURIComponent(address)}`)
  if (!response.ok) throw new Error('Could not look up this address')
  return response.json() as Promise<{ coordinates: { lat: number; lon: number } | null; nearbyStops: NearbyStop[] }>
}

/** Searches stop places by name (anywhere, not just near the store's own address) — backs the Integrations tab's "Search for a stop" box. No auth needed (public proxy of public data); throws a plain `Error` if the server or Entur is unreachable. */
export async function searchStops(query: string): Promise<NearbyStop[]> {
  const response = await fetch(`${serverBaseUrl()}/integrations/stops/search?query=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error('Could not search for stops')
  const { stops } = (await response.json()) as { stops: NearbyStop[] }
  return stops
}

/** Fetches Entur's own much-larger buffer of upcoming departures for `stopId` (`count` only hints a floor — see `handleDepartures`'s `TRANSIT_FETCH_BUFFER` doc comment in `server/integrations.ts`; the response isn't trimmed to `count`), used by `TransitSlide`'s polling hook, which is what actually slices it down to `count` for display. No auth needed — public proxy, same posture as image reads. */
export async function fetchDepartures(stopId: string, count: number): Promise<{ stopName: string; departures: DepartureInfo[] }> {
  const response = await fetch(`${serverBaseUrl()}/integrations/departures?stopId=${encodeURIComponent(stopId)}&count=${count}`)
  if (!response.ok) throw new Error('Could not fetch departures')
  return response.json() as Promise<{ stopName: string; departures: DepartureInfo[] }>
}

/** Fetches MET's entire multi-day hourly forecast for `(lat, lon)` (the response isn't trimmed to `hours` — see `handleWeather`'s own doc comment in `server/integrations.ts`), plus today's overall low/high (computed server-side from that same full timeseries) — used by `WeatherSlide`'s polling hook, which is what actually slices `hourly` down to `hours` for display. */
export async function fetchWeather(lat: number, lon: number, hours: number): Promise<{ hourly: WeatherHour[]; todayLowC?: number; todayHighC?: number }> {
  const response = await fetch(`${serverBaseUrl()}/integrations/weather?lat=${lat}&lon=${lon}&hours=${hours}`)
  if (!response.ok) throw new Error('Could not fetch a forecast')
  return response.json() as Promise<{ hourly: WeatherHour[]; todayLowC?: number; todayHighC?: number }>
}

/** Fetches up to `count` merged, newest-first headlines across `sourceIds` — used by `NewsSlide`'s own polling and by a `'qrcode'` slide's "link to news article" mode (with `sourceIds` a single source and `count` 1). No auth needed — public proxy, same posture as image reads. Empty `sourceIds` short-circuits to `[]` without a request. */
export async function fetchNewsHeadlines(sourceIds: string[], count: number): Promise<NewsHeadline[]> {
  if (sourceIds.length === 0) return []
  const response = await fetch(`${serverBaseUrl()}/news/headlines?sources=${sourceIds.map(encodeURIComponent).join(',')}&count=${count}`)
  if (!response.ok) throw new Error('Could not fetch news headlines')
  const { headlines } = (await response.json()) as { headlines: NewsHeadline[] }
  return headlines
}

/** Proxies a headline's own `imageUrl` through this server's own disk cache (`server/newsImageCache.ts`) instead of hitting the source outlet's own hosting on every view — same origin as every other local-server-served image, so `NewsSlide`'s `<img src>` just points here directly. Not a `fetch`-and-return-blob helper like the others in this file, since an `<img>` tag needs a plain URL string, not a promise. */
export function newsImageProxyUrl(src: string): string {
  return `${serverBaseUrl()}/news/image?src=${encodeURIComponent(src)}`
}

/** The current developer API key (see "For developers" in Settings), or `null` if none has been generated yet. */
export async function getDeveloperKey(token: string): Promise<string | null> {
  const response = await fetch(`${serverBaseUrl()}/developer-key`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Could not load the developer API key')
  const { key } = (await response.json()) as { key: string | null }
  return key
}

/** Generates a new developer API key, replacing any existing one — `admin`/`subadmin` only, matching the Users-management posture elsewhere. */
export async function regenerateDeveloperKey(token: string): Promise<string> {
  const response = await fetch(`${serverBaseUrl()}/developer-key/regenerate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not regenerate the developer API key')
  }
  const { key } = (await response.json()) as { key: string }
  return key
}

/** The Neon database URL override (see "For developers" in Settings), or `null` if none has been saved — falls back to the server's own `NEON_DATABASE_URL` environment variable when unset. `admin`/`subadmin` only. */
export async function getNeonUrl(token: string): Promise<string | null> {
  const response = await fetch(`${serverBaseUrl()}/neon-url`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view the Neon database URL')
  if (!response.ok) throw new Error('Could not load the Neon database URL')
  const { url } = (await response.json()) as { url: string | null }
  return url
}

/** Sets (or, passing `null`/an empty string, clears) the Neon database URL override — the local server reconnects its website bridge immediately, no restart needed. `admin`/`subadmin` only. */
export async function setNeonUrl(token: string, url: string | null): Promise<string | null> {
  const response = await fetch(`${serverBaseUrl()}/neon-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the Neon database URL')
  }
  const { url: savedUrl } = (await response.json()) as { url: string | null }
  return savedUrl
}

/** The saved Wolt POS Integration API credentials (see the Integrations page's Wolt card, and Settings → Testing for the environment checkbox), or `venueId`/`apiKey` both `null` if none have been saved yet. `admin`/`subadmin` only. */
export async function getWoltCredentials(token: string): Promise<WoltCredentials> {
  const response = await fetch(`${serverBaseUrl()}/wolt/credentials`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view Wolt credentials')
  if (!response.ok) throw new Error('Could not load the Wolt credentials')
  return response.json() as Promise<WoltCredentials>
}

/** Saves the Wolt POS Integration API credentials (the full object — callers that only own one field, e.g. the Testing page's environment checkbox, should load the current value first and spread over it, same posture as `AdvancedSettingsView`'s own settings objects) — the local server re-syncs immediately, no restart needed. `admin`/`subadmin` only. */
export async function setWoltCredentials(token: string, credentials: WoltCredentials): Promise<WoltCredentials> {
  const response = await fetch(`${serverBaseUrl()}/wolt/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(credentials),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the Wolt credentials')
  }
  return response.json() as Promise<WoltCredentials>
}

/** Triggers an immediate Wolt sync (the Integrations page's own "Sync now" button), instead of waiting for the next automatic poll. `admin`/`subadmin` only. */
export async function triggerWoltSync(token: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/wolt/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Wolt sync failed')
  }
}

/** Pushes a status change for one Wolt order back to Wolt itself — call alongside (not instead of) updating `admin.woltOrders` locally, see `OrdersView.tsx`'s `updateStatus`. */
export async function pushWoltOrderStatus(token: string, orderId: string, status: OrderStatus): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/wolt/status/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not push this status update to Wolt')
  }
}

/** The saved Foodora POS Integration API credentials (see the Integrations page's Foodora card, and Settings → Testing for the environment checkbox), or `venueId`/`apiKey` both `null` if none have been saved yet. `admin`/`subadmin` only. */
export async function getFoodoraCredentials(token: string): Promise<FoodoraCredentials> {
  const response = await fetch(`${serverBaseUrl()}/foodora/credentials`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view Foodora credentials')
  if (!response.ok) throw new Error('Could not load the Foodora credentials')
  return response.json() as Promise<FoodoraCredentials>
}

/** Saves the Foodora POS Integration API credentials (the full object — same posture as `setWoltCredentials`) — the local server re-syncs immediately, no restart needed. `admin`/`subadmin` only. */
export async function setFoodoraCredentials(token: string, credentials: FoodoraCredentials): Promise<FoodoraCredentials> {
  const response = await fetch(`${serverBaseUrl()}/foodora/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(credentials),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the Foodora credentials')
  }
  return response.json() as Promise<FoodoraCredentials>
}

/** Triggers an immediate Foodora sync (the Integrations page's own "Sync now" button), instead of waiting for the next automatic poll. `admin`/`subadmin` only. */
export async function triggerFoodoraSync(token: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/foodora/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Foodora sync failed')
  }
}

/** Pushes a status change for one Foodora order back to Foodora itself — call alongside (not instead of) updating `admin.foodoraOrders` locally, see `OrdersView.tsx`'s `updateStatus`. */
export async function pushFoodoraOrderStatus(token: string, orderId: string, status: OrderStatus): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/foodora/status/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not push this status update to Foodora')
  }
}

// --- AI assistant (Claude) ---------------------------------------------------

export type AssistantModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5'

/** Which backend answers assistant calls — see `AssistantProviderSection` (the shared, admin-configured default) and `AssistantPanel`'s own kebab-menu override, which lets one device pin itself to a specific provider regardless of that shared default (see each assistant function's own `provider` param below). */
export type AssistantProvider = 'local' | 'claude'

/** One real Claude API call's own record — see `server/assistant/client.ts`'s own `AssistantTraceEntry` (this is its client-side mirror). Powers the assistant chat's "thought process" trace disclosure (see `AssistantThoughtTrace`), never anything functional. */
export interface AssistantTraceEntry {
  toolName: string
  pass?: 'draft' | 'verify'
  durationMs: number
  input: string
  output: string
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd?: number }
  /** The literal model that actually answered this one call (a Claude model id or an Ollama tag) — read from the real request itself, not a separately-fetched config value. See `server/assistant/client.ts`'s own `AssistantTraceEntry` doc comment. */
  model?: string
  /** Debug-only tag identifying which deterministic reply branch a `lookup_query` call's own result fed into — see `server/assistant/client.ts`'s own `AssistantTraceEntry` doc comment. Never read by any functional code path. */
  shape?: 'count' | 'list' | 'report'
  /** The admin's tapped/typed answer(s) to a prior clarifying question, keyed by field name, when this call was resuming one — see `server/assistant/client.ts`'s own `AssistantTraceEntry` doc comment. Never read by any functional code path. */
  resolvedFields?: Record<string, string>
  /** The client-assigned `turnVersion` (see `useAssistantFlow.ts`'s own `turnVersionRef`) of the request that produced this entry, stamped on by the route handler in `server/index.ts` — purely for trace-panel debugging of stale/discarded turns, never read by any functional code path. */
  turnVersion?: number
  /** Verdicts from `server/assistant/postChecks/`'s deterministic checks against this call's own output, stamped on by `runStepWithChecks`/`applyChecksNoRetry` — see `server/assistant/client.ts`'s own `AssistantTraceEntry` doc comment. Never read by any functional code path; surfaced in the trace panel and the clipboard export purely for QA/debugging visibility into check verdicts. */
  checks?: { name: string; ok: boolean; reason?: string; action?: 'auto-fix' | 'reject-retry' | 'reject-clarify'; attempt: 1 | 2 }[]
}

/** One row of a structured list reply attachment — client-side mirror of `server/assistant/types.ts`'s own `AssistantListItem`. */
export interface AssistantListItem {
  label: string
  sublabel?: string
}

/** A structured list of matched records attached to a lookup reply — client-side mirror of `server/assistant/types.ts`'s own `AssistantReplyList`. See that file's doc comment for why this exists instead of the model regenerating the list as prose. */
export interface AssistantReplyList {
  style: 'bullet'
  items: AssistantListItem[]
}

export interface AssistantCredentialStatus {
  hasKey: boolean
  provider: AssistantProvider
  model: AssistantModel
  /** Tier 5 of the product-name resolution ladder (`server/assistant/productNameResolution.ts`) — a model call that fires only once the deterministic fold/alias/Levenshtein tiers all miss, and whose output is never auto-applied regardless of this setting. See the checkbox in `AssistantProviderSection.tsx`. */
  productNameCandidateSuggestionsEnabled: boolean
}

/** Whether a Claude API key is configured, and which provider is selected (see Settings → AI Assistant and the Integrations page's Claude card) — never the raw key itself. `admin`/`subadmin` only. */
export async function getAssistantCredentialStatus(token: string): Promise<AssistantCredentialStatus> {
  const response = await fetch(`${serverBaseUrl()}/assistant/credentials`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view the assistant configuration')
  if (!response.ok) throw new Error('Could not load the assistant configuration')
  return response.json() as Promise<AssistantCredentialStatus>
}

/** Saves the Claude API key, selected provider, and/or selected model — pass only the field(s) being changed, `undefined` leaves the others untouched. `admin`/`subadmin` only. */
export async function setAssistantCredentials(
  token: string,
  input: { apiKey?: string | null; provider?: AssistantProvider; model?: AssistantModel; productNameCandidateSuggestionsEnabled?: boolean },
): Promise<AssistantCredentialStatus> {
  const response = await fetch(`${serverBaseUrl()}/assistant/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the assistant configuration')
  }
  return response.json() as Promise<AssistantCredentialStatus>
}

/** One filter condition for the deterministic lookup query engine — client-side mirror of `server/assistant/lookupQuery.ts`'s own `LookupQueryFilterInput`. Only ever produced by the server (a prior turn's own resolved filter, round-tripped via `AssistantIntentResult.baseFilters`); the client never builds one itself. */
export interface AssistantLookupFilter {
  field: string
  op: string
  value: string
}

export interface AssistantIntentResult {
  /** A real entity key, or `'chat'` for a general question/greeting that isn't a specific create/update/delete request — see `reply`/`lookupEntities`. */
  entity: string
  /** `null` when `entity === 'chat'`. */
  action: 'create' | 'update' | 'delete' | 'resetPassword' | 'trigger' | null
  /** Meaningful for a real entity action, or for a `'chat'`+`lookupEntities` question about one specific, already-named item (e.g. "how much does X cost?") — pass it as `assistantAnswerLookup`'s own `itemSearchText` in that case, so it can answer directly from that one record instead of scanning the whole dataset. `null` for a filter/count/list question with no one named item. */
  searchText: string | null
  /** The conversational answer, only set when `entity === 'chat'` and `lookupEntities` is empty. */
  reply: string | null
  /** Only set when `entity === 'chat'` and the message was a factual question about the cafe's own current data — which entity keys to fetch via `assistantAnswerLookup`. Mutually exclusive with `reply` (the server normalizes this). */
  lookupEntities: string[] | null
  /** Only ever set by the server's own pronoun prefilter, when a plural referring pronoun ("de"/"dem"/"disse") resolved against the conversation's prior lookup scope — pass it straight through as `assistantAnswerLookup`'s own `baseFilters`, same posture as `historyContext`/`searchText`. `null`/`undefined` otherwise. */
  baseFilters?: AssistantLookupFilter[] | null
  /** This turn's resolved conversation context (see `server/assistant/steps.ts`'s `resolveHistoryContext`), or `null` if there was none yet — pass this straight through to `assistantSelectItem`/`assistantFillFields`/`assistantAnswerLookup` for the rest of this same turn, never re-resolving it client-side. */
  historyContext: string | null
  /** See `AssistantTraceEntry` — always exactly one entry (this step is single-pass), plus one more if history had to be summarized. */
  trace: AssistantTraceEntry[]
  /** The request's own `turnVersion`, echoed back verbatim — see `useAssistantFlow.ts`'s `isStaleTurn`. */
  turnVersion?: number
}

/** Step 1 of the assistant flow (see `useAssistantFlow`) — routes free text to an entity + action. Never writes anything; see `server/assistant/types.ts`'s own module doc comment. `model` overrides the admin-configured default for this one call only — see `AssistantPanel`'s model-picker menu. `history` is raw recent-transcript text, only sent when this call is the first of its turn (see `useAssistantFlow`'s own `transcriptToText`). `provider` pins this one call (and, via `useAssistantFlow`, this whole device's chat) to a specific backend regardless of the shared, admin-configured default — same kebab-menu override as `model`, but selectable independently of it (picking "Local (Ollama)" makes `model` a no-op, since that provider routes by call shape instead). `conversationId` is this chat's own id (see `useAssistantFlow`'s own `conversationIdRef`) — only ever consulted server-side by the local provider's pronoun prefilter, to look up this conversation's own dialog focus. */
export async function assistantSelectIntent(
  token: string,
  message: string,
  uiLanguage: 'no' | 'en',
  model?: AssistantModel,
  history?: string,
  provider?: AssistantProvider,
  localModel?: string,
  conversationId?: string,
  turnVersion?: number,
  signal?: AbortSignal,
): Promise<AssistantIntentResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, uiLanguage, model, history, provider, localModel, conversationId, turnVersion }),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't figure out what you meant — try rephrasing")
  }
  return response.json() as Promise<AssistantIntentResult>
}

export interface AssistantSelectItemResult {
  itemID: string | null
  candidates: { id: string; label: string }[]
  /** See `AssistantTraceEntry` — empty when a fast path (0 or 1 candidates) skipped the model entirely. */
  trace: AssistantTraceEntry[]
  /** The request's own `turnVersion`, echoed back verbatim — see `useAssistantFlow.ts`'s `isStaleTurn`. */
  turnVersion?: number
}

/** Step 2 of the assistant flow (only for actions that need an existing item) — picks a candidate `itemID` for `entity`, or `null` if none clearly match. Pass `priorItemID` when the admin said the previous pick was wrong. `model` overrides the admin-configured default for this one call only — see `AssistantPanel`'s model-picker menu. `historyContext` is this turn's already-resolved conversation context (from `assistantSelectIntent`'s own result), spliced straight in — never resolved again here. */
export async function assistantSelectItem(
  token: string,
  input: {
    entity: string
    action: string
    message: string
    searchText: string
    uiLanguage: 'no' | 'en'
    priorItemID?: string
    model?: AssistantModel
    historyContext?: string
    provider?: AssistantProvider
    localModel?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<AssistantSelectItemResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/select-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't find a matching item")
  }
  return response.json() as Promise<AssistantSelectItemResult>
}

export interface AssistantFillFieldsClarification {
  field: string
  questionKey: string
  options: { id: string; label: string }[]
}

/** How sure a staged draft's own field value is — client-side mirror of `server/assistant/fieldConfidence.ts`'s own `FieldConfidence`. Drives `AssistantReviewSummary`'s confidence styling. */
export type FieldConfidence = 'verbatim' | 'inferred' | 'unknown'

/**
 * `'clarify'` — one or more fields worth asking about (see
 * `server/assistant/types.ts`'s `AssistantEntity.clarifiableFields`) came
 * back unresolved; re-call `assistantFillFields` with `resolvedFields` set
 * once the admin has answered every one shown. `'ready'` — the normal staged
 * draft, same shape as before this was a union.
 */
export type AssistantFillFieldsResult =
  | {
      status: 'ready'
      draft: unknown
      issues: { code: string; params?: Record<string, string> }[]
      fieldConfidence: Record<string, FieldConfidence>
      posture: 'safe' | 'full'
      trace: AssistantTraceEntry[]
      /** Names of server-side post-checks that still failed after their one retry — see `server/assistant/postChecks/framework.ts`'s `PostCheckRunResult`. Empty for the common case; a non-empty array means `AssistantPanel` should show a warning rather than silently trusting this draft. */
      flaggedChecks: string[]
      turnVersion?: number
    }
  | { status: 'clarify'; clarifications: AssistantFillFieldsClarification[]; trace: AssistantTraceEntry[]; historyContext: string | null; turnVersion?: number }

/** Step 3 of the assistant flow — proposes (never writes) a draft for `entity`/`action`, merged onto the current item (`itemID`) or empty defaults. `image` is the vision-extraction input (see `AssistantPanel`'s attach flow); `priorDraft` is set when this call is a correction from the review step; `resolvedFields` carries the admin's own answers to a prior `'clarify'` result; `model` overrides the admin-configured default for this one call only — see `AssistantPanel`'s model-picker menu. `history` (raw recent-transcript text) is only sent when this call is itself the first of its turn/continuation (the `reviewingForm`-correction path, which bypasses `assistantSelectIntent`); `historyContext` is an already-resolved value from an earlier call in the same turn. Mutually exclusive. */
export async function assistantFillFields(
  token: string,
  input: {
    entity: string
    action: string
    message: string
    uiLanguage: 'no' | 'en'
    itemID?: string
    image?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string }
    priorDraft?: unknown
    resolvedFields?: Record<string, string>
    model?: AssistantModel
    history?: string
    historyContext?: string
    provider?: AssistantProvider
    localModel?: string
    localVisionModel?: string
    posture?: AssistantIngestionPosture
    conversationId?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<AssistantFillFieldsResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/fill-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not draft that change')
  }
  return response.json() as Promise<AssistantFillFieldsResult>
}

/** Client-side mirror of `server/assistant/steps.ts`'s own `FillFieldsBatchClarification`. */
export interface AssistantFillFieldsBatchClarification {
  field: string
  questionKey: string
  options: { id: string; label: string }[]
  recordIndices: number[]
}

/**
 * `'clarify'` — same meaning as `AssistantFillFieldsResult`'s own `'clarify'`, but one question can
 * cover several of the eventual records at once (see `AssistantFillFieldsBatchClarification.recordIndices`).
 * `recordCount` lets the caller (`useAssistantFlow.ts`) collapse straight into the existing
 * single-record `'clarifying'` flow when the batch turns out to describe exactly one record.
 * `'ready'` carries one draft per record, in the order the model proposed them.
 */
export type AssistantFillFieldsBatchResult =
  | { status: 'clarify'; clarifications: AssistantFillFieldsBatchClarification[]; recordCount: number; trace: AssistantTraceEntry[]; historyContext: string | null; turnVersion?: number }
  | { status: 'ready'; drafts: { draft: unknown; issues: { code: string; params?: Record<string, string> }[]; fieldConfidence: Record<string, FieldConfidence> }[]; posture: 'safe' | 'full'; trace: AssistantTraceEntry[]; turnVersion?: number }

/** Batch sibling of `assistantFillFields` — `create` only, one or more staged records from a single message (e.g. "10 new coffee variants"). See `server/assistant/steps.ts`'s own `fillFieldsBatch` doc comment for why there's no separate "how many records" step. */
export async function assistantFillFieldsBatch(
  token: string,
  input: {
    entity: string
    message: string
    uiLanguage: 'no' | 'en'
    resolvedFields?: Record<string, string>
    model?: AssistantModel
    history?: string
    historyContext?: string
    provider?: AssistantProvider
    localModel?: string
    posture?: AssistantIngestionPosture
    conversationId?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<AssistantFillFieldsBatchResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/fill-fields-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not draft that change')
  }
  return response.json() as Promise<AssistantFillFieldsBatchResult>
}

/** Resolves one or more outstanding `assistantFillFields` clarifications from a free-text chat reply instead of a tap — see `useAssistantFlow.ts`'s `answerClarificationFromChat`. Never writes anything; the model only ever picks from the given closed set of option ids per question, or leaves one unresolved. */
export async function assistantResolveClarification(
  token: string,
  input: {
    clarifications: AssistantFillFieldsClarification[]
    message: string
    uiLanguage: 'no' | 'en'
    model?: AssistantModel
    provider?: AssistantProvider
    localModel?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<{ resolvedFields: Record<string, string>; trace: AssistantTraceEntry[]; turnVersion?: number }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/resolve-clarification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't resolve that")
  }
  return response.json() as Promise<{ resolvedFields: Record<string, string>; trace: AssistantTraceEntry[]; turnVersion?: number }>
}

/** Names a just-finished conversation for the admin's own conversation log (see `useAssistantConversationLog`) — `transcriptText` is a plain-text rendering of the chat, not structured data. Never writes anything; same posture as the other assistant steps. `model` overrides the admin-configured default for this one call only — see `AssistantPanel`'s model-picker menu. */
export async function assistantGenerateTitle(
  token: string,
  transcriptText: string,
  uiLanguage: 'no' | 'en',
  model?: AssistantModel,
  provider?: AssistantProvider,
  localModel?: string,
  turnVersion?: number,
  signal?: AbortSignal,
): Promise<{ title: string; turnVersion?: number }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcriptText, uiLanguage, model, provider, localModel, turnVersion }),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not generate a title for this conversation')
  }
  return response.json() as Promise<{ title: string; turnVersion?: number }>
}

/** The admin's own override of how much data a lookup answer processes per call at once — see `AssistantPanel`'s kebab-menu chunk-size setting. `'auto'` means "use the active model/provider's own default." */
export type ChunkSizePreference = 'auto' | 'small' | 'medium' | 'large' | 'custom'

/** The admin's own override of `assistantFillFields`/`assistantFillFieldsBatch`'s ingestion posture — see `AssistantPanel`'s kebab-menu "Ekstra forsiktig modus" setting and `server/assistant/steps.ts`'s own `AssistantIngestionPosture` (this is its client-side mirror). `'auto'` resolves per the active provider server-side; `'safe'`/`'full'` force one or the other regardless of provider. */
export type AssistantIngestionPosture = 'auto' | 'safe' | 'full'

/**
 * `'ready'` — a complete answer. `'clarifyItem'` — the question named one
 * specific item, but 2+ real candidates matched and nothing confidently
 * narrowed it down further (e.g. two products sharing the exact same name
 * across categories) — show `candidates` as a plain pick-one list (same
 * shape as `AssistantSelectItemResult.candidates`) and re-answer via
 * `assistantAnswerLookupForItem` once the admin picks one, rather than
 * silently guessing.
 */
export type AssistantLookupResult =
  | { status: 'ready'; reply: string; list?: AssistantReplyList; trace: AssistantTraceEntry[]; turnVersion?: number }
  | {
      status: 'clarifyItem'
      entityKey: string
      candidates: { id: string; label: string }[]
      trace: AssistantTraceEntry[]
      turnVersion?: number
      /** Set only when these candidates came from the product-name resolution ladder's tier 4/5 (see `server/assistant/steps.ts`'s `AnswerLookupResult`) — pass this straight back, unchanged, as `assistantAnswerLookupForItem`'s own `aliasHarvest` once the admin picks one. */
      aliasHarvest?: { query: string; tier: '4' | '5'; presentationId: string }
    }

/** Answers a factual question about the cafe's own current dashboard data — called when `assistantSelectIntent` returns a non-empty `lookupEntities` instead of a plain `reply`. Never writes anything; same posture as the other assistant steps. `model` overrides the admin-configured default for this one call only; `chunkSizePreference`/`customChunkRecordCount` override how much data is processed per call at once — see `AssistantPanel`'s kebab menu for both. `historyContext` is this turn's already-resolved conversation context (from `assistantSelectIntent`'s own result). `itemSearchText` (`assistantSelectIntent`'s own `searchText`) engages the server's single-item fast path when the question named one specific item, skipping the batch scan entirely for it — see `AssistantLookupResult`'s own doc comment for what happens when that's still ambiguous. */
export async function assistantAnswerLookup(
  token: string,
  input: {
    message: string
    uiLanguage: 'no' | 'en'
    entities: string[]
    model?: AssistantModel
    chunkSizePreference?: ChunkSizePreference
    customChunkRecordCount?: number
    historyContext?: string
    provider?: AssistantProvider
    itemSearchText?: string
    localModel?: string
    baseFilters?: AssistantLookupFilter[] | null
    conversationId?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<AssistantLookupResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't look that up")
  }
  return response.json() as Promise<AssistantLookupResult>
}

/** The continuation call once the admin has picked one specific candidate off an `assistantAnswerLookup` `'clarifyItem'` result — answers directly from that one, now-unambiguous record. Never searches or picks anything itself. */
export async function assistantAnswerLookupForItem(
  token: string,
  input: {
    entity: string
    itemID: string
    message: string
    uiLanguage: 'no' | 'en'
    historyContext?: string
    model?: AssistantModel
    provider?: AssistantProvider
    localModel?: string
    label?: string
    conversationId?: string
    /** See `AssistantLookupResult`'s own `clarifyItem.aliasHarvest` doc comment — pass back exactly what that result carried, unchanged. */
    aliasHarvest?: { query: string; tier: '4' | '5'; presentationId: string }
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<{ reply: string; trace: AssistantTraceEntry[]; turnVersion?: number }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/lookup-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't look that up")
  }
  return response.json() as Promise<{ reply: string; trace: AssistantTraceEntry[]; turnVersion?: number }>
}

export interface OllamaConfig {
  baseUrl: string
  visionModel: string
  thinkingModel: string
}

/** The assistant's local/offline provider config (see Settings → Advanced's "Local" option and the Integrations page's Ollama card) — never secret, unlike the Claude API key, but still `admin`/`subadmin` only since it configures the same feature. */
export async function getOllamaConfig(token: string): Promise<OllamaConfig> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-config`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view the assistant configuration')
  if (!response.ok) throw new Error('Could not load the Ollama configuration')
  return response.json() as Promise<OllamaConfig>
}

/** Saves the Ollama host/model config — pass only the field(s) being changed, `undefined` leaves the others untouched. `admin`/`subadmin` only. */
export async function setOllamaConfig(token: string, input: Partial<OllamaConfig>): Promise<OllamaConfig> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the Ollama configuration')
  }
  return response.json() as Promise<OllamaConfig>
}

export interface OllamaConnectionTestResult {
  ok: boolean
  error?: string
  installedModels?: string[]
  visionModelInstalled?: boolean
  thinkingModelInstalled?: boolean
}

/** Checks whether the configured (or a not-yet-saved `draft`) Ollama host is reachable, and which of its two model tags are actually pulled — backs the Integrations page's "Test connection" button. `admin`/`subadmin` only. */
export async function testOllamaConnection(token: string, draft?: Partial<OllamaConfig>): Promise<OllamaConnectionTestResult> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(draft ?? {}),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Could not test the Ollama connection')
  return response.json() as Promise<OllamaConnectionTestResult>
}

/** Pulls a model tag onto the configured Ollama host — backs the Integrations page's "Download missing model" button and its own model manager's "Add a model" field. First pulls are a one-time few-GB download, so this can take several minutes. `admin`/`subadmin` only. */
export async function pullOllamaModel(token: string, tag: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tag }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Could not download "${tag}"`)
  }
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

export interface OllamaModelInfo {
  name: string
  /** Bytes on disk — shown as a human-readable size by the model manager. */
  size: number
}

/** Every model tag actually pulled on the configured Ollama host, not just the two configured vision/thinking roles — backs the Integrations page's own model manager submenu. `admin`/`subadmin` only. */
export async function listOllamaModels(token: string): Promise<{ ok: boolean; models?: OllamaModelInfo[]; error?: string }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-models`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view the assistant configuration')
  if (!response.ok) throw new Error('Could not load the list of installed Ollama models')
  return response.json() as Promise<{ ok: boolean; models?: OllamaModelInfo[]; error?: string }>
}

/** Removes a model tag from the configured Ollama host — backs the model manager's own "Delete" button. `admin`/`subadmin` only. */
export async function deleteOllamaModel(token: string, tag: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/ollama-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tag }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Could not delete "${tag}"`)
  }
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

/** The generic "just read this photo" mode (see `AssistantPanel`'s image-mode toggle) — reads any photographed document (not just this cafe's own data) and returns a transcription, with no draft/review step at all. Never writes anything; same posture as the other assistant steps. `model` overrides the admin-configured default for this one call only (Claude path only). `localVisionModel` is the Ollama-path equivalent — see `AssistantPanel`'s model-picker menu. */
export async function assistantTranscribeAttachment(
  token: string,
  input: {
    message: string
    uiLanguage: 'no' | 'en'
    image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string }
    model?: AssistantModel
    provider?: AssistantProvider
    localModel?: string
    localVisionModel?: string
    turnVersion?: number
  },
  signal?: AbortSignal,
): Promise<{ text: string; trace: AssistantTraceEntry[]; turnVersion?: number }> {
  const response = await fetch(`${serverBaseUrl()}/assistant/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "Couldn't read that photo")
  }
  return response.json() as Promise<{ text: string; trace: AssistantTraceEntry[]; turnVersion?: number }>
}

/** How a screen's own `/screens/:screenId` link should be addressed (see Settings → Advanced) — public, no auth needed. */
export async function getScreenAddressSettings(): Promise<ScreenAddressSettings> {
  const response = await fetch(`${serverBaseUrl()}/screen-address`)
  if (!response.ok) throw new Error('Could not load the screen address settings')
  return response.json() as Promise<ScreenAddressSettings>
}

/** Saves the screen address settings — the local server applies any mDNS advertisement change immediately, no restart needed. `admin`/`subadmin` only. */
export async function setScreenAddressSettings(token: string, settings: ScreenAddressSettings): Promise<ScreenAddressSettings> {
  const response = await fetch(`${serverBaseUrl()}/screen-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the screen address settings')
  }
  return response.json() as Promise<ScreenAddressSettings>
}

/** Which window a Windows machine opens the kiosk display in at boot (see Settings → Advanced) — public, no auth needed. */
export async function getWindowLaunchSettings(): Promise<WindowLaunchSettings> {
  const response = await fetch(`${serverBaseUrl()}/window-launch-method`)
  if (!response.ok) throw new Error('Could not load the window launch settings')
  return response.json() as Promise<WindowLaunchSettings>
}

/** Saves the window launch method — takes effect next time `start-adhdisplay.bat` runs (on the next restart), not live. `admin`/`subadmin` only. */
export async function setWindowLaunchSettings(token: string, settings: WindowLaunchSettings): Promise<WindowLaunchSettings> {
  const response = await fetch(`${serverBaseUrl()}/window-launch-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the window launch settings')
  }
  return response.json() as Promise<WindowLaunchSettings>
}

// --- Users (admin dashboard's own "Users" tab) -------------------------------

/** One user account, as returned by the server — never includes the password. */
export interface AdminUserSummary {
  id: string
  username: string
  role: AdminRole
  allowedSections?: DashboardSection[]
}

/** Every configured account. `admin`/`subadmin` only. */
export async function listUsers(token: string): Promise<AdminUserSummary[]> {
  const response = await fetch(`${serverBaseUrl()}/users`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can manage users')
  if (!response.ok) throw new Error('Could not load users')
  return response.json() as Promise<AdminUserSummary[]>
}

/** Creates a new account. Throws if the username is already taken, or a `subadmin` session tries to create an `admin`-role account. */
export async function createUser(token: string, input: { username: string; password: string; role: AdminRole; allowedSections?: DashboardSection[] }): Promise<AdminUserSummary> {
  const response = await fetch(`${serverBaseUrl()}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not create the user')
  }
  return response.json() as Promise<AdminUserSummary>
}

/** Deletes an account by id. Throws if it's the caller's own account, an admin-role account being deleted by a `subadmin`, the last remaining admin account, or the account no longer exists. */
export async function deleteUser(token: string, id: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not delete the user')
  }
}

/** Overwrites an account's password — the "Reset password" action, available for any account regardless of role. */
export async function resetUserPassword(token: string, id: string, password: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/users/${id}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not reset the password')
  }
}

// --- Backup (Settings → Backup) ----------------------------------------------

/** Whether the server-side sibling `ADHDisplayBackup` folder exists, and when it was last updated — `null` if it's never been written to yet. `admin`/`subadmin` only. */
export async function getBackupStatus(token: string): Promise<{ folderBackupAvailable: boolean; updatedAt: string | null }> {
  const response = await fetch(`${serverBaseUrl()}/backups/status`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view backup status')
  if (!response.ok) throw new Error('Could not load backup status')
  return response.json() as Promise<{ folderBackupAvailable: boolean; updatedAt: string | null }>
}

/** Downloads a fresh backup zip (every synced key, user account, and uploaded image) as a `Blob` — the caller turns this into a browser download via `URL.createObjectURL`. `admin`/`subadmin` only. */
export async function createBackup(token: string): Promise<Blob> {
  const response = await fetch(`${serverBaseUrl()}/backups`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can create a backup')
  if (!response.ok) throw new Error('Could not create a backup')
  return response.blob()
}

/** Restores from an uploaded backup zip, overwriting all current data. `admin`/`subadmin` only. */
export async function restoreBackupFromZip(token: string, file: File): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip', Authorization: `Bearer ${token}` },
    body: file,
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not restore from this backup zip')
  }
}

/** Restores directly from the sibling `ADHDisplayBackup` folder on the server's own disk, overwriting all current data. `admin`/`subadmin` only. */
export async function restoreFromBackupFolder(token: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/backups/restore-from-folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not restore from the backup folder')
  }
}

export interface CleanupPreview {
  retentionDays: number
  displayMachineStaleDays: number
  orders: { id: string; createdAt: string; customerName: string; totalPrice: number }[]
  messages: { id: string; receivedAt: string; subject: string; name: string }[]
  messageBoardPosts: { id: string; title: string; expiresAt: string }[]
  displayMachines: { machineID: string; label: string; lastSeenAt: string }[]
  images: { filename: string; url: string; thumbUrl: string; sizeBytes: number; uploadedAt: string }[]
}

/** Ids/filenames the admin explicitly confirmed deleting, from a `CleanupPreview` they reviewed. */
export interface CleanupSelection {
  orderIds?: string[]
  messageIds?: string[]
  messageBoardPostIds?: string[]
  displayMachineIds?: string[]
  imageFilenames?: string[]
}

export interface CleanupResult {
  deletedOrders: number
  deletedMessages: number
  deletedMessageBoardPosts: number
  deletedDisplayMachines: number
  deletedImages: number
}

/** Everything currently prunable (old orders/messages, expired message-board posts, stale display machines, orphaned uploaded images) — read-only, deletes nothing. `admin`/`subadmin` only. See `server/storageCleanup.ts`. */
export async function getCleanupPreview(token: string): Promise<CleanupPreview> {
  const response = await fetch(`${serverBaseUrl()}/storage-cleanup/preview`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can view storage cleanup')
  if (!response.ok) throw new Error('Could not load storage cleanup preview')
  return response.json() as Promise<CleanupPreview>
}

/** Deletes exactly the ids/filenames in `selection` — each re-checked server-side as still prunable right before deletion, so this is safe to call with a preview that's gone slightly stale. `admin`/`subadmin` only. */
export async function applyCleanup(token: string, selection: CleanupSelection): Promise<CleanupResult> {
  const response = await fetch(`${serverBaseUrl()}/storage-cleanup/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(selection),
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (response.status === 403) throw new Error('Only admin/subadmin accounts can apply storage cleanup')
  if (!response.ok) throw new Error('Could not apply storage cleanup')
  return response.json() as Promise<CleanupResult>
}
