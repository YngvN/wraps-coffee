import { useEffect, useState } from 'react'
import './ScreenSaver.scss'

function randomPosition(): { top: number; left: number } {
  return { top: 15 + Math.random() * 70, left: 15 + Math.random() * 70 }
}

interface ScreenSaverProps {
  /** The line that drifts around the screen, e.g. the store's name or "Trykk for å åpne". */
  text: string
  /** A second, smaller line under it, e.g. the time. */
  subtext?: string
}

/**
 * An idle screensaver: a solid black overlay over everything, with `text` drifting to a new random spot
 * every few seconds so nothing burns in. It shows nothing else, so no orders or sales are left on screen.
 * Whoever renders it decides when (usually `useIdleTimer`); any touch, click or key press resets that
 * timer, which takes it away. Used by the admin dashboard, the register and the staff order board.
 */
export function ScreenSaver({ text, subtext }: ScreenSaverProps) {
  const [position, setPosition] = useState(randomPosition)

  useEffect(() => {
    const interval = setInterval(() => setPosition(randomPosition()), 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="screen-saver" role="presentation">
      <div className="screen-saver__text" style={{ top: `${position.top}%`, left: `${position.left}%` }}>
        <span>{text}</span>
        {subtext && <small>{subtext}</small>}
      </div>
    </div>
  )
}
