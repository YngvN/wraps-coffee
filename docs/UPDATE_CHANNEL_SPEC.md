# ADHDisplay Companion Update Channel — spec (reconstructed)

This document did not exist as a checked-in file before this session, despite being referenced
throughout the codebase by section number (`§1`–`§7.2`) since the commit that introduced the whole
feature (`7ee5b83`, "Big update"). It's reconstructed here from those scattered code comments —
`server/updates.ts`, `server/deviceSocket.ts`, `adhdisplay-companion/src/lib/packageInstaller.ts`,
`adhdisplay-companion/src/lib/updates.ts`, the three plugins under `adhdisplay-companion/plugins/`,
and `src/features/admin/settings/DeveloperDocsView.tsx` — plus what was actually confirmed or
changed by real testing during two sessions' worth of work getting OTA and Tier 3 working
end-to-end on a real device. Treat the "confirmed" callouts below as more trustworthy than the
reconstructed prose around them — the original document (if it ever existed anywhere outside a
single commit's own authoring context) is gone; this is a best-effort rebuild, not a recovered
original.

## §1 — Update tiers

Every `mobile` (ADHDisplay Companion) entry in `admin.displayMachines` carries an `updateTier: 1 | 2 | 3`
(`src/types/displayMachine.ts`), self-reported fresh on **every** heartbeat (not cached from
pairing — confirmed via code: `resolveUpdateTier()` runs inside `sendHeartbeat()` itself, so a tier
change becomes visible to the hub within one heartbeat interval, ≤20s, no app restart required):

- **Tier 1 — OTA only.** The default/fallback tier. JS-only bundle updates via Expo's Updates
  Protocol v1 (§2). No native code push possible without a new APK sideloaded by hand (or Tier 2/3,
  once reachable).
- **Tier 2 — silent APK install.** Requires the device be provisioned as an Android **device
  owner** (`dpm set-device-owner`, §3.1) — a factory-reset-time-only operation. `isDeviceOwner()`
  device-owner apps install a pushed APK with no on-device confirmation dialog.
- **Tier 3 — prompted APK install.** Requires only the `REQUEST_INSTALL_PACKAGES` app-op
  ("install unknown apps") be granted for this app — no factory reset needed, grantable at any time
  via `adb shell appops set no.adhdisplay.companion REQUEST_INSTALL_PACKAGES allow` or the device's
  own Settings → Apps → "Install unknown apps" toggle. A pushed APK install shows Android's own
  system confirmation dialog, which someone has to physically tap "Install" on.

## §2 — Tier 1 (OTA) mechanism

- **§2.1** — The hub never relies on `expo-updates`' own `checkAutomatically: ON_ERROR_RECOVERY`
  setting alone (a kiosk can run for weeks without ever restarting/crashing) — the real trigger is
  a `check-update` message pushed over the device's persistent WebSocket connection
  (`server/deviceSocket.ts`), which the client wires to `Updates.checkForUpdateAsync()` →
  `fetchUpdateAsync()` → `reloadAsync()` (`adhdisplay-companion/src/lib/updates.ts`).
- **§2.2** — The manifest response is `multipart/mixed`, framed per Expo's Updates Protocol v1.
  **Confirmed the hard way this session**: the real `expo-updates` Android client reads the
  `expo-signature` header off the **manifest part's own headers** inside the multipart body
  (`FileDownloader.kt`'s `parseMultipartRemoteUpdateResponse`), not a top-level HTTP response
  header — `server/updates.ts`'s `handleUpdatesManifest`/`writeMultipartPart` now attach it there
  specifically because of this; the original implementation attached it top-level only and every
  real-device check failed with `"No expo-signature header specified"` despite the header being
  present and valid one level up.
- **§2.3** — OTA eligibility is scoped by `runtimeVersion`, resolved via Expo's `fingerprint`
  policy (`app.json`'s `runtimeVersion.policy`) — any change that alters the fingerprint (native
  config, not just JS) requires a fresh native build; the previously-published bundle for the old
  fingerprint simply never matches a device that's moved to a new one.
- **§2.4** — Manifests are code-signed (`adhdisplay-companion/codeSigning/`) so a compromised or
  spoofed LAN host can't push an unsigned update — the client's own `codeSigningCertificate` in
  `app.json` is what it verifies the server's signature against.
- **§2.6** — Display Manager's "revert to previous update" pins a runtime version's *served*
  bundle back to the second-newest by `createdAt` (`setRollbackFlag`/`resolveServedUpdate` in
  `server/updates.ts`) and immediately pushes the reload trigger to every affected device — not a
  passive flag an admin has to separately re-trigger per device.

## §3 — Tier 2/3 (native APK) mechanism

- **§3.1** — Tier 2 device-owner provisioning: `dpm set-device-owner
  no.adhdisplay.companion/.AdminReceiver`, which only succeeds on a device with **no accounts ever
  added** (i.e. factory-reset, before first sign-in) — this cannot be retrofitted onto an
  already-in-use unit without wiping it. `plugins/withDeviceAdmin.js` provides the minimal
  `AdminReceiver`/`device_admin.xml` this requires; `build-tv-apk.js`'s own `assertNotTestOnly()`
  guard exists specifically because `dpm set-device-owner` rejects a `testOnly` build outright.
- **§3.2** — Once device-owner, `plugins/withLockTask.js` puts the app into real kiosk lock-task
  mode (`setLockTaskPackages`/`startLockTask`).
- **§3.3 / §3.3.2** — `PackageInstallerModule.downloadVerifyAndInstall()` (native, generated by
  `plugins/withPackageInstaller.js`) downloads the hub's `GET /updates/apk/current` over plain
  HTTP (untrusted transport — a shared LAN), verifies the downloaded bytes' own signing certificate
  against a hardcoded `EXPECTED_CERT_SHA256` fingerprint **before** committing, then installs via
  Android's real `PackageInstaller` session API. Same code path for Tier 2 and Tier 3 — the OS
  itself decides silent-vs-prompted based on this app's actual privilege level, not anything this
  function chooses.
- **§3.3.4** — The installing process is expected to be killed mid-install once the commit's own
  `PendingIntent` fires. `downloadVerifyAndInstall()`'s promise resolving is **not** a success
  signal — the only real confirmation is the next heartbeat reporting the target `versionCode`
  (`pushUpdateTriggersForNewEntries`/heartbeat handler in `server/index.ts`).
- **§3.4** — A pending update run (OTA or APK) with no confirming heartbeat within
  `UPDATE_FAILURE_TIMEOUT_MS` (10 minutes) gets marked `update-failed`, swept once a minute
  (`server/index.ts`). No automatic retry — a failed unattended update needs a human, not a retry
  loop running against a wall-mounted screen.
- **§3.5 (new this session)** — **A Tier 2/3 self-install does not bring the app's own UI back to
  the foreground on its own without extra work.** Android kills the process on package replace and
  does not relaunch it; a plain `BroadcastReceiver` reacting to `MY_PACKAGE_REPLACED` and calling
  `startActivity()` directly is blocked by Android 10+'s background-activity-launch restrictions —
  **confirmed on this app's own real target hardware** (the process restarted, `dumpsys` showed
  zero activity entries, the screen stayed on whatever was already showing). The working fix,
  also confirmed on real hardware: the receiver instead calls `startForegroundService()` (allowed
  from a receiver regardless of BAL restrictions), and that service briefly shows an invisible
  `SYSTEM_ALERT_WINDOW` overlay — one of the few BAL exemptions reachable without device-owner
  status — for the exact moment it calls `startActivity()`, then tears both down immediately. See
  `plugins/withBootLaunch.js` (`RelaunchService`) — `SYSTEM_ALERT_WINDOW` has to be granted once
  per device the same way `REQUEST_INSTALL_PACKAGES` does (`adb shell appops set
  no.adhdisplay.companion SYSTEM_ALERT_WINDOW allow`, or the device's own "draw over other apps"
  Settings toggle).

## §4 — Tier 3's one-time grant

`canRequestPackageInstalls()` (native, `PackageInstallerModule.kt`) — below API 26 there's no
per-app gate at all (a single global Settings toggle covers every app), so this resolves `true`
unconditionally on those devices.

## §5 — Hub-side decisions

- **§5.1 / §6** — Retention is the *publish process's* job, not enforced by the serving routes
  themselves: OTA bundles keep current+previous per runtime version (newest/second-newest by
  `createdAt`, no separate index file); the APK publish route added this session
  (`handleUpdatesApkPublish` in `server/updates.ts`) prunes to the newest 3 `versionCode`s'
  `.apk` files on every publish.
- **§5.2** — Tier resolution happens **client-side** (`resolveUpdateTier()`), reported fresh every
  heartbeat — the hub only ever reads whatever the device most recently claimed, it never computes
  or overrides a tier itself.
- **§5.3** — Update state resolution (`resolveDisplayUpdateState`,
  `src/utils/displayUpdateState.ts`) is a single shared pure function, deterministic, imported by
  both `server/index.ts` and `DisplayManagerView.tsx` directly — "not in UI" means there is exactly
  one source of truth for the resolution logic, not that the server computes it separately.
- **§5.4** — Which mechanism actually fires (`check-update` vs `install-update`) is decided
  **server-side**, fresh from the machine's own currently-known `updateTier`
  (`pushUpdateTriggersForNewEntries` in `server/index.ts`) — never trusting whatever tier-implied
  shape the admin UI happened to queue the entry with. A stale/wrong client-side assumption about a
  device's tier can't force the wrong mechanism onto it.
- **§5.5** — A device's own screen assignment doesn't gate or interact with its update tier at all
  — they're independent.
- **§5.6** — Display Manager's "Update all" stages a batch, aborting the rest of the run on the
  first failure rather than plowing through every remaining device.

## §7 — Known risks

- **§7.1 — RESOLVED this session.** `Updates.setUpdateURLAndRequestHeadersOverride()` requires the
  native `disableAntiBrickingMeasures` config flag (Android's own anti-supply-chain-attack
  measure — without it, the call throws `ERR_UPDATES_RUNTIME_OVERRIDE` rather than silently
  applying). Even with the flag set, **the override only takes effect starting the *next* full app
  process restart** — `EnabledUpdatesController.kt`'s `updatesConfiguration` is a constructor-
  injected `private val`, built once at process start; calling the override just persists it to
  disk for the next cold start to pick up, it does not rebuild the already-running session's
  in-memory config. A `check-update` push arriving in the *same* session that first calls the
  override will still hit the stale/placeholder URL.
- **§7.2 — Still open, out of scope for the Tier-3-only pass this session covered.** Whether
  `dpm set-device-owner` succeeds at all on this app's actual target hardware (Vestel/Toshiba
  Android TV units) is unverified — some vendor Android TV builds ship with restrictions or
  preconfigured accounts that block device-owner provisioning even on an otherwise factory-fresh
  unit. If it fails, Tier 2 is unreachable fleet-wide and Tier 3 (prompted install, this session's
  actual scope) becomes the practical ceiling until/unless that's investigated on real hardware.
- **§7.3 (new) — `MY_PACKAGE_REPLACED` + foreground-service-overlay exemption (§3.5) is
  itself a community workaround, not something Android formally documents as guaranteed across
  every OEM skin.** Confirmed working on this app's one real target unit; not verified elsewhere.
