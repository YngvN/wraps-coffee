import type { OrderRecord } from '../../../types/order'

/** A sale made in training mode: the server saves no order for it, so its id marks it (see `server/register/training.ts`). */
export function isPracticeSale(order: OrderRecord): boolean {
  return order.id.startsWith('training-')
}
