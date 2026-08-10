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
 * pressing the wrong (or a duplicate) action. Not appropriate for a screen mixing this with
 * `TextInput`s that need real native focus for the on-screen keyboard (see
 * `ServerSetupScreen`'s own `'manual'` mode, which deliberately does NOT use this hook for
 * its buttons for exactly that reason).
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
