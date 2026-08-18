# ADHDisplay Companion

A standalone Expo app that turns any Android tablet/TV box/stick, iOS/iPadOS
device, or a Windows/Linux PC into an ADHDisplay kiosk display — no local
ADHDisplay server of its own, just this app pointed at an existing ADHDisplay
server already running on the LAN. On Windows specifically, "this app" ships
as its own separate installer wrapping a minimal Electron kiosk shell (see
"Windows & Linux" below) — a small, dedicated Electron install of its own,
distinct from the main ADHDisplay app's own `electron/`.

It boots into a standby screen showing its own short `#suffix` (the last 4
characters of its `machineID`), shows up passively in the main app's own
Display Manager for an admin to approve with one click — no PIN typed or QR
scanned on either side — and from then on renders whatever Screen gets
assigned, exactly like the main app's own `/display-connect` browser-tab
flow already does for a plain browser tab. It can also disconnect itself
locally (forgetting its own server connection, not a server-side revoke) via
a plain button while unassigned, or a triple-Back-press gesture on the
remote once a Screen is live — see "Disconnect" under Architecture below.

This is a fully independent package. It does **not** share TypeScript source,
`node_modules`, or React/React Native versions with the root web app (which
runs React 19; Expo pins its own compatible React/React Native versions) —
reuse between the two happens at the protocol level (matching JSON shapes
against `server/index.ts`'s own routes) and via this app's own `DisplayScreen`
loading the real, unmodified `/screens/:id` page in a WebView (a plain
`<iframe>` on the web/Electron build — see `DisplayScreen.web.tsx` — since
`react-native-webview` has no web implementation), not shared code.

## Status

Physical HDMI/external-display enumeration is explicitly out of scope for
v1 — this app only covers standby + one-click pairing + rendering one
assigned screen (one synthetic `device` monitor per install, on every
platform).
Multi-monitor support (several signage screens off one Windows/Linux PC)
is a possible future native-shell feature, not something this Expo/web-view
app is meant to grow into — see "Windows & Linux" below.

## Dev run

```bash
npm install
npx expo start
```

Point it at a dev build of the local server (`npm run dev` or
`npm run preview:kiosk` in the repo root) running on the same LAN — via
auto-discovery or the manual-entry screen. Watch a "Pending approval" card
show up in the main app's own Display Manager, confirm its `#suffix` matches
the one on this app's own `PairingScreen`, approve it with one click, assign
a Screen, and confirm it renders.

`npx expo install` (or `npx expo install --fix`) should be run once after
cloning to pin the exact dependency versions compatible with whatever Expo
SDK is current at the time — the versions in `package.json` are a reasonable
recent baseline, not hand-verified against the registry.

## Architecture

- `src/lib/serverConnection.ts` — persisted `{host, wsPort, contentPort}`,
  plus the LAN-sweep and mDNS server-discovery logic.
- `src/lib/pairing.ts` — this device's own persisted `machineID` (also the
  source of the `#suffix` shown on `PairingScreen`), and the
  `pairing-heartbeat`/`heartbeat` calls against `server/index.ts`.
- `src/screens/` — the four states of the app's own top-level state machine
  (see `App.tsx`'s own doc comment): `ServerSetupScreen`, `PairingScreen`,
  `WaitingForAssignmentScreen`, `DisplayScreen`.
- `plugins/withBootLaunch.js` — the Android-only config plugin behind
  auto-launch-on-boot (see below).

**Server discovery**: typing a LAN IP on a bare Android TV stick's D-pad/
on-screen keyboard is the worst minute in the whole setup flow, and it's the
*first* minute — `ServerSetupScreen` runs two discovery sources side by side
rather than making the user type anything. A passive mDNS/DNS-SD browse
(`browseForServerViaMdns` in `src/lib/serverConnection.ts`, via
`react-native-zeroconf`) listens for the always-on advertisement
`server/mdns.ts`'s `advertiseServerPresence` publishes at server startup,
typically resolving in well under a second. Alongside it, an active LAN
sweep of this device's own `/24` (`expo-network` + short-timeout batched
`GET /server-info` calls, validated by the `app: 'adhdisplay'` field on that
response so it can't false-positive on an unrelated service) retries
automatically every ~15s as a fallback for networks where mDNS's multicast
dependency doesn't work (e.g. client-isolated Wi-Fi) — a "Look for server"
button also lets the user force an immediate sweep retry. Manual host:port
entry stays reachable as a persistent fallback link, not the automatic
destination after one failed pass.

**Live updates**: simple heartbeat polling (every 20s once approved), not a
ported `syncClient.ts`. Once a Screen is assigned, `DisplayScreen`'s own
WebView runs the real, unmodified `/screens/:id` page — including its own
live WebSocket sync — inside a genuine browser engine, so this native layer
never needs its own live-push updates; it only needs the coarse "pending vs.
assigned to X" signal the heartbeat response already carries.

**Disconnect**: `clearServerConnection()` (`src/lib/serverConnection.ts`)
forgets this device's own persisted server connection — local to the device
only, no server call, not a revoke; `machineId` is deliberately left alone,
so re-pairing with the *same* server afterward skips `PairingScreen`
entirely (the heartbeat gate only checks whether that `machineID` is still
in `admin.displayMachines`). Reachable from `WaitingForAssignmentScreen`'s
own plain button, and from a triple-Back-press-within-2s gesture (RN's
`BackHandler`, mounted once in `App.tsx` as a single global listener) that
also works from the full-bleed `DisplayScreen`, which has no button chrome
of its own. Deliberately not a way to un-pair a device from a server it's
still registered on — only Display Manager's own Remove button does that.

**Rejected**: an admin-scans-a-QR approval flow (this app shows a QR
encoding its own `machineID`+PIN, an admin scans it with a phone already
logged into the dashboard) was considered and dropped even before the PIN
itself was later removed entirely in favor of one-click approval —
`getUserMedia` (camera access, needed to scan) requires a secure context,
and the admin dashboard is plain `http://` on the LAN. Noted here so it
isn't independently re-proposed and re-discovered later.

## Update channel

Once paired, this app reports its own `versionCode`/`versionName`/`runtimeVersion`/
`updateId`/`isEmbeddedLaunch`/`updateTier` on every heartbeat, and opens a native
WebSocket connection (`src/lib/deviceSocket.ts`, alongside `src/lib/pairing.ts`'s existing
HTTP calls — modeled on the root app's own `src/lib/syncClient.ts` reconnect/backoff logic)
so the server can push an update check/install rather than waiting for the next poll.
Shown and triggered from the main app's own Display Manager (see its README's "Update
channel" bullet) — this app never initiates an update on its own.

Three tiers, resolved automatically from what the device is capable of
(`updateTier`, computed from device-owner/install-permission status):

- **Tier 1 — OTA JS bundle** (`src/lib/updates.ts`, self-hosted `expo-updates`): for any
  change that doesn't touch native code. `app.json`'s `updates` block points at this app's
  own server (resolved once pairing completes, via
  `Updates.setUpdateURLAndRequestHeadersOverride()`), and manifests served from
  `GET /updates/manifest` are code-signed — see `codeSigning/CODE_SIGNING.md` for exactly
  how, and why. Applying an update reloads the JS bundle in place (`Updates.reloadAsync()`);
  timing (immediate vs. a configurable overnight quiet window) is decided server-side, not
  by this app.
- **Tier 2 — silent APK install**: for a device provisioned as an Android
  [device owner](https://developer.android.com/work/dpc/build-dpc) (`dpm set-device-owner`,
  `plugins/withDeviceAdmin.js`'s generated `AdminReceiver`), a new APK is downloaded from
  the server, its signature checked against this build's own signing certificate, and
  installed via `PackageInstaller` (`plugins/withPackageInstaller.js`'s native module) with
  no on-screen prompt. The install is expected to kill this app's own process mid-flight —
  there's no reliance on an install-result callback; the next heartbeat's `versionCode`
  reporting the new version is the only success signal.
- **Tier 3 — prompted APK install**: the same `PackageInstaller` flow, for a device that
  isn't a device owner — falls back to Android's normal "Install unknown apps"
  confirmation dialog instead of a silent install.

A device owner also gets **lock task mode** (`plugins/withLockTask.js`,
`setLockTaskPackages()`/`startLockTask()`) pinning this app on screen, blocking Home/
Recents — a stronger kiosk guarantee than the WebView user-agent marker alone, which
remains the fallback signal for non-device-owner units.

## Remote screen navigation

On Android TV, holding the D-pad up or down arms an on-screen browse mode
(`src/lib/remoteNav.ts`, `src/components/RemoteNavHud.tsx`) for previewing the cafe's other
Screens directly from the remote, without touching the dashboard — useful for a TV tucked
somewhere the dashboard isn't handy. A native bridge
(`plugins/withKeyEventBridge.js`, patching the generated `MainActivity.kt`'s
`dispatchKeyEvent`) forwards only D-pad up/down/center to JS via `DeviceEventEmitter`;
`KEYCODE_BACK` always falls through untouched, so the existing triple-Back-press disconnect
gesture (see "Disconnect" above) keeps working exactly as before.

State machine: idle → (double-press up/down within ~2.5s) → armed → previewing. While
previewing, up/down moves the on-screen selection through the same Screens the cafe's
Display Manager would let this device be assigned to (server-decided, never client-
enumerated — this device can't browse to a draft or another venue's Screen), rendered as
that Screen's own cached static screenshot (`src/lib/previewCache.ts`,
`src/components/RemoteNavPreview.tsx`) rather than by live-navigating the `DisplayScreen`
WebView — so stepping through Screens costs no page loads, no restarted clocks/video/live
data, and no black frame. Each device keeps its own on-disk copy of every browsable
Screen's screenshot, synced from the hub's own `navigable-set` push (which already carries
each Screen's stage-1 `previewImages` entry) and re-downloaded only when a Screen's own
screenshot actually changes — see the main app's README, "Static preview thumbnails". OK
commits the selection as a persistent override (visible in Display Manager as an
"Overridden" badge, with a "Return to assigned" action there), at which point the WebView
navigates to it for the first and only time, and exits back to idle. Back, 20 seconds of
inactivity, or losing the server connection all revert to whatever was actually showing
before browsing started — which may itself already be an earlier override, not necessarily
the assigned Screen — with nothing committed and no WebView navigation at all. A committed
override always wins over Display Manager's own assignment until cleared, and reassigning
a Screen to this device from Display Manager clears it.

Stage-level (left/right) navigation within a single multi-stage Screen is not built yet —
screen-level (up/down) navigation only, for now.

## Platform notes

### Android

- `app.json`'s `android.usesCleartextTraffic: true` — the LAN server is
  plain `http://`, and Android 9+ blocks cleartext traffic by default.
- Auto-launch-on-boot is the one place this app has genuinely native code:
  `plugins/withBootLaunch.js` generates a small Kotlin `BroadcastReceiver`
  (`BootLaunchReceiver.kt`, written fresh into `android/` on every
  `expo prebuild`, not checked in) listening for
  `android.intent.action.BOOT_COMPLETED`, and injects the matching
  `RECEIVE_BOOT_COMPLETED` permission into the manifest. Every other native
  module this app uses (camera, WebView, keep-awake) is stock Expo with zero
  custom native code — this receiver is the exception.
- **Testing caveat**: Android 10+'s background-activity-launch restrictions
  behave differently across cheap TV-box OEM skins. A receiver confirmed
  working on one device (e.g. a Fire Stick) isn't guaranteed to behave
  identically on a no-name Android TV box. Budget for testing across the
  actual hardware variety this is meant to run on, not a single-device smoke
  test.
- **Building a debug APK**: `npx expo prebuild -p android && cd android &&
  ./gradlew assembleDebug` produces a debug-signed
  `android/app/build/outputs/apk/debug/app-debug.apk`, installable via
  `adb install` for local development — it depends on a Metro dev server and
  is not meant for unattended kiosk deployment.
- **Building a release APK for Android TV**: `npm run build:tv` produces a
  signed, self-contained, universal release APK (JS bundle embedded, no
  Metro/network dependency) at
  `dist/adhdisplay-companion-<version>-<versionCode>.apk`, ready to sideload
  via USB stick and a TV file manager — see `../docs/INSTALL-TV.md` for the
  full deployment walkthrough. It's signed with `keystore/release.keystore`
  (see `keystore/KEYSTORE.md` — **that file must never be lost**, or every
  future TV update breaks with a signature mismatch), and shows up on the
  Android TV home screen via the leanback launcher support added by
  `plugins/withLeanbackManifest.js` and `plugins/withReleaseSigning.js`.
  Requires a full Android SDK (not just platform-tools) with `ANDROID_HOME`
  set, since it runs a real Gradle build — `aapt2`/`apksigner` from
  `build-tools` are also needed to verify the output per that doc. Built
  locally only, not in CI (GitHub's Ubuntu runner hit a Kotlin/Compose-
  compiler version mismatch in `expo-modules-core:compileReleaseKotlin` that
  doesn't reproduce on a real dev machine) — this is also the first step
  `../installer/build-with-apk.ps1` runs before compiling the main
  ADHDisplay installer, which embeds the resulting APK at
  `{app}\android-apk\`.

### iOS / iPadOS

- `app.json`'s `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads:
  true` — iOS blocks plain `http://` just as strictly as Android, and a
  scoped ATS exception isn't viable since the server's LAN IP is dynamic/
  unknown ahead of time, unlike a fixed domain. Needed for both the pairing/
  heartbeat fetches and the WebView itself.
- **Auto-launch-on-boot is a documented limitation, not a feature to
  build.** Apple provides no public API for a regular App Store app to
  auto-launch on boot; the only route is enrolling the device in MDM and
  using Supervised Single App Mode — an organizational device-management
  decision, not app code. An unattended iPad deployment needs a manual
  relaunch to resume this app's own flow after a power blip unless that
  separate MDM enrollment step is done outside this app entirely.

### Windows & Linux

v1 ships as a web build (React Native Web, the same codebase — no
per-platform fork of the app logic) packaged into a lightweight
installer/shell for each platform:

- **Windows** (implemented — `installer/adhdisplay-companion.iss`,
  `electron/main.cjs`): `ADHDisplayCompanionSetup.exe` wrapping the web
  build (`npx expo export -p web`) in a minimal Electron kiosk shell, rather
  than adding React Native Windows' own separate native toolchain. The web
  export is served from disk via a custom `app://` protocol handler
  registered in `electron/main.cjs` — no local HTTP server, no port, no
  firewall rule — deliberately registered *without* `secure: true`, since
  `DisplayScreen.web.tsx`'s `<iframe>` points at the LAN server's own plain
  `http://` address and a "secure" shell origin would block that as mixed
  content. Auto-launch-on-boot reuses the main ADHDisplay app's own installer
  pattern (`installer/adhdisplay.iss` already registers a "run at logon"
  scheduled task, `ADHDisplayLauncher`) under its own, distinctly-named task,
  `ADHDisplayCompanionLauncher`, since it's a separate installed app from the
  main one — see `.github/workflows/build-installer.yml`, which compiles
  both installers and zips them together with the Android APK (see
  "Building an APK" above) into one `ADHDisplayInstallers.zip`.
- **Linux** (not implemented yet): the same web build wrapped in a
  kiosk-mode browser shell launched by a systemd unit, the same shape
  `installer/linux/install.sh` already uses for the main app's own
  Raspberry-Pi/Linux kiosk deployment. Its own systemd unit would be named
  `adhdisplay-companion.service` — deliberately not `adhdisplay.service`,
  which is already the main app's own unit name and would collide with it.

Both are single-monitor, one synthetic `device` monitor, identical to
Android/iOS. Multi-monitor support on either (several signage screens off one
PC) is explicitly deferred: the Window Management API (`getScreenDetails()`)
was considered and rejected — it requires a secure context (the LAN server is
plain `http://`), requires a separate user gesture per `window.open()` call
(disqualifying for an unattended kiosk that must recover after a power blip
with no one there to click), and is still Chromium-only/non-Baseline. When
multi-monitor support is actually built, it belongs in a native shell
(Electron, reusing `electron/displayManager.cjs`'s already-proven per-monitor
`BrowserWindow` placement), not page-JS.

Windows packaging is implemented (see above); Linux packaging is not yet —
this subsection still just documents the intended build target and its
auto-launch story, not a shipped installer.

## Verification checklist

- Auto-discovery **and** manual entry both reach `PairingScreen`, showing
  this device's own `#suffix` — confirm it matches the `#suffix` on the
  matching "Pending approval" card in Display Manager.
- Approving with one click in Display Manager moves this device into the
  machines grid (`connectionType: mobile` badge) and assigns a Screen
  renders it in `DisplayScreen`.
- Removing the device in Display Manager, then heartbeating again, drops
  back to `PairingScreen` (confirms the `needsPairing` gate is a real
  revocation, unlike `electron`/`url`).
- Disconnect (`WaitingForAssignmentScreen`'s button, or triple-Back-press
  from `DisplayScreen`) returns this app to `ServerSetupScreen`; confirm the
  device's own entry stays in Display Manager's approved grid (frozen
  `lastSeenAt`, not removed), and that re-pointing this same device back at
  the same server skips `PairingScreen` entirely rather than requiring
  re-approval.
- A single stray Back press on `DisplayScreen` does not exit/background the
  app — only three presses within 2 seconds trigger Disconnect.
- iOS: confirm the very first pairing-heartbeat/heartbeat fetch actually
  succeeds and the WebView loads content on a real device — without the
  `NSAllowsArbitraryLoads` exception this fails at the first request, so
  this is worth checking explicitly, not assumed from Android/Windows
  working.
