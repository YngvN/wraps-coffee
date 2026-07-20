import type { NewsSource } from '../types/news'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Builds `source`'s own small brand mark as a plain square image — a
 * rounded square carrying `monogram` (two letters), an original
 * hand-styled badge rather than a reproduction of that source's real logo
 * artwork. Deliberately square rather than sized to fit `markText`'s own
 * full wordmark (unlike `NewsSourceMark`'s on-screen rendering) — this is
 * only ever used for `QrCodeSlide`'s own embedded logo, which must
 * excavate a fixed square area of the code rather than a wide rectangle
 * that could excavate past what `level="H"`'s error correction can
 * recover. Returns a data URI plus the pixel size it was built at, since
 * `qrcode.react`'s own `imageSettings` needs both up front rather than an
 * intrinsic size it can measure itself.
 *
 * Deliberately a plain system font, not the editorial `brandFontFamily`
 * (Playfair Display/Oswald) `NewsSourceMark`'s own on-screen rendering
 * uses — a standalone SVG referenced as an image resource (which is what
 * this becomes once handed to `qrcode.react`) isn't guaranteed access to
 * the parent document's own `@font-face` fonts across browsers, so this
 * sticks to a universally-available bold sans-serif rather than risking an
 * invisible/fallback-font label baked into a downloaded or scanned QR code.
 */
export function buildSourceMark(source: NewsSource, size = 40): { uri: string; width: number; height: number } {
  const bg = source.markOnBrandBg ? source.brandColor : '#ffffff'
  const fg = source.markOnBrandBg ? '#ffffff' : source.brandColor

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"${source.markOnBrandBg ? '' : ` stroke="${source.brandColor}" stroke-width="${Math.max(1, size * 0.05)}"`} />
<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size * 0.42}" fill="${fg}">${escapeXml(source.monogram)}</text>
</svg>`

  return { uri: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: size, height: size }
}
