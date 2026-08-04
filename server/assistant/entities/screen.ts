import { validateStoreSettingsDraft } from '../../../src/lib/assistantValidation'
import type { BackgroundImage, PaneGrowthFallback, PreviewAspectRatio, ScreenConfig, ScreenTransitionStyle, TextSizes } from '../../../src/types/screen'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/**
 * Duplicated from `ScreenForm.tsx`'s own `PREVIEW_ASPECT_RATIOS` (label →
 * ratio only, in the same order) rather than imported — that file pulls in
 * a long chain of other screen-editor React components, several of which
 * (as usual for anything under `src/features/admin/`) ultimately touch DOM
 * globals the server's own tsconfig has no `dom` lib for. Keep this in sync
 * if the real presets ever change.
 */
const PREVIEW_ASPECT_RATIO_PRESETS: Record<string, PreviewAspectRatio> = {
  '16:9': { width: 16, height: 9 },
  '9:16': { width: 9, height: 16 },
  '4:3': { width: 4, height: 3 },
  '3:4': { width: 3, height: 4 },
  '21:9': { width: 21, height: 9 },
}
const PREVIEW_ASPECT_RATIO_LABELS = Object.keys(PREVIEW_ASPECT_RATIO_PRESETS)

function labelForAspectRatio(ratio: PreviewAspectRatio | undefined): string {
  const match = Object.entries(PREVIEW_ASPECT_RATIO_PRESETS).find(([, value]) => value.width === ratio?.width && value.height === ratio?.height)
  return match?.[0] ?? PREVIEW_ASPECT_RATIO_LABELS[0]
}

function liveScreens(): ScreenConfig[] {
  return (store.get('admin.screens')?.value as ScreenConfig[] | undefined) ?? []
}

/** A brand-new, never-reused id — not `generateId()` from `src/utils/id.ts` (that file, and every other screen utility under `src/utils/screenStages.ts`/`src/utils/layoutTree.ts`, pulls content transitively close enough to this same server/DOM-lib boundary that it isn't worth the risk — see `ClockFormat`'s own comment in `settings.ts` for the concrete failure this avoids). Only needs to be unique within one screen's own `paneSlots`/the global `screens` list, not cryptographically random. */
function generateLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** A single leaf pane showing a live clock — the same minimal default `ScreenForm.tsx` seeds a brand-new screen with (see its own `useState<{ layout, paneSlots }>` initializer), so a chat-created screen isn't left structurally broken. `layout`/`paneSlots` are otherwise never touched by this entity — see its own doc comment. */
function defaultLayoutAndPaneSlots(): Pick<ScreenConfig, 'layout' | 'paneSlots'> {
  const paneId = generateLocalId('pane')
  return {
    layout: { 1: { type: 'leaf', id: paneId } },
    paneSlots: { [paneId]: { content: { 1: { kind: 'time' } }, backgroundColor: {}, backgroundImage: {}, textSizes: {} } },
  }
}

function defaultScreen(): ScreenConfig {
  return {
    screenID: generateLocalId('screen'),
    name: '',
    ...defaultLayoutAndPaneSlots(),
    slideDurationSeconds: 10,
    transitionStyle: 'fade',
  }
}

interface BackgroundImageFields {
  imageUrl: string
  overlay: BackgroundImage['overlay']
  blur: boolean
}

interface ScreenFields {
  name: string | null
  previewAspectRatio: string | null
  useStages: boolean | null
  stageCount: number | null
  slideDurationSeconds: number | null
  showSlotBorders: boolean | null
  borderColor: string | null
  hideScrollbar: boolean | null
  useScreensaver: boolean | null
  transitionStyle: ScreenTransitionStyle | null
  paneGrowthFallback: PaneGrowthFallback | null
  backgroundColor: string | null
  backgroundImage: BackgroundImageFields | null
  textSizes: TextSizes | null
}

/**
 * Covers only what `ScreenForm.tsx`'s own tabbed dashboard form writes —
 * global/borders/background/stages/transitions/screensaver/"other" — never
 * `layout`/`paneSlots` (the pane split-tree and each pane's own content),
 * `editingFocus`, `screensaverTestActive`, or `draft`, all of which are only
 * ever meaningfully edited via `ScreenDisplay.tsx`'s own in-place pane
 * editor at `/screens/editor/:screenId`, deliberately out of scope for this
 * entity (see this repo's CLAUDE.md "Screens feature: two editors" section).
 * On `create`, those excluded fields get a minimal valid default (a single
 * leaf pane showing a live clock) rather than being left structurally
 * invalid. "Duplicate" is intentionally not offered as its own action — not
 * part of `AssistantActionName` — a chat request to duplicate a screen can
 * be reframed as a `create` describing the source screen's own settings.
 */
export const screenEntity: AssistantEntity<ScreenConfig> = {
  key: 'screen',
  supportedActions: ['create', 'update', 'delete'],
  section: 'screens',
  destructive: (action) => action === 'delete',
  // Both are "full replacement compound object" fields, needing the model to reconstruct every
  // sub-field together even to touch one of them — confirmed via real testing that a local model
  // asked an unrelated update (turning on pane borders) fabricated a whole `textSizes` object
  // (`{heading:0, itemTitle:0, ...}`) it was never asked about, the exact same failure mode
  // `hiddenSidebarItems` hit in `settings.ts` (see that file's own comment, and the QA template's
  // Methodology #15 finding). `backgroundImage` shares the same shape of risk even though this
  // round of testing didn't happen to catch it fabricating one.
  confabulationRiskFields: ['textSizes', 'backgroundImage'],

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    return {
      type: 'object',
      properties: {
        name: nullable({ type: 'string', description: "The screen's own display name, shown in the admin Screens list." }),
        previewAspectRatio: nullable({ type: 'string', enum: PREVIEW_ASPECT_RATIO_LABELS, description: 'Which physical display shape this screen is meant for — purely a preview/thumbnail aid, never affects the real kiosk display itself.' }),
        useStages: nullable({ type: 'boolean', description: 'Whether every pane advances through a shared sequence of numbered stages together.' }),
        stageCount: nullable({ type: 'number', description: 'Total number of shared stages, 1 and up — only meaningful while useStages is true.' }),
        slideDurationSeconds: nullable({ type: 'number', description: 'Seconds each stage is shown before advancing to the next.' }),
        showSlotBorders: nullable({ type: 'boolean', description: 'Whether visible borders are drawn between panes.' }),
        borderColor: nullable({ type: 'string', description: 'Hex color for pane borders — only meaningful while showSlotBorders is true. Leave null for the automatic contrast-based color.' }),
        hideScrollbar: nullable({ type: 'boolean', description: "Whether a scrolling pane's own scrollbar is hidden (content stays scrollable either way)." }),
        useScreensaver: nullable({ type: 'boolean', description: "Whether this screen goes black during the shared screensaver schedule's own window." }),
        transitionStyle: nullable({ type: 'string', enum: ['fade', 'slide'], description: 'How a slide change is animated for any pane\'s own in-place rotation.' }),
        paneGrowthFallback: nullable({ type: 'string', enum: ['screenEdge', 'fade'], description: 'The fallback entrance/exit a pane uses when it has no existing internal divider to grow from/collapse into.' }),
        backgroundColor: nullable({ type: 'string', description: "Hex color for this screen's own whole-screen background." }),
        backgroundImage: nullable({
          type: 'object',
          properties: {
            imageUrl: { type: 'string', description: 'The background image URL, only if the message names one explicitly.' },
            overlay: { type: 'string', enum: ['none', 'light', 'dark'], description: 'How the image is tinted, both for readability and to pick a matching text color.' },
            blur: { type: 'boolean', description: 'Whether the image is softened.' },
          },
          required: ['imageUrl', 'overlay', 'blur'],
          additionalProperties: false,
          description: 'The FULL replacement value — only set when the message actually addresses the background image, and always include all three sub-fields together.',
        }),
        textSizes: nullable({
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
          description: "The FULL replacement set of this screen's own text size overrides (percentages of a pane's own smaller dimension) — only set when the message actually addresses text sizing, and always include every field together, carrying forward the current values (given above) for any role not being changed.",
        }),
      },
      required: [
        'name',
        'previewAspectRatio',
        'useStages',
        'stageCount',
        'slideDurationSeconds',
        'showSlotBorders',
        'borderColor',
        'hideScrollbar',
        'useScreensaver',
        'transitionStyle',
        'paneGrowthFallback',
        'backgroundColor',
        'backgroundImage',
        'textSizes',
      ],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveScreens().filter((screen) => !needle || screen.name.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((screen) => ({ id: screen.screenID, label: screen.name }))
  },

  async getCurrent(id: string): Promise<ScreenConfig | null> {
    return liveScreens().find((screen) => screen.screenID === id) ?? null
  },

  mergeDraft(_action, current, rawFields): ScreenConfig {
    const fields = rawFields as ScreenFields
    const base = current ?? defaultScreen()
    return {
      ...base,
      name: fields.name ?? base.name,
      previewAspectRatio: fields.previewAspectRatio ? PREVIEW_ASPECT_RATIO_PRESETS[fields.previewAspectRatio] : base.previewAspectRatio,
      useStages: fields.useStages ?? base.useStages,
      stageCount: fields.stageCount ?? base.stageCount,
      slideDurationSeconds: fields.slideDurationSeconds ?? base.slideDurationSeconds,
      showSlotBorders: fields.showSlotBorders ?? base.showSlotBorders,
      borderColor: fields.borderColor ?? base.borderColor,
      hideScrollbar: fields.hideScrollbar ?? base.hideScrollbar,
      useScreensaver: fields.useScreensaver ?? base.useScreensaver,
      transitionStyle: fields.transitionStyle ?? base.transitionStyle,
      paneGrowthFallback: fields.paneGrowthFallback ?? base.paneGrowthFallback,
      backgroundColor: fields.backgroundColor ?? base.backgroundColor,
      backgroundImage: fields.backgroundImage ? { imageUrl: fields.backgroundImage.imageUrl, overlay: fields.backgroundImage.overlay, blur: fields.backgroundImage.blur } : base.backgroundImage,
      textSizes: fields.textSizes ?? base.textSizes,
    }
  },

  validate(_action, draft: ScreenConfig): AssistantValidationIssue[] {
    return validateStoreSettingsDraft(draft.name)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<{ name: string; previewAspectRatio: string; useStages: boolean; useScreensaver: boolean }[]> {
    return liveScreens().map((screen) => ({
      name: screen.name,
      previewAspectRatio: labelForAspectRatio(screen.previewAspectRatio),
      useStages: screen.useStages ?? false,
      useScreensaver: screen.useScreensaver ?? false,
    }))
  },

  countLabel: { no: { singular: 'skjerm', plural: 'skjermer' }, en: { singular: 'screen', plural: 'screens' } },
}
