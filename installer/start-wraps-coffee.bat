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
call :wait_until_healthy

if exist "node_modules\electron\dist\electron.exe" (
  echo Launching the native app window...
  start "WrapsCoffeeWindow" cmd /c "npm run start:electron >> logs\electron.log 2>&1"
) else (
  echo Electron isn't installed - opening a kiosk browser window instead.
  start "" msedge --kiosk "%WRAPS_COFFEE_URL%" --edge-kiosk-type=fullscreen --no-first-run --disable-session-crashed-bubble
)

echo Watching the server - this window can be closed at any time, the app keeps running.
:watchdog
timeout /t 10 /nobreak >nul
call :check_health
if errorlevel 1 (
  rem One missed check could just be a slow response, not a crash - confirm
  rem before restarting anything.
  timeout /t 5 /nobreak >nul
  call :check_health
  if errorlevel 1 (
    echo Server isn't responding, restarting it...
    rem Electron shows up as electron.exe, not node.exe, so this can't touch
    rem the app window - it only clears out the dead/hung vite+tsx processes
    rem before starting a fresh pair on the same ports.
    taskkill /F /IM node.exe >nul 2>&1
    call :start_server
    call :wait_until_healthy
  )
)
goto watchdog

:start_server
rem preview:kiosk (package.json) is "npm run preview" plus --kill-others, so the
rem frontend static server and the WS backend live and die together. Calling
rem the npm script (rather than inlining concurrently's own quoted arguments
rem here) avoids nested-quote parsing that cmd.exe handles unreliably.
start "WrapsCoffeeServer" /min cmd /c "npm run preview:kiosk >> logs\server.log 2>&1"
goto :eof

:wait_until_healthy
call :check_health
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_until_healthy
)
goto :eof

:check_health
rem Deliberately checks actual HTTP health rather than whether a console
rem window with a given title still exists: terminal-aware CLIs (vite,
rem concurrently) commonly rename their own console window as they run,
rem which made an earlier window-title-based check report "gone" on a
rem perfectly healthy server and spawn a duplicate instance fighting over
rem the same ports.
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%WRAPS_COFFEE_URL%' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
