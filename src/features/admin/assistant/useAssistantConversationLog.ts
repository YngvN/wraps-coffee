import { useCallback, useEffect, useState } from 'react'
import type { TranscriptLine } from './useAssistantFlow'

/** One archived assistant conversation — snapshotted (not live-linked) once "New chat" is pressed, so re-opening the log later still shows exactly what was said even if the underlying products/events/etc. it discussed have since changed. */
export interface AssistantConversationEntry {
  id: string
  /** AI-generated (see `server/assistant/steps.ts`'s `generateTitle`), starting out as a plain-text fallback (the first user message) until that call resolves — see `updateTitle`. */
  title: string
  createdAt: string
  transcript: TranscriptLine[]
  /** Whether any operation within this conversation ever hit `'error'` (see `useAssistantFlow`'s own `hadErrorRef`) — even one the admin went on to resolve successfully. Drives the log's error tag. */
  hadError: boolean
}

const STORAGE_KEY = 'admin.assistantConversationLog'
/** Oldest entries are silently dropped past this cap — same "per-device scratch log, not a durable record" posture as `useRecentlyOpened`'s own `MAX_ENTRIES`. */
const MAX_ENTRIES = 30
/** Fired on `window` whenever any `useAssistantConversationLog()` instance archives/renames an entry — the native `storage` event only reaches *other* tabs, never the same one that wrote it (see `useRecentlyOpened`'s own `CHANGE_EVENT` for the same reasoning), which matters here since `useAssistantFlow` (writer) and `AssistantPanel`'s log view (reader) are two separate hook instances in the same tab. */
const CHANGE_EVENT = 'admin-assistant-conversation-log-changed'

let nextEntryId = 0

function readEntries(): AssistantConversationEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AssistantConversationEntry[]) : []
  } catch {
    return []
  }
}

function writeEntries(entries: AssistantConversationEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Ignore write errors (e.g. storage full or unavailable)
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/**
 * Per-device (plain `localStorage`, never synced across displays/admins —
 * same posture as `useRecentlyOpened`: "what I was just chatting about" is
 * specific to this one browser, not something to broadcast to every admin),
 * most-recent-first log of past assistant conversations. Archived only from
 * `useAssistantFlow`'s own `newChat()`, once, when leaving a non-empty
 * conversation behind; never mutated afterwards except by `updateTitle`,
 * which lets the AI-generated title arrive a moment after the entry itself
 * without blocking "New chat" on that network round-trip.
 */
export function useAssistantConversationLog() {
  const [entries, setEntries] = useState<AssistantConversationEntry[]>(() => readEntries())

  useEffect(() => {
    const handleChange = () => setEntries(readEntries())
    window.addEventListener(CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CHANGE_EVENT, handleChange)
  }, [])

  const archive = useCallback((transcript: TranscriptLine[], title: string, hadError: boolean) => {
    nextEntryId += 1
    const id = `${Date.now()}-${nextEntryId}`
    writeEntries([{ id, title, createdAt: new Date().toISOString(), transcript, hadError }, ...readEntries()].slice(0, MAX_ENTRIES))
    return id
  }, [])

  const updateTitle = useCallback((id: string, title: string) => {
    writeEntries(readEntries().map((entry) => (entry.id === id ? { ...entry, title } : entry)))
  }, [])

  return { entries, archive, updateTitle }
}
