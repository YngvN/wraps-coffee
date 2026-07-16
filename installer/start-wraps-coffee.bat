@echo off
setlocal

rem Installed by wraps-coffee.iss as a "run at logon" scheduled task, so this
rem fires on every restart of the kiosk PC. Branches on this machine's own
rem role (electron/roleSetup.cjs's display-role.json, written by Electron's
rem own first-run wizard - absent on a genuinely first-ever run, defaulting
rem to "server" below, this script's original single-role behavior; if the
rem admin then picks "Display only" in that wizard, this one run will have
rem optimistically started a local server that ends up unused - accepted as
rem a one-time minor inefficiency rather than adding batch<->Electron IPC to
rem cancel it):
rem   - "server": starts the local server, waits for it, then opens the app
rem     in a native Electron kiosk window if one was successfully installed,
rem     falling back to a kiosk browser window otherwise (see
rem     wraps-coffee.iss for why Electron's own binary download can fail on
rem     a restrictive network even when the rest of npm install succeeds).
rem   - "display": no local server at all (a display-only machine has no
rem     data of its own - starting a second, independently-seeded server
rem     would just be wasted and confusing) - Electron itself reads
rem     display-role.json and connects to the discovered/configured server.
rem Both roles' Electron-vs-Edge choice above can be overridden from the
rem dashboard (Settings -> Advanced -> "Which window should the kiosk
rem display open in?", server/index.ts's own GET /window-launch-method) -
rem see :launch_window below, the one place that actually reads it.

set "APPDIR=%~dp0"
cd /d "%APPDIR%"
if not exist logs mkdir logs

set "ROLE=server"
set "SERVER_HOST="
if exist "server\data\display-role.json" (
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Get-Content 'server\data\display-role.json' -Raw | ConvertFrom-Json).role } catch {}"`) do set "ROLE=%%i"
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Get-Content 'server\data\display-role.json' -Raw | ConvertFrom-Json).serverHost } catch {}"`) do set "SERVER_HOST=%%i"
)

if /i "%ROLE%"=="display" goto display_role

:server_role
set "WRAPS_COFFEE_URL=http://localhost:4173/admin/login"

echo Starting Wraps ^& Coffee...
call :start_server

echo Waiting for the local server to respond...
call :wait_until_healthy

rem Settings -> Advanced -> "Which window should the kiosk display open in?"
rem (server/index.ts's own GET /window-launch-method) - defaults to "auto"
rem if unreachable or never set, which keeps :launch_window's original
rem Electron-else-Edge-kiosk detection below.
set "LAUNCH_METHOD=auto"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4000/window-launch-method' -TimeoutSec 3).method } catch {}"`) do set "LAUNCH_METHOD=%%i"

call :launch_window "%WRAPS_COFFEE_URL%"

rem Looks up the LAN IP fresh from the server itself (server/index.ts's own
rem /server-info endpoint - the same source of truth the app uses internally
rem for its own screen links) rather than parsing ipconfig, which is fragile
rem across Windows locales (its output is translated).
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4000/server-info' -TimeoutSec 3).lanIp } catch {}"`) do set "LAN_IP=%%i"

echo.
echo   Wraps ^& Coffee is running:
echo     On this PC:        %WRAPS_COFFEE_URL%
rem Note: LAN_IP was set outside this block (line above, top-level), which is
rem why plain %LAN_IP% expansion is safe to read here - a variable set *and*
rem read within the same parenthesized block would need delayed expansion
rem (!LAN_IP!) instead, since cmd.exe substitutes %var% once at parse time,
rem before any command inside the block has actually run.
if not "%LAN_IP%"=="" (
  echo     On other devices:  http://%LAN_IP%:4173/admin/login
  echo.
  node "%APPDIR%print-qr.cjs" "http://%LAN_IP%:4173/admin/login"
) else (
  echo     ^(couldn't detect a LAN IP - this machine may be offline^)
)
echo.

echo Watching the server - this window can be closed at any time, the app keeps running.
:server_watchdog
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
goto server_watchdog

:display_role
echo Display-only machine - connecting to %SERVER_HOST%...

rem Same Settings -> Advanced launch-method choice as :server_role above, but
rem this machine has no local server of its own to ask (see the module-level
rem comment at the top of this file) - reads it from the remote main server
rem instead. Left at "auto" (today's original Electron-else-Edge-kiosk
rem detection) if that server isn't reachable yet at boot.
set "LAUNCH_METHOD=auto"
if not "%SERVER_HOST%"=="" (
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://%SERVER_HOST%:4000/window-launch-method' -TimeoutSec 3).method } catch {}"`) do set "LAUNCH_METHOD=%%i"
)

rem No single URL to point a plain kiosk browser at here in general (Electron
rem manages however many monitors this machine has); falling back to
rem /display-connect instead treats this machine's one browser window as a
rem plain "via URL" display - the exact same self-registration flow a
rem browser tab uses, just reached via a local kiosk browser instead of
rem someone typing the URL in by hand.
call :launch_window "http://%SERVER_HOST%:4173/display-connect"

echo Watching the app window - this machine has no local server to health-check, so this just confirms the window itself is still running.
:display_watchdog
timeout /t 10 /nobreak >nul
if /i "%LAUNCHED_VIA%"=="edge" (
  rem Imprecise if some other Edge window happens to be open on this machine
  rem for an unrelated reason - this machine has no other use for a browser,
  rem so accepted the same way the electron.exe check below already assumes
  rem this is the only Electron app installed.
  tasklist /fi "imagename eq msedge.exe" | find /i "msedge.exe" >nul
) else (
  tasklist /fi "imagename eq electron.exe" | find /i "electron.exe" >nul
)
if errorlevel 1 (
  echo App window isn't running, restarting it...
  call :launch_window "http://%SERVER_HOST%:4173/display-connect"
)
goto display_watchdog

:launch_window
rem %~1 = URL to open - only used by the Edge-kiosk branch (Electron reads
rem its own role/screen config and ignores this). Called once at boot by
rem each role above, and again by :display_watchdog if the window it opened
rem unexpectedly quits. Branches on LAUNCH_METHOD, set by whichever role
rem called this: "electron"/"edge" force one or the other outright (see
rem Settings -> Advanced), anything else ("auto", unset, or the setting was
rem unreachable) falls through to the original Electron-if-installed-else-
rem Edge-kiosk detection. Sets LAUNCHED_VIA so :display_watchdog knows which
rem process to actually watch for.
if /i "%LAUNCH_METHOD%"=="edge" goto launch_window_edge
if /i "%LAUNCH_METHOD%"=="electron" goto launch_window_electron
if exist "node_modules\electron\dist\electron.exe" goto launch_window_electron
goto launch_window_edge

:launch_window_electron
set "LAUNCHED_VIA=electron"
echo Launching the native app window (Electron)...
start "WrapsCoffeeWindow" cmd /c "npm run start:electron >> logs\electron.log 2>&1"
goto :eof

:launch_window_edge
set "LAUNCHED_VIA=edge"
if /i "%LAUNCH_METHOD%"=="edge" (
  echo Window launch method is set to Microsoft Edge - opening a kiosk browser window...
) else (
  echo Electron isn't installed - opening a kiosk browser window instead.
)
start "" msedge --kiosk "%~1" --edge-kiosk-type=fullscreen --no-first-run --disable-session-crashed-bubble
goto :eof

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
