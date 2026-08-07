@echo off
setlocal

rem Installed by adhdisplay.iss as a "run at logon" scheduled task, so this
rem fires on every restart of the kiosk PC. Starts the local server, waits
rem for it, then opens the app in a native Electron kiosk window if one was
rem successfully installed, falling back to a kiosk browser window otherwise
rem (see adhdisplay.iss for why Electron's own binary download can fail on a
rem restrictive network even when the rest of npm install succeeds). The
rem Electron-vs-Edge choice can be overridden from the dashboard (Settings ->
rem Advanced -> "Which window should the kiosk display open in?",
rem server/index.ts's own GET /window-launch-method) - see :launch_window
rem below, the one place that actually reads it.

set "APPDIR=%~dp0"
cd /d "%APPDIR%"
if not exist logs mkdir logs

rem %~dp0 always has a trailing backslash. That's fine inside "%APPDIR%file"
rem style paths, but passing it as the very last thing before a closing quote
rem (e.g. "%APPDIR%" with nothing after it) is a classic Windows argv-parsing
rem trap: a lone backslash immediately before a closing " is read as an
rem escaped literal quote, not the end of the argument, which corrupts
rem everything parsed after it. APPDIR_NOSLASH exists for exactly those
rem trailing-argument spots (see -AppDir below).
set "APPDIR_NOSLASH=%APPDIR:~0,-1%"

set "ADHDISPLAY_URL=http://localhost:4173/admin/login"

echo Starting ADHDisplay...
call :start_ollama
call :start_server

rem Tray icon is tied to the server's own lifecycle, not to whichever kiosk
rem window mode gets picked below - it's launched once here, from the
rem top-level script body, rather than from :start_server (which
rem :server_watchdog also calls again on every automatic restart - launching
rem it there would spawn a new tray icon on every single restart). It keeps
rem running even if the Electron/Edge window is later closed manually while
rem the server stays up.
wscript.exe //B "%APPDIR%run-hidden.vbs" "%APPDIR%launch-tray.bat"

echo Waiting for the local server to respond...
call :wait_until_healthy

rem Settings -> Advanced -> "Which window should the kiosk display open in?"
rem (server/index.ts's own GET /window-launch-method) - defaults to "auto"
rem if unreachable or never set, which keeps :launch_window's original
rem Electron-else-Edge-kiosk detection below.
set "LAUNCH_METHOD=auto"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4000/window-launch-method' -TimeoutSec 3).method } catch {}"`) do set "LAUNCH_METHOD=%%i"

call :launch_window "%ADHDISPLAY_URL%"

rem Looks up the LAN IP fresh from the server itself (server/index.ts's own
rem /server-info endpoint - the same source of truth the app uses internally
rem for its own screen links) rather than parsing ipconfig, which is fragile
rem across Windows locales (its output is translated).
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4000/server-info' -TimeoutSec 3).lanIp } catch {}"`) do set "LAN_IP=%%i"

echo.
echo   ADHDisplay is running:
echo     On this PC:        %ADHDISPLAY_URL%
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

rem Checked every iteration, in addition to the health-check failures below -
rem lets the tray helper's "Restart Server" action (see tray-helper.ps1) ask
rem for an immediate restart without waiting for two full health-check
rem failures. The tray only writes this sentinel *after* confirming the
rem server's ports are actually free (via adhdisplay-control.ps1's own bounded
rem poll), so by the time it's seen here a relaunch is safe - re-checking
rem health first anyway, rather than relaunching unconditionally, covers the
rem case where something else already recovered the server in the meantime.
set "NEEDS_RESTART=0"
if exist "%APPDIR%logs\.restart-requested" (
  del /f /q "%APPDIR%logs\.restart-requested" >nul 2>&1
  call :check_health
  if errorlevel 1 set "NEEDS_RESTART=1"
) else (
  call :check_health
  if errorlevel 1 (
    rem One missed check could just be a slow response, not a crash - confirm
    rem before restarting anything.
    timeout /t 5 /nobreak >nul
    call :check_health
    if errorlevel 1 set "NEEDS_RESTART=1"
  )
)

if "%NEEDS_RESTART%"=="1" (
  echo Server isn't responding, restarting it...
  rem Delegates to the same shared stop script the installer/uninstaller use
  rem (adhdisplay-control.ps1), rather than a separate copy of the same
  rem port-matching logic - scoped to whatever's actually bound to this app's
  rem own ports (4000/4173) rather than every node.exe on the machine.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%adhdisplay-control.ps1" -Action StopServer -AppDir "%APPDIR_NOSLASH%" >nul 2>&1
  call :start_server
  call :wait_until_healthy
)
goto server_watchdog

:launch_window
rem %~1 = URL to open - only used by the Edge-kiosk branch (Electron reads
rem its own screen config and ignores this). Called once at boot; the
rem watchdog loop above only restarts the server process itself, not this
rem window. Branches on LAUNCH_METHOD: "electron"/"edge" force one or the
rem other outright (see Settings -> Advanced), anything else ("auto", unset,
rem or the setting was unreachable) falls through to the original
rem Electron-if-installed-else-Edge-kiosk detection.
if /i "%LAUNCH_METHOD%"=="edge" goto launch_window_edge
if /i "%LAUNCH_METHOD%"=="electron" goto launch_window_electron
if exist "node_modules\electron\dist\electron.exe" goto launch_window_electron
goto launch_window_edge

:launch_window_electron
echo Launching the native app window (Electron)...
start "ADHDisplayWindow" cmd /c "npm run start:electron >> logs\electron.log 2>&1"
goto :eof

:launch_window_edge
if /i "%LAUNCH_METHOD%"=="edge" (
  echo Window launch method is set to Microsoft Edge - opening a kiosk browser window...
) else (
  echo Electron isn't installed - opening a kiosk browser window instead.
)
start "" msedge --kiosk "%~1" --edge-kiosk-type=fullscreen --no-first-run --disable-session-crashed-bubble
goto :eof

:start_ollama
rem Best-effort top-up alongside the app server itself: most Windows Ollama
rem installs already auto-start their own tray app at logon, but that's a
rem separate app-level guarantee this script doesn't control (and this
rem scheduled task can fire before the interactive logon session that
rem Startup-folder entry depends on) - so make sure it's actually up too,
rem not just assumed. Silently skipped if Ollama isn't installed at all -
rem a Claude-only setup has no use for it.
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :eof
where ollama >nul 2>&1
if errorlevel 1 goto :eof
echo Starting Ollama...
rem Launched fully hidden (via run-hidden.vbs, see its own header comment for
rem why not `powershell -WindowStyle Hidden`) rather than `start ... /min`,
rem which only minimizes the window - still a visible taskbar entry on what's
rem meant to be a clean kiosk display.
wscript.exe //B "%APPDIR%run-hidden.vbs" "%APPDIR%launch-ollama.bat"
goto :eof

:start_server
rem preview:kiosk (package.json) is "npm run preview" plus --kill-others, so the
rem frontend static server and the WS backend live and die together. The
rem actual command lives in launch-server.bat (kept as its own file rather
rem than inlined here so run-hidden.vbs only ever needs to pass through a
rem plain file path, not a compound command containing redirection).
wscript.exe //B "%APPDIR%run-hidden.vbs" "%APPDIR%launch-server.bat"
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
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%ADHDISPLAY_URL%' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
