import { useEffect, useState } from 'react'
import { Button, Input } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { getScreenAddressSettings, setScreenAddressSettings } from '../../../lib/localServer'
import type { ScreenAddressMode, ScreenAddressSettings } from '../../../types/screenAddress'
import { deriveMdnsName } from '../../../utils/mdnsName'
import './AdvancedSettingsView.scss'

const MODES: ScreenAddressMode[] = ['automatic', 'custom', 'mdns']

/**
 * How a screen's own `/screens/:screenId` link should be addressed — a
 * machine-level setting, not synced per-device (same posture as the Neon
 * database URL). **Automatic** (default) auto-detects this machine's LAN IP,
 * which can change on a router/computer restart; **Custom** lets the admin
 * type a hostname/IP they've made stable themselves (e.g. a router DHCP
 * reservation); **mDNS** has the local server advertise a name derived from
 * the store's own name (see Store settings) as `<name>.local` on the
 * network itself, so the link stays valid — and literally shows that
 * friendly name in the address bar — even if the underlying IP changes.
 * `admin`/`subadmin` only, reached from Settings → Advanced.
 */
export function AdvancedSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [storeSettings] = useStoreSettings()
  const [settings, setSettings] = useState<ScreenAddressSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getScreenAddressSettings()
      .then(setSettings)
      .catch(() => setError(t('admin.settings.advanced.loadError')))
      .finally(() => setIsLoading(false))
  }, [t])

  if (isLoading || !settings) return <p>{error ?? t('admin.settings.advanced.loading')}</p>

  const handleSave = () => {
    if (!session) return
    setIsSaving(true)
    setError(null)
    setSaved(false)
    setScreenAddressSettings(session.token, settings)
      .then((saved) => {
        setSettings(saved)
        setSaved(true)
      })
      .catch(() => setError(t('admin.settings.advanced.saveError')))
      .finally(() => setIsSaving(false))
  }

  return (
    <div className="advanced-settings">
      <fieldset className="advanced-settings__modes">
        <legend>{t('admin.settings.advanced.modeLegend')}</legend>
        {MODES.map((mode) => (
          <label key={mode} className="advanced-settings__mode">
            <input
              type="radio"
              name="screen-address-mode"
              checked={settings.mode === mode}
              onChange={() => {
                setSaved(false)
                setSettings({ ...settings, mode })
              }}
            />
            <span className="advanced-settings__mode-text">
              <strong>{t(`admin.settings.advanced.mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}Label`)}</strong>
              <span>{t(`admin.settings.advanced.mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}Description`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {settings.mode === 'custom' && (
        <Input
          label={t('admin.settings.advanced.customHostLabel')}
          placeholder={t('admin.settings.advanced.customHostPlaceholder')}
          value={settings.customHost ?? ''}
          onChange={(event) => {
            setSaved(false)
            setSettings({ ...settings, customHost: event.target.value })
          }}
        />
      )}

      {settings.mode === 'mdns' && (
        <div className="advanced-settings__mdns-field">
          {storeSettings.name.trim() ? (
            <p className="advanced-settings__mdns-preview">{t('admin.settings.advanced.mdnsPreview', { name: deriveMdnsName(storeSettings.name) })}</p>
          ) : (
            <p className="advanced-settings__error">{t('admin.settings.advanced.mdnsNoStoreName')}</p>
          )}
          <p className="advanced-settings__caveat">{t('admin.settings.advanced.mdnsCaveat')}</p>
        </div>
      )}

      {error && <p className="advanced-settings__error">{error}</p>}
      <Button onClick={handleSave} disabled={isSaving}>
        {t('admin.common.save')}
      </Button>
      {saved && <span className="advanced-settings__saved">{t('admin.settings.advanced.saved')}</span>}
    </div>
  )
}
