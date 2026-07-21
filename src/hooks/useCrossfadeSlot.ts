import { useState } from 'react'

export interface CrossfadeSlotState<T> {
  /** Two permanently-mounted "slots" — each holds a frozen snapshot of whichever item last occupied it, unchanged until that slot is reused for a future item. */
  slots: [T | undefined, T | undefined]
  activeSlot: 0 | 1
}

interface InternalState<T> {
  slots: [T | undefined, T | undefined]
  activeSlot: 0 | 1
  lastKey: string | undefined
}

/**
 * Bookkeeping for a two-container crossfade: alternates which of two
 * permanently-mounted slots holds the "current" item, so a caller can
 * render both slots and animate opacity/position between them via
 * `animate`-prop retargeting instead of framer-motion's `AnimatePresence`
 * mount/unmount cycle. That distinction matters because an unmounting
 * child's own *props* are frozen mid-exit, but anything it merely
 * *inherits* from a live-updating ancestor (a CSS custom property, `font-
 * family: inherit`) is not — the still-visible exiting content flips to
 * the new look before its own fade-out finishes. Snapshotting `current`
 * into a slot up front and rendering purely from that frozen snapshot
 * sidesteps the problem entirely, for whatever kind of item `T` is (a
 * headline, a QR code's render props, a pane's own per-checkpoint content).
 *
 * `keyOf` identifies an item's own identity. The slot flip is computed
 * directly in the render body (React's own documented "adjusting state
 * when a prop changes" pattern — https://react.dev/learn/you-might-not-need-an-effect)
 * rather than in a `useEffect`, guarded so it only actually calls
 * `setState` when `keyOf(current)` differs from the last-seen key — this
 * avoids both an extra committed frame where the crossfade hasn't started
 * yet (an effect only runs *after* paint) and the `react-hooks/set-state-
 * in-effect` lint rule, which specifically targets state updates like this
 * one made unconditionally inside an effect body.
 *
 * While `keyOf(current)` stays the *same* as last render, the active slot's
 * own returned value still always tracks the latest `current` — only the
 * *inactive* (exiting) slot stays frozen at whatever it held when it last
 * stopped being active. This is what lets something like a pane's own
 * background-color edit (same checkpoint, no identity change) show up
 * immediately on the currently-active slot, while an actually-different
 * checkpoint's exiting content still doesn't inherit it mid-fade-out. Done
 * as a plain substitution on the *returned* array (no `setState`) so it
 * can't loop — `current` is typically a fresh object literal every render
 * regardless of whether anything meaningful changed, and diffing that by
 * reference here would re-render forever.
 */
export function useCrossfadeSlot<T>(current: T | undefined, keyOf: (item: T) => string): CrossfadeSlotState<T> {
  const [state, setState] = useState<InternalState<T>>(() => ({
    slots: [current, undefined],
    activeSlot: 0,
    lastKey: current ? keyOf(current) : undefined,
  }))

  const currentKey = current ? keyOf(current) : undefined
  if (current && currentKey !== state.lastKey) {
    const nextSlot = state.activeSlot === 0 ? 1 : 0
    const updatedSlots = [...state.slots] as [T | undefined, T | undefined]
    updatedSlots[nextSlot] = current
    setState({ slots: updatedSlots, activeSlot: nextSlot, lastKey: currentKey })
  }

  const slots = [...state.slots] as [T | undefined, T | undefined]
  if (current && currentKey === state.lastKey) slots[state.activeSlot] = current
  return { slots, activeSlot: state.activeSlot }
}
