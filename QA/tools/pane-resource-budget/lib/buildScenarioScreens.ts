import { MAX_PANE_CUSTOM_CSS_LENGTH, MAX_PANE_CUSTOM_HTML_LENGTH, type LayoutNode, type ScreenConfig, type ScreenSlot, type ScreenSlotContent } from '../../../../src/types/screen'
import { createLeaf } from '../../../../src/utils/layoutTree'
import { BUDGET_ID_PREFIX } from './seedClient'

/** How close to the hard per-field cap the worst-case scenario's own generated CSS/HTML gets — deliberately just under 100% (a few bytes of headroom) rather than exactly at the cap, so a length check with an off-by-one wouldn't itself make seeding fail. */
const NEAR_CAP_FRACTION = 0.97

function emptySlotTimeline(content: ScreenSlotContent): ScreenSlot {
  return { content: { 1: content }, backgroundColor: {}, backgroundImage: {}, textSizes: {} }
}

/**
 * A long, but entirely allowlisted (assistant-posture-safe, not just admin-safe), CSS declaration block
 * padded out to just under `MAX_PANE_CUSTOM_CSS_LENGTH` — repeats a handful of always-allowed
 * typography/spacing declarations (comma-separated `font-family` stack, `letter-spacing`) rather than
 * anything selector-, at-rule-, or `!important`-based, since the real validator (`paneCustomCss.ts`)
 * would reject any of those and this needs to represent a real admin's worst *valid* case, not an
 * already-invalid one.
 */
function buildMaxLengthCss(): string {
  const fontStack = Array.from({ length: 40 }, (_, i) => `"Budget Test Font ${i}"`).join(', ')
  const lines = [`font-family: ${fontStack}, sans-serif;`, 'color: #222222;', 'font-weight: 700;', 'line-height: 1.4;']
  let css = ''
  while (css.length < MAX_PANE_CUSTOM_CSS_LENGTH * NEAR_CAP_FRACTION) {
    for (const line of lines) {
      css += `${line}\n`
      if (css.length >= MAX_PANE_CUSTOM_CSS_LENGTH * NEAR_CAP_FRACTION) break
    }
  }
  return css.slice(0, Math.floor(MAX_PANE_CUSTOM_CSS_LENGTH * NEAR_CAP_FRACTION))
}

/**
 * A deeply-nested, allowlisted HTML block padded out to just under `MAX_PANE_CUSTOM_HTML_LENGTH` —
 * this is the one lever that directly stresses DOM node count (see `MemorySample`'s own doc comment on
 * why `customHtml` is treated as a DOM-node-count concern specifically), so it repeats real nested
 * elements rather than one long text run, which would pad the character count without adding nodes.
 */
function buildMaxLengthHtml(): string {
  const block = '<div><span>Budget test</span> <strong>content</strong> <em>block</em>.</div>'
  let html = ''
  while (html.length + block.length < MAX_PANE_CUSTOM_HTML_LENGTH * NEAR_CAP_FRACTION) html += block
  return html
}

/**
 * The floor/control screen: a plain 3-pane layout (catalogue x2 + a clock), single stage, no custom
 * CSS/HTML at all — what a normal, real-world screen looks like today. Every metric the worst-case
 * scenario reports should be read as a delta *against this*, not against zero.
 */
export function buildBaselineScreen(): ScreenConfig {
  const { node: leafA, id: idA } = createLeaf()
  const { node: leafB, id: idB } = createLeaf()
  const { node: leafC, id: idC } = createLeaf()
  const tree: LayoutNode = { type: 'split', direction: 'row', ratio: 60, first: { type: 'split', direction: 'column', ratio: 50, first: leafA, second: leafB }, second: leafC }

  return {
    screenID: `${BUDGET_ID_PREFIX}baseline`,
    name: '[pane-resource-budget] baseline',
    layout: { 1: tree },
    paneSlots: {
      [idA]: emptySlotTimeline({ kind: 'catalogue', categories: [] }),
      [idB]: emptySlotTimeline({ kind: 'catalogue', categories: [] }),
      [idC]: emptySlotTimeline({ kind: 'time' }),
    },
    useStages: false,
    stageCount: 1,
    slideDurationSeconds: 10,
    transitionStyle: 'fade',
  }
}

/**
 * The worst-case screen the plan calls for: several panes each near their own `customCss`/`customHtml`
 * length cap, multi-stage and actively rotating (short `slideDurationSeconds` so natural rotation alone
 * triggers repeated transitions with no manual/URL-param triggering needed, same reasoning
 * `diagnostics/pane-resize-stutter/lib/buildScenarioScreens.ts`'s own doc comment gives). 6 leaves, 2
 * stages sharing the same tree shape but different split ratios so the grid-template CSS transition
 * actually fires every rotation. Every pane carries both a near-max-length `customCss` and
 * `customHtml`; alternating `customHtmlPlacement` (before/after) so both code paths are exercised, not
 * just one.
 */
export function buildWorstCaseScreen(): ScreenConfig {
  const leaves = Array.from({ length: 6 }, () => createLeaf())
  const [a, b, c, d, e, f] = leaves.map((l) => l.node)

  const rowStage1: LayoutNode = { type: 'split', direction: 'row', ratio: 50, first: { type: 'split', direction: 'column', ratio: 33, first: a, second: { type: 'split', direction: 'column', ratio: 50, first: b, second: c } }, second: { type: 'split', direction: 'column', ratio: 33, first: d, second: { type: 'split', direction: 'column', ratio: 50, first: e, second: f } } }
  const rowStage2: LayoutNode = { type: 'split', direction: 'row', ratio: 40, first: { type: 'split', direction: 'column', ratio: 60, first: a, second: { type: 'split', direction: 'column', ratio: 40, first: b, second: c } }, second: { type: 'split', direction: 'column', ratio: 60, first: d, second: { type: 'split', direction: 'column', ratio: 40, first: e, second: f } } }

  const maxCss = buildMaxLengthCss()
  const maxHtml = buildMaxLengthHtml()
  const contentKinds: ScreenSlotContent[] = [
    { kind: 'catalogue', categories: [] },
    { kind: 'time' },
    { kind: 'announcement', title: 'Budget test', description: 'Worst-case pane resource budget scenario.' },
    { kind: 'catalogue', categories: [] },
    { kind: 'time' },
    { kind: 'announcement', title: 'Budget test', description: 'Worst-case pane resource budget scenario.' },
  ]

  const paneSlots: Record<string, ScreenSlot> = {}
  leaves.forEach(({ id }, index) => {
    paneSlots[id] = {
      ...emptySlotTimeline(contentKinds[index]),
      customCss: maxCss,
      customHtml: maxHtml,
      customHtmlPlacement: index % 2 === 0 ? 'before' : 'after',
    }
  })

  return {
    screenID: `${BUDGET_ID_PREFIX}worstcase`,
    name: '[pane-resource-budget] worst case',
    layout: { 1: rowStage1, 2: rowStage2 },
    paneSlots,
    useStages: true,
    stageCount: 2,
    slideDurationSeconds: 5,
    transitionStyle: 'fade',
  }
}
