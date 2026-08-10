import { useEffect, useRef, useState } from 'react'
import { subscribeToRemoteKeyEvents } from '../lib/remoteKeyEvents'

/**
 * JS-driven up/down/select D-pad navigation across a fixed list of `itemCount` actions —
 * moves a `selectedIndex` (wrapping) on up/down, calls `onSelect(selectedIndex)` on select.
 *
 * This exists because plain `react-native` on Android never bridges native View focus
 * changes to JS at all (confirmed by reading RN's own `ReactViewManager.java`/
 * `ReactViewGroup.java` — no `OnFocusChangeListener`, no event dispatch to JS anywhere).
 * `Pressable`/`TouchableOpacity`'s own `onFocus`/`onBlur` only ever fire from the JS-side
 * touch-responder system, never from real D-pad-driven Android focus traversal — verified
 * on real hardware: `adb shell uiautomator dump` proved native focus really did move
 * between sibling buttons, but nothing told JS it happened. So unlike a typical web/RN-web
 * "focused" style, a real TV focus ring here has to come from a JS-owned selection state,
 * driven by the same native D-pad bridge `useRemoteNav`/`RemoteNavHud` already use
 * (`plugins/withKeyEventBridge.js` -> `onRemoteKeyEvent` -> `remoteKeyEvents.ts`).
 *
 * Callers must also render their items with `focusable={false}` (see `FocusableButton`'s
 * own `focused` prop) so Android's native focus/click system has nothing to land on among
 * them — `withKeyEventBridge.js`'s `dispatchKeyEvent` always forwards D-pad presses to
 * `super.dispatchKeyEvent()` in addition to emitting the bridge event, so leaving these
 * items natively focusable risks a second, independent native focus/click system running
 * in parallel and drifting out of sync with this hook's own `selectedIndex` — silently
 * pressing the wrong (or a duplicate) action.
 *
 * A screen that also has real `TextInput`s needing native focus for the on-screen keyboard
 * (`ServerSetupScreen`'s own `'manual'` mode) can still use this hook for 100% of its navigable
 * items, `TextInput`s included, but real focus must only ever be taken *imperatively, once, as
 * the direct result of an explicit "select" press* on that item's own index — never reactively
 * off `selectedIndex` changing as the person merely browses past it. An earlier version did the
 * reactive version (a plain effect keyed on `selectedIndex`, calling `.focus()` on whichever
 * `TextInput` ref it currently pointed at) — confirmed on real hardware that this breaks D-pad
 * input entirely, not just for that one input: the moment a `TextInput` gains real native focus
 * this way, the native key-event bridge this hook itself depends on
 * (`withKeyEventBridge.js` -> `onRemoteKeyEvent` -> `remoteKeyEvents.ts`) stops receiving events
 * at all, even before any keyboard is visibly shown. See `ServerSetupScreen`'s own
 * `dpadItemCount` doc comment for the full account, including why plain `onFocus`/`onBlur`
 * (this hook's own usual recommendation, see above) doesn't work as a fallback for `TextInput`
 * either on this hardware.
 */
export function useDpadNav(itemCount: number, onSelect: (index: number) => void, enabled = true): number {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // A mode switch (different itemCount) starts back at the first item rather than carrying
  // over a now-possibly-out-of-range index from whatever was previously showing.
  useEffect(() => {
    setSelectedIndex(0)
  }, [itemCount])

  useEffect(() => {
    if (!enabled || itemCount === 0) return
    return subscribeToRemoteKeyEvents((key) => {
      if (key === 'select') {
        onSelectRef.current(selectedIndexRef.current)
        return
      }
      const delta = key === 'up' ? -1 : 1
      setSelectedIndex((current) => (current + delta + itemCount) % itemCount)
    })
  }, [enabled, itemCount])

  return selectedIndex
}
