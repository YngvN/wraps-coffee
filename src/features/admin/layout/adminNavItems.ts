import {
  EventsIcon,
  ExtensionsIcon,
  ImagesIcon,
  MessageBoardIcon,
  MessagesIcon,
  OrdersIcon,
  OverviewIcon,
  ProductsIcon,
  ScreensIcon,
  SettingsIcon,
  UsersIcon,
} from './AdminNavIcons'

/**
 * One entry in the admin sidebar nav: a route segment and its translation
 * key. `toggleable` marks items a store can opt out of showing (see
 * `useSidebarSettings`) — `overview` and `settings` are never hidden, one
 * being the dashboard home and the other where that very choice is made.
 * Plain data (not a component), kept in its own file — separate from
 * `AdminSidebarNav.tsx`/`AdminNavIcons.tsx` so both stay component-only
 * exports, which React Fast Refresh requires.
 */
export const NAV_ITEMS = [
  { to: 'overview', id: 'admin.nav.overview', adminOnly: false, toggleable: false },
  { to: 'messages', id: 'admin.nav.messages', adminOnly: false, toggleable: true },
  { to: 'products', id: 'admin.nav.products', adminOnly: false, toggleable: true },
  { to: 'events', id: 'admin.nav.events', adminOnly: false, toggleable: true },
  { to: 'orders', id: 'admin.nav.orders', adminOnly: false, toggleable: true },
  { to: 'screens', id: 'admin.nav.screens', adminOnly: false, toggleable: true },
  { to: 'extensions', id: 'admin.nav.extensions', adminOnly: false, toggleable: true },
  { to: 'messageboard', id: 'admin.nav.messageBoard', adminOnly: false, toggleable: true },
  // Spans uploads from every section rather than belonging to one, so —
  // like "Users" below — it's admin/subadmin-only rather than part of a
  // `limited` account's own scoped sections.
  { to: 'images', id: 'admin.nav.images', adminOnly: true, toggleable: true },
  // Account management itself — admin/subadmin-only for the same reason a
  // `limited` account can't grant itself more access than it was given.
  { to: 'users', id: 'admin.nav.users', adminOnly: true, toggleable: true },
  // A personal/device preference (language, for now), not a permissioned
  // section — visible regardless of role.
  { to: 'settings', id: 'admin.nav.settings', adminOnly: false, toggleable: false },
] as const

/** One outline icon per `NAV_ITEMS` entry, keyed by its route segment — shown to the left of each sidebar link's label, and reused by `SettingsView`'s "Sidebar items" toggle list. */
export const ADMIN_NAV_ICONS = {
  overview: OverviewIcon,
  messages: MessagesIcon,
  products: ProductsIcon,
  events: EventsIcon,
  orders: OrdersIcon,
  screens: ScreensIcon,
  extensions: ExtensionsIcon,
  messageboard: MessageBoardIcon,
  images: ImagesIcon,
  users: UsersIcon,
  settings: SettingsIcon,
}
