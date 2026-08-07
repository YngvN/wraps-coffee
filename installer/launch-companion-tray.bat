@echo off
rem Launched hidden (via run-hidden.vbs) once from
rem start-adhdisplay-companion.bat's top-level body - deliberately NOT called
rem from inside :launch_loop, since that label re-runs on every crash/restart
rem cycle, which would otherwise spawn a new tray icon every time.
rem companion-tray-helper.ps1 itself takes a single-instance mutex as a second
rem line of defense (e.g. against a user launching a second top-level instance
rem via the desktop/Start Menu shortcut while one is already running).
cd /d "%~dp0"
rem -STA: companion-tray-helper.ps1 uses System.Windows.Forms, which requires
rem a Single-Threaded Apartment.
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0companion-tray-helper.ps1"
