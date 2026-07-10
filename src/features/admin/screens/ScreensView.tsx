import { AnimatePresence, motion } from 'framer-motion'
import { useState, type CSSProperties } from 'react'
import { BackButton, Badge, Button, SlideTransition, TranslatedText } from '../../../components'
import { useScreenLockPin } from '../../../hooks/useScreenLockPin'
import { useScreens } from '../../../hooks/useScreens'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage } from '../../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type ScreenConfig, type ScreenSlot, type ScreenSlotContent } from '../../../types/screen'
import { getScreenColorVars } from '../../../utils/screenColors'
import { resolveSlotContent } from '../../../utils/screenStages'
import { CreatePinModal } from './CreatePinModal'
import { LayoutIcon } from './LayoutIcon'
import { ScreenForm } from './ScreenForm'
import { getScreenPreviewPattern } from './screenPreviewPattern'
import { ScreensaverScheduleModal } from './ScreensaverScheduleModal'
import './ScreensView.scss'

/** The click-feedback flash on the form view's own header preview icon, while its matching pane/tab is the one being edited (see `activeEditingSlot`): a small white circle that pops in at its center and expands out to fill (and fade past) the preview box, clipped to it by that box's own `overflow: hidden`. Framer-motion props rather than a plain CSS animation so a fresh `key` (a new element, as far as React's concerned) reliably restarts it from `initial` however fast a tab is spam-clicked in the editor, instead of a re-triggered CSS animation sometimes being coalesced by the browser into a no-op when it's already mid-run. */
const TAB_PULSE_MOTION = {
  initial: { opacity: 0.7, scale: 0.3 },
  animate: { opacity: 0, scale: 1.8 },
  transition: { duration: 0.5, ease: 'easeOut' as const },
}

/** Admin view for creating, editing and deleting fullscreen display screens, each reachable at its own `/screens/:screenId` link, plus the "Create pin" button that sets the one shared PIN every screen's own "Lock screen" button locks behind, and the "Screen saver" button that sets the one shared daily window every screen's own "Use screensaver" checkbox opts into. */
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
  /** Which of `editingScreen`'s own tabs the form is currently showing, plus an ever-increasing `pulse` key — see `ScreenForm`'s `onActiveSlotChange` — so the form view's own header preview can highlight (and flash) the matching pane, helping show at a glance which physical position on the actual screen is being edited right now. Reset alongside `editingScreen` so a stale highlight from a previous session never flashes on the next screen opened. */
  const [activeEditingSlot, setActiveEditingSlot] = useState<{ tab: 'global' | number; pulse: number }>({ tab: 'global', pulse: 0 })

  const isFormOpen = editingScreen !== undefined
  const openForm = (target: ScreenConfig | null) => {
    setDirection(1)
    setEditingScreen(target)
    setActiveEditingSlot({ tab: 'global', pulse: 0 })
  }
  const closeForm = () => {
    setDirection(-1)
    setEditingScreen(undefined)
    setFormRoute(undefined)
  }

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
    const copy: ScreenConfig = { ...(JSON.parse(JSON.stringify(screen)) as ScreenConfig), screenID: `${Date.now()}`, name: t('admin.screens.duplicateName', { name: screen.name }) }
    setScreens((current) => [...current, copy])
  }

  const contentLabel = (content: ScreenSlotContent) => {
    if (content.kind === 'none') return t('admin.screens.slotNoneLabel')
    if (content.kind === 'menu') return t('admin.screens.slotMenuLabel')
    if (content.kind === 'events') return t('admin.screens.slotEventsLabel')
    if (content.kind === 'image') return t('admin.screens.slotImageLabel')
    if (content.kind === 'transit') return t('admin.screens.slotTransitLabel')
    if (content.kind === 'weather') return t('admin.screens.slotWeatherLabel')
    return t(`menu.categories.${content.category}.title`)
  }

  /** A slot's summary text: its stage-1 content's own label (every slot is guaranteed a stage-1 checkpoint), or `null` if it's "none" there. A screen with stages on may show different content at other stages — see the stage-count badge below for that. */
  const slotSummary = (slot: ScreenSlot) => {
    const content = resolveSlotContent(slot, 1)
    return content.kind === 'none' ? null : contentLabel(content)
  }

  const handleCopy = (screen: ScreenConfig, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedID(screen.screenID)
      setTimeout(() => setCopiedID((current) => (current === screen.screenID ? null : current)), 2000)
    })
  }

  return (
    <div className="screens-view">
      <SlideTransition viewKey={isFormOpen ? 'form' : 'list'} direction={direction}>
        {isFormOpen ? (
          <div>
            <div className="screens-view__form-header">
              <BackButton onClick={closeForm}>{t('admin.common.back')}</BackButton>
              {editingScreen && (
                <div
                  className="screens-view__form-preview"
                  style={getScreenColorVars(editingScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}
                >
                  <LayoutIcon
                    pattern={getScreenPreviewPattern(editingScreen)}
                    width={40}
                    height={30}
                    highlightIndex={activeEditingSlot.tab === 'global' ? 'all' : activeEditingSlot.tab}
                  />
                  {activeEditingSlot.pulse > 0 && <motion.span key={activeEditingSlot.pulse} className="screens-view__form-preview-pulse" {...TAB_PULSE_MOTION} />}
                </div>
              )}
              <h1 className="screens-view__form-title">
                {editingScreen ? t('admin.screens.editScreen') : t('admin.screens.addScreen')}
                {formRoute && <span className="screens-view__form-route"> - {formRoute}</span>}
              </h1>
            </div>
            <ScreenForm
              screen={editingScreen ?? null}
              onSave={handleSave}
              onCancel={closeForm}
              onRouteChange={setFormRoute}
              onActiveSlotChange={(tab, pulse) => setActiveEditingSlot({ tab, pulse })}
            />
          </div>
        ) : (
          <div>
            <div className="screens-view__header">
              <TranslatedText as="h1" id="admin.screens.title" />
              <div className="screens-view__header-actions">
                <Button variant="secondary" onClick={() => setPinModalOpen(true)}>
                  {pin ? t('admin.screens.changePinButton') : t('admin.screens.createPinButton')}
                </Button>
                <Button variant="secondary" onClick={() => setScreensaverModalOpen(true)}>
                  {screensaverSchedule ? t('admin.screens.changeScreensaverButton') : t('admin.screens.screensaverButton')}
                </Button>
                <Button onClick={() => openForm(null)}>{t('admin.screens.addScreen')}</Button>
              </div>
            </div>

            {screens.length === 0 ? (
              <p className="screens-view__empty">{t('admin.screens.noScreens')}</p>
            ) : (
              <ul className="screens-view__list">
                <AnimatePresence initial={false}>
                  {screens.map((screen) => {
                    const url = `${window.location.origin}/screens/${screen.screenID}`
                    const slotCountLabel = screen.slotCount === 1 ? t('admin.screens.slotCountBadgeOne') : t('admin.screens.slotCountBadge', { count: screen.slotCount })
                    return (
                      <motion.li
                        key={screen.screenID}
                        className="screens-view__item"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div
                          className="screens-view__item-preview"
                          style={getScreenColorVars(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}
                          title={slotCountLabel}
                        >
                          <LayoutIcon pattern={getScreenPreviewPattern(screen)} width={56} height={42} />
                        </div>
                        <div className="screens-view__item-body">
                          <div className="screens-view__item-info">
                            <span className="screens-view__item-name">{screen.name}</span>
                            <Badge variant="info">{slotCountLabel}</Badge>
                            {screen.useStages && (screen.stageCount ?? 1) > 1 && (
                              <Badge variant="info">{t('admin.screens.stageCountBadge', { count: screen.stageCount ?? 1 })}</Badge>
                            )}
                            <span className="screens-view__item-slots">
                              {screen.slots
                                .map(slotSummary)
                                .filter((summary): summary is string => summary !== null)
                                .join(' · ')}
                            </span>
                          </div>
                          <div className="screens-view__item-url">
                            <code>{url}</code>
                            <Button variant="secondary" onClick={() => handleCopy(screen, url)}>
                              {copiedID === screen.screenID ? t('admin.screens.urlCopied') : t('admin.screens.copyUrl')}
                            </Button>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {t('admin.screens.openInNewTab')}
                            </a>
                          </div>
                          <div className="screens-view__item-actions">
                            <Button variant="secondary" onClick={() => openForm(screen)}>
                              {t('admin.common.edit')}
                            </Button>
                            <Button variant="secondary" onClick={() => handleDuplicate(screen)}>
                              {t('admin.common.duplicate')}
                            </Button>
                            <Button variant="secondary" onClick={() => handleDelete(screen)}>
                              {t('admin.common.delete')}
                            </Button>
                          </div>
                        </div>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </SlideTransition>

      <CreatePinModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
      <ScreensaverScheduleModal open={screensaverModalOpen} onClose={() => setScreensaverModalOpen(false)} />
    </div>
  )
}
