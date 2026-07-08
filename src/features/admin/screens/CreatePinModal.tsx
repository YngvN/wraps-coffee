import { useState } from 'react'
import { Modal } from '../../../components'
import { useScreenLockPin } from '../../../hooks/useScreenLockPin'
import { useLanguage } from '../../../i18n'
import { PinInput } from '../../screens/PinInput'
import './CreatePinModal.scss'

interface CreatePinModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Sets (or changes) the shared 4-digit PIN used to unlock any locked screen
 * display — saves as soon as 4 digits are entered, no separate confirm
 * step, since a mistyped PIN is exactly as easy to fix by reopening this
 * and entering a new one.
 */
export function CreatePinModal({ open, onClose }: CreatePinModalProps) {
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
      handleClose()
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('admin.screens.createPinTitle')}>
      <div className="create-pin-modal">
        <p>{t('admin.screens.createPinDescription')}</p>
        <PinInput value={entered} onChange={handleChange} />
      </div>
    </Modal>
  )
}
