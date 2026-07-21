import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useCrossfadeSlot } from '../../hooks/useCrossfadeSlot'
import { useCurrentNewsHeadline, type NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useNewsHeadlines } from '../../hooks/useNewsHeadlines'
import { NEWS_SOURCES } from '../../types/news'
import { DEFAULT_QR_CODE_SIZE } from '../../types/screen'
import { getLogoSrc } from '../../utils/logoAssets'
import { buildSourceMark } from '../../utils/newsSourceMark'
import { getScreenColorVars } from '../../utils/screenColors'
import './QrCodeSlide.scss'

/** `qrcode.react`'s own internal default `size` (its SVG's coordinate/viewBox space) — this file never overrides that prop, relying on CSS `width`/`height` percentages for the actual rendered size instead, so `imageSettings`' pixel dimensions need to be proportioned against this fixed internal value, not the rendered one. */
const QR_INTERNAL_SIZE = 128
/** The embedded logo's own bounding box (both real logo images and the constructed fallback mark are *contained* within a square of this size, not stretched to fill it — see `realLogoDimensions`/`buildSourceMark`) — kept comfortably within `level="H"`'s ~30% error-correction tolerance once its modules are excavated. */
const LOGO_SIZE_FRACTION = 0.22

/** One slot's own frozen render input — snapshotted at the moment it becomes current (see `useCrossfadeSlot`), so a still-fading-out code never has its own pattern/logo replaced underneath it before its exit animation finishes. */
interface QrRenderSnapshot {
  targetUrl: string
  imageSettings: { src: string; height: number; width: number; excavate: boolean } | undefined
  level: 'H' | 'L'
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

  const [config] = useExtensionsConfig()
  const automaticSlot = isAutomatic ? newsSlots[(newsSlotOrdinal ?? 1) - 1] : undefined
  const automatic = useCurrentNewsHeadline(automaticSlot, config.news.enabledSourceIds, stageTick)

  const { headlines: specificHeadlines } = useNewsHeadlines(isSpecific ? [linkedNewsSourceId!] : [], 1)
  const specificSource = isSpecific ? NEWS_SOURCES.find((candidate) => candidate.id === linkedNewsSourceId) : undefined

  const headline = isAutomatic ? automatic.headline : isSpecific ? specificHeadlines[0] : undefined
  const source = isAutomatic ? automatic.source : specificSource

  const targetUrl = isNewsMode ? headline?.link : url

  const showLogo = isNewsMode && (showSourceLogo ?? true) && Boolean(source)
  const logoSize = QR_INTERNAL_SIZE * LOGO_SIZE_FRACTION
  // `qrLogoSlug` (when a source has one — currently just Klar Tale) is a
  // separate, simplified/more-square logo file saved specifically for this
  // small embedded footprint, distinct from `logoSlug`'s own on-screen
  // `NewsSourceMark` rendering.
  const realLogoSrc = showLogo ? getLogoSrc(source!.qrLogoSlug ?? source!.logoSlug) : undefined
  const constructedMark = showLogo && !realLogoSrc ? buildSourceMark(source!, logoSize) : undefined
  // A real logo image is rarely square — contain-fit it within the
  // `logoSize` box using its own known aspect ratio instead of forcing both
  // dimensions to `logoSize`, which would stretch it out of shape. The
  // constructed fallback mark is always square already (see
  // `buildSourceMark`), so its own returned dimensions need no adjustment.
  const realLogoAspectRatio = source?.logoAspectRatio ?? 1
  const realLogoDimensions =
    realLogoAspectRatio >= 1 ? { width: logoSize, height: logoSize / realLogoAspectRatio } : { width: logoSize * realLogoAspectRatio, height: logoSize }
  const imageSettings = realLogoSrc
    ? { src: realLogoSrc, ...realLogoDimensions, excavate: true }
    : constructedMark
      ? { src: constructedMark.uri, width: constructedMark.width, height: constructedMark.height, excavate: true }
      : undefined

  const snapshot: QrRenderSnapshot | undefined = targetUrl
    ? // 'H' (~30% tolerance) is required once a logo excavates the center —
      // the default 'L' (~7%) isn't enough and would produce an unscannable code.
      { targetUrl, imageSettings, level: imageSettings ? 'H' : 'L' }
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
              <QRCodeSVG
                // Keyed by this slot's own URL, not left to reuse whatever
                // `QRCodeSVG` (and, internally, whatever embedded-logo
                // `<image>`) this slot rendered last time it was active —
                // same reasoning as `NewsSlide`'s own headline `<img>` key:
                // reusing the same node and just changing `imageSettings.src`
                // risks the *previous* logo staying visibly painted until
                // the new one finishes loading, rather than the code simply
                // re-rendering fresh.
                key={slot.targetUrl}
                value={slot.targetUrl}
                bgColor="transparent"
                fgColor="currentColor"
                level={slot.level}
                imageSettings={slot.imageSettings}
                className="qr-code-slide__code"
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
