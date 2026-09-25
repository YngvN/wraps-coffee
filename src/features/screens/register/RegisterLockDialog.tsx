import { useState } from 'react'
import { useLanguage } from '../../../i18n'
import { RegisterSheet } from './RegisterSheet'
import type { UnlockFailure } from './useRegisterUnlock'

interface RegisterLockDialogProps {
  onSubmit: (pin: string) => Promise<UnlockFailure | null>
  onCancel: () => void
}

const MAX_PIN_LENGTH = 6
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

/**
 * The staff PIN pad — big on-screen digits, so the tablet's own keyboard never opens. The PIN is
 * checked by the server (never stored on the tablet); after a few wrong tries it locks this tablet out
 * for a while, and says so.
 */
export function RegisterLockDialog({ onSubmit, onCancel }: RegisterLockDialogProps) {
  const { t } = useLanguage()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<UnlockFailure | null>(null)

  const submit = async () => {
    if (pin.length < 4 || busy) return
    setBusy(true)
    const result = await onSubmit(pin)
    setBusy(false)
    if (result) {
      setFailure(result)
      setPin('')
    }
  }

  const press = (key: (typeof KEYS)[number]) => {
    setFailure(null)
    if (key === 'clear') setPin('')
    else if (key === 'back') setPin((current) => current.slice(0, -1))
    else setPin((current) => (current.length < MAX_PIN_LENGTH ? current + key : current))
  }

  const message = failure
    ? failure.reason === 'lockedOut'
      ? t('screenDisplay.register.pinLockedOut', { minutes: Math.max(1, Math.ceil((failure.retryAfterMs ?? 0) / 60_000)) })
      : t(`screenDisplay.register.pinError.${failure.reason}`)
    : t('screenDisplay.register.pinPrompt')

  return (
    <RegisterSheet title={t('screenDisplay.register.unlock')} onClose={onCancel} className="register-sheet--pin">
      <div className="register-pin">
        <p className={failure ? 'register-pin__message register-pin__message--error' : 'register-pin__message'} role={failure ? 'alert' : undefined}>
          {message}
        </p>
        <div className="register-pin__dots" aria-label={t('screenDisplay.register.pinDigits', { count: pin.length })}>
          {Array.from({ length: MAX_PIN_LENGTH }, (_, index) => (
            <span key={index} className={index < pin.length ? 'register-pin__dot register-pin__dot--filled' : 'register-pin__dot'} />
          ))}
        </div>
        <div className="register-pin__keys">
          {KEYS.map((key) => (
            <button key={key} type="button" className="register-pin__key" onClick={() => press(key)} disabled={busy}>
              {key === 'clear' ? t('screenDisplay.register.pinClear') : key === 'back' ? '⌫' : key}
            </button>
          ))}
        </div>
        <button type="button" className="order-sheet__action register__pay" onClick={() => void submit()} disabled={pin.length < 4 || busy}>
          {t('screenDisplay.register.unlock')}
        </button>
      </div>
    </RegisterSheet>
  )
}
