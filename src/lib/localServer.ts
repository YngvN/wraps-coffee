import type { DepartureInfo, NearbyStop, WeatherHour } from '../types/extensions'
import type { ScreenAddressSettings } from '../types/screenAddress'
import type { AdminRole, AdminSession, DashboardSection } from '../types/sync'

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

/** Uploads an image file, which the server also compresses into `-small`/`-thumb` companion variants. Returns the original's URL — same shape whether or not compression succeeded. */
export async function uploadImage(file: File, token: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${serverBaseUrl()}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` },
      body: file,
    })
  } catch {
    throw new UploadError('Could not reach the local server. Is it running?')
  }

  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new UploadError(body.error ?? 'Upload failed')
  }

  const { url } = (await response.json()) as { url: string }
  return url
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

/** One entry in the Image Library — every original currently stored on the server, newest first. */
export interface UploadedImage {
  filename: string
  url: string
  thumbUrl: string
  sizeBytes: number
  uploadedAt: string
}

export async function listUploads(token: string): Promise<UploadedImage[]> {
  const response = await fetch(`${serverBaseUrl()}/uploads`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new SessionExpiredError('Your session is no longer valid.')
  if (!response.ok) throw new Error('Failed to list uploads')
  return response.json() as Promise<UploadedImage[]>
}

/** True if `url` was served by this same local server's `/uploads/` — the only URLs it's safe to try compressing/deleting via this server's own endpoints. */
export function isOwnUploadUrl(url: string): boolean {
  return url.startsWith(`${serverBaseUrl()}/uploads/`)
}

/** Geocodes `address` and finds nearby transit stops — backs the Extensions tab's "Look up address" action. No auth needed (public proxy of public data); throws a plain `Error` if the server or Entur is unreachable. */
export async function lookupAddress(address: string): Promise<{ coordinates: { lat: number; lon: number } | null; nearbyStops: NearbyStop[] }> {
  const response = await fetch(`${serverBaseUrl()}/extensions/lookup?address=${encodeURIComponent(address)}`)
  if (!response.ok) throw new Error('Could not look up this address')
  return response.json() as Promise<{ coordinates: { lat: number; lon: number } | null; nearbyStops: NearbyStop[] }>
}

/** Fetches the next `count` departures for `stopId`, used by `TransitSlide`'s polling hook. No auth needed — public proxy, same posture as image reads. */
export async function fetchDepartures(stopId: string, count: number): Promise<{ stopName: string; departures: DepartureInfo[] }> {
  const response = await fetch(`${serverBaseUrl()}/extensions/departures?stopId=${encodeURIComponent(stopId)}&count=${count}`)
  if (!response.ok) throw new Error('Could not fetch departures')
  return response.json() as Promise<{ stopName: string; departures: DepartureInfo[] }>
}

/** Fetches the next `hours` hours of forecast for `(lat, lon)`, used by `WeatherSlide`'s polling hook. */
export async function fetchWeather(lat: number, lon: number, hours: number): Promise<{ hourly: WeatherHour[] }> {
  const response = await fetch(`${serverBaseUrl()}/extensions/weather?lat=${lat}&lon=${lon}&hours=${hours}`)
  if (!response.ok) throw new Error('Could not fetch a forecast')
  return response.json() as Promise<{ hourly: WeatherHour[] }>
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
