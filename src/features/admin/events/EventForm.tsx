import { useState, type FormEvent } from 'react'
import { Button, Checkbox, ImageUploadField, Input, Textarea } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { EventRecord } from '../../../types/event'
import './EventForm.scss'

interface EventFormProps {
  /** The event being edited, or `null` when creating a new one. */
  event: EventRecord | null
  onSave: (event: EventRecord) => void
  onCancel: () => void
}

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Create/edit form for a single event: bilingual title/location/description,
 * schedule, capacity/price, a simple weekly-recurrence toggle and status.
 * Advanced fields (participants, contact person, menu highlights, tags,
 * exceptions) aren't exposed here — they're preserved unchanged on edit and
 * default to empty on create.
 */
export function EventForm({ event, onSave, onCancel }: EventFormProps) {
  const { t } = useLanguage()
  const [titleEn, setTitleEn] = useState(event?.title.en ?? '')
  const [titleNo, setTitleNo] = useState(event?.title.no ?? '')
  const [category, setCategory] = useState(event?.category ?? '')
  const [date, setDate] = useState(event?.date ?? '')
  const [time, setTime] = useState(event?.time ?? '')
  const [endTime, setEndTime] = useState(event?.endTime ?? '')
  const [locationAddress, setLocationAddress] = useState(event?.location.address ?? '')
  const [descriptionEn, setDescriptionEn] = useState(event?.description.en ?? '')
  const [descriptionNo, setDescriptionNo] = useState(event?.description.no ?? '')
  const [capacity, setCapacity] = useState(event?.capacity ?? 0)
  const [price, setPrice] = useState(event?.price ?? 0)
  const [repeatsWeekly, setRepeatsWeekly] = useState(event?.recurring ?? false)
  const [dayOfWeek, setDayOfWeek] = useState(event?.recurrence?.dayOfWeek ?? 0)
  const [status, setStatus] = useState<EventRecord['status']>(event?.status ?? 'scheduled')
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? '')

  const handleSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()

    onSave({
      ...event,
      eventID: event?.eventID ?? `${Date.now()}`,
      title: { en: titleEn, no: titleNo },
      category,
      date,
      time,
      endTime,
      recurring: repeatsWeekly,
      recurrence: repeatsWeekly ? { frequency: 'weekly', dayOfWeek } : null,
      exceptions: event?.exceptions,
      location: { name: event?.location.name ?? { en: 'Wraps & Coffee', no: 'Wraps & Coffee' }, address: locationAddress },
      description: { en: descriptionEn, no: descriptionNo },
      capacity,
      attendeesCount: event?.attendeesCount ?? 0,
      price,
      currency: event?.currency ?? 'NOK',
      tags: event?.tags ?? [],
      participants: event?.participants,
      contactPerson: event?.contactPerson,
      menuItems: event?.menuItems ?? [],
      status,
      postponedDetails: event?.postponedDetails ?? { newDate: null, newTime: null, newEndTime: null },
      imageUrl,
      registrationRequired: event?.registrationRequired ?? false,
    })
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <div className="event-form__row">
        <Input id="event-title-en" label={t('admin.events.titleEnLabel')} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required />
        <Input id="event-title-no" label={t('admin.events.titleNoLabel')} value={titleNo} onChange={(e) => setTitleNo(e.target.value)} required />
      </div>

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
        <Textarea id="event-description-en" label={t('admin.events.descriptionEnLabel')} value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} />
        <Textarea id="event-description-no" label={t('admin.events.descriptionNoLabel')} value={descriptionNo} onChange={(e) => setDescriptionNo(e.target.value)} />
      </div>

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
          <option value="scheduled">{t('admin.events.statusLabel')}: scheduled</option>
          <option value="postponed">{t('admin.events.statusLabel')}: postponed</option>
          <option value="cancelled">{t('admin.events.statusLabel')}: cancelled</option>
        </select>
      </label>

      <div className="event-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
