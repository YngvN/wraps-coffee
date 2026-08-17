# Builds the Companion app's Android TV release APK, then compiles
# adhdisplay.iss - Inno resolves that .iss's own [Files] APK glob
# (..\adhdisplay-companion\dist\adhdisplay-companion-*.apk) at compile time,
# so the APK must exist on disk before ISCC runs; invoking ISCC directly
# without this script first would fail with "no files found" the first time,
# or silently embed a stale build any other time. Requires Inno Setup 6
# (ISCC.exe) and a full Android SDK/JDK set up for `npm run build:tv` - see
# adhdisplay-companion/README.md's "Building a release APK for Android TV".

param(
  [string]$IsccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$CompanionDir = Join-Path (Split-Path $ScriptDir -Parent) 'adhdisplay-companion'
$IssPath = Join-Path $ScriptDir 'adhdisplay.iss'

Write-Host "Building Companion Android TV APK..."
Push-Location $CompanionDir
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit code $LASTEXITCODE)" }

  npm run build:tv
  if ($LASTEXITCODE -ne 0) { throw "npm run build:tv failed (exit code $LASTEXITCODE)" }
}
finally {
  Pop-Location
}

# Self-hosted Google Fonts (~36 MB of woff2, all 999 families in
# src\data\googleFonts.json) are gitignored and re-fetchable, so they must be on
# disk before ISCC resolves adhdisplay.iss's "..\public\*" glob at compile time -
# same situation as the APK above. Skipping this wouldn't fail the build, it
# would quietly produce an installer whose displays fall back to system fonts
# with no internet, so it runs unconditionally; the fetch script itself skips
# every file already downloaded, making a repeat run cheap.
Write-Host "Fetching self-hosted Google Fonts..."
Push-Location (Split-Path $ScriptDir -Parent)
try {
  npm run fonts:fetch
  if ($LASTEXITCODE -ne 0) { throw "npm run fonts:fetch failed (exit code $LASTEXITCODE)" }
}
finally {
  Pop-Location
}

# Same situation again, for the AI assistant's bundled text model (~2.5 GB,
# qwen3:4b) that adhdisplay.iss ships via its "ollama-models\*" globs. Skipping
# it produces a working installer whose kiosks fall back to downloading the model
# on demand from Settings, which is the pre-bundling behaviour - so, like the
# fonts above, it runs unconditionally and re-runs cheaply (already-downloaded
# blobs are size-checked and skipped).
Write-Host "Fetching bundled Ollama model..."
Push-Location (Split-Path $ScriptDir -Parent)
try {
  npm run ollama:fetch
  if ($LASTEXITCODE -ne 0) { throw "npm run ollama:fetch failed (exit code $LASTEXITCODE)" }
}
finally {
  Pop-Location
}

Write-Host "Compiling ADHDisplay installer..."
& $IsccPath $IssPath
if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed (exit code $LASTEXITCODE)" }

Write-Host "`nDone: $ScriptDir\Output\ADHDisplaySetup.exe"
