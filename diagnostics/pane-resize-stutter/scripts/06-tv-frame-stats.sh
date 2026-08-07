#!/usr/bin/env bash
# P4.3 — dumpsys gfxinfo framestats against the RELEASE apk (no debugging needed — see the plan's
# "frame-stats capture split from CDP-trace capture" design decision: a debug build's live Metro
# connection would inflate these numbers for reasons unrelated to the pane-resize cost under test).
# Run once with --label=idle (companion app sitting on a single-stage/non-rotating screen) and once
# with --label=active (companion app navigated to a seeded multi-stage scenario screen).
#
# Usage: ./06-tv-frame-stats.sh --label=idle|active [--device=<serial>] [--waitSeconds=15]
set -euo pipefail

PACKAGE="no.adhdisplay.companion"
LABEL="idle"
DEVICE=""
WAIT_SECONDS=15

for arg in "$@"; do
  case "$arg" in
    --label=*) LABEL="${arg#*=}" ;;
    --device=*) DEVICE="${arg#*=}" ;;
    --waitSeconds=*) WAIT_SECONDS="${arg#*=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

ADB=(adb)
if [ -n "$DEVICE" ]; then ADB=(adb -s "$DEVICE"); fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../results"
mkdir -p "$OUT_DIR"

echo "Resetting gfxinfo stats for $PACKAGE..."
"${ADB[@]}" shell dumpsys gfxinfo "$PACKAGE" reset > /dev/null

echo "Waiting ${WAIT_SECONDS}s to accumulate frames (label: $LABEL) — make sure the companion app is on the intended screen now..."
sleep "$WAIT_SECONDS"

OUT_FILE="$OUT_DIR/tv-framestats-${LABEL}-$(date +%Y%m%dT%H%M%S).txt"
"${ADB[@]}" shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT_FILE"
echo "Saved $OUT_FILE"
echo "Parse the 'Janky frames' summary line, and the raw per-frame nanosecond columns, by hand or feed this file into 08-aggregate-report.ts's tvJankPercent input."
