import { DashboardScreensaver } from '../features/admin/layout/DashboardScreensaver'

/**
 * What a managed display shows once it's reachably connected to a server but
 * hasn't been assigned a Screen yet (see `electron/displayManager.cjs` and
 * `DisplayConnect.tsx`) — reuses the same bouncing-store-name visual as the
 * admin dashboard's own idle screensaver, unconditionally rather than
 * idle-gated, since it's this whole page's only content. Distinct from the
 * "Waiting for connection" state (no reachable server at all), which can't
 * be a served route since there's nothing to load it from — that's rendered
 * natively by Electron instead.
 */
export function DisplayStandby() {
  return <DashboardScreensaver />
}
