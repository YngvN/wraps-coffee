import { useEffect, useRef } from 'react'
import { Animated, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'

interface FadeInViewProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Vertical distance (px) content slides up from while fading in. 0 disables the slide, leaving a plain fade. */
  slideDistance?: number
  duration?: number
  pointerEvents?: ViewProps['pointerEvents']
}

/**
 * Fades (and slides up into place) its children once, on mount.
 *
 * Pair with `key={...}` at the call site whenever the *same* JSX position can render genuinely
 * different content across renders (e.g. `ServerSetupScreen`'s own `mode` switch) — without a
 * key, React patches the existing element in place instead of remounting it, so this component's
 * mount-only animation would only ever play once for the whole screen's lifetime instead of
 * replaying on every state change. See `ServerSetupScreen.tsx` for exactly this pattern.
 */
export function FadeInView({ children, style, slideDistance = 16, duration = 280, pointerEvents }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(slideDistance)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
    ]).start()
    // Deliberately mount-only — see this component's own doc comment on using `key` to replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]} pointerEvents={pointerEvents}>
      {children}
    </Animated.View>
  )
}
