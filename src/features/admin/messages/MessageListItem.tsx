import type { ContactMessage } from '../../../types/message'
import './MessageListItem.scss'

interface MessageListItemProps {
  message: ContactMessage
  active: boolean
  onSelect: () => void
}

/** One row in the admin Messages inbox list: sender, subject and an unread indicator. */
export function MessageListItem({ message, active, onSelect }: MessageListItemProps) {
  return (
    <button
      type="button"
      className={`message-list-item${active ? ' message-list-item--active' : ''}${message.read ? '' : ' message-list-item--unread'}`}
      onClick={onSelect}
    >
      {!message.read && <span className="message-list-item__dot" aria-hidden="true" />}
      <span className="message-list-item__body">
        <span className="message-list-item__name">{message.name}</span>
        <span className="message-list-item__subject">{message.subject}</span>
      </span>
    </button>
  )
}
