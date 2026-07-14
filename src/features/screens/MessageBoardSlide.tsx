import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useDateFormatPreference } from '../../hooks/useDateFormatPreference'
import { useMessageBoardPosts } from '../../hooks/useMessageBoardPosts'
import { DEFAULT_MESSAGE_BOARD_COUNT, DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS, type MessageBoardDisplayMode, type MessageBoardOrder } from '../../types/screen'
import type { MessageBoardPost } from '../../types/messageBoard'
import { formatDate } from '../../utils/dateFormat'
import { isPostExpired, sortMessageBoardPosts } from '../../utils/messageBoard'
import { getSmallUrl } from '../../utils/responsiveImage'
import './MessageBoardSlide.scss'

interface MessageBoardSlideProps {
  boardId?: string
  displayMode?: MessageBoardDisplayMode
  postId?: string
  order?: MessageBoardOrder
  rotateSeconds?: number
  count?: number
}

/** One post's own title/image/body, plus its poster's name and timestamp at the bottom — shared by every display mode below. */
function MessageBoardPostContent({ post }: { post: MessageBoardPost }) {
  const [dateFormat] = useDateFormatPreference()
  return (
    <div className="message-board-slide__post">
      <h2 className="message-board-slide__post-title">{post.title}</h2>
      {post.imageUrl && <img className="message-board-slide__post-image" src={getSmallUrl(post.imageUrl)} alt="" />}
      <p className="message-board-slide__post-body">{post.body}</p>
      <p className="message-board-slide__post-meta">
        {post.authorUsername} · {formatDate(new Date(post.createdAt), dateFormat)}
      </p>
    </div>
  )
}

/**
 * Fullscreen rendering of a message board's own posts, for a screen
 * display's `'messageboard'` slot — one admin-picked post (`'single'`), an
 * auto-rotating carousel through recent posts (`'rotating'`, its own timer
 * independent of the screen's shared stage rotation), or every post stacked
 * in a scrollable column (`'list'`, newest first or last per `order`).
 * Expired posts (`isPostExpired`) never appear here, though they stay
 * visible in the admin's own Message board list. Renders nothing until a
 * board is actually picked.
 */
export function MessageBoardSlide({ boardId, displayMode = 'rotating', postId, order = 'newestFirst', rotateSeconds = DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS, count = DEFAULT_MESSAGE_BOARD_COUNT }: MessageBoardSlideProps) {
  const [posts] = useMessageBoardPosts()
  const [rotationIndex, setRotationIndex] = useState(0)

  // Non-expired posts for this board, newest-first (pinned always leading) — never capped, since `'single'` mode needs to find its own picked post regardless of `count`.
  const allBoardPosts = boardId ? sortMessageBoardPosts(posts.filter((post) => post.boardId === boardId && !isPostExpired(post)), 'newestFirst') : []
  // Only `'rotating'`/`'list'` apply the `count` cap.
  const cappedPosts = allBoardPosts.slice(0, count)

  // Restarts the rotation from the first post whenever the board or display
  // mode changes — adjusted directly during render (React's own recommended
  // pattern for this) rather than via an effect, so the old board's rotation
  // offset is never shown even for one extra frame.
  const resetKey = `${boardId ?? ''}:${displayMode}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setRotationIndex(0)
  }

  useEffect(() => {
    if (displayMode !== 'rotating' || cappedPosts.length < 2) return
    const interval = setInterval(() => setRotationIndex((index) => (index + 1) % cappedPosts.length), Math.max(1, rotateSeconds) * 1000)
    return () => clearInterval(interval)
  }, [displayMode, rotateSeconds, cappedPosts.length])

  if (!boardId || allBoardPosts.length === 0) return <div className="message-board-slide message-board-slide--empty" />

  if (displayMode === 'single') {
    const post = allBoardPosts.find((candidate) => candidate.id === postId)
    if (!post) return <div className="message-board-slide message-board-slide--empty" />
    return (
      <div className="message-board-slide message-board-slide--single">
        <MessageBoardPostContent post={post} />
      </div>
    )
  }

  if (displayMode === 'list') {
    const orderedPosts = order === 'oldestFirst' ? sortMessageBoardPosts(cappedPosts, 'oldestFirst') : cappedPosts
    return (
      <div className="message-board-slide message-board-slide--list">
        {orderedPosts.map((post) => (
          <MessageBoardPostContent key={post.id} post={post} />
        ))}
      </div>
    )
  }

  const activePost = cappedPosts[rotationIndex % cappedPosts.length]
  return (
    <div className="message-board-slide message-board-slide--rotating">
      <AnimatePresence mode="wait">
        <motion.div key={activePost.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <MessageBoardPostContent post={activePost} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
