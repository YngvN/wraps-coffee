import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Spinner } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { PaymentMethod, PaymentProviderId } from '../../../types/order'
import type { Product } from '../../../types/product'
import { CardIcon, CashIcon, DoneIcon, VippsLogo } from './RegisterIcons'
import { RegisterSheet } from './RegisterSheet'
import type { CheckoutPhase } from './useRegisterCheckout'

interface RegisterPayDialogProps {
  total: number
  state: CheckoutPhase
  /** Payment providers configured on the server, by the method they take. */
  providers: { id: PaymentProviderId; method: PaymentMethod }[]
  products: Product[]
  onPayByHand: (method: PaymentMethod) => void
  onPayWithProvider: (provider: PaymentProviderId) => void
  onRetry: () => void
  onPrint?: () => void
  onClose: () => void
}

const METHODS: PaymentMethod[] = ['card', 'cash', 'vipps']

/** The picture on each payment button: a card, a banknote, or the Vipps wordmark. */
function MethodIcon({ method }: { method: PaymentMethod }) {
  if (method === 'vipps') return <VippsLogo className="register-pay__vipps-logo" />
  return method === 'cash' ? <CashIcon className="register-pay__method-icon" /> : <CardIcon className="register-pay__method-icon" />
}

/** Cash amounts worth offering as "received": exact, then the next notes up. */
function cashSuggestions(total: number): number[] {
  const rounded = [50, 100, 200, 500, 1000].map((note) => Math.ceil(total / note) * note)
  return [...new Set([total, ...rounded])].filter((amount) => amount >= total).slice(0, 5)
}

/**
 * The Pay step. Each method either starts its configured payment provider (a Vipps QR on screen, or
 * the Zettle card reader) or, while none is configured, records the payment staff took on their own
 * terminal ("Paid by card"). Cash has a change calculator. Afterwards it shows the counter number and
 * where the order went (kitchen or handed over), with a receipt button.
 */
export function RegisterPayDialog({ total, state, providers, products, onPayByHand, onPayWithProvider, onRetry, onPrint, onClose }: RegisterPayDialogProps) {
  const { t, language } = useLanguage()
  const [cash, setCash] = useState<{ received: number } | null>(null)
  const price = (amount: number) => t('menu.price', { price: amount })
  const productName = (id?: string) => {
    const product = products.find((candidate) => candidate.itemID === id)
    return product ? product.name[language === 'en' ? 'en' : 'no'] || product.name.no : ''
  }

  let body
  if (state.phase === 'choosing' && cash) {
    body = (
      <div className="register-pay">
        <p className="register-pay__total">{price(total)}</p>
        <span className="orders-settings__label">{t('screenDisplay.register.cashReceived')}</span>
        <div className="register-pay__cash">
          {cashSuggestions(total).map((amount) => (
            <button
              key={amount}
              type="button"
              className={cash.received === amount ? 'register-pay__cash-option register-pay__cash-option--active' : 'register-pay__cash-option'}
              onClick={() => setCash({ received: amount })}
            >
              {amount === total ? t('screenDisplay.register.cashExact') : price(amount)}
            </button>
          ))}
        </div>
        <p className="register-pay__change">{t('screenDisplay.register.cashChange', { change: price(Math.max(0, cash.received - total)) })}</p>
        <div className="register-pay__row">
          <button type="button" className="order-sheet__action" onClick={() => setCash(null)}>
            {t('screenDisplay.register.back')}
          </button>
          <button type="button" className="order-sheet__action register__pay" onClick={() => onPayByHand('cash')}>
            {t('screenDisplay.register.confirmCash')}
          </button>
        </div>
      </div>
    )
  } else if (state.phase === 'choosing') {
    body = (
      <div className="register-pay">
        <p className="register-pay__total">{price(total)}</p>
        <div className="register-pay__methods">
          {METHODS.map((method) => {
            const provider = providers.find((candidate) => candidate.method === method)
            const onClick = () => {
              if (provider) onPayWithProvider(provider.id)
              else if (method === 'cash') setCash({ received: total })
              else onPayByHand(method)
            }
            return (
              <button key={method} type="button" className={`register-pay__method register-pay__method--${method}`} onClick={onClick}>
                <MethodIcon method={method} />
                <span>{provider || method === 'cash' ? t(`screenDisplay.register.method.${method}`) : t(`screenDisplay.register.paidBy.${method}`)}</span>
              </button>
            )
          })}
        </div>
        {providers.length === 0 && <p className="register-pay__hint">{t('screenDisplay.register.manualHint')}</p>}
      </div>
    )
  } else if (state.phase === 'working') {
    body = (
      <div className="register-pay register-pay--center">
        <Spinner />
      </div>
    )
  } else if (state.phase === 'waiting') {
    body =
      state.intent.start.kind === 'qr' ? (
        <div className="register-pay register-pay--center">
          <VippsLogo className="register-pay__qr-logo" />
          <div className="register-pay__qr">
            <QRCodeSVG value={state.intent.start.qrUrl} size={240} marginSize={2} />
          </div>
          <p>{t('screenDisplay.register.vippsScan', { total: price(state.intent.totalPrice) })}</p>
          <button type="button" className="order-sheet__action" onClick={onClose}>
            {t('screenDisplay.register.cancelPayment')}
          </button>
        </div>
      ) : (
        <div className="register-pay register-pay--center">
          <CardIcon className="register-pay__method-icon" />
          <Spinner />
          <p>{t('screenDisplay.register.followReader')}</p>
        </div>
      )
  } else if (state.phase === 'done') {
    body = (
      <div className="register-pay register-pay--center">
        <DoneIcon className="register-pay__done-icon" />
        <p className="register-pay__number">{state.order.displayNumber}</p>
        <p>{state.order.status === 'completed' ? t('screenDisplay.register.handedOver') : t('screenDisplay.register.sentToKitchen')}</p>
        <div className="register-pay__row">
          {onPrint && (
            <button type="button" className="order-sheet__action" onClick={onPrint}>
              {t('screenDisplay.orders.print')}
            </button>
          )}
          <button type="button" className="order-sheet__action register__pay" onClick={onClose}>
            {t('screenDisplay.register.newSale')}
          </button>
        </div>
      </div>
    )
  } else {
    const message =
      state.phase === 'failed'
        ? t('screenDisplay.register.paymentFailed', { error: state.message })
        : state.refusal.reason === 'priceChanged'
          ? t('screenDisplay.register.priceChanged', { total: price(state.refusal.totalPrice) })
          : t(`screenDisplay.register.refused.${state.refusal.reason}`, { name: productName(state.refusal.productId) })
    body = (
      <div className="register-pay register-pay--center">
        <p className="register__blocked">{message}</p>
        <button type="button" className="order-sheet__action" onClick={state.phase === 'refused' && state.refusal.reason === 'priceChanged' ? onClose : onRetry}>
          {state.phase === 'refused' && state.refusal.reason === 'priceChanged' ? t('screenDisplay.register.checkCart') : t('screenDisplay.register.back')}
        </button>
      </div>
    )
  }

  return (
    <RegisterSheet title={state.phase === 'done' ? t('screenDisplay.register.paid') : t('screenDisplay.register.payTitle')} onClose={onClose} className="register-sheet--pay">
      {body}
    </RegisterSheet>
  )
}
