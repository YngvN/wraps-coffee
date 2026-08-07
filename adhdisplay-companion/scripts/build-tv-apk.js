#!/usr/bin/env node
// `npm run build:tv` — builds a signed, self-contained release APK for
// sideloading onto Android TV devices. Regenerates android/ from scratch
// (expo prebuild) so every plugin under plugins/ is freshly applied
// (signing, leanback manifest, TV banner — see those files' own doc
// comments), then runs a normal Gradle release build and copies the
// result to dist/ under a versioned filename, since several generations
// of this APK may sit on the same USB stick at once.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const APP_JSON_PATH = path.join(ROOT, 'app.json')
const DIST_DIR = path.join(ROOT, 'dist')

function computeVersionCode(versionName) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionName)
  if (!match) {
    throw new Error(`build-tv-apk: expected app.json's version to look like "0.2.5", got "${versionName}"`)
  }
  const [, major, minor, patch] = match.map(Number)
  // Only valid while minor and patch each stay under 100 — this scheme
  // has no room beyond that (e.g. minor 100 would collide with major+1).
  if (minor >= 100 || patch >= 100) {
    throw new Error(
      `build-tv-apk: versionCode scheme (major*10000 + minor*100 + patch) can't represent "${versionName}" — minor/patch must stay under 100`,
    )
  }
  return major * 10000 + minor * 100 + patch
}

function writeVersionCode(versionCode) {
  const appConfig = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'))
  appConfig.expo.android = appConfig.expo.android ?? {}
  if (appConfig.expo.android.versionCode === versionCode) return
  appConfig.expo.android.versionCode = versionCode
  fs.writeFileSync(APP_JSON_PATH, `${JSON.stringify(appConfig, null, 2)}\n`)
}

/**
 * `dpm set-device-owner` (Update Channel spec §3.1) rejects a test-only
 * build outright, and Expo debug builds set `android:testOnly="true"` on
 * the generated `<application>` tag — a build meant for Tier 2 provisioning
 * must never carry it. Checked here, right after `expo prebuild` writes the
 * manifest and before Gradle spends several minutes building an APK that
 * would just be rejected at `dpm set-device-owner` time — failing loudly
 * now is cheaper than finding out during a USB provisioning session.
 */
function assertNotTestOnly() {
  const manifestPath = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  const manifest = fs.readFileSync(manifestPath, 'utf-8')
  if (/<application\b[^>]*\bandroid:testOnly\s*=\s*"true"/.test(manifest)) {
    throw new Error(
      `build-tv-apk: generated AndroidManifest.xml has android:testOnly="true" — this build would be rejected by ` +
        `"dpm set-device-owner" during Tier 2 provisioning (see the Update Channel spec §3.1/§3.2). Check what set it — ` +
        `Expo debug builds set this flag; this script always builds assembleRelease, so seeing it here means something ` +
        `upstream (an Expo/Gradle config change, a stray debug flag) needs investigating before this APK is usable for provisioning.`,
    )
  }
}

function findOutputApk() {
  const releaseDir = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release')
  const apks = fs.readdirSync(releaseDir).filter((name) => name.endsWith('.apk'))
  if (apks.length !== 1) {
    throw new Error(`build-tv-apk: expected exactly one release APK in ${releaseDir}, found: ${apks.join(', ') || '(none)'}`)
  }
  return path.join(releaseDir, apks[0])
}

function main() {
  const appConfig = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'))
  const versionName = appConfig.expo.version
  const versionCode = computeVersionCode(versionName)

  console.log(`Building ${versionName} (versionCode ${versionCode})...`)
  writeVersionCode(versionCode)

  execFileSync('npx', ['expo', 'prebuild', '-p', 'android', '--clean'], { cwd: ROOT, stdio: 'inherit' })
  assertNotTestOnly()
  // -Pandroid.kotlinVersion=1.9.24: expo-modules-core's Compose scaffolding
  // expects this to match whichever Kotlin Gradle Plugin version actually
  // resolves — the template's own default (1.9.25) doesn't, which fails
  // with a Compose-compiler/Kotlin version mismatch. Unrelated to anything
  // in this project's own code; revisit if a future Expo SDK bump changes
  // which Kotlin version actually resolves.
  execFileSync('./gradlew', ['assembleRelease', '-Pandroid.kotlinVersion=1.9.24'], {
    cwd: path.join(ROOT, 'android'),
    stdio: 'inherit',
  })

  fs.mkdirSync(DIST_DIR, { recursive: true })
  const outputApk = findOutputApk()
  const destName = `adhdisplay-companion-${versionName}-${versionCode}.apk`
  const destPath = path.join(DIST_DIR, destName)
  fs.copyFileSync(outputApk, destPath)

  console.log(`\nBuilt: ${destPath}`)
}

main()
