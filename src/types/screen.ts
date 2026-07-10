import type { ProductCategory } from './product'

/** How an image slide's picture fills its slot: shrunk to fit without cropping (the default), or scaled to fill the entire container, cropping as needed. */
export type ImageFit = 'contain' | 'cover'

/** How a background image is tinted, both for readability and to pick a matching text color: unmodified, lightened (paired with black text), or darkened (paired with white text). */
export type BackgroundImageOverlay = 'none' | 'light' | 'dark'

/** A background image behind a slot's (or one of its slides') own content: always scaled to cover its whole pane and blurred, with an optional tint that also decides whether the text drawn over it is forced to black or white. */
export interface BackgroundImage {
  imageUrl: string
  overlay: BackgroundImageOverlay
}

/** Shared by every `ScreenSlotContent` variant: lets one slide opt out of its slot's own `backgroundImage` and use its own instead — set, simply by providing one, no separate opt-in flag needed. */
interface OwnBackgroundImageFields {
  backgroundImage?: BackgroundImage
}

/**
 * What a slot shows at one of its own content timeline's checkpoints
 * (see `ScreenSlot.content`): nothing, a specific menu category, the entire
 * menu (every category with available items, laid out the same way as the
 * public Menu page — or, via `categories`, just a chosen subset of them,
 * e.g. to split the full menu across more than one screen), the
 * upcoming-events list, or a single centered image (e.g. a logo or an
 * Instagram photo, pasted in as a URL). A category/menu/events checkpoint
 * normally follows its slot's own text size (which itself falls back to the
 * screen's default) — `useOwnTextSizes` lets one checkpoint opt out and
 * keep its own independent `textSizes` instead, e.g. because it needs
 * bigger text than the slot's other stages. An image checkpoint has no text
 * of its own, so it has no text-size fields at all; `fit` instead controls
 * how its picture fills the slide, falling back to `'contain'` when absent.
 * `resizeToFit` (image checkpoints only) instead makes its own *pane* grow
 * or shrink to match the image's own aspect ratio — capped at `resizeScale`
 * (defaulting to 40%, `IMAGE_RESIZE_MAX_VIEWPORT_FRACTION`) of the screen's
 * viewport width and height (see `imageResizeRatioPatch`) — while it's the
 * one showing, sliding back to the slot's own set size once the stage
 * sequence advances to a checkpoint with different content. `resizeScale`
 * can be dragged smaller or bigger via the pane's own borders on the live
 * display, the same handles an arrangement's own dividers use — both axes
 * always move together from this one shared value, so the image's own
 * aspect ratio stays locked no matter which border is dragged. Every
 * kind can independently opt out of its slot's own `backgroundImage` by
 * setting its own `backgroundImage`, regardless of whether it has text of
 * its own. Two further kinds are backed by live external data rather than
 * admin-authored content, configured from the admin's Extensions tab (see
 * `useExtensionsConfig`): `'transit'` shows real-time departures from one
 * of the cafe's configured nearby stops (`stopId`, referencing
 * `ExtensionsConfig['transit']['selectedStops']`), and `'weather'` shows an
 * hourly forecast for the cafe's own address — neither renders anything
 * (see `TransitSlide`/`WeatherSlide`) unless its integration is enabled.
 */
export type ScreenSlotContent =
  | ({ kind: 'none' } & OwnBackgroundImageFields)
  | ({ kind: 'category'; category: ProductCategory; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'menu'; categories?: ProductCategory[]; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'events'; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'image'; imageUrl: string; fit?: ImageFit; resizeToFit?: boolean; resizeScale?: number } & OwnBackgroundImageFields)
  | ({ kind: 'transit'; stopId?: string; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'weather'; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({
      kind: 'messageboard'
      /** Which `MessageBoard` (see `src/types/messageBoard.ts`) this slot shows — unset renders nothing, same posture as an unset transit `stopId`. */
      boardId?: string
      /** Falls back to `'rotating'` when unset. */
      displayMode?: MessageBoardDisplayMode
      /** Used only when `displayMode` is `'single'` — which of `boardId`'s own posts to show. */
      postId?: string
      /** Used only when `displayMode` is `'list'`. Falls back to `'newestFirst'`. */
      order?: MessageBoardOrder
      /** Used only when `displayMode` is `'rotating'` — seconds between posts. Falls back to `DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS`. */
      rotateSeconds?: number
      /** Caps how many posts feed `'rotating'`/`'list'`. Falls back to `DEFAULT_MESSAGE_BOARD_COUNT`. */
      count?: number
      useOwnTextSizes?: boolean
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)

/** How a `'messageboard'` slide shows its board's posts: one admin-picked post, an auto-rotating carousel, or every post stacked in a scrollable column. */
export type MessageBoardDisplayMode = 'single' | 'rotating' | 'list'

/** Sort direction for a `'messageboard'` slide's own `'list'` display mode. */
export type MessageBoardOrder = 'newestFirst' | 'oldestFirst'

/** Used when a `'messageboard'` slide's own `rotateSeconds` is unset. */
export const DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS = 8

/** Used when a `'messageboard'` slide's own `count` is unset. */
export const DEFAULT_MESSAGE_BOARD_COUNT = 10

/**
 * A sparse per-stage "checkpoint" map for one field's value — only stages
 * where an explicit value was set have an entry. A field's effective value
 * at a given stage is the entry at the closest stage number at or below it,
 * or (if none exists below it) the entry at the highest stage number at
 * all, wrapping around circularly, since the whole sequence loops back to
 * stage 1 after the last one. Resolve with the helpers in
 * `src/utils/screenStages.ts` — never index this map directly, since a
 * present-but-`undefined` entry (an explicit "nothing at this stage") must
 * be distinguished from no entry at all (nothing set here, inherit from
 * elsewhere), which a plain `timeline[stage]` lookup can't tell apart.
 */
export type StageTimeline<T> = Record<number, T>

/**
 * One of a screen's up to 4 content slots. When `ScreenConfig.useStages` is
 * on, every slot advances through the same shared sequence of numbered
 * stages together (see `ScreenConfig.stageCount`), using
 * `slideDurationSeconds` as the shared timer. A slot doesn't need its own
 * value at every stage — each of its own fields below is an independent
 * `StageTimeline`, only checkpointed at the stages where the owner actually
 * changed *that* field, holding its last explicit value until the next one.
 * The four timelines are deliberately independent of each other: changing a
 * slot's content at stage 5 doesn't disturb whatever stage its own
 * background color was last set at. When `useStages` is off, every slot
 * always resolves as if there's exactly one stage (stage 1).
 */
export interface ScreenSlot {
  content: StageTimeline<ScreenSlotContent>
  /** This slot's own background color (hex, from `SCREEN_BACKGROUND_COLORS`) timeline, independent of the screen's own. An entry's value may itself be `undefined` (explicitly transparent at that stage, showing the screen's own background through) — distinct from no entry at all at that stage (inherit from an earlier one). */
  backgroundColor: StageTimeline<string | undefined>
  /** This slot's own background image (blurred, scaled to cover the pane) timeline, shown behind whichever content is currently active. A slide with its own `backgroundImage` set overrides this one just for itself. */
  backgroundImage: StageTimeline<BackgroundImage | undefined>
  /** This slot's own shared/fallback text size timeline — replaces the old screen-level `slotTextSizes`. Falls back to the screen's own `textSizes` (then `DEFAULT_TEXT_SIZES`) at any stage without an entry. */
  textSizes: StageTimeline<TextSizes | undefined>
}

/** How a screen's panes are arranged along their split axis: side by side, or stacked. Only meaningful when `slotCount` is 2. */
export type SplitDirection = 'row' | 'column'

/**
 * When exactly 3 of a screen's `slotCount` panes are shown, one is shown
 * "featured" (occupying a full row/column) and the other two share the
 * remaining space as two small squares. This says whether the featured one
 * comes first (top, if `splitDirection` is 'row'; left, if 'column') or
 * second (bottom/right). The featured pane itself is always the first one
 * in slot order (Slot 1 before Slot 2, etc).
 */
export type SplitBigPosition = 'first' | 'second'

/** A screen's own adjustable arrangement dividers — which one governs which split, for a given `slotCount`/`splitDirection`/`splitBigPosition` combo (see `src/utils/screenLayout.ts`). Each is its own independent per-stage timeline on `ScreenConfig.ratios`, so moving a divider only affects the stage currently being viewed. */
export type RatioField = 'splitRatio' | 'tripleBigRatio' | 'tripleSmallRatio' | 'quadColumnRatio' | 'quadRowRatio'

/** How a slide change is animated for any slot's own in-place rotation. Kept as its own union so more styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade' | 'slide'

/** Which side a `'slide'`-style transition's incoming slide enters from — the outgoing one exits toward the opposite side. Only relevant when `transitionStyle` is `'slide'`; computed per pane from the arrangement itself (see `paneDefaultSlideDirection`) rather than stored on `ScreenConfig`, so a slide never has to enter/exit through a border it shares with a neighboring pane. */
export type SlideTransitionDirection = 'left' | 'right' | 'up' | 'down'

/** One selectable screen background color: a fixed hex value from the project's brand palette (not a theme variable), so it looks the same regardless of the viewer's light/dark mode. */
export interface ScreenBackgroundColorOption {
  key: string
  hex: string
}

/** Fixed background color choices for screens, drawn from the site's brand palette (`src/styles/_variables.scss`) plus a couple of neutrals. Deliberately literal hex values, not theme-dependent CSS variables. */
export const SCREEN_BACKGROUND_COLORS: ScreenBackgroundColorOption[] = [
  { key: 'white', hex: '#ffffff' },
  { key: 'cream', hex: '#fffaf2' },
  { key: 'black', hex: '#000000' },
  { key: 'mustard', hex: '#dfa93e' },
  { key: 'neutralGreen', hex: '#626c66' },
  { key: 'burgundy', hex: '#8f250c' },
  { key: 'lime', hex: '#88d18a' },
]

/** Used when a screen has no `backgroundColor` of its own yet. */
export const DEFAULT_SCREEN_BACKGROUND_COLOR = '#ffffff'

/**
 * Font sizes (in rem) for the text roles shared by every slide, adjustable
 * per screen via the in-display text size editor. `price` is a category's
 * own default price (shown once in its header); `itemPrice` is each
 * individual product's own price — kept separate since a category that
 * shows one header price (e.g. Nachos) and a category whose items each show
 * their own price (e.g. Coffee & Drinks) aren't necessarily meant to match.
 */
export interface TextSizes {
  heading: number
  itemTitle: number
  description: number
  price: number
  itemPrice: number
}

/** Sizes matching the slides' original hardcoded values, used when a screen has no `textSizes` of its own yet. */
export const DEFAULT_TEXT_SIZES: TextSizes = {
  heading: 3.5,
  itemTitle: 1.75,
  description: 1.25,
  price: 1.5,
  itemPrice: 1.5,
}

/** A configured fullscreen display, editable via the admin Screens view and rendered at `/screens/:screenId`. */
export interface ScreenConfig {
  screenID: string
  name: string
  /**
   * How many of the 4 slots (starting from Slot 1) are actually shown on
   * the live display, 1-4 — an explicit layout choice, independent of
   * whether each of those slots has its own content configured yet (an
   * in-range slot with nothing set just renders blank in its position).
   * Reducing this never touches a hidden slot's own content/settings —
   * they're simply not rendered until `slotCount` grows back to include
   * them again, or the whole screen is deleted.
   */
  slotCount: number
  /** Up to 4 content slots; unused ones have no non-"none" entries anywhere in their `content` timeline. */
  slots: [ScreenSlot, ScreenSlot, ScreenSlot, ScreenSlot]
  /** Whether every slot advances through a shared sequence of numbered stages together (see `stageCount`). Falls back to `false` (a single static stage) when absent — turning it off never deletes checkpoint data beyond stage 1, so turning it back on (or growing `stageCount` back up) restores exactly where the owner left off. */
  useStages?: boolean
  /** Total number of shared stages, 1 and up — only relevant/edited while `useStages` is true. Falls back to 1 when absent. Shrinking this never prunes checkpoints beyond the new count; they simply become unreachable until it's grown back. */
  stageCount?: number
  /** Seconds each stage is shown before advancing to the next, shared by every slot's own rotation. Only meaningful while `useStages` is on and `stageCount` is more than 1. */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
  /** Optional per-screen text size override, set via the display's own "Edit appearance" panel. Falls back to `DEFAULT_TEXT_SIZES` when absent. */
  textSizes?: TextSizes
  /** Only used when `slotCount` is 2. Falls back to 'row' (side by side) when absent. */
  splitDirection?: SplitDirection
  /** Only used when `slotCount` is 3. Falls back to 'first' when absent. */
  splitBigPosition?: SplitBigPosition
  /**
   * Per-stage timelines (percentage, 10-90) for each of a screen's own
   * adjustable arrangement dividers — draggable on the live display, or
   * nudgeable 1% at a time from the admin form's "Resize" panel — only the
   * field(s) relevant to the current `slotCount`/`splitDirection` are ever
   * read (see `src/utils/screenLayout.ts`). Moving a divider only writes a
   * checkpoint at the stage currently being viewed, same as every slot's
   * own fields; falls back to 50 (even split) for a field/stage with no
   * entry. `splitRatio`: the single divider in a 2-slot row/column
   * arrangement. `tripleBigRatio`: the divider between the "big" pane and
   * the small pair in a 3-slot arrangement. `tripleSmallRatio`: the
   * divider between the two small panes themselves. `quadColumnRatio`/
   * `quadRowRatio`: the vertical/horizontal dividers in a 4-slot 2x2 grid.
   */
  ratios?: Partial<Record<RatioField, StageTimeline<number>>>
  /** Whether visible borders are drawn between panes. Falls back to `true` (shown) when absent. */
  showSlotBorders?: boolean
  /** Fixed border color (hex, from `SCREEN_BACKGROUND_COLORS`) between panes. Falls back to an automatic contrast-based color (`--screen-border`) when absent. Only relevant while `showSlotBorders` is on and `slotCount` is more than 1. */
  borderColor?: string
  /** Whether a slide's own scrollbar (shown when its content is taller than the screen) is hidden. Content stays scrollable either way — this only hides the scrollbar UI. Falls back to `false` (shown) when absent. */
  hideScrollbar?: boolean
  /** Fixed background color (hex) for this screen, chosen from `SCREEN_BACKGROUND_COLORS`. Falls back to `DEFAULT_SCREEN_BACKGROUND_COLOR` when absent. Not affected by the site's light/dark mode. */
  backgroundColor?: string
  /** A background image for the whole screen (blurred, scaled to cover, same technique as a slot's own — see `BackgroundImage`), shown behind every pane that doesn't have its own background color/image. Falls back to none when absent. */
  backgroundImage?: BackgroundImage
  /** Whether this screen's own editing controls (its toolbar's "Edit appearance" button, each pane's hover-revealed edit button, and its draggable resize dividers) are hidden — a deterrent against casual tampering at the physical display, not real security, since unlocking just takes the shared PIN set from the admin Screens dashboard (`useScreenLockPin`), stored in the same plain browser storage as everything else here. Falls back to `false` (unlocked) when absent. */
  locked?: boolean
  /** Whether this screen goes black during the shared screensaver schedule's own window (set once, for every screen, from the admin dashboard's "Screen saver" button — see `useScreensaverSchedule`). A whole-screen effect, not per-slot. Has no effect at all — and its own checkbox stays hidden — until a schedule's actually been set. Falls back to `false` (never) when absent. */
  useScreensaver?: boolean
  /** Live-toggled preview of the screensaver ("Test screensaver"), independent of the actual schedule — shows the same black overlay immediately regardless of the time of day (or whether `useScreensaver` is even on), on this screen and any other open tab of it. Manually turned back off the same way; falls back to `false` when absent. */
  screensaverTestActive?: boolean
  /**
   * Which of this screen's own tabs the admin's editor is currently focused
   * on — an ephemeral, live-synced signal (same mechanism as
   * `screensaverTestActive`) rather than real screen configuration, so the
   * actual live display (see `SplitLayout`) can flash the matching pane and
   * make clear, even when that display is showing somewhere else entirely
   * (a kiosk, another tab/window), which part is currently being edited.
   * `pulse` increments on every focus change, even a repeat one on the tab
   * that's already active, purely so the display can restart its flash
   * animation from scratch regardless of how fast it's re-triggered. Cleared
   * to `undefined` when the editor closes.
   */
  editingFocus?: { tab: 'global' | number; pulse: number }
}

/** A named, reusable set of text sizes, saved from one screen's editor and applicable to any screen. */
export interface TextSizePreset {
  presetID: string
  name: string
  textSizes: TextSizes
}
