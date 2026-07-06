import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Badge, Button, Modal, TranslatedText } from '../../../components'
import { useEvents } from '../../../hooks/useEvents'
import { useLanguage } from '../../../i18n'
import type { EventRecord } from '../../../utils/events'
import { EventForm } from './EventForm'
import './EventsView.scss'

const STATUS_BADGE_VARIANT: Record<EventRecord['status'], 'success' | 'warning' | 'error'> = {
  scheduled: 'success',
  postponed: 'warning',
  cancelled: 'error',
}

/** Admin view for creating, editing and deleting events. Edits show up live on the public Events page, Home widget and calendar. */
export function EventsView() {
  const { t, language } = useLanguage()
  const [events, setEvents] = useEvents()
  const [editingEvent, setEditingEvent] = useState<EventRecord | null | undefined>(undefined)

  const isFormOpen = editingEvent !== undefined
  const closeForm = () => setEditingEvent(undefined)
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))

  const handleSave = (event: EventRecord) => {
    const exists = events.some((existing) => existing.eventID === event.eventID)
    setEvents(exists ? events.map((existing) => (existing.eventID === event.eventID ? event : existing)) : [...events, event])
    closeForm()
  }

  const handleDelete = (event: EventRecord) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setEvents(events.filter((existing) => existing.eventID !== event.eventID))
  }

  return (
    <div className="events-view">
      <div className="events-view__header">
        <TranslatedText as="h1" id="admin.events.title" />
        <Button onClick={() => setEditingEvent(null)}>{t('admin.events.addEvent')}</Button>
      </div>

      <ul className="events-view__list">
        <AnimatePresence initial={false}>
          {sortedEvents.map((event) => (
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
                <span className="events-view__item-date">
                  {event.date} · {event.time}
                </span>
                <Badge variant={STATUS_BADGE_VARIANT[event.status]}>{event.status}</Badge>
              </div>
              <div className="events-view__item-actions">
                <Button variant="secondary" onClick={() => setEditingEvent(event)}>
                  {t('admin.common.edit')}
                </Button>
                <Button variant="secondary" onClick={() => handleDelete(event)}>
                  {t('admin.common.delete')}
                </Button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Modal open={isFormOpen} onClose={closeForm} title={editingEvent ? t('admin.events.editEvent') : t('admin.events.addEvent')}>
        {isFormOpen && <EventForm event={editingEvent ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>
    </div>
  )
}
