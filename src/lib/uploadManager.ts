import { useSyncExternalStore } from 'react'
import { listUploads, retryVideoUpload, uploadImage, uploadVideo, type UploadedMedia } from './localServer'

export interface TrackedUpload {
  id: string
  fileName: string
  kind: 'image' | 'video'
  /** 0-1, upload (network transfer) phase only — the server-side video transcode that follows has no meaningful percentage, see `status`. */
  progress: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  result?: UploadedMedia
  errorMessage?: string
  /** The server's own id for a video upload (distinct from this tracked upload's own client-side `id`) — needed to target a later `retryVideoUpload` call. Never set for an image. */
  videoId?: string
}

type Listener = () => void

// Module-level, not component state, so a transfer keeps running (and stays
// visible to whichever admin page is open) regardless of which component
// started it, or whether that component is even still mounted — the whole
// point of this file is that navigating away from a form mid-upload of a
// large video doesn't cancel it or lose its progress.
const uploads = new Map<string, TrackedUpload>()
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let snapshot: TrackedUpload[] = []
function getSnapshot(): TrackedUpload[] {
  return snapshot
}

function setUpload(id: string, patch: Partial<TrackedUpload>) {
  const current = uploads.get(id)
  if (!current) return
  uploads.set(id, { ...current, ...patch })
  snapshot = Array.from(uploads.values())
  notify()
}

const POLL_INTERVAL_MS = 3000

/** Re-checks `listUploads()` every few seconds until this video's own entry flips to ready or failed — the only way to learn that, since the background transcode has no push notification of its own. */
async function pollUntilReady(id: string, filename: string, token: string) {
  for (;;) {
    if (uploads.get(id)?.status !== 'processing') return
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (uploads.get(id)?.status !== 'processing') return

    let entries: UploadedMedia[]
    try {
      entries = await listUploads(token)
    } catch {
      continue // transient — keep polling rather than giving up on a blip
    }
    const match = entries.find((entry) => entry.filename === filename)
    if (!match || match.status === 'processing') continue // not listed yet is a brief race right after the 202
    if (match.status === 'failed') {
      setUpload(id, { status: 'failed', errorMessage: match.errorMessage, result: match })
      return
    }
    setUpload(id, { status: 'ready', result: match })
    return
  }
}

/**
 * Starts an upload immediately, independent of any component's mount state
 * — a form field just renders whatever `useUploads`/`useUpload` reports for
 * the id this returns, so unmounting that field (switching form tabs,
 * navigating to a different admin page) never interrupts the transfer or
 * loses its progress. Returns the tracked upload's own id.
 */
export function startUpload(file: File, kind: 'image' | 'video', token: string): string {
  const id = crypto.randomUUID()
  uploads.set(id, { id, fileName: file.name, kind, progress: 0, status: 'uploading' })
  snapshot = Array.from(uploads.values())
  notify()

  const onProgress = (fraction: number) => setUpload(id, { progress: fraction })

  if (kind === 'image') {
    uploadImage(file, token, onProgress)
      .then((url) => {
        const filename = url.split('/uploads/')[1] ?? ''
        const result: UploadedMedia = { filename, url, thumbUrl: `${url}?size=thumb`, sizeBytes: file.size, uploadedAt: new Date().toISOString(), kind: 'image' }
        setUpload(id, { status: 'ready', result })
      })
      .catch((error: unknown) => setUpload(id, { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Upload failed' }))
    return id
  }

  uploadVideo(file, token, onProgress)
    .then((ack) => {
      setUpload(id, { status: 'processing', videoId: ack.id })
      void pollUntilReady(id, ack.filename, token)
    })
    .catch((error: unknown) => setUpload(id, { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Upload failed' }))
  return id
}

/** Re-attempts a failed video transcode, reusing the same tracked-upload id so the UI transitions straight back to "processing" instead of vanishing and reappearing as a new entry. No-op for anything that isn't a failed video. */
export function retryUpload(id: string, token: string) {
  const current = uploads.get(id)
  if (!current?.videoId || current.status !== 'failed') return
  setUpload(id, { status: 'processing', errorMessage: undefined })
  retryVideoUpload(current.videoId, token)
    .then((ack) => void pollUntilReady(id, ack.filename, token))
    .catch((error: unknown) => setUpload(id, { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Retry failed' }))
}

/** Drops a finished (ready/failed) upload from tracking, e.g. once its owning field has shown the result and the admin dismisses it. A no-op while still uploading/processing — there's nothing sensible to do with a transfer that's still in flight. */
export function dismissUpload(id: string) {
  const current = uploads.get(id)
  if (!current || current.status === 'uploading' || current.status === 'processing') return
  uploads.delete(id)
  snapshot = Array.from(uploads.values())
  notify()
}

/** Live view of every tracked upload, regardless of which component (if any) originally started them — backs the persistent admin-layout progress indicator. */
export function useUploads(): TrackedUpload[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Convenience for a single tracked upload by id — `undefined` once it's been dismissed or was never started. */
export function useUpload(id: string | undefined): TrackedUpload | undefined {
  const all = useUploads()
  return id ? all.find((upload) => upload.id === id) : undefined
}
