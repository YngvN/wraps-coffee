@echo off
setlocal

rem No longer launched automatically by adhdisplay.iss - "Install Ollama"
rem now installs just Ollama itself (bundled, no network download at install
rem time - see that file's own header comment), not these models too. Kept
rem here as an optional manual utility (support/troubleshooting, or a fleet
rem redeploy script that still wants to prefetch both defaults in one go) -
rem run it by hand, or via run-hidden.vbs the same way the installer used to.
rem Mirrors scripts/setup-ollama.sh's own model tags, which match
rem server/store.ts's actual live app defaults (visionModel/thinkingModel) -
rem not stale, confirmed against the real code.
rem
rem Models simply become available whenever this finishes; nothing waits on
rem it. Check progress via this file's own log, or Settings -> Integrations
rem -> Ollama -> Test connection.

set "APPDIR=%~dp0"
if not exist "%APPDIR%logs" mkdir "%APPDIR%logs"
set "LOG=%APPDIR%logs\ollama-models.log"

rem INFERRED default per-user install location for Ollama's own Windows
rem installer - falls back to relying on PATH if it's not there, confirm
rem during implementation/testing.
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" set "OLLAMA_EXE=ollama.exe"

echo [%DATE% %TIME%] Waiting for the Ollama service to come up... >> "%LOG%"
:wait_ollama
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_ollama
)

echo [%DATE% %TIME%] Pulling qwen2.5vl:3b (vision model)... >> "%LOG%"
"%OLLAMA_EXE%" pull qwen2.5vl:3b >> "%LOG%" 2>&1

echo [%DATE% %TIME%] Pulling qwen3:4b (thinking model)... >> "%LOG%"
"%OLLAMA_EXE%" pull qwen3:4b >> "%LOG%" 2>&1

echo [%DATE% %TIME%] Done. >> "%LOG%"
