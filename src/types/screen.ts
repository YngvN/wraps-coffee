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

/** Shared by every `ScreenSlotContent` variant: lets one slide opt out of its slot's own `backgroundImage` and use its own instead. */
interface OwnBackgroundImageFields {
  useOwnBackgroundImage?: boolean
  backgroundImage?: BackgroundImage
}

/**
 * What a single slide within a slot shows: nothing, a specific menu category,
 * the entire menu (every category with available items, laid out the same
 * way as the public Menu page — or, via `categories`, just a chosen subset
 * of them, e.g. to split the full menu across more than one screen), the
 * upcoming-events list, or a single centered image (e.g. a logo or an
 * Instagram photo, pasted in as a URL). A category/menu/events slide
 * normally follows its slot's own text size (which itself falls back to the
 * screen's default) — `useOwnTextSizes` lets one slide in a multi-slide
 * (slideshow) slot opt out and keep its own independent `textSizes`
 * instead, e.g. because it needs bigger text than the other slides sharing
 * that slot. An image slide has no text of its own, so it has no
 * text-size fields at all; `fit` instead controls how its picture fills
 * the slide, falling back to `'contain'` when absent. Every kind can
 * independently opt out of its slot's own `backgroundImage` via
 * `useOwnBackgroundImage`, regardless of whether it has text of its own.
 */
export type ScreenSlotContent =
  | ({ kind: 'none' } & OwnBackgroundImageFields)
  | ({ kind: 'category'; category: ProductCategory; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'menu'; categories?: ProductCategory[]; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'events'; useOwnTextSizes?: boolean; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({ kind: 'image'; imageUrl: string; fit?: ImageFit } & OwnBackgroundImageFields)

/**
 * One of a screen's up to 4 content slots. When `isSlideshow` is false, only
 * `contents[0]` is shown (defaulting to `{ kind: 'none' }` if the array is
 * empty). When true, the slot itself rotates through every non-"none" entry
 * in `contents`, using the screen's own `slideDurationSeconds` as the shared
 * timer — independently of every other slot, so one pane can rotate while
 * the others stay fixed.
 */
export interface ScreenSlot {
  isSlideshow: boolean
  contents: ScreenSlotContent[]
  /** This slot's own background color (hex, from `SCREEN_BACKGROUND_COLORS`), independent of the screen's own. Falls back to transparent (showing the screen's own background through) when absent — the standard, until the owner picks one for this slot specifically. */
  backgroundColor?: string
  /** This slot's own background image (blurred, scaled to cover the pane), shown behind whichever slide is currently active. Falls back to none when absent. A slide with `useOwnBackgroundImage` set overrides this one just for itself. */
  backgroundImage?: BackgroundImage
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

/** How a slide change is animated for any slot's own in-place rotation. Kept as its own union so more styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade' | 'slide'

/** Which side a `'slide'`-style transition's incoming slide enters from — the outgoing one exits toward the opposite side. Only relevant when `transitionStyle` is `'slide'`. */
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
  /** Up to 4 content slots; unused ones have no non-"none" entries in their `contents`. */
  slots: [ScreenSlot, ScreenSlot, ScreenSlot, ScreenSlot]
  /** Seconds each slide is shown before rotating to the next, for any individual slot's own rotation (when that slot's `isSlideshow` is true). */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
  /** Which side the incoming slide enters from when `transitionStyle` is `'slide'`. Falls back to `'right'` (matching the original hardcoded direction) when absent. Unused for `'fade'`. */
  slideTransitionDirection?: SlideTransitionDirection
  /** Optional per-screen text size override, set via the display's own "Edit appearance" panel. Falls back to `DEFAULT_TEXT_SIZES` when absent. */
  textSizes?: TextSizes
  /** Optional per-slot text size override (keyed by slot index, 0-3), set by hovering a slot's pane and clicking its own edit button. Falls back to `textSizes` (then `DEFAULT_TEXT_SIZES`) for any slot without one. */
  slotTextSizes?: Record<number, TextSizes>
  /** Only used when `slotCount` is 2. Falls back to 'row' (side by side) when absent. */
  splitDirection?: SplitDirection
  /** Only used when `slotCount` is 3. Falls back to 'first' when absent. */
  splitBigPosition?: SplitBigPosition
  /** Whether visible borders are drawn between panes. Falls back to `true` (shown) when absent. */
  showSlotBorders?: boolean
  /** Fixed border color (hex, from `SCREEN_BACKGROUND_COLORS`) between panes. Falls back to an automatic contrast-based color (`--screen-border`) when absent. Only relevant while `showSlotBorders` is on and `slotCount` is more than 1. */
  borderColor?: string
  /** Whether a slide's own scrollbar (shown when its content is taller than the screen) is hidden. Content stays scrollable either way — this only hides the scrollbar UI. Falls back to `false` (shown) when absent. */
  hideScrollbar?: boolean
  /** Fixed background color (hex) for this screen, chosen from `SCREEN_BACKGROUND_COLORS`. Falls back to `DEFAULT_SCREEN_BACKGROUND_COLOR` when absent. Not affected by the site's light/dark mode. */
  backgroundColor?: string
}

/** A named, reusable set of text sizes, saved from one screen's editor and applicable to any screen. */
export interface TextSizePreset {
  presetID: string
  name: string
  textSizes: TextSizes
}
