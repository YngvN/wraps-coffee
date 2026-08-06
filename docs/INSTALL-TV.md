# Installing ADHDisplay Companion on an Android TV via USB

No ADB, no network connection to a computer, and no Play Store involved — this is a
plain sideload from a USB stick using the TV's own file manager.

## 1. Prepare the USB stick

Format it **FAT32** or **exFAT** (either works — the built APK is a few tens of MB, well
under FAT32's 4GB-per-file limit, so that limit doesn't practically matter here).

## 2. Copy the APK and verify it

Copy the built file (e.g. `adhdisplay-companion-0.2.5-205.apk` from
`adhdisplay-companion/dist/`, see that project's own `npm run build:tv`) onto the stick.

Before unplugging, verify the copy on the stick matches the build output exactly — a
truncated or corrupted copy is the most common cause of a TV-side "parse error":

```
shasum -a 256 /path/to/adhdisplay-companion/dist/adhdisplay-companion-<version>.apk
shasum -a 256 /Volumes/<stick name>/adhdisplay-companion-<version>.apk
```

Both hashes must match exactly.

**Eject the stick properly** (don't just pull it) so the write is actually flushed to
disk — macOS: right-click the stick in Finder → Eject, or `diskutil eject /Volumes/<stick name>`.

## 3. Allow installs from the file manager, on the TV

Settings → Apps → Special app access → Install unknown apps → select the file manager
app you're about to use → enable.

This permission is **per file-manager app** and resets if that file manager is ever
reinstalled or updated to a new package — if installs start silently failing after
previously working, check this toggle again first.

## 4. Install

Open the file manager on the TV, plug in the USB stick, navigate to the APK, and open
it. Confirm the install prompt.

## 5. Where it ends up

The app appears as a banner tile on the Android TV home screen (leanback launcher) —
look for the ADHDisplay Companion tile alongside your other TV apps, not in a phone-style
app drawer. It's also still listed under Settings → Apps if it doesn't show up there.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Parse error while installing | Truncated/corrupted copy on the stick | Re-copy the APK and re-verify the SHA-256 matches before opening it again |
| "App not installed" | A different-signed version of this app is already installed (signature mismatch) | Confirm you're using the same `adhdisplay-companion/keystore/release.keystore` build lineage — see that project's `keystore/KEYSTORE.md`. If the key was genuinely lost/changed, the old install must be uninstalled first (loses its paired-device state) |
| Installs successfully but the app doesn't appear on the home screen | The leanback banner or `LEANBACK_LAUNCHER` category is missing from the build | Confirm the APK was built after `plugins/withLeanbackManifest.js` was added — rebuild with `npm run build:tv` |
| Red "Unable to load script" screen on launch | A debug build was installed instead of a release build | Use the APK from `adhdisplay-companion/dist/` (`npm run build:tv`), not a debug build — release builds embed the JS bundle and need no Metro server |
