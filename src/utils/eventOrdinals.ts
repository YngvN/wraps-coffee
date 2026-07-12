import type { ScreenSlot } from '../types/screen'
import { resolveSlotContent } from './screenStages'

/**
 * Looks for an `eventOrdinal` already chosen on one of `otherSlots` (an
 * `'event'` content in `'image'`/`'details'` display mode) at `stage`,
 * returning the first one found — the "smart default" a fresh Event
 * image/details pane starts from, so pairing e.g. an image pane with a
 * details pane for the same event doesn't require picking the same ordinal
 * twice. `undefined` if no sibling pane has one set yet.
 */
export function findSiblingEventOrdinal(otherSlots: ScreenSlot[], stage: number): number | undefined {
  for (const slot of otherSlots) {
    const content = resolveSlotContent(slot, stage)
    if (content.kind === 'event' && (content.displayMode === 'image' || content.displayMode === 'details') && content.eventOrdinal !== undefined) {
      return content.eventOrdinal
    }
  }
  return undefined
}
