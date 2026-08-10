import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { useFocusGrow } from '../hooks/useFocusGrow'

export type FocusableButtonVariant = 'primary' | 'link'

interface FocusableButtonProps {
  onPress: () => void
  children: string
  variant?: FocusableButtonVariant
  /**
   * Externally-controlled focus ring, driven by a `useDpadNav` selection index (see that
   * hook's own doc comment for why this can't just be tracked internally via
   * `onFocus`/`onBlur` — those never fire for real D-pad focus on plain `react-native`
   * Android). Passing this (even `false`) switches the button to `focusable={false}` +
   * no `hasTVPreferredFocus`, removing it from Android's native D-pad focus chain entirely
   * so `useDpadNav`'s own JS-driven selection is the sole system deciding what "select"
   * does — leave unset for a screen that still relies on native focus instead (e.g.
   * `ServerSetupScreen`'s `'manual'` mode, whose buttons sit next to `TextInput`s that need
   * real native focus for the on-screen keyboard).
   */
  focused?: boolean
  hasTVPreferredFocus?: boolean
}

const BUTTON_PADDING = { vertical: 12, horizontal: 24 }
const LINK_PADDING = { vertical: 8, horizontal: 10 }

/**
 * A button/link that shows a visible ring while selected — either via an externally-owned
 * `useDpadNav` index (`focused` prop) or, when that's not supplied, plain native Android
 * focus placement (`hasTVPreferredFocus`) with no ring (real native D-pad focus changes
 * never reach JS at all on plain `react-native` Android — see `useDpadNav`'s own doc
 * comment for the full explanation; that's exactly why the controlled `focused` prop
 * exists as the only way this ring can ever be correct).
 *
 * `variant="primary"` (gold fill) gets a white focus ring for contrast against its own
 * fill; `variant="link"` (plain text) gets a gold ring, matching `ServerSetupScreen`'s own
 * `serverRowFocused` treatment for its list rows. Padding (not the label's own font size)
 * grows slightly while focused — see `useFocusGrow`'s own doc comment for why a `transform:
 * scale` on the whole button was tried first and reverted (it scaled the text too, which
 * rendered visibly wrong on real hardware).
 */
export function FocusableButton({ onPress, children, variant = 'primary', focused, hasTVPreferredFocus }: FocusableButtonProps) {
  const isPrimary = variant === 'primary'
  const isControlled = focused !== undefined
  const padding = isPrimary ? BUTTON_PADDING : LINK_PADDING
  const extraPadding = useFocusGrow(focused ?? false)
  return (
    <TouchableOpacity
      style={[
        isPrimary ? styles.button : styles.linkButton,
        focused && (isPrimary ? styles.buttonFocused : styles.linkButtonFocused),
        { paddingVertical: Animated.add(padding.vertical, extraPadding), paddingHorizontal: Animated.add(padding.horizontal, extraPadding) },
      ]}
      onPress={onPress}
      hasTVPreferredFocus={isControlled ? undefined : hasTVPreferredFocus}
      focusable={isControlled ? false : undefined}
      activeOpacity={0.7}
    >
      <Text style={isPrimary ? styles.buttonText : styles.linkText}>{children}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  // borderColor starts transparent (rather than the button only gaining a border once
  // focused) so the focus ring doesn't shift layout/reflow neighboring elements when it
  // appears.
  button: { backgroundColor: '#dfa93e', borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  buttonFocused: { borderColor: '#fff' },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
  linkButton: { borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  linkButtonFocused: { borderColor: '#dfa93e' },
  linkText: { color: '#8ab4f8', fontSize: 14 },
})
