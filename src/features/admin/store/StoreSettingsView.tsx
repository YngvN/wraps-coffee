import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton, Button, Card, ImageUploadField, Input, SlideTransition, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import { useBackLevel } from '../../../hooks/useBackLevel'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { goBack } from '../../../lib/backStack'
import { AppearanceSettingsView } from './AppearanceSettingsView'
import { ContactInfoView } from './ContactInfoView'
import { LogoListEditor } from './LogoListEditor'
import './StoreSettingsView.scss'

type SubView = 'main' | 'contact' | 'appearance'

/**
 * Company branding for this store/business: name, slogan, one or more
 * logos, and a favicon (see `StoreSettings`) — the name/first logo also
 * show up in the sidebar header and login page, the name feeds the browser
 * tab title, and the favicon updates the browser tab icon, all live (see
 * `StoreBrandingEffect`). "Contact info" (phone/email/address/hours) and
 * "Appearance" (screen-display color themes/fonts — see
 * `AppearanceSettingsView`) each open as their own sub-view here, same
 * `SlideTransition`/`BackButton` pattern as Settings → "For
 * developers"/"Advanced". Rendered from `SettingsView` as a submenu; its own
 * "main" state's Back level (returning to Settings) is registered by
 * `SettingsView` itself, not here, so this component takes no `onBack` prop.
 */
export function StoreSettingsView() {
  const { t } = useLanguage()
  const [storeSettings, setStoreSettings] = useStoreSettings()
  /** Which sub-view (replacing the main form until its own Back button is pressed) is open, if any. */
  const [subView, setSubView] = useState<SubView>('main')
  /** `1` while opening the sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)
  const [searchParams, setSearchParams] = useSearchParams()
  /** Guards the deep-link effect below so it only opens Appearance once. */
  const consumedSectionDeepLinkRef = useRef(false)

  const openContactInfo = () => {
    setDirection(1)
    setSubView('contact')
  }

  const openAppearance = () => {
    setDirection(1)
    setSubView('appearance')
  }

  const closeSubView = () => {
    setDirection(-1)
    setSubView('main')
  }

  /** Registers the open Contact info/Appearance sub-view as its own level of the shared browser-back stack (see `useBackLevel`), so the mouse's back button closes it exactly the way its own Back button does. */
  useBackLevel(subView !== 'main', closeSubView)

  /**
   * Deep-link support: `?view=store&section=appearance` (the outer `?view=`
   * is `SettingsView`'s own, opening this view in the first place) opens
   * straight into the Appearance sub-view — what the global search results
   * (see `useGlobalSearchIndex`) navigate to.
   *
   * The strip is deliberately *not* one-shot and instead keeps retrying on
   * every `searchParams` change until `section` is actually gone: this view
   * mounts as `SettingsView`'s own child on the same commit as
   * `SettingsView`'s own effect that strips its `?view=` param, and since
   * both effects call `setSearchParams` independently in that same tick,
   * whichever commits last wins outright — same race `IntegrationsView`'s
   * own `?integration=` strip guards against, see its doc comment for the
   * full explanation.
   */
  useEffect(() => {
    const section = searchParams.get('section')
    if (!section) return
    if (!consumedSectionDeepLinkRef.current && section === 'appearance') {
      consumedSectionDeepLinkRef.current = true
      queueMicrotask(openAppearance)
    }
    setSearchParams((current) => {
      current.delete('section')
      return current
    })
  }, [searchParams, setSearchParams])

  return (
    <SlideTransition viewKey={subView} direction={direction}>
      {subView === 'contact' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.store.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.contact.title" />
          </div>
          <ContactInfoView />
        </div>
      ) : subView === 'appearance' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.store.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.appearance.title" />
          </div>
          <TranslatedText as="p" id="admin.appearance.description" className="admin-page-description" />
          <AppearanceSettingsView />
        </div>
      ) : (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
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

          <Card title={t('admin.appearance.title')}>
            <p className="store-settings-view__hint">{t('admin.store.appearanceHint')}</p>
            <Button type="button" variant="secondary" onClick={openAppearance}>
              {t('admin.store.appearanceButton')}
            </Button>
          </Card>
        </div>
      )}
    </SlideTransition>
  )
}
