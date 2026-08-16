import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { QrCodeSvg } from './QrCodeSvg'
import type { QrErrorCorrectionLevel } from './qrCodePath'
import { useCrossfadeSlot } from '../../hooks/useCrossfadeSlot'
import { useCurrentNewsHeadline, type NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useIntegrationsConfig } from '../../hooks/useIntegrationsConfig'
import { useNewsHeadlines } from '../../hooks/useNewsHeadlines'
import { NEWS_SOURCES } from '../../types/news'
import { DEFAULT_QR_CODE_SIZE } from '../../types/screen'
import { getLogoSrc } from '../../utils/logoAssets'
import { buildSourceMark } from '../../utils/newsSourceMark'
import { getScreenColorVars } from '../../utils/screenColors'
import './QrCodeSlide.scss'

/**
 * The embedded logo's own bounding box, as a fraction of the code's own side — both real logo images
 * and the constructed fallback mark are *contained* within a square this size, not stretched to fill
 * it (see `logoFractions`/`buildSourceMark`).
 *
 * The area it excavates is this squared: **4.84%**. That number is what picks the error-correction
 * level below — `'M'` corrects ~15%, a 3.1x margin over the damage actually done.
 */
const LOGO_SIZE_FRACTION = 0.22

/**
 * Weakest acceptable error correction for a code carrying an embedded logo.
 *
 * Was `'H'` (~30%) until 2026-08-16, on the reasoning that excavating the centre demanded the
 * strongest level available. Measurement showed that to be over-provisioned by roughly 6x: the logo
 * damages 4.84% of the symbol (see `LOGO_SIZE_FRACTION`) against H's 30% budget, and the density that
 * bought was not free — a QR pane was the most expensive pane kind on the kiosk, and dropping to `'M'`
 * removes **43-48%** of the modules for a typical news article URL.
 *
 * Fewer modules also means each one is ~32% physically larger at the same pane size, and module size
 * — not error-correction level — is what limits a phone camera reading a TV from across a room. So
 * this is expected to scan *better*, not worse, despite the lower level. `buildQrGeometry` still
 * upgrades beyond this for free whenever the chosen version has room (see its own doc comment), so
 * this is a floor rather than a fixed choice.
 */
const LOGO_MIN_LEVEL = 'M' as const

/** One slot's own frozen render input — snapshotted at the moment it becomes current (see `useCrossfadeSlot`), so a still-fading-out code never has its own pattern/logo replaced underneath it before its exit animation finishes. */
interface QrRenderSnapshot {
  targetUrl: string
  logoSrc: string | undefined
  /** Size of `logoSrc` as a fraction of the code's own side — see `QrCodeSvg`'s own props. */
  logoWidthFraction: number
  logoHeightFraction: number
  minLevel: QrErrorCorrectionLevel
}

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
  /** Only relevant while `newsSourceMode` is `'automatic'` — threaded straight through to `useCurrentNewsHeadline` so this stays in agreement with whatever headline the followed News pane is showing, whether that pane is stage-driven or on its own independent timer. See `NewsSlide`'s own prop of the same name. */
  stageTick?: number
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
 * constructed square monogram badge. Either way it's *contained* within a
 * `LOGO_SIZE_FRACTION` square, not stretched to fill it — a real logo image
 * keeps its own aspect ratio (see `realLogoDimensions`), the constructed
 * mark is simply square already.
 */
export function QrCodeSlide({ url, size, linkMode, newsSourceMode, linkedNewsSourceId, newsSlotOrdinal, newsSlots, stageTick, showSourceLogo, useSourceTheme }: QrCodeSlideProps) {
  const isNewsMode = linkMode === 'news'
  const isAutomatic = isNewsMode && (newsSourceMode ?? 'automatic') === 'automatic'
  const isSpecific = isNewsMode && newsSourceMode === 'specific' && Boolean(linkedNewsSourceId)

  const [config] = useIntegrationsConfig()
  const automaticSlot = isAutomatic ? newsSlots[(newsSlotOrdinal ?? 1) - 1] : undefined
  const automatic = useCurrentNewsHeadline(automaticSlot, config.news.enabledSourceIds, stageTick)

  const { headlines: specificHeadlines } = useNewsHeadlines(isSpecific ? [linkedNewsSourceId!] : [], 1)
  const specificSource = isSpecific ? NEWS_SOURCES.find((candidate) => candidate.id === linkedNewsSourceId) : undefined

  const headline = isAutomatic ? automatic.headline : isSpecific ? specificHeadlines[0] : undefined
  const source = isAutomatic ? automatic.source : specificSource

  const targetUrl = isNewsMode ? headline?.link : url

  const showLogo = isNewsMode && (showSourceLogo ?? true) && Boolean(source)
  // `qrLogoSlug` (when a source has one — currently just Klar Tale) is a
  // separate, simplified/more-square logo file saved specifically for this
  // small embedded footprint, distinct from `logoSlug`'s own on-screen
  // `NewsSourceMark` rendering.
  const realLogoSrc = showLogo ? getLogoSrc(source!.qrLogoSlug ?? source!.logoSlug) : undefined
  // No explicit size: the mark is a vector data URI drawn into a `LOGO_SIZE_FRACTION`-sized box in
  // *module* coordinates, so the pixel size it is authored at no longer matters (it did while
  // `qrcode.react` needed `imageSettings` in its own fixed 128-unit space).
  const constructedMark = showLogo && !realLogoSrc ? buildSourceMark(source!) : undefined
  // A real logo image is rarely square — contain-fit it within the
  // `logoSize` box using its own known aspect ratio instead of forcing both
  // dimensions to `logoSize`, which would stretch it out of shape. The
  // constructed fallback mark is always square already (see
  // `buildSourceMark`), so its own returned dimensions need no adjustment.
  const realLogoAspectRatio = source?.logoAspectRatio ?? 1
  /** Contain-fit within a `LOGO_SIZE_FRACTION` square, expressed as fractions of the code's own side. The constructed fallback mark is already square, so it fills the box on both axes. */
  const logoFractions =
    realLogoAspectRatio >= 1
      ? { width: LOGO_SIZE_FRACTION, height: LOGO_SIZE_FRACTION / realLogoAspectRatio }
      : { width: LOGO_SIZE_FRACTION * realLogoAspectRatio, height: LOGO_SIZE_FRACTION }
  const logoSrc = realLogoSrc ?? constructedMark?.uri

  const snapshot: QrRenderSnapshot | undefined = targetUrl
    ? {
        targetUrl,
        logoSrc,
        ...(realLogoSrc ? { logoWidthFraction: logoFractions.width, logoHeightFraction: logoFractions.height } : { logoWidthFraction: LOGO_SIZE_FRACTION, logoHeightFraction: LOGO_SIZE_FRACTION }),
        // A code with nothing excavated has no damage to correct for, so it stays at the weakest
        // level and the smallest symbol — see `LOGO_MIN_LEVEL` for the logo-bearing case.
        minLevel: logoSrc ? LOGO_MIN_LEVEL : 'L',
      }
    : undefined
  const { slots, activeSlot } = useCrossfadeSlot<QrRenderSnapshot>(snapshot, (item) => item.targetUrl)

  if (!targetUrl) return null

  const sizePercent = `${size ?? DEFAULT_QR_CODE_SIZE}%`
  const branded = isNewsMode && (useSourceTheme ?? true) && Boolean(source)
  // `getScreenColorVars` (not a hardcoded white) — same reasoning as
  // `NewsSlide`'s own brand styling. Also what keeps the code's own dark
  // modules (`fgColor="currentColor"`, reading `--screen-text` via
  // `.qr-code-slide`'s own `color`) actually scannable against a light
  // `brandColor` like Klar Tale's white — a hardcoded white text/module
  // color would have drawn an invisible white-on-white code.
  const brandStyle = branded ? (getScreenColorVars(source!.brandColor) as CSSProperties) : undefined

  return (
    <div className={`qr-code-slide${branded ? ' qr-code-slide--branded' : ''}`} style={brandStyle}>
      <div className="qr-code-slide__stack" style={{ width: sizePercent, height: sizePercent }}>
        {slots.map((slot, slotIndex) => {
          if (!slot) return null
          return (
            <motion.div
              key={slotIndex}
              className="qr-code-slide__slot"
              initial={{ opacity: 0 }}
              animate={{ opacity: activeSlot === slotIndex ? 1 : 0 }}
              transition={{ duration: 0.4 }}
            >
              <QrCodeSvg
                // Keyed by this slot's own URL, not left to reuse whatever
                // code (and embedded-logo `<image>`) this slot rendered last
                // time it was active — same reasoning as `NewsSlide`'s own
                // headline `<img>` key: reusing the same node and just
                // changing the logo `src` risks the *previous* logo staying
                // visibly painted until the new one finishes loading, rather
                // than the code simply re-rendering fresh.
                key={slot.targetUrl}
                value={slot.targetUrl}
                minLevel={slot.minLevel}
                logoSrc={slot.logoSrc}
                logoWidthFraction={slot.logoWidthFraction}
                logoHeightFraction={slot.logoHeightFraction}
                className="qr-code-slide__code"
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
