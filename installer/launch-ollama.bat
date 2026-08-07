@echo off
rem Launched hidden (via run-hidden.vbs) by start-adhdisplay.bat's
rem :start_ollama - see launch-server.bat's comment for why this is its own
rem small file rather than inlined into a compound command.
cd /d "%~dp0"
if not exist logs mkdir logs
ollama serve >> logs\ollama.log 2>&1
