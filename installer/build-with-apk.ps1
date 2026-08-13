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

Write-Host "Compiling ADHDisplay installer..."
& $IsccPath $IssPath
if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed (exit code $LASTEXITCODE)" }

Write-Host "`nDone: $ScriptDir\Output\ADHDisplaySetup.exe"
