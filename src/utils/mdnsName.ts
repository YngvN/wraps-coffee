/** Sanitizes a raw string into a valid mDNS hostname label — real `.local` names are lowercase alphanumeric plus hyphens only. Used both client- and server-side so the preview shown in `AdvancedSettingsView` always matches what the server actually advertises. */
export function sanitizeMdnsName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
}

/** The mDNS name a store's screens advertise, derived from its own name (see `StoreSettings.name`) rather than a separately typed field — e.g. `"Wraps & Coffee"` → `"wraps-coffee-screen"`, shown as `<name>.local`. */
export function deriveMdnsName(storeName: string): string {
  return `${sanitizeMdnsName(storeName)}-screen`
}
