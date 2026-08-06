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
  is not meant for unattended kiosk deployment. This is also how
  `.github/workflows/build-companion-installers.yml`'s `build-android-apk`
  job builds it in CI, bundled alongside the Windows installer into one
  `ADHDisplayCompanionInstallers.zip`.
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
  `build-tools` are also needed to verify the output per that doc. Not built
  in CI; local/manual only.

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
