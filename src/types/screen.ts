import type { ProductCategory } from './product'

/**
 * What a single slide within a slot shows: nothing, a specific menu category,
 * the upcoming-events list, or a single centered image (e.g. a logo or an
 * Instagram photo, pasted in as a URL). A category/events slide normally
 * follows its slot's own text size (which itself falls back to the screen's
 * default) — `useOwnTextSizes` lets one slide in a multi-slide (slideshow)
 * slot opt out and keep its own independent `textSizes` instead, e.g.
 * because it needs bigger text than the other slides sharing that slot. An
 * image slide has no text of its own, so it has no text-size fields at all.
 */
export type ScreenSlotContent =
  | { kind: 'none' }
  | { kind: 'category'; category: ProductCategory; useOwnTextSizes?: boolean; textSizes?: TextSizes }
  | { kind: 'events'; useOwnTextSizes?: boolean; textSizes?: TextSizes }
  | { kind: 'image'; imageUrl: string }

/**
 * One of a screen's up to 4 content slots. When `isSlideshow` is false, only
 * `contents[0]` is shown (defaulting to `{ kind: 'none' }` if the array is
 * empty). When true, the slot itself rotates through every non-"none" entry
 * in `contents`, using the screen's own `slideDurationSeconds` as the shared
 * timer — independent of the screen's overall `layout`, so an individual
 * pane in a 'split' screen can rotate while the others stay fixed.
 */
export interface ScreenSlot {
  isSlideshow: boolean
  contents: ScreenSlotContent[]
  /** This slot's own background color (hex, from `SCREEN_BACKGROUND_COLORS`), independent of the screen's own. Falls back to transparent (showing the screen's own background through) when absent — the standard, until the owner picks one for this slot specifically. */
  backgroundColor?: string
}

/** How a screen presents its two slots: rotating one at a time, or both at once. */
export type ScreenLayout = 'slideshow' | 'split'

/** How a 'split' screen's panes are arranged along their split axis: side by side, or stacked. */
export type SplitDirection = 'row' | 'column'

/**
 * When exactly 3 of a 'split' screen's 4 slots are active, one is shown
 * "featured" (occupying a full row/column) and the other two share the
 * remaining space as two small squares. This says whether the featured one
 * comes first (top, if `splitDirection` is 'row'; left, if 'column') or
 * second (bottom/right). The featured slot itself is always the first
 * active slot in slot order (Slot 1 before Slot 2, etc).
 */
export type SplitBigPosition = 'first' | 'second'

/** How a slide change is animated — both the screen-level rotation (when `layout` is 'slideshow') and any individual slot's own in-place rotation. Kept as its own union so more styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade' | 'slide'

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
  layout: ScreenLayout
  /** Up to 4 content slots; unused ones have no non-"none" entries in their `contents`. */
  slots: [ScreenSlot, ScreenSlot, ScreenSlot, ScreenSlot]
  /** Seconds each slide is shown before rotating to the next — both the screen-level rotation (when `layout` is 'slideshow') and any individual slot's own rotation (when that slot's `isSlideshow` is true). */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
  /** Optional per-screen text size override, set via the display's own "Edit appearance" panel. Falls back to `DEFAULT_TEXT_SIZES` when absent. */
  textSizes?: TextSizes
  /** Optional per-slot text size override (keyed by slot index, 0-3), set by hovering a slot's pane and clicking its own edit button. Falls back to `textSizes` (then `DEFAULT_TEXT_SIZES`) for any slot without one. */
  slotTextSizes?: Record<number, TextSizes>
  /** Only used when `layout` is 'split' and exactly 2 or 3 slots are active. Falls back to 'row' (side by side) when absent. */
  splitDirection?: SplitDirection
  /** Only used when `layout` is 'split' and exactly 3 slots are active. Falls back to 'first' when absent. */
  splitBigPosition?: SplitBigPosition
  /** Whether visible borders are drawn between panes in 'split' layout. Falls back to `true` (shown) when absent. */
  showSlotBorders?: boolean
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
