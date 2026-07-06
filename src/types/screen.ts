import type { ProductCategory } from './product'

/** What a screen's content slot shows: nothing, a specific menu category, or the upcoming-events list. */
export type ScreenSlotContent = { kind: 'none' } | { kind: 'category'; category: ProductCategory } | { kind: 'events' }

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

/** Only 'fade' exists today; kept as its own union so new transition styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade'

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

/** Font sizes (in rem) for the text roles shared by every slide, adjustable per screen via the in-display text size editor. */
export interface TextSizes {
  heading: number
  itemTitle: number
  description: number
  price: number
}

/** Sizes matching the slides' original hardcoded values, used when a screen has no `textSizes` of its own yet. */
export const DEFAULT_TEXT_SIZES: TextSizes = {
  heading: 3.5,
  itemTitle: 1.75,
  description: 1.25,
  price: 1.5,
}

/** A configured fullscreen display, editable via the admin Screens view and rendered at `/screens/:screenId`. */
export interface ScreenConfig {
  screenID: string
  name: string
  layout: ScreenLayout
  /** Up to 4 content slots; unused ones are `{ kind: 'none' }`. */
  slots: [ScreenSlotContent, ScreenSlotContent, ScreenSlotContent, ScreenSlotContent]
  /** Seconds each slot is shown before rotating to the next. Only used when `layout` is 'slideshow'. */
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
  /** Fixed background color (hex) for this screen, chosen from `SCREEN_BACKGROUND_COLORS`. Falls back to `DEFAULT_SCREEN_BACKGROUND_COLOR` when absent. Not affected by the site's light/dark mode. */
  backgroundColor?: string
}

/** A named, reusable set of text sizes, saved from one screen's editor and applicable to any screen. */
export interface TextSizePreset {
  presetID: string
  name: string
  textSizes: TextSizes
}
