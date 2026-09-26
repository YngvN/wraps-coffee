import { useState } from 'react'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderReturn, ReturnReason } from '../../../types/order'
import { RegisterSheet } from './RegisterSheet'

const REASONS: ReturnReason[] = ['wrongItem', 'complaint', 'changedMind', 'other']

interface RegisterReturnSheetProps {
  order: OrderRecord
  /** Makes the return (see `useRegisterReceipts`); resolves with it, or why not. */
  onReturn: (request: {
    lines: { itemID: string; quantity: number }[]
    reason: ReturnReason
    note?: string
  }) => Promise<{ ok: true; return: OrderReturn } | { ok: false; reason: string }>
  onClose: () => void
}

/** How many of each line haven't been returned yet (mirrors the server's `returnableQuantities`). */
function leftToReturn(order: OrderRecord): Map<string, number> {
  const left = new Map(order.items.map((item) => [item.itemID, item.quantity]))
  for (const done of order.returns ?? []) for (const line of done.lines) left.set(line.itemID, (left.get(line.itemID) ?? 0) - line.quantity)
  return left
}

/**
 * A return against one counter sale, for a manager: pick how many of each line come back (never more
 * than was sold and not already returned), why, and confirm. The server journals it as a
 * "Returkvittering" with negative amounts and prints it; the money goes back the way the sale was paid
 * — a cash refund opens the drawer, a card or Vipps refund is done on the terminal.
 */
export function RegisterReturnSheet({ order, onReturn, onClose }: RegisterReturnSheetProps) {
  const { t } = useLanguage()
  const left = leftToReturn(order)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<ReturnReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lines = order.items.filter((item) => (left.get(item.itemID) ?? 0) > 0)
  const total = lines.reduce((sum, item) => sum + item.unitPrice * (quantities[item.itemID] ?? 0), 0)
  const ready = total > 0 && reason !== null && (reason !== 'other' || note.trim() !== '')
  const method = order.payment?.method ?? 'card'

  const set = (itemID: string, quantity: number) => setQuantities((current) => ({ ...current, [itemID]: Math.max(0, Math.min(left.get(itemID) ?? 0, quantity)) }))

  const confirm = async () => {
    if (!ready || !reason) return
    setBusy(true)
    setError(null)
    const result = await onReturn({
      lines: lines.map((item) => ({ itemID: item.itemID, quantity: quantities[item.itemID] ?? 0 })).filter((line) => line.quantity > 0),
      reason,
      note: note.trim() || undefined,
    })
    setBusy(false)
    if (result.ok) onClose()
    else setError(t(`screenDisplay.register.returnError.${result.reason}`))
  }

  return (
    <RegisterSheet title={t('screenDisplay.register.returnTitle', { number: order.displayNumber ?? '' })} onClose={onClose} className="register-sheet--editor">
      <div className="register-return">
        <p className="register-editor__hint">{t('screenDisplay.register.returnOf', { number: order.receipt?.number ?? '' })}</p>
        {lines.length === 0 && <p>{t('screenDisplay.register.returnNothingLeft')}</p>}
        <ul className="register-return__lines">
          {lines.map((item) => {
            const chosen = quantities[item.itemID] ?? 0
            return (
              <li key={item.itemID} className="register-return__line">
                <span className="register__line-name">
                  {item.name}
                  <small>{t('screenDisplay.register.returnLeft', { count: left.get(item.itemID) ?? 0 })}</small>
                </span>
                <div className="register__stepper">
                  <button type="button" onClick={() => set(item.itemID, chosen - 1)} disabled={chosen <= 0} aria-label={t('screenDisplay.register.decrease')}>
                    −
                  </button>
                  <span className="register__quantity">{chosen}</span>
                  <button
                    type="button"
                    onClick={() => set(item.itemID, chosen + 1)}
                    disabled={chosen >= (left.get(item.itemID) ?? 0)}
                    aria-label={t('screenDisplay.register.increase')}
                  >
                    +
                  </button>
                </div>
                <span className="register__line-price">{t('menu.price', { price: item.unitPrice * chosen })}</span>
              </li>
            )
          })}
        </ul>
        <span className="register-return__label">{t('screenDisplay.register.returnReason')}</span>
        <div className="register__chips">
          {REASONS.map((option) => (
            <button key={option} type="button" className={reason === option ? 'register__chip register__chip--active' : 'register__chip'} onClick={() => setReason(option)}>
              {t(`receipt.reason.${option}`)}
            </button>
          ))}
        </div>
        {reason === 'other' && (
          <input
            className="register-return__note"
            value={note}
            maxLength={200}
            placeholder={t('screenDisplay.register.returnNotePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
        <p className="register-editor__hint">{t(`screenDisplay.register.refundHow.${method}`)}</p>
        {error && (
          <p className="register-pin__message register-pin__message--error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="order-sheet__action register__pay" onClick={() => void confirm()} disabled={!ready || busy}>
          {t('screenDisplay.register.returnConfirm', { amount: t('menu.price', { price: total }) })}
        </button>
      </div>
    </RegisterSheet>
  )
}
