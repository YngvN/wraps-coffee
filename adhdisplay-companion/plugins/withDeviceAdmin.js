// Expo config plugin: registers this app as a Device Admin Receiver — the
// prerequisite for `adb shell dpm set-device-owner` during Tier 2 kiosk
// provisioning (Update Channel spec §3.1/§3.2). Mirrors withBootLaunch.js's
// exact shape (a manifest mod + a dangerous-mod writing generated Kotlin
// source), the only other genuinely-native plugin in this app. Only affects
// the Android prebuild (`expo prebuild` / `expo run:android`); written fresh
// into android/ on every prebuild, not checked in.
//
// Deliberately minimal: this plugin and the receiver it generates are
// entirely inert until `dpm set-device-owner` is actually run during
// provisioning (§3.1) — installing this build doesn't change anything about
// how the app behaves on a normal (non-device-owner) unit. The receiver's
// own `onEnabled`/`onDisabled` only log; the actual kiosk lock task wiring
// (`setLockTaskPackages`/`startLockTask`) is commit 8's own scope, kept
// separate so a failure there doesn't implicate this receiver too — see
// that commit's own plugin for where it hooks in.
//
// PROVISIONAL — spec §7.2: whether `set-device-owner` even succeeds on the
// actual Toshiba/Vestel hardware (some vendor Android TV builds ship a
// preconfigured account or a provisioning restriction that blocks it even
// on a factory-fresh unit) is unverified. This plugin lands regardless,
// per this plan's own "write all 11 commits now, verify after" approach —
// if §7.2 fails on-device, this code is simply never exercised (Tier 2
// becomes unreachable fleet-wide), not wrong.
//
// Written in plain CommonJS, same reason as withBootLaunch.js: Expo
// resolves a `plugins` entry in app.json via a direct Node `require()`.
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Must match app.json's own "android.package" — same reasoning as
// withBootLaunch.js's own PACKAGE constant.
const PACKAGE = 'no.adhdisplay.companion'
const RECEIVER_CLASS = 'AdminReceiver'

const KOTLIN_SOURCE = `package ${PACKAGE}

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Registers this app as eligible for \`dpm set-device-owner\` (Update Channel
 * spec §3.1) via the matching <receiver> entry and res/xml/device_admin.xml
 * this same plugin writes — see plugins/withDeviceAdmin.js, which generates
 * this file during \`expo prebuild\`. Not checked in directly: regenerated
 * fresh on every prebuild, same as the rest of android/.
 *
 * Deliberately minimal — \`onEnabled\`/\`onDisabled\` only log. The actual
 * kiosk lock task wiring (\`setLockTaskPackages\`/\`startLockTask\`) is a
 * separate, later plugin's own concern, kept out of this file so a failure
 * there doesn't implicate this receiver too.
 */
class ${RECEIVER_CLASS} : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
    Log.i("${RECEIVER_CLASS}", "Device admin enabled")
  }

  override fun onDisabled(context: Context, intent: Intent) {
    super.onDisabled(context, intent)
    Log.i("${RECEIVER_CLASS}", "Device admin disabled")
  }
}
`

// Required by DeviceAdminReceiver — declares which device-admin policies this app can use.
// Kept minimal since this app's whole purpose for device-owner status is kiosk lock task mode
// and silent APK installs, neither of which needs traditional MDM policies (password rules,
// wipe, disable-camera, etc.). disable-keyguard-features is included as the one policy this
// app might plausibly need later (hiding the keyguard so a locked-task kiosk screen never
// shows a lock prompt after a reboot) rather than declaring a genuinely empty <uses-policies>,
// which some vendor DPC implementations have been inconsistent about accepting.
const DEVICE_ADMIN_XML = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <disable-keyguard-features />
    </uses-policies>
</device-admin>
`

function withDeviceAdminManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults
    const application = manifest.manifest.application?.[0]
    if (!application) return config

    application.receiver = application.receiver ?? []
    const hasReceiver = application.receiver.some((entry) => entry.$?.['android:name'] === `.${RECEIVER_CLASS}`)
    if (!hasReceiver) {
      application.receiver.push({
        $: {
          'android:name': `.${RECEIVER_CLASS}`,
          'android:exported': 'true',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
        },
        'meta-data': [{ $: { 'android:name': 'android.app.device_admin', 'android:resource': '@xml/device_admin' } }],
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' } }] }],
      })
    }
    return config
  })
}

function withDeviceAdminSource(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const packagePath = PACKAGE.split('.').join(path.sep)
      const javaDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', packagePath)
      fs.mkdirSync(javaDir, { recursive: true })
      fs.writeFileSync(path.join(javaDir, `${RECEIVER_CLASS}.kt`), KOTLIN_SOURCE, 'utf-8')

      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')
      fs.mkdirSync(xmlDir, { recursive: true })
      fs.writeFileSync(path.join(xmlDir, 'device_admin.xml'), DEVICE_ADMIN_XML, 'utf-8')

      return config
    },
  ])
}

module.exports = function withDeviceAdmin(config) {
  config = withDeviceAdminManifest(config)
  config = withDeviceAdminSource(config)
  return config
}
