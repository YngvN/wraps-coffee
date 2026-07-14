import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { BackButton, Button, PlusIcon, SlideTransition, TranslatedText } from '../../../components'
import { useBackLevel } from '../../../hooks/useBackLevel'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useScreenLockPin } from '../../../hooks/useScreenLockPin'
import { useScreens } from '../../../hooks/useScreens'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import { getLanIp, getScreenAddressSettings } from '../../../lib/localServer'
import type { ScreenConfig } from '../../../types/screen'
import { DEFAULT_SCREEN_ADDRESS_SETTINGS, type ScreenAddressSettings } from '../../../types/screenAddress'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { countLeaves } from '../../../utils/layoutTree'
import { deriveMdnsName } from '../../../utils/mdnsName'
import { CreatePinModal } from './CreatePinModal'
import { ScreenCard } from './ScreenCard'
import { ScreenForm } from './ScreenForm'
import { ScreensaverScheduleModal } from './ScreensaverScheduleModal'
import './ScreensView.scss'

/** Admin view for creating, editing and deleting fullscreen display screens, each reachable at its own `/screens/:screenId` link (addressed per Settings → Advanced's `ScreenAddressSettings`), plus the "Create pin" button that sets the one shared PIN every screen's own "Lock screen" button locks behind, and the "Screen saver" button that sets the one shared daily window every screen's own "Use screensaver" checkbox opts into. "Open" treats launching a screen as deploying it, not previewing it — see `handleOpenScreen`. */
export function ScreensView() {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [pin] = useScreenLockPin()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [editingScreen, setEditingScreen] = useState<ScreenConfig | null | undefined>(undefined)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [screensaverModalOpen, setScreensaverModalOpen] = useState(false)
  const [copiedID, setCopiedID] = useState<string | null>(null)
  /** `1` while opening the form (slides in from the right, see `SlideTransition`), `-1` while closing it back to the list (slides in from the left). Set right before whatever state change actually switches the view. */
  const [direction, setDirection] = useState<1 | -1>(1)
  /** The screen form's own currently open sub-view (e.g. "Resize slots"), shown next to the form view's own title — see `ScreenForm`'s `onRouteChange`. Reset on close so a stale route doesn't flash before the next open's fresh form reports its own. */
  const [formRoute, setFormRoute] = useState<string | undefined>(undefined)
  /** This machine's own LAN IP, used in place of `localhost`/`127.0.0.1` when building each screen's link below — so a URL copied from a dashboard opened via `localhost` still works when pasted into a *different* device (a kiosk display) on the network. Only fetched when actually needed (see the effect below); stays `null` (falling back to `window.location.hostname` as-is) if the lookup fails or isn't applicable. */
  const [lanIp, setLanIp] = useState<string | null>(null)
  /** How a screen's own link should be addressed (see Settings → Advanced) — `automatic` (the default) defers to the LAN-IP detection above; `custom`/`mdns` override it outright. Fetched once; falls back to `automatic` while loading or if the lookup fails. */
  const [addressSettings, setAddressSettings] = useState<ScreenAddressSettings>(DEFAULT_SCREEN_ADDRESS_SETTINGS)
  /** A screen queued to open once a PIN has just been set — see `handleOpenScreen`/`CreatePinModal`'s `onSaved`. `null` outside of that gated flow (including while the pin modal is open for its own plain "Create/change pin" button). */
  const [pendingOpenScreen, setPendingOpenScreen] = useState<{ screen: ScreenConfig; url: string } | null>(null)
  const [storeSettings] = useStoreSettings()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()

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
  }
  const closeForm = () => {
    setDirection(-1)
    setEditingScreen(undefined)
    setFormRoute(undefined)
  }

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
    const copy: ScreenConfig = { ...(JSON.parse(JSON.stringify(screen)) as ScreenConfig), screenID: `screen-${crypto.randomUUID()}`, name: t('admin.screens.duplicateName', { name: screen.name }) }
    setScreens((current) => [...current, copy])
  }

  const handleCopy = (screen: ScreenConfig, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedID(screen.screenID)
      setTimeout(() => setCopiedID((current) => (current === screen.screenID ? null : current)), 2000)
    })
  }

  /**
   * Actually launches a screen's display in a new tab — this is meant as a
   * "deploy it" action, not a plain preview, so it locks the screen right
   * here (a plain event-handler write, before the new tab even opens,
   * rather than a `setState` call inside `ScreenDisplay`'s own mount
   * effect) and appends a one-time `launch` marker that page's effect
   * looks for to best-effort request fullscreen (autoplaying is separately
   * covered by that page's `manuallyPaused` initial state noticing the
   * same marker). Called once a PIN is confirmed to exist (see
   * `handleOpenScreen` below).
   */
  const launchScreen = (screen: ScreenConfig, url: string) => {
    if (!screen.locked) setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, locked: true } : existing)))
    window.open(`${url}${url.includes('?') ? '&' : '?'}launch=1`, '_blank')
  }

  /** "Open" a screen from the dashboard: this is meant as a "deploy it" action, not a plain preview, so it always locks + autoplays the display it opens — which means a PIN must exist first (a locked screen with no PIN would trap the owner out of their own display). Without one, stashes the target and opens `CreatePinModal` instead of navigating; with one already set, launches immediately. */
  const handleOpenScreen = (screen: ScreenConfig, url: string) => {
    if (!pin) {
      setPendingOpenScreen({ screen, url })
      setPinModalOpen(true)
      return
    }
    launchScreen(screen, url)
  }

  const closePinModal = () => {
    setPinModalOpen(false)
    setPendingOpenScreen(null)
  }

  return (
    <div className="screens-view">
      <SlideTransition viewKey={isFormOpen ? 'form' : 'list'} direction={direction}>
        {isFormOpen ? (
          <div>
            <div className="screens-view__form-header">
              <BackButton onClick={goBack}>{t('admin.common.back')}</BackButton>
              <h1 className="screens-view__form-title">
                {editingScreen ? t('admin.screens.editScreen') : t('admin.screens.addScreen')}
                {formRoute && <span className="screens-view__form-route"> - {formRoute}</span>}
              </h1>
            </div>
            <ScreenForm screen={editingScreen ?? null} onSave={handleSave} onCancel={closeForm} onRouteChange={setFormRoute} />
          </div>
        ) : (
          <div className="screens-view__list-view">
            <div className="screens-view__header">
              <TranslatedText as="h1" id="admin.screens.title" />
              <div className="screens-view__header-actions">
                <Button variant="secondary" onClick={() => setPinModalOpen(true)}>
                  {pin ? t('admin.screens.changePinButton') : t('admin.screens.createPinButton')}
                </Button>
                <Button variant="secondary" onClick={() => setScreensaverModalOpen(true)}>
                  {screensaverSchedule ? t('admin.screens.changeScreensaverButton') : t('admin.screens.screensaverButton')}
                </Button>
              </div>
            </div>
            <TranslatedText as="p" id="admin.screens.description" className="admin-page-description" />

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
                          defaultPaneLanguage={defaultPaneLanguage}
                          slotCountLabel={slotCountLabel}
                          copied={copiedID === screen.screenID}
                          onCopy={() => handleCopy(screen, url)}
                          onOpen={() => handleOpenScreen(screen, url)}
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

      <CreatePinModal
        open={pinModalOpen}
        onClose={closePinModal}
        description={pendingOpenScreen ? t('admin.screens.createPinRequiredDescription') : undefined}
        onSaved={() => {
          if (pendingOpenScreen) launchScreen(pendingOpenScreen.screen, pendingOpenScreen.url)
        }}
      />
      <ScreensaverScheduleModal open={screensaverModalOpen} onClose={() => setScreensaverModalOpen(false)} />
    </div>
  )
}
