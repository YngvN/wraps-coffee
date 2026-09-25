import { useCallback, useMemo, useState } from 'react'
import { useFoodoraOrders } from '../../../hooks/useFoodoraOrders'
import { useOrders } from '../../../hooks/useOrders'
import { useWoltOrders } from '../../../hooks/useWoltOrders'
import { pushDisplayOrderStatus } from '../../../lib/localServer'
import type { OrderRecord, OrderSource, OrderStatus } from '../../../types/order'
import { filterBySources } from './orderColumns'

/** How long a server-confirmed move keeps showing as a pending overlay if the live data hasn't caught up by then. */
const CONFIRMED_OVERLAY_GRACE_MS = 3000

/** One status change made from this board — kept so the undo toast can reverse exactly it. */
export interface OrderMove {
  orderId: string
  from: OrderStatus
  to: OrderStatus
  /** Increments per move, so the toast restarts its timer even when the same order moves twice in a row. */
  seq: number
}

/** What `useOrderBoard` hands the board. */
export interface OrderBoard {
  /** Every order from the selected sources, with any in-flight change from this board already applied. */
  orders: OrderRecord[]
  /** Changes one order's status. A no-op while a change for that same order is still in flight. */
  move: (order: OrderRecord, to: OrderStatus) => void
  /** Reverses `lastMove`, if any, and clears it. */
  undo: () => void
  /** The most recent move, for the undo toast — `null` once undone or dismissed. */
  lastMove: OrderMove | null
  dismissLastMove: () => void
  /** Order id → the server's error message, for orders whose last change was rejected (e.g. Wolt refused it). Cleared by that order's next successful change. */
  failed: Record<string, string>
  /** Order ids with a change still in flight. */
  busy: ReadonlySet<string>
}

/**
 * State for a touch order board (an `'orders'` pane in staff mode).
 *
 * Reads orders from the same three synced keys the admin Orders view does, but never writes them
 * through those hooks' own setters: this page is the unauthenticated kiosk, so a synced-key write
 * would simply be rejected. Changes go through `pushDisplayOrderStatus` instead, which the server
 * applies to one order at a time. So the card doesn't wait a round trip to move, the new status is
 * shown immediately as a pending overlay. The overlay is dropped once the live data agrees, or
 * reverted (with the order flagged in `failed`) if the server refuses.
 *
 * `deviceId` is `null` when this page wasn't opened by a companion device (the admin preview, a
 * plain browser tab), and then `move` does nothing — the board renders read-only in that case anyway.
 */
export function useOrderBoard(sources: OrderSource[] | undefined, deviceId: string | null): OrderBoard {
  const [websiteOrders] = useOrders()
  const [woltOrders] = useWoltOrders()
  const [foodoraOrders] = useFoodoraOrders()
  const [pending, setPending] = useState<Record<string, OrderStatus>>({})
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [lastMove, setLastMove] = useState<OrderMove | null>(null)

  const live = useMemo(() => filterBySources([...websiteOrders, ...woltOrders, ...foodoraOrders], sources), [websiteOrders, woltOrders, foodoraOrders, sources])

  // A pending entry is only needed until the live data agrees with it — dropped here during render
  // (React's recommended pattern for state derived from props) rather than in an effect, so there's
  // never a frame where a stale overlay fights the synced value.
  const settled = Object.keys(pending).filter((id) => live.find((order) => order.id === id)?.status === pending[id])
  if (settled.length > 0) {
    setPending((current) => {
      const next = { ...current }
      for (const id of settled) delete next[id]
      return next
    })
  }

  const orders = useMemo(() => live.map((order) => (pending[order.id] && pending[order.id] !== order.status ? { ...order, status: pending[order.id] } : order)), [live, pending])
  const busy = useMemo(() => new Set(Object.keys(pending)), [pending])

  const send = useCallback(
    (orderId: string, to: OrderStatus, onSuccess: () => void) => {
      if (!deviceId) return
      setPending((current) => ({ ...current, [orderId]: to }))
      pushDisplayOrderStatus(deviceId, orderId, to)
        .then(() => {
          onSuccess()
          // The live data normally settles this entry within a moment (see `settled` above), but only
          // if it ever shows exactly this status — a reconnect snapshot that already holds a *later*
          // status (someone else moved it on) never would, leaving the card locked on a stale overlay.
          // The server has confirmed the change, so the overlay is dropped after a grace period anyway.
          setTimeout(() => {
            setPending((current) => {
              if (current[orderId] !== to) return current
              const next = { ...current }
              delete next[orderId]
              return next
            })
          }, CONFIRMED_OVERLAY_GRACE_MS)
          setFailed((current) => {
            if (!(orderId in current)) return current
            const next = { ...current }
            delete next[orderId]
            return next
          })
        })
        .catch((error: unknown) => {
          setPending((current) => {
            const next = { ...current }
            delete next[orderId]
            return next
          })
          setFailed((current) => ({ ...current, [orderId]: error instanceof Error ? error.message : String(error) }))
        })
    },
    [deviceId],
  )

  const move = useCallback(
    (order: OrderRecord, to: OrderStatus) => {
      if (busy.has(order.id) || order.status === to) return
      const from = order.status
      send(order.id, to, () => setLastMove((previous) => ({ orderId: order.id, from, to, seq: (previous?.seq ?? 0) + 1 })))
    },
    [busy, send],
  )

  const undo = useCallback(() => {
    if (!lastMove) return
    setLastMove(null)
    send(lastMove.orderId, lastMove.from, () => {})
  }, [lastMove, send])

  const dismissLastMove = useCallback(() => setLastMove(null), [])

  return { orders, move, undo, lastMove, dismissLastMove, failed, busy }
}
