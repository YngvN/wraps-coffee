import { useEffect, useRef, useState } from 'react'
import type { OrderRecord } from '../../../types/order'

/** How long a new order's card flashes. */
const FLASH_MS = 2500

/** An order only counts as "new" if it was placed this recently. Stops the first data snapshot after a page load (or a reconnect) from chiming for every order already waiting. */
const NEW_ORDER_MAX_AGE_MS = 2 * 60_000

/** Plays a short two-note chime with WebAudio — no audio file to ship or preload. Swallows the error a browser throws when autoplay isn't allowed yet (a desktop tab before any click); the companion's WebView allows it. */
function playChime() {
  try {
    const context = new AudioContext()
    const notes = [880, 1318.5]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + index * 0.18
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.5)
    })
    setTimeout(() => void context.close(), 1200)
  } catch {
    // No audio available — the flash still shows.
  }
}

/**
 * Watches the Incoming orders and returns the ids that just arrived, for their cards to flash. Also
 * chimes when `chime` is on. An id counts as arrived only the first time this board sees it *and*
 * only if the order was placed within `NEW_ORDER_MAX_AGE_MS` — so moving an order back into Incoming,
 * or the initial load, never triggers it.
 */
export function useNewOrderAlert(incoming: OrderRecord[], chime: boolean): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null)
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set())
  // Each arrival's un-flash timer is kept here rather than returned as the effect's cleanup: the
  // effect re-runs whenever the order list changes, which would otherwise cancel a pending un-flash
  // and leave that card flashing for good.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const first = seen.current === null
    const known = seen.current ?? new Set<string>()
    const now = Date.now()
    const arrived = incoming.filter((order) => !known.has(order.id) && !first && now - new Date(order.createdAt).getTime() < NEW_ORDER_MAX_AGE_MS)
    for (const order of incoming) known.add(order.id)
    seen.current = known
    if (arrived.length === 0) return

    if (chime) playChime()
    const ids = arrived.map((order) => order.id)
    setFlashing((current) => new Set([...current, ...ids]))
    const timeout = setTimeout(() => {
      timers.current.delete(timeout)
      setFlashing((current) => new Set([...current].filter((id) => !ids.includes(id))))
    }, FLASH_MS)
    timers.current.add(timeout)
  }, [incoming, chime])

  return flashing
}
