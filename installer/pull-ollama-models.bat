@echo off
setlocal

rem Launched hidden (via run-hidden.vbs) by adhdisplay.iss's CurStepChanged
rem right after Ollama itself is installed/confirmed present, so the initial
rem model download doesn't block the installer wizard - two ~3B models is a
rem multi-GB combined download with no natural progress/cancel inside a
rem blocking Exec, which would otherwise freeze Setup for a long,
rem unpredictable time. Mirrors scripts/setup-ollama.sh's own model tags,
rem which match server/store.ts's actual live app defaults (visionModel/
rem thinkingModel) - not stale, confirmed against the real code.
rem
rem Models simply become available whenever this finishes; nothing in the
rem installer waits on it. A user can check progress via this file's own log,
rem or by trying Settings -> Integrations -> Ollama -> Test connection.

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

echo [%DATE% %TIME%] Pulling qwen2.5:3b-instruct (thinking model)... >> "%LOG%"
"%OLLAMA_EXE%" pull qwen2.5:3b-instruct >> "%LOG%" 2>&1

echo [%DATE% %TIME%] Done. >> "%LOG%"
