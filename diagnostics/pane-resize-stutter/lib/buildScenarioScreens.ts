import type { Catalogue } from '../../../src/types/category'
import type { Product } from '../../../src/types/product'
import type { LayoutNode, ScreenConfig, ScreenSlot, ScreenSlotContent } from '../../../src/types/screen'
import { createLeaf } from '../../../src/utils/layoutTree'
import { buildDiagCatalogueData } from './diagCatalogueData'
import { DIAG_ID_PREFIX } from './seedClient'
import type { ScenarioVariant } from '../types'

/** One scenario's full seedable payload — a `ScreenConfig` plus (for every variant but `emptied`) the `Catalogue`/`Product[]` its panes A/B read from. */
export interface ScenarioScreen {
  variant: ScenarioVariant
  screen: ScreenConfig
  catalogue?: Catalogue
  products: Product[]
}

function emptySlotTimeline(content: ScreenSlotContent): ScreenSlot {
  return { content: { 1: content }, backgroundColor: {}, backgroundImage: {}, textSizes: {} }
}

/**
 * Builds one scenario's `ScreenConfig`: 3 leaves (`row{ column{A,B}, C }`), 2 stages sharing the same
 * tree *shape* but different split ratios (both the outer row and the inner A/B column), so the
 * `grid-template-columns`/`rows` CSS transition in `LayoutTree.tsx` actually fires every rotation — see
 * `SplitLayout.tsx:490`. A/B carry this variant's catalogue content (the `useShrinkToFitFontScale`
 * exerciser, `LayoutPane.tsx:249-250`); C is a plain `'time'` pane (the cheap `useShrinkToFitScale`
 * control) unchanged across every variant. `slideDurationSeconds` is short so natural rotation alone
 * triggers repeated transitions with no manual/URL-param triggering needed — see the plan's "Triggering
 * a transition" design decision.
 */
export function buildScenarioScreen(variant: ScenarioVariant, slideDurationSeconds = 5): ScenarioScreen {
  const { node: leafA, id: idA } = createLeaf()
  const { node: leafB, id: idB } = createLeaf()
  const { node: leafC, id: idC } = createLeaf()

  const columnStage1: LayoutNode = { type: 'split', direction: 'column', ratio: 50, first: leafA, second: leafB }
  const columnStage2: LayoutNode = { type: 'split', direction: 'column', ratio: 70, first: leafA, second: leafB }
  const treeStage1: LayoutNode = { type: 'split', direction: 'row', ratio: 55, first: columnStage1, second: leafC }
  const treeStage2: LayoutNode = { type: 'split', direction: 'row', ratio: 30, first: columnStage2, second: leafC }

  let contentA: ScreenSlotContent
  let contentB: ScreenSlotContent
  let catalogue: Catalogue | undefined
  let products: Product[] = []

  if (variant === 'emptied') {
    contentA = { kind: 'none' }
    contentB = { kind: 'none' }
  } else {
    const data = buildDiagCatalogueData(variant)
    catalogue = data.catalogue
    products = data.products
    contentA = { kind: 'catalogue', catalogueId: data.catalogue.id, categories: [data.categoryAId] }
    contentB = { kind: 'catalogue', catalogueId: data.catalogue.id, categories: [data.categoryBId] }
  }

  const screen: ScreenConfig = {
    screenID: `${DIAG_ID_PREFIX}${variant}`,
    name: `[diagnostic] pane-resize-stutter (${variant})`,
    layout: { 1: treeStage1, 2: treeStage2 },
    paneSlots: {
      [idA]: emptySlotTimeline(contentA),
      [idB]: emptySlotTimeline(contentB),
      [idC]: emptySlotTimeline({ kind: 'time' }),
    },
    useStages: true,
    stageCount: 2,
    slideDurationSeconds,
    transitionStyle: 'fade',
  }

  return { variant, screen, catalogue, products }
}

export function buildAllScenarioScreens(slideDurationSeconds = 5): ScenarioScreen[] {
  return (['as-is', 'emptycatalogue', 'textblock', 'emptied'] as const).map((variant) => buildScenarioScreen(variant, slideDurationSeconds))
}
