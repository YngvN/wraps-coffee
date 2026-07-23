/** One color swatch inside an `AppearanceTheme`'s palette. */
export interface AppearanceThemeColor {
  id: string
  hex: string
  /** True for the 3 standard colors every theme starts with (white/black/grey) — these can't be recolored or removed. */
  locked?: boolean
}

/**
 * The 3 font roles actually rendered on screen displays today: the default
 * body text (`$font-sans`), `<h1>`-style headings (`$font-heading`), and
 * `<h2>`-style subheadings (`$font-subheading`) — used across every slide
 * type (time, events, transit, news, message board, the product menu, etc.),
 * not specific to any one of them. Each is a Google Font family name (e.g.
 * "Quicksand"), loaded at runtime by `useGoogleFontLoader`.
 */
export interface AppearanceThemeFonts {
  body: string
  heading: string
  subheading: string
}

/**
 * A named color palette + font set applied to screen displays (kiosk output,
 * its live preview, and its grid thumbnail) — not the admin dashboard's own
 * light/dark chrome, which has its own separate `useTheme` toggle.
 */
export interface AppearanceTheme {
  id: string
  name: string
  fonts: AppearanceThemeFonts
  /** Always starts with the 3 locked colors (white/black/grey), followed by any custom ones. */
  colors: AppearanceThemeColor[]
}

/** Every theme's palette always starts with these 3 locked colors, in this order. */
export const LOCKED_APPEARANCE_COLORS: AppearanceThemeColor[] = [
  { id: 'white', hex: '#ffffff', locked: true },
  { id: 'black', hex: '#000000', locked: true },
  { id: 'grey', hex: '#808080', locked: true },
]

export interface AppearanceSettings {
  themes: AppearanceTheme[]
  /** Which `AppearanceTheme.id` is currently applied to screen displays. */
  activeThemeId: string
}
