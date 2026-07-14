/** How a screen's own `/screens/:screenId` link should be addressed (see Settings → Advanced). */
export type ScreenAddressMode = 'automatic' | 'custom' | 'mdns'

/**
 * The admin-chosen strategy for building a screen's shown/copied/opened
 * link — `automatic` (the default) auto-detects this machine's own LAN IP,
 * `custom` uses an admin-typed hostname/IP (e.g. one they've DHCP-reserved
 * on their router), and `mdns` has the local server itself advertise a
 * stable `.local` name on the network, derived from the store's own name
 * (see `src/utils/mdnsName.ts`) rather than a separately typed field.
 * Machine-level, not per-device — stored server-side via dedicated
 * `/screen-address` routes, same posture as the Neon database URL override,
 * not part of the generic synced-key system.
 */
export interface ScreenAddressSettings {
  mode: ScreenAddressMode
  /** Used when `mode === 'custom'` — an admin-typed hostname or IP. */
  customHost?: string
}

export const DEFAULT_SCREEN_ADDRESS_SETTINGS: ScreenAddressSettings = { mode: 'automatic' }
