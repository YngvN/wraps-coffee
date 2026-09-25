/**
 * The register's order history as pure functions: which orders a filter and search keep, and how
 * they're grouped by day, newest first. Kept out of the component so the rules are testable.
 */
import { orderNumber } from '../../../lib/orderNumber'
import type { OrderRecord } from '../../../types/order'

/** Which orders the history shows: all of them, counter sales, website orders, or delivery-platform orders. */
export type HistorySource = 'all' | 'register' | 'website' | 'delivery'

/** One day's orders, newest first. `day` is `YYYY-MM-DD` in local time. */
export interface HistoryDay {
  day: string
  orders: OrderRecord[]
}

/** The local calendar day of an ISO timestamp, as `YYYY-MM-DD`. */
export function localDay(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function matchesSource(order: OrderRecord, source: HistorySource): boolean {
  const own = order.source ?? 'website'
  if (source === 'all') return true
  if (source === 'delivery') return own === 'wolt' || own === 'foodora'
  return own === source
}

/** Whether `order` matches the search text: its order number (see `orderNumber`), customer name, the end of its id, or an item name. */
function matchesSearch(order: OrderRecord, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  const haystack = [orderNumber(order), order.customerName, order.id.slice(-4), ...order.items.map((item) => item.name)].join(' ').toLowerCase()
  return haystack.includes(needle)
}

/** Filters, sorts newest first, and groups by local day. `limit` caps how many orders are returned in total (the list can hold months of sales). */
export function historyByDay(orders: OrderRecord[], source: HistorySource, search: string, limit: number): { days: HistoryDay[]; total: number } {
  const matching = orders.filter((order) => matchesSource(order, source) && matchesSearch(order, search)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const days: HistoryDay[] = []
  for (const order of matching.slice(0, limit)) {
    const day = localDay(order.createdAt)
    const last = days[days.length - 1]
    if (last?.day === day) last.orders.push(order)
    else days.push({ day, orders: [order] })
  }
  return { days, total: matching.length }
}
