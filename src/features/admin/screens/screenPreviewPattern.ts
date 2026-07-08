import type { ScreenConfig } from '../../../types/screen'
import { isSlotActive } from '../../../utils/screenStages'
import type { LayoutIconPattern } from './LayoutIcon'

/** Which `LayoutIconPattern` shape matches a `slotCount`/`splitDirection`/`splitBigPosition` combo, regardless of whether any slot has content configured yet — used both for a screen's card preview (see `getScreenPreviewPattern`) and, per slot, for the admin form's own tab buttons (see `ScreenForm`'s `LayoutIcon` + `highlightIndex` usage). */
export function getArrangementPattern(screen: Pick<ScreenConfig, 'slotCount' | 'splitDirection' | 'splitBigPosition'>): LayoutIconPattern {
  if (screen.slotCount === 1) return 'single'
  if (screen.slotCount === 4) return 'quad'
  if (screen.slotCount === 3) return `triple-${screen.splitDirection ?? 'row'}-${screen.splitBigPosition ?? 'first'}` as LayoutIconPattern
  return screen.splitDirection ?? 'row'
}

/** Derives which `LayoutIconPattern` best represents a screen's actual current configuration, for its card preview. Uses `getArrangementPattern` for the shape (the shown arrangement doesn't depend on whether each slot has content yet) but falls back to the dashed "empty" preview when none of those slots have anything configured. */
export function getScreenPreviewPattern(screen: ScreenConfig): LayoutIconPattern {
  if (!screen.slots.slice(0, screen.slotCount).some(isSlotActive)) return 'empty'
  return getArrangementPattern(screen)
}
