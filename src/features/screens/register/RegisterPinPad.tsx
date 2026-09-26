import { useState } from 'react'
import { useLanguage } from '../../../i18n'
import type { SignInFailure } from './useRegisterSession'

interface RegisterPinPadProps {
  /** Whose PIN it is, shown above the dots. */
  name: string
  /** Tries the 4 digits. Resolves `null` when they were right, else why not. */
  onSubmit: (pin: string) => Promise<SignInFailure | null>
  onCancel: () => void
}

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

/**
 * A staff member's PIN pad on the register's login screen: big on-screen digits, so the tablet's own
 * keyboard never opens, and it tries the PIN as soon as the fourth digit is in. The PIN is checked by
 * the server (never stored on the tablet); after a few wrong tries it locks this tablet out for a
 * while, and says so.
 */
export function RegisterPinPad({ name, onSubmit, onCancel }: RegisterPinPadProps) {
  const { t } = useLanguage()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<SignInFailure | null>(null)

  const submit = async (full: string) => {
    setBusy(true)
    const result = await onSubmit(full)
    setBusy(false)
    if (result) {
      setFailure(result)
      setPin('')
    }
  }

  const press = (key: (typeof KEYS)[number]) => {
    if (busy) return
    setFailure(null)
    if (key === 'clear') return setPin('')
    if (key === 'back') return setPin((current) => current.slice(0, -1))
    const next = pin.length < PIN_LENGTH ? pin + key : pin
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const message = failure
    ? failure.reason === 'lockedOut'
      ? t('screenDisplay.register.pinLockedOut', { minutes: Math.max(1, Math.ceil((failure.retryAfterMs ?? 0) / 60_000)) })
      : t(`screenDisplay.register.signInError.${failure.reason}`)
    : t('screenDisplay.register.pinPromptFor', { name })

  return (
    <div className="register-pin">
      <p className={failure ? 'register-pin__message register-pin__message--error' : 'register-pin__message'} role={failure ? 'alert' : undefined}>
        {message}
      </p>
      <div className="register-pin__dots" aria-label={t('screenDisplay.register.pinDigits', { count: pin.length })}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
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
      <button type="button" className="register-login__back" onClick={onCancel} disabled={busy}>
        {t('screenDisplay.register.backToStaffList')}
      </button>
    </div>
  )
}
