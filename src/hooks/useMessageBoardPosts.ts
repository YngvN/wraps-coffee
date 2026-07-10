import type { MessageBoardPost } from '../types/messageBoard'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.messageBoardPosts'

/** Returns the live list of message-board posts (across every board) and a setter that persists edits to localStorage. */
export function useMessageBoardPosts() {
  return useLocalStorage<MessageBoardPost[]>(STORAGE_KEY, [])
}
