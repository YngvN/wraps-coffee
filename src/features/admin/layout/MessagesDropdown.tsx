import { Link } from 'react-router-dom'
import { useMessages } from '../../../hooks/useMessages'
import { useLanguage } from '../../../i18n'
import { AdminRightPanel } from './AdminRightPanel'
import { MessagesIcon } from './AdminNavIcons'
import './NotificationsDropdown.scss'

interface MessagesDropdownProps {
  /** Whether this envelope's own `AdminRightPanel` is the one currently open — owned by `AdminTopNavbar` (see `activePanel` there), not this component, so opening this panel always closes the Notifications one. */
  open: boolean
  onToggle: () => void
  onClose: () => void
}

/**
 * Top navbar's envelope trigger: unread contact messages (`read: false`),
 * badge count = unread count. Its content opens in an `AdminRightPanel`
 * sliding in from the right edge of the screen rather than a small
 * anchored dropdown box. Selecting one marks it read the same way
 * `MessagesView`'s own `handleSelect` does (there's no dedicated
 * mark-as-read helper on `useMessages` to call instead — both write
 * through the same plain `setMessages` setter) and navigates to Messages.
 */
export function MessagesDropdown({ open, onToggle, onClose }: MessagesDropdownProps) {
  const { t } = useLanguage()
  const [messages, setMessages] = useMessages()

  const unread = messages.filter((message) => !message.read)

  const handleSelect = (id: string) => {
    setMessages(messages.map((message) => (message.id === id ? { ...message, read: true } : message)))
    onClose()
  }

  return (
    <div className="notifications-dropdown">
      <button
        type="button"
        className="admin-top-navbar__icon-link"
        onClick={onToggle}
        aria-label={t('admin.nav.messages')}
        title={t('admin.nav.messages')}
      >
        <MessagesIcon />
        {unread.length > 0 && <span className="notifications-dropdown__badge">{unread.length}</span>}
      </button>

      <AdminRightPanel open={open} onClose={onClose} title={t('admin.nav.messages')}>
        {unread.length === 0 ? (
          <p className="notifications-dropdown__empty">{t('admin.notifications.noNewMessages')}</p>
        ) : (
          <ul className="notifications-dropdown__list">
            {unread.map((message) => (
              <li key={message.id}>
                <Link to="/admin/dashboard/messages" onClick={() => handleSelect(message.id)}>
                  <span className="notifications-dropdown__item-title">{message.subject}</span>
                  <span className="notifications-dropdown__item-meta">{message.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminRightPanel>
    </div>
  )
}
