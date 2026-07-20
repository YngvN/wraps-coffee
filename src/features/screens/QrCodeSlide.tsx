import type { CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useCurrentNewsHeadline, type NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useNewsHeadlines } from '../../hooks/useNewsHeadlines'
import { NEWS_SOURCES } from '../../types/news'
import { DEFAULT_QR_CODE_SIZE } from '../../types/screen'
import { getLogoSrc } from '../../utils/logoAssets'
import { buildSourceMark } from '../../utils/newsSourceMark'
import './QrCodeSlide.scss'

/** `qrcode.react`'s own internal default `size` (its SVG's coordinate/viewBox space) — this file never overrides that prop, relying on CSS `width`/`height` percentages for the actual rendered size instead, so `imageSettings`' pixel dimensions need to be proportioned against this fixed internal value, not the rendered one. */
const QR_INTERNAL_SIZE = 128
/** Keeps the embedded logo's own square footprint comfortably within `level="H"`'s ~30% error-correction tolerance once its modules are excavated. Always applied to both width and height, so the logo never excavates a wide rectangle — a real source image (e.g. NRK's own wordmark) gets squished to fit, and the constructed fallback (`buildSourceMark`) is a square monogram badge for exactly this reason. */
const LOGO_SIZE_FRACTION = 0.22

interface QrCodeSlideProps {
  /** Used only while `linkMode` is `'custom'` (or unset). */
  url: string
  /** Percentage (`MIN_QR_CODE_SIZE`-100) of the pane's own available space the code fills. Falls back to `DEFAULT_QR_CODE_SIZE`. */
  size?: number
  /** `'custom'` encodes `url` as typed; `'news'` instead encodes whichever article `newsSourceMode` resolves to. Falls back to `'custom'`. */
  linkMode?: 'custom' | 'news'
  /** `'automatic'` (the default) follows whichever headline a `'news'`-kind sibling pane is currently showing (see `newsSlots`/`newsSlotOrdinal`); `'specific'` always links to `linkedNewsSourceId`'s own latest headline instead. Only relevant while `linkMode` is `'news'`. */
  newsSourceMode?: 'automatic' | 'specific'
  /** Which news source to link to — required (and only relevant) while `linkMode` is `'news'` and `newsSourceMode` is `'specific'`. */
  linkedNewsSourceId?: string
  /** Which of `newsSlots` (1-based) to follow — only relevant while `newsSourceMode` is `'automatic'`. Falls back to `1`. */
  newsSlotOrdinal?: number
  /** Every currently-resolved `'news'`-kind pane on this same screen, in leaf order — what `newsSlotOrdinal` indexes into. See `useCurrentNewsHeadline`'s own doc comment for why this is handed down rather than read directly off some live sibling component. */
  newsSlots: NewsSlotSettings[]
  /** Embeds the linked source's own logo in the code's center. Only relevant while `linkMode` is `'news'`. Falls back to `true`. */
  showSourceLogo?: boolean
  /** Overrides the pane's own background with the linked source's own brand color. Only relevant while `linkMode` is `'news'`. Falls back to `true`. */
  useSourceTheme?: boolean
}

/**
 * Fullscreen, centered QR code for a screen display's "QR code" slot —
 * either a static admin-typed URL (`linkMode: 'custom'`, the original/
 * default behavior), or the linked news source's own latest article link
 * (`linkMode: 'news'`), refreshing as new headlines arrive via the same
 * `useNewsHeadlines` polling hook `NewsSlide` uses (requesting just that one
 * source's single most recent headline). Deliberately not the usual white-
 * square/black-modules look — `bgColor="transparent"` and
 * `fgColor="currentColor"` draw only the dark modules, in whichever of
 * black/white this pane's own contrast-based `--screen-text` resolves to
 * (see `getScreenColorVars`), so it reads as part of the pane rather than a
 * pasted-in white sticker; `useSourceTheme` overrides that same
 * `--screen-*` custom-property set with the source's own brand color
 * instead, same mechanism as `NewsSlide`'s own brand theming. Renders
 * nothing until it actually has a URL to encode, same "unconfigured →
 * blank" posture as `'image'`/`'transit'`.
 *
 * The embedded logo prefers a source's own real saved image (`getLogoSrc`;
 * only NRK has one today) and otherwise falls back to `buildSourceMark`'s
 * constructed square monogram badge — always square (see `LOGO_SIZE_FRACTION`)
 * so it excavates a fixed, predictable area of the code regardless of source.
 */
export function QrCodeSlide({ url, size, linkMode, newsSourceMode, linkedNewsSourceId, newsSlotOrdinal, newsSlots, showSourceLogo, useSourceTheme }: QrCodeSlideProps) {
  const isNewsMode = linkMode === 'news'
  const isAutomatic = isNewsMode && (newsSourceMode ?? 'automatic') === 'automatic'
  const isSpecific = isNewsMode && newsSourceMode === 'specific' && Boolean(linkedNewsSourceId)

  const [config] = useExtensionsConfig()
  const automaticSlot = isAutomatic ? newsSlots[(newsSlotOrdinal ?? 1) - 1] : undefined
  const automatic = useCurrentNewsHeadline(automaticSlot, config.news.enabledSourceIds)

  const { headlines: specificHeadlines } = useNewsHeadlines(isSpecific ? [linkedNewsSourceId!] : [], 1)
  const specificSource = isSpecific ? NEWS_SOURCES.find((candidate) => candidate.id === linkedNewsSourceId) : undefined

  const headline = isAutomatic ? automatic.headline : isSpecific ? specificHeadlines[0] : undefined
  const source = isAutomatic ? automatic.source : specificSource

  const targetUrl = isNewsMode ? headline?.link : url
  if (!targetUrl) return null

  const sizePercent = `${size ?? DEFAULT_QR_CODE_SIZE}%`
  const showLogo = isNewsMode && (showSourceLogo ?? true) && Boolean(source)
  const logoSize = QR_INTERNAL_SIZE * LOGO_SIZE_FRACTION
  const realLogoSrc = showLogo ? getLogoSrc(source!.logoSlug) : undefined
  const constructedMark = showLogo && !realLogoSrc ? buildSourceMark(source!, logoSize) : undefined
  const imageSettings =
    realLogoSrc || constructedMark ? { src: (realLogoSrc ?? constructedMark!.uri) as string, height: logoSize, width: logoSize, excavate: true } : undefined
  const branded = isNewsMode && (useSourceTheme ?? true) && Boolean(source)
  const brandStyle = branded ? ({ '--screen-bg': source!.brandColor, '--screen-text': '#ffffff', '--screen-text-muted': 'rgba(255, 255, 255, 0.75)' } as CSSProperties) : undefined

  return (
    <div className={`qr-code-slide${branded ? ' qr-code-slide--branded' : ''}`} style={brandStyle}>
      <QRCodeSVG
        value={targetUrl}
        bgColor="transparent"
        fgColor="currentColor"
        // 'H' (~30% tolerance) is required once a logo excavates the center — the
        // default 'L' (~7%) isn't enough and would produce an unscannable code.
        level={imageSettings ? 'H' : 'L'}
        imageSettings={imageSettings}
        className="qr-code-slide__code"
        style={{ width: sizePercent, height: sizePercent }}
      />
    </div>
  )
}
