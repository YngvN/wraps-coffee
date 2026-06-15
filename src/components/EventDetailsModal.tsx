import { motion } from 'framer-motion'
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
 *
 * When registration is required and the visitor clicks "Sign up", the price,
 * capacity and menu highlights fade out to the left while the sign-up form
 * fades in from the right. A "Back" button in the form reverses this
 * transition. The modal animates its height smoothly between these steps.
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

          {/* Both steps stay mounted and share a CSS grid cell (see
              .event-details__steps), so the container's height is always the
              max of the two and never jumps when switching between them. The
              hidden step is faded/slid out of view and marked `inert` so it
              can't be focused or interacted with. */}
          <div className="event-details__steps">
            <motion.div
              className="event-details__step"
              initial={false}
              animate={registrationStep === 'signUp' ? { opacity: 1, x: 0 } : { opacity: 0, x: -60 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              inert={registrationStep !== 'signUp'}
            >
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
                  <Button type="button" onClick={() => setRegistrationStep('form')}>
                    {t('events.modal.signUp')}
                  </Button>
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
            </motion.div>

            {event.registrationRequired && (
              <motion.div
                className="event-details__step"
                initial={false}
                animate={registrationStep !== 'signUp' ? { opacity: 1, x: 0 } : { opacity: 0, x: 60 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                inert={registrationStep === 'signUp'}
              >
                <div className="event-details__steps">
                  <motion.form
                    className="event-details__step event-details__signup-form"
                    onSubmit={handleSignUpSubmit}
                    initial={false}
                    animate={{ opacity: registrationStep === 'form' ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    inert={registrationStep !== 'form'}
                  >
                    <button type="button" className="event-details__back" onClick={() => setRegistrationStep('signUp')}>
                      ← {t('events.modal.back')}
                    </button>
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
                  </motion.form>

                  <motion.div
                    className="event-details__step"
                    initial={false}
                    animate={{ opacity: registrationStep === 'submitted' ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    inert={registrationStep !== 'submitted'}
                  >
                    <Alert variant="success">{t('events.modal.signUpSuccess')}</Alert>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
