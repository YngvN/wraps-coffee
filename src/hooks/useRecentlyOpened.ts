import { useCallback, useEffect, useState } from 'react'

export type RecentlyOpenedType = 'screen' | 'category' | 'product' | 'event'

/** One entry in the recently-opened log — `label` is snapshotted at the time it was opened (not re-derived live), so a since-renamed screen/category still reads sensibly in the list until it's opened again. */
export interface RecentlyOpenedEntry {
  type: RecentlyOpenedType
  id: string
  label: string
  openedAt: string
}

const STORAGE_KEY = 'admin.recentlyOpened'
const MAX_ENTRIES = 8
/** Fired on `window` (in addition to the plain `localStorage` write) whenever any `useRecentlyOpened()` instance records an entry — the native `storage` event only reaches *other* tabs, never the same one that wrote it, so this is what lets e.g. `ScreensView` recording an open and `AdminSidebarNav`'s own separate hook instance (reading the same key) actually see it without a route change forcing a re-render in between. */
const CHANGE_EVENT = 'admin-recently-opened-changed'

function readEntries(): RecentlyOpenedEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RecentlyOpenedEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Per-device (plain `localStorage`, never synced across displays/admins —
 * unlike every other admin dataset, "what I was just working on" is
 * specific to this one browser, not something to broadcast), most-recent-
 * first log of screens/categories/products/events opened for editing.
 * Powers the sidebar's tier-2 flyout "recently opened" section (see
 * `AdminSidebarNav`/`SidebarFlyout`) and `GlobalSearchPanel`'s own
 * empty-state recents — a quick way back into whatever was just being
 * worked on. Capped at `MAX_ENTRIES`, deduplicated by `(type, id)`
 * (re-opening something already in the list just moves it back to the
 * front rather than appearing twice).
 */
export function useRecentlyOpened() {
  const [entries, setEntries] = useState<RecentlyOpenedEntry[]>(() => readEntries())

  useEffect(() => {
    const handleChange = () => setEntries(readEntries())
    window.addEventListener(CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CHANGE_EVENT, handleChange)
  }, [])

  const record = useCallback((type: RecentlyOpenedType, id: string, label: string) => {
    const next = [{ type, id, label, openedAt: new Date().toISOString() }, ...readEntries().filter((entry) => !(entry.type === type && entry.id === id))].slice(0, MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { entries, record }
}
