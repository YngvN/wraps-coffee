import { useLanguage } from '../../../i18n'
import { OrdersSettingsChoice } from '../orders/OrdersSettingsMenu'
import { SCREENSAVER_MINUTES } from '../orders/useDeviceSetting'
import { LOGOUT_MINUTES, type RegisterSettings } from './useRegisterSettings'

/**
 * The register's own rows in its ⚙ menu (below the board's shared theme, language and printer rows):
 * which cash register this tablet is, the scan sound, when staff are signed out, when the screensaver
 * shows, and whether the PIN is asked once a day or at every sign-in. All remembered per tablet.
 */
export function RegisterSettingsChoices({ settings, cashRegister }: { settings: RegisterSettings; cashRegister?: { number: number; name: string } | null }) {
  const { t } = useLanguage()
  const minutes = (value: number) => (value === 0 ? t('screenDisplay.register.off') : t('screenDisplay.register.minutes', { count: value }))
  return (
    <>
      {cashRegister && (
        <>
          <span className="orders-settings__label">{t('screenDisplay.register.cashRegister')}</span>
          <p className="orders-settings__hint">{t('screenDisplay.register.cashRegisterValue', { name: cashRegister.name, number: cashRegister.number })}</p>
        </>
      )}
      <OrdersSettingsChoice
        label={t('screenDisplay.register.scanSound')}
        value={settings.soundOn ? 'on' : 'off'}
        options={[
          { value: 'on', label: t('screenDisplay.register.on') },
          { value: 'off', label: t('screenDisplay.register.off') },
        ]}
        onChange={(value) => settings.setSoundOn(value === 'on')}
      />
      <OrdersSettingsChoice
        label={t('screenDisplay.register.logoutAfter')}
        value={String(settings.logoutMinutes)}
        options={LOGOUT_MINUTES.map((value) => ({ value: String(value), label: minutes(value) }))}
        onChange={(value) => settings.setLogoutMinutes(Number(value) as RegisterSettings['logoutMinutes'])}
      />
      <OrdersSettingsChoice
        label={t('screenDisplay.register.screensaverAfter')}
        value={String(settings.screensaverMinutes)}
        options={SCREENSAVER_MINUTES.map((value) => ({ value: String(value), label: minutes(value) }))}
        onChange={(value) => settings.setScreensaverMinutes(Number(value) as RegisterSettings['screensaverMinutes'])}
      />
      <OrdersSettingsChoice
        label={t('screenDisplay.register.pinWhen')}
        value={settings.pinEveryTime ? 'always' : 'day'}
        options={[
          { value: 'day', label: t('screenDisplay.register.pinOncePerDay') },
          { value: 'always', label: t('screenDisplay.register.pinEverySignIn') },
        ]}
        onChange={(value) => settings.setPinEveryTime(value === 'always')}
      />
    </>
  )
}
