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

/**
 * The stored URL of the real 4032x2268 upload this scenario renders. Deliberately kept in the
 * `http://localhost:4000/...` form the app actually persists (an upload URL carries whichever host the
 * *uploading admin* used), rather than a pre-normalized LAN URL: rewriting it to something the rendering
 * device can reach is `normalizeUploadUrl`'s own job (`src/lib/localServer.ts:353`), and that rewrite is
 * itself part of what this scenario needs to exercise — it was broken until 2026-08-11, which is exactly
 * why this decode cost never showed up in the original stutter profiling.
 */
const DIAG_IMAGE_URL = 'http://localhost:4000/uploads/1c206b82-80ff-44c9-be8b-47352a6be16e.jpg'

/**
 * A 6th scenario whose point is image *decode and paint* cost, which the other five structurally cannot
 * measure — every one of them is text-only. It exists because the 2026-08-10 round fixed the layout cost
 * (`Layout` count median 770 -> 30) while paint+composite barely moved (6.01ms -> 4.81ms), leaving an
 * unattributed remainder that only a device actually decoding a large bitmap can show.
 *
 * Renders the real 4032x2268 upload (~36.6MB decoded RGBA) at `fit: 'cover'` so it fills its pane
 * edge-to-edge — the worst case for both decode and per-frame compositing, and the case
 * `pickImageVariant` (`src/utils/responsiveImage.ts:24`) currently serves the full-size original for on
 * any viewport >= 768px wide, which every TV is.
 *
 * **Why the image alternates with `'time'` instead of swapping between two different images:** only one
 * image asset exists in `server/uploads/`, and mounting the *same* URL at every stage would let the
 * browser re-composite an already-decoded, still-cached bitmap — measuring nothing. Alternating
 * image/non-image forces a genuine decode on entry to stages 1 and 3. This also happens to mirror the
 * real "Test screen" exactly, which carries this same image at stages 1 and 3 and other content at
 * stage 2.
 *
 * Panes B and C are deliberately cheap (`'time'`, the `useShrinkToFitScale` control path at 1 forced
 * layout, not the 9-probe font-scale search) so that whatever this scenario measures is attributable to
 * the image rather than to a concurrent font-scale search — `human` already isolates that other cost.
 * Shares `human`'s slide transition, loud per-pane backgrounds and magenta borders so a transition stays
 * watchable frame by frame on a TV, where there is no DevTools overlay to fall back on.
 */
export function buildImagePaneScenarioScreen(slideDurationSeconds = 5, variant: 'imagepane' | 'imagepanectl' = 'imagepane'): ScenarioScreen {
  // `imagepanectl` is this same screen with the image swapped for the same cheap `'time'` pane the
  // other two panes already use, and NOTHING else changed — same tree, same ratios, same stage count,
  // same slide transition, same borders, same backgrounds, same slide duration. It exists because
  // comparing `imagepane` against `human` cannot isolate the image: those two also differ in pane
  // content cost (`human` runs two catalogue panes through the 9-probe font-scale search, `imagepane`
  // runs two `'time'` panes through the 1-layout path), so any difference between them confounds
  // "image decode" with "font-scale search". Diffing `imagepane` against `imagepanectl` varies exactly
  // one thing: whether a 4032x2268 bitmap is decoded and composited.
  const isControl = variant === 'imagepanectl'
  const { node: leafA, id: idA } = createLeaf()
  const { node: leafB, id: idB } = createLeaf()
  const { node: leafC, id: idC } = createLeaf()

  const columnStage1: LayoutNode = { type: 'split', direction: 'column', ratio: 50, first: leafA, second: leafB }
  const columnStage2: LayoutNode = { type: 'split', direction: 'column', ratio: 70, first: leafA, second: leafB }
  const columnStage3: LayoutNode = { type: 'split', direction: 'column', ratio: 40, first: leafA, second: leafB }
  // Stage 3 gives pane A (the image) the largest share of the viewport it gets anywhere in this
  // scenario, so the most expensive composite lands on the stage that also re-decodes.
  const treeStage1: LayoutNode = { type: 'split', direction: 'row', ratio: 55, first: columnStage1, second: leafC }
  const treeStage2: LayoutNode = { type: 'split', direction: 'row', ratio: 30, first: columnStage2, second: leafC }
  const treeStage3: LayoutNode = { type: 'split', direction: 'row', ratio: 80, first: columnStage3, second: leafC }

  const imageContent: ScreenSlotContent = isControl ? { kind: 'time' } : { kind: 'image', imageUrl: DIAG_IMAGE_URL, fit: 'cover' }

  const screen: ScreenConfig = {
    screenID: `${DIAG_ID_PREFIX}${variant}`,
    name: `[diagnostic] pane-resize-stutter (${variant})`,
    layout: { 1: treeStage1, 2: treeStage2, 3: treeStage3 },
    paneSlots: {
      [idA]: {
        // image -> time -> image: a real decode on entry to stages 1 and 3, never a warm re-composite.
        content: { 1: imageContent, 2: { kind: 'time' }, 3: imageContent },
        backgroundColor: { 1: '#1d3557', 2: '#457b9d', 3: '#1d3557' },
        backgroundImage: {},
        textSizes: {},
      },
      [idB]: {
        content: { 1: { kind: 'time' } },
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
    borderColor: '#ff00d4',
  }

  return { variant, screen, products: [] }
}

/**
 * Which content kind each `solo*` variant puts in pane A. Every one of these is a kind the real "Test
 * screen" renders and none of the other scenarios do — that screen measured far worse on the TV than
 * any synthetic scenario (median frame 22ms vs 12ms, p99 101ms vs 32ms, legacy jank 52.4% vs 3.5%),
 * and nothing in the existing scenario set could explain the gap.
 *
 * The configs are deliberately the same minimal objects the real screen stores (`{kind:'transit',
 * brand:'entur', stopId:''}` etc.) — each pane resolves its actual data from global integration
 * settings, so a seeded copy renders the same live content the real screen does rather than an empty
 * placeholder that would measure nothing.
 */
const SOLO_KIND_CONTENT: Record<'solonews' | 'soloweather' | 'soloqr' | 'solotransit', ScreenSlotContent> = {
  solonews: { kind: 'news', sourceIds: [] },
  soloweather: { kind: 'weather', useBrandTheme: false },
  soloqr: { kind: 'qrcode', url: '', linkMode: 'news' },
  solotransit: { kind: 'transit', brand: 'entur', stopId: '' },
}

export type SoloKindVariant = keyof typeof SOLO_KIND_CONTENT

/**
 * One content kind under test in pane A, with everything else held byte-identical to
 * `imagepanectl` — same tree, ratios, stage count, slide transition, borders, backgrounds and slide
 * duration. That makes every `solo*` run directly comparable both to `imagepanectl` (the all-`'time'`
 * floor, measured at 3.80% janky frames) and to `imagepane` (the same structure carrying a 4032x2268
 * image, measured at 11.43%), so a kind's own cost reads straight off the difference.
 *
 * Unlike `imagepane`, the content under test is present at *every* stage rather than alternating with
 * `'time'` — these kinds are persistent panes on the real screen (a weather or transit pane stays
 * mounted across stages), and holding them mounted is what reproduces that.
 */
export function buildSoloKindScenarioScreen(variant: SoloKindVariant, slideDurationSeconds = 5): ScenarioScreen {
  const { node: leafA, id: idA } = createLeaf()
  const { node: leafB, id: idB } = createLeaf()
  const { node: leafC, id: idC } = createLeaf()

  const columnStage1: LayoutNode = { type: 'split', direction: 'column', ratio: 50, first: leafA, second: leafB }
  const columnStage2: LayoutNode = { type: 'split', direction: 'column', ratio: 70, first: leafA, second: leafB }
  const columnStage3: LayoutNode = { type: 'split', direction: 'column', ratio: 40, first: leafA, second: leafB }
  const treeStage1: LayoutNode = { type: 'split', direction: 'row', ratio: 55, first: columnStage1, second: leafC }
  const treeStage2: LayoutNode = { type: 'split', direction: 'row', ratio: 30, first: columnStage2, second: leafC }
  const treeStage3: LayoutNode = { type: 'split', direction: 'row', ratio: 80, first: columnStage3, second: leafC }

  const screen: ScreenConfig = {
    screenID: `${DIAG_ID_PREFIX}${variant}`,
    name: `[diagnostic] pane-resize-stutter (${variant})`,
    layout: { 1: treeStage1, 2: treeStage2, 3: treeStage3 },
    paneSlots: {
      [idA]: {
        content: { 1: SOLO_KIND_CONTENT[variant] },
        backgroundColor: { 1: '#1d3557', 2: '#457b9d', 3: '#1d3557' },
        backgroundImage: {},
        textSizes: {},
      },
      [idB]: { content: { 1: { kind: 'time' } }, backgroundColor: { 1: '#88d18a', 2: '#f4a261', 3: '#88d18a' }, backgroundImage: {}, textSizes: {} },
      [idC]: { content: { 1: { kind: 'time' } }, backgroundColor: { 1: '#6a4c93', 2: '#b5179e', 3: '#6a4c93' }, backgroundImage: {}, textSizes: {} },
    },
    useStages: true,
    stageCount: 3,
    slideDurationSeconds,
    transitionStyle: 'slide',
    textSizes: { heading: 11, itemTitle: 5.5, description: 4, price: 5, itemPrice: 5 },
    usesPercentTextSizes: true,
    showSlotBorders: true,
    borderColor: '#ff00d4',
  }

  return { variant, screen, products: [] }
}

export function buildAllScenarioScreens(slideDurationSeconds = 5): ScenarioScreen[] {
  const staticScenarios = (['as-is', 'emptycatalogue', 'textblock', 'emptied'] as const).map((variant) => buildScenarioScreen(variant, slideDurationSeconds))
  return [
    ...staticScenarios,
    buildHumanScenarioScreen(slideDurationSeconds),
    buildImagePaneScenarioScreen(slideDurationSeconds, 'imagepane'),
    buildImagePaneScenarioScreen(slideDurationSeconds, 'imagepanectl'),
    ...(['solonews', 'soloweather', 'soloqr', 'solotransit'] as const).map((variant) => buildSoloKindScenarioScreen(variant, slideDurationSeconds)),
  ]
}
