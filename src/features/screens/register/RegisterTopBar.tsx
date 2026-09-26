import { LockIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { SignedInStaff } from '../../../lib/registerSessionApi'
import { BoardClock } from '../orders/BoardClock'
import { OrdersSettingsMenu } from '../orders/OrdersSettingsMenu'
import { RegisterSettingsChoices } from './RegisterSettingsChoices'
import { BarcodeIcon, DrawerIcon, HistoryIcon, QrIcon, ReportIcon } from './RegisterIcons'
import type { BoardPrinting } from '../orders/useBoardPrinting'
import type { OrdersLanguage } from '../orders/useOrdersLanguage'
import type { OrdersTheme } from '../orders/useOrdersTheme'
import type { CameraScanner } from './useCameraScanner'
import type { RegisterSettings } from './useRegisterSettings'

interface RegisterTopBarProps {
  settings: RegisterSettings
  camera: CameraScanner
  /** Who is signed in; `null` shows only the clock and the ⚙ menu (the login screen is below). */
  staff: SignedInStaff | null
  /** Signs the current staff member out, back to the staff list. */
  onSignOut: () => void
  /** Whether product editing is unlocked. */
  editing: boolean
  /** Locks or unlocks product editing. Only given while a manager is signed in. */
  onToggleEditing?: () => void
  /** Opens X/Z reports. Only given while a manager is signed in. */
  onOpenReports?: () => void
  /** Omitted when pickup scanning is off for this pane. */
  onTypePickupCode?: () => void
  onOpenHistory: () => void
  /** Opens the cash drawer by hand. Omitted off a register tablet. */
  onOpenDrawer?: () => void
  theme: OrdersTheme
  onThemeChange: (theme: OrdersTheme) => void
  language: OrdersLanguage
  onLanguageChange: (language: OrdersLanguage) => void
  printing?: BoardPrinting
  /** This tablet's cash register, once the server has said which it is. Shown in the ⚙ menu. */
  cashRegister?: { number: number; name: string } | null
}

/**
 * The register's top bar: clock; the Scan button that switches camera scanning (back and front
 * cameras at once) on and off, only on an app build that can scan with the camera, with a clear
 * "scanning" state and its optional aiming preview; order history (with reprints); a button to type a
 * pickup code by hand; for a manager, a lock that turns product editing on and off (off at sign-in);
 * the signed-in staff member (a tap signs them out); and the ⚙ menu shared with
 * the order board plus the register's own rows (`RegisterSettingsChoices`). While nobody is signed in
 * only the clock and the ⚙ menu show.
 */
export function RegisterTopBar({
  settings,
  camera,
  staff,
  onSignOut,
  editing,
  onToggleEditing,
  onOpenReports,
  onTypePickupCode,
  onOpenHistory,
  onOpenDrawer,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  printing,
  cashRegister,
}: RegisterTopBarProps) {
  const { t } = useLanguage()

  return (
    <div className="orders-board__bar register__bar">
      <BoardClock />
      <div className="register__bar-spacer" />
      {staff && camera.available && (
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
      {staff && onOpenDrawer && (
        <button type="button" className="register__bar-button" onClick={onOpenDrawer}>
          <DrawerIcon />
          {t('screenDisplay.register.openDrawer')}
        </button>
      )}
      {staff && (
        <button type="button" className="register__bar-button" onClick={onOpenHistory}>
          <HistoryIcon />
          {t('screenDisplay.register.history')}
        </button>
      )}
      {staff && onTypePickupCode && (
        <button type="button" className="register__bar-button" onClick={onTypePickupCode}>
          <QrIcon />
          {t('screenDisplay.register.typePickupCode')}
        </button>
      )}
      {staff && onOpenReports && (
        <button type="button" className="register__bar-button" onClick={onOpenReports}>
          <ReportIcon />
          {t('screenDisplay.register.reports')}
        </button>
      )}
      {staff && onToggleEditing && (
        <button
          type="button"
          className={editing ? 'register__bar-button register__lock register__lock--open' : 'register__bar-button register__lock'}
          onClick={onToggleEditing}
          aria-pressed={editing}
          aria-label={editing ? t('screenDisplay.register.lockEditing') : t('screenDisplay.register.unlockEditing')}
        >
          <LockIcon locked={!editing} />
          <span>{editing ? t('screenDisplay.register.editingOn') : t('screenDisplay.register.editingOff')}</span>
        </button>
      )}
      {staff && (
        <button
          type="button"
          className={staff.role === 'manager' ? 'register__bar-button register__staff register__staff--manager' : 'register__bar-button register__staff'}
          onClick={onSignOut}
          aria-label={t('screenDisplay.register.signOutNamed', { name: staff.name })}
        >
          <span className="register__staff-initial" aria-hidden="true">
            {staff.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{staff.name}</span>
        </button>
      )}
      <OrdersSettingsMenu theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} printing={printing}>
        <RegisterSettingsChoices settings={settings} cashRegister={cashRegister} />
      </OrdersSettingsMenu>
    </div>
  )
}
