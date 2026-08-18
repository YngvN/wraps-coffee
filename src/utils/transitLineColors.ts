import { hslToHex, hueFromLabel } from './colorHash'
import { getContrastTextColor } from './screenColors'

const AUTO_LINE_COLOR_SATURATION = 65
const AUTO_LINE_COLOR_LIGHTNESS = 45

/** Deterministic per-operator badge color, generated from the operator's own name — no manual color entry needed. Same authority name always yields the same color, and the returned text color is contrast-checked against it. */
export function getAutoLineColor(authorityName: string): { background: string; text: string } {
  const background = hslToHex(hueFromLabel(authorityName), AUTO_LINE_COLOR_SATURATION, AUTO_LINE_COLOR_LIGHTNESS)
  return { background, text: getContrastTextColor(background) }
}
