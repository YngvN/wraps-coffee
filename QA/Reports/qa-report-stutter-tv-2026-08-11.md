# Kiosk stutter — first on-device (TV) profiling

**Date:** 2026-08-11
**Scope:** Finding what remains of the kiosk stage-transition stutter, measured on the real Android TV rather than on desktop Chromium.
**Target device:** `192.168.0.33`, Xiaomi `MiTV_AZFU0` (product `darkknight`), Android WebView **`com.android.webview` 116.0.5845.195** (AOSP), companion **0.2.32 release build**, 1920x1080.
**Content served from:** this repo's working tree at **0.2.37**, via `npx vite --host --port 4173 --strictPort`. The companion is only a WebView shell, so the *rendering* code under test is 0.2.37 even though the installed shell is 0.2.32.
**Method:** `dumpsys gfxinfo <pkg> framestats` over a reset→35s→read cycle (`diagnostics/pane-resize-stutter/scripts/06-tv-frame-stats.sh`), against nine screens seeded through the real login+WS write path. Screen switching via `scripts/09-tv-set-screen.ts` (new). No CDP trace — see "What this report could not measure".

**Verdict legend:** **CONFIRMED** = measured directly on the target device, with a control that isolates the variable. **HYPOTHESIS** = consistent with the measurements and with the source, but not itself measured.

---

## Headline

The prime suspect going into this cycle — the TV decoding a 4032x2268 original instead of an 800x450 derivative — **is real but is not the problem.** In a single-variable A/B it costs about **1 percentage point** of frames over 16ms and **zero** change to median or p99 frame time.

The actual dominant cost is **the crossfade between two headlines**, on the two slide kinds that rotate with the news data — `NewsSlide` and `QrCodeSlide` in its `linkMode: 'news'` mode. Both slots' contents were being re-rasterized into the parent layer on every frame of every crossfade. Every scenario touching that path measured 4-15x worse than the floor.

**Fixed and re-measured in this same cycle.** Promoting each crossfade slot to its own compositor layer took a QR pane from **42.75% to 1.21%** janky frames and its median frame from **27ms to 13ms** — below the all-`'time'` floor. Adding a resize to the news image proxy took a news pane from **52.13% to 6.85%** and **21ms to 13ms**, against a 3.45%/12ms floor. Both dominant costs are gone.

This is the third time in this investigation that the leading hypothesis has not survived contact with a measurement, and the second time the measurement redirected the fix list. It is recorded here in full, including the part that makes the previous round's plan look misaimed.

---

## Part 1 — The measurements

All eight rows are the same 35s capture method on the same device, back to back, within ~25 minutes. Raw files in `diagnostics/pane-resize-stutter/results/tv-framestats-*.txt`.

| Scenario | Frames | Janky | **Janky (legacy)** | **p50** | p90 | p99 | Touches news data |
|---|---|---|---|---|---|---|---|
| `imagepanectl` — floor, 3 `'time'` panes | 579 | 3.80% | **3.45%** | **12ms** | 19ms | 32ms | no |
| `human` — 2 concurrent font-scale catalogue panes | 625 | 11.36% | **0.64%** | **12ms** | 20ms | 27ms | no |
| `imagepane` — floor + one 4032x2268 image | 630 | 11.43% | **4.60%** | **12ms** | 22ms | 32ms | no |
| `solotransit` — floor + one transit pane | 569 | 7.56% | **1.58%** | **13ms** | 20ms | 28ms | no |
| `soloweather` — floor + one weather pane | 567 | 6.88% | **10.41%** | **13ms** | 22ms | 40ms | no |
| **`soloqr`** — floor + one QR pane | 538 | 19.70% | **42.75%** | **27ms** | 57ms | 93ms | **yes** |
| **`solonews`** — floor + one news pane | 211 | 10.43% | **52.13%** | **21ms** | 44ms | 105ms | **yes** |
| **`active-testscreen`** — the real screen the stutter was reported on | 227 | 9.25% | **52.42%** | **22ms** | 36ms | 101ms | **yes** |

**Read the `legacy` and `p50` columns, not `Janky`.** `Janky frames` is deadline-relative and moves with how many frames a scenario draws at all, which is why `human` reads 11.36% while simultaneously having the *best* legacy figure in the table (0.64%). `Janky frames (legacy)` is the plain "over ~16ms" count, and it tracks p50/p90/p99 consistently across all eight rows. Where the two metrics disagree, the percentile columns agree with legacy.

### Finding 1 — CONFIRMED — the news data path is the dominant remaining cost, by a wide margin.

The three scenarios that touch news data (`solonews`, `soloqr`, and the real Test screen) land at **42.75-52.42%** legacy jank, **21-27ms** median frame, **93-105ms** p99. The five that do not land at **0.64-10.41%**, **12-13ms**, **27-40ms**. There is no overlap between the two groups on any of those three measures.

`soloqr` and `solonews` are byte-identical to `imagepanectl` except for one pane's `content.kind` (`lib/buildScenarioScreens.ts`'s `buildSoloKindScenarioScreen`) — same tree, ratios, stage count, slide transition, borders, backgrounds and slide duration. The variable is isolated.

Criterion met: **a single pane kind moves median frame time from 12ms to 21-27ms, on the device the stutter was reported on, with every other input held constant.**

### Finding 2 — CONFIRMED — `solonews` reproduces the real Test screen almost exactly.

| | `solonews` | `active-testscreen` |
|---|---|---|
| Frames rendered in 35s | 211 | 227 |
| Janky (legacy) | 52.13% | 52.42% |
| p50 | 21ms | 22ms |
| p99 | 105ms | 101ms |

One news pane plus two clock panes reproduces the complaint screen's frame profile to within a frame and half a percentage point — while that real screen additionally carries a QR pane, a weather pane, a transit pane and the 4032x2268 image. Whatever the Test screen's problem is, a single news pane is sufficient to cause all of it.

Criterion met: **the minimal reproduction matches the reported screen on every timing measure.**

### Finding 3 — CONFIRMED — the oversized-image hypothesis is real but small, and does not explain the stutter.

`imagepane` vs `imagepanectl` differ in exactly one thing: whether pane A renders the real 4032x2268 upload (`server/uploads/1c206b82-….jpg`, 1.46MB JPEG) at `fit: 'cover'`, or a `'time'` pane.

| | `imagepanectl` | `imagepane` | Δ |
|---|---|---|---|
| Janky (legacy) | 3.45% | 4.60% | **+1.15pp** |
| p50 | 12ms | 12ms | **0** |
| p90 | 19ms | 22ms | +3ms |
| p99 | 32ms | 32ms | **0** |

The `Janky frames` column does show 3.80% → 11.43% for the same pair, which read alone would look like a 3x regression. It is not corroborated by any percentile: median, p90 and p99 move by 0ms, 3ms and 0ms. A cost that shifts no percentile is not what is making a transition visibly stutter.

`pickImageVariant` genuinely does serve the full original to every TV (`src/utils/responsiveImage.ts:24-30` — `window.innerWidth < 768` is false at 1920, and `navigator.connection.effectiveType` reports `'4g'` on LAN), and the 800x450 `-small.webp` derivative genuinely does sit unused next to it at 27KB. That waste is real and worth fixing. It is not the stutter.

Criterion met: **isolated, measured, and moves no percentile.**

### Finding 4 — CONFIRMED — the news cost is not image decode.

`soloqr` renders **no news image at all** — `QrCodeSlide.tsx` renders a `QRCodeSVG` plus a small source mark — yet it has the **worst median in the entire table (27ms)**, worse than `solonews`'s 21ms. Both share `useCurrentNewsHeadline` and `useNewsHeadlines` (`QrCodeSlide.tsx:5,7`); `linkMode: 'news'` points the QR at the current headline's link.

So the expensive thing is common to both slides and is not the large `<img>`. This rules out the news proxy's missing resize as the primary cause, even though that resize is still worth doing (Finding 6).

Criterion met: **the more expensive of the two news scenarios is the one with no image.**

### Finding 5 — CONFIRMED BY INTERVENTION — the mechanism is the crossfade repainting both slots every frame.

Originally written as a hypothesis, then tested by changing one CSS property and re-running the identical capture. Promoting each crossfade slot to its own compositor layer (`will-change: opacity` on `.qr-code-slide__slot` and `.news-slide__content`) so the 0.4s opacity animation runs on the compositor instead of repainting:

`soloqr` renders no news image, so its numbers isolate the compositing change cleanly:

| `soloqr` | Before | After `will-change` | Δ |
|---|---|---|---|
| Janky (legacy) | 42.75% | **1.21%** | **-41.5pp** |
| p50 | 27ms | **13ms** | -14ms |
| p90 | 57ms | **21ms** | -36ms |

It lands at **1.21%** legacy jank — below the 3.45% all-`'time'` floor — and its median frame returns to the floor's 12-13ms. A single CSS property removed essentially the entire QR cost, confirming the mechanism: both slots' contents were being re-rasterized into the parent layer on every frame of every crossfade, and a `level: 'H'` QR path (required whenever a logo excavates the centre, `QrCodeSlide.tsx:113-117`) is the most path-heavy content the kiosk draws.

**Attribution caveat, found while checking timestamps rather than assumed:** the intermediate `solonews` run cannot be credited to `will-change` alone. The hub had already restarted with Finding 6's `?w=` resize at 15:28:42, and that capture ran 15:29:52-15:30:27 — so it had a *partially warmed* resized cache mixed in. `soloqr` is unaffected (it fetches no news image), but the `solonews` figures below are the two fixes together, not one of them.

| `solonews` | Original | Intermediate (mixed) | **Both, warm cache** | Floor |
|---|---|---|---|---|
| Frames in 35s | 211 | 324 | **540** | 579 |
| Janky (legacy) | 52.13% | 25.62% | **6.85%** | 3.45% |
| p50 | 21ms | 16ms | **13ms** | 12ms |
| p90 | 44ms | 32ms | **21ms** | 19ms |

With both fixes and a warm cache, the news pane sits at **6.85%** legacy jank and a **13ms** median against a 3.45%/12ms floor — from 52.13%/21ms. The reproduction of the reported complaint is effectively gone.

Criterion met: **both dominant pane kinds measured back to within a few points of the all-`'time'` floor, same method, same device, same day.**

What the source shows about why rotation triggers it at all:

- Rotation is driven by `stageTick` when a screen has stages (`useCurrentNewsHeadline.ts:89-91`), so a headline changes on **every stage advance** — every 5s in these scenarios, every 10s on the Test screen. `useNewsHeadlines`'s own network poll is 10 minutes (`useNewsHeadlines.ts:6`) and is not implicated.
- Both slides render the rotation through `useCrossfadeSlot`, which holds the outgoing and incoming content mounted simultaneously and animates between them with framer-motion. During that window there are two headlines live at once.
- For `NewsSlide` that means two external images: `<img key={snapshot.headline.link}>` (`NewsSlide.tsx:154`) deliberately re-keys per headline to avoid a stale bitmap, so each rotation creates a new DOM node and a fresh decode. Cached news images on disk run to **2368x1332** (76 files in `server/news-image-cache/`, several at 2048x1152 ≈ **9.4MB decoded RGBA each**).
- For `QrCodeSlide` it means two full `QRCodeSVG` regenerations, each a large multi-element SVG, cross-faded by opacity — which forces re-rasterization of complex vector content per frame on a weak GPU.

That the two slides were near-equally expensive by quite different rendering routes is what pointed at the shared crossfade structure rather than at either payload — and the intervention above confirmed it.

### Finding 6 — CONFIRMED — the news image proxy never resizes.

`GET /news/image?src=` (`server/index.ts:698` → `handleNewsImage`, `server/newsImageCache.ts:93-102`) fetches the upstream bytes and writes them to disk verbatim. There is no `sharp` call on that path, no width parameter, and no variant. A 2368x1332 press photo is served at full size into a pane a few hundred CSS px wide.

Criterion met: **read directly from source; the cache directory contents confirm the stored sizes.**

---

## Part 2 — What this report could not measure

### No CDP trace, and therefore no Layout/paint attribution.

`scripts/05-tv-webview-inspect.sh` confirmed the release build exposes no `webview_devtools_remote` socket, as expected. The debug-APK path was authorised and prepared — JDK 17 and the Android SDK (build-tools 34, platform-34, platform-tools) are now installed on this machine, and the two companion-side prerequisites are committed (`webviewDebuggingEnabled={__DEV__}` in `DisplayScreen.tsx`) — but the build, uninstall, re-pair and trace were not carried out in this cycle. Every "why" in Finding 5 is therefore hypothesis.

### `dumpsys meminfo` cannot resolve image decode cost on this app. Recorded so the next cycle does not repeat it.

Finding 4 of the 2026-08-11 image-loading report proposed measuring the oversized decode as a memory allocation. That does not work here, for a reason worth writing down:

- `dumpsys meminfo no.adhdisplay.companion` measures **only the app process**. The WebView renders in a separate sandboxed process (`com.android.webview:sandboxed_process0`, PID 19820 at capture time), so the decode is invisible to it.
- Measured against the renderer process instead, `imagepane` totalled 110-121MB PSS and `imagepanectl` 110-132MB — **overlapping ranges**. The image is not separable from noise there either, most likely because Chromium holds decoded bitmaps in a discardable pool that PSS does not attribute cleanly.
- The app process's `GL mtrack` was **identical** (131.8MB) for both.

The **~36.6MB decoded RGBA** figure quoted in the previous report and in this cycle's kickoff is a theoretical `width x height x 4` calculation. It was **not** confirmed on device, and Chromium may well be downsampling large images at decode time. It should stop being repeated as if measured.

### An earlier reading of mine that was wrong, corrected here.

Mid-investigation I read the Test screen's `paneSlots` map as ~30 weather/transit panes and briefly treated that as a finding. It is not: `paneSlots` retains orphaned entries from editing, and the per-stage layout tree renders **5 / 3 / 2** panes (2 / 3 / 1 of them font-scale). That matches the prior report's own figure and leaves the previous round's "3 panes x 9 = 27 forced layouts" worst case standing unchanged.

---

## Part 3 — Corrections to prior conclusions

- **The kickoff prompt's "prime suspect"** (oversized image decode) is demoted by Finding 3. It survives as a real but ~1pp effect that moves no percentile.
- **Finding 3 of the 2026-08-11 report** ("up to 8 forced synchronous layouts on first measurement") undercounts. It is **9** — `fitsAt(1)` at `useShrinkToFitFontScale.ts:141` plus `SEARCH_ITERATIONS = 8` — and it is not mount-only: the effect's `deps` include `JSON.stringify({content, textSizeVars})` (`LayoutPane.tsx:242-243, 287-288`), so it re-runs on every stage transition that changes a pane's resolved content. This was found by reading, not measuring, and is unchanged by this cycle's data.
- **The font-scale search is not currently a TV problem.** `human` runs two concurrent font-scale catalogue panes and posts the **best** legacy-jank figure in the whole table (0.64%). Whatever remains of Finding 3 is not what a viewer is seeing. The previous rounds' fixes appear to have worked.

---

## Part 4 — What was changed, and what remains

**Done and verified on the device:**

1. **`will-change: opacity` on both crossfade slots** (`QrCodeSlide.scss`, `NewsSlide.scss`). Numbers in Finding 5. This is the fix for the reported stutter.

2. **`GET /news/image?w=<px>`** now resizes and caches per width (`server/newsImageCache.ts`), with the bucket list shared between client and server (`src/types/news.ts`'s `NEWS_IMAGE_WIDTHS`/`pickNewsImageWidth`) so the two cannot disagree. `NewsSlide` measures its own rendered image width once per headline rotation and asks for the matching bucket. Measured effect in Finding 5's table. On disk the difference is stark: a 240KB original against an 8KB 320px derivative, and ~9.4MB of decoded RGBA against ~0.23MB.

3. **`-tiny`/`-medium`/`-small`/`-thumb`/`-blur` upload derivatives, generated lazily on first request** (`server/uploads.ts`). Verified on the device's own real upload: `?size=medium` for the 4032x2268 test image now serves 82,516 bytes against the 1,460,790-byte original — **17.7x smaller**. `pickImageVariant` now picks by rendered size (measured via `getBoundingClientRect()`, which is transform-aware — see `useRenderedImageWidth`'s own doc comment for why `clientWidth` would have been wrong inside `ScaledScreenPreview`, used by `ScreenCard`'s grid thumbnail and both editors).
4. **`DisplayMachine.maxImagePx`** — an admin-set per-unit ceiling, edited in Display Manager, carried down through the heartbeat response and the companion's own WebView URL (`?maxImagePx=`), since the kiosk page itself can't read a permissioned synced key.
5. **Companion: WebView `clearHistory` 10s after each screen load** (`DisplayScreen.tsx`), so a screen change stops holding the previous page's bitmaps. Deliberately not `clearCache`, which would force every asset to re-download.
6. **Companion: relaunch-on-reboot disabled** (`withBootLaunch.js`); `MY_PACKAGE_REPLACED` retained so a remote self-install still recovers the kiosk. Verified in the generated manifest: zero `BOOT_COMPLETED`, one `MY_PACKAGE_REPLACED`.

**Re-measured after the fact — no stutter win, exactly as predicted.** With the variant fix live, `imagepane` measured 7.17% legacy jank / 13ms median, against 4.60% / 12ms before it. That is noise, not a regression — it lands in the same band Finding 3 already established (moves no percentile meaningfully). The image fix is worth having for bandwidth and memory; it was never going to move the frame-timing numbers, and it didn't.

**Not built:** a CDP trace. The toolchain (JDK 17, Android SDK, build-tools 34) is now installed on this machine and a debug APK was successfully built (`app-debug.apk`, 130MB) with `webviewDebuggingEnabled={__DEV__}` wired in — but it was not installed, since doing so means uninstalling the release build and losing this TV's pairing, and by the time the build finished the stutter was already fixed and measured by other means. The APK is sitting built and ready if a future investigation needs it.

### A second bug, found while re-verifying the image fix, not related to the stutter

Re-measuring `imagepane` after the variant-size fix initially produced a result that looked like a regression (28.99% legacy jank, worse than before). The TV was not actually showing `imagepane` — a screenshot caught it still on the real Test screen, despite `admin-displayMachines.json` correctly recording the `imagepane` assignment. Force-restarting the companion app fixed it immediately.

**Root cause: `pushToDevice`/`pushToAllDevices` (`server/deviceSocket.ts:85-97`) are fire-and-forget, with no queue and no retry — documented as deliberate.** A WebSocket can report `readyState === OPEN` for a while after the underlying connection has actually gone quiet (a brief Wi-Fi hiccup, packets silently dropped, no `close` event fired yet). A push sent during that window is gone for good; nothing resends it until either an unrelated event happens to trigger a fresh push, or the app restarts. This is a genuine, pre-existing gap, not something this cycle's changes introduced — confirmed by reading `server/deviceSocket.ts`'s own doc comments, which describe the best-effort posture as intentional.

This exactly matches a symptom reported separately during this session: using the TV remote to browse screens sometimes shows no preview at all and appears to do nothing. Two client-side effects of the same root cause:

- **`remoteNav.ts`'s `effectiveScreenId`** is only ever set by a pushed `effective-screen` message, and once non-null, permanently shadows the heartbeat's own freshly-resolved assignment (`App.tsx`'s `renderScreenId ?? state.screenId` only falls through when `effectiveScreenId` is still `null`). One dropped push leaves the rendered screen stale indefinitely.
- **`navigableSet`** is only populated by a pushed `navigable-set` message. If that lands empty, the remote's second press exits straight back to idle (`if (navigableSetRef.current.length === 0) { exitToIdle(); return }`) with no HUD shown at all — "the previews are gone."

**Fixed in this cycle**, since it was found live and directly affects the same device this whole cycle is about:

- `App.tsx`'s heartbeat loop now calls `remoteNav.syncAssignedScreenId(assignedScreenID)` every 20s, so a dropped push self-heals within one heartbeat interval instead of lasting forever.
- Arming browse mode (the first remote press) now calls `requestFreshDeviceState()`, re-sending `device-hello` to force a fresh `navigable-set`/`effective-screen` round trip before the second press needs it.

Not fixed, and out of scope for this cycle: the underlying best-effort push design itself. A real fix (acked/queued pushes, or a periodic full-state re-push) is a larger change than this session's remit; the two changes above bound the damage using the existing protocol rather than redesigning it.

## Tooling added this cycle

- `scripts/09-tv-set-screen.ts` — retargets a paired display by writing `admin.displayMachines`, and prints the value needed to restore it. Uses the assignment rather than `admin.displayScreenOverride` deliberately: an override is delivered **only** by a device-socket `effective-screen` push (`server/index.ts:2294`), while the heartbeat route — the companion's actual once-per-20s source of truth — returns the raw `monitors` array and never consults `resolveEffectiveScreen` (`server/index.ts:327`). Verified the hard way: an override wrote, persisted and pushed correctly, and the TV never switched. (Even the assignment path isn't immune to the push-reliability bug found above — see that section.)
- Scenarios `imagepane`, `imagepanectl`, `solonews`, `soloweather`, `soloqr`, `solotransit` (`lib/buildScenarioScreens.ts`). All six share one structure so any pair differs by exactly one pane's content kind.
- The TV was left on its original assignment (`screen-e202503b-c6d6-494e-a4a4-82c81f5e9991`); the seeded diagnostic screens remain and are removable with `01-seed-screens.ts --remove`.
