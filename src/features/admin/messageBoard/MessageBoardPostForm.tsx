import { useState, type FormEvent } from 'react'
import { Button, Checkbox, ImageUploadField, Input, Textarea } from '../../../components'
import { useLanguage } from '../../../i18n'
import { MESSAGE_BOARD_BODY_MAX_LENGTH, MESSAGE_BOARD_TITLE_MAX_LENGTH, type MessageBoardPost } from '../../../types/messageBoard'
import './MessageBoardPostForm.scss'

interface MessageBoardPostFormProps {
  /** The post being edited, or `null` when creating a new one. */
  post: MessageBoardPost | null
  /** Board the new post is created into — ignored when editing (a post never changes board). */
  boardId: string
  /** Session username used as the author when creating — ignored when editing (authorship never changes). */
  authorUsername: string
  onSave: (post: MessageBoardPost) => void
  onCancel: () => void
}

/** Create/edit form for a single message-board post: title, body, optional image, pin, and an optional expiry date. */
export function MessageBoardPostForm({ post, boardId, authorUsername, onSave, onCancel }: MessageBoardPostFormProps) {
  const { t } = useLanguage()
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [imageUrl, setImageUrl] = useState(post?.imageUrl ?? '')
  const [pinned, setPinned] = useState(post?.pinned ?? false)
  const [expiresAt, setExpiresAt] = useState(post?.expiresAt ? post.expiresAt.slice(0, 10) : '')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onSave({
      id: post?.id ?? `msgboard-${Date.now()}`,
      boardId: post?.boardId ?? boardId,
      title,
      body,
      imageUrl: imageUrl || undefined,
      authorUsername: post?.authorUsername ?? authorUsername,
      createdAt: post?.createdAt ?? new Date().toISOString(),
      updatedAt: post ? new Date().toISOString() : undefined,
      pinned,
      // Expires at the end of the chosen local day, not its start, so "expires Friday" stays up through Friday.
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
    })
  }

  return (
    <form className="message-board-post-form" onSubmit={handleSubmit}>
      <div className="message-board-post-form__field">
        <Input
          id="message-board-post-title"
          label={t('admin.messageBoard.titleLabel')}
          value={title}
          maxLength={MESSAGE_BOARD_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <span className="message-board-post-form__counter">
          {title.length}/{MESSAGE_BOARD_TITLE_MAX_LENGTH}
        </span>
      </div>

      <div className="message-board-post-form__field">
        <Textarea
          id="message-board-post-body"
          label={t('admin.messageBoard.bodyLabel')}
          value={body}
          maxLength={MESSAGE_BOARD_BODY_MAX_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          required
        />
        <span className="message-board-post-form__counter">
          {body.length}/{MESSAGE_BOARD_BODY_MAX_LENGTH}
        </span>
      </div>

      <ImageUploadField id="message-board-post-image" value={imageUrl} onChange={setImageUrl} />

      <Checkbox id="message-board-post-pinned" label={t('admin.messageBoard.pinnedLabel')} checked={pinned} onChange={(event) => setPinned(event.target.checked)} />

      <Input
        id="message-board-post-expires"
        type="date"
        label={t('admin.messageBoard.expiresAtLabel')}
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
      />

      <div className="message-board-post-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
