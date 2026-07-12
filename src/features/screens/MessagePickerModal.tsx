import { Modal } from '../../components'
import { useLanguage } from '../../i18n'
import type { AnnouncementMessage } from '../../utils/announcements'
import './MessagePickerModal.scss'

interface MessagePickerModalProps {
  open: boolean
  onClose: () => void
  messages: AnnouncementMessage[]
  onSelect: (message: AnnouncementMessage) => void
}

/**
 * Lists every distinct "Custom message" announcement already configured
 * anywhere across every screen/pane/step (see `collectAnnouncementMessages`),
 * so a new one can reuse an existing title/description instead of retyping
 * it — opened from `SlideFields`'s own "Copy from another message" button.
 */
export function MessagePickerModal({ open, onClose, messages, onSelect }: MessagePickerModalProps) {
  const { t } = useLanguage()

  return (
    <Modal open={open} onClose={onClose} title={t('admin.screens.copyMessageButton')}>
      {messages.length === 0 ? (
        <p className="message-picker__empty">{t('admin.screens.noOtherMessages')}</p>
      ) : (
        <ul className="message-picker__list">
          {messages.map((message) => (
            <li key={`${message.title}|${message.description}`}>
              <button type="button" className="message-picker__item" onClick={() => onSelect(message)}>
                <span className="message-picker__item-title">{message.title}</span>
                {message.description && <span className="message-picker__item-description">{message.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
