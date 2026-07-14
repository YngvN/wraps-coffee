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

call :start_server

:wait_for_server
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%WRAPS_COFFEE_URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_for_server
)

if exist "node_modules\electron\dist\electron.exe" (
  start "WrapsCoffeeWindow" cmd /c "npm run start:electron >> logs\electron.log 2>&1"
) else (
  start "" msedge --kiosk "%WRAPS_COFFEE_URL%" --edge-kiosk-type=fullscreen --no-first-run --disable-session-crashed-bubble
)

:watchdog
timeout /t 5 /nobreak >nul
tasklist /fi "windowtitle eq WrapsCoffeeServer" /fi "imagename eq cmd.exe" | find /i "cmd.exe" >nul
if errorlevel 1 (
  call :start_server
)
goto watchdog

:start_server
rem --kill-others (not part of the app's own "npm run preview" script) makes the
rem frontend static server and the WS backend live and die together, so the
rem watchdog's "is the wrapper window still open" check above actually reflects
rem whether the whole pair is healthy, instead of missing a crash of just one half.
start "WrapsCoffeeServer" /min cmd /c "npx concurrently -n vite,ws -c blue,magenta --kill-others ""vite preview --host"" ""tsx server/index.ts"" >> logs\server.log 2>&1"
goto :eof
