import { AnimatePresence, motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { useCurrentNewsHeadline } from '../../hooks/useCurrentNewsHeadline'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useLanguage } from '../../i18n'
import { NewsSourceMark } from './NewsSourceMark'
import './NewsSlide.scss'

interface NewsSlideProps {
  /** Which of `ExtensionsConfig['news']['enabledSourceIds']` to pull from — see `resolveNewsSourceIds`. */
  sourceIds?: string[]
  headlineCount?: number
  rotateSeconds?: number
  /** Overrides the pane's own background with whichever source the currently-shown headline is from. Falls back to `true`. */
  useBrandTheme?: boolean
  /** Shows the current headline's own source logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
  showBrandLogo?: boolean
}

/**
 * Fullscreen rendering of rotating RSS headlines from the cafe's configured
 * news sources (see the admin's Integrations tab), for a screen display's
 * `'news'` slot. Rotation is a *deterministic*, wall-clock-derived index
 * (see `useCurrentNewsHeadline`/`useDeterministicRotationIndex`) rather than
 * locally-incrementing state starting fresh at 0 per mount — this is what
 * lets a `'qrcode'` slide's own "automatic" mode (`QrCodeSlide`) resolve the
 * exact same "currently showing" headline this pane has, without either one
 * needing to read the other's live component state. Independent of the
 * screen's own shared stage rotation either way — same posture as
 * `MessageBoardSlide`'s own `'rotating'` display mode, since live external
 * headlines aren't admin-authored content to checkpoint per stage.
 * `useBrandTheme` swaps the pane's background/logo to match whichever
 * source the current headline came from, mirroring `WeatherSlide`/
 * `TransitSlide`'s own brand theming.
 */
export function NewsSlide({ sourceIds, headlineCount, rotateSeconds, useBrandTheme, showBrandLogo }: NewsSlideProps) {
  const { t } = useLanguage()
  const [config] = useExtensionsConfig()
  const { headline: currentHeadline, source } = useCurrentNewsHeadline({ sourceIds, headlineCount, rotateSeconds }, config.news.enabledSourceIds)

  if (!currentHeadline) {
    return (
      <div className="news-slide news-slide--empty">
        <p>{t('admin.screens.newsNoHeadlinesLabel')}</p>
      </div>
    )
  }

  const branded = (useBrandTheme ?? true) && Boolean(source)
  // Redefines the shared `--screen-*` custom properties (not just
  // `background`), same mechanism as `WeatherSlide`/`TransitSlide`'s own
  // fixed per-brand SCSS blocks — every existing rule that already reads
  // `var(--screen-text)` etc. picks up the swap automatically. Set inline
  // (not in `NewsSlide.scss`) since the color/font are data-driven across 7
  // sources rather than one or two fixed brands. `fontFamily` is what makes
  // the branded theme "look more professional" per-source — an editorial
  // serif/tabloid/plain-sans stack (see `NewsSource.brandFontFamily`)
  // instead of the app's own generic `$font-dashboard-sans` for every
  // source alike.
  const brandStyle = branded
    ? ({ '--screen-bg': source!.brandColor, '--screen-text': '#ffffff', '--screen-text-muted': 'rgba(255, 255, 255, 0.75)', fontFamily: source!.brandFontFamily } as CSSProperties)
    : undefined

  // Author + first category on one meta line — every field past title/link
  // is only as complete as the source's own feed provides (see
  // `NewsHeadline`'s own doc comment), so this only renders whatever's
  // actually there rather than reserving space for a fixed set of fields.
  const metaParts = [currentHeadline.author, currentHeadline.categories?.[0]].filter((part): part is string => Boolean(part))

  return (
    <div className={`news-slide${branded ? ' news-slide--branded' : ''}`} style={brandStyle}>
      {branded && (showBrandLogo ?? true) && <NewsSourceMark source={source!} className="news-slide__brand-logo" />}
      <AnimatePresence mode="wait">
        <motion.div key={currentHeadline.link} className="news-slide__content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          {currentHeadline.imageUrl && <img className="news-slide__image" src={currentHeadline.imageUrl} alt="" />}
          <h2 className="news-slide__headline">{currentHeadline.title}</h2>
          {currentHeadline.description && <p className="news-slide__description">{currentHeadline.description}</p>}
          {metaParts.length > 0 && <p className="news-slide__meta">{metaParts.join(' · ')}</p>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
