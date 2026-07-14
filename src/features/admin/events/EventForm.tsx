import { useState, type FormEvent } from 'react'
import { Button, Checkbox, ImageUploadField, Input, LanguageTabs, Textarea } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { EventRecord } from '../../../types/event'
import { initialActiveLanguages } from '../../../utils/bilingual'
import './EventForm.scss'

interface EventFormProps {
  /** The event being edited, or `null` when creating a new one. */
  event: EventRecord | null
  onSave: (event: EventRecord) => void
  onCancel: () => void
}

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Create/edit form for a single event: bilingual title/description (one
 * language shown at a time, via `LanguageTabs` — same pattern as the
 * Products forms), location, schedule, capacity/price, a simple
 * weekly-recurrence toggle and status. Setting status to "Postponed" reveals
 * its own new date/start/end time fields (`postponedDetails`) — required for
 * the event to actually have a valid upcoming occurrence to show on screens
 * at all (see `getNextOccurrence`); leaving them unset silently drops the
 * event from every screen once its original date passes. Advanced fields
 * (participants, contact person, menu highlights, tags, exceptions) aren't
 * exposed here — they're preserved unchanged on edit and default to empty on
 * create.
 */
export function EventForm({ event, onSave, onCancel }: EventFormProps) {
  const { t } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const [title, setTitle] = useState(event?.title ?? { en: '', no: '' })
  const [description, setDescription] = useState(event?.description ?? { en: '', no: '' })
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    initialActiveLanguages(defaultPaneLanguage, [event?.title, event?.description], availableLanguages.map((language) => language.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultPaneLanguage)
  const [category, setCategory] = useState(event?.category ?? '')
  const [date, setDate] = useState(event?.date ?? '')
  const [time, setTime] = useState(event?.time ?? '')
  const [endTime, setEndTime] = useState(event?.endTime ?? '')
  const [locationAddress, setLocationAddress] = useState(event?.location.address ?? '')
  const [capacity, setCapacity] = useState(event?.capacity ?? 0)
  const [price, setPrice] = useState(event?.price ?? 0)
  const [repeatsWeekly, setRepeatsWeekly] = useState(event?.recurring ?? false)
  const [dayOfWeek, setDayOfWeek] = useState(event?.recurrence?.dayOfWeek ?? 0)
  const [status, setStatus] = useState<EventRecord['status']>(event?.status ?? 'scheduled')
  const [postponedNewDate, setPostponedNewDate] = useState(event?.postponedDetails?.newDate ?? '')
  const [postponedNewTime, setPostponedNewTime] = useState(event?.postponedDetails?.newTime ?? '')
  const [postponedNewEndTime, setPostponedNewEndTime] = useState(event?.postponedDetails?.newEndTime ?? '')
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? '')

  const addLanguage = (language: LanguageCode) => {
    setActiveLanguages([...activeLanguages, language])
    setSelectedLanguage(language)
  }

  const handleSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()

    onSave({
      ...event,
      eventID: event?.eventID ?? `${Date.now()}`,
      title,
      category,
      date,
      time,
      endTime,
      recurring: repeatsWeekly,
      recurrence: repeatsWeekly ? { frequency: 'weekly', dayOfWeek } : null,
      exceptions: event?.exceptions,
      location: { name: event?.location.name ?? { en: 'Wraps & Coffee', no: 'Wraps & Coffee' }, address: locationAddress },
      description,
      capacity,
      attendeesCount: event?.attendeesCount ?? 0,
      price,
      currency: event?.currency ?? 'NOK',
      tags: event?.tags ?? [],
      participants: event?.participants,
      contactPerson: event?.contactPerson,
      menuItems: event?.menuItems ?? [],
      status,
      postponedDetails: { newDate: postponedNewDate || null, newTime: postponedNewTime || null, newEndTime: postponedNewEndTime || null },
      imageUrl,
      registrationRequired: event?.registrationRequired ?? false,
    })
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <LanguageTabs activeLanguages={activeLanguages} selected={selectedLanguage} onSelect={setSelectedLanguage} onAddLanguage={addLanguage} addLabelKey="admin.common.addLanguage">
        <Input
          id="event-title"
          label={t('admin.events.titleLabel')}
          value={title[selectedLanguage]}
          onChange={(e) => setTitle({ ...title, [selectedLanguage]: e.target.value })}
          required={selectedLanguage === defaultPaneLanguage}
        />

        <Textarea
          id="event-description"
          label={t('admin.events.descriptionLabel')}
          value={description[selectedLanguage]}
          onChange={(e) => setDescription({ ...description, [selectedLanguage]: e.target.value })}
        />
      </LanguageTabs>

      <Input id="event-category" label={t('admin.events.categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value)} required />

      <div className="event-form__row">
        <Input id="event-date" label={t('admin.events.dateLabel')} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input id="event-time" label={t('admin.events.timeLabel')} type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        <Input id="event-end-time" label={t('admin.events.endTimeLabel')} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
      </div>

      <Input
        id="event-location-address"
        label={t('admin.events.locationAddressLabel')}
        value={locationAddress}
        onChange={(e) => setLocationAddress(e.target.value)}
        required
      />

      <div className="event-form__row">
        <Input
          id="event-capacity"
          label={t('admin.events.capacityLabel')}
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
        <Input id="event-price" label={t('admin.events.priceLabel')} type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        <ImageUploadField id="event-image-url" value={imageUrl} onChange={setImageUrl} />
      </div>

      <div className="event-form__recurrence">
        <Checkbox
          id="event-repeats-weekly"
          label={t('admin.events.repeatsWeeklyLabel')}
          checked={repeatsWeekly}
          onChange={(e) => setRepeatsWeekly(e.target.checked)}
        />
        {repeatsWeekly && (
          <label className="event-form__day-select">
            <span>{t('admin.events.dayOfWeekLabel')}</span>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {WEEKDAY_KEYS.map((key, index) => (
                <option key={key} value={index}>
                  {t(`footer.hours.${key}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="event-form__field">
        <span>{t('admin.events.statusLabel')}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as EventRecord['status'])}>
          <option value="scheduled">{t('admin.events.statusScheduledLabel')}</option>
          <option value="postponed">{t('admin.events.statusPostponedLabel')}</option>
          <option value="cancelled">{t('admin.events.statusCancelledLabel')}</option>
        </select>
      </label>

      {status === 'postponed' && (
        <div className="event-form__postponed">
          <p className="event-form__postponed-hint">{t('admin.events.postponedHint')}</p>
          <div className="event-form__row">
            <Input id="event-postponed-date" label={t('admin.events.postponedNewDateLabel')} type="date" value={postponedNewDate} onChange={(e) => setPostponedNewDate(e.target.value)} />
            <Input id="event-postponed-time" label={t('admin.events.postponedNewTimeLabel')} type="time" value={postponedNewTime} onChange={(e) => setPostponedNewTime(e.target.value)} />
            <Input
              id="event-postponed-end-time"
              label={t('admin.events.postponedNewEndTimeLabel')}
              type="time"
              value={postponedNewEndTime}
              onChange={(e) => setPostponedNewEndTime(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="event-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
