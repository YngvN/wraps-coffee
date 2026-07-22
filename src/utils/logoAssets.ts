/**
 * Every logo image saved under `src/assets/images/integration-logos/`, eagerly
 * resolved to its final built asset URL at bundle time. Keyed by filename
 * (without extension) so a brand slug can be looked up without needing to
 * know ahead of time whether a given brand's fetch produced a `.svg` or a
 * `.png` — or whether it produced anything at all. Split out of
 * `FetchedLogo.tsx` itself (rather than defined there) since a file mixing
 * component and non-component exports breaks Fast Refresh.
 */
const logoModules = import.meta.glob('../assets/images/integration-logos/*.{svg,png,webp,jpg,jpeg}', { eager: true, import: 'default' }) as Record<string, string>

const logosBySlug: Record<string, string> = {}
for (const [path, url] of Object.entries(logoModules)) {
  const slug = path.replace(/^.*\//, '').replace(/\.(svg|png|webp|jpg|jpeg)$/, '')
  logosBySlug[slug] = url
}

/** The raw built-asset URL for `slug`'s own saved logo file, or `undefined` if none was saved — for callers that need a plain `src` string rather than a rendered `<FetchedLogo>` element (e.g. `QrCodeSlide`'s `imageSettings.src`, which `qrcode.react` reads directly, not through the DOM). `FetchedLogo` itself also uses this same lookup for its own `<img>` rendering. */
export function getLogoSrc(slug: string): string | undefined {
  return logosBySlug[slug]
}
