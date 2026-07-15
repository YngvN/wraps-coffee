@echo off
setlocal
cd /d "%~dp0"

rem Looks up the current LAN IP fresh each time (rather than a fixed address
rem baked into this shortcut) since the server-info endpoint (server/index.ts)
rem is the same source of truth the app itself uses, and a DHCP-assigned IP
rem can change between reboots.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4000/server-info' -TimeoutSec 3).lanIp } catch {}"`) do set "LAN_IP=%%i"

if not "%LAN_IP%"=="" (
  start "" "http://%LAN_IP%:4173/admin/login"
) else (
  start "" "http://localhost:4173/admin/login"
)
