import type { OrderRecord, OrderSource, OrderStatus } from '../../../types/order'
import { orderNumber } from '../../../lib/orderNumber'

/** The four columns of the order board. `history` is the overflow column for finished/cancelled orders. */
export type BoardColumn = 'incoming' | 'doing' | 'done' | 'history'

/** The three live columns of the board, in display order. */
export const BOARD_COLUMNS: readonly Exclude<BoardColumn, 'history'>[] = ['incoming', 'doing', 'done']

/** Maps an order's status to the board column it belongs in. */
export function columnOf(status: OrderStatus): BoardColumn {
  switch (status) {
    case 'received':
    case 'accepted':
      return 'incoming'
    case 'preparing':
      return 'doing'
    case 'ready':
      return 'done'
    case 'completed':
    case 'cancelled':
      return 'history'
  }
}

/** The status an order moves to when advanced one step forward, or `undefined` when it's already terminal. */
export function nextStatus(status: OrderStatus): OrderStatus | undefined {
  switch (status) {
    case 'received':
    case 'accepted':
      return 'preparing'
    case 'preparing':
      return 'ready'
    case 'ready':
      return 'completed'
    case 'completed':
    case 'cancelled':
      return undefined
  }
}

/** The status an order reverts to when stepped one step back, or `undefined` when there is no earlier status. */
export function prevStatus(status: OrderStatus): OrderStatus | undefined {
  switch (status) {
    case 'received':
    case 'accepted':
      return undefined
    case 'preparing':
      return 'received'
    case 'ready':
      return 'preparing'
    case 'completed':
      return 'ready'
    case 'cancelled':
      return 'ready'
  }
}

/** Which lane an order belongs to: delivery platforms go to `delivery`, everything else to `pickup`. */
export type OrderLane = 'pickup' | 'delivery'

/** Returns the lane an order belongs to, based on its source. */
export function laneOf(order: OrderRecord): OrderLane {
  if (order.source === 'wolt' || order.source === 'foodora') {
    return 'delivery'
  }
  return 'pickup'
}

/** Filters orders by their sources. `undefined` or an empty list keeps every order; a missing source counts as `'website'`. */
export function filterBySources(orders: OrderRecord[], sources: OrderSource[] | null | undefined): OrderRecord[] {
  // `null` too: an assistant-drafted pane carries its schema's nulls straight through (see `screenPane.ts`'s `mergeDraft`).
  if (!sources || sources.length === 0) {
    return orders
  }
  return orders.filter((order) => sources.includes(order.source ?? 'website'))
}

/** Returns a NEW array of orders sorted by pickup time ascending, ties broken by creation time ascending. */
export function sortByPickup(orders: OrderRecord[]): OrderRecord[] {
  return [...orders].sort((a, b) => a.pickupTime.localeCompare(b.pickupTime) || a.createdAt.localeCompare(b.createdAt))
}

/** Returns a NEW array of finished/cancelled orders created since the later of local midnight and `now - historyHours`, newest first. */
export function historyOrders(orders: OrderRecord[], now: Date, historyHours: number): OrderRecord[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const cutoff = Math.max(midnight, now.getTime() - historyHours * 60 * 60 * 1000)
  return orders.filter((order) => columnOf(order.status) === 'history' && new Date(order.createdAt).getTime() >= cutoff).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Whole minutes elapsed between an ISO date-time string and `now`, never below 0. */
export function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000))
}

/** Classifies an age in minutes against the warn/late thresholds. */
export function ageLevel(minutes: number, thresholds: [number, number]): 'ok' | 'warn' | 'late' {
  if (minutes >= thresholds[1]) {
    return 'late'
  }
  if (minutes >= thresholds[0]) {
    return 'warn'
  }
  return 'ok'
}

/** True when the notes contain any of the keywords as a substring, ignoring case. Empty notes or keywords match nothing. */
export function matchesNoteKeyword(notes: string | undefined, keywords: string[]): boolean {
  if (!notes || keywords.length === 0) {
    return false
  }
  const lower = notes.toLocaleLowerCase()
  return keywords.some((keyword) => {
    const trimmed = keyword.trim().toLocaleLowerCase()
    return trimmed !== '' && lower.includes(trimmed)
  })
}

/** Sums item quantities across all orders, grouped by item name (trimmed), sorted by quantity descending then name ascending. Items a register order already handed over at the counter (`servedAtCounter`) aren't counted — the kitchen has nothing to make for them. */
export function summariseItems(orders: OrderRecord[]): { name: string; quantity: number }[] {
  const totals = new Map<string, number>()
  for (const order of orders) {
    for (const item of order.items) {
      if (order.servedAtCounter?.includes(item.itemID)) continue
      const name = item.name.trim()
      totals.set(name, (totals.get(name) ?? 0) + item.quantity)
    }
  }
  return [...totals.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
}

/** Formats a customer as a short display name (e.g. "Jane D.") plus the order's number to call (see `orderNumber`: `K7M2Q` for a website order, `W…`/`F…` for Wolt/Foodora, `K12` for a counter sale). */
export function customerOrderLabel(order: OrderRecord): { name: string; number: string } {
  const words = order.customerName
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
  let name = ''
  if (words.length === 1) {
    name = words[0]
  } else if (words.length > 1) {
    name = `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`
  }
  const number = orderNumber(order)
  return { name, number }
}
