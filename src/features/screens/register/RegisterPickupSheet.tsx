import { useState } from 'react'
import { Spinner } from '../../../components'
import { useLanguage } from '../../../i18n'
import { LEGACY_PICKUP_CODE_LENGTH, normalizePickupCode } from '../../../lib/pickupCode'
import { RegisterSheet } from './RegisterSheet'
import type { PickupState } from './useRegisterScans'

interface RegisterPickupSheetProps {
  /** `null` while staff type a code by hand, before anything was looked up. */
  pickup: PickupState | null
  onSubmitCode: (code: string) => void
  onConfirmEarly: () => void
  onClose: () => void
}

/**
 * What a pickup scan did, big enough to read at a glance: handed over (with the customer's name and
 * items, to check against the bag), already picked up, not ready yet (with a button to hand it over
 * anyway), cancelled (don't hand it over), or no match. Also where staff type the code from the
 * customer's confirmation when a phone screen won't scan.
 */
export function RegisterPickupSheet({ pickup, onSubmitCode, onConfirmEarly, onClose }: RegisterPickupSheetProps) {
  const { t } = useLanguage()
  const [code, setCode] = useState('')

  if (!pickup || pickup.busy) {
    return (
      <RegisterSheet title={t('screenDisplay.register.pickupTitle')} onClose={onClose} className="register-sheet--pickup">
        <form
          className="register-pickup"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmitCode(code)
          }}
        >
          <label className="register-pickup__code">
            <span>{t('screenDisplay.register.pickupCodeLabel')}</span>
            <input
              value={code}
              maxLength={LEGACY_PICKUP_CODE_LENGTH + 2}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" className="order-sheet__action register__pay" disabled={normalizePickupCode(code) === null || pickup?.busy}>
            {pickup?.busy ? <Spinner size="sm" /> : t('screenDisplay.register.pickupLookUp')}
          </button>
        </form>
      </RegisterSheet>
    )
  }

  const outcome = pickup.outcome
  const order = 'order' in outcome ? outcome.order : undefined
  const tone = outcome.result === 'completed' ? 'ok' : outcome.result === 'alreadyCompleted' || outcome.result === 'notReady' ? 'attention' : 'error'

  return (
    <RegisterSheet title={t('screenDisplay.register.pickupTitle')} onClose={onClose} className="register-sheet--pickup">
      <div className={`register-pickup register-pickup--${tone}`} role="status">
        <p className="register-pickup__headline">{t(`screenDisplay.register.pickupResult.${outcome.result}`)}</p>
        {order && (
          <>
            <p className="register-pickup__customer">{order.customerName || order.displayNumber || '—'}</p>
            <ul className="register-pickup__items">
              {order.items.map((item) => (
                <li key={item.itemID}>{`${item.quantity}× ${item.name}`}</li>
              ))}
            </ul>
          </>
        )}
        <div className="register-pay__row">
          {outcome.result === 'notReady' && (
            <button type="button" className="order-sheet__action register__pay" onClick={onConfirmEarly}>
              {t('screenDisplay.register.handOverAnyway')}
            </button>
          )}
          <button type="button" className="order-sheet__action" onClick={onClose}>
            {t('screenDisplay.orders.close')}
          </button>
        </div>
      </div>
    </RegisterSheet>
  )
}
