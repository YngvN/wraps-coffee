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
 * Uses the source's own editorial `brandFontFamily` — the same stack the
 * headline text in `NewsSlide`/`NewsSourceMark`'s on-screen rendering uses
 * — so the QR code's own embedded mark matches rather than falling back to
 * a generic system font. This only renders reliably when the referencing
 * page has that font already loaded (see `index.html`'s Google Fonts
 * `<link>`) *and* the browser actually extends that to an inline SVG data
 * URI used as an image source, which isn't guaranteed everywhere — falls
 * back to `brandFontFamily`'s own later stack entries (e.g. `system-ui`,
 * `sans-serif`) if not, same as any other CSS font stack.
 */
export function buildSourceMark(source: NewsSource, size = 40): { uri: string; width: number; height: number } {
  const bg = source.markOnBrandBg ? source.brandColor : '#ffffff'
  const fg = source.markOnBrandBg ? '#ffffff' : source.brandColor

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"${source.markOnBrandBg ? '' : ` stroke="${source.brandColor}" stroke-width="${Math.max(1, size * 0.05)}"`} />
<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(source.brandFontFamily)}" font-weight="700" font-size="${size * 0.42}" fill="${fg}">${escapeXml(source.monogram)}</text>
</svg>`

  return { uri: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: size, height: size }
}
