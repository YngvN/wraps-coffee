import type { CSSProperties } from 'react'
import { useLanguage } from '../../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type ScreenConfig } from '../../../types/screen'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { getScreenColorVars } from '../../../utils/screenColors'
import { ScaledScreenPreview } from '../../screens/ScaledScreenPreview'
import './DisplayScreenPreview.scss'

interface DisplayScreenPreviewProps {
  /** The screen this display is actually showing — `null` for the standby screensaver (see `resolveDisplayedScreen`). */
  screen: ScreenConfig | null
  /**
   * Dims the whole tile. Set when the display isn't currently online: a
   * crisp, confident thumbnail next to a red connection dot claims the
   * display is showing something it demonstrably is not.
   */
  dimmed?: boolean
  className?: string
}

/**
 * A miniature of what one display is putting on screen, letterboxed into
 * whatever fixed-size box its parent gives it.
 *
 * Deliberately renders only the **static screenshot** (`screen.previewImages`,
 * regenerated on every screen save by `screenPreviewCapture.ts`) and never
 * falls back to a live `SplitLayout` the way `ScreenCard` does. `ScreenCard`'s
 * own doc comment records why: a live render per card runs its own clocks,
 * polling and video playback, which is what made screenshots necessary
 * there in the first place. The Displays grid can hold an entire fleet, so
 * it takes the cheap path unconditionally and shows a labelled placeholder
 * when no screenshot exists yet — self-healing the next time that screen is
 * saved.
 */
export function DisplayScreenPreview({ screen, dimmed, className }: DisplayScreenPreviewProps) {
  const { t } = useLanguage()
  const previewImage = screen?.previewImages?.[0]
  const classes = ['display-screen-preview', dimmed && 'display-screen-preview--dimmed', className].filter(Boolean).join(' ')

  if (!screen) {
    return (
      <div className={`${classes} display-screen-preview--standby`}>
        <span className="display-screen-preview__placeholder">{t('admin.displayManager.previewStandby')}</span>
      </div>
    )
  }

  return (
    <div className={classes} style={getScreenColorVars(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
      {previewImage ? (
        <ScaledScreenPreview aspectRatio={screen.previewAspectRatio} fit="contain">
          <img className="display-screen-preview__image" src={getThumbnailUrl(previewImage)} alt="" />
        </ScaledScreenPreview>
      ) : (
        <span className="display-screen-preview__placeholder">{t('admin.displayManager.previewUnavailable')}</span>
      )}
    </div>
  )
}
