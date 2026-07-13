import type { ScreenConfig } from '../types/screen'

/** One "Custom message" announcement's own text — see `ScreenSlotContent`'s `'announcement'` kind. */
export interface AnnouncementMessage {
  title: string
  description: string
}

/**
 * Every distinct "Custom message" announcement already configured anywhere
 * across every screen, pane, and step — deduplicated by exact title +
 * description match, so the same message reused across several
 * panes/steps doesn't show up more than once, and a blank one (no title —
 * a freshly switched-to, not-yet-filled-in pane) is skipped as nothing
 * worth copying. Powers `SlideFields`'s own "Copy from another message"
 * picker.
 */
export function collectAnnouncementMessages(screens: ScreenConfig[]): AnnouncementMessage[] {
  const seen = new Map<string, AnnouncementMessage>()
  for (const screen of screens) {
    for (const slot of Object.values(screen.paneSlots)) {
      for (const content of Object.values(slot.content)) {
        if (content.kind !== 'announcement') continue
        if (!content.title) continue
        const key = JSON.stringify([content.title, content.description])
        if (!seen.has(key)) seen.set(key, { title: content.title, description: content.description })
      }
    }
  }
  return [...seen.values()]
}
