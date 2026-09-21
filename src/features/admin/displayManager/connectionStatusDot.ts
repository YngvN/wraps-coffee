import type { StatusDotStatus } from '../../../components'
import type { DisplayConnectionStatus } from '../../../utils/displayConnection'

/**
 * Maps a `DisplayConnectionStatus` onto the shared `StatusDot`'s own severity
 * vocabulary and an i18n label — the one place the colour meaning of a
 * display's heartbeat age is decided, so the grid, the details sheet and the
 * pending-approval cards can't disagree about what amber means.
 *
 * A standalone file (not exported from `DisplayCard.tsx` itself) purely so
 * Fast Refresh doesn't choke on a component file exporting a plain function —
 * same reasoning, and same shape, as `connectionBadge.ts` next to it.
 */
export function connectionStatusDot(status: DisplayConnectionStatus): { dot: StatusDotStatus; labelId: string } {
  switch (status) {
    case 'online':
      return { dot: 'active', labelId: 'admin.displayManager.connectionOnline' }
    case 'reconnecting':
      return { dot: 'stale', labelId: 'admin.displayManager.connectionReconnecting' }
    case 'offline':
      return { dot: 'inactive', labelId: 'admin.displayManager.connectionOffline' }
    case 'never':
      return { dot: 'disabled', labelId: 'admin.displayManager.connectionNever' }
  }
}
