import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

const FOCUSED_PADDING_BOOST = 4
const GROW_DURATION_MS = 150

/**
 * Animated extra padding for a `useDpadNav`-selected item's focus ring, so the button's own box
 * grows slightly while selected — a plain, monotonic size change, not a "settling into place"
 * bounce (see below for why an earlier version had one).
 *
 * Deliberately animates padding, not a `transform: [{ scale }]` — an earlier version did exactly
 * that, which scales the whole subtree including its `Text` child, and scaled text rendered
 * visibly wrong (blurry/misshapen glyphs) on real Android TV hardware. Growing padding instead
 * grows only the button's own box; the label inside keeps its native, unscaled font rendering.
 * Not `useNativeDriver`-safe (padding isn't a supported native-driver property, unlike a plain
 * transform), but this is a small element animating on an infrequent D-pad move, not a
 * perf-sensitive case.
 *
 * Uses `Animated.timing` with a no-overshoot easing curve, not `Animated.spring` — an earlier
 * version used a spring (`friction: 6, tension: 80`), which is significantly underdamped for
 * that tension (critical friction there is ~17.9, more than double what was set), so it visibly
 * overshot past the target padding and oscillated back before settling — reported on real
 * hardware as the whole button/row "bouncing" rather than just growing. A fixed-duration easeOut
 * timing can't overshoot by construction, giving the "just bigger or smaller" feel actually
 * wanted here.
 *
 * Returns the *extra* padding to add on top of a call site's own base padding via
 * `Animated.add(basePadding, useFocusGrow(focused))` — not a full replacement value, since
 * different call sites (`FocusableButton`'s two variants, `ServerRow`) each have their own base
 * padding.
 */
export function useFocusGrow(focused: boolean) {
  const extraPadding = useRef(new Animated.Value(focused ? FOCUSED_PADDING_BOOST : 0)).current

  useEffect(() => {
    Animated.timing(extraPadding, {
      toValue: focused ? FOCUSED_PADDING_BOOST : 0,
      duration: GROW_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [focused, extraPadding])

  return extraPadding
}
