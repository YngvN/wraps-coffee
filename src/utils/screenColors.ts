/** Parses a "#rrggbb" hex color into 0-255 [r, g, b] components. */
function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** WCAG relative luminance (0 = black, 1 = white) of an sRGB color. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * CSS custom properties for a screen display's chosen background color: the
 * background itself, plus a readable text color (and muted/border variants
 * derived from it) picked by contrast rather than the site's light/dark
 * theme — so a screen looks the same regardless of the viewer's OS setting.
 */
export function getScreenColorVars(backgroundHex: string): Record<string, string> {
  const isLight = relativeLuminance(hexToRgb(backgroundHex)) > 0.4
  const textRgb = isLight ? '17, 17, 17' : '245, 245, 245'

  return {
    '--screen-bg': backgroundHex,
    '--screen-text': `rgb(${textRgb})`,
    '--screen-text-muted': `rgba(${textRgb}, 0.7)`,
    '--screen-border': `rgba(${textRgb}, 0.2)`,
    '--screen-accent': '#dfa93e',
  }
}

/**
 * Style for one slide/pane's own background color override — `undefined`
 * (the standard) leaves it transparent, showing the screen's own background
 * through. Given a color, repaints `--screen-*` locally (so contrast-picked
 * text stays readable against it) and actually paints that background at
 * this element, not just an ancestor.
 */
export function slotBackgroundColorStyle(backgroundColor: string | undefined): Record<string, string> {
  if (!backgroundColor) return {}
  return { ...getScreenColorVars(backgroundColor), background: 'var(--screen-bg)' }
}

/** Overrides `--screen-border` (normally an automatic contrast-based color, see `getScreenColorVars`) with a fixed color — `undefined` leaves the automatic one in place. */
export function borderColorStyle(borderColor: string | undefined): Record<string, string> {
  if (!borderColor) return {}
  return { '--screen-border': borderColor }
}
