import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronRightIcon, Modal, PlusIcon, ThemeToggle, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useDisplayName } from '../../../hooks/useDisplayName'
import { useLanOrigin } from '../../../hooks/useLanOrigin'
import { useRecentlyOpened } from '../../../hooks/useRecentlyOpened'
import { useScreens } from '../../../hooks/useScreens'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import { useLanguage } from '../../../i18n'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { useAssistantAllowedEntities } from '../assistant/useAssistantFlow'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from './adminNavItems'
import { AssistantSparkleIcon, PinSidebarIcon, QrCodeIcon, SearchIcon } from './AdminNavIcons'
import './AdminSidebarNav.scss'

/** Rail items with a real tier-2 flyout (see `AdminSidebarNav`'s own module doc comment) — every other item is a plain direct link, same as before this redesign. */
const FLYOUT_RAIL_ITEMS = new Set(['products', 'screens', 'settings'])

/** A screen's own named sub-views (see `ScreenForm`'s `editingTarget`) — the tier-3 flyout under a Screens row. */
const SCREEN_FORM_TARGETS: { target: string; labelId: string }[] = [
  { target: 'global', labelId: 'admin.screens.editTextSize' },
  { target: 'borders', labelId: 'admin.screens.bordersLabel' },
  { target: 'background', labelId: 'admin.screens.backgroundLabel' },
  { target: 'stages', labelId: 'admin.screens.stagesLabel' },
  { target: 'transitions', labelId: 'admin.screens.transitionsLabel' },
  { target: 'screensaver', labelId: 'admin.screens.screensaverLabel' },
  { target: 'other', labelId: 'admin.screens.otherSettingsLabel' },
]

interface AdminSidebarNavProps {
  /** Called whenever a nav link is clicked, so the mobile overlay can close itself. */
  onNavigate?: () => void
  /**
   * `'desktop'` (default) is the icon rail + hover flyouts described below.
   * `'mobile'` is today's original plain labeled list, deliberately kept
   * as-is — hover flyouts are a real mouse-only interaction (see the
   * touch-device convention in this repo's own CLAUDE.md), so the
   * hamburger-triggered mobile overlay stays a normal tap-through list
   * instead of trying to reproduce hover-only behavior on a touchscreen.
   */
  variant?: 'desktop' | 'mobile'
  /** Whether the desktop rail is pinned permanently open (see the pin-toggle button above the footer) — ignored for the mobile variant, which has no such concept. */
  isPinned?: boolean
  onTogglePinned?: () => void
  /** Toggles one of `AdminTopNavbar`'s own right-side panels — backs this rail's own "AI Assistant" (above Overview) and "Search" (right below it) entries, which open the exact same `AssistantPanel`/`GlobalSearchButton` panel the navbar's own shortcuts do rather than navigating anywhere. Owned by `AdminDashboard` — see `ActivePanel`'s own doc comment in `AdminTopNavbar.tsx`. */
  onTogglePanel?: (panel: 'assistant' | 'search') => void
}

/**
 * Icon rail (desktop) with a two-tier hover flyout for the sections that
 * actually have sub-structure — Products (this catalogue's categories),
 * Screens (every screen, each with its own named sub-views as a further
 * tier-3 flyout), and Settings (Store/Integrations/Advanced/Backup/
 * Developers). Every other item (Overview, Messages, Events, Orders,
 * Message board, Images, Users) stays a plain direct link, same as before.
 * Two more rows bookend Overview but aren't `NAV_ITEMS`/routes at all —
 * "AI Assistant" right above it and "Search" right below it are plain
 * `<button>`s (styled identically to the `NavLink`s via the same
 * `.admin-sidebar-nav__link` class) that call `onTogglePanel` instead of
 * navigating, opening the exact same `AssistantPanel`/`GlobalSearchButton`
 * panel `AdminTopNavbar`'s own shortcuts do — see `ActivePanel`'s own doc
 * comment in `AdminTopNavbar.tsx` for why that state lives in `AdminDashboard`
 * rather than either component owning it.
 *
 * The flyouts aren't pure CSS `:hover` (unlike a typical cascading nav
 * menu), since hovering a *different* rail item while tier-2 is already
 * open needs to swap its content without the panel itself hiding/
 * re-showing (same one level deeper for tier-3) — `:hover` alone can only
 * show/hide, not "switch without hiding." The two tiers otherwise close
 * quite differently, though:
 * - **Tier-2** (and the rail's own expanded width) behaves like an
 *   ordinary hover flyout: open while hovering the rail or the tier-2
 *   panel itself, closing shortly after leaving both
 *   (`scheduleCloseCluster`/`openCluster` — a short delay, not instant, so
 *   crossing the visual gap between the rail and the panel to reach it
 *   doesn't itself close it).
 * - **Tier-3** (a screen's own sub-views) is the one that stays open once
 *   opened — moving the mouse off it onto another *in-page* element does
 *   nothing — closing only on an explicit click outside the whole cluster
 *   (or the cursor leaving the browser viewport entirely, see the
 *   `document.documentElement` `mouseleave` fallback below, which exists for
 *   both tiers). It's deliberately decoupled from `activeRailItem` (see
 *   `activeScreen`'s own render condition) so it can keep showing even after
 *   tier-2 itself has already closed.
 *
 * Store branding lives in `AdminTopNavbar` now, not here.
 */
export function AdminSidebarNav({ onNavigate, variant = 'desktop', isPinned = false, onTogglePinned, onTogglePanel }: AdminSidebarNavProps) {
  const { t } = useLanguage()
  const displayName = useDisplayName()
  const { session, clearSession } = useAdminSession()
  const [sidebarSettings] = useSidebarSettings()
  const [catalogues] = useCatalogues()
  const [screens] = useScreens()
  const { entries: recentlyOpened } = useRecentlyOpened()
  const assistantAllowedEntities = useAssistantAllowedEntities()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLElement>(null)

  /** Which rail item's tier-2 flyout is open, if any — see the module doc comment above for why this is state, not `:hover`. */
  const [activeRailItem, setActiveRailItem] = useState<string | null>(null)
  /** Which tier-2 Screens row's tier-3 flyout is open, if any — only meaningful while `activeRailItem === 'screens'`. */
  const [activeSubmenuRow, setActiveSubmenuRow] = useState<string | null>(null)
  /**
   * Widens the rail to show every item's own label, the same way the
   * reference theme's own `.first-menu:hover` does. Shares its open/close
   * timing exactly with tier-2 (`openCluster`/`scheduleCloseCluster` below,
   * both toggle this alongside `activeRailItem`) rather than expanding/
   * collapsing on its own separate instant hover: since the tier-2 panel's
   * own `left` offset assumes the rail is at its *expanded* width, letting
   * the rail collapse back to icon-only the moment it stops being hovered
   * — before the mouse has actually reached the panel — would open a dead
   * gap between the two that's neither "still on the rail" nor "on the
   * panel yet," closing the panel out from under the cursor mid-transit.
   * Keeping them on one shared, cancellable delay means the rail stays
   * expanded (and the two stay flush against each other) for exactly as
   * long as either is still being hovered, same as a single unit. Tier-3
   * is the one exception that stays open past all of this — see the
   * module doc comment above.
   */
  const [isRailExpanded, setIsRailExpanded] = useState(false)
  /** Pending "close the rail + tier-2" timeout — see `scheduleCloseCluster`/`openCluster`. */
  const closeClusterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Whether the "scan to open the login page" QR modal (desktop rail only, next to the pin-toggle) is open. */
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const lanOrigin = useLanOrigin()
  const loginQrUrl = `${lanOrigin}/admin/login`

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || session?.role !== 'limited') &&
      (!item.toggleable || !sidebarSettings.hiddenItems.includes(item.to as ToggleableSidebarItem)),
  )

  /** Cancels any pending close and (re-)expands the rail — called on entering the rail *or* the tier-2 panel itself, so briefly crossing the visual gap between them (which fires a mouseleave on whichever you just left) doesn't collapse/close either before you arrive. */
  const openCluster = () => {
    if (closeClusterTimeoutRef.current) {
      clearTimeout(closeClusterTimeoutRef.current)
      closeClusterTimeoutRef.current = null
    }
    setIsRailExpanded(true)
  }

  /** Collapses the rail and closes tier-2 together, a short moment after leaving the rail/tier-2 panel — not instant, so the admin has time to actually reach the panel; cancelled by `openCluster` if they do. Tier-3 is deliberately untouched here — it only ever closes via the outside-click listener below. */
  const scheduleCloseCluster = () => {
    if (closeClusterTimeoutRef.current) clearTimeout(closeClusterTimeoutRef.current)
    closeClusterTimeoutRef.current = setTimeout(() => {
      setIsRailExpanded(false)
      setActiveRailItem(null)
    }, 200)
  }

  const closeFlyouts = () => {
    if (closeClusterTimeoutRef.current) {
      clearTimeout(closeClusterTimeoutRef.current)
      closeClusterTimeoutRef.current = null
    }
    setIsRailExpanded(false)
    setActiveRailItem(null)
    setActiveSubmenuRow(null)
  }

  /** Closes both tiers together on a click anywhere outside the whole rail+flyout cluster — the flyout panels render as children of this same `<nav>` (just positioned `fixed` elsewhere on screen via CSS), so one ref/listener covers both tiers. This is tier-3's *only* other way to close (see the module doc comment above); tier-2 usually closes sooner, via `scheduleCloseCluster`. */
  useEffect(() => {
    if (variant !== 'desktop' || (!activeRailItem && !activeSubmenuRow)) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      closeFlyouts()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [variant, activeRailItem, activeSubmenuRow])

  /**
   * Fallback for both tiers: closes everything the moment the cursor leaves
   * the browser viewport entirely. A `mouseleave` on an individual rail/panel
   * element (tier-2's own close path) or a `mousedown` elsewhere in the
   * document (tier-3's only other close path) both require the browser to
   * actually dispatch an event — but moving the mouse out of the window fast
   * enough can skip firing `mouseleave` on whichever element it last crossed,
   * leaving both tiers stuck open with no click ever following to close
   * tier-3. `mouseleave` on `document.documentElement` (not a `pointerleave`
   * on `document`, which only fires while a pointer is *captured*) reliably
   * fires once for "the pointer left the page," regardless of which element
   * it last happened to be over, so it's a safety net independent of the
   * per-element handlers above rather than a replacement for them.
   */
  useEffect(() => {
    if (variant !== 'desktop' || (!activeRailItem && !activeSubmenuRow)) return
    const handleDocumentMouseLeave = () => closeFlyouts()
    document.documentElement.addEventListener('mouseleave', handleDocumentMouseLeave)
    return () => document.documentElement.removeEventListener('mouseleave', handleDocumentMouseLeave)
  }, [variant, activeRailItem, activeSubmenuRow])

  /** Clears any still-pending close timeout on unmount, so it can't fire `setState` after this component's gone. */
  useEffect(() => {
    return () => {
      if (closeClusterTimeoutRef.current) clearTimeout(closeClusterTimeoutRef.current)
    }
  }, [])

  const handleLogout = () => {
    clearSession()
    onNavigate?.()
    navigate('/admin/login', { replace: true })
  }

  /** A flyout row both navigates and closes the whole cascade — clicking through should feel like leaving the menu, not leaving it hanging open behind the newly-loaded page. */
  const handleRowActivate = () => {
    closeFlyouts()
    onNavigate?.()
  }

  const catalogue = catalogues[0]
  /**
   * "Recently opened" only earns its place when it's a genuine shortcut — i.e.
   * when the record isn't already sitting a few rows above in the same flyout.
   * The full list is shown whenever it fits, so an unfiltered recents group
   * mostly just repeated entries that were already visible (a five-screen
   * install listed one of those five twice), adding scanning cost and no reach.
   */
  const visibleCategoryIds = new Set((catalogue?.categories ?? []).map((category) => category.id))
  const visibleScreenIds = new Set(screens.map((screen) => screen.screenID))
  const recentCategories = recentlyOpened.filter((entry) => entry.type === 'category' && !visibleCategoryIds.has(entry.id))
  const recentScreens = recentlyOpened.filter((entry) => entry.type === 'screen' && !visibleScreenIds.has(entry.id))
  const activeScreen = activeSubmenuRow ? screens.find((screen) => screen.screenID === activeSubmenuRow) : undefined

  if (variant === 'mobile') {
    return (
      <nav className="admin-sidebar-nav admin-sidebar-nav--mobile">
        <div className="admin-sidebar-nav__top">
          <ul className="admin-sidebar-nav__list admin-sidebar-nav__list--mobile">
            {assistantAllowedEntities.length > 0 && (
              <li>
                <button
                  type="button"
                  className="admin-sidebar-nav__link admin-sidebar-nav__link--mobile"
                  onClick={() => {
                    onTogglePanel?.('assistant')
                    onNavigate?.()
                  }}
                >
                  <AssistantSparkleIcon className="admin-sidebar-nav__icon" />
                  {t('admin.assistant.title')}
                </button>
              </li>
            )}
            {visibleItems.flatMap((item) => {
              const NavIcon = ADMIN_NAV_ICONS[item.to]
              const navLi = (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) => `admin-sidebar-nav__link admin-sidebar-nav__link--mobile${isActive ? ' admin-sidebar-nav__link--active' : ''}`}
                  >
                    <NavIcon className="admin-sidebar-nav__icon" />
                    <TranslatedText id={item.id} />
                  </NavLink>
                </li>
              )
              if (item.to !== 'overview') return [navLi]
              return [
                <li key="search-action">
                  <button
                    type="button"
                    className="admin-sidebar-nav__link admin-sidebar-nav__link--mobile"
                    onClick={() => {
                      onTogglePanel?.('search')
                      onNavigate?.()
                    }}
                  >
                    <SearchIcon className="admin-sidebar-nav__icon" />
                    {t('admin.search.title')}
                  </button>
                </li>,
                navLi,
              ]
            })}
          </ul>
        </div>
        <div className="admin-sidebar-nav__footer">
          <button type="button" className="admin-sidebar-nav__back" onClick={handleLogout}>
            {t('admin.nav.logout')}
          </button>
          <ThemeToggle />
        </div>
      </nav>
    )
  }

  return (
    <>
      <nav className={`admin-sidebar-nav admin-sidebar-nav--desktop${isPinned || isRailExpanded ? ' admin-sidebar-nav--expanded' : ''}`} ref={containerRef}>
        <div
          className={`admin-sidebar-nav__scrim${activeRailItem || activeScreen ? ' admin-sidebar-nav__scrim--visible' : ''}`}
          onClick={closeFlyouts}
        />
        <div className="admin-sidebar-nav__rail" onMouseEnter={openCluster} onMouseLeave={scheduleCloseCluster}>
          <div className="admin-sidebar-nav__top">
            {/*
              Assistant and Search open a side panel; they never navigate. They used to sit
              interleaved with the real destinations (Search wedged between Overview and
              Messages), so at rest — when the rail is icon-only — every row looked like the
              same kind of thing. They're their own group now, divided from the navigation
              below, so "opens a panel" and "goes somewhere" are distinguishable before you
              commit to a hover.
            */}
            <ul className="admin-sidebar-nav__list admin-sidebar-nav__list--tools">
              {assistantAllowedEntities.length > 0 && (
                <li>
                  <button
                    type="button"
                    className="admin-sidebar-nav__link"
                    onClick={() => {
                      onTogglePanel?.('assistant')
                      closeFlyouts()
                      onNavigate?.()
                    }}
                    title={t('admin.assistant.title')}
                    aria-label={t('admin.assistant.title')}
                  >
                    <AssistantSparkleIcon className="admin-sidebar-nav__icon" />
                    <span className="admin-sidebar-nav__link-label">{t('admin.assistant.title')}</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  className="admin-sidebar-nav__link"
                  onClick={() => {
                    onTogglePanel?.('search')
                    closeFlyouts()
                    onNavigate?.()
                  }}
                  title={t('admin.search.title')}
                  aria-label={t('admin.search.title')}
                >
                  <SearchIcon className="admin-sidebar-nav__icon" />
                  <span className="admin-sidebar-nav__link-label">{t('admin.search.title')}</span>
                </button>
              </li>
            </ul>
            <ul className="admin-sidebar-nav__list">
              {visibleItems.map((item) => {
                const NavIcon = ADMIN_NAV_ICONS[item.to]
                const hasFlyout = FLYOUT_RAIL_ITEMS.has(item.to)
                return (
                  <li
                    key={item.to}
                    onMouseEnter={
                      hasFlyout
                        ? () => {
                            openCluster()
                            setActiveRailItem(item.to)
                            setActiveSubmenuRow(null)
                          }
                        : undefined
                    }
                  >
                    <NavLink
                      to={item.to}
                      onClick={() => {
                        closeFlyouts()
                        onNavigate?.()
                      }}
                      className={({ isActive }) => `admin-sidebar-nav__link${isActive ? ' admin-sidebar-nav__link--active' : ''}`}
                      title={t(item.id)}
                      aria-label={t(item.id)}
                    >
                      <NavIcon className="admin-sidebar-nav__icon" />
                      <span className="admin-sidebar-nav__link-label">{t(item.id)}</span>
                      {hasFlyout && (
                        <span className="admin-sidebar-nav__link-chevron">
                          <ChevronRightIcon />
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
          <button
            type="button"
            className="admin-sidebar-nav__icon-button admin-sidebar-nav__qr-toggle"
            onClick={() => setQrModalOpen(true)}
            aria-label={t('admin.nav.showLoginQr')}
            title={t('admin.nav.showLoginQr')}
          >
            <QrCodeIcon />
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav__icon-button admin-sidebar-nav__pin-toggle${isPinned ? ' admin-sidebar-nav__pin-toggle--active' : ''}`}
            onClick={onTogglePinned}
            aria-label={t(isPinned ? 'admin.sidebar.unpinLabel' : 'admin.sidebar.pinLabel')}
            title={t(isPinned ? 'admin.sidebar.unpinLabel' : 'admin.sidebar.pinLabel')}
            aria-pressed={isPinned}
          >
            <PinSidebarIcon />
          </button>
          <div className="admin-sidebar-nav__footer">
            <button type="button" className="admin-sidebar-nav__back" onClick={handleLogout}>
              {t('admin.nav.logout')}
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div
          className={`admin-sidebar-nav__flyout admin-sidebar-nav__flyout--tier2${activeRailItem ? ' admin-sidebar-nav__flyout--visible' : ''}`}
          onMouseEnter={openCluster}
          onMouseLeave={scheduleCloseCluster}
        >
          {activeRailItem === 'products' && catalogue && (
            <>
              <div className="admin-sidebar-nav__flyout-header">{displayName(catalogue.name)}</div>
              {catalogue.categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/admin/dashboard/products?catalogueId=${catalogue.id}&categoryId=${category.id}`}
                  className="admin-sidebar-nav__flyout-row"
                  onClick={handleRowActivate}
                >
                  {displayName(category.name)}
                </Link>
              ))}
              {recentCategories.length > 0 && (
                <>
                  <div className="admin-sidebar-nav__flyout-section">{t('admin.nav.recentlyOpened')}</div>
                  {recentCategories.map((entry) => (
                    <Link
                      key={`recent-${entry.id}`}
                      to={`/admin/dashboard/products?catalogueId=${catalogue.id}&categoryId=${entry.id}`}
                      className="admin-sidebar-nav__flyout-row"
                      onClick={handleRowActivate}
                    >
                      {entry.label}
                    </Link>
                  ))}
                </>
              )}
              {/* Same grouping as the Screens flyout below: the category records are the body, and the whole-catalogue destination sits apart in the footer rather than reading as one more category. */}
              <div className="admin-sidebar-nav__flyout-footer">
                <Link to={`/admin/dashboard/products?catalogueId=${catalogue.id}&allProducts=1`} className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                  <span>{t('admin.products.viewAllProducts')}</span>
                  <ChevronRightIcon />
                </Link>
              </div>
            </>
          )}

          {/*
            Four different kinds of thing used to sit here as visually identical rows — another
            section's destination, the screen records themselves, a create action, and a history
            list — so "Add screen" read as a sixth screen until you noticed it had no chevron.
            They're now grouped: records form the body, the create action sits in its own footer,
            and Display Manager is labelled as the separate destination it is.
          */}
          {activeRailItem === 'screens' && (
            <>
              <div className="admin-sidebar-nav__flyout-header">{t('admin.nav.screens')}</div>
              {screens.map((screen) => (
                <Link
                  key={screen.screenID}
                  to={`/admin/dashboard/screens?screenId=${screen.screenID}`}
                  className="admin-sidebar-nav__flyout-row admin-sidebar-nav__flyout-row--expandable"
                  onClick={handleRowActivate}
                  onMouseEnter={() => setActiveSubmenuRow(screen.screenID)}
                >
                  <span>{screen.name}</span>
                  <ChevronRightIcon />
                </Link>
              ))}
              {recentScreens.length > 0 && (
                <>
                  <div className="admin-sidebar-nav__flyout-section">{t('admin.nav.recentlyOpened')}</div>
                  {recentScreens.map((entry) => (
                    <Link key={`recent-${entry.id}`} to={`/admin/dashboard/screens?screenId=${entry.id}`} className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                      {entry.label}
                    </Link>
                  ))}
                </>
              )}
              <div className="admin-sidebar-nav__flyout-footer">
                <Link to="/admin/dashboard/displays" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                  <span>{t('admin.displayManager.title')}</span>
                  <ChevronRightIcon />
                </Link>
                <Link to="/admin/dashboard/screens?new=1" className="admin-sidebar-nav__flyout-row admin-sidebar-nav__flyout-row--create" onClick={handleRowActivate}>
                  <PlusIcon />
                  <span>{t('admin.screens.addScreen')}</span>
                </Link>
              </div>
            </>
          )}

          {activeRailItem === 'settings' && (
            <>
              <div className="admin-sidebar-nav__flyout-header">{t('admin.nav.settings')}</div>
              <Link to="/admin/dashboard/settings/store" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                {t('admin.store.title')}
              </Link>
              <Link to="/admin/dashboard/settings/integrations" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                {t('admin.settings.integrations.title')}
              </Link>
              {session?.role !== 'limited' && (
                <Link to="/admin/dashboard/settings/advanced" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                  {t('admin.settings.advanced.title')}
                </Link>
              )}
              {session?.role !== 'limited' && (
                <Link to="/admin/dashboard/settings/backup" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                  {t('admin.settings.backup.title')}
                </Link>
              )}
              <Link to="/admin/dashboard/settings/developers" className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                {t('admin.settings.developersTitle')}
              </Link>
            </>
          )}
        </div>

        <div
          className={`admin-sidebar-nav__flyout admin-sidebar-nav__flyout--tier3${activeScreen ? ' admin-sidebar-nav__flyout--visible' : ''}`}
          onMouseEnter={openCluster}
        >
          {activeScreen && (
            <>
              <div className="admin-sidebar-nav__flyout-header">{activeScreen.name}</div>
              {SCREEN_FORM_TARGETS.map(({ target, labelId }) => (
                <Link key={target} to={`/admin/dashboard/screens?screenId=${activeScreen.screenID}&tab=${target}`} className="admin-sidebar-nav__flyout-row" onClick={handleRowActivate}>
                  {t(labelId)}
                </Link>
              ))}
            </>
          )}
        </div>
      </nav>
      <Modal open={qrModalOpen} onClose={() => setQrModalOpen(false)} title={t('admin.nav.showLoginQr')} transparentOnSliderDrag={false}>
        <div className="admin-sidebar-nav__qr-modal">
          <QRCodeSVG value={loginQrUrl} bgColor="transparent" fgColor="currentColor" className="admin-sidebar-nav__qr-modal-code" />
        </div>
      </Modal>
    </>
  )
}
