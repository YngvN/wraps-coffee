import type { LanguageCode } from '../i18n'
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
 * (see `ScreenSlot.content`): nothing, the menu (every category with
 * available items, laid out the same way as the public Menu page — or, via
 * `categories`, just a chosen subset of them, e.g. to split the full menu
 * across more than one screen, or narrowed to a single category), one of
 * the `'event'` kind's own `displayMode`s (see `EventDisplayMode` — an
 * upcoming-events calendar list, a single upcoming event's own photo or
 * details by ordinal position, or every event in the current month), a
 * single centered image (e.g. a logo or an Instagram photo, pasted in as a
 * URL), or a scannable QR code linking to an admin-typed `url` — drawn in a
 * single flat color (whichever of black/white the pane's own contrast-based
 * `--screen-text` resolves to, see `getScreenColorVars`) with no background
 * box of its own, so it reads as part of the pane rather than a pasted-in
 * sticker. A menu/event checkpoint's
 * own `textSizes` is independent of its slot's other stages — e.g. it can
 * be bigger than the slot's other checkpoints — since editing one step's
 * pane is only ever meant to change how that one step looks. It falls back
 * to the slot's own shared/fallback size (then the screen's default) only
 * until it's first edited, at which point it starts writing here instead.
 * An image checkpoint has no text of its own, so it has no text-size fields
 * at all; `fit` instead controls
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
 * its own. `'announcement'` is a short admin-authored call-to-action — a
 * title (e.g. "Buy tickets now!") and an optional description below it,
 * written once in whichever single language the owner types it in (not
 * per-language, unlike the rest of this app's admin-authored content) — for
 * a one-off message unrelated to the menu/events/message-board systems. Two
 * further kinds are backed by live
 * external data rather than admin-authored content, configured from the
 * admin's Extensions tab (see `useExtensionsConfig`): `'transit'` shows
 * real-time departures from one of the cafe's configured nearby stops
 * (`stopId`, referencing `ExtensionsConfig['transit']['selectedStops']`),
 * and `'weather'` shows an hourly forecast for the cafe's own address —
 * neither renders anything (see `TransitSlide`/`WeatherSlide`) unless its
 * integration is enabled.
 */
export type ScreenSlotContent =
  | ({ kind: 'none' } & OwnBackgroundImageFields)
  | ({ kind: 'menu'; categories?: ProductCategory[]; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({
      kind: 'event'
      /** Falls back to `'calendar'` when unset. */
      displayMode?: EventDisplayMode
      /** Used only when `displayMode` is `'image'`/`'details'` — 1-based position in the live event timeline (see `getUpcomingEvents`); a cancelled event still occupies its own position there (never removed until the admin deletes it outright), so this can resolve to a cancelled entry. Falls back to `1` when unset. */
      eventOrdinal?: number
      /** Used only when `displayMode` is `'calendar'` (or unset) — how many timeline entries it shows. Falls back to `DEFAULT_EVENT_CALENDAR_COUNT`. */
      count?: number
      /** Used only when `displayMode` is `'month'` — whether each listed event also shows its own price. Falls back to `false`. */
      showPrice?: boolean
      /** Used only when `displayMode` is `'month'` — whether each listed event also shows its own description. Falls back to `false`. */
      showDescription?: boolean
      /** Irrelevant for `'image'` — it has no text of its own. */
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({ kind: 'image'; imageUrl: string; fit?: ImageFit; resizeToFit?: boolean; resizeScale?: number } & OwnBackgroundImageFields)
  | ({
      kind: 'qrcode'
      url: string
      /** Percentage (`MIN_QR_CODE_SIZE`-100) of the pane's own available space the code fills. Falls back to `DEFAULT_QR_CODE_SIZE` (as large as it can be) when unset. */
      size?: number
    } & OwnBackgroundImageFields)
  | ({ kind: 'transit'; stopId?: string; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'weather'; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'announcement'; title: string; description: string; textSizes?: TextSizes } & OwnBackgroundImageFields)
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
 * How an `'event'` slide shows the cafe's events: `'calendar'` lists the
 * next few upcoming ones (soonest first), `'image'`/`'details'` each
 * pin to a single event by its 1-based ordinal position in that same
 * upcoming timeline (see `getUpcomingEvents`) — one showing just its photo,
 * the other its title/date/description — and `'month'` lists every event
 * occurring in the current calendar month, headed by the month's own name.
 */
export type EventDisplayMode = 'calendar' | 'image' | 'details' | 'month'

/** Used when an `'event'` slide's own `count` is unset (`'calendar'` mode only). */
export const DEFAULT_EVENT_CALENDAR_COUNT = 4

/** Used when a `'qrcode'` slide's own `size` is unset — fills as much of its pane as it can. */
export const DEFAULT_QR_CODE_SIZE = 100

/** Smallest percentage a `'qrcode'` slide's own `size` can be dragged down to. */
export const MIN_QR_CODE_SIZE = 10

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
  /** This slot's own language override timeline — an entry's value may itself be `undefined` (explicitly "use the cafe's own Standard pane language" at that stage, see `useDefaultPaneLanguage`), distinct from no entry at all (inherit from an earlier stage's own override, then the standard). Optional (rather than always-present like the fields above) since it's a newer field — a slot with none set at all falls back to the standard everywhere, exactly as if this were `{}`. */
  language?: StageTimeline<LanguageCode | undefined>
}

/** How a screen's panes are arranged along their split axis: side by side, or stacked. */
export type SplitDirection = 'row' | 'column'

/** Opaque, stable identifier for one pane — generated once (see `createLeaf` in `src/utils/layoutTree.ts`) and never reused or positional, so a pane keeps its own identity (content, `editingFocus`, drag/drop targets) across arbitrary tree edits and across whichever of a screen's stages happen to include it. */
export type PaneId = string

/**
 * A screen's pane arrangement — structure only, no content (see
 * `ScreenConfig.paneSlots` for that). A `'leaf'` is one visible pane,
 * referenced by its stable `PaneId`. A `'split'` divides its own box in two
 * along `direction` ('row' = side by side, a vertical divider; 'column' =
 * stacked, a horizontal one) at `ratio` (percentage, 10-90, the `first`
 * child's own share — see `MIN_RATIO`/`MAX_RATIO` in `screenLayout.ts`),
 * containing two further `LayoutNode`s, each in turn a leaf or another
 * split — arbitrarily deep, arbitrarily wide. Rendered recursively as
 * nested CSS grids, one per `split` node (see `LayoutTree.tsx`). `ratio` is
 * a plain number, not its own per-stage timeline, because the whole tree is
 * already checkpointed as one unit at the outer `ScreenConfig.layout` level
 * (see there) — nesting a second per-stage timeline inside an
 * already-per-stage-resolved value would be redundant.
 */
export type LayoutNode = { type: 'leaf'; id: PaneId } | { type: 'split'; direction: SplitDirection; ratio: number; first: LayoutNode; second: LayoutNode }

/** How a slide change is animated for any slot's own in-place rotation. Kept as its own union so more styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade' | 'slide'

/** The fallback entrance/exit a pane uses when it has no existing internal divider to grow from/collapse into — see `ScreenConfig.paneGrowthFallback`. */
export type PaneGrowthFallback = 'screenEdge' | 'fade'

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
   * This screen's pane arrangement, per stage — same `StageTimeline`
   * resolution every other per-stage field already uses (nearest checkpoint
   * at-or-below the stage, else wraps to the highest). A single-stage
   * screen just has one checkpoint at stage 1, always resolved regardless
   * of the queried stage. Splitting/deleting a pane at stage N writes a
   * whole new tree checkpoint at N, inherited by every later stage until
   * its own checkpoint exists — exactly how a content edit "changes this
   * step onward" already works. This is what lets a multi-stage screen add
   * or remove panes as its sequence advances.
   */
  layout: StageTimeline<LayoutNode>
  /**
   * Every pane's own content/background/text-size, keyed by its stable
   * `PaneId` — deliberately NOT itself per-stage (each field inside
   * `ScreenSlot` already is, unchanged). Kept separate from `layout` so a
   * pane's content stays the single continuous source of truth regardless
   * of which stages' tree checkpoints happen to reference it — editing a
   * pane's content while viewing stage 2 is visible at stage 5 too (if
   * stage 5 inherits stage 2's tree shape) with no need to know or care
   * about tree-checkpoint boundaries. A `PaneId` no longer referenced by
   * any stage's tree is simply unreachable — left as harmless orphaned
   * data (nothing else in this app prunes "unused" data either).
   */
  paneSlots: Record<PaneId, ScreenSlot>
  /** Whether every pane advances through a shared sequence of numbered stages together (see `stageCount`). Falls back to `false` (a single static stage) when absent — turning it off never deletes checkpoint data beyond stage 1, so turning it back on (or growing `stageCount` back up) restores exactly where the owner left off. */
  useStages?: boolean
  /** Total number of shared stages, 1 and up — only relevant/edited while `useStages` is true. Falls back to 1 when absent. Shrinking this never prunes checkpoints beyond the new count; they simply become unreachable until it's grown back. */
  stageCount?: number
  /** Seconds each stage is shown before advancing to the next, shared by every pane's own rotation. Only meaningful while `useStages` is on and `stageCount` is more than 1. */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
  /** Which entrance/exit a newly-appeared or just-removed pane uses when no existing internal divider qualifies as a border to grow from/collapse into (see `resolvePaneGrowthOrigin` in `src/utils/paneGrowth.ts`) — e.g. splitting a screen's very first/only pane, where there's nothing else yet to grow from. `'screenEdge'` grows in from (or collapses back into) whichever of the pane's own edges lies on the screen's outer boundary. `'fade'` skips the directional wipe entirely and just crossfades in/out in place. Falls back to `'screenEdge'` when absent. */
  paneGrowthFallback?: PaneGrowthFallback
  /** Optional per-screen text size override, set via the display's own "Edit appearance" panel. Falls back to `DEFAULT_TEXT_SIZES` when absent. */
  textSizes?: TextSizes
  /** Whether visible borders are drawn between panes. Falls back to `true` (shown) when absent. */
  showSlotBorders?: boolean
  /** Fixed border color (hex, from `SCREEN_BACKGROUND_COLORS`) between panes. Falls back to an automatic contrast-based color (`--screen-border`) when absent. Only relevant while `showSlotBorders` is on and there's more than one pane. */
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
   * Which of this screen's own panes the admin's editor is currently
   * focused on — an ephemeral, live-synced signal (same mechanism as
   * `screensaverTestActive`) rather than real screen configuration, so the
   * actual live display (see `SplitLayout`) can flash the matching pane and
   * make clear, even when that display is showing somewhere else entirely
   * (a kiosk, another tab/window), which part is currently being edited.
   * `tab` is a `PaneId` (or `'global'` for the whole screen), not a
   * positional index, so it stays valid across arbitrary tree edits.
   * `pulse` increments on every focus change, even a repeat one on the pane
   * that's already active, purely so the display can restart its flash
   * animation from scratch regardless of how fast it's re-triggered.
   * Cleared to `undefined` when the editor closes.
   */
  editingFocus?: { tab: 'global' | PaneId; pulse: number }
}

/** A named, reusable set of text sizes, saved from one screen's editor and applicable to any screen. */
export interface TextSizePreset {
  presetID: string
  name: string
  textSizes: TextSizes
}
