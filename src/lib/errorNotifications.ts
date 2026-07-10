import { subscribeToErrors } from './syncClient'

/** One reported error — `summary` is the short top-right toast text, `detail` (if present) is the fuller text shown once the toast is clicked open. */
export interface ReportedError {
  summary: string
  detail?: string
}

type Listener = (error: ReportedError) => void

const listeners = new Set<Listener>()

/**
 * Reports a problem for `ErrorToast` to display, top-right, across the whole
 * admin dashboard — for background/operational issues with no obvious
 * inline place to show them (unlike e.g. a login form's own error state).
 * Not specific to any one feature; call this from anywhere. Only the most
 * recently reported error is shown at a time — a new one simply replaces
 * whatever's currently there.
 */
export function reportError(summary: string, detail?: string) {
  const error: ReportedError = { summary, detail }
  for (const listener of listeners) listener(error)
}

/** Subscribes to newly reported errors — used by `ErrorToast` itself. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Forwards server-broadcast operational errors (e.g. the Neon bridge losing
// its connection) into the same `reportError` path a client-side error
// would use, so `ErrorToast` never has to know or care where an error
// originated. A one-time wire-up, same "runs once at module load" shape as
// `syncClient.ts`'s own lazy-connect pattern.
subscribeToErrors((message, detail) => reportError(message, detail))
