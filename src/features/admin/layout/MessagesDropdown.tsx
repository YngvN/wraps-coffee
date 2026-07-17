import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMessages } from '../../../hooks/useMessages'
import { useLanguage } from '../../../i18n'
import { MessagesIcon } from './AdminNavIcons'
import './NotificationsDropdown.scss'

/**
 * Top navbar's envelope dropdown: unread contact messages (`read: false`),
 * badge count = unread count. Selecting one marks it read the same way
 * `MessagesView`'s own `handleSelect` does (there's no dedicated
 * mark-as-read helper on `useMessages` to call instead — both write
 * through the same plain `setMessages` setter) and navigates to Messages.
 */
export function MessagesDropdown() {
  const { t } = useLanguage()
  const [messages, setMessages] = useMessages()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const unread = messages.filter((message) => !message.read)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const handleSelect = (id: string) => {
    setMessages(messages.map((message) => (message.id === id ? { ...message, read: true } : message)))
    setOpen(false)
  }

  return (
    <div className="notifications-dropdown" ref={containerRef}>
      <button
        type="button"
        className="admin-top-navbar__icon-link"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('admin.nav.messages')}
        title={t('admin.nav.messages')}
      >
        <MessagesIcon />
        {unread.length > 0 && <span className="notifications-dropdown__badge">{unread.length}</span>}
      </button>

      {open && (
        <div className="notifications-dropdown__panel">
          <div className="notifications-dropdown__header">{t('admin.nav.messages')}</div>
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
        </div>
      )}
    </div>
  )
}
