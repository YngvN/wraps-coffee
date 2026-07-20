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
  /** Slug `getLogoSrc`/`FetchedLogo` look up under `src/assets/images/extension-logos/<slug>.(svg|png)`. Only NRK has a real saved file today (its own public-domain wordmark, fetched from Wikimedia Commons) — every other source falls back to the constructed `NewsSourceMark` below (see `markText` etc.) rather than a real logo image, since no cleanly-licensed file exists for them. Dropping a real file in under this same slug later upgrades that source too, with no code change. */
  logoSlug: string
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
    brandColor: '#e60000',
    logoSlug: 'nrk',
    markText: 'NRK',
    monogram: 'NR',
    markOnBrandBg: true,
    brandFontFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'vg',
    name: 'VG',
    feedUrl: 'https://www.vg.no/rss/feed/?format=rss',
    brandColor: '#e2001a',
    logoSlug: 'vg',
    markText: 'VG',
    monogram: 'VG',
    markOnBrandBg: true,
    brandFontFamily: "'Oswald', 'Arial Narrow', sans-serif",
  },
  {
    id: 'aftenposten',
    name: 'Aftenposten',
    feedUrl: 'https://www.aftenposten.no/rss/',
    brandColor: '#000000',
    logoSlug: 'aftenposten',
    markText: 'Aftenposten',
    monogram: 'AP',
    markOnBrandBg: false,
    brandFontFamily: "'Playfair Display', Georgia, serif",
  },
  {
    id: 'dagbladet',
    name: 'Dagbladet',
    feedUrl: 'https://www.dagbladet.no/?lab_viewport=rss',
    brandColor: '#e2001a',
    logoSlug: 'dagbladet',
    markText: 'Dagbladet',
    monogram: 'DB',
    markOnBrandBg: true,
    brandFontFamily: "'Oswald', 'Arial Narrow', sans-serif",
  },
  {
    id: 'nettavisen',
    name: 'Nettavisen',
    feedUrl: 'https://www.nettavisen.no/service/rich-rss',
    brandColor: '#0d3c78',
    logoSlug: 'nettavisen',
    markText: 'Nettavisen.',
    monogram: 'Na.',
    markOnBrandBg: false,
    brandFontFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'dagsavisen',
    name: 'Dagsavisen',
    feedUrl: 'https://www.dagsavisen.no/?lab_viewport=rss',
    brandColor: '#c8102e',
    logoSlug: 'dagsavisen',
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
    brandColor: '#00843d',
    logoSlug: 'klartale',
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
