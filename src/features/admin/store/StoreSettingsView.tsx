import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BackButton, Card, HelpTip, ImageUploadField, Input, NavRowList, SlideTransition, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { AppearanceSettingsView } from './AppearanceSettingsView'
import { ContactInfoView } from './ContactInfoView'
import { LegalDetailsView } from './LegalDetailsView'
import { LogoListEditor } from './LogoListEditor'
import './StoreSettingsView.scss'

type SubView = 'main' | 'contact' | 'appearance' | 'legal'

/**
 * Company branding for this store/business: name, slogan, one or more
 * logos, and a favicon (see `StoreSettings`) — the name/first logo also
 * show up in the sidebar header and login page, the name feeds the browser
 * tab title, and the favicon updates the browser tab icon, all live (see
 * `StoreBrandingEffect`). "Contact info" (phone/email/address/hours) and
 * "Appearance" (screen-display color themes/fonts — see
 * `AppearanceSettingsView`) and "Company details" (the legal details register
 * receipts need, see `LegalDetailsView`) each open as their own sub-view here, same
 * `SlideTransition`/`BackButton` pattern as Settings → "For
 * developers"/"Advanced". Rendered from `SettingsView` as a submenu; its own
 * "main" state's Back level (returning to Settings) is registered by
 * `SettingsView` itself, not here, so this component takes no `onBack` prop.
 */
export function StoreSettingsView() {
  const { t } = useLanguage()
  const [storeSettings, setStoreSettings] = useStoreSettings()
  const navigate = useNavigate()
  const { subsection } = useParams<{ subsection?: string }>()
  /**
   * Which sub-view is open, read off the URL's third segment
   * (`/admin/dashboard/settings/store/<subsection>`) rather than local state — so Contact
   * info and Appearance are each their own addressable page, and browser Back closes them
   * natively instead of via the `useBackLevel` shim this view used to need.
   */
  const subView: SubView = subsection === 'contact' || subsection === 'appearance' || subsection === 'legal' ? subsection : 'main'
  /** `1` while opening the sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)
  const [searchParams] = useSearchParams()

  const openContactInfo = () => {
    setDirection(1)
    navigate('/admin/dashboard/settings/store/contact')
  }

  const openLegalDetails = () => {
    setDirection(1)
    navigate('/admin/dashboard/settings/store/legal')
  }

  const openAppearance = () => {
    setDirection(1)
    navigate('/admin/dashboard/settings/store/appearance')
  }

  const closeSubView = () => {
    setDirection(-1)
    navigate('/admin/dashboard/settings/store')
  }

  /**
   * Back-compat for the old `?section=appearance` deep link — redirected once to the real
   * route. The elaborate strip-and-retry dance this used to need is gone with it: that
   * existed only because this view and `SettingsView` both raced to rewrite the same query
   * string in one commit, and neither owns the URL that way anymore.
   */
  useEffect(() => {
    const section = searchParams.get('section')
    if (section !== 'appearance' && section !== 'contact') return
    navigate(`/admin/dashboard/settings/store/${section}`, { replace: true })
  }, [searchParams, navigate])

  return (
    <SlideTransition viewKey={subView} direction={direction}>
      {subView === 'contact' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.store.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.contact.title" />
          </div>
          <ContactInfoView />
        </div>
      ) : subView === 'legal' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.store.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.legal.title" />
          </div>
          <LegalDetailsView />
        </div>
      ) : subView === 'appearance' ? (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.store.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.appearance.title" />
          </div>
          <TranslatedText as="p" id="admin.appearance.description" className="admin-page-description" />
          <AppearanceSettingsView />
        </div>
      ) : (
        <div className="store-settings-view">
          <div className="store-settings-view__sub-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
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

          <Card
            title={
              <>
                {t('admin.store.logosCardTitle')} <HelpTip text={t('admin.store.logosHint')} />
              </>
            }
          >
            <LogoListEditor logos={storeSettings.logos} onChange={(logos) => setStoreSettings({ ...storeSettings, logos })} />
          </Card>

          <Card
            title={
              <>
                {t('admin.store.faviconCardTitle')} <HelpTip text={t('admin.store.faviconHint')} />
              </>
            }
          >
            <ImageUploadField
              id="store-favicon"
              value={storeSettings.favicon ?? ''}
              onChange={(favicon) => setStoreSettings({ ...storeSettings, favicon: favicon || undefined })}
            />
          </Card>

          {/* This view's own sub-views, grouped as one menu — same treatment as `SettingsView`'s own row group, so a destination looks the same wherever it's offered. */}
          <NavRowList
            items={[
              { id: 'contact', label: t('admin.contact.title'), onClick: openContactInfo },
              { id: 'legal', label: t('admin.legal.title'), onClick: openLegalDetails },
              { id: 'appearance', label: t('admin.appearance.title'), onClick: openAppearance },
            ]}
          />
        </div>
      )}
    </SlideTransition>
  )
}
