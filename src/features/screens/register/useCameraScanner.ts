import { useEffect, useRef, useState } from 'react'
import { cameraScanAvailable, onCameraScanCode, setCameraPreview, startCameraScan, stopCameraScan } from '../../../lib/companionBridge'

/** The same code read again within this window is the camera seeing one code twice, not a second scan. */
const REPEAT_WINDOW_MS = 2000

/** What the register's camera switch needs to show. */
export interface CameraScanner {
  /** Whether this app build can scan with the camera at all. The switch is hidden when not. */
  available: boolean
  /** Whether the camera is actually running right now (switch on, page visible, started without error). */
  active: boolean
  /** The camera failed to start (e.g. camera permission refused). */
  failed: boolean
}

/**
 * Camera scanning through the Companion app (its back and front cameras at once), controlled by the register's privacy switch. The camera
 * only runs while `enabled` is on *and* the page is visible, and is released the moment either stops
 * being true (or the register unmounts, e.g. on a screen change). `showPreview` shows or hides the
 * small aiming preview without restarting the camera. Codes arrive through `onScan`, the same path as
 * the keyboard-wedge scanner.
 */
export function useCameraScanner(enabled: boolean, showPreview: boolean, onScan: (raw: string) => void): CameraScanner {
  const [available, setAvailable] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const [startedFor, setStartedFor] = useState<string | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const handler = useRef(onScan)
  const preview = useRef(showPreview)
  useEffect(() => {
    handler.current = onScan
    preview.current = showPreview
  })

  useEffect(() => {
    let alive = true
    void cameraScanAvailable().then((result) => {
      if (alive) setAvailable(result)
    })
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const running = enabled && available && visible
  // Both cameras scan at once, so there is one kind of run; a late answer from an earlier run is dropped by `cancelled` below.
  const runKey = running ? 'on' : null

  useEffect(() => {
    if (!runKey) return
    let cancelled = false
    let last = { code: '', at: 0 }
    const unsubscribe = onCameraScanCode((code) => {
      const now = Date.now()
      if (code === last.code && now - last.at < REPEAT_WINDOW_MS) return
      last = { code, at: now }
      handler.current(code)
    })
    startCameraScan({ showPreview: preview.current }).then(
      () => {
        if (cancelled) return
        setStartedFor(runKey)
        setFailedFor(null)
      },
      () => {
        if (!cancelled) setFailedFor(runKey)
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
      void stopCameraScan()
    }
  }, [runKey])

  useEffect(() => {
    if (runKey) void setCameraPreview(showPreview).catch(() => undefined)
  }, [runKey, showPreview])

  return { available, active: runKey !== null && startedFor === runKey && failedFor !== runKey, failed: runKey !== null && failedFor === runKey }
}
