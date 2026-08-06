# ADHDisplay Companion

A standalone Expo app that turns any Android tablet/TV box/stick, iOS/iPadOS
device, or a Windows/Linux PC into an ADHDisplay kiosk display — no local
server, no Electron, just this app pointed at an existing ADHDisplay server
already running on the LAN.

It boots into a standby screen showing a PIN, gets approved once by an admin
typing that PIN into the main app's own Display Manager, and from then on
renders whatever Screen gets assigned — exactly like the main app's own
`/display-connect` browser-tab flow already does for a plain browser tab.

This is a fully independent package. It does **not** share TypeScript source,
`node_modules`, or React/React Native versions with the root web app (which
runs React 19; Expo pins its own compatible React/React Native versions) —
reuse between the two happens at the protocol level (matching JSON shapes
against `server/index.ts`'s own routes) and via this app's own `DisplayScreen`
loading the real, unmodified `/screens/:id` page in a WebView, not shared code.

## Status

Physical HDMI/external-display enumeration is explicitly out of scope for
v1 — this app only covers standby + PIN pairing + rendering one assigned
screen (one synthetic `device` monitor per install, on every platform).
Multi-monitor support (several signage screens off one Windows/Linux PC)
is a possible future native-shell feature, not something this Expo/web-view
app is meant to grow into — see "Windows & Linux" below.

## Dev run

```bash
npm install
npx expo start
```

Point it at a dev build of the local server (`npm run dev` or
`npm run preview:kiosk` in the repo root) running on the same LAN. Scan the
QR/manual-entry screen against that server, watch a "Pairing requests" card
show up in the main app's own Display Manager, approve it with the PIN shown
on-device, assign a Screen, and confirm it renders.

`npx expo install` (or `npx expo install --fix`) should be run once after
cloning to pin the exact dependency versions compatible with whatever Expo
SDK is current at the time — the versions in `package.json` are a reasonable
recent baseline, not hand-verified against the registry.

## Architecture

- `src/lib/serverConnection.ts` — persisted `{host, wsPort, contentPort}`,
  plus the LAN-sweep server-discovery logic.
- `src/lib/pairing.ts` — this device's own persisted `machineID`, and the
  `pairing-heartbeat`/`heartbeat` calls against `server/index.ts`.
- `src/lib/qr.ts` — parses the `adhdisplay-companion-pair://v1?...` payload
  Display Manager's own QR code encodes.
- `src/screens/` — the four states of the app's own top-level state machine
  (see `App.tsx`'s own doc comment): `ServerSetupScreen`, `PairingScreen`,
  `WaitingForAssignmentScreen`, `DisplayScreen`.
- `plugins/withBootLaunch.js` — the Android-only config plugin behind
  auto-launch-on-boot (see below).

**Server discovery**: typing a LAN IP on a bare Android TV stick's D-pad/
on-screen keyboard is the worst minute in the whole setup flow, and it's the
*first* minute — `ServerSetupScreen`'s actual primary path is an automatic
LAN sweep of this device's own `/24` (`expo-network` + short-timeout batched
`GET /server-info` calls), validated by the `app: 'adhdisplay'` field on that
response so it can't false-positive on an unrelated service. QR scan and
manual entry both stay reachable regardless of how the sweep goes. A real
mDNS/Bonjour client was deliberately left out of scope — disproportionate
effort for what it would buy here.

**Live updates**: simple heartbeat polling (every 20s once approved), not a
ported `syncClient.ts`. Once a Screen is assigned, `DisplayScreen`'s own
WebView runs the real, unmodified `/screens/:id` page — including its own
live WebSocket sync — inside a genuine browser engine, so this native layer
never needs its own live-push updates; it only needs the coarse "pending vs.
assigned to X" signal the heartbeat response already carries.

**Rejected**: a QR-based approval flow the other way around (this app shows
a QR encoding its own `machineID`+PIN, an admin scans it with a phone already
logged into the dashboard) was considered and dropped — `getUserMedia`
(camera access, needed to scan) requires a secure context, and the admin
dashboard is plain `http://` on the LAN. Noted here so it isn't independently
re-proposed and re-discovered later.

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

- **Windows**: `ADHDisplayCompanion-Setup.exe` wrapping the web build in a
  minimal kiosk-mode shell, rather than adding React Native Windows' own
  separate native toolchain. Auto-launch-on-boot reuses the main ADHDisplay
  app's own installer pattern (`installer/adhdisplay.iss` already registers a
  "run at logon" scheduled task, `ADHDisplayLauncher`) under its own,
  distinctly-named task — e.g. `ADHDisplayCompanionLauncher` — since it's a
  separate installed app from the main one.
- **Linux**: the same web build wrapped in a kiosk-mode browser shell
  launched by a systemd unit, the same shape `installer/linux/install.sh`
  already uses for the main app's own Raspberry-Pi/Linux kiosk deployment.
  Its own systemd unit is named `adhdisplay-companion.service` — deliberately
  not `adhdisplay.service`, which is already the main app's own unit name and
  would collide with it.

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

Neither Windows nor Linux packaging is implemented in this repo yet — this
section documents the intended build targets and their auto-launch story,
not a shipped installer.

## Verification checklist

- QR scan **and** manual entry both reach `PairingScreen` with a real PIN.
- Approving in Display Manager moves this device into the machines grid
  (`connectionType: mobile` badge) and assigns a Screen renders it in
  `DisplayScreen`.
- Removing the device in Display Manager, then heartbeating again, drops
  back to `PairingScreen` with a fresh PIN (confirms the `needsPairing` gate
  is a real revocation, unlike `electron`/`url`).
- iOS: confirm the very first pairing-heartbeat/heartbeat fetch actually
  succeeds and the WebView loads content on a real device — without the
  `NSAllowsArbitraryLoads` exception this fails at the first request, so
  this is worth checking explicitly, not assumed from Android/Windows
  working.
