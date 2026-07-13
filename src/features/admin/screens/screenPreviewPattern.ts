import type { LayoutNode, ScreenConfig } from '../../../types/screen'
import { listLeaves } from '../../../utils/layoutTree'
import { isSlotActive } from '../../../utils/screenStages'

/** The tree `LayoutIcon` should preview for a screen's card thumbnail — its currently-resolved (stage 1) layout, or `null` for the dashed "empty" placeholder when none of its panes have anything configured yet. */
export function getScreenPreviewPattern(screen: Pick<ScreenConfig, 'layout' | 'paneSlots'>): LayoutNode | null {
  const tree = screen.layout[1] ?? Object.values(screen.layout)[0]
  if (!tree) return null
  const hasContent = listLeaves(tree).some((leaf) => {
    const slot = screen.paneSlots[leaf.id]
    return slot && isSlotActive(slot)
  })
  return hasContent ? tree : null
}
