import { useEffect, useState, type CSSProperties } from 'react'
import { useClockFormatPreference } from '../../hooks/useClockFormatPreference'
import { useDateFormatPreference } from '../../hooks/useDateFormatPreference'
import { useLanguage } from '../../i18n'
import { DEFAULT_TIME_FONT_SIZE, DEFAULT_TIME_UNITS, type TimeDateStyle, type TimeDisplayMode, type TimeUnit, type TimeWeekdayStyle } from '../../types/screen'
import { formatDate } from '../../utils/dateFormat'
import { getDateFormatOptions, getIsoWeekNumber, getTimeSegments } from '../../utils/timeFormat'
import './TimeSlide.scss'

interface TimeSlideProps {
  displayMode?: TimeDisplayMode
  units?: TimeUnit[]
  /** Only relevant when `displayMode` is `'time'` (or unset). Falls back to `true`. */
  blinkColon?: boolean
  dateStyle?: TimeDateStyle
  /** Only relevant when `displayMode` is `'date'`. Falls back to `false`. */
  showYear?: boolean
  weekdayStyle?: TimeWeekdayStyle
  fontSize?: number
}

/**
 * Fullscreen, centered rendering of a live clock, the full date, just the
 * weekday name, or the ISO week number, for a screen display's "time" slot.
 * Ticks every second regardless of `displayMode` — cheap, and keeps the
 * date/weekday/week modes correctly rolling over at midnight without their
 * own separate (coarser) timer.
 */
export function TimeSlide({ displayMode = 'time', units = DEFAULT_TIME_UNITS, blinkColon = true, dateStyle = 'long', showYear = false, weekdayStyle = 'long', fontSize }: TimeSlideProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const content =
    displayMode === 'date' ? (
      dateStyle === 'short' ? (
        formatDate(now, dateFormat, showYear)
      ) : (
        now.toLocaleDateString(language, getDateFormatOptions(dateStyle, showYear))
      )
    ) : displayMode === 'weekday' ? (
      now.toLocaleDateString(language, { weekday: weekdayStyle })
    ) : displayMode === 'weekNumber' ? (
      t('admin.screens.timeWeekNumberLabel', { number: getIsoWeekNumber(now) })
    ) : (
      // 'time' mode — each digit group is its own span so the colon between them can blink independently; a single-unit pane (e.g. just hours, for a split clock) has no colon to render at all.
      (() => {
        const { segments, dayPeriod } = getTimeSegments(now, language, clockFormat, units)
        return (
          <>
            {segments.map((segment, index) => (
              <span key={index}>
                {index > 0 && (
                  <span className={`time-slide__colon${blinkColon ? ' time-slide__colon--blink' : ''}`} aria-hidden="true">
                    :
                  </span>
                )}
                {segment}
              </span>
            ))}
            {dayPeriod && ` ${dayPeriod}`}
          </>
        )
      })()
    )

  return (
    <div className="time-slide" style={{ '--time-slide-font-size': `${fontSize ?? DEFAULT_TIME_FONT_SIZE}cqmin` } as CSSProperties}>
      <span>{content}</span>
    </div>
  )
}
