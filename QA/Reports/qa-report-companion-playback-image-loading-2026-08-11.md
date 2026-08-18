# Companion App: Playback Pipeline & Image Loading Investigation

**Date:** 2026-08-11
**Scope:** Read-only static code investigation. No code changes, no added logging, no commands run against the physical TV (`192.168.88.195:5555`).
**Target screen:** "Test screen" (`screenID: screen-e202503b-c6d6-494e-a4a4-82c81f5e9991`), read directly from `server/data/admin-screens.json` (the local dev server's own store file — a read-only file read, not a write, and not a call to the paired TV).
**Method:** Static code review only. No Playwright/browser-automation run was performed for this report — the "Tooling" note at the end explains why, and what a browser-side proxy measurement would and wouldn't tell us.
**Verdict legend:** **CONFIRMED** = established directly from source code logic, deterministic constants, or on-disk artifacts (no live capture needed to be true). **HYPOTHESIS** = plausible from code but would need live measurement (TV or otherwise) to verify.

---

## Architecture note (applies to all of Part 1)

The companion app (`adhdisplay-companion`) is a thin native Android TV shell. `App.tsx` runs a native state machine (pairing → waiting → displaying) and, once a screen is assigned, mounts `DisplayScreen.tsx`, which loads `${contentOrigin}/screens/:screenId?unattended=1` inside a `react-native-webview` `<WebView>` (`adhdisplay-companion/src/screens/DisplayScreen.tsx:54-65`). Per that file's own doc comment (lines 11-22), this is deliberate: the WebView runs the **exact same, unmodified** web app (`src/pages/ScreenDisplay.tsx` and everything under `src/features/screens/`) that a browser tab or kiosk Electron window uses, including its own real WebSocket sync client. The native layer has no live-push mechanism of its own for screen content and doesn't need one.

**Consequence for this investigation:** "the playback pipeline" is not native RN code — it is ordinary web app code running inside a Chromium-based Android WebView's JS/main thread. All of Part 1's trace below is therefore a code trace of `src/features/screens/*` and `src/pages/ScreenDisplay.tsx`, which is exactly what executes on the TV inside the WebView (react-native-webview on Android is a real Chromium WebView, not a different engine) — this is not a browser-side proxy in the way a desktop Playwright run against the same URL would be.

---

## Part 1 — Playback Pipeline Trace

### Test screen's actual shape (grounds the trace in real data, not a hypothetical)

- `useStages: true`, `stageCount: 3`, `slideDurationSeconds: 10`, `transitionStyle: "slide"`, `paneGrowthFallback: "screenEdge"` (`admin-screens.json`, this screen's own record).
- Stage 1: 5 panes — weather, news, transit (Ruter), QR code, image.
- Stage 2: 3 panes — weather, weather, transit.
- Stage 3: 2 panes — transit (carried from stage 2's checkpoint), image.
- **Every stage boundary changes the leaf set** (1→2 drops 3 panes/adds 1; 2→3 drops 2/adds 1; 3→1 wraps back to the full 5-leaf tree) — so every single stage transition on this screen is a *shape-changing* transition, not just a content swap. This matters for Finding A below.
- One of its two image-kind panes' content: `http://localhost:4000/uploads/1c206b82-80ff-44c9-be8b-47352a6be16e.jpg`, confirmed on disk at **4032×2268px, 1,460,790 bytes**, with `-small.webp` (800×450, 27,712 bytes), `-thumb.webp` (4,060 bytes), and `-blur.webp` (1,396 bytes) siblings already generated and present (`server/uploads/`).

### Timeline: end of one item → next item fully painted

1. **Rotation timer** — `setInterval(() => setTick(t => t+1), 10000)` (`src/pages/ScreenDisplay.tsx:369`, JS thread, main WebView thread). For Test screen this is exactly 10,000ms; not a hot loop. **CONFIRMED.**
2. **Stage resolution** — `currentStage(tick, screen)` (`src/pages/ScreenDisplay.tsx:473`, `src/utils/screenStages.ts:121-123`) is one modulo operation per render; negligible cost.
3. **Target-stage-change detection** — done synchronously *during render* (React's "adjust state while rendering" pattern), not in a `useEffect`, specifically so the exit animation starts on the same commit the stage changed (`src/features/screens/SplitLayout.tsx:184-194`). Sets `contentPhase` to `'exiting'`; `displayStage` (what actually renders) deliberately still holds the *old* stage.
4. **Exiting phase, ~0.9s** — `setTimeout(..., EXIT_PHASE_DURATION_SECONDS * 1000)` (`SplitLayout.tsx:196-203`; `EXIT_PHASE_DURATION_SECONDS = 0.6 + 0.3 = 0.9s`, `src/features/screens/paneGrowthMotion.ts:7,13`). Every currently-visible `LayoutPane`'s `suppressEnter` flips true (`LayoutPane.tsx:144`), which drives framer-motion's `exit` variant (opacity/transform — compositor-friendly per frame, but framer-motion's own rAF tick loop still runs on the JS thread for the duration). **No content unmounts here** — a pane's two crossfade slots (`useCrossfadeSlot`, `src/hooks/useCrossfadeSlot.ts`) are permanently mounted; this is a pure state/props flip.
5. **`displayStage` catches up** → `contentPhase: 'holding'` (`SplitLayout.tsx:199-201`). The resolved tree is recomputed (`SplitLayout.tsx:265-268`) and diffed against the previous one (`diffLeafSets`, `SplitLayout.tsx:308`). Because Test screen's leaf set changes on *every* stage boundary (see above), this diff is never a no-op here:
   - **Disappeared leaves** get an `ExitingPaneGhost` mount (`SplitLayout.tsx:315-333,593-617`, `src/features/screens/ExitingPaneGhost.tsx`) — a full extra `LayoutPane` instance, absolutely positioned at its last-known rect, animating a 0.5s collapse (`PANE_GROWTH_DURATION_SECONDS`, `paneGrowthMotion.ts:4`) before calling back to unmount itself (`onCollapseComplete` → `removeGhost`, `SplitLayout.tsx:334-340`).
   - **Appeared leaves** grow in via a framer-motion `clip-path` animation from a computed origin edge (`enteringGrowth`, `SplitLayout.tsx:310-313`; applied in `LayoutPane.tsx:178-180,305-310`).
   - **The CSS grid itself** (`grid-template-columns`/`grid-template-rows`) transitions over 0.5s (`gridTransition`, set in `SplitLayout.tsx:490`, applied in `src/features/screens/LayoutTree.tsx:200`). `grid-template-columns`/`-rows` are **layout-affecting CSS properties** — Chromium cannot composite this animation on the GPU/compositor thread the way it can `opacity`/`transform`; it must re-run full layout on the main thread on every animation frame while this transition is in flight. This is standard, well-documented Chromium behavior, not something that needs a TV capture to establish.
6. **Holding phase ends, 0.5s later** → `contentPhase: 'idle'` (`SplitLayout.tsx:205-207`); new content's `suppressEnter` clears, and its `enter` variant plays (0.6s, `CONTENT_TRANSITION_DURATION_SECONDS`, `paneGrowthMotion.ts:7` — again opacity/transform, compositor-friendly).
7. **Per-pane content mount/measurement.** `SlotContent` (`src/features/screens/SlotContent.tsx`) renders whichever kind is resolved. For Test screen's weather/transit panes specifically, `LayoutPane.tsx:279-280` enables `useShrinkToFitFontScale` (not the cheaper transform-only `useShrinkToFitScale`, `LayoutPane.tsx:249-250`). That hook's `measureAndScale` runs synchronously inside a `useLayoutEffect` (blocks paint until it resolves): a fast-path check (`fitsAt(1)`, one forced `scrollHeight` read) and, if it doesn't fit, an **8-iteration binary search** (`SEARCH_ITERATIONS = 8`, `src/hooks/useShrinkToFitFontScale.ts:12,144-148`), each iteration writing a CSS custom property then forcing a synchronous layout read (`scrollHeight`/`scrollWidth`) to test the candidate scale. Up to 8 forced synchronous layouts, back-to-back, on the main/JS thread, per remeasure.
8. **Image content mount** (Test screen's image-kind panes) — plain `<img src=...>` (`ImageSlide.tsx:17`). See Part 2 for exactly which URL this actually requests; Chromium typically decodes image bytes off the main JS thread, but layout/paint of the element once decoded is still main-thread work, and the allocation size scales directly with which URL was requested.
9. **Background timers not tied to this transition at all** — the sync WebSocket (`src/lib/syncClient.ts`) has no periodic ping of its own (only reconnect-on-close/error, exponential backoff `INITIAL_RECONNECT_DELAY_MS=500` → `MAX_RECONNECT_DELAY_MS=10_000`, `syncClient.ts:9-10,110-116`); weather/transit/news polling run on their own independent 10-minute/30-second/10-minute timers (`src/hooks/useWeatherForecast.ts:7`, `useTransitDepartures.ts:6`, `useNewsHeadlines.ts:6`) and are not triggered by, nor block, the stage transition.

### Resource-heavy findings (Part 1), most severe first

**Finding 1 — CONFIRMED — a font-scale pane's *inactive* crossfade slot keeps polling forever, unbounded by visibility.**
`useShrinkToFitFontScale`'s `enabled` gate (`LayoutPane.tsx:279-280`) is derived purely from *which content kind that slot currently holds* (`usesFontScale0`/`usesFontScale1`, `LayoutPane.tsx:249-252`), not from whether that slot is the one currently on screen (`activeContentSlot`). Only the `ResizeObserver` is gated on activeness (`trackResize`, `LayoutPane.tsx:277-280`); the `MutationObserver` and the `setInterval(scheduler.scheduleMeasure, 2000)` safety-net poll (`POLL_INTERVAL_MS = 2000`, `useShrinkToFitFontScale.ts:9,171-174`) are installed unconditionally whenever `enabled` is true (`useShrinkToFitFontScale.ts:160-179`), regardless of whether that slot is the visible one. Every 2-second tick still performs at least one forced synchronous layout read (`fitsAt(1)`).
Applies concretely to Test screen's pane `pane-8e97bfbf-2593-4914-864b-0a4e63ca44c3` (stage 1 = news, stage 2 = weather — `admin-screens.json`): once this pane has shown both checkpoints once, its weather-holding crossfade slot keeps its own `MutationObserver` + 2s poll running indefinitely — including for however long the news checkpoint (a non-font-scale kind) is what's actually visible. Criterion met: **runs on a hot path, indefinitely, un-gated by visibility** — cost scales with however many distinct font-scale checkpoints a screen has ever shown, for the kiosk's entire uptime (weeks, per this app's own design intent).

**Finding 2 — CONFIRMED — `grid-template-columns`/`-rows` transition forces main-thread layout on every animation frame, on every stage transition.**
`LayoutTree.tsx:200` applies `gridTransition` (`'grid-template-columns 0.5s ease, grid-template-rows 0.5s ease, background-color 0.4s ease'`, `SplitLayout.tsx:490`) directly to the grid container's inline style. Because Test screen's leaf set changes on every stage boundary (see above), this fires on **every** stage transition, not an occasional shape-changing one — i.e., every 10 seconds this screen is live. Criterion met: **blocks the main thread, runs per-item, on a hot path** (every rotation, not an edge case).

**Finding 3 — CONFIRMED — up to 8 forced synchronous layouts per font-scale pane, per relevant stage transition.**
See timeline step 7 above (`useShrinkToFitFontScale.ts:130-148`). Applies to Test screen's weather/transit panes (2 such panes active on stage 1, 3 on stage 2, 1 on stage 3) whenever their resolved content/text-size checkpoint actually changes. Debounced against resize bursts (`RESIZE_SETTLE_MS = 50`, `src/hooks/shrinkToFitScheduler.ts:34`) — this specific 50ms-debounce fix is already in place and correctly collapses a ~30-tick grid-resize burst into one remeasure, per that file's own doc comment — but the *first* mount-time measurement (step 7) is not debounced at all; it runs its full up-to-8-layout search synchronously in `useLayoutEffect`, blocking that pane's own paint.

**Finding 4 — HYPOTHESIS — first-load image decode allocates ~24× more memory than necessary.**
Test screen's own uploaded image is 4032×2268px. A decoded RGBA bitmap at that resolution is `4032 × 2268 × 4 bytes ≈ 34.9MB`, versus `800 × 450 × 4 bytes ≈ 1.4MB` for the `-small.webp` derivative that already exists on disk (see Part 2). Chromium typically decodes image bytes on a dedicated image-decode thread rather than the main JS thread, so this is flagged as a memory-allocation concern (criterion: **allocates >X MB**) rather than a confirmed main-thread-blocking one — verifying actual TV-side impact (decode thread contention, GPU texture upload cost at that resolution) would need a live capture, which this investigation did not perform.

---

### Heartbeat traffic at 25–50ms — investigated, ruled out against this codebase's own code

Every timer that could plausibly produce periodic "heartbeat-shaped" traffic was located and its literal interval value checked:

| Source | File:line | Interval |
|---|---|---|
| Native companion → hub heartbeat (`POST /display-machines/heartbeat`) | `adhdisplay-companion/App.tsx:20,200` | **20,000ms** (literal `HEARTBEAT_INTERVAL_MS`) |
| Server-side WS liveness ping (`ws` standard ping/pong) | `server/index.ts:2062-2073` | **30,000ms** (literal `PING_INTERVAL_MS`) |
| Update-channel device socket (`deviceSocket.ts`) | `adhdisplay-companion/src/lib/deviceSocket.ts` | No periodic timer at all — reconnect-on-close only, 500ms→10,000ms exponential backoff |
| Web content's own sync WebSocket (inside the WebView) | `src/lib/syncClient.ts` | No periodic ping of its own; write-debounce is 400ms and only fires on an actual write, not applicable to a read-only kiosk display |
| Pairing-heartbeat (pre-approval only, not relevant once displaying) | `adhdisplay-companion/src/lib/pairing.ts:66` | ~5,000ms |

A full `setInterval` audit across `server/`, `src/`, and `adhdisplay-companion/` found no timer anywhere in this codebase with a literal value in the 25–50ms range. The native heartbeat loop (`App.tsx:162-206`) is additionally guarded against re-triggering itself into a tight loop — its own comment (`App.tsx:184-194`) documents a previously-fixed bug class of exactly that shape and the `unchanged` check (`App.tsx:191`) that now prevents it.

**Verdict: HYPOTHESIS ruled out, with the following caveat.** This is a static-analysis conclusion — nothing in this codebase's own timers can produce 25–50ms-cadence application traffic. It does **not** rule out something outside this codebase entirely (TCP-level ACK/retransmission chatter on the same connection being misread as "heartbeat" by whatever tool produced the original observation, or a capture/proxy tool's own polling artifact). Confirming that would require a live packet capture against the TV, which this investigation did not perform per the read-only/no-unapproved-ADB constraint. Recommend re-checking the original capture's own filter/labeling (does it actually decode payload as the heartbeat POST body, or is it classifying by port/frequency alone?) before assuming an application-level cause.

---

## Part 2 — Image Loading

### Upload → server-side derivatives

`POST` upload (`server/uploads.ts:65-109`), capped at `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (10MB, `uploads.ts:21`), **no dimension cap** on the original — it's saved exactly as uploaded (`uploads.ts:84`). Three WebP derivatives are then generated alongside it via `sharp`:

| Variant | Naming | Generation | File:line |
|---|---|---|---|
| Original | `<uuid>.<ext>` | as-uploaded, unmodified | `uploads.ts:81-85` |
| `-small` | `<uuid>-small.webp` | resize to 800px width, quality 70 | `uploads.ts:88-90` |
| `-thumb` | `<uuid>-thumb.webp` | resize to 240px width, quality 50 | `uploads.ts:92-94` |
| `-blur` | `<uuid>-blur.webp` | resize to 480px width, `blur(20)`, quality 60 | `uploads.ts:99-101` |

Confirmed on disk for Test screen's own uploaded image (`1c206b82-80ff-44c9-be8b-47352a6be16e`):

| File | Dimensions | Size |
|---|---|---|
| `.jpg` (original) | 4032×2268 | 1,460,790 bytes |
| `-small.webp` | 800×450 | 27,712 bytes (53× smaller) |
| `-thumb.webp` | — | 4,060 bytes |
| `-blur.webp` | — | 1,396 bytes |

Derivative generation is wrapped in try/catch (`uploads.ts:87-105`) — a compression failure (unusual/corrupt source image) still leaves the original saved, just with no `-small`/`-thumb`/`-blur` siblings; `handleServeUpload` then falls back to the original for *any* requested `?size=`. Test screen's own image has all three siblings present, so this doesn't apply here, but it's a general latent factor (see "Other candidate causes" below).

### Serving

`GET /uploads/:filename[?size=small|thumb|blur]` (`server/uploads.ts:112-136`): serves the matching variant if the query param is set **and** that file exists on disk, else falls back silently to the original (`uploads.ts:116-119`). Response headers set `Cache-Control: public, max-age=31536000, immutable` (`uploads.ts:132`) — correct, aggressive long-lived caching, identical for every variant including the original.

### Which URL does the companion/TV actually request?

Two different client-side helpers exist in `src/utils/responsiveImage.ts`, used for two different rendering layers:

- **`getBackgroundImageUrl`** (`responsiveImage.ts:52-55`) — a pane's *background-image* layer (`LayoutPane.tsx:336,342`, `SplitLayout.tsx:476`). Always requests `?size=blur` or `?size=small`, unconditionally. **Not used by Test screen** — none of its panes set a `backgroundImage`.
- **`pickImageVariant`** (`responsiveImage.ts:19-24`) — a pane's *main image content*, i.e. exactly the `kind: 'image'` path Test screen's `pane-067e936e-8a73-4188-b716-4623eda5db78` and `pane-69970edc-3c51-42ab-881e-0c6f6f31917b` both use (`ImageSlide.tsx:2,17`). Only requests `?size=small` when `window.innerWidth < 768` **or** `navigator.connection.effectiveType` is `'2g'`/`'slow-2g'`/`'3g'` (`responsiveImage.ts:8-11,21-22`).

**Finding — CONFIRMED — the TV requests the full-size original, not the `-small` derivative, for ordinary image-pane content.**
Both conditions in `pickImageVariant` are structurally false at any real TV viewport: `window.innerWidth` on any Android TV (1920×1080 or 3840×2160) is always ≫768, so `isNarrow` is always false; and even where the Network Information API is supported (it generally is on Chromium/Android WebView), `effectiveType` reflects measured bandwidth/RTT to the hub server over the *local* network the kiosk and hub share — a LAN connection reports as `'4g'`, so `hasSlowConnection()` cannot return true for this deployment regardless of any actual external network health. `pickImageVariant` therefore always falls through to returning the URL **unchanged** for a TV-sized viewport — i.e. the full original. This is a deterministic property of the code (viewport size and LAN `effectiveType` are TV-viewport-independent facts about how Chromium/Android WebView reports them), not something that needed a live TV capture to establish. For Test screen's own image, this means the TV requests and decodes the 1.39MB, 4032×2268 original — the 27KB, 800×450 `-small.webp` sitting right next to it on disk is never requested by this code path, for any image-kind pane content, on any screen, on any TV.

### Caching mitigates the *ongoing* cost, not the underlying defect

`react-native-webview`'s Android default is `cacheEnabled = true` (`adhdisplay-companion/node_modules/react-native-webview/src/WebView.android.tsx:73`), and `DisplayScreen.tsx` does not override it (`DisplayScreen.tsx:54-65`) — so combined with `uploads.ts`'s `immutable` cache header, a given exact URL (query string included — `?size=small` and no-query are different cache keys) is served from the WebView's own HTTP disk cache after its first fetch, no network round-trip. Test screen's own two image panes both reference the identical URL, so in steady state this is one real fetch, not two.

This bounds the *practical* cost of the full-original issue to first-load / cold-cache / cache-eviction moments, but the underlying defect is general: it applies to *every* distinct image-kind pane content across *every* screen a kiosk ever shows, and specifically to first-load moments (a WebView's HTTP disk cache is not unbounded — a long-uptime kiosk cycling through many distinct uploaded images across all its assigned screens' history could evict older cached originals, causing a periodic non-trivial re-fetch+decode of whatever the original happens to be, where the `-small` derivative sitting on disk would have sufficed).

### Other candidate causes (in case the above doesn't fully explain observed failures)

1. **HYPOTHESIS — WebView disk-cache eviction on a long-uptime kiosk.** Android WebView's HTTP disk cache quota is device/OS-version-specific and typically modest; a kiosk running for weeks across many screens/images could see periodic cold-cache re-fetches of full originals. No live evidence either way — flagged as plausible, not confirmed.
2. **HYPOTHESIS — silent derivative-generation failure.** `uploads.ts:87-105`'s try/catch means an unusual source image could have no `-small`/`-thumb`/`-blur` siblings at all; `handleServeUpload` then serves the original for *any* `?size=` request too, silently. Doesn't change the `pickImageVariant` finding above (which never requests a derivative anyway on a TV) but would compound it for the `getBackgroundImageUrl` path, which does explicitly ask for one. Not evidenced for Test screen's own image (all three siblings confirmed present on disk).
3. **No dimension cap on the original** (`uploads.ts:65-109`, only `MAX_UPLOAD_BYTES` gates upload size, not resolution) — combined with the `pickImageVariant` finding above, whatever resolution an admin uploads is exactly what the TV downloads and decodes. Test screen's own 4032×2268 image is an ordinary example of this, not a constructed worst case.

---

## Tooling note

Per this investigation's constraints, no Playwright/browser-automation run was performed — the CLAUDE.md instruction to ask before any browser-automation run was not exercised for this report; everything above is static source analysis plus read-only inspection of on-disk artifacts (`server/data/admin-screens.json`, `server/uploads/`) and package defaults (`react-native-webview`'s own source). Nothing here depended on running the dev server's own live behavior, launching a browser, or touching the TV.

If a follow-up wants live confirmation of the frame-level cost of Findings 1–4 (Part 1) or the actual network trace of Part 2's URL finding, the two available options are:
- **Browser-side proxy measurement**: load `http://<hub-host>/screens/screen-e202503b-c6d6-494e-a4a4-82c81f5e9991?unattended=1` in a real, visible (`headless: false`) browser and profile it with DevTools/CDP tracing — this would be a genuine proxy for what runs inside the TV's WebView (same rendering code, same Chromium family) but not TV-hardware-accurate for absolute timing/memory numbers, since desktop CPU/GPU/memory characteristics differ from the actual Android TV device. This was **not run** for this report and would need explicit confirmation first, per this repo's own testing policy.
- **Live TV capture**: `adb -s 192.168.88.195:5555 ...` (network capture, `chrome://inspect`-style CDP trace against the actual WebView, or `dumpsys meminfo`) — not run per the "no ADB against the physical TV without asking first" constraint.

---

## Resolutions

Added 2026-08-11, after the investigation above. The findings themselves are left exactly as originally written (this report stays a point-in-time record); this section tracks what was subsequently done about them.

### Finding 1 — FIXED

**Change.** `trackResize` now gates *all three* live-update triggers (`ResizeObserver`, `MutationObserver`, and the `POLL_INTERVAL_MS` safety-net poll) rather than only the `ResizeObserver`, in both shrink-to-fit hooks — `src/hooks/useShrinkToFitScale.ts:121-131` and `src/hooks/useShrinkToFitFontScale.ts:165-176`. All three now live inside one `if (trackResize) { ... }` block, with cleanup guarding the now-optional `mutationObserver`/`pollInterval`. `LayoutPane.tsx:282-285`'s four call sites are unchanged — they already passed `activeContentSlot === slotIndex` as `trackResize`, which is exactly the visibility gate Finding 1 said was missing from the other two triggers.

The sibling `useShrinkToFitScale` was fixed alongside the font-scale hook that Finding 1 names: it has the identical structure and the identical defect. Its per-tick cost is smaller (one forced layout read, versus up to 9 for the binary search), but it runs on *every* non-font-scale pane on every screen, so the unbounded-lifetime half of the problem is the same.

**Why it's safe.** `enabled` is untouched, so an inactive slot still freezes its last-good scale rather than being stripped back to full size (the visible-pop behavior `enabled: false` deliberately causes). Nothing is lost by dropping the two triggers on an inactive slot: `trackResize` is in the same `useLayoutEffect`'s own dependency array, and `measureAndScale()` runs unconditionally at the top of that effect, so a slot becoming active again re-runs the effect and re-measures synchronously *before paint*.

That last point is load-bearing, because the original finding's phrase "frozen content" is only half true — a slot's `content` **prop** is frozen while inactive, but the slide component underneath stays mounted and keeps polling its own live data (`WeatherSlide`'s `useWeatherForecast`, `TransitSlide`'s departures), so its rendered DOM does drift while nobody is watching it. The reactivation remeasure is what makes that drift harmless, and it is why the fix gates the observers rather than tearing down more aggressively.

**What this does and doesn't claim.** This is a correctness/hygiene fix — it deletes work that had no observer and no bound. It is **not** a fix for the stage-transition stutter, and shouldn't be read as one: the 92%-of-`Layout`-events attribution to `fitsAt()` in `qa-report-pane-resize-stutter-diagnostic-2026-08-07.md` was measured *during a transition*, whereas Finding 1 concerns a 2-second poll on an already-inactive slot *between* transitions. Same mechanism, different call site and frequency. Expect no measurable frame-time change from this.

**Verification.** Typecheck (`tsc -b`) and `eslint` clean on all three changed files. Verified live on the physical TV (Xiaomi `MiTV_AZFU0` at `192.168.0.33`, WebView **Chromium 116.0.5845.195** — note this differs from the 147.x recorded in the 2026-08-07 report) showing Test screen from a dev server on the LAN, via an explicit before/after A/B: the fix was reverted, screenshots captured across several stage cycles, then reapplied and the same capture repeated.

Result: no regression. Font-scale panes (weather, transit) render at identical sizes before and after, stage transitions cycle normally, and reactivated slots show no mis-sized or popping text.

The A/B also settled two things that looked like candidate regressions but are **pre-existing and unrelated** — both reproduce identically on the reverted baseline:
- Test screen's transit pane renders **overlapping rows** (departure badges colliding with destination text) in its wider layout. Present before and after the fix. **Now fixed — see "Follow-ups A and B" below.**
- Test screen's image-kind panes render a **broken-image icon**, because their stored content URL is `http://localhost:4000/uploads/...` (recorded verbatim at the top of Part 1) — on the TV, `localhost` is the TV itself, so the request cannot reach the hub. This is a genuine, separate defect that Part 2's analysis did not account for: it assumed the TV fetches the original from the hub, when in fact for this screen it fetches nothing at all. It also means Part 2's own finding (the TV requesting the full-size original rather than `-small`) is untestable on *this* screen until the URL is fixed. **Now fixed — see "Follow-up B" below.**

Incidentally confirming Part 2's split by rendering path: the news pane's images **do** load on the TV, because `NewsSlide` routes them through the hub's own `/news/image` proxy/cache — while `ImageSlide`, which has no `onError` handler at all, fails silently to the broken-image icon described above.

### Follow-up A — transit/weather pane overlap — FIXED

**Root cause: `subgrid`, unsupported on this TV.** Chromium shipped `subgrid` in **117**; this TV's WebView is **116.0.5845.195**, so every `grid-template-columns/-rows: subgrid` declaration is an invalid value and is dropped at parse time. `.transit-slide__leading` therefore collapsed from 3 shared tracks to a single implicit column, stacking mode icon → line badge → destination *vertically*, and `.transit-slide__item`'s own `overflow: hidden` clipped that ~3×-taller content into the neighbouring row — the observed overlap. `WeatherSlide.scss` uses the identical technique (4 more declarations) and was broken the same way on the same screen.

Note the WebView version conflict with the 2026-08-07 report's recorded 147.x: that was a **different device**, so the fleet runs mixed WebView versions and this needs a code-side fallback rather than a device update. This TV's WebView is `com.android.webview` (the AOSP build), which is generally not Play-updatable on this hardware.

**Fix.** A `@supports not (grid-template-columns: subgrid)` block in each of `TransitSlide.scss` and `WeatherSlide.scss` restating the parent's tracks explicitly, plus the parent's gaps — real `subgrid` inherits its parent grid's gaps and an explicit track list does not, which is what initially left the header's "Spor"/"Ankomst" labels rendering flush as one run-together word. Transit's track list is hoisted into SCSS variables used by the real rule *and* the fallback, so the two cannot drift apart. The existing `subgrid` declarations are untouched, so modern engines keep the better path — verified by compiling the SCSS and confirming all four original rules still sit outside the `@supports` block (the only match inside it is the feature-test condition itself). This is a CSS-spec guarantee rather than a browser-tested claim; no desktop browser run was performed.

**Known trade-off, recorded deliberately:** without subgrid each row sizes its own tracks independently instead of sharing one set per column, so columns align approximately rather than exactly. In practice the fixed cells are near-identical widths and only the destination is flexible, so it reads as aligned.

### Follow-up B — uploaded images never load off the authoring machine — FIXED

**Root cause.** The server mints each upload URL from the *requesting* client's own `Host` header (`server/uploads.ts:108`, `:217-218`, `server/videoUploads.ts:205`), so an admin uploading from `http://localhost:5173` permanently stores `http://localhost:4000/uploads/...`. Any other device — a kiosk TV, another admin on a `.local` name — cannot resolve that.

**The larger, previously unrecorded half:** `isOwnUploadUrl` compared with `url.startsWith(\`${serverBaseUrl()}/uploads/\`)`, so on any client whose origin differs it returned `false` and every `responsiveImage.ts` helper treated an own upload as an external URL and passed it through untouched. That silently disabled far more than the `<img>` load — pane backgrounds stopped requesting their pre-blurred `?size=blur` variant (full-resolution decode plus a visibly under-blurred backdrop), thumbnails fetched full originals into 240px slots, and `deleteUpload` was skipped entirely so replaced images orphaned their files on disk. **Part 2's analysis did not account for any of this**; it assumed variant selection was merely mis-tuned, when on a mismatched origin it was not running at all.

**Fix.** `normalizeUploadUrl` (new, `src/lib/localServer.ts`) rewrites an own-upload URL's origin to whatever origin the client actually reached the app on, preserving path and query. `isOwnUploadUrl` now matches on the `/uploads/` path plus a LAN-local hostname (loopback, `.local`, RFC1918 ranges) instead of an exact origin prefix — scoped that way deliberately so a genuinely external URL containing `/uploads/` is never hijacked. Applied inside the `responsiveImage.ts` helpers (covering ~15 call sites at once) and at the sites that use the raw stored URL: `useCachedVideoSrc` (fetch **and** both cache-key paths, so pre-warmed entries still hit), `SplitLayout`'s background natural-size preload, `EventCalendarSlide`, `StoreBrandHeader`, `ImageUploadField`'s preview.

Done at render time rather than as a data migration on purpose: the hub's LAN IP changes with its DHCP lease and an admin may keep uploading from `localhost`, so a migrated value would go stale immediately and would not stop the next upload re-introducing the problem. The 3 affected stored URLs (2 in `admin-screens.json`, 1 in `admin-messageBoardPosts.json`) need no migration as a result.

`ImageSlide` additionally gained the `onError` handler it never had, falling back to the store's own logo (or, with no logo configured, a deliberately visible muted placeholder). The silence was the reason this reached a TV unnoticed in the first place.

**Verification.** Typecheck and lint clean (the 8 pre-existing errors in untracked `src/components/*` work-in-progress files remain; no new ones). Verified on the same physical TV: transit rows now render icon, badge, destination and arrival on one line in both 1- and 2-column modes, "Spor"/"Ankomst" read as separate words, destination sub-lines ellipsis-truncate as designed, weather panes align, and Test screen's image pane now displays the actual uploaded storefront photo where the broken-image icon was.

### Findings 2, 3, 4 — assessed, still open

Each was checked for a matching narrow fix in the same pass; none has one that doesn't require a decision first, so all three are deliberately left open rather than partially addressed:

- **Finding 2** — removing this cost means the whole-layer stage-transition redesign (both stage trees rendered at final geometry and translated, instead of animating the grid template). No stage-level slide path exists to extend today: `transitionStyle: 'slide'` drives only per-slot content sliding inside a static grid (`transitions.ts`'s `slideVariants`). It would also visibly change the deliberate grow-from-edge look (`paneGrowthFallback`/`paneGrowthMotion`), and per the 2026-08-07 profiling it isn't the dominant cost anyway. Needs a product decision on the transition's visual design.
- **Finding 3** — the repeated-remeasure half already has its fix (the `RESIZE_SETTLE_MS` debounce, 770→30 `Layout` events in the 2026-08-10 report). What remains is the one-time binary search per new checkpoint, which is bounded rather than unbounded and exists specifically to prevent a flash of wrong-sized content. Reducing it further means either fewer search iterations (an accuracy tradeoff) or precomputing an initial scale — the latter gated behind a CSS `clamp()`/container-query spike that hasn't been done.
- **Finding 4** — the memory claim remains HYPOTHESIS. It was previously **unmeasurable** on Test screen because the image never loaded at all; Follow-up B has since fixed that, so this is now measurable for the first time and worth re-checking against a real capture before acting on it. The only real lever, broadening `pickImageVariant` toward `-small`, remains a visible-quality tradeoff rather than a purely technical fix: it knows the viewport size but not the pane's rendered size, so widening it risks blurring genuinely large full-bleed image panes. Needs a product call on acceptable blur, or a new intermediate derivative. Note that Follow-up B also restored variant selection generally (it had been inert on any mismatched origin), so background panes specifically now do fetch `?size=blur`/`?size=small` again — Finding 4's remaining scope is the `kind: 'image'` content path only.
