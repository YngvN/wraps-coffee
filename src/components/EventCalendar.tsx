import { useMemo, useState } from 'react'
import { useLanguage } from '../i18n'
import { addDays, getMonthGrid, getWeekDays, isSameDay, startOfDay, startOfWeek } from '../utils/calendar'
import { formatEventDate, getOccurrencesInRange, type EventRecord, type UpcomingEvent } from '../utils/events'
import './EventCalendar.scss'

interface EventCalendarProps {
  /** All events to plot on the calendar; occurrences outside the visible range are ignored. */
  events: EventRecord[]
  /** Called when an event entry is clicked, to open its details. */
  onSelectEvent: (event: EventRecord) => void
  className?: string
}

type CalendarView = 'month' | 'week'

/** Maximum event entries shown per day in month view before collapsing into a "+N more" label. */
const MAX_VISIBLE_PER_MONTH_DAY = 3

/** Groups `occurrences` by calendar day, keyed by that day's `startOfDay` ISO string. */
function groupByDay(occurrences: UpcomingEvent[]): Map<string, UpcomingEvent[]> {
  const map = new Map<string, UpcomingEvent[]>()
  for (const occurrence of occurrences) {
    const key = startOfDay(occurrence.occursAt).toISOString()
    const list = map.get(key)
    if (list) list.push(occurrence)
    else map.set(key, [occurrence])
  }
  return map
}

/**
 * Calendar of upcoming and recurring cafe events, switchable between a
 * month grid and a single-week view. Each day shows the titles of the
 * events occurring on it; clicking one opens its details via
 * `onSelectEvent`. Recurring events (e.g. a weekly quiz night) are expanded
 * into every matching occurrence within the visible range.
 */
export function EventCalendar({ events, onSelectEvent, className }: EventCalendarProps) {
  const { t, language } = useLanguage()
  const [view, setView] = useState<CalendarView>('month')
  const [referenceDate, setReferenceDate] = useState(() => startOfDay(new Date()))
  const today = startOfDay(new Date())

  const days = useMemo(
    () => (view === 'month' ? getMonthGrid(referenceDate) : getWeekDays(startOfWeek(referenceDate))),
    [view, referenceDate],
  )

  const occurrencesByDay = useMemo(() => {
    const rangeStart = days[0]
    const rangeEnd = addDays(days[days.length - 1], 1)
    return groupByDay(getOccurrencesInRange(events, rangeStart, rangeEnd))
  }, [events, days])

  const weekdayLabels = useMemo(
    () => getWeekDays(startOfWeek(referenceDate)).map((day) => formatEventDate(day, language, { weekday: 'short' })),
    [referenceDate, language],
  )

  const label =
    view === 'month'
      ? formatEventDate(referenceDate, language, { month: 'long', year: 'numeric' })
      : `${formatEventDate(days[0], language, { day: 'numeric', month: 'short' })} – ${formatEventDate(days[6], language, { day: 'numeric', month: 'short', year: 'numeric' })}`

  const goToPrevious = () => {
    setReferenceDate((current) => (view === 'month' ? new Date(current.getFullYear(), current.getMonth() - 1, 1) : addDays(current, -7)))
  }

  const goToNext = () => {
    setReferenceDate((current) => (view === 'month' ? new Date(current.getFullYear(), current.getMonth() + 1, 1) : addDays(current, 7)))
  }

  return (
    <div className={['event-calendar', className].filter(Boolean).join(' ')}>
      <div className="event-calendar__toolbar">
        <div className="event-calendar__nav">
          <button type="button" className="event-calendar__nav-btn" onClick={goToPrevious} aria-label={t('events.calendar.previous')}>
            ‹
          </button>
          <h2 className="event-calendar__label">{label}</h2>
          <button type="button" className="event-calendar__nav-btn" onClick={goToNext} aria-label={t('events.calendar.next')}>
            ›
          </button>
        </div>
        <div className="event-calendar__controls">
          <button type="button" className="event-calendar__today-btn" onClick={() => setReferenceDate(today)}>
            {t('events.calendar.today')}
          </button>
          <div className="event-calendar__view-toggle" role="group" aria-label={t('events.calendar.viewLabel')}>
            <button
              type="button"
              className={`event-calendar__view-btn${view === 'week' ? ' event-calendar__view-btn--active' : ''}`}
              onClick={() => setView('week')}
            >
              {t('events.calendar.week')}
            </button>
            <button
              type="button"
              className={`event-calendar__view-btn${view === 'month' ? ' event-calendar__view-btn--active' : ''}`}
              onClick={() => setView('month')}
            >
              {t('events.calendar.month')}
            </button>
          </div>
        </div>
      </div>

      <div className="event-calendar__weekdays">
        {weekdayLabels.map((weekdayLabel) => (
          <span key={weekdayLabel}>{weekdayLabel}</span>
        ))}
      </div>

      <div className={`event-calendar__grid event-calendar__grid--${view}`}>
        {days.map((day) => {
          const dayOccurrences = occurrencesByDay.get(startOfDay(day).toISOString()) ?? []
          const visible = view === 'month' ? dayOccurrences.slice(0, MAX_VISIBLE_PER_MONTH_DAY) : dayOccurrences
          const overflowCount = dayOccurrences.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={[
                'event-calendar__day',
                view === 'month' && day.getMonth() !== referenceDate.getMonth() && 'event-calendar__day--outside',
                isSameDay(day, today) && 'event-calendar__day--today',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="event-calendar__day-number">{day.getDate()}</span>
              <div className="event-calendar__events">
                {visible.map(({ event, occursAt }) => (
                  <button
                    key={`${event.eventID}-${occursAt.toISOString()}`}
                    type="button"
                    className={`event-calendar__event event-calendar__event--${event.status}`}
                    onClick={() => onSelectEvent(event)}
                  >
                    {view === 'week' && <span className="event-calendar__event-time">{event.time}</span>}
                    <span className="event-calendar__event-title">{event.title[language]}</span>
                  </button>
                ))}
                {overflowCount > 0 && <span className="event-calendar__more">{t('events.calendar.more', { count: overflowCount })}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
