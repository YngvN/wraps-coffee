import type { DisplayConnectionType } from '../../../types/displayMachine'

/**
 * i18n key for a machine's own connection-type badge — extends the same
 * convention `admin.displayManager.electronBadge`/`viaUrlBadge` already had
 * to a third `mobile` (ADHDisplay Companion) case. A standalone file (not
 * exported from `DisplayManagerView.tsx` itself) purely so Fast Refresh
 * doesn't choke on a component file exporting a plain function — shared by
 * `DisplayManagerView.tsx` and `useGlobalSearchIndex.tsx`'s own
 * display-machine search entries, one mapping rather than two copies
 * drifting apart.
 */
export function connectionBadgeId(connectionType: DisplayConnectionType): string {
  if (connectionType === 'mobile') return 'admin.displayManager.mobileBadge'
  if (connectionType === 'url') return 'admin.displayManager.viaUrlBadge'
  return 'admin.displayManager.electronBadge'
}
