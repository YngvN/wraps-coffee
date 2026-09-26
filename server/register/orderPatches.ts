/**
 * Small, targeted writes to `admin.registerOrders` the register makes after a sale: recording that its
 * receipt (or copy) was printed, and adding a return. Each re-reads the orders right before writing, so
 * nothing written in between is lost, and only ever changes the one order.
 */
import type { OrderRecord, OrderReturn } from '../../src/types/order'

export interface OrderPatchDeps {
  readOrders: () => OrderRecord[]
  writeOrders: (orders: OrderRecord[]) => void
}

/** Merges `patch` into one order's `receipt` (only if it has one). */
export function markReceipt(deps: OrderPatchDeps, orderId: string, patch: Partial<NonNullable<OrderRecord['receipt']>>): void {
  deps.writeOrders(deps.readOrders().map((order) => (order.id === orderId && order.receipt ? { ...order, receipt: { ...order.receipt, ...patch } } : order)))
}

/** Adds one return to an order's `returns`. */
export function addReturn(deps: OrderPatchDeps, orderId: string, entry: OrderReturn): void {
  deps.writeOrders(deps.readOrders().map((order) => (order.id === orderId ? { ...order, returns: [...(order.returns ?? []), entry] } : order)))
}
