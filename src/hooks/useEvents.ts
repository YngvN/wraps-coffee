import eventsSeed from '../data/events.json'
import type { EventRecord } from '../utils/events'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.events'

/** Returns the live events list and a setter that persists edits to localStorage, overlaying `events.json` until a real backend exists. */
export function useEvents() {
  return useLocalStorage<EventRecord[]>(STORAGE_KEY, eventsSeed as EventRecord[])
}
