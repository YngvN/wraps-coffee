@echo off
setlocal

rem Installed by adhdisplay-companion.iss as a "run at logon" scheduled task
rem (ADHDisplayCompanionLauncher), so this fires on every restart of the
rem kiosk device. Unlike start-adhdisplay.bat (the main app's own watchdog),
rem there's no separate server process to start/health-check here - Companion
rem is one process, Electron itself, serving its own web export in-process
rem via electron/main.cjs's "app://" protocol handler. So instead of an
rem HTTP-polling watchdog loop, this is a plain crash-respawn loop: launch
rem Electron and block on it (no "start", so this script's own process IS the
rem wait), and relaunch whenever it exits for any reason. No Edge-kiosk
rem fallback either - Companion's web export only works loaded via
rem electron/main.cjs's own "app://" scheme (see that file's own comment on
rem why plain http:// mixed-content rules would otherwise block the LAN
rem display iframe), so unlike the main app there's no meaningful
rem alternative launch method to offer.
rem
rem Also launches a system tray icon (companion-tray-helper.ps1) offering
rem Restart/Quit - the only clean way to stop Companion, since closing the
rem window alone just triggers :launch_loop's own relaunch.

set "APPDIR=%~dp0"
cd /d "%APPDIR%"
if not exist logs mkdir logs

echo Starting ADHDisplay Companion...

rem Launched once here, from the top-level script body - not from inside
rem :launch_loop, which re-runs on every crash/restart and would otherwise
rem spawn a new tray icon every cycle. companion-tray-helper.ps1 itself takes
rem a single-instance mutex as a second line of defense.
wscript.exe //B "%APPDIR%run-hidden.vbs" "%APPDIR%launch-companion-tray.bat"

:launch_loop
"node_modules\electron\dist\electron.exe" "electron\main.cjs" >> logs\electron.log 2>&1
echo ADHDisplay Companion closed or crashed - relaunching in 3 seconds...
timeout /t 3 /nobreak >nul
goto launch_loop
