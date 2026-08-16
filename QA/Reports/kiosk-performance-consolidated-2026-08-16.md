# Kiosk performance — consolidated findings

**Date:** 2026-08-16
**Purpose:** single source of truth for the kiosk stutter / stage-transition performance investigation.
Written to be handed to a fresh session with no prior context.

**Supersedes and replaces** (safe to delete once this exists):

| report | what survives here |
|---|---|
| `qa-report-pane-resize-stutter-diagnostic-2026-08-07.md` | the `fitsAt` layout-thrash finding, the invocation-frequency framing |
| `qa-report-pane-resize-stutter-diagnostic-2026-08-10.md` | the debounce fix's measured effect |
| `qa-report-stutter-tv-2026-08-11.md` | first on-device profiling; the crossfade/`will-change` fix; image-variant work |
| `qa-report-companion-playback-image-loading-2026-08-11.md` | the playback-pipeline trace; resource findings |
| `geometry-pane-model-2026-08-15.md` | the flat pane layer; the mount-stall discovery |
| `mount-stall-step0-2026-08-15.md` | attribution ablations; the bitmap-cover investigation |

Not superseded (different subject, keep): the assistant QA reports, `qa-report-dashboard-ui-ux-2026-08-14.md`
(a design audit), `qa-report-display-pairing-2026-08-06.md`, `installer-reference-2026-08-07.md`.

---

## 1. The system under test

**Device.** Xiaomi Mi TV Stick, model `MiTV_AZFU0`, product `darkknight`, Android 14, **4 cores**,
panel **50 Hz → a 20 ms frame budget**. Physical panel 3840×2160 with a display override to
1920×1080 (`adb shell wm size`).

**Renderer.** `com.android.webview` **116.0.5845.195** (AOSP). The WebView reports a **960×540 CSS
viewport at devicePixelRatio 2**, so its backing store is **1920×1080** — that, not the panel's 4K, is
the size any full-screen bitmap ever needs to be.

Capability consequences, measured in-page and confirmed against `dumpsys`:

| feature | needs | available |
|---|---|---|
| `document.startViewTransition` | Chromium 111 | **yes** |
| `long-animation-frame` (LoAF) | Chromium 123 | **no** — no free per-script attribution on this device |

**Architecture.** The companion (`adhdisplay-companion`) is a thin native shell. Once a screen is
assigned it loads `${origin}/screens/:id?unattended=1` in a `react-native-webview`. The code under test
is therefore the **ordinary web app** (`src/features/screens/*`), not native code. **An old companion
APK is fine for any web-side work** — it renders whatever the server serves, so no APK rebuild is
needed to test rendering changes.

**No devtools.** The installed build is a release build; `webviewDebuggingEnabled={__DEV__}` is false
and no `devtools_remote` socket exists. Confirmed twice, ~a week apart. A debug APK was once built
(130 MB) but never installed, because installing it means uninstalling the release build and losing
this TV's pairing. **Do not spend time trying to attach CDP to the TV.**

**Reaching the device.** After a prior pair, `adb` re-discovers it over mDNS with no re-pairing. When
it has slept the `_adb-tls-connect._tcp` service can vanish while the legacy port still answers —
`adb connect 192.168.0.33:5555` recovers it. That can leave **two transports for the same device**,
after which every `adb` call fails as ambiguous; drop the duplicate with `adb disconnect
192.168.0.33:5555`. The TV sleeps on its own and will drop mid-run; budget for re-running.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

---

## 2. Measurement methodology — read this before quoting any number

**Three incompatible measurement regimes have been used across this investigation. Never mix numbers
between them.** Most of the confusion in the older reports traces to this.

| regime | what it measures | status |
|---|---|---|
| **A** — desktop CDP traces, `Layout`/`UpdateLayoutTree` event counts (2026-08-07/10) | forced-layout counts on desktop Chromium | valid, desktop only |
| **B** — `adb shell dumpsys gfxinfo framestats` (2026-08-11) | jank %, p50/p90/p99 on device | **do not reuse.** Undercounts browser frames by roughly 10× because the WebView composites on its own thread (~41 frames reported in 10 s). Its *relative* comparisons within that one report stand; its absolute numbers are not comparable to anything else. Also: read its `legacy` column, never `Janky frames`, which is deadline-relative and moves with how many frames a scenario draws at all. |
| **C** — in-page `requestAnimationFrame` sampler (2026-08-15 onward) | true per-frame deltas, segmented by transition phase | **current standard.** Same instrument on desktop and TV, which is what makes the two comparable. |

**Regime C's metric.** `worstMs` alone cannot resolve the effects being chased — run-to-run spread on
dense stages exceeds the differences being measured. Use **`debtByPhase`**: total time over the 20 ms
budget, summed per `contentPhase`. A sum is far more stable than a single maximum, and the per-phase
split is what revealed that the cost is spread across all three phases. Take **≥5 rotations**, report
medians, and treat a change as real only if it moves the median >30% with non-overlapping ranges.

The 20 ms budget is held fixed on desktop too, deliberately, so the number means one thing everywhere.
On the TV, `>16.7ms` counts every single frame and is useless; use `>20ms` and `>33ms`.

---

## 3. Established facts

Confidence: **CONFIRMED** = measured on the target device with a control isolating the variable.

1. **CONFIRMED — real screens stall, not just synthetic fixtures.** `Screen 3 (verify)`
   (id `1783715372380`, 6 panes, 4 transit + 6 catalogue + 1 event) shows **240–400 ms worst frames**
   per transition on the TV. The synthetic `EXTREME anim test` reaches 1580 ms at 25 panes, but the
   effort is justified by the real screen, not the fixture.

2. **CONFIRMED — the stall spans all three phases, not just the mount.** On a real screen, of 23
   transition windows: **12 worst frames land in `'exiting'`, 6 in `'idle'`, 5 in `'holding'`.** This
   corrects the 2026-08-15 geometry report, which found 13/21 in `'holding'` on the *synthetic* fixture
   and concluded "the mount is the whole cost". Any mitigation scoped to `'holding'` addresses roughly
   a third of a real screen's cost.

3. **CONFIRMED — there are two independent cost centres, and no single lever covers both.**

   | screen shape | dominant cost | evidence |
   |---|---|---|
   | transit / weather / catalogue / event-month (`Screen 3`) | the shrink-to-fit **font binary search** | disabling both shrink hooks removes **85–89%** |
   | qrcode / news / time (`Skjerm 1`, id `screen-8ec76ce7-…`) | **slide component rendering**, chiefly QR path rasterisation | shrink-disable does nothing (re-confirmed by fact 8's V1a/V1b on this fixture); QR removal removed **44%** of worst frame, **32%** of debt — **but both QR-removal percentages are against the superseded baseline, see fact 11** |

4. **CONFIRMED — the irreducible floor is ~zero.** Replacing every slide's content with a static
   `<div>` at identical geometry takes `Screen 3` from 240–400 ms worst to **20 ms with zero budget
   debt**, and `EXTREME` down 86–92%. React reconciliation, the geometry commit, and pane box
   layout/paint together cost essentially nothing. **Whatever is expensive is slide content, not the
   layout engine.**

5. **CONFIRMED — the geometry animation is rounding error.** Both the flat-pane-layer work and fact 4
   independently show it. Precomputing layout server-side was ruled out separately:
   `computeLayoutGeometry` is a pure function running in microseconds, so shipping precomputed rects
   saves microseconds and leaves 100% of the rendering cost on the device. **Do not re-litigate this.**

6. **CONFIRMED — the compositor survives a blocked main thread, with one ordering rule.** Measured
   against a 10 000 ms busy loop, sampled from outside the WebView with `adb exec-out screencap`:
   an already-painted full-screen layer holds **byte-identically** (11 consecutive samples, no
   blanking or tearing), and a CSS opacity transition that is **already running** advances smoothly to
   completion through the block. But a transition **armed in the same task** as the block never starts
   at all — the style change is only committed at the next rendering opportunity, which a blocked main
   thread never reaches. **Rule: anything meant to stay visible or keep animating across a stall must
   be painted, and its animation already running, at least one rendering opportunity before the
   stalling work begins.**

7. **CONFIRMED — decoding a 1920×1080 PNG costs 545–598 ms on this hardware** (three runs; includes
   fetching it over WiFi). Same order as the stall itself. Any design showing a full-screen still must
   pre-decode and hold it resident.

8. **CONFIRMED — the shrink cost is `measureAndScale` itself, not the observers firing.** The V1
   bisection (2026-08-16, regime C, `Screen 3`) splits the 85% cleanly:

   | arm | worst (median) | debt (median) | n |
   |---|---|---|---|
   | baseline (current tree) | 320 ms `[120–660]` | 880 ms `[340–1540]` | 25 |
   | **V1a** — measurement on, observers never installed | 320 ms `[80–640]` | 740 ms `[160–1360]` | 35 |
   | **V1b** — observers installed and firing, `measureAndScale` an immediate no-op | **60 ms** `[40–600]` | **100 ms** `[20–680]` | 31 |

   V1b recovers **81% of worst frame and 89% of debt** — the whole effect, matching the original
   both-hooks-disabled ablation (60 ms / 80 ms). V1a recovers **0% of worst frame and ~16% of debt**.
   The `ResizeObserver`/`MutationObserver`/2 s poll are therefore close to free; what they *trigger* is
   the entire cost.

   **This inverts the reading §8 previously prescribed** ("if V1b wins, the cost is the observers
   firing"). That mapping was backwards: V1b leaves every observer installed and firing at full rate
   and still removes the stall, which is only possible if the observers are cheap.

   Sharper still: **V1a keeps the observers off but keeps the `measureAndScale()` call that runs on
   every effect re-run — and that alone reproduces the full baseline cost.** The effect's deps include
   `contentPhase`, so each phase flip re-runs a full search on every pane. Those effect-driven passes,
   not observer-driven ones, are the stall.

   Negative control: on `Skjerm 1` (no shrink-search pane kinds) baseline / V1a / V1b measure
   700 / 720 / 730 ms worst and 1140 / 1120 / 1150 ms debt — flat, as fact 3 predicts. Both ablations
   behaving on the fixture where they should do nothing is what rules out a build/flag mix-up on the
   fixture where they do.

9. **CONFIRMED — the search and the CSS custom-property writes are not separable cost centres.**
   `fitsAt` *is* a write plus a forced read: it calls `applyScale` (the `--slide-*-size` writes) and
   then reads `scrollHeight`. There is no probe without a write. This collapses §6's old three-way
   split into two — observers (free) and measurement-including-its-writes (all of it) — and means the
   "different scaling mechanism entirely" branch cannot be reached by ablation alone.

10. **CONFIRMED — QR corner rounding costs the entire error-correction density win.** Three arms on
    `Skjerm 1`, regime C, same session (see fact 11 on why only same-session arms are comparable here):

    | arm | worst (median) | debt (median) | holding debt | n |
    |---|---|---|---|---|
    | **A** — M + rounded (`d9d9b90`, current tree) | 700 ms `[460–860]` | 1140 ms `[1020–1260]` | 800 | 23 |
    | **B** — M + square | **520 ms** `[400–640]` | **860 ms** `[780–980]` | 600 | 22 |
    | **C** — H + square (pre-change baseline) | 720 ms `[540–840]` | 1140 ms `[1040–1240]` | 860 | 19 |

    Dropping H→M is worth **−28% worst / −25% debt** (B vs C, debt ranges non-overlapping). Rounding
    gives back **+180 ms worst / +280 ms debt** (A vs B) — within noise of exactly the amount the
    density saved. **A and C are indistinguishable**, so the shipped change is currently a no-op on
    frame cost while carrying two stacked scannability reductions.

11. **CONFIRMED — `Skjerm 1`'s baseline roughly doubled between 2026-08-15 and `d9d9b90`;
    `Screen 3`'s did not.** Arm C (H + square — i.e. the pre-QR-change code) measures 720 ms / 1140 ms
    against the ~355 ms / ~735 ms this report previously quoted as that fixture's baseline. `Screen 3`
    re-measured at 320 ms / 880 ms, identical to the older `tv-fix-screen3` capture. The cause was not
    isolated (content drift — longer news URLs, more QR panes resolving — is the leading candidate,
    since arm C restores the old *code* and not the old *number*). **Consequence: the older `Skjerm 1`
    figures, including the "QR removed = ~200 ms / ~500 ms" ceiling, are not comparable to anything
    measured on `d9d9b90`. Re-measure that ceiling before quoting it.**

12. **CONFIRMED — deferring the search off the transition path fixes §6's open problem.** Two changes
    to `useShrinkToFitFontScale`, measured as separate arms (2026-08-16, regime C, v0.2.69):

    | arm | worst (median) | debt (median) | debt e / h / i | n |
    |---|---|---|---|---|
    | baseline (`d9d9b90`) | 320 ms `[140–620]` | 930 ms `[360–1560]` | 370 / 260 / 480 | 28 |
    | **A** — phase removed from the effect's deps; search resumable, one probe per frame, only while idle | **80 ms** `[40–660]` | 520 ms `[60–1080]` | 80 / 60 / 380 | 35 |
    | **A+B** — plus a process-wide scale store, pre-warmed off-screen at boot | **80 ms** `[40–600]` | **380 ms** `[40–1140]` | 60 / 40 / 300 | 33 |

    **−75% worst frame and −59% debt.** The transition phases are where it lands: `exiting`
    370 → 60 and `holding` 260 → 40, i.e. essentially gone. Against fact 8's V1b ceiling (60 ms /
    100 ms, `measureAndScale` disabled outright) A+B captures nearly all of the worst-frame win but
    only part of the debt win — **the residual ~300 ms is `idle` debt, the same search still running,
    merely relocated out of the transition.** Ranges still overlap on the upper tail, as they did for
    V1b itself; the medians are stable and the phase split is unambiguous.

    Negative control, same session: `Skjerm 1` measures 720 ms / 1140 ms at baseline and
    720 ms / 1160 ms at A+B — flat, exactly as fact 3 predicts, which is what rules out a build mix-up.

    Arm B costs **nothing measurable at boot** despite mounting every stage off-screen: the first six
    windows of the A+B run are no worse than A's (1140/460/860/80/360/300 against
    1080/640/920/120/700/940).

13. **CONFIRMED — the pre-0.2.69 search could settle on a scale that does not fit.** On `Screen 3`'s
    transit pane the old code resolves 0.8605 and **overflows its box by 35 px** (−7% slack);
    the reworked hook resolves 0.806 and fits. Reproduced by re-measuring the original code directly,
    so it is the code and not content drift. The old overflow-only correctness probe could not see
    this — a scale that is too *large* shows up as overflow, but nothing reported slack, so the
    failure was invisible. `shrink-correctness.mts` now reports slack and per-pane resolved scale.

14. **CONFIRMED — `IntersectionObserver` cannot drive a scale-correction loop.** Tested directly
    (arm C, since reverted): a sentinel at the end of `CatalogueSlide`'s flow, observed against the
    pane box, does yield the right overflow ratio from `boundingClientRect`/`rootBounds`
    (3.12 and 7.38, matching `scrollHeight / clientHeight`) at **zero forced layouts** — but IO is
    **edge-triggered on threshold crossings, not a continuous geometry feed**. A zero-area target
    pins `intersectionRatio` at 0, so after the first delivery nothing ever fires again: 1 delivery in
    2.5 s. A 1 px sentinel does deliver crossings (entering the box at scale 0.25, leaving at 0.35)
    but still only 3 deliveries across a 12-step sweep. **"Solve from the observed magnitude" is dead.**
    A crossing-driven geometric search (shrink x0.9 per frame until the sentinel crosses in) remains
    viable and would cost no forced layouts, at the price of visible stepping over ~7–10 frames.

15. **CONFIRMED — `Screen 3 (verify)` is half the fixture this report has been describing.** Its
    `paneSlots` holds 6 entries, but **three are orphans not present in `layout`** and never render.
    It actually renders **3 panes**, with only **4 shrink-enabled (pane, stage) pairs**: one transit
    at stage 1 and three catalogue at stage 3. Stage 2 (`event:calendar` + two empty) contains no
    shrink-enabled pane at all. The "6 panes, 4 transit + 6 catalogue + 1 event" in fact 1 counts the
    `paneSlots` object, orphans included. Related: **no `event:month` pane exists on any screen in the
    dataset**, so `EventMonthSlide` — the only slide whose overflow is purely on the width axis — is
    currently exercised by nothing, and `checkWidth` is reached only by `weather` panes, where the
    comment at `LayoutPane.tsx:336-347` already explains it is a no-op.

---

## 4. Refuted or superseded — do not re-try these

Each of these consumed a cycle. They are recorded so the next one is spent elsewhere.

- **Oversized image decode as the stutter cause.** Real but ~1 percentage point of janky frames, and
  it moves **no percentile** (p50/p90/p99 shift 0 / +3 / 0 ms). The image-variant work is worth having
  for bandwidth and memory; it was never the stutter and re-measuring confirmed it changed nothing.
- **`grid-template-columns` / `-rows` transition as the cause.** Layout-affecting and therefore
  main-thread per frame — true, and it was the leading hypothesis for two cycles. Fact 4 kills it: with
  static content the same transitions cost zero.
- **The `trackShrink` / `contentPhase` gate as an "own goal".** The mechanism is real —
  `measureAndScale()` sits above the `trackResize` guard, so each phase flip re-runs a full search —
  but reverting the gate makes dense transitions **50–70% worse** (EXTREME 5→6 holding debt 1740 →
  2620 ms), because every `ResizeObserver` then fires through the geometry animation. It is worth only
  ~220 ms of `6→7`'s 1260 ms. **The gate is a clear net win. Keep it.**
- **Making the shrink search cheaper.** Seeding from the last resolved scale, then additionally caching
  scales keyed by box size: −43% forced layouts and −22% measure time on desktop, and **zero**
  improvement on the TV, twice. See §6 for why and what it implies.
- **`dumpsys meminfo` for image-decode attribution.** The WebView renders in a separate sandboxed
  process, so the app process cannot see it; measured against the renderer process the ranges overlap
  (110–121 MB vs 110–132 MB). The often-quoted "~36.6 MB decoded RGBA" is a `w × h × 4` calculation,
  **never confirmed on device**.
- **25–50 ms heartbeat traffic.** A full `setInterval` audit across `server/`, `src/` and
  `adhdisplay-companion/` found no timer anywhere near that range.
- **Live on-device capture (`html-to-image`) as a way to hide the stall.** A full-screen root capture
  costs **250 ms on desktop** (10 cores) against a 200 ms budget on the TV (4 cores). Dead.

### One genuine contradiction between reports, unresolved

2026-08-07 measured that **74% of `measureAndScale` calls take the `fitsAt(1)` fast path** and
concluded "the cost is invocation frequency, not search depth". 2026-08-16 measured **0% fast path,
100% full 8-iteration search** on `Screen 3`.

Both are probably correct for their own content: the 2026-08-07 scenario's catalogue panes fit at
scale 1, `Screen 3`'s transit/catalogue panes do not. **The implication is that this is
content-dependent and must be measured per screen, not assumed either way.**

---

## 5. Fixes already shipped, with measured effect

| # | change | measured effect | regime |
|---|---|---|---|
| 1 | `RESIZE_SETTLE_MS = 50` debounce on the shrink observers | "human" scenario 770 → **30** Layout events; rAF drop 2.0% → 0.1% | A |
| 2 | `will-change: opacity` on both crossfade slots (`QrCodeSlide.scss`, `NewsSlide.scss`) | `soloqr` 42.75% → **1.21%** legacy jank; p50 27 → **13 ms** | B |
| 3 | `GET /news/image?w=` resize + cache, and lazy upload derivatives | `solonews` 52.13% → **6.85%**; 21 → **13 ms** | B |
| 4 | Gap-accumulation fix (`gapAwareTracks`) — every split overflowed its container by its own 4 px gap, compounding with nesting depth | correctness only; frame cost identical | C |
| 5 | Shrink observers gated on `contentPhase === 'idle'`; `PANE_GROWTH_DURATION` 0.5 → 0.3 s | ~10% on light transitions, **nothing measurable** on dense ones | C |
| 6 | Companion: `clearHistory` 10 s after each screen load; relaunch-on-reboot disabled | resource hygiene, not frame cost | — |

Fix 2 is the single largest win in the whole investigation and is why QR/news crossfades are no longer
the top cost. Note it addressed the **crossfade repaint**; the remaining QR cost is **mount-time path
rasterisation**, which is a different thing.

---

## 6. The open problem — **RESOLVED 2026-08-16**

**Answer: the cost is the measurement passes triggered by the effect re-running, and each pass is
expensive because every probe is a CSS write plus a forced synchronous layout. The observers are
close to free.** See facts 8 and 9 for the numbers; the reasoning that led here is kept below.

What this rules in and out:

- **Gating or coalescing the observers is not the fix.** V1a removed all three and recovered 0% of
  worst frame. It also demotes step 4 below (raising `POLL_INTERVAL_MS`): the poll is a subset of the
  ~16% of debt that *all* observer traffic accounts for, so the ceiling on that idea is a few percent.
- **Making individual probes cheaper is not the fix either**, and now for a measured reason rather
  than an inferred one — that is what the seeded search already tried, for 0%.
- **The fix is to stop running full searches on `contentPhase` flips.** The hook's effect lists
  `contentPhase` among its deps, so every flip re-runs `measureAndScale()` on every pane, and fact 8
  shows those effect-driven passes alone reproduce the entire baseline cost. A pane whose box and
  content are both unchanged across a flip does not need re-measuring at all; the existing size-keyed
  cache does not help because it still re-probes to confirm (§4, "a cache hit is not a cheap pass").

**Still open (narrower):** whether the forced layout or the style invalidation dominates within a
single probe. Fact 9 says ablation cannot separate them — `fitsAt` cannot measure without writing —
so answering it needs a restructured scaling mechanism, not another flag. Not worth doing before the
`contentPhase` work above, which avoids whole passes rather than making one cheaper.

### The reasoning this replaced

**Fact 3 says disabling the shrink hooks removes 85–89% of a real screen's stall. Making the search
43% cheaper removed 0%. Both are solidly measured. They cannot both be about probe count.**

The desktop by-phase counters show why the optimisation missed: forced layouts during `'holding'` went
**167 → 166**. Every saving landed in `'idle'` and `'exiting'` — the 2-second safety poll firing on
panes whose box had not changed. Instrumenting the size-keyed cache confirmed it hits 74% of the time
during `'holding'` yet those passes still cost 7.5 forced layouts each: **a cache hit is not a cheap
pass**, because at a stage change the pane's *content* differs, so the remembered scale no longer fits
and the full search runs anyway.

So the shrink cost at a transition is not something seeding can avoid. And `enabled: false` (the
ablation that won 85%) disabled **three things at once**:

1. the search itself,
2. the `ResizeObserver` / `MutationObserver` / 2 s poll (all skipped under `enabled: false`),
3. the CSS custom-property writes — each of which invalidates style for the pane's entire subtree.

**Which of the three carries the 85% is the single most valuable unknown in this investigation.**

Supporting datum: on `Screen 3` the font hook costs **12.4 ms per pass** against the transform hook's
**0.11 ms** — ~100× — and ~57% of all passes come from the 2 s safety poll on panes that have not
changed.

---

## 7. Code state as of this document

**Version 0.2.68**, clean at `d9d9b90` (updated 2026-08-16 — both changes below have since been
committed; they were uncommitted at 0.2.67 when this section was first written):

1. **`useShrinkToFitFontScale` — seeded search + size-keyed scale cache.** Correct (verified against
   baseline: the overflow checker reports identical transients with and without it), −43% forced
   layouts, −22% measure time, no frame-cost regression. **It does not fix the stall.** Keep-or-revert
   is an open judgement call: it reduces continuous background CPU on a device that runs for weeks, at
   the cost of real complexity in a hook every pane depends on.

2. **QR codes — error-correction level H → M, plus rounded module corners.** New files
   `qrCodePath.ts` / `QrCodeSvg.tsx`; `QrCodeSlide` no longer uses `qrcode.react` (that library does
   not expose its module matrix); new dependency `qrcode-generator`. Measured **43% fewer modules**
   across the real codes on screen (9,732 → 5,508 total modules). **Now TV-verified (fact 10): as
   shipped it is a frame-cost no-op, because the rounding cancels the density win. Still not
   phone-scan-verified.**

**`ENABLE_FLAT_PANE_LAYOUT = false`** (`paneGrowthMotion.ts`). The flat pane layer fixes pane DOM
identity across restructures (0/1, 1/2, 1/3 kept → 1/1, 2/2, 3/3) and makes every restructure animate,
measured free-to-better on desktop. Its kiosk gate was never verified against the corrected build, so
it ships off. Given fact 5, it is a **motion-quality** change, not a performance one — judge it on
that basis.

---

## 8. Suggested next steps, in order

### 1. Stop re-measuring on `contentPhase` flips — **DONE 2026-08-16, shipped in v0.2.69**

See fact 12 for the numbers: **−75% worst frame, −59% debt** on `Screen 3`, flat on `Skjerm 1`. Two
changes, both in `useShrinkToFitFontScale.ts` behind `ARM_A_DEFERRED_SEARCH` / `ARM_B_SHARED_SCALE_STORE`
(kept as toggles for re-measurement, both on):

- **A** — the transition phase is no longer a dependency of the measurement effect, so a flip no
  longer re-runs the effect at all; and the binary search is a resumable state machine
  (`SearchState`) advancing **one probe per animation frame**, only while the pane is idle. The best
  fitting scale so far stays painted between probes, so intermediate candidates are never visible.
  Flipping the flag off drains the same state machine synchronously, which is the pre-0.2.69
  behaviour — one search implementation, so the arms cannot drift apart.
- **B** — `src/hooks/shrinkScaleStore.ts`, a process-wide store addressed by
  (screen, pane, stage, **box aspect ratio** — never pixels, since `cqmin` makes the answer mostly
  size-invariant), pre-filled at kiosk boot by `warmShrinkScales.ts` rendering each stage off-screen
  and letting the real hooks populate it. Rendered at the **live viewport size**, not
  `referenceCanvasSize`'s fixed 1920x1080, because `CatalogueSlide`'s `minmax(max(160px, 14ch), 1fr)`
  and `EventMonthSlide`'s `column-width: max(320px, 26ch)` are absolute px floors that change the
  column count between 1920 and the TV's own 960 CSS px.

**What is left:** ~300 ms of `idle` debt — the same search, merely relocated out of the transition.
Closing that means avoiding the passes entirely, not deferring them; the poll deliberately re-derives
(it is the only thing that notices content *shrinking*, since the box has not changed and the resize
observer stays quiet), so a cheaper "did the content actually change" signal is the next lever.

### 2. Decide the QR corner radius, then phone-scan whatever ships

Frame cost is **measured and settled** (fact 10) — the TV half of this step is done. `M + rounded`
(the current tree) is statistically identical to the `H + square` baseline: rounding at
`CORNER_RADIUS = 0.3` costs back the entire H→M density win. `M + square` is the only arm that beats
baseline, at −28% worst / −25% debt.

The kill criterion has therefore triggered. Two options, both needing a decision before any code moves:

| option | frame cost | cost of finding out |
|---|---|---|
| **Ship `M + square`** (`CORNER_RADIUS` → 0, `FINDER_RADIUS_FRACTION` → 0) | known: −25% debt | none — already measured |
| **Halve the radius** (0.3 → 0.15, finder fraction 0.28 → 0.14) | unknown; recovers at best ~half the win *if* cost scales with radius | another full TV arm, plus a phone-scan of eroded corners |

`M + square` also removes one of the two stacked scannability reductions, which shortens the phone
test to validating the level change alone.

**Then scan the codes with a real phone** — for whichever variant ships, since the level drop to `M`
is common to all of them. No QR *decoder* exists in this repo (all three QR packages only encode), so
this cannot be automated. Test the worst case: longest article URL, logo on, customer distance,
off-axis, glare, older phone. Fallback order: level M → Q (still −16% density, 5.2× margin), then
back to H.

### 3. Settle the seeded-search change

Keep or revert (§7.1). Not a measurement question — it works, it just does not do the job it was
written for.

### 4. The 2-second safety poll — **largely closed by fact 8, keep only as CPU hygiene**

~57% of all shrink passes are `POLL_INTERVAL_MS = 2000` firing on unchanged panes, and raising it to
~10 s would cut those 5×. But V1a removed the poll *and* both observers outright and recovered **0% of
worst frame, ~16% of debt** — so the poll is a fraction of a fraction, and it is not a stall fix.

What remains is the original hygiene argument: fewer wakeups on a device that runs for weeks. That is
a product judgement about how fast the shrink self-corrects when the observers miss a change, not a
measurement question, and it should not be confused for performance work.

### 5. Only if steps 1–4 leave a real screen over budget: hide the stall behind a bitmap

Fully investigated and currently **shelved**, because fact 4 says a fix exists. If it is ever revived,
`document.startViewTransition` is the strongest option: it cleared both capability gates (fact 6),
needs no capture pipeline, no staleness handling, no delivery work, no decode cost and no APK rebuild.
Pre-captured stills are viable but pay the 545–598 ms decode (fact 7) and need per-stage delivery
(`buildNavigableSet` currently ships `previewImages[0]` only, at `'medium'`). Live capture is dead.

Note the cover would have to span `exiting → holding → idle` — roughly **0.9 s of frozen screen** on
every stage change, clock stopped and video paused — not the ~0.3 s the mount-only framing implied.

---

## 9. Tooling

**Current (regime C), in `QA/scratchpad/qa/`:**

| file | purpose |
|---|---|
| `frameSampler.mts` | the in-page rAF sampler + transition/identity sampler; `debtByPhase` lives here |
| `frame-collector.mts` | CORS-open sink on :4999; routes frame / capability / cover-probe payloads |
| `tv-inject-sampler.mts` | injects sampler + capability probe into the built `dist/index.html` |
| `tv-set-screen.mts` | points the TV at a screen id over the sync WebSocket |
| `extreme-audit.mts` | desktop per-transition audit (snap / border / identity / frames) |
| `capabilityProbe.mts` | WebView version + feature detection, in-page |
| `tv-cover-probe.mts` / `coverLayerProbe.mts` | compositor-survives-a-stall probe, sampled via `screencap` |
| `shrink-counter.mts`, `shrink-cachehit.mts` | shrink attribution — **both need a `window.__qaShrink` instrumentation patch that is not in `src/`**; budget for re-writing it |
| `shrink-correctness.mts` | shrink correctness, no instrumentation needed. Reports overflow on **both** axes, **slack**, and each pane's **resolved scale**, per (pane, stage), as JSON; `QA_BASELINE=<file>` diffs an arm against a baseline and fails on >5% scale drift. Samples only while `data-content-phase` is `idle`, and picks the active crossfade slot by **identity transform**, not opacity — the `'slide'` transition style holds opacity 1 in all three poses, so an opacity test silently attributes the *previous* stage's slide to the current one |
| `shrink-arm-audit.mts` | desktop arm comparison: groups windows by `fromStage -> toStage` and reports medians per group. Necessary because a whole-run median mixes transition types that differ ~6x in cost, diluting any change to the expensive one |
| `qr-verify.mts`, `qr-density.mts` | QR module-count verification |
| `summarize-frames.mts` | median worst frame + median `debtByPhase` per run file, with ranges; trims cross-arm contamination (see §10) |
| `wait-frames.mts` | blocks until a run file holds N windows *from the current page load* — what to gate a run on rather than raw file length |
| `make-resize-screen.mts`, `make-extreme-screen.mts` | fixture builders |

**Legacy (regimes A/B), in `diagnostics/pane-resize-stutter/`:** scripts `01`–`09` survive; the
`results/` directory is empty, so the raw captures behind the 2026-08-07/10/11 numbers are gone. Keep
the scripts for reference; prefer regime C for anything new.

**Standard TV run:**

```bash
npm run build && npm run preview          # the TV loads :4173 (preview), not :5173 (dev)
npx tsx QA/scratchpad/qa/frame-collector.mts QA/scratchpad/qa/tv-out.json &
npx tsx QA/scratchpad/qa/tv-inject-sampler.mts http://<mac-lan-ip>:4999
npx tsx QA/scratchpad/qa/tv-set-screen.mts <screenId>
adb shell am force-stop no.adhdisplay.companion && \
  adb shell monkey -p no.adhdisplay.companion -c android.intent.category.LAUNCHER 1
# ...wait >=5 rotations, then rebuild to strip the injection
```

**Fixtures:**

| id | name | shape |
|---|---|---|
| `1783715372380` | Screen 3 (verify) | 3 stages, **3 live panes** (its `paneSlots` also holds 3 orphans not in `layout` — see fact 15). Only **4 shrink-enabled (pane, stage) pairs**: transit@1, catalogue@3 x3. **The shrink-cost fixture.** |
| `screen-8ec76ce7-…` | Skjerm 1 | 2 stages, 17/13 panes — news + qrcode + time, zero shrink-search kinds. **The QR/render fixture.** |
| `screen-extreme-anim-test` | EXTREME anim test | 9 stages, up to 25 panes. Amplifier; not representative. |
| `screen-extreme-resize-test` | EXTREME 5×5 resize | 2 stages, 25 panes, pure resize. |

---

## 10. Traps that have already cost time

- **Writing an ablation flag as a literal `true`.** It makes the original body unreachable, and
  TypeScript does not narrow discriminated unions in unreachable code — so the untouched code below
  fails to typecheck, the build fails, and `dist/` silently keeps the *previous* build. That produced
  a full run of data that was actually the baseline. Use `Boolean(1)`.
- **Reading a headline percentage without checking which phase it came from.** The seeded search
  showed −43% forced layouts and was taken to the TV on that basis; the by-phase split (167 → 166 in
  `'holding'`) already said it would not help.
- **Backticks inside a template-literal probe source.** The QA probes are built as template strings; a
  backtick in a comment inside one terminates the string.
- **Assuming a stale baseline is current.** The 2026-08-15 TV numbers predated a commit that touched
  the data-polling path by five hours. Re-measuring closed it (they were unchanged), but always check.
- **`adb` ambiguity after a sleep/reconnect** — see §1.
- **The collector silently mixes arms at their boundary.** It is an append-only sink on a fixed port,
  so the *previous* arm's build keeps posting until the relaunch — a run file can open with windows
  belonging to the arm before it (seen as a lone `index: 31` ahead of a fresh `1`). Separately, the
  PWA's `registerType: 'autoUpdate'` service worker can reload the page mid-run, restarting the
  sampler's index. Both are handled by trimming to the last index restart (`summarize-frames.mts` /
  `wait-frames.mts` do this); **never read a raw run file, and never gate a run's length on raw file
  length** — that can stop with a handful of usable samples.
- **Confirm the build actually rebuilt by checking the sampler marker is *gone* from `dist/index.html`.**
  `npm run build` runs `tsc` before `vite build`, so if typechecking fails vite never runs and `dist/`
  keeps the previous — still-injected — build. `grep -c qa-frame-sampler dist/index.html` returning `0`
  after a build proves vite re-ran; returning `1` means you are about to measure the previous arm.
- **Two QR encoders are now in the bundle.** `QrCodeSlide` uses `qrcode-generator`; the two admin login
  QR codes still use `qrcode.react`. Migrating those two (~6 lines each) would let the older dependency
  be dropped entirely — worth doing, not urgent.
