import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { fetchRegisterPinStatus, saveRegisterPin } from '../../../../lib/registerAdminApi'
import './RegisterSettingsView.scss'

/** Where the PIN form is: idle, saving, or showing the outcome of the last save. */
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' | 'removed' } | { kind: 'error'; message: string }

/**
 * Settings → Register: the one staff PIN every Register pane asks for before products can be added
 * or edited at the counter. The server keeps only a hash of it and never sends it back, so this page
 * can only say whether one is set, set a new one, or remove it. Saving locks every register that was
 * unlocked with the old PIN.
 */
export function RegisterSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [isSet, setIsSet] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const token = session?.token

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchRegisterPinStatus(token)
      .then((value) => {
        if (alive) setIsSet(value)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [token])

  const valid = /^\d{4,6}$/.test(pin)
  const mismatch = repeat !== '' && repeat !== pin

  const save = async (next: string | null) => {
    if (!token) return
    setState({ kind: 'saving' })
    try {
      await saveRegisterPin(token, next)
      setIsSet(next !== null)
      setPin('')
      setRepeat('')
      setState({ kind: next === null ? 'removed' : 'saved' })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <Card className="register-settings">
      <h2>{t('admin.settings.register.pinTitle')}</h2>
      <p className="register-settings__status">
        {isSet === null ? t('admin.settings.register.pinLoading') : isSet ? t('admin.settings.register.pinIsSet') : t('admin.settings.register.pinNotSet')}
      </p>
      <form
        className="register-settings__form"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !mismatch && repeat === pin) void save(pin)
        }}
      >
        <Input
          id="register-pin"
          label={isSet ? t('admin.settings.register.newPinLabel') : t('admin.settings.register.pinLabel')}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          error={pin !== '' && !valid ? t('admin.settings.register.pinFormat') : undefined}
        />
        <Input
          id="register-pin-repeat"
          label={t('admin.settings.register.repeatPinLabel')}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={repeat}
          onChange={(event) => setRepeat(event.target.value.replace(/\D/g, ''))}
          error={mismatch ? t('admin.settings.register.pinMismatch') : undefined}
        />
        <div className="register-settings__actions">
          <Button type="submit" disabled={!valid || repeat !== pin || state.kind === 'saving'}>
            {t('admin.settings.register.savePin')}
          </Button>
          {isSet && (
            <Button type="button" variant="danger" onClick={() => void save(null)} disabled={state.kind === 'saving'}>
              {t('admin.settings.register.removePin')}
            </Button>
          )}
        </div>
      </form>
      {state.kind === 'saved' && <p className="register-settings__ok">{t('admin.settings.register.pinSaved')}</p>}
      {state.kind === 'removed' && <p className="register-settings__ok">{t('admin.settings.register.pinRemoved')}</p>}
      {state.kind === 'error' && <p className="register-settings__error">{state.message}</p>}
      <p className="register-settings__hint">{t('admin.settings.register.pinHint')}</p>
    </Card>
  )
}
