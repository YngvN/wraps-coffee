# Phase 0 — cheap spike, run before anything else

~10 minutes. Confirms (or rules out) the leading hypothesis and gates the TV branch, before spending time
building/running the full four-variant harness. See the plan's "Phase 0" section for the full reasoning.

## Step 1 — manual Chrome trace on desktop

1. Start the app normally (`npm run preview:kiosk`).
2. Open any existing multi-stage screen (or make one by hand with 2+ panes and 2 stages with different
   pane sizes) at `/screens/<id>?unattended=1` in Chrome.
3. DevTools → Performance → record → wait for one natural stage transition → stop.
4. In the flame chart, select the ~0.5s "holding" window (where the grid/borders visibly move) and count
   `Layout` entries inside it.
5. **Read the result**: if the count is roughly `8 × (number of font-scale panes on screen)`, the
   `useShrinkToFitFontScale` binary search (`src/hooks/useShrinkToFitFontScale.ts`) is confirmed as the
   dominant per-frame cost — the hypothesis holds. If the count doesn't fit that pattern, or something
   else stands out in the trace, note it — the full four-variant harness (Phase 1+) is what you'd build
   out next to pin down what's actually happening instead.

## Step 2 — TV WebView version + visual check

```
adb shell dumpsys package no.adhdisplay.companion webview | grep -i versionName
```

- If the reported version's Chromium major is low enough that grid-track interpolation might not be
  supported at all (see the plan's "Verified-plausible risk" note under TV/adb design decisions), the
  next step is simply watching the screen play on the TV: do the pane borders visibly slide between
  stages, or snap instantly? If they snap, this device can't animate the transition at all — P4 becomes
  a visual-parity finding, not a frame-timing one, and the TV branch of the rest of this harness isn't
  worth running against it as originally scoped.
- If the version is modern, proceed to the rest of the harness as planned.

## Already captured for this session

- WebView on the connected Toshiba/Vestel TV (`192.168.88.195:5555`, package `no.adhdisplay.companion`):
  **Chromium 147.0.7727.137** (`dumpsys webviewupdate` confirms this is the active/preferred package) —
  well past any plausible grid-interpolation-support threshold. The TV branch is a legitimate
  frame-timing target on this device, not a visual-parity investigation.
- Companion app installed: version 0.2.20, release build (`assembleRelease` — no WebView devtools socket
  found via `/proc/net/unix`, confirming debugging is off as expected). A debug build is still needed for
  `07-tv-cdp-trace.ts` (P4.2); the release build already installed is fine as-is for `06-tv-frame-stats.sh`
  (P4.3).
