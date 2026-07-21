/** A sidebar item a store can opt out of showing entirely — every `AdminSidebarNav` item except `overview` (the dashboard home) and `settings` (where this very list is edited), both of which stay visible unconditionally. Store settings (company name/logo/favicon + nested Contact info) and Display Manager no longer have their own sidebar entries — Store moved under Settings, Display Manager moved under Screens, both as submenus — so neither is part of this list. */
export type ToggleableSidebarItem = 'messages' | 'products' | 'events' | 'orders' | 'screens' | 'extensions' | 'media' | 'messageboard'

/** Store-wide sidebar customization, edited from the admin's Settings tab — different businesses use different features (e.g. no online ordering, no digital signage), so each can hide the sidebar items it doesn't need. */
export interface SidebarSettings {
  /** Items hidden from the sidebar — everything not listed here shows, so a store with no prior settings sees every item exactly as before. */
  hiddenItems: ToggleableSidebarItem[]
}

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = { hiddenItems: [] }
