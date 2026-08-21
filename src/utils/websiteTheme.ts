import { WEBSITE_ROLE_KEYS, type AppearanceTheme, type AppearanceThemeWebsiteRoles } from '../types/appearanceTheme'

/**
 * Turns an `AppearanceTheme` into the flat, already-resolved shape the public
 * website consumes.
 *
 * Environment-neutral: imported by the browser (the theme editor's preview)
 * and by the local server's Neon bridge, which pushes the result into the
 * shared `site_theme` table. No DOM and no `node:` imports.
 *
 * The website never sees palette ids — it receives hex values and font family
 * names it can drop straight into CSS custom properties. Resolving here rather
 * than there is what keeps the *ids* private to this app: a swatch can be
 * renamed, reordered, or replaced without the website knowing or caring.
 */

/** The active theme's fonts and colors, as pushed to the website's `site_theme` row. */
export interface WebsiteThemeProjection {
  fonts: { body: string; heading: string; subheading: string }
  /**
   * Hex values keyed by website role. A role is **omitted** rather than sent
   * empty when it isn't mapped or points at a deleted swatch — the website
   * treats a missing key as "use your own built-in value", so a half-configured
   * theme degrades one token at a time instead of rendering a broken color.
   */
  colors: Partial<Record<keyof AppearanceThemeWebsiteRoles, string>>
}

/**
 * Resolves a theme's website role assignments against its own palette.
 *
 * @param theme The theme to project — normally the active one.
 * @returns Its fonts, plus a hex value for every role that resolves.
 */
export function toWebsiteThemeProjection(theme: AppearanceTheme): WebsiteThemeProjection {
  const hexById = new Map(theme.colors.map((color) => [color.id, color.hex]))
  const colors: WebsiteThemeProjection['colors'] = {}

  for (const role of WEBSITE_ROLE_KEYS) {
    const colorId = theme.websiteRoles?.[role]
    if (!colorId) continue

    const hex = hexById.get(colorId)
    if (hex) colors[role] = hex
  }

  return {
    fonts: { body: theme.fonts.body, heading: theme.fonts.heading, subheading: theme.fonts.subheading },
    colors,
  }
}

/**
 * Drops role assignments whose swatch no longer exists.
 *
 * Called when a custom color is deleted from a theme, so the dangling
 * reference doesn't sit in the saved data waiting to confuse the next person
 * who reads it. Resolution tolerates a dangling id either way — this is
 * hygiene, not correctness.
 *
 * @param roles The theme's current assignments, if any.
 * @param colorIds The ids still present in its palette.
 * @returns The assignments with every dangling role removed, or `undefined`
 *   when nothing valid is left.
 */
export function pruneWebsiteRoles(
  roles: AppearanceThemeWebsiteRoles | undefined,
  colorIds: Iterable<string>,
): AppearanceThemeWebsiteRoles | undefined {
  if (!roles) return undefined

  const available = new Set(colorIds)
  const pruned: AppearanceThemeWebsiteRoles = {}

  for (const role of WEBSITE_ROLE_KEYS) {
    const colorId = roles[role]
    if (colorId && available.has(colorId)) pruned[role] = colorId
  }

  return Object.keys(pruned).length > 0 ? pruned : undefined
}
