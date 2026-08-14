/** Deterministic, evenly-spread hue (0-359) from an arbitrary label, so generated badge colors stay stable across reloads and reasonably distinct between different labels without needing a hand-picked color per entry. */
export function hueFromLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return hash % 360
}

/** Converts an HSL color (h in degrees, s/l as 0-100 percentages) to a `#rrggbb` hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100
  const lNorm = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sNorm * Math.min(lNorm, 1 - lNorm)
  const channel = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (n: number) =>
    Math.round(channel(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`
}
