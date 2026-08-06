// Expo config plugin: registers a BOOT_COMPLETED broadcast receiver that
// relaunches this app after the device reboots, so an unattended kiosk
// device recovers into its own standby/pairing/displaying state (see
// App.tsx) without anyone physically present to tap the app icon. This is
// the only genuinely native code anywhere in this app — every other module
// used elsewhere (expo-camera, react-native-webview, expo-keep-awake) is
// stock Expo with zero custom native code. Only affects the Android
// prebuild (`expo prebuild` / `expo run:android`); iOS, Windows, and Linux
// builds are untouched by this file.
//
// Written in plain CommonJS (not TypeScript) since Expo resolves a
// `plugins` entry in app.json via a direct Node `require()`, with no
// compile step of its own.
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Must match app.json's own "android.package" — this plugin doesn't read
// that value back out of the config object because by the time a config
// plugin runs, `android:name=".ClassName"` manifest entries are already
// resolved relative to the manifest's own package, so only the Kotlin
// source file itself (written by withBootLaunchSource below) needs the
// fully-qualified package name.
const PACKAGE = 'no.adhdisplay.companion'
const RECEIVER_CLASS = 'BootLaunchReceiver'

const KOTLIN_SOURCE = `package ${PACKAGE}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Relaunches ADHDisplay Companion's main activity after the device finishes
 * booting, so an unattended kiosk display recovers into its own
 * standby/pairing/displaying state (see App.tsx's own persisted
 * serverConnection/pairing state) without anyone physically present to tap
 * the app icon. Registered against android.intent.action.BOOT_COMPLETED in
 * AndroidManifest.xml — see plugins/withBootLaunch.js, which generates this
 * file and injects both this receiver and the RECEIVE_BOOT_COMPLETED
 * permission it needs during \`expo prebuild\`. Not checked in directly:
 * regenerated fresh on every prebuild, same as the rest of android/.
 *
 * Android 10+'s background-activity-launch restrictions behave differently
 * across cheap TV-box OEM skins — a receiver that reliably relaunches on
 * e.g. a Fire Stick isn't guaranteed to behave identically on a no-name
 * Android TV box. Budget for testing across the actual hardware variety
 * this is meant to run on, not a single-device smoke test (see this app's
 * own README).
 */
class ${RECEIVER_CLASS} : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    context.startActivity(launchIntent)
  }
}
`

function withBootLaunchManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults
    const application = manifest.manifest.application?.[0]
    if (!application) return config

    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] ?? []
    const hasPermission = manifest.manifest['uses-permission'].some(
      (entry) => entry.$?.['android:name'] === 'android.permission.RECEIVE_BOOT_COMPLETED',
    )
    if (!hasPermission) {
      manifest.manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED' } })
    }

    application.receiver = application.receiver ?? []
    const hasReceiver = application.receiver.some((entry) => entry.$?.['android:name'] === `.${RECEIVER_CLASS}`)
    if (!hasReceiver) {
      application.receiver.push({
        $: { 'android:name': `.${RECEIVER_CLASS}`, 'android:exported': 'true', 'android:enabled': 'true' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] }],
      })
    }
    return config
  })
}

function withBootLaunchSource(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const packagePath = PACKAGE.split('.').join(path.sep)
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', packagePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${RECEIVER_CLASS}.kt`), KOTLIN_SOURCE, 'utf-8')
      return config
    },
  ])
}

module.exports = function withBootLaunch(config) {
  config = withBootLaunchManifest(config)
  config = withBootLaunchSource(config)
  return config
}
