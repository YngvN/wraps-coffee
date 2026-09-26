/**
 * Validates the checkout part of a register request body — shared by the manual checkout route and
 * the payment-start route, which sell the same cart two different ways.
 */
import type { RegisterOrderInput } from './orders'
import type { CartLineInput, Serving } from '../../src/lib/registerPricing'

/** Most lines one checkout may carry — a sanity bound, far above any real counter order. */
const MAX_LINES = 60

function parseLine(value: unknown): CartLineInput | null {
  const line = value as Partial<CartLineInput> | null
  if (!line || typeof line.productId !== 'string' || typeof line.quantity !== 'number') return null
  return { productId: line.productId, quantity: line.quantity, allowSoldOut: line.allowSoldOut === true }
}

/** The checkout fields of `body`, or `null` when any are missing or malformed. Quantities and products are checked later, by pricing. */
export function parseCheckout(body: Record<string, unknown>): Omit<RegisterOrderInput, 'payment' | 'lockedCart' | 'registerNumber'> | null {
  const { clientOrderId, lines, serving, expectedTotal, customerName } = body
  if (typeof clientOrderId !== 'string' || clientOrderId.length < 8 || clientOrderId.length > 64) return null
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) return null
  if (serving !== 'takeaway' && serving !== 'eatIn') return null
  if (typeof expectedTotal !== 'number' || !Number.isFinite(expectedTotal)) return null
  const parsed = lines.map(parseLine)
  if (parsed.some((line) => line === null)) return null
  return {
    clientOrderId,
    lines: parsed as CartLineInput[],
    serving: serving as Serving,
    expectedTotal,
    customerName: typeof customerName === 'string' ? customerName : undefined,
  }
}
