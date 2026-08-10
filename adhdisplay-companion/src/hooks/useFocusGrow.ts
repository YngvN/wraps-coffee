import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

const FOCUSED_PADDING_BOOST = 4

/**
 * Animated extra padding for a `useDpadNav`-selected item's focus ring, so the button's own box
 * grows slightly while selected — a "settling into place" feel instead of an instant snap.
 *
 * Deliberately animates padding, not a `transform: [{ scale }]` — an earlier version did exactly
 * that, which scales the whole subtree including its `Text` child, and scaled text rendered
 * visibly wrong (blurry/misshapen glyphs) on real Android TV hardware. Growing padding instead
 * grows only the button's own box; the label inside keeps its native, unscaled font rendering.
 * Not `useNativeDriver`-safe (padding isn't a supported native-driver property, unlike a plain
 * transform), but this is a small element animating on an infrequent D-pad move, not a
 * perf-sensitive case.
 *
 * Returns the *extra* padding to add on top of a call site's own base padding via
 * `Animated.add(basePadding, useFocusGrow(focused))` — not a full replacement value, since
 * different call sites (`FocusableButton`'s two variants, `ServerRow`) each have their own base
 * padding.
 */
export function useFocusGrow(focused: boolean) {
  const extraPadding = useRef(new Animated.Value(focused ? FOCUSED_PADDING_BOOST : 0)).current

  useEffect(() => {
    Animated.spring(extraPadding, { toValue: focused ? FOCUSED_PADDING_BOOST : 0, useNativeDriver: false, friction: 6, tension: 80 }).start()
  }, [focused, extraPadding])

  return extraPadding
}
