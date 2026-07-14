import { useState } from 'react'
import { Modal } from '../../../components'
import { useScreenLockPin } from '../../../hooks/useScreenLockPin'
import { useLanguage } from '../../../i18n'
import { PinInput } from '../../screens/PinInput'
import './CreatePinModal.scss'

interface CreatePinModalProps {
  open: boolean
  onClose: () => void
  /** Called right after a new PIN is saved (before `onClose`) — lets a caller that opened this modal to *require* a PIN first (see `ScreensView`'s "Open" action) resume whatever it was waiting on. Not called on a plain cancel/dismiss. */
  onSaved?: () => void
  /** Overrides the default "Create/change pin" description — used when this modal was opened because an action requires a PIN to exist yet, so the admin sees why it appeared instead of the generic copy. */
  description?: string
}

/**
 * Sets (or changes) the shared 4-digit PIN used to unlock any locked screen
 * display — saves as soon as 4 digits are entered, no separate confirm
 * step, since a mistyped PIN is exactly as easy to fix by reopening this
 * and entering a new one.
 */
export function CreatePinModal({ open, onClose, onSaved, description }: CreatePinModalProps) {
  const { t } = useLanguage()
  const [, setPin] = useScreenLockPin()
  const [entered, setEntered] = useState('')

  const handleClose = () => {
    setEntered('')
    onClose()
  }

  const handleChange = (value: string) => {
    setEntered(value)
    if (value.length === 4) {
      setPin(value)
      onSaved?.()
      handleClose()
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('admin.screens.createPinTitle')}>
      <div className="create-pin-modal">
        <p>{description ?? t('admin.screens.createPinDescription')}</p>
        <PinInput value={entered} onChange={handleChange} />
      </div>
    </Modal>
  )
}
