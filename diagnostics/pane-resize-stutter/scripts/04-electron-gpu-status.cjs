// CommonJS on purpose, same reason as electron/main.cjs — this is its own standalone Electron entry
// point (NOT electron/main.cjs itself, to avoid touching the shipped app at all) that does nothing but
// log GPU feature/status info and quit. P3.2. Any `--disable-features=...`/other Chromium switch is
// picked up automatically by Electron before `app.ready` — no argv handling needed here.
//
// Usage:
//   npx electron diagnostics/pane-resize-stutter/scripts/04-electron-gpu-status.cjs
//   npx electron diagnostics/pane-resize-stutter/scripts/04-electron-gpu-status.cjs --disable-features=CalculateNativeWinOcclusion
const { app } = require('electron')
const { writeFileSync } = require('node:fs')
const path = require('node:path')

async function main() {
  await app.whenReady()
  const featureStatus = app.getGPUFeatureStatus()
  const gpuInfo = await app.getGPUInfo('complete')
  const flagged = process.argv.some((arg) => arg.startsWith('--disable-features'))
  const output = { capturedAt: new Date().toISOString(), flagged, featureStatus, gpuInfo }

  console.log(JSON.stringify(output, null, 2))

  const resultsDir = path.join(__dirname, '..', 'results')
  const outPath = path.join(resultsDir, `electron-gpu-status-flag${flagged ? 'On' : 'Off'}-${Date.now()}.json`)
  writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`Saved ${outPath}`)

  app.quit()
}

main()
