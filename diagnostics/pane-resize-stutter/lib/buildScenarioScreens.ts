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
export function buildScenarioScreen(variant: Exclude<ScenarioVariant, 'human'>, slideDurationSeconds = 5): ScenarioScreen {
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

const HUMAN_LONG_DESCRIPTION = {
  no: 'Ristede kaffebønner fra høylandet, malt fersk for hver kopp og traktet sakte for en rund, syrlig smak med toner av mørk sjokolade og bær.',
  en: 'Roasted highland coffee beans, ground fresh for every cup and slow-brewed for a round, tangy flavor with notes of dark chocolate and berries.',
}

/**
 * A 5th scenario mirroring the real "Human testing" screen that first surfaced this stutter visibly (see
 * `docs`/the slide-transition-stutter fix's own plan) — the 4 scenarios above only ever seed ONE
 * checkpoint of content per pane (`emptySlotTimeline`), so `useCrossfadeSlot` never actually flips slots
 * across a stage transition and only one crossfade slot is ever "hot" at a time. Pane B here instead gets
 * a genuinely different `catalogue` category at every stage, so a stage transition crossfades between two
 * *different* resolved contents that both trigger `useShrinkToFitFontScale` (`LayoutPane.tsx:249-250`)
 * concurrently in both slots — the compounding case the other 4 scenarios structurally can't exercise.
 * Also matches the real screen's `transitionStyle: 'slide'`, `showSlotBorders`, a per-stage
 * `backgroundColor` change (rides the same `background-color` transition as the animated grid track,
 * `SplitLayout.tsx:490`), 3 stages, and explicit tight percent text sizes with `usesPercentTextSizes:
 * true` set (without it, `useScreens.ts`'s legacy-rem-to-percent migration inflates the effective sizes,
 * understating the real screen's actual shrink-search range).
 *
 * Deliberately doesn't use `transit`/`weather`/`event`-month the way the real screen does — those either
 * need live external API data (transit/weather) or a separately-seeded `Event` (event-month), neither of
 * which this self-contained harness wants to depend on. Two different `catalogue` categories back-to-back
 * exercises the exact same `usesFontScale` gate and the same dual-slot concurrency with substantial real
 * content in both slots, without the extra dependency.
 */
export function buildHumanScenarioScreen(slideDurationSeconds = 5): ScenarioScreen {
  const { node: leafA, id: idA } = createLeaf()
  const { node: leafB, id: idB } = createLeaf()
  const { node: leafC, id: idC } = createLeaf()

  const columnStage1: LayoutNode = { type: 'split', direction: 'column', ratio: 50, first: leafA, second: leafB }
  const columnStage2: LayoutNode = { type: 'split', direction: 'column', ratio: 70, first: leafA, second: leafB }
  const columnStage3: LayoutNode = { type: 'split', direction: 'column', ratio: 40, first: leafA, second: leafB }
  const treeStage1: LayoutNode = { type: 'split', direction: 'row', ratio: 55, first: columnStage1, second: leafC }
  const treeStage2: LayoutNode = { type: 'split', direction: 'row', ratio: 30, first: columnStage2, second: leafC }
  const treeStage3: LayoutNode = { type: 'split', direction: 'row', ratio: 65, first: columnStage3, second: leafC }

  const catalogueId = `${DIAG_ID_PREFIX}catalogue-human`
  const categoryIds = ['a', 'b', 'c', 'd'].map((letter) => `${DIAG_ID_PREFIX}cat-human-${letter}`)
  const [categoryAId, categoryBId, categoryCId, categoryDId] = categoryIds

  const products: Product[] = []
  for (const categoryId of categoryIds) {
    for (let item = 0; item < 6; item++) {
      products.push({
        itemID: `${DIAG_ID_PREFIX}product-human-${categoryId}-${item}`,
        category: categoryId,
        name: { no: `Diagnostikk ${item + 1}`, en: `Diagnostic item ${item + 1}` },
        description: HUMAN_LONG_DESCRIPTION,
        allergens: [],
        dietaryTags: [],
        available: true,
      })
    }
  }

  const catalogue: Catalogue = {
    id: catalogueId,
    name: { no: 'Diagnostikk (human)', en: 'Diagnostic (human)' },
    categories: [
      { id: categoryAId, name: { no: 'Kategori A', en: 'Category A' } },
      { id: categoryBId, name: { no: 'Kategori B', en: 'Category B' } },
      { id: categoryCId, name: { no: 'Kategori C', en: 'Category C' } },
      { id: categoryDId, name: { no: 'Kategori D', en: 'Category D' } },
    ],
  }

  const catalogueContent = (categoryId: string): ScreenSlotContent => ({ kind: 'catalogue', catalogueId, categories: [categoryId] })

  const screen: ScreenConfig = {
    screenID: `${DIAG_ID_PREFIX}human`,
    name: '[diagnostic] pane-resize-stutter (human)',
    layout: { 1: treeStage1, 2: treeStage2, 3: treeStage3 },
    paneSlots: {
      // Every pane carries its own strongly-contrasting background, changing
      // per stage. Two reasons, both about making a transition *observable*:
      // the borders (see `borderColor` below) need something to contrast
      // against on both sides to be visible at all while they shrink/grow,
      // and distinctly-colored blocks are the only way to actually see
      // whether pane geometry visibly jumps when it changes — against a
      // uniform background a jump is invisible, which would make a broken
      // transition look fine.
      [idA]: {
        content: { 1: { kind: 'time' }, 2: catalogueContent(categoryAId), 3: catalogueContent(categoryBId) },
        backgroundColor: { 1: '#1d3557', 2: '#457b9d', 3: '#1d3557' },
        backgroundImage: {},
        textSizes: {},
      },
      [idB]: {
        // A genuinely different `catalogue` category at every stage — see this function's own doc
        // comment for why this (not `transit`/`weather`) is the dual-font-scale-slot exerciser here.
        content: { 1: catalogueContent(categoryCId), 2: catalogueContent(categoryDId), 3: catalogueContent(categoryCId) },
        backgroundColor: { 1: '#88d18a', 2: '#f4a261', 3: '#88d18a' },
        backgroundImage: {},
        textSizes: {},
      },
      [idC]: {
        content: { 1: { kind: 'time' } },
        backgroundColor: { 1: '#6a4c93', 2: '#b5179e', 3: '#6a4c93' },
        backgroundImage: {},
        textSizes: {},
      },
    },
    useStages: true,
    stageCount: 3,
    slideDurationSeconds,
    transitionStyle: 'slide',
    textSizes: { heading: 11, itemTitle: 5.5, description: 4, price: 5, itemPrice: 5 },
    usesPercentTextSizes: true,
    showSlotBorders: true,
    // Deliberately a loud magenta rather than the real screens' subtle
    // contrast-derived border: this scenario exists to make the border's own
    // shrink/grow animation watchable frame by frame, and white borders
    // disappear against any light pane background. `borderColor` is
    // screen-level (`ScreenConfig['borderColor']`), so every border shares
    // this one color — the per-pane backgrounds above are what make
    // individual borders distinguishable from each other.
    borderColor: '#ff00d4',
  }

  return { variant: 'human', screen, catalogue, products }
}

export function buildAllScenarioScreens(slideDurationSeconds = 5): ScenarioScreen[] {
  const staticScenarios = (['as-is', 'emptycatalogue', 'textblock', 'emptied'] as const).map((variant) => buildScenarioScreen(variant, slideDurationSeconds))
  return [...staticScenarios, buildHumanScenarioScreen(slideDurationSeconds)]
}
