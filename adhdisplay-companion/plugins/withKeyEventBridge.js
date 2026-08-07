// Expo config plugin: bridges Android D-pad key events (up/down/select)
// from MainActivity's own dispatchKeyEvent into JS via DeviceEventEmitter
// — the mechanism Remote Screen Navigation (commit 10b) is built on.
//
// This exists because `useTVEventHandler`/`TVEventHandler` — the "normal"
// way an RN app reads TV remote input — is a `react-native-tvos`-fork-only
// API. This project runs plain `react-native` (confirmed: no
// `@react-native-tvos/config-tv` plugin, no `EXPO_TV` env var anywhere in
// `scripts/build-tv-apk.js`, `node_modules/react-native/package.json` is
// the plain package, not the fork), so that API genuinely doesn't exist
// here — see the plan's own "round 2" correction for the full reasoning.
// Patching `dispatchKeyEvent` directly is the realistic alternative,
// consistent with how this app already handles every other native gap
// (`withBootLaunch.js`, `withReleaseSigning.js`: patch generated native
// source rather than pull in a different toolchain).
//
// Deliberately narrow: only KEYCODE_DPAD_UP/DOWN/CENTER are intercepted
// and consumed; every other key — critically, KEYCODE_BACK — always falls
// through to `super.dispatchKeyEvent(event)` untouched. This is the fix
// for a real bug an earlier draft of this plan had: `dispatchKeyEvent`
// sees BACK before it ever reaches `ReactActivity`'s own `onBackPressed()`-
// driven `BackHandler` flow, so a bridge that swallowed BACK too would
// silently break `App.tsx`'s existing triple-back disconnect gesture. Back
// handling during remote-nav browse mode (commit 10b) stays entirely in
// that JS-level `BackHandler` listener, never here.
//
// PROVISIONAL — this is the single highest-risk unknown in the whole
// Update Channel / Remote Screen Navigation plan, for a more fundamental
// reason than most other provisional items here: it's not just "does this
// work correctly," it's "does the event-delivery mechanism exist at all."
// Two things are unverified without the actual Toshiba/Vestel hardware:
// (1) do D-pad events reach the Activity at all while the WebView holds
// focus, or does the WebView swallow them first; (2) does KEYCODE_BACK
// still reach the existing BackHandler after this bridge is installed (the
// no-consume design above should guarantee this, but "should" isn't
// "verified on-device"). See this repo's own plan file for the exact adb
// commands to run once a unit is connected via USB — that verification
// has NOT been run as part of writing this code.
//
// Only affects the Android prebuild; written fresh into android/ on every
// prebuild, not checked in. Written in plain CommonJS, same reason as
// every other plugin in this directory.
const { withMainActivity } = require('expo/config-plugins')

const GET_MAIN_COMPONENT_NAME_LINE = 'override fun getMainComponentName(): String = "main"'

// The doc comment RN/Expo's own template generates immediately above getMainComponentName() —
// anchoring the insertion point on this whole block (not just the method line) keeps that
// comment attached to its own method instead of ending up sandwiched above dispatchKeyEvent.
const GET_MAIN_COMPONENT_NAME_BLOCK = `  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  ${GET_MAIN_COMPONENT_NAME_LINE}`

const DISPATCH_KEY_EVENT_IMPORTS =
  'import android.view.KeyEvent\nimport com.facebook.react.ReactApplication\nimport com.facebook.react.bridge.ReactContext\nimport com.facebook.react.modules.core.DeviceEventManagerModule'

const DISPATCH_KEY_EVENT_METHOD = `  /**
   * Bridges D-pad up/down/select to JS as "onRemoteKeyEvent" (Remote Screen
   * Navigation, commit 10b) — see plugins/withKeyEventBridge.js's own doc
   * comment for why this exists and why KEYCODE_BACK is deliberately never
   * touched here. event.repeatCount == 0 drops a held key's own
   * auto-repeat events rather than spamming JS with them; the OK-commit
   * gate in the JS state machine is what actually matters for correctness,
   * this is just about not flooding the bridge.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val keyName = when (event.keyCode) {
      KeyEvent.KEYCODE_DPAD_UP -> "up"
      KeyEvent.KEYCODE_DPAD_DOWN -> "down"
      KeyEvent.KEYCODE_DPAD_CENTER -> "select"
      else -> null
    }
    if (keyName != null) {
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        val reactContext = (application as ReactApplication).reactNativeHost.reactInstanceManager.currentReactContext
        if (reactContext is ReactContext) {
          reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("onRemoteKeyEvent", keyName)
        }
      }
      return true // consume both DOWN and UP for these keycodes so neither reaches the WebView underneath
    }
    return super.dispatchKeyEvent(event)
  }

`

module.exports = function withKeyEventBridge(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withKeyEventBridge: expected a Kotlin android/app/.../MainActivity.kt')
    }
    let contents = config.modResults.contents

    if (!contents.includes(GET_MAIN_COMPONENT_NAME_BLOCK)) {
      throw new Error(
        'withKeyEventBridge: could not find the expected getMainComponentName() doc comment + declaration in ' +
          'MainActivity.kt to insert dispatchKeyEvent before — the RN/Expo template may have changed.',
      )
    }

    if (!contents.includes('import android.view.KeyEvent')) {
      contents = contents.replace('import android.os.Bundle', `import android.os.Bundle\n${DISPATCH_KEY_EVENT_IMPORTS}`)
    }

    if (!contents.includes('override fun dispatchKeyEvent(event: KeyEvent)')) {
      contents = contents.replace(GET_MAIN_COMPONENT_NAME_BLOCK, `${DISPATCH_KEY_EVENT_METHOD}${GET_MAIN_COMPONENT_NAME_BLOCK}`)
    }

    config.modResults.contents = contents
    return config
  })
}
