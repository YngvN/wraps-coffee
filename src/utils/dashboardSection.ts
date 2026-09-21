import type { DashboardSection } from '../types/sync'

/**
 * The `admin.nav.<key>` i18n key for one `DashboardSection`'s label (see
 * `adminNavItems.ts`'s own `NAV_ITEMS`). Most `DashboardSection` values are
 * already the exact key as-is; `'messageboard'`/`'displaymanager'` are the
 * two exceptions, since their nav keys are camelCased in `languages.json`
 * while `DashboardSection` itself stays all-lowercase (matching the
 * server's own `DashboardSection` string union). Used by `UserForm`/
 * `UsersView` to label a `limited` account's allowed-sections checkboxes
 * and badges — previously duplicated in both files as its own local
 * function, each missing the `displaymanager` case, which silently
 * rendered as the raw untranslated key instead of "Display Manager".
 *
 * If `DASHBOARD_SECTIONS` (`src/types/sync.ts`) ever gains a section whose own
 * `admin.nav.*` key is not identical to that section's own lowercase value, add
 * another explicit case here — adding only the new i18n key is what makes `t()`
 * silently fall through to the raw untranslated key.
 */
export function sectionNavId(section: DashboardSection): string {
  if (section === 'messageboard') return 'messageBoard'
  if (section === 'displaymanager') return 'displayManager'
  return section
}
