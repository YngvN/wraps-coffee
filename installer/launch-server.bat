@echo off
rem Launched hidden (via run-hidden.vbs) by start-adhdisplay.bat's
rem :start_server - kept as its own file rather than inlined so run-hidden.vbs
rem only ever needs to pass through a plain file path, not a compound command
rem containing redirection operators (see run-hidden.vbs's own header comment
rem for why that's worth avoiding).
cd /d "%~dp0"
if not exist logs mkdir logs
npm run preview:kiosk >> logs\server.log 2>&1
