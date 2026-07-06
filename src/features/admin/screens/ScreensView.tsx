import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Badge, Button, Modal, TranslatedText } from '../../../components'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import type { ScreenConfig, ScreenSlotContent } from '../../../types/screen'
import { ScreenForm } from './ScreenForm'
import './ScreensView.scss'

/** Admin view for creating, editing and deleting fullscreen display screens, each reachable at its own `/screens/:screenId` link. */
export function ScreensView() {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [editingScreen, setEditingScreen] = useState<ScreenConfig | null | undefined>(undefined)
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

  const slotLabel = (slot: ScreenSlotContent) => {
    if (slot.kind === 'none') return t('admin.screens.slotNoneLabel')
    if (slot.kind === 'events') return t('admin.screens.slotEventsLabel')
    return t(`menu.categories.${slot.category}.title`)
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
        <Button onClick={() => setEditingScreen(null)}>{t('admin.screens.addScreen')}</Button>
      </div>

      {screens.length === 0 ? (
        <p className="screens-view__empty">{t('admin.screens.noScreens')}</p>
      ) : (
        <ul className="screens-view__list">
          <AnimatePresence initial={false}>
            {screens.map((screen) => {
              const url = `${window.location.origin}/screens/${screen.screenID}`
              return (
                <motion.li
                  key={screen.screenID}
                  className="screens-view__item"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="screens-view__item-info">
                    <span className="screens-view__item-name">{screen.name}</span>
                    <Badge variant="info">{t(`admin.screens.layout${screen.layout === 'slideshow' ? 'Slideshow' : 'Split'}Label`)}</Badge>
                    <span className="screens-view__item-slots">
                      {slotLabel(screen.slots[0])} · {slotLabel(screen.slots[1])}
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
                    <Button variant="secondary" onClick={() => handleDelete(screen)}>
                      {t('admin.common.delete')}
                    </Button>
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
    </div>
  )
}
