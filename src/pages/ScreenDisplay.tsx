import { useParams } from 'react-router-dom'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { SlideshowLayout } from '../features/screens/SlideshowLayout'
import { SplitLayout } from '../features/screens/SplitLayout'
import { useScreens } from '../hooks/useScreens'
import { useLanguage } from '../i18n'
import './ScreenDisplay.scss'

/**
 * Fullscreen kiosk display for a single configured screen, reached at
 * `/screens/:screenId`. No site chrome. Looks up the screen live via
 * `useScreens()`, so admin edits (or the screen being deleted) made in
 * another tab of the same browser are reflected here without a refresh.
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const [screens] = useScreens()
  const screen = screens.find((candidate) => candidate.screenID === screenId)

  if (!screen) {
    return (
      <div className="screen-display screen-display--not-found">
        <h1>{t('screenDisplay.notFound.title')}</h1>
        <p>{t('screenDisplay.notFound.message')}</p>
      </div>
    )
  }

  return (
    <div className="screen-display">
      <FullscreenToggle />
      {screen.layout === 'slideshow' ? <SlideshowLayout key={screen.screenID} screen={screen} /> : <SplitLayout key={screen.screenID} screen={screen} />}
    </div>
  )
}
