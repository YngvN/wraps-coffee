import { Checkbox, Input, TranslatedText } from '../../../components'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useLanguage } from '../../../i18n'
import type { ContactInfo } from '../../../types/contactInfo'
import './ContactInfoView.scss'

const WEEKDAY_KEYS: (keyof ContactInfo['hours'])[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Admin view for editing the cafe's phone/email/address and per-day opening hours. Edits show up live in the site footer. */
export function ContactInfoView() {
  const { t } = useLanguage()
  const [contactInfo, setContactInfo] = useContactInfo()

  const updateField = (field: 'phone' | 'email' | 'address', value: string) => {
    setContactInfo({ ...contactInfo, [field]: value })
  }

  const updateDay = (day: keyof ContactInfo['hours'], patch: Partial<ContactInfo['hours'][typeof day]>) => {
    setContactInfo({ ...contactInfo, hours: { ...contactInfo.hours, [day]: { ...contactInfo.hours[day], ...patch } } })
  }

  return (
    <div className="contact-info-view">
      <TranslatedText as="h1" id="admin.contact.title" />
      <TranslatedText as="p" id="admin.contact.description" className="admin-page-description" />

      <div className="contact-info-view__fields">
        <Input id="contact-phone" label={t('admin.contact.phoneLabel')} value={contactInfo.phone} onChange={(event) => updateField('phone', event.target.value)} />
        <Input id="contact-email" label={t('admin.contact.emailLabel')} value={contactInfo.email} onChange={(event) => updateField('email', event.target.value)} />
        <Input
          id="contact-address"
          label={t('admin.contact.addressLabel')}
          value={contactInfo.address}
          onChange={(event) => updateField('address', event.target.value)}
        />
      </div>

      <h2>{t('admin.contact.hoursTitle')}</h2>
      <ul className="contact-info-view__hours">
        {WEEKDAY_KEYS.map((day) => {
          const dayHours = contactInfo.hours[day]
          return (
            <li key={day}>
              <span className="contact-info-view__day-label">{t(`footer.hours.${day}`)}</span>
              <Checkbox
                id={`contact-closed-${day}`}
                label={t('admin.contact.closedLabel')}
                checked={dayHours.closed}
                onChange={(event) => updateDay(day, { closed: event.target.checked })}
              />
              {!dayHours.closed && (
                <>
                  <label className="contact-info-view__time">
                    <span>{t('admin.contact.openLabel')}</span>
                    <input type="time" value={dayHours.open ?? ''} onChange={(event) => updateDay(day, { open: event.target.value })} />
                  </label>
                  <label className="contact-info-view__time">
                    <span>{t('admin.contact.closeLabel')}</span>
                    <input type="time" value={dayHours.close ?? ''} onChange={(event) => updateDay(day, { close: event.target.value })} />
                  </label>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
