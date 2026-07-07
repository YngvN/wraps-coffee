import type { ScreenConfig } from '../../../types/screen'
import { isSlotActive } from '../../../utils/screenSlots'
import type { LayoutIconPattern } from './LayoutIcon'

/** Derives which `LayoutIconPattern` best represents a screen's actual current configuration, for its card preview. Uses `slotCount` for the shape (the shown arrangement doesn't depend on whether each slot has content yet) but still falls back to the dashed "empty" preview when none of those slots have anything configured. */
export function getScreenPreviewPattern(screen: ScreenConfig): LayoutIconPattern {
  if (!screen.slots.slice(0, screen.slotCount).some(isSlotActive)) return 'empty'

  if (screen.slotCount === 1) return 'single'
  if (screen.slotCount === 4) return 'quad'
  if (screen.slotCount === 3) return `triple-${screen.splitDirection ?? 'row'}-${screen.splitBigPosition ?? 'first'}` as LayoutIconPattern
  return screen.splitDirection ?? 'row'
}
