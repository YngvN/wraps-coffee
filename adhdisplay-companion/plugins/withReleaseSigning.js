// Expo config plugin: wires release signing into the generated
// android/app/build.gradle so `assembleRelease` produces a stably-signed
// APK across every build, instead of RN's own template placeholder that
// points buildTypes.release at the debug keystore. The keystore itself
// lives outside android/, at adhdisplay-companion/keystore/ (see
// keystore/KEYSTORE.md), since `expo prebuild` deletes and regenerates
// android/ on every run — this plugin only ever points at that stable
// path, it never generates or stores the keystore itself. Passwords come
// from ADHDISPLAY_STORE_PASSWORD / ADHDISPLAY_KEY_PASSWORD env vars,
// falling back to the value documented in KEYSTORE.md, so `npm run
// build:tv` stays fully non-interactive. Only affects the Android
// prebuild, same as withBootLaunch.js; written fresh into android/ on
// every prebuild, not checked in.
const { withAppBuildGradle } = require('expo/config-plugins')

// Relative to android/app/ (where build.gradle lives), back out to
// adhdisplay-companion/keystore/.
const STORE_FILE_PATH = '../../keystore/release.keystore'
const KEY_ALIAS = 'adhdisplay'
// Must match the actual keystore's password (see KEYSTORE.md). The
// keystore is PKCS12, which does not support a key password distinct from
// the store password — both env vars must resolve to this same string.
const FALLBACK_PASSWORD = 'AdhDisplayTV2026!'

const RELEASE_SIGNING_CONFIG = `        release {
            storeFile file('${STORE_FILE_PATH}')
            storePassword System.getenv("ADHDISPLAY_STORE_PASSWORD") ?: "${FALLBACK_PASSWORD}"
            keyAlias "${KEY_ALIAS}"
            keyPassword System.getenv("ADHDISPLAY_KEY_PASSWORD") ?: "${FALLBACK_PASSWORD}"
            enableV1Signing true
            enableV2Signing true
            enableV3Signing true
        }
`

// The exact comment RN's template puts right before buildTypes.release's
// placeholder signingConfig line — used to target only that occurrence,
// since buildTypes.debug has its own separate `signingConfig
// signingConfigs.debug` line that must NOT be touched.
const RELEASE_CAUTION_COMMENT =
  /(\/\/ Caution! In production, you need to generate your own keystore file\.\s*\n\s*\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy android/app/build.gradle')
    }
    let contents = config.modResults.contents

    if (!contents.includes(`storeFile file('${STORE_FILE_PATH}')`)) {
      contents = contents.replace(/(signingConfigs\s*{\n)/, `$1${RELEASE_SIGNING_CONFIG}`)
    }

    if (RELEASE_CAUTION_COMMENT.test(contents)) {
      contents = contents.replace(RELEASE_CAUTION_COMMENT, '$1signingConfig signingConfigs.release')
    } else if (!contents.includes('signingConfig signingConfigs.release')) {
      throw new Error(
        'withReleaseSigning: could not find the expected buildTypes.release signingConfig placeholder to replace — the RN/Expo template may have changed.',
      )
    }

    config.modResults.contents = contents
    return config
  })
}
