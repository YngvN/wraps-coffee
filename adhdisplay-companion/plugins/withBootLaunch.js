// Expo config plugin: registers a broadcast receiver that relaunches this
// app right after this app's own package is replaced in place
// (MY_PACKAGE_REPLACED) — that is what makes a Tier 2/3 self-install
// (packageInstaller.ts) actually bring the kiosk screen back afterward
// instead of leaving it dead on the launcher home screen; Android kills the
// process on package replace and does not relaunch it on its own.
//
// RELAUNCH-ON-BOOT IS DELIBERATELY OFF. This plugin used to also register
// BOOT_COMPLETED (plus the RECEIVE_BOOT_COMPLETED permission) so an
// unattended display would come back on its own after a power cut. That was
// turned off on request; it is not a regression and not an oversight. To put
// it back, re-add 'android.permission.RECEIVE_BOOT_COMPLETED' to the
// permissions list below and the BOOT_COMPLETED action to the receiver's own
// intent-filter, and restore the matching branch in RECEIVER_SOURCE's
// onReceive — nothing else in this file, or in RelaunchService, is
// boot-specific. Note the app's own README and docs/INSTALL-TV.md still
// describe auto-launch-on-boot as a platform capability; only this Android
// receiver is disabled.
//
// This is the only genuinely native code
// anywhere in this app — every other module used elsewhere (expo-camera,
// react-native-webview, expo-keep-awake) is stock Expo with zero custom
// native code. Only affects the Android prebuild (`expo prebuild` /
// `expo run:android`); iOS, Windows, and Linux builds are untouched by this
// file.
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
const SERVICE_CLASS = 'RelaunchService'

const RECEIVER_SOURCE = `package ${PACKAGE}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Triggers ADHDisplay Companion's own recovery-to-foreground path right after
 * this app's own package is replaced in place, so an unattended kiosk display
 * recovers into its own standby/pairing/displaying state (see App.tsx's own
 * persisted serverConnection/pairing state) without anyone physically present
 * to tap the app icon. Registered against android.intent.action.MY_PACKAGE_REPLACED
 * in AndroidManifest.xml — see plugins/withBootLaunch.js, which generates this
 * file and injects this receiver plus the permissions/service it needs during
 * \`expo prebuild\`. Not checked in directly: regenerated fresh on every
 * prebuild, same as the rest of android/.
 *
 * Relaunch after a device REBOOT (BOOT_COMPLETED) is deliberately not
 * registered — see the header comment in plugins/withBootLaunch.js for why
 * and for exactly what to restore to turn it back on.
 *
 * Deliberately does NOT call startActivity() directly — confirmed on this
 * app's own real hardware that Android 10+'s background-activity-launch
 * restrictions block that: the process restarts (Android spins one up just
 * to deliver the broadcast) but the activity never comes forward, leaving
 * the screen on whatever was already showing. Starting a foreground service
 * from a receiver IS allowed regardless of those restrictions, so the actual
 * startActivity() call happens inside \`${SERVICE_CLASS}\` instead — see that
 * class's own doc comment for how it gets its own exemption from the same
 * restriction. This split (receiver just dispatches, service does the real
 * work) is the whole workaround; still unverified whether it fully holds up
 * across every OEM Android TV skin, only confirmed to fix it on the one real
 * unit this was tested against.
 */
class ${RECEIVER_CLASS} : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    context.startForegroundService(Intent(context, ${SERVICE_CLASS}::class.java))
  }
}
`

const SERVICE_SOURCE = `package ${PACKAGE}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.WindowManager
import android.widget.FrameLayout

/**
 * A brief foreground service whose only job is bringing ADHDisplay
 * Companion's own main activity back to the foreground after
 * \`${RECEIVER_CLASS}\` dispatches to it (BOOT_COMPLETED or
 * MY_PACKAGE_REPLACED — see that class's own doc comment for why this has to
 * be a separate service rather than a plain startActivity() call from the
 * receiver itself).
 *
 * Being a foreground service does NOT, on its own, exempt this app from
 * Android 10+'s background-activity-launch restrictions — the one documented
 * exemption reachable without device-owner status is holding the
 * SYSTEM_ALERT_WINDOW ("draw over other apps") permission AND actively
 * showing an overlay window at the exact moment startActivity() is called.
 * This service grants itself that brief window: adds a 1x1, untouchable,
 * invisible overlay, calls startActivity(), then tears both the overlay and
 * itself down immediately. SYSTEM_ALERT_WINDOW is a "special app access"
 * that has to be granted once per device (Settings, or
 * \`adb shell appops set ${PACKAGE} SYSTEM_ALERT_WINDOW allow\`) — if it isn't
 * granted, \`canDrawOverlays\` is false and this just falls back to a plain
 * startActivity() call, no worse off than not having this service at all.
 *
 * PROVISIONAL, same posture as this app's own runtime-update-URL-override
 * and device-owner-provisioning risks: this exact combination (foreground
 * service + brief SYSTEM_ALERT_WINDOW overlay) is a well-known community
 * workaround for this restriction, not something Android formally documents
 * as guaranteed-to-work on every OEM skin — confirmed only on this app's own
 * real target hardware, not verified elsewhere.
 */
class ${SERVICE_CLASS} : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    showForegroundNotification()
    relaunchWithOverlayExemption()
    stopSelf()
    return START_NOT_STICKY
  }

  private fun relaunchWithOverlayExemption() {
    val canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    val overlayType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
    val overlayView = FrameLayout(this)
    val params = WindowManager.LayoutParams(
      1,
      1,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    )

    if (canOverlay) {
      try {
        windowManager.addView(overlayView, params)
      } catch (e: Exception) {
        // Best-effort — if this fails, the startActivity() call below still gets attempted,
        // just without the exemption this overlay was meant to grant it.
      }
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    if (launchIntent != null) {
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      startActivity(launchIntent)
    }

    if (canOverlay) {
      try {
        windowManager.removeView(overlayView)
      } catch (e: Exception) {
        // Already gone / never successfully added — nothing to clean up.
      }
    }
  }

  /** Every foreground service must show a notification — kept at minimum importance/priority since this is purely a background recovery step, not something the person in front of the TV needs to see. */
  private fun showForegroundNotification() {
    val channelId = "relaunch"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(channelId, "App recovery", NotificationManager.IMPORTANCE_MIN))
    }
    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channelId) else Notification.Builder(this)
    val notification = builder
      .setContentTitle("Reopening ADHDisplay Companion")
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(1, notification)
    }
  }
}
`

function withBootLaunchManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults
    const application = manifest.manifest.application?.[0]
    if (!application) return config

    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] ?? []
    const permissions = [
      // RECEIVE_BOOT_COMPLETED deliberately omitted — relaunch-on-reboot is off, see this file's
      // own header comment. The three below are for the package-replace relaunch path only.
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    ]
    for (const permission of permissions) {
      const hasPermission = manifest.manifest['uses-permission'].some((entry) => entry.$?.['android:name'] === permission)
      if (!hasPermission) {
        manifest.manifest['uses-permission'].push({ $: { 'android:name': permission } })
      }
    }

    application.receiver = application.receiver ?? []
    const hasReceiver = application.receiver.some((entry) => entry.$?.['android:name'] === `.${RECEIVER_CLASS}`)
    if (!hasReceiver) {
      application.receiver.push({
        $: { 'android:name': `.${RECEIVER_CLASS}`, 'android:exported': 'true', 'android:enabled': 'true' },
        'intent-filter': [
          {
            // BOOT_COMPLETED deliberately absent — see this file's own header comment.
            action: [{ $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } }],
          },
        ],
      })
    }

    application.service = application.service ?? []
    const hasService = application.service.some((entry) => entry.$?.['android:name'] === `.${SERVICE_CLASS}`)
    if (!hasService) {
      application.service.push({
        $: { 'android:name': `.${SERVICE_CLASS}`, 'android:exported': 'false', 'android:foregroundServiceType': 'specialUse' },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Reopens the kiosk display after a remote app update, since Android blocks a plain broadcast receiver from doing so directly',
            },
          },
        ],
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
      fs.writeFileSync(path.join(dir, `${RECEIVER_CLASS}.kt`), RECEIVER_SOURCE, 'utf-8')
      fs.writeFileSync(path.join(dir, `${SERVICE_CLASS}.kt`), SERVICE_SOURCE, 'utf-8')
      return config
    },
  ])
}

module.exports = function withBootLaunch(config) {
  config = withBootLaunchManifest(config)
  config = withBootLaunchSource(config)
  return config
}
