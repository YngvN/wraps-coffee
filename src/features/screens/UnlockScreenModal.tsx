import { useState } from 'react'
import { Modal } from '../../components'
import { useScreenLockPin } from '../../hooks/useScreenLockPin'
import { useLanguage } from '../../i18n'
import { PinInput } from './PinInput'
import './UnlockScreenModal.scss'

interface UnlockScreenModalProps {
  open: boolean
  onClose: () => void
  onUnlock: () => void
}

/**
 * PIN-entry modal for the kiosk display's own "Unlock" button — checks
 * whatever's entered against the shared PIN (set from the admin Screens
 * dashboard's "Create pin" button) as soon as it reaches 4 digits, shaking
 * and clearing on a wrong guess, or calling `onUnlock` on a right one.
 */
export function UnlockScreenModal({ open, onClose, onUnlock }: UnlockScreenModalProps) {
  const { t } = useLanguage()
  const [pin] = useScreenLockPin()
  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)

  const handleClose = () => {
    setEntered('')
    setError(false)
    onClose()
  }

  const handleChange = (value: string) => {
    setError(false)
    setEntered(value)
    if (value.length !== 4) return
    if (value === pin) {
      setEntered('')
      onUnlock()
    } else {
      setError(true)
      setEntered('')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('screenDisplay.lock.unlockTitle')}>
      <div className="unlock-screen-modal">
        <p>{t('screenDisplay.lock.enterPin')}</p>
        <PinInput value={entered} onChange={handleChange} error={error} />
        {error && <p className="unlock-screen-modal__error">{t('screenDisplay.lock.wrongPin')}</p>}
      </div>
    </Modal>
  )
}
