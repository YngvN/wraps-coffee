import type { MessageBoardPost } from '../types/messageBoard'

/** Whether `post` is past its own `expiresAt`, if it has one — never expired when `expiresAt` is unset. */
export function isPostExpired(post: MessageBoardPost, now: Date = new Date()): boolean {
  return post.expiresAt !== undefined && new Date(post.expiresAt).getTime() <= now.getTime()
}

/**
 * Sorts message-board posts for display: pinned posts always lead, followed
 * by the rest ordered by `createdAt` per `order`. Used as-is by the admin
 * list (always `'newestFirst'`) and by `MessageBoardSlide` (after filtering
 * to one board and dropping expired posts).
 */
export function sortMessageBoardPosts(posts: MessageBoardPost[], order: 'newestFirst' | 'oldestFirst'): MessageBoardPost[] {
  const direction = order === 'newestFirst' ? -1 : 1
  return [...posts].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  })
}
