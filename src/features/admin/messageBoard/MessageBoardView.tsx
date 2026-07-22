import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Input, Modal, PlusIcon, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useMessageBoardPosts } from '../../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../../hooks/useMessageBoards'
import { useLanguage } from '../../../i18n'
import { reportError } from '../../../lib/errorNotifications'
import type { MessageBoard, MessageBoardPost } from '../../../types/messageBoard'
import { sortMessageBoardPosts } from '../../../utils/messageBoard'
import { MessageBoardPostForm } from './MessageBoardPostForm'
import { MessageBoardPostItem } from './MessageBoardPostItem'
import './MessageBoardView.scss'

/** Which board-management modal (if any) is open — `'create'` starts from a blank name, `'rename'` pre-fills an existing board's own name. */
type BoardModalState = { mode: 'create' } | { mode: 'rename'; boardId: string } | null

/**
 * Admin view for the message board: a tab per {@link MessageBoard}, each
 * holding its own composer and list of {@link MessageBoardPost}s. Any
 * authenticated user can post into an existing board; creating, renaming,
 * deleting, and publishing a board to the public website are admin/subadmin
 * only. Posts written here can be shown on kiosk displays via the
 * `'messageboard'` screen-slot content kind (see `MessageBoardSlide`).
 */
export function MessageBoardView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [boards, setBoards] = useMessageBoards()
  const [posts, setPosts] = useMessageBoardPosts()
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(boards[0]?.id ?? null)
  const [editingPost, setEditingPost] = useState<MessageBoardPost | null | undefined>(undefined)
  const [boardModal, setBoardModal] = useState<BoardModalState>(null)
  const [boardNameDraft, setBoardNameDraft] = useState('')

  const isModerator = session?.role !== 'limited'
  // Falls back to the first board whenever `selectedBoardId` doesn't match
  // any current board (e.g. another device just deleted it) — computed
  // directly during render rather than "fixed up" via an effect, so an
  // invalid selection is never actually shown, even for one extra frame.
  const selectedBoard = boards.find((board) => board.id === selectedBoardId) ?? boards[0] ?? null

  const boardPosts = selectedBoard ? sortMessageBoardPosts(posts.filter((post) => post.boardId === selectedBoard.id), 'newestFirst') : []

  const isPostFormOpen = editingPost !== undefined
  const closePostForm = () => setEditingPost(undefined)

  const handleSavePost = (post: MessageBoardPost) => {
    if (!boards.some((board) => board.id === post.boardId)) {
      reportError(t('admin.messageBoard.boardMissingError'))
      closePostForm()
      return
    }
    const exists = posts.some((existing) => existing.id === post.id)
    setPosts(exists ? posts.map((existing) => (existing.id === post.id ? post : existing)) : [post, ...posts])
    closePostForm()
  }

  const handleDeletePost = (post: MessageBoardPost) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setPosts(posts.filter((existing) => existing.id !== post.id))
  }

  const openCreateBoard = () => {
    setBoardNameDraft('')
    setBoardModal({ mode: 'create' })
  }

  const openRenameBoard = (board: MessageBoard) => {
    setBoardNameDraft(board.name)
    setBoardModal({ mode: 'rename', boardId: board.id })
  }

  const closeBoardModal = () => setBoardModal(null)

  const handleSaveBoard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = boardNameDraft.trim()
    if (!name || !boardModal) return

    if (boardModal.mode === 'rename') {
      setBoards(boards.map((board) => (board.id === boardModal.boardId ? { ...board, name } : board)))
    } else {
      const newBoard: MessageBoard = { id: `board-${Date.now()}`, name }
      setBoards([...boards, newBoard])
      setSelectedBoardId(newBoard.id)
    }
    closeBoardModal()
  }

  const handleDeleteBoard = (board: MessageBoard) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setBoards(boards.filter((existing) => existing.id !== board.id))
    setPosts(posts.filter((post) => post.boardId !== board.id))
  }

  const togglePublishToWebsite = () => {
    if (!selectedBoard) return
    setBoards(boards.map((board) => (board.id === selectedBoard.id ? { ...board, publishToWebsite: !board.publishToWebsite } : board)))
  }

  return (
    <div className="message-board-view">
      <TranslatedText as="h1" id="admin.messageBoard.title" />
      <TranslatedText as="p" id="admin.messageBoard.description" className="admin-page-description" />

      {isModerator && (
        <div className="message-board-view__tabs-header">
          <button type="button" className="message-board-view__add-board" onClick={openCreateBoard}>
            <PlusIcon />
            {t('admin.messageBoard.addBoard')}
          </button>
        </div>
      )}

      <div className="message-board-view__tabs">
        <LayoutGroup>
          <div className="message-board-view__tab-list" role="tablist">
            {boards.map((board) => {
              const active = selectedBoard?.id === board.id
              return (
                <div key={board.id} className="message-board-view__tab-wrapper">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`message-board-view__tab${active ? ' message-board-view__tab--active' : ''}`}
                    onClick={() => setSelectedBoardId(board.id)}
                  >
                    {board.name}
                    {active && (
                      <motion.span
                        className="message-board-view__tab-indicator"
                        layoutId="message-board-view__tab-indicator"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                  {isModerator && active && (
                    <div className="message-board-view__tab-manage">
                      <button type="button" className="message-board-view__tab-manage-btn" onClick={() => openRenameBoard(board)}>
                        {t('admin.common.edit')}
                      </button>
                      <button type="button" className="message-board-view__tab-manage-btn" onClick={() => handleDeleteBoard(board)}>
                        {t('admin.common.delete')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </LayoutGroup>
      </div>

      {selectedBoard ? (
        <>
          <div className="message-board-view__toolbar">
            <Button className="message-board-view__add-post" onClick={() => setEditingPost(null)}>
              <PlusIcon />
              {t('admin.messageBoard.addPost')}
            </Button>
            {isModerator && (
              <Checkbox
                id="message-board-publish"
                label={t('admin.messageBoard.publishToWebsiteLabel')}
                checked={Boolean(selectedBoard.publishToWebsite)}
                onChange={togglePublishToWebsite}
              />
            )}
          </div>

          {boardPosts.length === 0 ? (
            <p className="message-board-view__empty">{t('admin.messageBoard.noPosts')}</p>
          ) : (
            <div className="message-board-view__list">
              <AnimatePresence initial={false}>
                {boardPosts.map((post) => (
                  <motion.div key={post.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                    <MessageBoardPostItem
                      post={post}
                      canManage={isModerator || post.authorUsername === session?.username}
                      onEdit={() => setEditingPost(post)}
                      onDelete={() => handleDeletePost(post)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      ) : (
        <p className="message-board-view__empty">{t('admin.messageBoard.noBoards')}</p>
      )}

      <Modal open={isPostFormOpen} onClose={closePostForm} title={editingPost ? t('admin.messageBoard.editPost') : t('admin.messageBoard.addPost')}>
        {isPostFormOpen && selectedBoard && (
          <MessageBoardPostForm post={editingPost ?? null} boardId={selectedBoard.id} authorUsername={session?.username ?? ''} onSave={handleSavePost} onCancel={closePostForm} />
        )}
      </Modal>

      <Modal
        open={boardModal !== null}
        onClose={closeBoardModal}
        title={boardModal?.mode === 'rename' ? t('admin.messageBoard.renameBoard') : t('admin.messageBoard.addBoard')}
      >
        {boardModal && (
          <form className="message-board-view__board-form" onSubmit={handleSaveBoard}>
            <Input id="message-board-name" label={t('admin.messageBoard.boardNameLabel')} value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} required />
            <div className="message-board-view__board-form-actions">
              <Button type="button" variant="secondary" onClick={closeBoardModal}>
                {t('admin.common.cancel')}
              </Button>
              <Button type="submit">{t('admin.common.save')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
