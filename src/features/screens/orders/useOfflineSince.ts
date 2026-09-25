import { useState } from 'react'
import { useConnectionStatus } from '../../../hooks/useConnectionStatus'

/**
 * When the sync connection was lost, or `null` while connected — for the order boards' "Not
 * connected, last updated HH:MM" banner. Uses `useConnectionStatus`, so a brief reconnect blip never
 * shows it. The time recorded is when this board noticed the drop, which is when its data was last
 * known to be live.
 */
export function useOfflineSince(): Date | null {
  const connected = useConnectionStatus()
  const [since, setSince] = useState<Date | null>(null)
  // Derived during render rather than in an effect (React's recommended pattern), so the banner and
  // the disabled arrows appear in the same frame the connection is reported down.
  if (!connected && since === null) setSince(new Date())
  if (connected && since !== null) setSince(null)
  return since
}
