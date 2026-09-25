import { useEffect, useRef, useState } from 'react'
import { chargeWithZettle } from '../../../lib/companionBridge'
import {
  cancelPayment,
  checkoutByHand,
  pollPayment,
  reportDevicePayment,
  startPayment,
  type CheckoutRefusal,
  type RegisterCheckout,
  type RegisterPaymentIntent,
} from '../../../lib/registerApi'
import type { OrderRecord, PaymentMethod, PaymentProviderId } from '../../../types/order'

/** How often a QR payment is polled while the customer approves it in their app. */
const POLL_INTERVAL_MS = 2000

/**
 * Where the Pay dialog is:
 * - `choosing` — pick how the customer pays;
 * - `working` — a sale or payment start is in flight;
 * - `waiting` — a provider payment is in progress (a Vipps QR on screen, or the card reader);
 * - `done` — sold; the dialog shows the counter number;
 * - `refused` — the server refused the sale (a price changed, a product went sold out…);
 * - `failed` — the payment failed or couldn't be reached; `message` is shown as-is.
 */
export type CheckoutPhase =
  | { phase: 'choosing' }
  | { phase: 'working' }
  | { phase: 'waiting'; intent: RegisterPaymentIntent }
  | { phase: 'done'; order: OrderRecord }
  | { phase: 'refused'; refusal: CheckoutRefusal }
  | { phase: 'failed'; message: string }

interface Options {
  deviceId: string | null
  /** Called once per completed sale — clears the cart and prints the receipt if the pane says so. */
  onSold: (order: OrderRecord) => void
}

/** Runs the register's Pay dialog for one checkout at a time. */
export function useRegisterCheckout({ deviceId, onSold }: Options) {
  const [state, setState] = useState<CheckoutPhase | null>(null)
  const soldRef = useRef(onSold)
  useEffect(() => {
    soldRef.current = onSold
  })

  const finish = (order: OrderRecord) => {
    setState({ phase: 'done', order })
    soldRef.current(order)
  }

  /** Records the sale as paid by hand — the only way to take money until a provider is configured. */
  const payByHand = async (checkout: RegisterCheckout, method: PaymentMethod) => {
    if (!deviceId) return
    setState({ phase: 'working' })
    try {
      const result = await checkoutByHand(deviceId, checkout, method)
      if (result.ok) finish(result.order)
      else setState({ phase: 'refused', refusal: result })
    } catch (error) {
      setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Starts a provider payment; a card-reader payment is then taken on the tablet and reported back. */
  const payWithProvider = async (checkout: RegisterCheckout, provider: PaymentProviderId) => {
    if (!deviceId) return
    setState({ phase: 'working' })
    try {
      const started = await startPayment(deviceId, provider, checkout)
      if (!started.ok) {
        if (started.reason === 'unavailable') setState({ phase: 'failed', message: started.error })
        else setState({ phase: 'refused', refusal: started })
        return
      }
      setState({ phase: 'waiting', intent: started.intent })
      if (started.intent.start.kind === 'device') {
        const outcome = await chargeWithZettle({ reference: started.intent.id, amountMinor: Math.round(started.intent.totalPrice * 100) }).catch(() => ({ ok: false }))
        const settled = await reportDevicePayment(deviceId, started.intent.id, outcome.ok)
        if (settled.order) finish(settled.order)
        else setState({ phase: 'failed', message: settled.state })
      }
    } catch (error) {
      setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  // Polls a QR payment until it settles one way or the other.
  const waitingId = state?.phase === 'waiting' && state.intent.start.kind === 'qr' ? state.intent.id : null
  useEffect(() => {
    if (!waitingId || !deviceId) return
    let stopped = false
    const timer = setInterval(() => {
      pollPayment(deviceId, waitingId)
        .then((intent) => {
          if (stopped) return
          if (intent.order) {
            stopped = true
            finish(intent.order)
          } else if (intent.state !== 'pending') {
            stopped = true
            setState({ phase: 'failed', message: intent.state })
          }
        })
        .catch(() => undefined) // A missed poll is retried on the next tick.
    }, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [waitingId, deviceId])

  return {
    state,
    open: () => setState({ phase: 'choosing' }),
    /** Back to choosing, e.g. after a refusal once staff saw the new total. */
    retry: () => setState({ phase: 'choosing' }),
    close: () => {
      if (state?.phase === 'waiting' && deviceId) void cancelPayment(deviceId, state.intent.id)
      setState(null)
    },
    payByHand,
    payWithProvider,
  }
}
