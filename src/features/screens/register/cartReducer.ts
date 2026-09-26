/**
 * The register's cart as a pure reducer, so every rule is testable without rendering: a scanned or
 * tapped product adds one (or bumps the line), a sale or Clear starts a fresh cart with a new
 * `clientOrderId`, and a line never drops below one (removing is its own action).
 */
import type { CartLineInput, Serving } from '../../../lib/registerPricing'
import { MAX_LINE_QUANTITY } from '../../../lib/registerPricing'
import type { CartJournalEvent } from '../../../lib/registerApi'

/** The cart's state. */
export interface CartState {
  lines: CartLineInput[]
  serving: Serving
  /** The id this cart will be sold under — see `RegisterCheckout.clientOrderId`. */
  clientOrderId: string
  /** Optional name to call out when the order is ready. */
  customerName: string
}

/** Everything that can happen to the cart. */
export type CartAction =
  | { type: 'add'; productId: string; allowSoldOut?: boolean }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'setServing'; serving: Serving }
  | { type: 'setCustomerName'; name: string }
  /** Empties the cart (after a sale, or Clear). `clientOrderId` is the next sale's id. */
  | { type: 'reset'; clientOrderId: string }

/** An empty cart. */
export function emptyCart(clientOrderId: string, serving: Serving = 'takeaway'): CartState {
  return { lines: [], serving, clientOrderId, customerName: '' }
}

/** Applies one action. The serving choice survives a reset, since a counter usually sells mostly one way. */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find((line) => line.productId === action.productId)
      if (!existing) return { ...state, lines: [...state.lines, { productId: action.productId, quantity: 1, allowSoldOut: action.allowSoldOut }] }
      if (existing.quantity >= MAX_LINE_QUANTITY) return state
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.productId === action.productId ? { ...line, quantity: line.quantity + 1, allowSoldOut: line.allowSoldOut || action.allowSoldOut } : line,
        ),
      }
    }
    case 'setQuantity': {
      const quantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.round(action.quantity)))
      return { ...state, lines: state.lines.map((line) => (line.productId === action.productId ? { ...line, quantity } : line)) }
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.productId !== action.productId) }
    case 'setServing':
      return { ...state, serving: action.serving }
    case 'setCustomerName':
      return { ...state, customerName: action.name }
    case 'reset':
      return emptyCart(action.clientOrderId, state.serving)
  }
}

/**
 * What `action` on `cart` means for the journal: taking a line out or lowering its quantity is a line
 * correction (with how many came off), and staff clearing a cart with items in it (`clear`, not the
 * reset after a sale) is a void. Anything else — adding, raising a quantity, the serving, the name —
 * is `null`.
 */
export function cartJournalEvent(cart: CartState, action: CartAction | { type: 'clear' }): CartJournalEvent | null {
  if (action.type === 'clear') {
    return cart.lines.length > 0 ? { kind: 'void', lines: cart.lines.map(({ productId, quantity }) => ({ productId, quantity })), serving: cart.serving } : null
  }
  if (action.type !== 'remove' && action.type !== 'setQuantity') return null
  const line = cart.lines.find((candidate) => candidate.productId === action.productId)
  if (!line) return null
  const next = action.type === 'remove' ? 0 : Math.max(0, action.quantity)
  if (next >= line.quantity) return null
  return { kind: 'lineCorrection', correction: next === 0 ? 'removed' : 'decreased', lines: [{ productId: line.productId, quantity: line.quantity - next }], serving: cart.serving }
}
