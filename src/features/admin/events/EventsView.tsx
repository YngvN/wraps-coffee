import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Badge, Button, EditDeleteButtons, Modal, TranslatedText } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useEvents } from '../../../hooks/useEvents'
import { useLanguage } from '../../../i18n'
import type { EventRecord } from '../../../types/event'
import { formatClockTime } from '../../../utils/clockFormat'
import { formatDate } from '../../../utils/dateFormat'
import { toDateTime } from '../../../utils/events'
import { EventForm } from './EventForm'
import './EventsView.scss'

const STATUS_BADGE_VARIANT: Record<EventRecord['status'], 'success' | 'warning' | 'error'> = {
  scheduled: 'success',
  postponed: 'warning',
  cancelled: 'error',
}

const STATUS_LABEL_KEY: Record<EventRecord['status'], string> = {
  scheduled: 'admin.events.statusScheduledLabel',
  postponed: 'admin.events.statusPostponedLabel',
  cancelled: 'admin.events.statusCancelledLabel',
}

/** Admin view for creating, editing and deleting events. Edits show up live on the public Events page, Home widget and calendar. */
export function EventsView() {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  const [events, setEvents] = useEvents()
  const [editingEvent, setEditingEvent] = useState<EventRecord | null | undefined>(undefined)

  const isFormOpen = editingEvent !== undefined
  const closeForm = () => setEditingEvent(undefined)
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const recurringEvents = sortedEvents.filter((event) => event.recurring)
  const otherEvents = sortedEvents.filter((event) => !event.recurring)

  const handleSave = (event: EventRecord) => {
    const exists = events.some((existing) => existing.eventID === event.eventID)
    setEvents(exists ? events.map((existing) => (existing.eventID === event.eventID ? event : existing)) : [...events, event])
    closeForm()
  }

  const handleDelete = (event: EventRecord) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setEvents(events.filter((existing) => existing.eventID !== event.eventID))
  }

  const renderEventItem = (event: EventRecord) => (
    <motion.li
      key={event.eventID}
      className="events-view__item"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <div className="events-view__item-info">
        <span className="events-view__item-title">{event.title[language]}</span>
        <div className="events-view__item-meta">
          <span className="events-view__item-date">
            {formatDate(toDateTime(event.date, event.time), dateFormat)} · {formatClockTime(toDateTime(event.date, event.time), language, clockFormat)}
          </span>
          <Badge variant={STATUS_BADGE_VARIANT[event.status]}>{t(STATUS_LABEL_KEY[event.status])}</Badge>
        </div>
      </div>
      <div className="events-view__item-actions">
        <EditDeleteButtons onEdit={() => setEditingEvent(event)} onDelete={() => handleDelete(event)} />
      </div>
    </motion.li>
  )

  return (
    <div className="events-view">
      <div className="events-view__header">
        <TranslatedText as="h1" id="admin.events.title" />
        <Button onClick={() => setEditingEvent(null)}>{t('admin.events.addEvent')}</Button>
      </div>
      <TranslatedText as="p" id="admin.events.description" className="admin-page-description" />

      {recurringEvents.length > 0 && (
        <div className="events-view__group">
          <h2 className="events-view__group-title">{t('admin.events.repeatingTitle')}</h2>
          <ul className="events-view__list">
            <AnimatePresence initial={false}>{recurringEvents.map(renderEventItem)}</AnimatePresence>
          </ul>
        </div>
      )}

      <ul className="events-view__list">
        <AnimatePresence initial={false}>{otherEvents.map(renderEventItem)}</AnimatePresence>
      </ul>

      <Modal open={isFormOpen} onClose={closeForm} title={editingEvent ? t('admin.events.editEvent') : t('admin.events.addEvent')}>
        {isFormOpen && <EventForm event={editingEvent ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>
    </div>
  )
}
