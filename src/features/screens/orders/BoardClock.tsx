import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useNow } from '../../../hooks/useNow'
import { useLanguage } from '../../../i18n'
import { formatClockTime } from '../../../utils/clockFormat'
import './BoardClock.scss'

/**
 * The current time at the top left of the staff board, in the app's own 12/24-hour setting. Its own
 * component with its own once-a-second tick, so only the clock re-renders every second — not the
 * whole board (whose card ages only need a 30-second tick).
 */
export function BoardClock() {
  const { language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const now = useNow(1000)
  return <time className="orders-board__clock">{formatClockTime(new Date(now), language, clockFormat)}</time>
}
