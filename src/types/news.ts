/**
 * One RSS news source available to the News integration (see the
 * Integrations page's own News feed card) and to a `'qrcode'` slide's own
 * "link to news article" mode. A fixed, hand-authored catalog — not
 * admin-editable free text — same posture as Ruter/Entur/Yr's own
 * non-editable endpoints.
 */
export interface NewsSource {
  id: string
  name: string
  feedUrl: string
  /** Best-effort brand color — hand-picked, not pulled from any official brand guideline. Sanity-check before relying on it looking exactly right. */
  brandColor: string
  /** Slug `getLogoSrc`/`FetchedLogo` look up under `src/assets/images/integration-logos/<slug>.(svg|png|webp)` — used by `NewsSourceMark`'s own on-screen rendering. Only NRK, Klar Tale and Dagsavisen have a real saved file today — every other source falls back to the constructed `NewsSourceMark` below (see `markText` etc.) rather than a real logo image, since no cleanly-licensed file exists for them. Dropping a real file in under this same slug later upgrades that source too, with no code change. */
  logoSlug: string
  /** A separate logo file, under this same slug, specifically for `QrCodeSlide`'s own embedded QR-code logo — falls back to `logoSlug` when unset. Only worth setting when the on-screen logo doesn't work well shrunk into a small excavated square (e.g. too wide, too much fine detail) and a simplified/more-square variant was saved separately for that case. */
  qrLogoSlug?: string
  /** The *QR* logo variant's own width ÷ height (`qrLogoSlug` if set, else `logoSlug`) — only relevant while that resolves to a real image, since `QrCodeSlide`'s embedded-logo sizing needs this to *contain*-fit a non-square real image within its square footprint instead of stretching it to fill a forced square (the constructed `NewsSourceMark`/`buildSourceMark` fallback is always square already, so this is moot for every other source). Omit for sources without a real logo image. */
  logoAspectRatio?: number
  /** Short wordmark text for the constructed fallback mark (`NewsSourceMark`) — an original, hand-styled text badge, not a reproduction of the source's own real logo artwork. */
  markText: string
  /** Two-letter abbreviation used instead of `markText` when the constructed mark needs to stay square — specifically `QrCodeSlide`'s own embedded logo (see `buildSourceMark`), which must excavate a fixed square area of the code rather than a wide rectangle. */
  monogram: string
  /** `true` colors the mark's own background with `brandColor` (white text); `false` keeps a plain white/neutral background with `brandColor` (or near-black) text instead — matches how e.g. Aftenposten's real-world identity reads as a plain black wordmark rather than a colored badge. */
  markOnBrandBg: boolean
  /** Prepends a small `brandColor` dot before the text — Dagsavisen's own real-world mark pairs a round symbol with its full name this way; every other seeded source is text-only. */
  markShowDot?: boolean
  /** Editorial font stack applied to this source's own mark text and, while a `'news'`/`'qrcode'` slide's brand theme is on, its headline/description text too — evokes the outlet's own typographic character (see `$font-editorial-serif`/`$font-editorial-tabloid` in `src/styles/_variables.scss`) instead of the app's generic dashboard font. */
  brandFontFamily: string
}

/** Every seeded news source, in the order shown on the Integrations page and in per-slide source pickers. */
export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'nrk',
    name: 'NRK',
    feedUrl: 'https://www.nrk.no/toppsaker.rss',
    // NRK's own site reads as a near-black navy, not the red from its
    // logomark (red is a small accent there, not the dominant color) — the
    // previous `#e60000` mistook the accent for the brand's actual surface
    // color.
    brandColor: '#12172b',
    logoSlug: 'nrk',
    logoAspectRatio: 1435 / 513,
    markText: 'NRK',
    monogram: 'NR',
    markOnBrandBg: true,
    brandFontFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'vg',
    name: 'VG',
    feedUrl: 'https://www.vg.no/rss/feed/?format=rss',
    // Sampled from VG.png's own background fill.
    brandColor: '#dd0000',
    // Reused directly for the QR embed too (contain-fit) — same
    // single-asset treatment as NRK, no separate `qrLogoSlug`.
    logoSlug: 'VG',
    logoAspectRatio: 512 / 114,
    markText: 'VG',
    monogram: 'VG',
    markOnBrandBg: true,
    brandFontFamily: "'Oswald', 'Arial Narrow', sans-serif",
  },
  {
    id: 'aftenposten',
    name: 'Aftenposten',
    feedUrl: 'https://www.aftenposten.no/rss/',
    // White, not black — `aftenposten.png` is a black wordmark on a
    // transparent background (matches this source's own real "plain black
    // wordmark" identity, see `markOnBrandBg` below), which needs a light
    // pane background to actually stay legible once branded.
    brandColor: '#ffffff',
    logoSlug: 'aftenposten',
    qrLogoSlug: 'Aftenposten-qr',
    markText: 'Aftenposten',
    monogram: 'AP',
    markOnBrandBg: false,
    brandFontFamily: "'Playfair Display', Georgia, serif",
  },
  {
    id: 'dagbladet',
    name: 'Dagbladet',
    feedUrl: 'https://www.dagbladet.no/?lab_viewport=rss',
    // Sampled from Dagbladet.png's own background fill.
    brandColor: '#ed1c24',
    // Reused directly for the QR embed too (contain-fit) — same
    // single-asset treatment as NRK, no separate `qrLogoSlug`.
    logoSlug: 'Dagbladet',
    logoAspectRatio: 738 / 216,
    markText: 'Dagbladet',
    monogram: 'DB',
    markOnBrandBg: true,
    brandFontFamily: "'Oswald', 'Arial Narrow', sans-serif",
  },
  {
    id: 'nettavisen',
    name: 'Nettavisen',
    feedUrl: 'https://www.nettavisen.no/service/rich-rss',
    // Sampled from Nettavisen.jpg's own near-white background fill —
    // confirms the original "white bg, black text" design intent for this
    // source, rather than the earlier hand-picked navy guess.
    brandColor: '#fafafa',
    logoSlug: 'Nettavisen',
    qrLogoSlug: 'Nettavisen-qr',
    markText: 'Nettavisen.',
    monogram: 'Na.',
    markOnBrandBg: false,
    brandFontFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'dagsavisen',
    name: 'Dagsavisen',
    feedUrl: 'https://www.dagsavisen.no/?lab_viewport=rss',
    // Sampled from `Dagsavisen-qr.webp`'s own background fill, not a guess —
    // same treatment as Klar Tale.
    brandColor: '#991b1b',
    // The on-screen mark uses the white variant (`_hvit` — Norwegian for
    // "white") since it's shown against this source's own dark red
    // `brandColor`, same reasoning as NRK's own recolored logo.
    logoSlug: 'Dagsavisen_hvit',
    qrLogoSlug: 'Dagsavisen-qr',
    logoAspectRatio: 1,
    markText: 'Dagsavisen',
    monogram: 'DA',
    markOnBrandBg: false,
    markShowDot: true,
    brandFontFamily: "'Playfair Display', Georgia, serif",
  },
  {
    id: 'klartale',
    name: 'Klar Tale',
    feedUrl: 'https://www.klartale.no/?lab_viewport=rss',
    // Sampled from `klartale-qr.png`'s own background fill, not a guess —
    // Klar Tale's own real-world identity is a colored mark on a pale blue
    // field, not a solid saturated brand-color block like most of the
    // other six.
    brandColor: '#cbe8fa',
    logoSlug: 'klartale',
    qrLogoSlug: 'klartale-qr',
    logoAspectRatio: 424 / 471,
    markText: 'Klar Tale',
    monogram: 'KT',
    markOnBrandBg: true,
    // Deliberately the plainest, most legible stack of the seven — Klar
    // Tale is Norway's own "easy to read" newspaper (larger print, simpler
    // language, aimed at readers who need it), so its own mark and headline
    // font shouldn't be a decorative serif/condensed tabloid face the way
    // some of the others are.
    brandFontFamily: "'Inter', system-ui, sans-serif",
  },
]

/** One article headline, normalized from whichever source's own RSS/Atom feed it came from — see `server/news.ts`. Every field past `sourceId`/`title`/`link` is only as complete as that source's own feed actually provides; a source with a sparser feed just has more of these left unset. */
export interface NewsHeadline {
  sourceId: string
  title: string
  link: string
  /** ISO date-time, when the feed itself provides one. */
  publishedAt?: string
  /** Plain-text summary/teaser — HTML tags stripped, since feeds vary on whether their own description carries markup. */
  description?: string
  /** The article's own lead image, when the feed provides one — via a standard `<enclosure>` (most of the seeded sources) or NRK's own non-standard `<media:content>` (see `server/news.ts`'s own `customFields`). */
  imageUrl?: string
  /** Topic tags, when the feed provides any — NRK's own feed is the richest source of these among the seeded sources. */
  categories?: string[]
  /** Byline, when the feed credits one. */
  author?: string
}
