import type { ScreenConfig } from '../../../types/screen'
import { generateId } from '../../../utils/id'
import { createLeaf, emptySlot } from '../../../utils/layoutTree'
import { writeStageCheckpoint } from '../../../utils/screenStages'

/**
 * A ready-made counter screen for the café tablet — the Screens view's "Create register": one
 * full-screen `'register'` pane. The order board is its own screen ("Create order board"), shown on
 * its own tablet or switched to separately, so each gets the whole display. Built the same way as
 * `buildOrderBoardScreen` (one leaf, stage 1 only, the usual slide defaults), so it edits like any
 * other screen afterwards.
 */
export function buildRegisterScreen(name: string): ScreenConfig {
  const { node, id } = createLeaf()
  return {
    screenID: `screen-${generateId()}`,
    name,
    layout: { 1: node },
    paneSlots: { [id]: { ...emptySlot(), content: writeStageCheckpoint(undefined, 1, { kind: 'register' }) } },
    slideDurationSeconds: 10,
    transitionStyle: 'fade',
  }
}
