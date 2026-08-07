#!/usr/bin/env bash
# P4.1 — WebView version + debug-socket discovery on the TV. Prints (doesn't run) the `adb forward`
# command 07-tv-cdp-trace.ts needs. Safe/read-only — no confirmation needed, unlike the
# browser-automation scripts. See the plan's TV/adb design decision.
#
# Usage: ./05-tv-webview-inspect.sh [device-serial]
set -euo pipefail

PACKAGE="no.adhdisplay.companion"
DEVICE="${1:-}"
ADB=(adb)
if [ -n "$DEVICE" ]; then ADB=(adb -s "$DEVICE"); fi

echo "== Active WebView package =="
"${ADB[@]}" shell dumpsys webviewupdate | grep -i "Current WebView package"

echo
echo "== Companion app version =="
"${ADB[@]}" shell dumpsys package "$PACKAGE" | grep -iE "versionName|versionCode" | head -2

echo
echo "== Debug socket discovery =="
PID="$("${ADB[@]}" shell pidof "$PACKAGE" || true)"
if [ -z "$PID" ]; then
  echo "App not running — launch it on the TV first."
  exit 1
fi
echo "PID: $PID"

SOCKET="$("${ADB[@]}" shell cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | awk '{print $NF}' | sed 's/^@//' | head -1 || true)"
if [ -z "$SOCKET" ]; then
  echo "No webview_devtools_remote socket found — WebView debugging is off (this is expected on a release build)."
  echo "Build/install a DEBUG apk for CDP tracing (see adhdisplay-companion/README.md's documented assembleDebug path);"
  echo "the currently-installed release build is fine as-is for 06-tv-frame-stats.sh (P4.3)."
  exit 0
fi
echo "Debug socket: $SOCKET"
echo
echo "Next, for 07-tv-cdp-trace.ts:"
echo "  ${ADB[*]} forward tcp:9222 localabstract:$SOCKET"
echo "  curl http://localhost:9222/json/version   # confirm it's reachable"
echo "  npx tsx diagnostics/pane-resize-stutter/scripts/07-tv-cdp-trace.ts --screenId=<id> --socket=$SOCKET${DEVICE:+ --device=$DEVICE}"
