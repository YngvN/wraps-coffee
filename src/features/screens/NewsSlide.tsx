import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { useCrossfadeSlot } from '../../hooks/useCrossfadeSlot'
import { useCurrentNewsHeadline } from '../../hooks/useCurrentNewsHeadline'
import { useIntegrationsConfig } from '../../hooks/useIntegrationsConfig'
import { useLanguage } from '../../i18n'
import { newsImageProxyUrl } from '../../lib/localServer'
import type { NewsHeadline, NewsSource } from '../../types/news'
import { getScreenColorVars } from '../../utils/screenColors'
import { NewsSourceMark } from './NewsSourceMark'
import './NewsSlide.scss'

/** One slot's own frozen content — snapshotted at the moment it becomes current, so a still-fading-out slot never has its own font/text change underneath it (see `useCrossfadeSlot`'s own doc comment). */
interface NewsContentSnapshot {
  headline: NewsHeadline
  source: NewsSource | undefined
}

/**
 * A cheap, deterministic pseudo-random bit derived from `text` — same input
 * always gives the same output, unlike `Math.random()`, which would flip
 * on every re-render (this component's own snapshot object is a fresh
 * literal each time) rather than staying put for as long as the same
 * headline is showing and only "re-rolling" once the headline actually
 * changes. Drives which side `.news-slide__image` lands on in the
 * landscape/side-by-side layout (see `NewsSlide.scss`'s own `@container`
 * rule) — keyed off the headline's own `link`, so it varies headline to
 * headline without needing any state of its own.
 */
function stableRandomBit(text: string): boolean {
  let hash = 0
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return (hash & 1) === 0
}

interface NewsSlideProps {
  /** Which of `IntegrationsConfig['news']['enabledSourceIds']` to pull from — see `resolveNewsSourceIds`. */
  sourceIds?: string[]
  headlineCount?: number
  rotateSeconds?: number
  /** Overrides the pane's own background with whichever source the currently-shown headline is from. Falls back to `true`. */
  useBrandTheme?: boolean
  /** Shows the current headline's own source logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
  showBrandLogo?: boolean
  /** Drives headline rotation from the screen's own shared stage advances instead of `rotateSeconds`' own independent timer, for any screen that actually has more than one stage — `undefined` (no steps at all) falls back to that independent timer. See `useCurrentNewsHeadline`'s own doc comment. */
  stageTick?: number
}

/**
 * Fullscreen rendering of rotating RSS headlines from the cafe's configured
 * news sources (see the admin's Integrations tab), for a screen display's
 * `'news'` slot. Rotation advances with the screen's own shared stage
 * sequence when it has more than one stage (`stageTick`), or otherwise a
 * *deterministic*, wall-clock-derived index (see
 * `useCurrentNewsHeadline`/`useDeterministicRotationIndex`) rather than
 * locally-incrementing state starting fresh at 0 per mount — either way,
 * this is what lets a `'qrcode'` slide's own "automatic" mode
 * (`QrCodeSlide`) resolve the exact same "currently showing" headline this
 * pane has, without either one needing to read the other's live component
 * state. `useBrandTheme` swaps the pane's background/logo to match
 * whichever source the current headline came from, mirroring
 * `WeatherSlide`/`TransitSlide`'s own brand theming.
 */
export function NewsSlide({ sourceIds, headlineCount, rotateSeconds, useBrandTheme, showBrandLogo, stageTick }: NewsSlideProps) {
  const { t } = useLanguage()
  const [config] = useIntegrationsConfig()
  const { headline: currentHeadline, source } = useCurrentNewsHeadline({ sourceIds, headlineCount, rotateSeconds }, config.news.enabledSourceIds, stageTick)
  const { slots, activeSlot } = useCrossfadeSlot<NewsContentSnapshot>(
    currentHeadline ? { headline: currentHeadline, source } : undefined,
    (item) => item.headline.link,
  )

  if (!currentHeadline) {
    return (
      <div className="news-slide news-slide--empty">
        <p>{t('admin.screens.newsNoHeadlinesLabel')}</p>
      </div>
    )
  }

  const branded = (useBrandTheme ?? true) && Boolean(source)
  // Redefines the shared `--screen-*` custom properties (not just
  // `background`) — same mechanism as `WeatherSlide`/`TransitSlide`'s own
  // fixed per-brand SCSS blocks, every existing rule that already reads
  // `var(--screen-text)` etc. picks up the swap automatically. Deliberately
  // stays live/immediate on this always-mounted outer element rather than
  // being part of either content slot's own frozen snapshot below — the
  // pane's own background is meant to switch the instant the current
  // source changes, unlike the *content* (see `fontFamily`'s own comment
  // in the per-slot rendering below, which is what actually needed to stop
  // updating early). `getScreenColorVars` (not a hardcoded white) is what
  // keeps this readable across sources whose own `brandColor` isn't
  // uniformly dark — e.g. Klar Tale's own white background needs black
  // text, not the white that every other (dark/saturated) source's own
  // background wants.
  const brandStyle = branded ? (getScreenColorVars(source!.brandColor) as CSSProperties) : undefined
  // Same `stableRandomBit` the active content slot below computes for its
  // own `currentHeadline.link` (they always agree, since the active slot
  // is kept in sync with this exact headline) — the corner logo sits on
  // the *same* side as wherever the image lands, not the text: in a
  // two-column row the "other side" from the image always *is* the text
  // column, so putting the logo there would sit right on top of the
  // headline itself instead. Landing it on the image's own side instead
  // relies on that image variant's own backing chip/z-index (see
  // `NewsSlide.scss`) to stay legible over the photo, same as always.
  const imageOnRight = stableRandomBit(currentHeadline.link)

  return (
    <div className={`news-slide${branded ? ' news-slide--branded' : ''}`} style={brandStyle}>
      {branded && (showBrandLogo ?? true) && (
        <NewsSourceMark source={source!} className={`news-slide__brand-logo${imageOnRight ? ' news-slide__brand-logo--right' : ''}`} />
      )}
      {slots.map((snapshot, slotIndex) => {
        if (!snapshot) return null
        const slotBranded = (useBrandTheme ?? true) && Boolean(snapshot.source)
        // `fontFamily` lives on *this* slot's own snapshot, not the always-
        // live ancestor above — a still-fading-out slot keeps whichever
        // source's font it was showing until it's actually reused for a
        // future headline, instead of snapping to the new source's font the
        // instant `source` (above) changes while this slot is mid-exit.
        const slotStyle = slotBranded ? ({ fontFamily: snapshot.source!.brandFontFamily } as CSSProperties) : undefined
        // Author + first category on one meta line — every field past
        // title/link is only as complete as the source's own feed provides
        // (see `NewsHeadline`'s own doc comment), so this only renders
        // whatever's actually there rather than reserving space for a fixed
        // set of fields.
        const metaParts = [snapshot.headline.author, snapshot.headline.categories?.[0]].filter((part): part is string => Boolean(part))
        const imageOnRight = stableRandomBit(snapshot.headline.link)
        return (
          <motion.div
            key={slotIndex}
            className={`news-slide__content${imageOnRight ? ' news-slide__content--image-right' : ''}`}
            style={slotStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: activeSlot === slotIndex ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            {snapshot.headline.imageUrl && (
              <img
                // Keyed by the headline itself, not left to reuse whatever
                // `<img>` DOM node this slot rendered last time it was
                // active — reusing the same node and just changing `src`
                // leaves the *previous* headline's image visibly painted
                // (browsers keep showing an `<img>`'s old bitmap until the
                // new one finishes loading/decoding) for however long that
                // takes, which was showing through as "the old image is
                // still there" once this slot faded back in for a new
                // headline. A fresh `key` forces a genuinely new element —
                // blank until loaded rather than stale — and since this
                // happens while the slot is still hidden (`opacity: 0`,
                // not yet the active one), that load has the run-up until
                // the *other* slot's own `rotateSeconds` elapses to finish
                // before it's ever actually revealed.
                key={snapshot.headline.link}
                className="news-slide__image"
                src={newsImageProxyUrl(snapshot.headline.imageUrl)}
                alt=""
                onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = snapshot.headline.imageUrl! }}
              />
            )}
            <div className="news-slide__text">
              <h2 className="news-slide__headline">{snapshot.headline.title}</h2>
              {snapshot.headline.description && <p className="news-slide__description">{snapshot.headline.description}</p>}
              {metaParts.length > 0 && <p className="news-slide__meta">{metaParts.join(' · ')}</p>}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
