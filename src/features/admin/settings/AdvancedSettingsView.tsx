import { useEffect, useState } from 'react'
import { Button, Input } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useIsElectron } from '../../../hooks/useElectronWindowControls'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { getScreenAddressSettings, getWindowLaunchSettings, setScreenAddressSettings, setWindowLaunchSettings } from '../../../lib/localServer'
import type { ScreenAddressMode, ScreenAddressSettings } from '../../../types/screenAddress'
import type { WindowLaunchMethod, WindowLaunchSettings } from '../../../types/windowLaunch'
import { deriveMdnsName } from '../../../utils/mdnsName'
import './AdvancedSettingsView.scss'

const MODES: ScreenAddressMode[] = ['automatic', 'custom', 'mdns']
const LAUNCH_METHODS: WindowLaunchMethod[] = ['auto', 'electron', 'edge']

/**
 * How a screen's own `/screens/:screenId` link should be addressed — a
 * machine-level setting, not synced per-device (same posture as the Neon
 * database URL). **mDNS** (default) has the local server advertise a name
 * derived from the store's own name (see Store settings) as `<name>.local`
 * on the network itself, so the link stays valid — and literally shows that
 * friendly name in the address bar — even if the underlying IP changes;
 * **Automatic** auto-detects this machine's LAN IP instead, which can
 * change on a router/computer restart; **Custom** lets the admin type a
 * hostname/IP they've made stable themselves (e.g. a router DHCP
 * reservation).
 * Also holds the "window launch method" choice (`electron`/`edge`/`auto`) —
 * which window `installer/start-wraps-coffee.bat` opens the kiosk display in
 * at boot, normally auto-detected (a native Electron kiosk window if
 * installed, else Microsoft Edge's own `--kiosk` mode) but forceable either
 * way here, mainly for comparing the two on real hardware. A separate
 * machine-level setting/save flow from the address mode above, since it's
 * read by a different `.bat`-script code path — not applied live, takes
 * effect on the machine's next restart. Hidden entirely when this dashboard
 * is open in a plain browser tab rather than the Electron kiosk wrapper (see
 * `useIsElectron`) — choosing between Electron and Edge has no meaning if
 * you're not using either right now.
 * `admin`/`subadmin` only, reached from Settings → Advanced.
 */
export function AdvancedSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const isElectron = useIsElectron()
  const [storeSettings] = useStoreSettings()
  const [settings, setSettings] = useState<ScreenAddressSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [launchSettings, setLaunchSettings] = useState<WindowLaunchSettings | null>(null)
  const [isLaunchLoading, setIsLaunchLoading] = useState(isElectron)
  const [isLaunchSaving, setIsLaunchSaving] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchSaved, setLaunchSaved] = useState(false)

  useEffect(() => {
    getScreenAddressSettings()
      .then(setSettings)
      .catch(() => setError(t('admin.settings.advanced.loadError')))
      .finally(() => setIsLoading(false))
  }, [t])

  useEffect(() => {
    if (!isElectron) return
    getWindowLaunchSettings()
      .then(setLaunchSettings)
      .catch(() => setLaunchError(t('admin.settings.advanced.launchMethodLoadError')))
      .finally(() => setIsLaunchLoading(false))
  }, [t, isElectron])

  if (isLoading || !settings || (isElectron && (isLaunchLoading || !launchSettings))) return <p>{error ?? launchError ?? t('admin.settings.advanced.loading')}</p>

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

  const handleLaunchSave = () => {
    if (!session || !launchSettings) return
    setIsLaunchSaving(true)
    setLaunchError(null)
    setLaunchSaved(false)
    setWindowLaunchSettings(session.token, launchSettings)
      .then((saved) => {
        setLaunchSettings(saved)
        setLaunchSaved(true)
      })
      .catch(() => setLaunchError(t('admin.settings.advanced.launchMethodSaveError')))
      .finally(() => setIsLaunchSaving(false))
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

      {isElectron && launchSettings && (
        <div className="advanced-settings__section">
          <fieldset className="advanced-settings__modes">
            <legend>{t('admin.settings.advanced.launchMethodLegend')}</legend>
            {LAUNCH_METHODS.map((method) => (
              <label key={method} className="advanced-settings__mode">
                <input
                  type="radio"
                  name="window-launch-method"
                  checked={launchSettings.method === method}
                  onChange={() => {
                    setLaunchSaved(false)
                    setLaunchSettings({ ...launchSettings, method })
                  }}
                />
                <span className="advanced-settings__mode-text">
                  <strong>{t(`admin.settings.advanced.launchMethod${method.charAt(0).toUpperCase()}${method.slice(1)}Label`)}</strong>
                  <span>{t(`admin.settings.advanced.launchMethod${method.charAt(0).toUpperCase()}${method.slice(1)}Description`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="advanced-settings__caveat">{t('admin.settings.advanced.launchMethodCaveat')}</p>

          {launchError && <p className="advanced-settings__error">{launchError}</p>}
          <Button onClick={handleLaunchSave} disabled={isLaunchSaving}>
            {t('admin.common.save')}
          </Button>
          {launchSaved && <span className="advanced-settings__saved">{t('admin.settings.advanced.saved')}</span>}
        </div>
      )}
    </div>
  )
}
