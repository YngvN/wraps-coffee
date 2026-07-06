import type { ReactNode } from 'react'
import { useIdleVisibility } from './useIdleVisibility'
import './ScreenToolbar.scss'

/** Milliseconds of no pointer/touch activity before the toolbar fades out. */
const HIDE_DELAY = 3000

interface ScreenToolbarProps {
  children: ReactNode
}

/** Fixed corner container for the screen display's controls (fullscreen toggle, edit button), fading out together after inactivity. */
export function ScreenToolbar({ children }: ScreenToolbarProps) {
  const isVisible = useIdleVisibility(HIDE_DELAY)

  return <div className={`screen-toolbar${isVisible ? '' : ' screen-toolbar--hidden'}`}>{children}</div>
}
