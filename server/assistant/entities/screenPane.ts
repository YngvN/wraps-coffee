import { validatePaneCustomCss } from '../../../src/utils/paneCustomCss'
import { validatePaneCustomHtml } from '../../../src/utils/paneCustomHtml'
import type { LayoutNode, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, StageTimeline } from '../../../src/types/screen'
import * as store from '../../store'
import {
  nullable,
  type AssistantActionName,
  type AssistantCandidate,
  type AssistantEntity,
  type AssistantFillContext,
  type AssistantJsonSchema,
  type AssistantValidationIssue,
} from '../types'

/**
 * `screenEntity`'s own sibling for everything inside `paneSlots` — that entity's own doc comment
 * deliberately excludes `layout`/`paneSlots` entirely (see `screen.ts` and CLAUDE.md's "Screens
 * feature: two editors" section); this is what fills that gap. Covers two independent capabilities,
 * gated separately:
 * - `customCss`/`customHtml`/`customHtmlPlacement` — always offered (subject to the normal
 *   `section: 'screens'` role/section gate every entity already has), validated against the
 *   *assistant* posture (see `src/utils/paneCustomCss.ts`/`paneCustomHtml.ts`), stricter than the
 *   admin's own.
 * - `content` (switching a pane's own content kind, or editing that kind's own fields) — only offered
 *   at all when the requesting device's own kebab-menu "Allow pane editing" toggle is on (see
 *   `AssistantFillContext.allowPaneContentEditing`) — schema-level, never merely a prompt instruction
 *   to decline, so a toggled-off session genuinely never sees this surface exists (see `SP.17` in this
 *   entity's own `screenPane.qa-scenarios.md`).
 *
 * **Must stay DOM-free**, same constraint `screen.ts`'s own `generateLocalId` comment documents — this
 * runs server-side with no `dom` lib available (see `tsconfig.node.json`). That's why this file
 * re-implements a handful of small, pure stage-resolution/layout-tree helpers locally instead of
 * importing them from `src/utils/screenStages.ts`/`src/utils/layoutTree.ts`: those files (like
 * `../i18n`, which `screenStages.ts` imports `LanguageCode` from) transitively reach real browser-only
 * code, the exact same boundary `screen.ts`'s own comment already calls out. Kept intentionally small
 * and simple (a handful of lines each) specifically so duplicating them here, rather than sharing code
 * across that boundary, stays low-risk.
 */

// --- Local, server-safe re-implementations of src/utils/screenStages.ts / layoutTree.ts -----------
// See this file's own doc comment for why these can't just be imported.

function resolvedCheckpointStage<T>(timeline: StageTimeline<T> | undefined, stage: number): number | undefined {
  if (!timeline) return undefined
  const keys = Object.keys(timeline).map(Number)
  if (keys.length === 0) return undefined
  const atOrBefore = keys.filter((key) => key <= stage)
  return atOrBefore.length > 0 ? Math.max(...atOrBefore) : Math.max(...keys)
}

function resolveStageValue<T>(timeline: StageTimeline<T> | undefined, stage: number): T | undefined {
  const stageKey = resolvedCheckpointStage(timeline, stage)
  return stageKey === undefined ? undefined : timeline![stageKey]
}

function resolveSlotContent(slot: ScreenSlot, stage: number): ScreenSlotContent {
  return resolveStageValue(slot.content, stage) ?? { kind: 'none' }
}

function effectiveStageCount(screen: Pick<ScreenConfig, 'useStages' | 'stageCount'>): number {
  return screen.useStages ? Math.max(1, screen.stageCount ?? 1) : 1
}

function listLeafIds(node: LayoutNode, into: Set<PaneId> = new Set()): Set<PaneId> {
  if (node.type === 'leaf') into.add(node.id)
  else {
    listLeafIds(node.first, into)
    listLeafIds(node.second, into)
  }
  return into
}

/** Every leaf id referenced by *any* of `screen.layout`'s own per-stage checkpoints — mirrors `layoutTree.ts`'s own `allReferencedPaneIds`. What actually backs the "does this pane structurally exist" check — a `paneSlots` entry alone is not proof (see this entity's own `getCurrent` doc comment). */
function allReferencedPaneIds(layout: StageTimeline<LayoutNode>): Set<PaneId> {
  const ids = new Set<PaneId>()
  for (const tree of Object.values(layout)) for (const id of listLeafIds(tree)) ids.add(id)
  return ids
}

/** Writes `slot`'s own currently-resolved content (at `stage`) into every stage's own `content` checkpoint — local re-implementation of `src/utils/screenStages.ts`'s `propagateSlotContentToAllStages`, kept behaviorally identical (same tiny algorithm) so a human dragging "Apply to every stage" in `PaneEditor.tsx` and the assistant doing the same via `applyToAllStages` below always produce the same result. */
function propagateSlotContentToAllStages(slot: ScreenSlot, stage: number, stageCount: number): ScreenSlot {
  const resolvedContent = resolveSlotContent(slot, stage)
  const content: StageTimeline<ScreenSlotContent> = {}
  for (let s = 1; s <= stageCount; s++) content[s] = resolvedContent
  return { ...slot, content }
}

function liveScreens(): ScreenConfig[] {
  return (store.get('admin.screens')?.value as ScreenConfig[] | undefined) ?? []
}

// --- Draft shape ---------------------------------------------------------------------------------

/**
 * Not literally `ScreenConfig` (unlike `screenEntity`'s own draft) — `mergeDraft` needs to know which
 * pane and which stage a `content` patch targets, and the candidate id it was resolved from
 * (`${screenID}:${paneId}:${stage}`) isn't threaded back into `mergeDraft` by `steps.ts`'s own contract
 * (only `getCurrent` receives the raw id). Carrying `paneId`/`stage` alongside the real `screen` is the
 * same "custom composite draft shape" pattern `displayManager.ts`'s own `DisplayManagerDraft` already
 * uses for the same reason. `AssistantPanel.tsx`'s own `screenPane` branch unwraps `.screen` for the
 * actual commit (`setScreens`) — the one and only real write path, exactly like every other entity.
 */
export interface ScreenPaneDraft {
  screen: ScreenConfig
  paneId: PaneId
  stage: number
}

interface ScreenPaneFields {
  customCss: string | null
  customHtml: string | null
  customHtmlPlacement: 'before' | 'after' | null
  applyToAllStages: boolean | null
  content: Record<string, unknown> | null
}

/**
 * `content` as a *whole* is treated as one confabulation-risk field, stripped entirely under a
 * `'safe'` ingestion posture (weaker/local models) — not one entry per risky nested field
 * (`catalogueId`, `stopId`, `boardId`, …, see this entity's own `fillFieldsSchema` for the full list
 * across all 13 content kinds). This is a deliberate simplification, not an oversight: `stripSchemaFields`
 * (`server/assistant/types.ts`) only ever deletes a *top-level* schema property — it has no concept of
 * reaching into `content`'s own nested `anyOf` branches to strip one field from within them. Given that
 * constraint, stripping the whole `content` capability wholesale under `'safe'` is both the simplest
 * fix and the more conservative one (exactly the same "whole compound object, not a partial strip"
 * posture `screen.ts`'s own `textSizes`/`backgroundImage` already use for the identical reason) —
 * `customCss`/`customHtml`/`applyToAllStages` all stay independently available even under `'safe'`,
 * since none of them name a live-data-grounded value.
 */
const CONTENT_CONFABULATION_RISK_FIELDS = ['content']

// --- Content-kind schema --------------------------------------------------------------------------
// One `anyOf` branch per `ScreenSlotContent` kind, mirroring src/types/screen.ts exactly — the same
// "full parity with the human editor" the plan calls for. Deliberately narrower than the full type in
// two ways, both disclosed: (1) no per-slide `backgroundImage`/`padding` override (stays admin-only via
// `PaneEditor.tsx` for now — a real, bounded scope cut, not an oversight); (2) `transit`'s own
// `lineColors` (a manual per-operator color-override array) is omitted — an unlikely target for a chat
// request, and the one genuinely complex nested-array field across all 13 kinds.

const TEXT_SIZES_SCHEMA = nullable({
  type: 'object',
  properties: {
    heading: { type: 'number' },
    itemTitle: { type: 'number' },
    description: { type: 'number' },
    price: { type: 'number' },
    itemPrice: { type: 'number' },
  },
  required: ['heading', 'itemTitle', 'description', 'price', 'itemPrice'],
  additionalProperties: false,
  description: 'The FULL replacement set of this pane’s own text size overrides (percentages of the pane’s own smaller dimension) — only set when the message actually addresses text sizing, and always include every field together, carrying forward the current values for any role not being changed.',
})

function contentBranch(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false }
}

function buildContentSchema(): Record<string, unknown> {
  const branches: Record<string, unknown>[] = [
    contentBranch({ kind: { type: 'string', enum: ['none'] } }, ['kind']),
    contentBranch(
      {
        kind: { type: 'string', enum: ['catalogue'] },
        catalogueId: nullable({ type: 'string', description: 'Which catalogue this pane shows, by its exact id — only set when the message clearly names a specific, real catalogue.' }),
        categories: nullable({ type: 'array', items: { type: 'string' }, description: 'Narrows this pane to only these category names from its catalogue — the FULL replacement list. Only set when the message clearly names real, existing categories.' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'catalogueId', 'categories', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['event'] },
        displayMode: nullable({ type: 'string', enum: ['calendar', 'image', 'details', 'month'], description: 'calendar = upcoming list, image = one event’s photo, details = one event’s details, month = every event this month.' }),
        eventOrdinal: nullable({ type: 'number', description: '1-based position in the upcoming-events timeline — only relevant for displayMode image/details.' }),
        count: nullable({ type: 'number', description: 'How many events to list — only relevant for displayMode calendar.' }),
        showPrice: nullable({ type: 'boolean', description: 'Only relevant for displayMode month.' }),
        showDescription: nullable({ type: 'boolean', description: 'Only relevant for displayMode month.' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'displayMode', 'eventOrdinal', 'count', 'showPrice', 'showDescription', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['image'] },
        imageUrl: nullable({ type: 'string', description: 'The image’s own URL — only set when the message gives an explicit URL or clearly names one specific, already-uploaded image.' }),
        fit: nullable({ type: 'string', enum: ['contain', 'cover'] }),
        resizeToFit: nullable({ type: 'boolean', description: 'Grows/shrinks the pane itself to match the image’s own aspect ratio.' }),
        resizeScale: nullable({ type: 'number', description: 'Percentage cap (of the screen) for resizeToFit.' }),
      },
      ['kind', 'imageUrl', 'fit', 'resizeToFit', 'resizeScale'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['video'] },
        videoUrl: nullable({ type: 'string', description: 'The video’s own URL — only set when the message gives an explicit URL or clearly names one specific, already-uploaded video.' }),
        fit: nullable({ type: 'string', enum: ['contain', 'cover'] }),
        resizeToFit: nullable({ type: 'boolean' }),
        resizeScale: nullable({ type: 'number' }),
        removeAudio: nullable({ type: 'boolean' }),
        volume: nullable({ type: 'number', description: '0-1.' }),
        advanceStageOnEnd: nullable({ type: 'boolean' }),
        restartOnStageOne: nullable({ type: 'boolean' }),
      },
      ['kind', 'videoUrl', 'fit', 'resizeToFit', 'resizeScale', 'removeAudio', 'volume', 'advanceStageOnEnd', 'restartOnStageOne'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['qrcode'] },
        url: nullable({ type: 'string', description: 'Only relevant while linkMode is custom (or unset).' }),
        size: nullable({ type: 'number', description: 'Percentage of the pane the code fills.' }),
        linkMode: nullable({ type: 'string', enum: ['custom', 'news'] }),
        newsSourceMode: nullable({ type: 'string', enum: ['automatic', 'specific'] }),
        linkedNewsSourceId: nullable({ type: 'string', description: 'Only relevant while newsSourceMode is specific — only set when the message clearly names one real, currently-configured news source.' }),
        newsSlotOrdinal: nullable({ type: 'number' }),
        showSourceLogo: nullable({ type: 'boolean' }),
        useSourceTheme: nullable({ type: 'boolean' }),
      },
      ['kind', 'url', 'size', 'linkMode', 'newsSourceMode', 'linkedNewsSourceId', 'newsSlotOrdinal', 'showSourceLogo', 'useSourceTheme'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['transit'] },
        brand: nullable({ type: 'string', enum: ['ruter', 'entur'] }),
        stopId: nullable({ type: 'string', description: 'Which configured stop this pane shows — only set when the message clearly names one real, currently-configured stop; grounded in live data the model can’t see by name alone, never invent an id.' }),
        departureCount: nullable({ type: 'number' }),
        showPlatform: nullable({ type: 'boolean' }),
        showLineName: nullable({ type: 'boolean' }),
        departureMode: nullable({ type: 'string', enum: ['realtime', 'schedule', 'both'] }),
        modeFilter: nullable({ type: 'array', items: { type: 'string' }, description: 'Transport modes to include, e.g. "bus"/"rail" — the FULL replacement list; empty/unset shows every mode.' }),
        iconPack: nullable({ type: 'string', enum: ['standard', 'simple'] }),
        autoLineColors: nullable({ type: 'boolean' }),
        useBrandTheme: nullable({ type: 'boolean' }),
        showBrandLogo: nullable({ type: 'boolean' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'brand', 'stopId', 'departureCount', 'showPlatform', 'showLineName', 'departureMode', 'modeFilter', 'iconPack', 'autoLineColors', 'useBrandTheme', 'showBrandLogo', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['weather'] },
        locationId: nullable({ type: 'string', description: 'Which configured location this pane shows the forecast for — only set when the message clearly names one real, currently-configured location.' }),
        forecastHours: nullable({ type: 'number' }),
        showWind: nullable({ type: 'boolean' }),
        showHumidity: nullable({ type: 'boolean' }),
        showPrecipitationProbability: nullable({ type: 'boolean' }),
        showUvIndex: nullable({ type: 'boolean' }),
        showPressure: nullable({ type: 'boolean' }),
        iconPack: nullable({ type: 'string', enum: ['outline', 'system'] }),
        useBrandTheme: nullable({ type: 'boolean' }),
        showBrandLogo: nullable({ type: 'boolean' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'locationId', 'forecastHours', 'showWind', 'showHumidity', 'showPrecipitationProbability', 'showUvIndex', 'showPressure', 'iconPack', 'useBrandTheme', 'showBrandLogo', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['news'] },
        sourceIds: nullable({ type: 'array', items: { type: 'string' }, description: 'The FULL replacement list of which real, currently-configured news sources this pane pulls from; empty/unset means every cafe-wide-enabled source.' }),
        headlineCount: nullable({ type: 'number' }),
        rotateSeconds: nullable({ type: 'number' }),
        useBrandTheme: nullable({ type: 'boolean' }),
        showBrandLogo: nullable({ type: 'boolean' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'sourceIds', 'headlineCount', 'rotateSeconds', 'useBrandTheme', 'showBrandLogo', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['announcement'] },
        title: nullable({ type: 'string' }),
        description: nullable({ type: 'string' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'title', 'description', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['messageboard'] },
        boardId: nullable({ type: 'string', description: 'Which real, currently-existing message board this pane shows.' }),
        displayMode: nullable({ type: 'string', enum: ['single', 'rotating', 'list'] }),
        postId: nullable({ type: 'string', description: 'Only relevant while displayMode is single — which real, currently-existing post to show.' }),
        order: nullable({ type: 'string', enum: ['newestFirst', 'oldestFirst'] }),
        rotateSeconds: nullable({ type: 'number' }),
        count: nullable({ type: 'number' }),
        textSizes: TEXT_SIZES_SCHEMA,
      },
      ['kind', 'boardId', 'displayMode', 'postId', 'order', 'rotateSeconds', 'count', 'textSizes'],
    ),
    contentBranch(
      {
        kind: { type: 'string', enum: ['time'] },
        displayMode: nullable({ type: 'string', enum: ['time', 'date', 'weekday', 'weekNumber'] }),
        units: nullable({ type: 'array', items: { type: 'string', enum: ['hours', 'minutes', 'seconds'] }, description: 'Only relevant for displayMode time — the FULL replacement set of digit groups shown.' }),
        blinkColon: nullable({ type: 'boolean' }),
        dateStyle: nullable({ type: 'string', enum: ['full', 'long', 'medium', 'short'] }),
        showYear: nullable({ type: 'boolean' }),
        weekdayStyle: nullable({ type: 'string', enum: ['long', 'short', 'narrow'] }),
        fontSize: nullable({ type: 'number' }),
      },
      ['kind', 'displayMode', 'units', 'blinkColon', 'dateStyle', 'showYear', 'weekdayStyle', 'fontSize'],
    ),
  ]
  return { anyOf: branches }
}

// --- Candidates ------------------------------------------------------------------------------------

function contentSignature(content: ScreenSlotContent): string {
  return JSON.stringify(content)
}

function paneLabel(screenName: string, ordinal: number, content: ScreenSlotContent, stageSuffix: string): string {
  return `${screenName} — Pane ${ordinal} (${content.kind})${stageSuffix}`
}

/** Lowercases and collapses every run of non-alphanumeric characters (dashes, commas, parens, "/") to a single space — so "Screen 2 — Pane 1 (catalogue)" and "Screen 2, Pane 1" normalize to comparable token sequences regardless of which separator convention produced them. */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Contiguous substring match on normalized text, not a single literal substring and not independent
 * per-word presence — unlike `product.ts`/`category.ts`'s own `listCandidates` (proper-noun labels a
 * message is expected to quote near-verbatim), a pane has no real name; the model's own `searchText`
 * for one is a paraphrase of this file's own generated label format ("Screen 2 — Pane 1 (catalogue)"),
 * and real testing against qwen3:4b confirmed it reliably writes something like "Screen 2, Pane 1" — a
 * reasonable phrasing that a strict `.includes(needle)` substring check rejects outright (comma vs. em
 * dash), returning zero candidates before `selectItem` (`steps.ts`) ever gets a chance to semantically
 * disambiguate.
 *
 * An earlier version of this function matched each word independently (`words.every(w =>
 * label.includes(w))`), which over-corrected: for needle "screen 2, pane 1" it also matched labels like
 * "Screen 3 (verify) — Pane 1 (none), Stage 2" purely because "screen"/"pane"/"1"/"2" each appear
 * *somewhere* in that unrelated label (the "2" coming from its own "Stage 2" suffix) — confirmed via a
 * direct `listCandidates` call against real seed data, which returned 4 candidates across 3 different
 * screens for a search text naming one specific screen. Normalizing punctuation to spaces and then
 * requiring the *whole normalized needle* to appear as one contiguous run preserves word order/adjacency
 * ("screen 2 pane 1" only matches a label that has "screen", "2", "pane", "1" consecutively, not
 * scattered across unrelated suffixes) while still tolerating the punctuation drift that motivated this
 * function in the first place.
 */
function labelMatchesSearch(label: string, needle: string): boolean {
  const normalizedNeedle = normalizeForMatch(needle)
  if (!normalizedNeedle) return true
  return normalizeForMatch(label).includes(normalizedNeedle)
}

/**
 * Every pane across every screen, stage-split only where a pane's own resolved content genuinely
 * differs across stages (see this file's own doc comment on the candidate id shape). Uses each
 * screen's own stage-1 layout tree as the canonical pane set for a multi-stage screen — a
 * deliberate, disclosed simplification: a real pane-tree restructure *between* stages (adding/removing
 * a whole pane mid-rotation) is rare, and fully unioning cross-stage tree differences here would add
 * meaningfully more code for that rare case. A pane that only exists at a later stage's own tree
 * checkpoint (not stage 1's) is not offered as a candidate today.
 */
async function listCandidates(_action: AssistantActionName, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
  const needle = searchText.trim().toLowerCase()
  const candidates: AssistantCandidate[] = []
  for (const screen of liveScreens()) {
    const stageCount = effectiveStageCount(screen)
    const rootTree = resolveStageValue(screen.layout, 1)
    if (!rootTree) continue
    const leafIds = [...listLeafIds(rootTree)]
    let ordinal = 0
    for (const paneId of leafIds) {
      ordinal += 1
      const slot = screen.paneSlots[paneId]
      if (!slot) continue
      const resolvedByStage = new Map<number, ScreenSlotContent>()
      for (let stage = 1; stage <= stageCount; stage++) resolvedByStage.set(stage, resolveSlotContent(slot, stage))
      const distinctSignatures = new Set([...resolvedByStage.values()].map(contentSignature))
      if (stageCount > 1 && distinctSignatures.size > 1) {
        // Genuinely varies by stage — one candidate per stage whose own resolved content actually
        // differs from the *previous* stage's (collapsing runs of identical consecutive checkpoints,
        // same "only split when content actually differs" principle, not one candidate per raw stage
        // number).
        let previousSignature: string | null = null
        for (let stage = 1; stage <= stageCount; stage++) {
          const content = resolvedByStage.get(stage)!
          const signature = contentSignature(content)
          if (signature === previousSignature) continue
          previousSignature = signature
          const label = paneLabel(screen.name, ordinal, content, `, Stage ${stage}`)
          if (labelMatchesSearch(label, needle)) candidates.push({ id: `${screen.screenID}:${paneId}:${stage}`, label })
        }
      } else {
        const content = resolvedByStage.get(1)!
        const label = paneLabel(screen.name, ordinal, content, '')
        if (labelMatchesSearch(label, needle)) candidates.push({ id: `${screen.screenID}:${paneId}:1`, label })
      }
    }
  }
  return candidates.slice(0, 30)
}

function parseCandidateId(id: string): { screenID: string; paneId: PaneId; stage: number } | null {
  const parts = id.split(':')
  if (parts.length !== 3) return null
  const [screenID, paneId, stageText] = parts
  const stage = Number(stageText)
  if (!screenID || !paneId || !Number.isFinite(stage) || stage < 1) return null
  return { screenID, paneId, stage }
}

/**
 * Resolves via the normal stage-timeline "nearest checkpoint at or below, else wrap" rule — never a
 * strict/exact stage lookup — so a candidate id generated earlier in a multi-turn conversation
 * always resolves to *something* as long as the screen/pane itself still exists, even if the pane's own
 * content has since changed and no longer matches what made that stage distinct when the candidate list
 * was built. Only returns `null` (the documented "not found" contract) when the screen or pane itself
 * is genuinely gone — including a `paneSlots` entry that exists but is no longer referenced by any
 * stage's own layout tree (this codebase's own accepted "harmless orphaned data" posture means a
 * `paneSlots` entry alone is never proof the pane structurally exists, see `allReferencedPaneIds`).
 */
async function getCurrent(id: string): Promise<ScreenPaneDraft | null> {
  const parsed = parseCandidateId(id)
  if (!parsed) return null
  const screen = liveScreens().find((candidate) => candidate.screenID === parsed.screenID)
  if (!screen) return null
  if (!screen.paneSlots[parsed.paneId]) return null
  if (!allReferencedPaneIds(screen.layout).has(parsed.paneId)) return null
  return { screen, paneId: parsed.paneId, stage: parsed.stage }
}

// --- mergeDraft / validate ---------------------------------------------------------------------------

function mergeDraft(_action: AssistantActionName, current: ScreenPaneDraft | null, rawFields: unknown, context: AssistantFillContext): ScreenPaneDraft {
  // `current` is never null in practice — `supportedActions` has no `create`, so this is only ever
  // called for `update`, which always has a real fetched `getCurrent()` result behind it (same posture
  // as `displayManager.ts`'s own `mergeDraft`).
  const base = current as ScreenPaneDraft
  const fields = rawFields as ScreenPaneFields
  const slot = base.screen.paneSlots[base.paneId]

  let nextSlot: ScreenSlot = { ...slot }
  if (fields.customCss !== null && fields.customCss !== undefined) nextSlot.customCss = fields.customCss || undefined
  if (fields.customHtml !== null && fields.customHtml !== undefined) nextSlot.customHtml = fields.customHtml || undefined
  if (fields.customHtmlPlacement) nextSlot.customHtmlPlacement = fields.customHtmlPlacement

  // Only ever offered in the schema at all while `context.allowPaneContentEditing` is on (see
  // `fillFieldsSchema` below) — `fields.content`/`fields.applyToAllStages` are simply always `null`
  // otherwise, since the model was never shown those properties to begin with.
  if (fields.content) {
    const stageCount = effectiveStageCount(base.screen)
    const stage = Math.min(Math.max(base.stage, 1), stageCount)
    const nextContentTimeline: StageTimeline<ScreenSlotContent> = { ...(nextSlot.content ?? {}), [stage]: fields.content as unknown as ScreenSlotContent }
    nextSlot = { ...nextSlot, content: nextContentTimeline }
  }

  // Ordering rule (explicit, not left to iteration order): the `content` patch above is applied
  // *first* to produce the final resolved value, *then* propagated — never the pre-patch value —
  // so "make it weather and pin it to every stage" in one message does exactly that, not "pin whatever
  // it already was, then separately switch stage `base.stage` to weather".
  if (fields.applyToAllStages) {
    const stageCount = effectiveStageCount(base.screen)
    const stage = Math.min(Math.max(base.stage, 1), stageCount)
    nextSlot = propagateSlotContentToAllStages(nextSlot, stage, stageCount)
  }

  const nextScreen: ScreenConfig = { ...base.screen, paneSlots: { ...base.screen.paneSlots, [base.paneId]: nextSlot } }
  void context
  return { ...base, screen: nextScreen }
}

function validate(_action: AssistantActionName, draft: ScreenPaneDraft): AssistantValidationIssue[] {
  const slot = draft.screen.paneSlots[draft.paneId]
  const issues: AssistantValidationIssue[] = []
  if (slot.customCss) {
    for (const code of validatePaneCustomCss(slot.customCss, 'assistant')) issues.push({ code: `paneCustomContent.${code}` })
  }
  if (slot.customHtml) {
    for (const code of validatePaneCustomHtml(slot.customHtml, 'assistant')) issues.push({ code: `paneCustomContent.${code}` })
  }
  return issues
}

// --- The entity itself -------------------------------------------------------------------------------

export const screenPaneEntity: AssistantEntity<ScreenPaneDraft> = {
  key: 'screenPane',
  supportedActions: ['update'],
  section: 'screens',

  confabulationRiskFields: CONTENT_CONFABULATION_RISK_FIELDS,

  fillFieldsSchema(_action, context: AssistantFillContext): AssistantJsonSchema {
    const properties: Record<string, unknown> = {
      customCss: nullable({
        type: 'string',
        description:
          'CSS declarations applied to this pane only (no selector needed). Allowed properties only: color, background-color, font-size, font-weight, font-style, font-family, text-align, text-decoration, text-transform, line-height, letter-spacing, margin(-top/right/bottom/left), padding(-top/right/bottom/left), gap. No border/box-shadow/layout/transform — those are admin-only. Never a custom --property, never !important.',
      }),
      customHtml: nullable({
        type: 'string',
        description:
          'Rich-text HTML rendered alongside this pane’s normal content. Allowed tags only: div, span, p, h1-h6, ul, ol, li, strong, em, b, i, br. No a/img (links/images are admin-only) and no other tag — script/style/iframe/svg/etc are never allowed, for any poster of this content.',
      }),
      customHtmlPlacement: nullable({ type: 'string', enum: ['before', 'after'], description: 'Whether customHtml renders before or after this pane’s normal content. Only relevant when customHtml is also being set.' }),
    }
    const required = ['customCss', 'customHtml', 'customHtmlPlacement']

    if (context.allowPaneContentEditing) {
      properties.content = nullable({
        ...buildContentSchema(),
        description:
          'Switches this pane’s own content kind, or edits that kind’s own fields — the FULL replacement content object for whichever kind. Only set when the message clearly addresses this pane’s own content; never guess a value for a field grounded in live data (a category, a stop, a board) that the message doesn’t clearly name.',
      })
      properties.applyToAllStages = nullable({
        type: 'boolean',
        description: 'Pins this pane so it stops varying by stage — writes its own currently-resolved content into every stage’s own checkpoint. Only set when the message clearly asks for this pane to "stay the same"/"not change" across stages/steps.',
      })
      required.push('content', 'applyToAllStages')
    }

    return { type: 'object', properties, required, additionalProperties: false }
  },

  listCandidates,
  getCurrent,
  mergeDraft,
  validate,

  reviewComponent() {
    return 'existingForm'
  },

  countLabel: { no: { singular: 'rute', plural: 'ruter' }, en: { singular: 'pane', plural: 'panes' } },
}
