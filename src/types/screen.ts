import type { ProductCategory } from './product'

/** What a screen's content slot shows: nothing, a specific menu category, or the upcoming-events list. */
export type ScreenSlotContent = { kind: 'none' } | { kind: 'category'; category: ProductCategory } | { kind: 'events' }

/** How a screen presents its two slots: rotating one at a time, or both at once side by side. */
export type ScreenLayout = 'slideshow' | 'split'

/** Only 'fade' exists today; kept as its own union so new transition styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade'

/** A configured fullscreen display, editable via the admin Screens view and rendered at `/screens/:screenId`. */
export interface ScreenConfig {
  screenID: string
  name: string
  layout: ScreenLayout
  slots: [ScreenSlotContent, ScreenSlotContent]
  /** Seconds each slot is shown before rotating to the next. Only used when `layout` is 'slideshow'. */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
}
