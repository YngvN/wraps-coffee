import { LockIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import { BoardClock } from '../orders/BoardClock'
import { OrdersSettingsChoice, OrdersSettingsMenu } from '../orders/OrdersSettingsMenu'
import { BarcodeIcon, DrawerIcon, HistoryIcon, QrIcon } from './RegisterIcons'
import type { BoardPrinting } from '../orders/useBoardPrinting'
import type { OrdersLanguage } from '../orders/useOrdersLanguage'
import type { OrdersTheme } from '../orders/useOrdersTheme'
import type { CameraScanner } from './useCameraScanner'
import type { RegisterSettings } from './useRegisterSettings'

interface RegisterTopBarProps {
  settings: RegisterSettings
  camera: CameraScanner
  unlocked: boolean
  onUnlock: () => void
  onLock: () => void
  /** Omitted when pickup scanning is off for this pane. */
  onTypePickupCode?: () => void
  onOpenHistory: () => void
  /** Opens the cash drawer by hand (asks for the staff PIN first). Omitted off a register tablet. */
  onOpenDrawer?: () => void
  theme: OrdersTheme
  onThemeChange: (theme: OrdersTheme) => void
  language: OrdersLanguage
  onLanguageChange: (language: OrdersLanguage) => void
  printing?: BoardPrinting
}

/**
 * The register's top bar: clock; the Scan button that switches camera scanning (back and front
 * cameras at once) on and off, only on an app build that can scan with the camera, with a clear
 * "scanning" state and its optional aiming preview; order history (with reprints); a button to type a
 * pickup code by hand; the staff lock; and the ⚙ menu shared with the order board plus the register's
 * own scan sound.
 */
export function RegisterTopBar({
  settings,
  camera,
  unlocked,
  onUnlock,
  onLock,
  onTypePickupCode,
  onOpenHistory,
  onOpenDrawer,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  printing,
}: RegisterTopBarProps) {
  const { t } = useLanguage()
  const onOff = [
    { value: 'on' as const, label: t('screenDisplay.register.on') },
    { value: 'off' as const, label: t('screenDisplay.register.off') },
  ]

  return (
    <div className="orders-board__bar register__bar">
      <BoardClock />
      <div className="register__bar-spacer" />
      {camera.available && (
        <div className={camera.active ? 'register__camera register__camera--on' : 'register__camera'}>
          {/* The preview toggle sits first, so the Scan button stays in the same place whether it's there or not. */}
          {settings.cameraOn && (
            <button type="button" className="register__camera-preview" aria-pressed={settings.cameraPreview} onClick={() => settings.setCameraPreview(!settings.cameraPreview)}>
              {settings.cameraPreview ? t('screenDisplay.register.hidePreview') : t('screenDisplay.register.showPreview')}
            </button>
          )}
          <button
            type="button"
            aria-pressed={settings.cameraOn}
            className="register__camera-switch"
            onClick={() => settings.setCameraOn(!settings.cameraOn)}
            aria-label={t('screenDisplay.register.cameraSwitch')}
          >
            <BarcodeIcon />
            <span>{camera.failed ? t('screenDisplay.register.cameraFailed') : settings.cameraOn ? t('screenDisplay.register.scanning') : t('screenDisplay.register.scan')}</span>
          </button>
        </div>
      )}
      {onOpenDrawer && (
        <button type="button" className="register__bar-button" onClick={onOpenDrawer}>
          <DrawerIcon />
          {t('screenDisplay.register.openDrawer')}
        </button>
      )}
      <button type="button" className="register__bar-button" onClick={onOpenHistory}>
        <HistoryIcon />
        {t('screenDisplay.register.history')}
      </button>
      {onTypePickupCode && (
        <button type="button" className="register__bar-button" onClick={onTypePickupCode}>
          <QrIcon />
          {t('screenDisplay.register.typePickupCode')}
        </button>
      )}
      <button
        type="button"
        className={unlocked ? 'register__bar-button register__lock register__lock--open' : 'register__bar-button register__lock'}
        onClick={unlocked ? onLock : onUnlock}
        aria-label={unlocked ? t('screenDisplay.register.lockNow') : t('screenDisplay.register.unlock')}
      >
        <LockIcon locked={!unlocked} />
        <span>{unlocked ? t('screenDisplay.register.unlocked') : t('screenDisplay.register.locked')}</span>
      </button>
      <OrdersSettingsMenu theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} printing={printing}>
        <OrdersSettingsChoice
          label={t('screenDisplay.register.scanSound')}
          value={settings.soundOn ? 'on' : 'off'}
          options={onOff}
          onChange={(value) => settings.setSoundOn(value === 'on')}
        />
      </OrdersSettingsMenu>
    </div>
  )
}
