import type { ScreenConfig } from '../../../types/screen'
import type { LayoutIconPattern } from './LayoutIcon'

/** Derives which `LayoutIconPattern` best represents a screen's actual current configuration, for its card preview. */
export function getScreenPreviewPattern(screen: ScreenConfig): LayoutIconPattern {
  if (screen.layout === 'slideshow') return 'slideshow'

  const activeCount = screen.slots.filter((slot) => slot.kind !== 'none').length
  if (activeCount === 0) return 'empty'
  if (activeCount === 1) return 'single'
  if (activeCount === 4) return 'quad'
  if (activeCount === 3) return `triple-${screen.splitDirection ?? 'row'}-${screen.splitBigPosition ?? 'first'}` as LayoutIconPattern
  return screen.splitDirection ?? 'row'
}
