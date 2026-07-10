/** A sidebar item a cafe can opt out of showing entirely — every `AdminSidebarNav` item except `overview` (the dashboard home) and `settings` (where this very list is edited), both of which stay visible unconditionally. */
export type ToggleableSidebarItem = 'messages' | 'products' | 'events' | 'instagram' | 'contact' | 'orders' | 'screens' | 'extensions' | 'images' | 'messageboard'

/** Cafe-wide sidebar customization, edited from the admin's Settings tab — different cafes use different features (e.g. no online ordering, no digital signage), so each can hide the sidebar items it doesn't need. */
export interface SidebarSettings {
  /** Items hidden from the sidebar — everything not listed here shows, so a cafe with no prior settings sees every item exactly as before. */
  hiddenItems: ToggleableSidebarItem[]
}

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = { hiddenItems: [] }
