// Expo config plugin: adds Android TV / leanback launcher support so this
// app shows up as a browsable tile on an Android TV home screen (not just
// sideloadable) — the required <uses-feature> declarations, the
// LEANBACK_LAUNCHER category on the main activity (kept alongside the
// existing LAUNCHER category, so phones/tablets stay unaffected), and the
// android:banner tile art the TV home screen requires to display it at
// all — without one the app can end up installed but hidden. Only affects
// the Android prebuild (`expo prebuild` / `expo run:android`), same as
// withBootLaunch.js; written fresh into android/ on every prebuild, not
// checked in.
//
// Written in plain CommonJS, same reason as withBootLaunch.js: Expo
// resolves a `plugins` entry in app.json via a direct Node `require()`.
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const BANNER_ASSET_SOURCE = path.join(__dirname, '..', 'assets', 'tv_banner.png')

function addUsesFeatureIfMissing(manifest, name, required) {
  manifest['uses-feature'] = manifest['uses-feature'] ?? []
  const exists = manifest['uses-feature'].some((entry) => entry.$?.['android:name'] === name)
  if (!exists) {
    manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': String(required) } })
  }
}

function withLeanbackManifestXml(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const application = manifest.application?.[0]
    if (!application) return config

    addUsesFeatureIfMissing(manifest, 'android.software.leanback', false)
    addUsesFeatureIfMissing(manifest, 'android.hardware.touchscreen', false)

    application.$['android:banner'] = '@drawable/tv_banner'

    const findLauncherFilter = (activity) =>
      activity['intent-filter']?.find((filter) =>
        filter.category?.some((category) => category.$?.['android:name'] === 'android.intent.category.LAUNCHER'),
      )
    const mainActivity = application.activity?.find((activity) => findLauncherFilter(activity))
    const launcherFilter = mainActivity ? findLauncherFilter(mainActivity) : undefined

    if (launcherFilter) {
      const hasLeanback = launcherFilter.category.some(
        (category) => category.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER',
      )
      if (!hasLeanback) {
        launcherFilter.category.push({ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } })
      }
    }

    return config
  })
}

function withTvBannerAsset(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable-xhdpi')
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(BANNER_ASSET_SOURCE, path.join(dir, 'tv_banner.png'))
      return config
    },
  ])
}

module.exports = function withLeanbackManifest(config) {
  config = withLeanbackManifestXml(config)
  config = withTvBannerAsset(config)
  return config
}
