import { AnimatePresence, motion } from 'framer-motion'
import { useState, type CSSProperties } from 'react'
import { Badge, Button, Modal, TranslatedText } from '../../../components'
import { useScreenLockPin } from '../../../hooks/useScreenLockPin'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type ScreenConfig, type ScreenSlot, type ScreenSlotContent } from '../../../types/screen'
import { getScreenColorVars } from '../../../utils/screenColors'
import { CreatePinModal } from './CreatePinModal'
import { LayoutIcon } from './LayoutIcon'
import { ScreenForm } from './ScreenForm'
import { getScreenPreviewPattern } from './screenPreviewPattern'
import './ScreensView.scss'

/** Admin view for creating, editing and deleting fullscreen display screens, each reachable at its own `/screens/:screenId` link, plus the "Create pin" button that sets the one shared PIN every screen's own "Lock screen" button locks behind. */
export function ScreensView() {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [pin] = useScreenLockPin()
  const [editingScreen, setEditingScreen] = useState<ScreenConfig | null | undefined>(undefined)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [copiedID, setCopiedID] = useState<string | null>(null)

  const isFormOpen = editingScreen !== undefined
  const closeForm = () => setEditingScreen(undefined)

  const handleSave = (screen: ScreenConfig) => {
    const exists = screens.some((existing) => existing.screenID === screen.screenID)
    setScreens(exists ? screens.map((existing) => (existing.screenID === screen.screenID ? screen : existing)) : [...screens, screen])
    closeForm()
  }

  const handleDelete = (screen: ScreenConfig) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setScreens(screens.filter((existing) => existing.screenID !== screen.screenID))
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
    setScreens([...screens, copy])
  }

  const contentLabel = (content: ScreenSlotContent) => {
    if (content.kind === 'none') return t('admin.screens.slotNoneLabel')
    if (content.kind === 'menu') return t('admin.screens.slotMenuLabel')
    if (content.kind === 'events') return t('admin.screens.slotEventsLabel')
    if (content.kind === 'image') return t('admin.screens.slotImageLabel')
    return t(`menu.categories.${content.category}.title`)
  }

  /** A slot's summary text: its active slide labels joined with "+" (e.g. "Wraps + Salads" for a rotating slot), or `null` if it has none. */
  const slotSummary = (slot: ScreenSlot) => {
    const active = slot.contents.filter((content) => content.kind !== 'none')
    return active.length > 0 ? active.map(contentLabel).join(' + ') : null
  }

  const handleCopy = (screen: ScreenConfig, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedID(screen.screenID)
      setTimeout(() => setCopiedID((current) => (current === screen.screenID ? null : current)), 2000)
    })
  }

  return (
    <div className="screens-view">
      <div className="screens-view__header">
        <TranslatedText as="h1" id="admin.screens.title" />
        <div className="screens-view__header-actions">
          <Button variant="secondary" onClick={() => setPinModalOpen(true)}>
            {pin ? t('admin.screens.changePinButton') : t('admin.screens.createPinButton')}
          </Button>
          <Button onClick={() => setEditingScreen(null)}>{t('admin.screens.addScreen')}</Button>
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
                      <Button variant="secondary" onClick={() => setEditingScreen(screen)}>
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

      <Modal open={isFormOpen} onClose={closeForm} title={editingScreen ? t('admin.screens.editScreen') : t('admin.screens.addScreen')}>
        {isFormOpen && <ScreenForm screen={editingScreen ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>

      <CreatePinModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
    </div>
  )
}
