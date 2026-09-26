/**
 * The plumbing under `registerApi.ts` and `registerSessionApi.ts`: one JSON request helper, plus the
 * register page's signed-in staff session. The session token is kept here, once, and added to every
 * POST body as `sessionToken`, so no caller has to thread it through; when the server answers that
 * nobody is signed in (401 `signedOut` — the session ran out on the server), every listener hears
 * about it and the register returns to its staff list. One register per page, so one session.
 */
import { serverBaseUrl } from './localServer'

let sessionToken: string | null = null
const signedOutListeners = new Set<() => void>()

/** Sets (or clears) the signed-in staff member's session token sent with every register request. */
export function setRegisterSessionToken(token: string | null): void {
  sessionToken = token
}

/** The current session token, for the one request that can't carry it in a JSON body (a photo upload). */
export function registerSessionToken(): string | null {
  return sessionToken
}

/** Calls `listener` whenever the server says nobody is signed in. Returns an unsubscribe function. */
export function onRegisterSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener)
  return () => signedOutListeners.delete(listener)
}

/** Tells every listener the server has signed this register out (also used after an upload's 401). */
export function notifyRegisterSignedOut(): void {
  for (const listener of signedOutListeners) listener()
}

/** Sends a JSON request and returns the status and parsed body; rejects only on a network failure. POST bodies get the session token. */
export async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<{ status: number; body: T }> {
  const payload = body === undefined ? undefined : { ...body, sessionToken: sessionToken ?? undefined }
  const response = await fetch(`${serverBaseUrl()}${path}`, {
    method,
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const parsed = (await response.json().catch(() => ({}))) as T
  if (response.status === 401 && (parsed as { reason?: string })?.reason === 'signedOut') notifyRegisterSignedOut()
  return { status: response.status, body: parsed }
}

/** Throws the server's own message for a status the caller didn't expect. */
export function unexpected(status: number, body: unknown): never {
  throw new Error((body as { error?: string })?.error ?? `The server answered ${status}`)
}

/** The `deviceId=` query parameter every GET carries. */
export const query = (deviceId: string) => `deviceId=${encodeURIComponent(deviceId)}`
