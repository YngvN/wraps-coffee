@echo off
setlocal

rem Installed by wraps-coffee.iss as a "run at logon" scheduled task, so this
rem fires on every restart of the kiosk PC. Starts the local server, waits for
rem it to answer, then opens the app in a native Electron kiosk window if one
rem was successfully installed, falling back to a kiosk browser window
rem otherwise (see wraps-coffee.iss for why Electron's own binary download can
rem fail on a restrictive network even when the rest of npm install succeeds).

set "APPDIR=%~dp0"
set "WRAPS_COFFEE_URL=http://localhost:4173/admin"
cd /d "%APPDIR%"
if not exist logs mkdir logs

echo Starting Wraps ^& Coffee...
call :start_server

echo Waiting for the local server to respond...
:wait_for_server
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%WRAPS_COFFEE_URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_for_server
)

if exist "node_modules\electron\dist\electron.exe" (
  echo Launching the native app window...
  start "WrapsCoffeeWindow" cmd /c "npm run start:electron >> logs\electron.log 2>&1"
) else (
  echo Electron isn't installed - opening a kiosk browser window instead.
  start "" msedge --kiosk "%WRAPS_COFFEE_URL%" --edge-kiosk-type=fullscreen --no-first-run --disable-session-crashed-bubble
)

echo Watching the server - this window can be closed at any time, the app keeps running.
:watchdog
timeout /t 5 /nobreak >nul
tasklist /fi "windowtitle eq WrapsCoffeeServer" /fi "imagename eq cmd.exe" | find /i "cmd.exe" >nul
if errorlevel 1 (
  echo Server window disappeared, restarting it...
  call :start_server
)
goto watchdog

:start_server
rem preview:kiosk (package.json) is "npm run preview" plus --kill-others, so the
rem frontend static server and the WS backend live and die together - that's
rem what makes the watchdog's "is the wrapper window still open" check above
rem meaningful, instead of missing a crash of just one half. Calling the npm
rem script (rather than inlining concurrently's own quoted arguments here)
rem avoids nested-quote parsing that cmd.exe handles unreliably.
start "WrapsCoffeeServer" /min cmd /c "npm run preview:kiosk >> logs\server.log 2>&1"
goto :eof
