import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'

const isSupported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

/** Button to enter/exit fullscreen — browsers require a user gesture, so this can't happen automatically on load. Renders nothing if the Fullscreen API isn't available. */
export function FullscreenToggle() {
  const { t } = useLanguage()
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!isSupported) return

    const handleChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  if (!isSupported) return null

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  return (
    <button type="button" className="screen-toolbar__button" onClick={toggle}>
      {isFullscreen ? t('screenDisplay.exitFullscreen') : t('screenDisplay.enterFullscreen')}
    </button>
  )
}
