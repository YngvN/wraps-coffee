# Pane-resize-stutter diagnostic tooling

Throwaway diagnostic tooling for the "Diagnostic Spec: Pane-Resize Stutter on Stage Transitions" —
measures and attributes the stutter, doesn't fix it. Zero changes to shipped `src/`/`server/`/`electron/`
code. Safe to delete this whole directory once done; the only side effects outside it are the 4 seeded
screens/products/catalogues (cleaned up by `01-seed-screens.ts --remove`) and the copy of the final
report under `QA/Reports/`.

See `/Users/yngvenykas/.claude/plans/diagnostic-spec-pane-resize-stutter-functional-thimble.md` for the
full design rationale — this file is just the practical run-through.

## What this measures

`SplitLayout.tsx`'s stage-transition sequence animates pane geometry via a CSS
`grid-template-columns`/`rows` transition (`SplitLayout.tsx:490`). Each pane also runs one of two
measurement hooks depending on content kind (`LayoutPane.tsx:271-274`): the cheap
`useShrinkToFitScale`, or `useShrinkToFitFontScale` — an 8-iteration binary search that forces a
synchronous layout read on every iteration (`useShrinkToFitFontScale.ts`'s `fitsAt()`), re-triggered by
a `ResizeObserver` that likely fires near-every-frame while the grid track is animating. This tooling
measures which of those (plus plain descendant/text cost) actually dominates the frame budget, on
desktop Chrome/Firefox, in Electron, and on the actual TV hardware.

## Prerequisites

- `npm run preview:kiosk` running in a separate terminal.
- adb reachable for the TV steps (`adb devices` should list it).
- For `07-tv-cdp-trace.ts`: a **debug** build of the companion app installed on the TV (WebView
  debugging is off on release builds — see `adhdisplay-companion/README.md`'s documented
  `assembleDebug` path) plus Metro reachable from the TV.
- For `03-run-electron-trace.ts`: if `server/data/display-role.json` doesn't exist yet on this machine,
  run `npm run start:electron` once by hand first and click through the one-time setup wizard — that
  script does not automate it.

## Run order

0. **Phase 0 spike** — see `scripts/00-spike-check.md`. ~10 minutes, do this first; it can save building
   out the rest if the hypothesis is already clear, and it gates whether the TV branch is even
   meaningful on this hardware.
1. `npx tsx scripts/01-seed-screens.ts --username admin --password <pw>` — seeds the 4 scenario screens
   (`as-is`/`emptycatalogue`/`textblock`/`emptied`), prints their URLs. Sanity-check one URL in a plain
   browser tab, and confirm no existing real screen went missing from the admin dashboard.
2. **⚠️ Confirmation checkpoint** — per this repo's CLAUDE.md, get explicit confirmation before running
   any of steps 3, 4, or 6 below; they drive real browser/Electron/CDP automation against the live app.
3. `npx tsx scripts/02-run-browser-trace.ts --browser=chromium --screenId=<id>` and
   `--browser=firefox --screenId=<id>`, for each of the 4 seeded screen ids.
4. `npx tsx scripts/03-run-electron-trace.ts --screenId=<as-is-id> --flag=off` and `--flag=on`.
   `npx electron scripts/04-electron-gpu-status.cjs` both ways too (P3, time-boxed to ~10 min).
5. One-time TV setup: install the release apk for step 6a, and separately a debug apk + Metro for step
   6b; navigate the companion app to each seeded screen's URL as needed.
6. `./scripts/05-tv-webview-inspect.sh` (if not already run in Phase 0), then:
   a. `./scripts/06-tv-frame-stats.sh --label=idle` and `--label=active` (release build, no confirmation
      needed — plain adb, not browser automation).
   b. (same confirmation gate as step 2) follow 05's printed `adb forward` command, then
      `npx tsx scripts/07-tv-cdp-trace.ts --screenId=<id> --socket=<from 05's output>` (debug build).
7. `npx tsx scripts/08-aggregate-report.ts` — writes `results/report.md` and copies it to
   `QA/Reports/qa-report-pane-resize-stutter-diagnostic-<date>.md`. Read it against the spec's own §8
   interpretation guide.
8. `npx tsx scripts/01-seed-screens.ts --username admin --password <pw> --remove` — cleans up.

## Manual-only leftovers

- P2.4 (paint-flashing check) — qualitative DevTools Rendering-panel read, no automation surface.
- Firefox's exact DevTools "dropped frame %" reading is superseded here by the rAF-delta proxy (see the
  plan) rather than left as a manual step.

## Files

- `types.ts` — shared result/report types.
- `lib/seedClient.ts` — `/login` + WS `write` client; backup-then-merge-by-id, never a partial overwrite.
- `lib/buildScenarioScreens.ts` / `lib/diagCatalogueData.ts` — the 4 scenario `ScreenConfig`s + their
  backing catalogue/product data.
- `lib/transitionMarkers.ts` — injected `console.timeStamp` transition-boundary markers.
- `lib/rafDeltaCapture.ts` — the canonical cross-target metric.
- `lib/cdpTrace.ts` / `lib/traceParse.ts` — raw Chrome trace capture + Layout-event attribution
  (Chromium-only: Playwright chromium, Electron, TV WebView — all via CDP).
- `lib/resultsStore.ts` — `results/*.json` read/write + report rendering.
- `scripts/00`-`08` — see each file's own doc comment; run in order per above.
