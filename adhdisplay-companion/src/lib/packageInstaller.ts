import { NativeModules } from 'react-native'

interface PackageInstallerNativeModule {
  isDeviceOwner(): Promise<boolean>
  canRequestPackageInstalls(): Promise<boolean>
  downloadVerifyAndInstall(url: string): Promise<boolean>
}

/** `undefined` on any platform without the native module — iOS/web/Electron builds, or an Android build that predates commit 6/7's `withPackageInstaller.js` plugin. Every export below degrades gracefully rather than throwing when this is missing. */
const { PackageInstallerModule } = NativeModules as { PackageInstallerModule?: PackageInstallerNativeModule }

/**
 * Resolves this device's own real update tier (Update Channel spec §5.2/§1)
 * by asking the native module's own device-owner/install-unknown-apps
 * checks — replaces the `updateTier: 1` hardcoded in `pairing.ts` until
 * this module existed. Falls back to `1` (OTA-only) on any platform
 * without the native module, or if either native check itself throws —
 * same "fail toward the least-capable tier" posture as everywhere else in
 * this flow: claiming a tier this device doesn't actually have would make
 * the hub push a mechanism that can't work.
 */
export async function resolveUpdateTier(): Promise<1 | 2 | 3> {
  if (!PackageInstallerModule) return 1
  try {
    if (await PackageInstallerModule.isDeviceOwner()) return 2
    if (await PackageInstallerModule.canRequestPackageInstalls()) return 3
  } catch (err) {
    console.warn('[packageInstaller] tier resolution failed, falling back to tier 1', err)
  }
  return 1
}

/**
 * Downloads, verifies, and installs the hub's current APK — see
 * `PackageInstallerModule.kt`'s own doc comment for the full flow. Per
 * Update Channel spec §3.3.4, this promise resolving is **not** a success
 * signal (the process is expected to be killed mid-install on a
 * device-owner unit) — callers must not treat resolution as confirmation,
 * only a *rejection* here is meaningful (it means the flow failed before
 * ever reaching commit, e.g. a signature mismatch).
 */
export async function downloadVerifyAndInstall(url: string): Promise<void> {
  if (!PackageInstallerModule) throw new Error('PackageInstallerModule native module is not available on this platform')
  await PackageInstallerModule.downloadVerifyAndInstall(url)
}
