@echo off
rem Launched hidden (via run-hidden.vbs) once from start-adhdisplay.bat's
rem top-level body - deliberately NOT called from :start_server, since that
rem label is also called again by :server_watchdog on every automatic
rem restart, which would otherwise spawn a new tray icon on every restart.
rem tray-helper.ps1 itself takes a single-instance mutex as a second line of
rem defense (e.g. against a user launching a second top-level instance via
rem the desktop/Start Menu shortcut while one is already running).
cd /d "%~dp0"
rem -STA: tray-helper.ps1 uses System.Windows.Forms, which requires a
rem Single-Threaded Apartment.
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0tray-helper.ps1"
