import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton, Button, ChevronRightIcon, PlusIcon, SlideTransition, TranslatedText } from '../../../components'
import { useBackLevel } from '../../../hooks/useBackLevel'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useRecentlyOpened } from '../../../hooks/useRecentlyOpened'
import { useScreens } from '../../../hooks/useScreens'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import { getLanIp, getScreenAddressSettings } from '../../../lib/localServer'
import type { ScreenConfig } from '../../../types/screen'
import { DEFAULT_SCREEN_ADDRESS_SETTINGS, type ScreenAddressSettings } from '../../../types/screenAddress'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { generateId } from '../../../utils/id'
import { countLeaves } from '../../../utils/layoutTree'
import { deriveMdnsName } from '../../../utils/mdnsName'
import { DisplayManagerView } from '../displayManager/DisplayManagerView'
import { ScreenCard } from './ScreenCard'
import { ScreenForm, type ScreenFormTarget } from './ScreenForm'
import { ScreensaverScheduleModal } from './ScreensaverScheduleModal'
import './ScreensView.scss'

const SCREEN_FORM_TARGETS: ScreenFormTarget[] = ['global', 'borders', 'background', 'stages', 'transitions', 'screensaver', 'other']

/** Admin view for creating, editing and deleting fullscreen display screens, each reachable at its own `/screens/:screenId` link (addressed per Settings → Advanced's `ScreenAddressSettings`), plus the "Screen saver" button that sets the one shared daily window every screen's own "Use screensaver" checkbox opts into. "Open" treats launching a screen as deploying it, not previewing it — see `handleOpenScreen`; it always opens the plain, read-only `/screens/:screenId` URL. "Editor" instead opens the screen's own `/screens/editor/:screenId` URL — see `handleOpenEditor` — the only one that ever offers `ScreenDisplay`'s in-place editing toolbar. A "Display Manager" row above the screen list opens `DisplayManagerView` — every machine/monitor that's ever registered, with a Screen-assignment selector per monitor. */
export function ScreensView() {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingScreen, setEditingScreen] = useState<ScreenConfig | null | undefined>(undefined)
  const [screensaverModalOpen, setScreensaverModalOpen] = useState(false)
  const [copiedID, setCopiedID] = useState<string | null>(null)
  /** Whether the "Display Manager" sub-view (every registered machine/monitor, with its own Screen-assignment selector) is open in place of the screen list. */
  const [showDisplayManager, setShowDisplayManager] = useState(false)
  /** `1` while opening the form or Display Manager (slides in from the right, see `SlideTransition`), `-1` while closing back to the list (slides in from the left). Set right before whatever state change actually switches the view. */
  const [direction, setDirection] = useState<1 | -1>(1)
  /** The screen form's own currently open sub-view (e.g. "Resize slots"), shown next to the form view's own title — see `ScreenForm`'s `onRouteChange`. Reset on close so a stale route doesn't flash before the next open's fresh form reports its own. */
  const [formRoute, setFormRoute] = useState<string | undefined>(undefined)
  /** This machine's own LAN IP, used in place of `localhost`/`127.0.0.1` when building each screen's link below — so a URL copied from a dashboard opened via `localhost` still works when pasted into a *different* device (a kiosk display) on the network. Only fetched when actually needed (see the effect below); stays `null` (falling back to `window.location.hostname` as-is) if the lookup fails or isn't applicable. */
  const [lanIp, setLanIp] = useState<string | null>(null)
  /** How a screen's own link should be addressed (see Settings → Advanced) — `automatic` (the default) defers to the LAN-IP detection above; `custom`/`mdns` override it outright. Fetched once; falls back to `automatic` while loading or if the lookup fails. */
  const [addressSettings, setAddressSettings] = useState<ScreenAddressSettings>(DEFAULT_SCREEN_ADDRESS_SETTINGS)
  const [storeSettings] = useStoreSettings()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const { record: recordRecentlyOpened } = useRecentlyOpened()
  /** Which sub-view the just-opened `ScreenForm` should jump straight to — set only when opened via the `?screenId=&tab=` deep link, `undefined` for a normal list-click open. */
  const [initialFormTarget, setInitialFormTarget] = useState<ScreenFormTarget | undefined>(undefined)
  /** Guards the deep-link effect below so it only ever actually opens the form once — `screens` starts out as the bundled (empty) seed and only gets its real contents once the WS snapshot arrives a moment later, so this effect has to keep re-checking as `screens` updates rather than running once on mount; without this ref it would re-open the form on every later `screens` change too (a live edit elsewhere, a different admin's write, etc.), even long after the admin has since closed it. */
  const consumedDeepLinkRef = useRef(false)

  useEffect(() => {
    getScreenAddressSettings()
      .then(setAddressSettings)
      .catch(() => setAddressSettings(DEFAULT_SCREEN_ADDRESS_SETTINGS))
  }, [])

  useEffect(() => {
    if (addressSettings.mode !== 'automatic') return
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return
    getLanIp()
      .then(setLanIp)
      .catch(() => setLanIp(null))
  }, [addressSettings.mode])

  const screenHost =
    addressSettings.mode === 'custom' && addressSettings.customHost
      ? addressSettings.customHost
      : addressSettings.mode === 'mdns' && storeSettings.name.trim()
        ? `${deriveMdnsName(storeSettings.name)}.local`
        : window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? (lanIp ?? window.location.hostname)
          : window.location.hostname

  const isFormOpen = editingScreen !== undefined
  const openForm = (target: ScreenConfig | null) => {
    setDirection(1)
    setEditingScreen(target)
    if (target) recordRecentlyOpened('screen', target.screenID, target.name)
  }
  const closeForm = () => {
    setDirection(-1)
    setEditingScreen(undefined)
    setFormRoute(undefined)
    setInitialFormTarget(undefined)
  }

  /**
   * Deep-link support: `?screenId=<id>&tab=<target>` opens straight into
   * that screen's edit form (optionally to a named sub-view) instead of
   * requiring a click through the list — what the sidebar's tier-2/3
   * flyouts (and "recently opened" entries) actually navigate to. Depends
   * on `screens` (not just mount) since the target screen may not exist yet
   * in it on the very first render (see `consumedDeepLinkRef`); once
   * found, the state updates are deferred via `queueMicrotask` rather than
   * called directly in the effect body, which is what this codebase's own
   * "no synchronous setState in an effect" lint rule requires (see
   * `useIdleTimer.ts` for the same rule hit elsewhere) — `setSearchParams`
   * itself is exempt from that rule, so stripping the params happens
   * directly, right here. Placed after `openForm`'s own declaration (not
   * just after `useState`) since referencing it any earlier in this
   * component is what this codebase's lint setup considers a forward
   * reference, flagged the same as an actual bug would be.
   */
  useEffect(() => {
    if (consumedDeepLinkRef.current) return
    const screenId = searchParams.get('screenId')
    if (!screenId) return
    const target = screens.find((candidate) => candidate.screenID === screenId)
    if (!target) return
    consumedDeepLinkRef.current = true
    const tab = searchParams.get('tab')
    const validTab = tab && SCREEN_FORM_TARGETS.includes(tab as ScreenFormTarget) ? (tab as ScreenFormTarget) : undefined
    queueMicrotask(() => {
      setInitialFormTarget(validTab)
      openForm(target)
    })
    setSearchParams((current) => {
      current.delete('screenId')
      current.delete('tab')
      return current
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `openForm`/`setInitialFormTarget` are intentionally excluded: both are stable in effect (they only ever call setters/a stable `record` callback), and adding them would just be noise.
  }, [screens, searchParams, setSearchParams])

  /** Registers the open form as one level of the shared browser-back stack (see `useBackLevel`) — the single top Back button below (and, nested inside `ScreenForm` itself, its own sub-views) all close via the browser's own back action from here on, one level at a time, instead of each rendering its own separate Back button. */
  useBackLevel(isFormOpen, closeForm)

  /** Reads/writes via the functional `setScreens` form (fresh from storage) rather than this component's own `screens` state, which — being a separate `useScreens()` instance from `ScreenForm`'s own — can otherwise still be missing a live edit (background color, text size, etc.) `ScreenForm` just wrote moments earlier. */
  const handleSave = (screen: ScreenConfig) => {
    setScreens((current) => {
      const exists = current.some((existing) => existing.screenID === screen.screenID)
      return exists ? current.map((existing) => (existing.screenID === screen.screenID ? screen : existing)) : [...current, screen]
    })
    closeForm()
  }

  const handleDelete = (screen: ScreenConfig) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setScreens((current) => current.filter((existing) => existing.screenID !== screen.screenID))
  }

  /**
   * Adds a full copy of `screen` to the list — a new id, its name suffixed
   * to distinguish it from the original, and everything else (slots,
   * colors, text sizes, arrangement…) identical. Deep-cloned via
   * JSON round-tripping (screens are already plain, localStorage-persisted
   * JSON) so the copy never shares a nested object with the original —
   * editing either one afterwards can't accidentally affect the other.
   */
  const handleDuplicate = (screen: ScreenConfig) => {
    const copy: ScreenConfig = { ...(JSON.parse(JSON.stringify(screen)) as ScreenConfig), screenID: `screen-${generateId()}`, name: t('admin.screens.duplicateName', { name: screen.name }) }
    setScreens((current) => [...current, copy])
  }

  const handleCopy = (screen: ScreenConfig, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedID(screen.screenID)
      setTimeout(() => setCopiedID((current) => (current === screen.screenID ? null : current)), 2000)
    })
  }

  /**
   * "Open" a screen from the dashboard: this is meant as a "deploy it"
   * action, not a plain preview, so it launches the display in a new tab
   * with a one-time `launch` marker that page's own effect looks for to
   * best-effort request fullscreen and autoplay (see `manuallyPaused`'s
   * own initial state on `ScreenDisplay`, which notices the same marker).
   */
  const handleOpenScreen = (url: string) => {
    window.open(`${url}${url.includes('?') ? '&' : '?'}launch=1`, '_blank')
  }

  /**
   * "Editor" — opens the SAME screen at its own dedicated
   * `/screens/editor/:screenId` URL (see `editorUrl` below) instead of the
   * plain `/screens/:screenId` "Open" uses: this is the only URL that ever
   * offers the in-place editing toolbar (see `ScreenDisplay`'s own
   * `canEdit`), so a real kiosk deployment opened via "Open" can never be
   * accidentally edited even from a logged-in device. No `launch` marker,
   * so it doesn't request fullscreen/autoplay either.
   */
  const handleOpenEditor = (editorUrl: string) => {
    window.open(editorUrl, '_blank')
  }

  const openDisplayManager = () => {
    setDirection(1)
    setShowDisplayManager(true)
  }
  const closeDisplayManager = () => {
    setDirection(-1)
    setShowDisplayManager(false)
  }

  /**
   * Deep-link support for the sidebar's tier-2 Screens flyout's own
   * "Display Manager"/"+ Add screen" rows — `?displayManager=1` opens
   * `DisplayManagerView` the same as clicking that row would,
   * `?new=1` opens a blank `ScreenForm` the same as clicking "+ Add
   * screen" would. Neither depends on any remotely-synced list (unlike the
   * `?screenId=` deep link above), so there's no `consumedDeepLinkRef`-style
   * guard needed — this only ever runs meaningfully once anyway, since it
   * strips its own param immediately.
   */
  useEffect(() => {
    if (searchParams.get('displayManager')) {
      queueMicrotask(openDisplayManager)
      setSearchParams((current) => {
        current.delete('displayManager')
        return current
      })
    } else if (searchParams.get('new')) {
      queueMicrotask(() => openForm(null))
      setSearchParams((current) => {
        current.delete('new')
        return current
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to run once, right on mount, consuming whichever (if any) of these two deep-link params this page happened to be opened with.
  }, [])

  const view = isFormOpen ? 'form' : showDisplayManager ? 'displayManager' : 'list'

  return (
    <div className="screens-view">
      <SlideTransition viewKey={view} direction={direction}>
        {view === 'form' ? (
          <div>
            <div className="screens-view__form-header">
              <BackButton onClick={goBack}>{t('admin.common.back')}</BackButton>
              <h1 className="screens-view__form-title">
                {editingScreen ? t('admin.screens.editScreen') : t('admin.screens.addScreen')}
                {formRoute && <span className="screens-view__form-route"> - {formRoute}</span>}
              </h1>
            </div>
            <ScreenForm screen={editingScreen ?? null} onSave={handleSave} onCancel={closeForm} onRouteChange={setFormRoute} initialTarget={initialFormTarget} />
          </div>
        ) : view === 'displayManager' ? (
          <DisplayManagerView onBack={closeDisplayManager} />
        ) : (
          <div className="screens-view__list-view">
            <div className="screens-view__header">
              <TranslatedText as="h1" id="admin.screens.title" />
              <div className="screens-view__header-actions">
                <Button variant="secondary" onClick={() => setScreensaverModalOpen(true)}>
                  {screensaverSchedule ? t('admin.screens.changeScreensaverButton') : t('admin.screens.screensaverButton')}
                </Button>
              </div>
            </div>
            <TranslatedText as="p" id="admin.screens.description" className="admin-page-description" />

            <div className="screens-view__display-manager-row">
              <button type="button" className="screens-view__display-manager-open" onClick={openDisplayManager}>
                <span className="screens-view__display-manager-name">{t('admin.displayManager.title')}</span>
                <ChevronRightIcon />
              </button>
            </div>

            <button type="button" className="screens-view__add-row" onClick={() => openForm(null)}>
              <PlusIcon />
              {t('admin.screens.addScreen')}
            </button>

            {screens.length === 0 ? (
              <p className="screens-view__empty">{t('admin.screens.noScreens')}</p>
            ) : (
              <ul className="screens-view__list">
                <AnimatePresence initial={false}>
                  {screens.map((screen) => {
                    const url = `${window.location.protocol}//${screenHost}${window.location.port ? `:${window.location.port}` : ''}/screens/${screen.screenID}`
                    const editorUrl = `${window.location.protocol}//${screenHost}${window.location.port ? `:${window.location.port}` : ''}/screens/editor/${screen.screenID}`
                    const tree = screen.layout[1] ?? Object.values(screen.layout)[0]
                    const slotCount = tree ? countLeaves(tree) : 0
                    const slotCountLabel = slotCount === 1 ? t('admin.screens.slotCountBadgeOne') : t('admin.screens.slotCountBadge', { count: slotCount })
                    return (
                      <motion.li
                        key={screen.screenID}
                        className="screens-view__item"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ScreenCard
                          screen={screen}
                          url={url}
                          editorUrl={editorUrl}
                          defaultPaneLanguage={defaultPaneLanguage}
                          slotCountLabel={slotCountLabel}
                          copied={copiedID === screen.screenID}
                          onCopy={() => handleCopy(screen, url)}
                          onOpen={() => handleOpenScreen(url)}
                          onOpenEditor={() => handleOpenEditor(editorUrl)}
                          onEdit={() => openForm(screen)}
                          onDuplicate={() => handleDuplicate(screen)}
                          onDelete={() => handleDelete(screen)}
                        />
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </SlideTransition>

      <ScreensaverScheduleModal open={screensaverModalOpen} onClose={() => setScreensaverModalOpen(false)} />
    </div>
  )
}
