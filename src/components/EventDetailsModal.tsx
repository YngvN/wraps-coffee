import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from './Alert'
import { Badge } from './Badge'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { useLanguage } from '../i18n'
import { formatEventDate, getNextOccurrence, type EventRecord } from '../utils/events'
import './EventDetailsModal.scss'

interface EventDetailsModalProps {
  /** The event to show details for, or `null` to keep the modal closed. */
  event: EventRecord | null
  onClose: () => void
}

/** Step shown in the registration section of the modal. */
type RegistrationStep = 'signUp' | 'form' | 'submitted'

/**
 * Modal showing the full details of a cafe event: image, date/time,
 * description, price, capacity, registration sign-up form and a preview
 * of the menu items served at the event.
 */
export function EventDetailsModal({ event, onClose }: EventDetailsModalProps) {
  const { t, language } = useLanguage()
  const occursAt = event ? getNextOccurrence(event) : null
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>('signUp')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  // Reset the sign-up form whenever a different event is shown.
  useEffect(() => {
    setRegistrationStep('signUp')
    setName('')
    setEmail('')
  }, [event?.eventID])

  const handleSignUpSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()
    setRegistrationStep('submitted')
  }

  return (
    <Modal open={event !== null} onClose={onClose} title={event?.title}>
      {event && (
        <div className="event-details">
          <img className="event-details__image" src={event.imageUrl} alt="" />

          {occursAt && (
            <p className="event-details__datetime">
              {formatEventDate(occursAt, language, { weekday: 'long', day: 'numeric', month: 'long' })} · {event.time}–{event.endTime}
              {event.status === 'postponed' && <Badge variant="warning">{t('events.modal.postponed')}</Badge>}
            </p>
          )}

          <p className="event-details__description">{event.description}</p>

          <dl className="event-details__facts">
            <div>
              <dt>{t('events.modal.price')}</dt>
              <dd>{event.price === 0 ? t('events.modal.free') : t('menu.price', { price: event.price })}</dd>
            </div>
            <div>
              <dt>{t('events.modal.capacity')}</dt>
              <dd>{t('events.modal.spotsFilled', { count: event.attendeesCount, capacity: event.capacity })}</dd>
            </div>
          </dl>

          {event.registrationRequired && (
            <div className="event-details__registration">
              <p>{t('events.modal.registrationRequired')}</p>

              {registrationStep === 'signUp' && (
                <Button type="button" onClick={() => setRegistrationStep('form')}>
                  {t('events.modal.signUp')}
                </Button>
              )}

              {registrationStep === 'form' && (
                <form className="event-details__signup-form" onSubmit={handleSignUpSubmit}>
                  <Input
                    id={`signup-name-${event.eventID}`}
                    label={t('events.modal.nameLabel')}
                    value={name}
                    onChange={(changeEvent) => setName(changeEvent.target.value)}
                    required
                  />
                  <Input
                    id={`signup-email-${event.eventID}`}
                    label={t('events.modal.emailLabel')}
                    type="email"
                    value={email}
                    onChange={(changeEvent) => setEmail(changeEvent.target.value)}
                    required
                  />
                  <Button type="submit">{t('events.modal.submit')}</Button>
                </form>
              )}

              {registrationStep === 'submitted' && <Alert variant="success">{t('events.modal.signUpSuccess')}</Alert>}
            </div>
          )}

          <div className="event-details__menu">
            <h4>{t('events.modal.menuHighlights')}</h4>
            <ul>
              {event.menuItems.map((item) => (
                <li key={item.itemID}>
                  <span>{item.name}</span>
                  <span>{t('menu.price', { price: item.price })}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
