import messagesSeed from '../data/messages.json'
import type { ContactMessage } from '../types/message'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.messages'

/** Returns the live customer messages and a setter that persists edits (e.g. marking as read) to localStorage. */
export function useMessages() {
  return useLocalStorage<ContactMessage[]>(STORAGE_KEY, messagesSeed as ContactMessage[])
}
