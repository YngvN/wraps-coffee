import { useCallback } from 'react'
import { sendCartEvent } from '../../../lib/registerApi'
import { generateId } from '../../../utils/id'
import { cartJournalEvent, type CartAction, type CartState } from './cartReducer'

/**
 * The cart's `dispatch`, plus `clear`, that also tell the journal about corrections before payment: a
 * line taken out or lowered, and a cart with items cleared (a void). Adding lines, the serving and the
 * name aren't journaled. The reset after a sale goes straight to `dispatch`, since that's no void.
 */
export function useJournaledCart(deviceId: string | null, cart: CartState, dispatch: (action: CartAction) => void) {
  const journaledDispatch = useCallback(
    (action: CartAction) => {
      const event = cartJournalEvent(cart, action)
      if (event && deviceId) void sendCartEvent(deviceId, event)
      dispatch(action)
    },
    [cart, deviceId, dispatch],
  )
  const clear = useCallback(() => {
    const event = cartJournalEvent(cart, { type: 'clear' })
    if (event && deviceId) void sendCartEvent(deviceId, event)
    dispatch({ type: 'reset', clientOrderId: generateId() })
  }, [cart, deviceId, dispatch])
  return { dispatch: journaledDispatch, clear }
}
