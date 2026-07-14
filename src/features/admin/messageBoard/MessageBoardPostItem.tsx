import { Badge, Button, Card } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useLanguage } from '../../../i18n'
import type { MessageBoardPost } from '../../../types/messageBoard'
import { formatDateTime } from '../../../utils/clockFormat'
import { isPostExpired } from '../../../utils/messageBoard'
import { getSmallUrl } from '../../../utils/responsiveImage'
import './MessageBoardPostItem.scss'

interface MessageBoardPostItemProps {
  post: MessageBoardPost
  /** Whether the current session may edit/delete this specific post — its own author, or an admin/subadmin moderating any post. */
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}

/** One message-board post card: pin/expired badges, title, body, optional image, and a footer with the poster's name and timestamp. */
export function MessageBoardPostItem({ post, canManage, onEdit, onDelete }: MessageBoardPostItemProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  const expired = isPostExpired(post)

  return (
    <Card className={`message-board-post-item${expired ? ' message-board-post-item--expired' : ''}`}>
      <div className="message-board-post-item__badges">
        {post.pinned && <Badge variant="info">{t('admin.messageBoard.pinnedBadge')}</Badge>}
        {expired && <Badge variant="neutral">{t('admin.messageBoard.expiredBadge')}</Badge>}
      </div>
      <h3 className="message-board-post-item__title">{post.title}</h3>
      {post.imageUrl && <img className="message-board-post-item__image" src={getSmallUrl(post.imageUrl)} alt="" />}
      <p className="message-board-post-item__body">{post.body}</p>
      <div className="message-board-post-item__footer">
        <span className="message-board-post-item__meta">
          {post.authorUsername} · {formatDateTime(new Date(post.createdAt), language, clockFormat, dateFormat)}
          {post.updatedAt && ` · ${t('admin.messageBoard.editedLabel')}`}
        </span>
        {canManage && (
          <div className="message-board-post-item__actions">
            <Button variant="secondary" onClick={onEdit}>
              {t('admin.common.edit')}
            </Button>
            <Button variant="secondary" onClick={onDelete}>
              {t('admin.common.delete')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
