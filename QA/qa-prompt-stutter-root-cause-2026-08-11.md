# Kickoff prompt: find and fix what's left of the kiosk stutter

Copy everything below the line into a **new** Claude Code session. It exists so the next round starts from what has already been measured instead of re-deriving it — three reports and two rounds of fixes are already behind this, and the cheap wins are gone.

**Read first, in this order:** `QA/Reports/qa-report-pane-resize-stutter-diagnostic-2026-08-07.md` (root-cause attribution), `qa-report-pane-resize-stutter-diagnostic-2026-08-10.md` (before/after of the first fix), `qa-report-companion-playback-image-loading-2026-08-11.md` (findings + the Resolutions section at the end).

---

The kiosk display stutters during stage transitions. Two rounds of fixes have landed and the *layout* cost is now essentially gone — but the stutter was reported on the TV, and **no one has ever profiled the TV**. Your job is to find what actually remains, on the real device, and fix it.

## Step 0 — ask before assuming anything

Use `AskUserQuestion` before researching or writing anything. At minimum:

- **Is the stutter still visible on the TV at all?** Everything below assumes it is. If it isn't after 0.2.37, this is a "confirm and close" job, not an investigation.
- **Which TV, and can it take a debug build?** This matters more than it sounds — see "The blocker" below.
- **Is a visible-window (headed) browser run wanted alongside the TV work**, or TV only?

Don't guess past this. A wrong assumption here costs a full cycle.

## What is already fixed — do not redo this

| Cause | Status | Evidence |
|---|---|---|
| `fitsAt()` forced synchronous layout, ~92% of all Layout events | **Fixed** (resize debounce, `shrinkToFitScheduler.ts`) | 08-07 attribution; 08-10 measured Layout count median **770 → 30** |
| Inactive crossfade slot polling forever (Finding 1) | **Fixed** | `trackResize` now gates the MutationObserver + 2s poll in both shrink-to-fit hooks |
| Animated `grid-template-columns`/`-rows` during stage transitions | **Removed entirely** — geometry now snaps in one reflow behind a blanked screen | Total Layout time in transition windows **1728.8ms → 2.4ms** over an identical 45s capture |
| `ExitingPaneGhost` mounts + clip-path growth on every stage change | **Removed** for stage transitions (kept for editor edits) | — |
| Uploaded images never loading on the TV (`localhost` baked into stored URLs) | **Fixed** | `normalizeUploadUrl` |
| Transit/weather panes rendering as overlapping garbage on Chromium < 117 | **Fixed** | `@supports not (grid-template-columns: subgrid)` fallbacks |

Desktop Chromium is now at **0.18% rAF drop** on the worst-case scenario. There is very little left to win there — which is exactly why the next measurement has to happen somewhere else.

## The leading hypothesis: paint/composite, not layout

The 08-10 report predicted this in its own words, before the fix was measured: *"a smaller-than-expected `layoutCountMedian` improvement alongside an unchanged paint figure would mean the fix worked as intended and the remainder is a separate, unaddressed paint cost, not a failed fix."*

That is what happened. On the `human` scenario, layout collapsed (770 → 30) while paint+composite median barely moved (**6.01ms → 4.81ms**).

**Prime suspect, and it is newly testable:** the TV requests and decodes the **full-size original** image, never the `-small` derivative — `pickImageVariant`'s two conditions (`window.innerWidth < 768`, a slow `effectiveType`) are both structurally false on a LAN-connected TV. Test screen's own image is **4032×2268**, which is roughly a **35MB decoded RGBA bitmap** versus ~1.4MB for the 800×450 derivative sitting next to it on disk.

Critically: **this cost was not present when the stutter was originally profiled**, because those images were silently failing to load at all (the `localhost` URL bug, fixed 2026-08-11). The TV is now decoding and compositing something it never used to. Treat "the stutter got worse recently" as a supporting signal, not a contradiction.

Also still open, both from the 08-11 report: **Finding 3** (up to 8 forced synchronous layouts on a font-scale pane's *first* measurement — the debounce doesn't cover mount) and **Finding 4** (the memory-allocation side of the same oversized decode).

## The blocker you will hit immediately

The TV's installed Companion app is a **release build**, and Android WebView debugging is off on release builds. Confirmed on `192.168.0.33`: `pidof` finds the app, `/proc/net/unix` has **no `webview_devtools_remote` socket**, so `07-tv-cdp-trace.ts` has nothing to attach to. There is no CDP trace, no Layout/paint attribution, no `chrome://inspect`.

Options, in preference order:
1. Build and install a **debug APK** (`adhdisplay-companion/README.md` documents the `assembleDebug` path) plus Metro reachable from the TV → full CDP tracing via `scripts/07-tv-cdp-trace.ts`.
2. `scripts/06-tv-frame-stats.sh` — plain `adb`/`dumpsys gfxinfo`, works on the **release** build, gives real frame timings but no attribution. Fills the "TV jank %" column that every row of the 08-10 report left empty.
3. `dumpsys meminfo` for the decode-size hypothesis specifically — cheap, release-safe, and directly tests Finding 4.

Do at least 2 and 3 before concluding anything. Do not skip to fixing.

## Tooling gotchas that will waste your time

- **Fleet WebView versions differ.** The 08-07 report recorded Chromium **147**; the TV at `192.168.0.33` runs **116** (`com.android.webview`, the AOSP build, generally not Play-updatable). These are different devices. Always record the WebView version alongside any measurement — a result from one TV does not transfer.
- **Transition-window counts are no longer comparable between builds.** `lib/transitionMarkers.ts` detects a transition by watching `style` mutations on `.layout-tree__split`. Since `gridTransition` now flips per phase, the same ~9 real transitions register as ~25 short windows instead of 8 long ones. **Per-window medians are meaningless across builds.** Compare *totals over an identical capture duration* only. This burned a full comparison already.
- **Minified builds silently disable forced-sync-layout detection.** The "Forced sync layout?" column matches JS function names (`fitsAt`, `measureAndScale`) in trace stacks; against `vite preview` those names are minified and the column reads "no" even where it applies. Capture against `vite dev` for that signal, per the 08-10 report's own footnote.
- **`02-run-browser-trace.ts` now takes `--headed`.** Use it — watching the run is the point.
- **The content server must be on the port the hub advertises** (`/server-info` reports `contentPort: 4173`). `npm run dev` serves Vite on 5173, so the TV gets `ERR_CONNECTION_REFUSED` until something is on 4173. `npx vite --host --port 4173 --strictPort` is the quick fix.
- Seeded scenarios: `01-seed-screens.ts` (`--remove` to clean up). The `human` scenario is the realistic worst case; it now also carries deliberately loud per-pane colours and a magenta border so a transition is watchable frame by frame.

## Candidate fixes, once you have evidence

Ranked by expected value, but **only act on what your measurements support** — do not implement down this list speculatively:

1. **Serve a right-sized image variant to the TV.** `pickImageVariant` should choose on the pane's *rendered* size, not the viewport's. Needs a product call on acceptable sharpness (and possibly a new `-medium` derivative) — a full-bleed 4K pane genuinely wants more than 800px. Cap upload dimensions too: `server/uploads.ts` has `MAX_UPLOAD_BYTES` but **no dimension cap**.
2. **Finding 3's mount-time binary search** — bounded (once per checkpoint) but undebounced, and it blocks paint. Options: fewer iterations (accuracy tradeoff), or seed from the last-known scale.
3. **The worst-frame regression.** Concentrating all layout into the snap moved the worst frame from ~50ms to ~60-70ms. It lands while the screen is blank, so it is invisible by design — but if TV traces show it dropping several frames, reconsider.

## Deliverable

Write to `QA/Reports/qa-report-stutter-tv-<date>.md`. Follow the existing reports' shape: a **CONFIRMED / HYPOTHESIS** verdict legend, evidence with `file:line` references, and explicit before/after numbers with the capture method stated.

Two standing requirements from this project's own history:

- **Report figures honestly, including disappointing ones.** A previous round's headline improvement (770 → 30 Layout events) sat next to a paint figure that barely moved, and saying so plainly is what made this round's hypothesis possible. Do not bury a flat result.
- **Do not let an earlier report's conclusion override a measurement.** An outside review once asserted the grid-template transition was "the actual stutter"; this repo's own profiling had already ruled it out as ~18x smaller than `fitsAt()`. Check claims against the data, including the claims in this prompt.

Per this repo's `CLAUDE.md`: ask before running any browser automation, and ask before running `adb` against the physical TV.
