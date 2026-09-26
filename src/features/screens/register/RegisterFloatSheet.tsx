import { useState } from 'react'
import { useLanguage } from '../../../i18n'
import { saveFloat } from '../../../lib/registerReportApi'
import { RegisterAmountPad } from './RegisterAmountPad'
import { RegisterSheet } from './RegisterSheet'

interface RegisterFloatSheetProps {
  deviceId: string
  onSaved: () => void
  /** Closes without saving; the register asks again at the next sign-in. */
  onClose: () => void
}

/**
 * The opening float ("veksel"): at the first sign-in after a Z report, staff count the cash in the
 * drawer and enter it. It's journaled, and the Z report later compares the counted cash against it
 * plus the period's cash sales and refunds.
 */
export function RegisterFloatSheet({ deviceId, onSaved, onClose }: RegisterFloatSheetProps) {
  const { t } = useLanguage()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await saveFloat(deviceId, Number(amount || 0) * 100)
      onSaved()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <RegisterSheet title={t('screenDisplay.register.floatTitle')} onClose={onClose} className="register-sheet--pay">
      <div className="register-pin">
        <p className="register-pin__message">{t('screenDisplay.register.floatPrompt')}</p>
        <RegisterAmountPad value={amount} onChange={setAmount} />
        {failed && (
          <p className="register-pin__message register-pin__message--error" role="alert">
            {t('screenDisplay.register.saveFailed')}
          </p>
        )}
        <button type="button" className="order-sheet__action register__pay" onClick={() => void save()} disabled={busy || amount === ''}>
          {t('screenDisplay.register.floatSave', { amount: t('menu.price', { price: Number(amount || 0) }) })}
        </button>
      </div>
    </RegisterSheet>
  )
}
