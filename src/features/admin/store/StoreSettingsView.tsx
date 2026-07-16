import { useState } from 'react'
import { BackButton, Button, Card, ImageUploadField, Input, SlideTransition, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { ContactInfoView } from './ContactInfoView'
import { LogoListEditor } from './LogoListEditor'
import './StoreSettingsView.scss'

type SubView = 'main' | 'contact'

interface StoreSettingsViewProps {
  /** Returns to the Settings main list — this view is reached only as a Settings submenu, not its own top-level route, so it has no back button of its own for its main (non-"contact") state. */
  onBack: () => void
}

/**
 * Company branding for this store/business: name, slogan, one or more
 * logos, and a favicon (see `StoreSettings`) — the name/first logo also
 * show up in the sidebar header and login page, the name feeds the browser
 * tab title, and the favicon updates the browser tab icon, all live (see
 * `StoreBrandingEffect`). "Contact info" (phone/email/address/hours) opens
 * as a sub-view here, same `SlideTransition`/`BackButton` pattern as
 * Settings → "For developers"/"Advanced". Rendered from `SettingsView` as
 * a submenu, hence the `onBack` prop instead of a route of its own.
 */
export function StoreSettingsView({ onBack }: StoreSettingsViewProps) {
  const { t } = useLanguage()
  const [storeSettings, setStoreSettings] = useStoreSettings()
  /** Which sub-view (replacing the main form until its own Back button is pressed) is open, if any. */
  const [subView, setSubView] = useState<SubView>('main')
  /** `1` while opening the sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)

  const openContactInfo = () => {
    setDirection(1)
    setSubView('contact')
  }

  const closeSubView = () => {
    setDirection(-1)
    setSubView('main')
  }

  return (
    <SlideTransition viewKey={subView} direction={direction}>
      {subView === 'contact' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={closeSubView}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.contact.title" />
          </div>
          <ContactInfoView />
        </div>
      ) : (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={onBack}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.store.title" />
          </div>
          <TranslatedText as="p" id="admin.store.description" className="admin-page-description" />

          <Card title={t('admin.store.nameCardTitle')}>
            <div className="store-settings-view__fields">
              <Input
                id="store-name"
                label={t('admin.store.nameLabel')}
                value={storeSettings.name}
                onChange={(event) => setStoreSettings({ ...storeSettings, name: event.target.value })}
                required
              />
              <Input
                id="store-slogan"
                label={t('admin.store.sloganLabel')}
                value={storeSettings.slogan ?? ''}
                onChange={(event) => setStoreSettings({ ...storeSettings, slogan: event.target.value })}
              />
            </div>
          </Card>

          <Card title={t('admin.store.logosCardTitle')}>
            <p className="store-settings-view__hint">{t('admin.store.logosHint')}</p>
            <LogoListEditor logos={storeSettings.logos} onChange={(logos) => setStoreSettings({ ...storeSettings, logos })} />
          </Card>

          <Card title={t('admin.store.faviconCardTitle')}>
            <p className="store-settings-view__hint">{t('admin.store.faviconHint')}</p>
            <ImageUploadField
              id="store-favicon"
              value={storeSettings.favicon ?? ''}
              onChange={(favicon) => setStoreSettings({ ...storeSettings, favicon: favicon || undefined })}
            />
          </Card>

          <Card title={t('admin.contact.title')}>
            <p className="store-settings-view__hint">{t('admin.store.contactHint')}</p>
            <Button type="button" variant="secondary" onClick={openContactInfo}>
              {t('admin.store.contactButton')}
            </Button>
          </Card>
        </div>
      )}
    </SlideTransition>
  )
}
