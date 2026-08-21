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
 * "Quicksand"), self-hosted in `public/fonts` and always available — see `scripts/fetch-google-fonts.mts`.
 */
export interface AppearanceThemeFonts {
  body: string
  heading: string
  subheading: string
}

/**
 * Which palette color fills each of the public website's own color tokens.
 *
 * The palette itself carries no semantic meaning — only `white`/`black`/`grey`
 * have stable ids, and every custom swatch gets a random `generateId()` one —
 * so nothing can infer which swatch is "the background". These roles are that
 * missing mapping, and each value is an `AppearanceThemeColor.id` in the same
 * theme's own `colors`, resolved to a hex value only when pushed to the site.
 *
 * **Light theme only.** The website keeps its own built-in dark palette, so a
 * visitor who prefers dark still gets a deliberately designed one rather than
 * an auto-inverted guess at these.
 *
 * Every role is optional, and a partly-filled map is a normal state rather
 * than an error: the website falls back to its own built-in value for anything
 * left unset, so a theme can be mapped one token at a time.
 */
export interface AppearanceThemeWebsiteRoles {
  bg?: string
  surface?: string
  text?: string
  textMuted?: string
  accent?: string
  accentContrast?: string
  border?: string
}

/** Every role in `AppearanceThemeWebsiteRoles`, for iterating the editor's own controls and validating a draft. */
export const WEBSITE_ROLE_KEYS: (keyof AppearanceThemeWebsiteRoles)[] = [
  'bg',
  'surface',
  'text',
  'textMuted',
  'accent',
  'accentContrast',
  'border',
]

/**
 * A named color palette + font set applied to screen displays (kiosk output,
 * its live preview, and its grid thumbnail) — not the admin dashboard's own
 * light/dark chrome, which has its own separate `useTheme` toggle.
 *
 * When this is the *active* theme, its fonts and `websiteRoles` are also
 * mirrored to the public website (see `server/neonBridge.ts`), so the cafe's
 * screens and its website share typography and color.
 */
export interface AppearanceTheme {
  id: string
  name: string
  fonts: AppearanceThemeFonts
  /** Always starts with the 3 locked colors (white/black/grey), followed by any custom ones. */
  colors: AppearanceThemeColor[]
  /**
   * Optional: themes saved before this existed have none, and the website then
   * falls back to its own built-in colors for every unmapped role. A role
   * pointing at a since-deleted swatch falls back the same way.
   */
  websiteRoles?: AppearanceThemeWebsiteRoles
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
