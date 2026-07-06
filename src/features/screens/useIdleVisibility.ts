import { useEffect, useRef, useState } from 'react'

/** Tracks whether the pointer/touch has been active within `delayMs`, for auto-hiding kiosk display controls. */
export function useIdleVisibility(delayMs: number): boolean {
  const [isVisible, setIsVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scheduleHide = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsVisible(false), delayMs)
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
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [delayMs])

  return isVisible
}
