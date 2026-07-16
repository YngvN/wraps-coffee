import { useEffect, useState } from 'react'
import { subscribeToConnectionStatus } from '../lib/syncClient'

/** How long the shared socket has to stay disconnected before this hook reports it — a brief reconnect blip (the exponential backoff in `syncClient` retries within seconds) shouldn't flash a "no connection" indicator on and off. Reconnecting clears back to `true` immediately, with no matching delay. */
const DISCONNECT_GRACE_MS = 3000

/** Whether this tab's shared WebSocket connection to the local server is currently open — for a kiosk screen, `false` means it's showing whatever it already had stored rather than live data. See `DISCONNECT_GRACE_MS` for why "went offline" is debounced but "came back" isn't. */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeToConnectionStatus((isConnected) => {
      if (isConnected) {
        clearTimeout(graceTimer)
        setConnected(true)
      } else {
        graceTimer = setTimeout(() => setConnected(false), DISCONNECT_GRACE_MS)
      }
    })
    return () => {
      clearTimeout(graceTimer)
      unsubscribe()
    }
  }, [])

  return connected
}
