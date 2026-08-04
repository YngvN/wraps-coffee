import type { OrderRecord, OrderStatus } from '../../../src/types/order'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

const STATUS_OPTIONS: OrderStatus[] = ['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

/** Website (`admin.orders`), Wolt (`admin.woltOrders`), and Foodora (`admin.foodoraOrders`) orders live in three separate synced keys — see `OrdersView.tsx`'s own doc comment — merged here purely for search/lookup, newest first, same as that view's own `allOrders`. */
function liveOrders(): OrderRecord[] {
  const orders = (store.get('admin.orders')?.value as OrderRecord[] | undefined) ?? []
  const woltOrders = (store.get('admin.woltOrders')?.value as OrderRecord[] | undefined) ?? []
  const foodoraOrders = (store.get('admin.foodoraOrders')?.value as OrderRecord[] | undefined) ?? []
  return [...orders, ...woltOrders, ...foodoraOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

interface OrderFields {
  status: OrderStatus | null
}

/**
 * `status` only — every other field belongs to the order's own original
 * submission (see `OrderRecord`'s own doc comment; `OrdersView.tsx` itself
 * never edits anything else either). No `create`/`delete` — orders only
 * ever arrive from an external source (the public website via the Neon
 * bridge, or a delivery platform's own poller). The real UI imposes no
 * status-transition restriction (any status can be set to any other), so
 * `validate` doesn't invent one either. `source`/`externalId` ride along on
 * the draft so the actual commit (`AssistantPanel.tsx`) can dispatch to the
 * right one of three separate write paths — a plain synced-key write for a
 * website order, or a real push to the Wolt/Foodora API for those — exactly
 * mirroring `OrdersView.tsx`'s own three-way `updateStatus` branch.
 */
export const ordersEntity: AssistantEntity<OrderRecord> = {
  key: 'orders',
  supportedActions: ['update'],
  section: 'orders',

  fillFieldsSchema(): AssistantJsonSchema {
    return {
      type: 'object',
      properties: { status: nullable({ type: 'string', enum: STATUS_OPTIONS, description: "The order's new status." }) },
      required: ['status'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveOrders().filter(
      (order) => !needle || order.customerName.toLowerCase().includes(needle) || order.customerPhone.includes(needle) || order.id.toLowerCase().includes(needle),
    )
    return matches.slice(0, 30).map((order) => ({ id: order.id, label: `${order.customerName} — ${order.pickupTime} (${order.status})` }))
  },

  async getCurrent(id: string): Promise<OrderRecord | null> {
    return liveOrders().find((order) => order.id === id) ?? null
  },

  mergeDraft(_action, current, rawFields): OrderRecord {
    const fields = rawFields as OrderFields
    const base = current as OrderRecord
    return { ...base, status: fields.status ?? base.status }
  },

  validate(): AssistantValidationIssue[] {
    return []
  },

  reviewComponent() {
    return 'existingForm'
  },
}
