import type { MessageBoard } from '../types/messageBoard'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.messageBoards'

/** Returns the live list of message boards and a setter that persists edits (create/rename/delete/publish-toggle) to localStorage. */
export function useMessageBoards() {
  return useLocalStorage<MessageBoard[]>(STORAGE_KEY, [])
}
