import type { OrdersPaneMode, ScreenConfig } from '../../../types/screen'
import { generateId } from '../../../utils/id'
import { createLeaf, emptySlot } from '../../../utils/layoutTree'
import { writeStageCheckpoint } from '../../../utils/screenStages'

/**
 * A ready-made screen with a single full-screen `'orders'` pane — the Screens view's "Create order
 * board" (`'staff'`, Touch control on, for the barista's tablet) and "Create pickup board"
 * (`'customer'`, read-only, for a screen customers can see). Built the same way `ScreenForm` builds a
 * brand-new screen (one leaf, stage 1 only, the same slide duration and transition defaults), so it
 * edits like any other screen afterwards — e.g. splitting the pickup board to show the menu beside it.
 */
export function buildOrderBoardScreen(mode: OrdersPaneMode, name: string): ScreenConfig {
  const { node, id } = createLeaf()
  const content = mode === 'staff' ? ({ kind: 'orders', mode, touchControl: true } as const) : ({ kind: 'orders', mode } as const)
  return {
    screenID: `screen-${generateId()}`,
    name,
    layout: { 1: node },
    paneSlots: { [id]: { ...emptySlot(), content: writeStageCheckpoint(undefined, 1, content) } },
    slideDurationSeconds: 10,
    transitionStyle: 'fade',
  }
}
