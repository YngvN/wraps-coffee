// Expo config plugin: the Register's camera scanning with the back and front cameras at the same
// time — a native view (`DualCameraScanView`) that runs two Camera2 cameras at a low resolution and
// frame rate and reads codes with ML Kit. expo-camera's CameraView can only run one camera at a
// time, which is why this exists; expo-camera stays for its permission prompt and manifest entry.
//
// Unlike the other native plugins here, the Kotlin lives in real .kt files beside this one
// (`dualCameraScan/`) rather than in template strings — three files of camera code read and diff
// better that way. They're copied into android/ on every prebuild and registered as a
// `ReactPackage` in `MainApplication`, the same way as `withUsbPrinter.js`. Plain CommonJS, same
// reason as every other plugin in this directory.
const { withAppBuildGradle, withDangerousMod, withMainApplication } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const PACKAGE = 'no.adhdisplay.companion'
const SOURCE_DIR = path.join(__dirname, 'dualCameraScan')
/** The same ML Kit version expo-camera ships, so Gradle resolves one copy. */
const MLKIT_DEPENDENCY = 'implementation "com.google.mlkit:barcode-scanning:17.2.0"'

function withDualCameraScanSource(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const javaDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...PACKAGE.split('.'))
      fs.mkdirSync(javaDir, { recursive: true })
      for (const file of fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.kt'))) {
        fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(javaDir, file))
      }
      return config
    },
  ])
}

/** The app module compiles against ML Kit directly: expo-camera's own dependency on it is `implementation`, so it isn't visible here. */
function withMlKitDependency(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents
    if (!contents.includes(MLKIT_DEPENDENCY)) {
      config.modResults.contents = contents.replace(/dependencies\s*\{/, (match) => `${match}\n    ${MLKIT_DEPENDENCY}`)
    }
    return config
  })
}

const PACKAGES_VAL_LINE = 'val packages = PackageList(this).packages'

function withDualCameraScanRegistration(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withDualCameraScan: expected a Kotlin android/app/.../MainApplication.kt')
    }
    let contents = config.modResults.contents
    if (!contents.includes(PACKAGES_VAL_LINE)) {
      throw new Error('withDualCameraScan: could not find "val packages = PackageList(this).packages" in MainApplication.kt to register DualCameraScanPackage against.')
    }
    if (!contents.includes('packages.add(DualCameraScanPackage())')) {
      contents = contents.replace(PACKAGES_VAL_LINE, `${PACKAGES_VAL_LINE}\n            packages.add(DualCameraScanPackage())`)
    }
    config.modResults.contents = contents
    return config
  })
}

module.exports = function withDualCameraScan(config) {
  config = withDualCameraScanSource(config)
  config = withMlKitDependency(config)
  config = withDualCameraScanRegistration(config)
  return config
}
