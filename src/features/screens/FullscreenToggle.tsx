import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n'
import './FullscreenToggle.scss'

const isSupported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

/** Milliseconds of no pointer/touch activity before the button fades out. */
const HIDE_DELAY = 3000

/**
 * Small corner button to enter/exit fullscreen — browsers require a user
 * gesture, so this can't happen automatically on load. Renders nothing if
 * the Fullscreen API isn't available. Auto-hides after a few seconds of no
 * mouse movement/touch (kiosk-friendly), reappearing on the next activity.
 */
export function FullscreenToggle() {
  const { t } = useLanguage()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isSupported) return

    const handleChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  useEffect(() => {
    if (!isSupported) return

    const scheduleHide = () => {
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setIsVisible(false), HIDE_DELAY)
    }

    const handleActivity = () => {
      setIsVisible(true)
      scheduleHide()
    }

    scheduleHide()
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    }
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
    <button type="button" className={`fullscreen-toggle${isVisible ? '' : ' fullscreen-toggle--hidden'}`} onClick={toggle}>
      {isFullscreen ? t('screenDisplay.exitFullscreen') : t('screenDisplay.enterFullscreen')}
    </button>
  )
}
