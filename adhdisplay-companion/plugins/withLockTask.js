// Expo config plugin: enters Android's real "lock task" kiosk mode
// (Update Channel spec §3.2) on a device-owner-provisioned unit — this is
// the authoritative kiosk signal for those units, replacing the WebView
// user-agent marker (`applicationNameForUserAgent` in `DisplayScreen.tsx`)
// which stays in place as the fallback signal for every non-device-owner
// unit (Tier 3, or a unit whose provisioning window was missed — see that
// file's own doc comment; unchanged by this plugin).
//
// Deliberately doesn't touch AdminReceiver.kt (plugins/withDeviceAdmin.js's
// own generated file) — both setLockTaskPackages() and startLockTask() are
// called from MainActivity.kt instead, since `setLockTaskPackages()` is
// idempotent (safe to call every activity start, not just once at
// `onEnabled()`) and `startLockTask()` can only be called from an Activity
// in the first place. This keeps commit 6 and this plugin fully
// independent files, matching AdminReceiver.kt's own doc comment ("the
// actual kiosk lock task wiring is a separate, later plugin's own concern,
// kept out of this file so a failure there doesn't implicate this receiver
// too").
//
// Only affects the Android prebuild; written fresh into android/ on every
// prebuild, not checked in. Written in plain CommonJS, same reason as
// every other plugin in this directory.
const { withMainActivity } = require('expo/config-plugins')

// The exact line RN/Expo's own MainActivity template generates inside onCreate(), right after
// setTheme — see that file's own generated shape. Targeted narrowly (not just "does
// startLockTask() appear anywhere") so re-running prebuild is idempotent rather than appending a
// second block every time.
const ON_CREATE_SUPER_CALL = 'super.onCreate(null)'

const LOCK_TASK_IMPORTS = 'import android.app.admin.DevicePolicyManager\nimport android.content.ComponentName\nimport android.content.Context'

const LOCK_TASK_BLOCK = `

    // Real kiosk lockdown (Update Channel spec §3.2) — only on a device-owner-provisioned unit;
    // every other unit (Tier 3, or one whose provisioning window was missed) falls through with
    // no effect, same as before this plugin existed, and keeps relying on the WebView user-agent
    // marker as its own kiosk signal instead. setLockTaskPackages() is idempotent, so calling it
    // on every onCreate (not just once at device-owner enrollment time) is safe — see
    // plugins/withLockTask.js's own doc comment for why this isn't done from AdminReceiver.kt.
    val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
      val adminComponent = ComponentName(this, AdminReceiver::class.java)
      devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(packageName))
      startLockTask()
    }`

module.exports = function withLockTask(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withLockTask: expected a Kotlin android/app/.../MainActivity.kt')
    }
    let contents = config.modResults.contents

    if (!contents.includes(ON_CREATE_SUPER_CALL)) {
      throw new Error(
        'withLockTask: could not find the expected "super.onCreate(null)" line in MainActivity.kt to ' +
          'insert lock task logic after — the RN/Expo template may have changed.',
      )
    }

    if (!contents.includes('import android.content.ComponentName')) {
      contents = contents.replace('import android.os.Bundle', `import android.os.Bundle\n${LOCK_TASK_IMPORTS}`)
    }

    if (!contents.includes('devicePolicyManager.isDeviceOwnerApp(packageName)')) {
      contents = contents.replace(ON_CREATE_SUPER_CALL, `${ON_CREATE_SUPER_CALL}${LOCK_TASK_BLOCK}`)
    }

    config.modResults.contents = contents
    return config
  })
}
