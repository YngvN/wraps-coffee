import type { CSSProperties } from 'react'
import type { NewsSource } from '../../types/news'
import { getLogoSrc } from '../../utils/logoAssets'
import './NewsSourceMark.scss'

interface NewsSourceMarkProps {
  source: NewsSource
  className?: string
}

/**
 * One news source's own small brand mark for on-screen display (`NewsSlide`'s
 * corner badge) — a real saved logo image when one exists (`NewsSource.logoSlug`;
 * only NRK has one today, its own public-domain wordmark), otherwise an
 * original, hand-styled text badge (`markText`/`markOnBrandBg`/`markShowDot`,
 * in the source's own `brandFontFamily`) rather than an approximation of
 * that source's real logo artwork. A source's own real file can be dropped
 * in under `integration-logos/<slug>.(svg|png)` later with no code change,
 * same as `FetchedLogo` elsewhere in this app.
 *
 * `QrCodeSlide`'s own embedded QR-code mark uses the separate
 * `buildSourceMark` SVG generator (`src/utils/newsSourceMark.ts`) instead
 * of this component, since `qrcode.react` needs a plain image `src`
 * string, not a live React tree.
 */
export function NewsSourceMark({ source, className }: NewsSourceMarkProps) {
  const realLogoSrc = getLogoSrc(source.logoSlug)
  if (realLogoSrc) {
    return <img src={realLogoSrc} alt={source.name} className={`news-source-mark news-source-mark--image${className ? ` ${className}` : ''}`} />
  }

  const style = {
    fontFamily: source.brandFontFamily,
    backgroundColor: source.markOnBrandBg ? source.brandColor : '#ffffff',
    color: source.markOnBrandBg ? '#ffffff' : source.brandColor,
    borderColor: source.markOnBrandBg ? 'transparent' : source.brandColor,
  } as CSSProperties

  return (
    <span className={`news-source-mark news-source-mark--text${className ? ` ${className}` : ''}`} style={style}>
      {source.markShowDot && <span className="news-source-mark__dot" style={{ backgroundColor: source.brandColor }} />}
      {source.markText}
    </span>
  )
}
