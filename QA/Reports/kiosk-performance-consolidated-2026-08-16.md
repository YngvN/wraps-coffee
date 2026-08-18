# Kiosk performance — consolidated findings

**Date:** 2026-08-16 — **last updated 2026-08-17** (facts 18–33, §7.0 current configuration, §9 fixtures/tooling, §10 traps)
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
| `handoff-catalogue-bitmap-2026-08-17.md` | folded in 2026-08-17 as facts 18–21, §8 step 4's status, §9's new tooling and §10's new traps. **Its "Code state" section was already stale when written** — it says "nothing is committed, v0.2.71"; all of it is in fact committed in `35e5d38` at v0.2.72. Keep the handoff only for its narrative of the aspect-ratio problem (§8 step 9 here). |

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

> **Before re-running anything below:** `Screen 3 (verify)` (`1783715372380`) **no longer exists in
> the store** as of 2026-08-17. Facts 1, 2, 3, 8, 11, 12, 13 and 15 were all measured on it and stand
> as history, but none of them can be re-measured or extended without rebuilding the fixture. See §9.

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

16. **CONFIRMED — the QR mount cost lands hidden, in the same commit as the geometry snap, not while
    anything is visibly still.** Traced in `SplitLayout.tsx`: the `exiting → holding` timer
    (`:389-395`) flips `displayStage` to the new stage **and** enters `'holding'` in one commit — the
    same commit the pane geometry snaps in. New content (a QR pane included) only resolves and mounts
    once `displayStage` reaches it, so the mount — and whatever a slide does synchronously on
    mount — runs concurrently with the busiest commit in the whole sequence, hidden behind
    `suppressEnter` (still true through `holding`). The reveal, once `contentPhase` returns to
    `'idle'`, is by then just a transform on already-rendered content. This is why a stutter can be
    visible *before* the QR itself is: the expensive part already ran, hidden, one phase earlier.

    The `holding`-heavy phase split already in fact 10's `d9d9b90` row (holding debt ~800 of 1140
    total, ~70%) is consistent with this independent of the fix below — it says where the cost was
    landing before anything changed.

    **Fix:** `buildQrGeometry` (`qrCodePath.ts`) is a pure function of its own three arguments — no
    DOM, no randomness — but was only memoised *within* one component instance
    (`QrCodeSvg`'s own `useMemo`), which is thrown away every time, since `useCrossfadeSlot` mounts a
    **fresh** instance into the alternate slot on every transition. A module-level cache
    (`geometryCache`, keyed on `value|minLevel|excavation`, bounded at 64 entries LRU) survives across
    mounts instead, behind `CACHE_QR_GEOMETRY = Boolean(1)`. Correctness risk is close to zero — a
    cache hit on a pure function's own exact inputs cannot be wrong, only stale-if-different, which
    the key already prevents.

    Measured (2026-08-17, regime C):

    | fixture | scope | worst | debt |
    |---|---|---|---|
    | `Skjerm 1` | whole run, cold+warm mixed (headline advances `stageTick % 8`, so content repeats roughly every 4 loops) | 700 → **440 ms** (−37%) | 1110 → **720 ms** (−35%) |
    | `Ny test` | `3→4` only, the transition that mounts the QR pane (`linkMode: 'custom'`, fixed URL — clean cold-then-always-warm case) | 220 → **140 ms** (−36%) | 820 → **720 ms** (−12%) |
    | `Ny test` | `4→1`, the transition after — QR already mounted, only the cheap reveal transform plays | 140 → 140 ms (flat) | 760 → 760 ms (flat) |

    The `4→1` row is the strongest evidence for the mechanism above: the cost disappears exactly on
    the mounting transition and is untouched on the one after, which is only possible if the cost was
    at mount and not at reveal.

    **Checked and not applicable elsewhere:** catalogue's own expensive per-mount work is the
    shrink-to-fit search, already covered by fact 12's `shrinkScaleStore` (same cross-mount-cache
    shape, already shipped). `NewsSlide` has no comparable expensive pure computation on mount — only
    a cheap image-width read (`useLayoutEffect`) — so there is currently nothing analogous to fix
    there.

17. **CONFIRMED — a QR pane's remaining cost was re-rasterisation on *resize*, and it is fixed by
    rasterising once and scaling with a transform.** Isolated on a new fixture, `Empty test`
    (`screen-4d546476-…`, 11 stages of pure geometry — splits, moves and resizes of flat colour
    blocks, no real content). That fixture on its own measures **worst 20 ms / debt 0 ms**: 8 of its
    11 transitions have *zero* debt, which is an independent on-device replication of fact 4 — the
    blank-and-snap machinery, structural restructuring included, is genuinely free.

    Adding **one** QR pane to it took the whole run to worst 40 ms / debt 20 ms. Mapping each
    transition against that pane's own computed box showed the cost is **not at mount**:

    | transition | QR pane | debt |
    |---|---|---|
    | 1→2 | mounts | **0** |
    | 2→3, 6→7 | box unchanged | **0** |
    | 3→4, 4→5, 5→6, 7→8, 9→10, 10→11 | resized | 20–120 each |

    Mount being free is `buildQrGeometry`'s cross-mount cache (fact 16) working. What remained was
    the browser **re-rasterising several hundred SVG subpaths every time the pane's box changed** —
    paint work, unreachable by any JS-level cache. Note `.qr-code-slide__slot` was *already* promoted
    to its own layer (`will-change: opacity`, fix 2): promotion alone does not help, because a layer
    re-rasterises when its own **layout size** changes.

    **Fix:** lay the code out at a fixed square and fit it to the pane with `transform: scale()` — a
    compositor property — so a resize stops being a layout change (`QR_FIXED_RASTER`,
    `QrCodeSlide.tsx`). The scale comes from a `ResizeObserver` reading `contentRect`, never
    `clientWidth` after a write, so it costs no forced layout.

    | arm | worst | debt | debt summed over the resize transitions |
    |---|---|---|---|
    | no QR at all (the floor) | 20 ms | 0 ms | — |
    | QR, raster off | 40 ms | 20 ms | 400 |
    | QR, fixed 640 px raster | 20.1 ms | 0 ms | 160 |
    | **QR, viewport-derived raster** | **20.1 ms** | **0 ms** | **120 (−70%)** |

    The final arm is **indistinguishable from having no QR pane at all** on this fixture.

    **The raster size must be derived, not fixed.** The fit transform has to only ever scale *down* —
    downscaling stays crisp, upscaling blurs, and a code a customer points a phone at cannot afford
    blur. A fixed 640 was right for the TV's 960x540 CSS viewport but **upscaled 1.45x at 1920x1080**,
    measured directly. `rasterSizePx()` uses `min(innerWidth, innerHeight)` (floored at 320), which
    verified as no-upscaling on both viewports — and is also *faster* than the fixed 640 on the TV,
    since it rasterises 540 px rather than 640 and cost scales with area.

18. **CONFIRMED — one catalogue pane's cost is two independent things, not one, and the shrink search
    is the lesser half.** All arms 2026-08-17, regime C, on the TV, on `Empty test`
    (`screen-4d546476-…`) with a single catalogue pane on leaf `pane-165995c1-…` — the leaf whose box
    goes 960x1080 → 960x540 between stages 3 and 4 — content the full `food-menu` catalogue
    (7 categories). Medians via `summarize-frames.mts`:

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | blank pane (the fixture's own floor) | 20 ms `[20–80]` | 0 ms `[0–80]` | 0 / 0 / 0 | 39 | `tv-emptytest.json` |
    | **baseline catalogue** | 180 ms `[60–560]` | 1080 ms `[80–5140]` | 100 / 400 / 660 | 63 | `cat-A0-base.json` |
    | shrink search ablated | 170 ms `[20–540]` | 470 ms `[0–1560]` | 0 / 370 / 120 | 72 | `cat-A1-noshrink.json` |
    | fixed layout box only, live DOM | 200 ms `[20–640]` | 580 ms `[0–1860]` | 0 / 360 / 180 | 65 | `cat-E2-fixedlayout.json` |
    | **fixed box + its own CQ container, live DOM** | 80 ms `[20–360]` | 200 ms `[0–700]` | 0 / 140 / 40 | 70 | `cat-E3-container.json` |
    | **catalogue as cross-mount-cached bitmap** | 40 ms `[20–100]` | 20 ms `[0–140]` | 0 / 0 / 0 | 60 | `cat-E-bitmap.json` |

    The prior session found that adding one catalogue pane to the otherwise-free `Empty test` costs
    ~48 ms/frame sustained and attributed it to the deferred shrink search still running in `idle`
    (fact 12's known residual). **That attribution is half right, and wrong about the half that
    matters.** Ablating the search outright (fact 8's V1b arm, re-armed as `ABLATE_MEASUREMENT`)
    removes only **56% of the debt**, and splits cleanly by phase:

    - `idle` debt 660 → 120 and `exiting` 100 → 0. The shrink search **is** that, exactly as inferred.
    - `holding` debt 400 → 370 and worst frame 180 → 170. **Untouched.** The shrink search is not the
      holding cost and is not the worst frame at all.

    The residual is the half that matters most: `holding` is the phase the geometry commits and
    content mounts in (fact 16), and the worst frame is what a viewer actually perceives as a stutter.

    **Do not treat the two costs as additive against the 1080 ms baseline.** Removing one changes the
    other's cost; quote the arms, not a decomposition.

19. **CONFIRMED — that residual is container-query units re-resolving through the animated resize.**
    `.split-layout__pane` declares `container-type: size` (`SplitLayout.scss:122`), so every
    `--slide-*-size` — all `cqmin` lengths from `textSizesToCssVars` (`src/utils/textSizeVars.ts`) —
    resolves against **the pane's own box**. During a stage transition that box is animated, so every
    font size in the catalogue changes on **every frame of the glide**, and each change re-lays-out
    the whole catalogue.

    The cleanest evidence is the E2/E3 pair in fact 18: those two arms differ by **one CSS line** —
    `container-type: size` on the fixed-size raster host — and that line moves holding debt 360 → 140
    and total debt 580 → 200. Pinning the host's width/height alone (E2) does **nothing**, because the
    host is a *descendant* of the pane and its contents still resolve `cqmin` against the pane.

    This is a distinct mechanism from everything in facts 8–12, which are all about the shrink hook's
    own probes. This one costs nothing in JS at all — it is the style/layout engine responding to a
    container whose size is animating.

20. **CONFIRMED — a bitmap reaches the fixture floor; live DOM does not.** The cached-bitmap arm is
    statistically indistinguishable from having no catalogue pane at all (40 ms / 20 ms, **zero debt
    in all three phases**, range `[0–140]` against the baseline's `[80–5140]`). The best live-DOM arm
    (E3) stops at 80 ms / 200 ms. The remaining 200 ms is text re-rasterising as the transform scale
    changes — the same mechanism fact 17 fixed for QR, which only a real raster avoids. **The user has
    confirmed by eye that E3 still visibly stutters somewhat; the bitmap does not.**

    **This partly contradicts §8 step 4's own prediction**, which listed `CatalogueSlide` as a *wrong*
    candidate for the fixed-raster treatment because it must genuinely re-wrap. That objection is
    about **appearance** and it stands — see fact 21's aspect-ratio limitation. It was wrong only as a
    prediction about **cost**: the bitmap is the only arm that reaches the floor.

21. **CONFIRMED — four traps in the bitmap implementation, each of which silently invalidates the
    arm.** Recorded because three of them produce a result that looks like a successful measurement.

    1. **`useCrossfadeSlot` mounts a fresh slide instance on every transition** (fact 16), so a
       per-instance capture re-captures every stage change. The first implementation did exactly this
       and the arm went bimodal — free when it reused a bitmap, *seconds* when it re-captured. Fixed
       with a module-level cache keyed on content (`bitmapCache`), the same shape as `qrCodePath.ts`'s
       `geometryCache` (fact 16) and `shrinkScaleStore` (fact 12). **Three separate fixes in this
       investigation are now the same one idea**: a slide's per-mount work must be cached *across*
       mounts, because the mount is thrown away every transition.
    2. **`toPng` never settles against cross-origin Google Fonts.** It inlines every `@font-face`
       source, and Google splits the 7 families in use into ~100 `unicode-range` subset files. It
       looks exactly like a hang. Now fixed at the root — fonts are self-hosted (§5 fix 10) — but the
       memoised `ensureFontEmbedCss` and the `CAPTURE_TIMEOUT_MS` bound both still matter.
    3. **Without `fitIntoRaster` the capture silently truncates the menu.** The raster is a fixed
       window with `overflow: hidden`, and the pane's own `useShrinkToFitFontScale` cannot notice,
       because content inside the raster can never overflow the *pane* — it settles at scale 1 on its
       first probe and shrinks nothing. Observed on the TV as a bitmap containing only the first of
       seven categories.
    4. **The capture is fitted, not re-wrapped — so it letterboxes at the wrong aspect.** The bitmap
       is captured at one fixed size (the viewport, 960x540 CSS on this TV) and fitted with a contain
       transform, `min(hostW/rasterW, hostH/rasterH)`. A pane whose aspect differs from the raster's
       uses less of its box than live DOM would, at correspondingly smaller type. On `Empty test`'s
       extreme stages the probe caught fit scales of 0.36, 0.11 and **0.015** — at that last one the
       menu is a ~14 px sliver. **This is the open problem; see §8 step 9.**

    Trap 3 and trap 4 are both invisible to frame numbers — a truncated or letterboxed capture
    measures *better*, not worse. `bitmapProbe.mts` exists specifically to catch them (§9).

22. **CONFIRMED — fact 19's holding cost is removed by one CSS line, and `REFLOW_HIDE_ENABLED` never
    removed it because invisible is not the same as out-of-layout.** `transitions.ts`'s two variant
    sets are `opacity: 0` and a translate; both leave the subtree **fully laid out** inside a
    `container-type: size` pane whose box is animating, so every `cqmin` size re-resolved and the whole
    slide re-flowed on every frame of the glide — for content nobody could see. This is why §5 fix 5
    and `REFLOW_HIDE_ENABLED` both measured performance-neutral: they changed what was *painted*, never
    what was *computed*.

    Applying `content-visibility: hidden` for exactly the window where content is fully hidden *and*
    the box is still moving (`'holding'`, plus `reflowRevealHold`'s extension past `'idle'`;
    deliberately **not** `'exiting'`, where the fade is still visibly playing) is safe because
    `EXIT_PHASE_DURATION_SECONDS` is `CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS`
    precisely so every exit animation finishes before the grid snaps.

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | baseline catalogue | 180 ms `[60–560]` | 1080 ms `[80–5140]` | 100 / **400** / 660 | 63 | `cat-A0-base.json` |
    | E3 — fixed box + own CQ container (fact 18) | 80 ms | 200 ms | 0 / **140** / 40 | 70 | `cat-E3-container.json` |
    | **F — `content-visibility` while hidden** | 180 ms `[40–320]` | 700 ms `[40–4140]` | 80 / **20** / 600 | 77 | `cat-F-cvhidden.json` |
    | **F + shrink search ablated** | **80 ms** `[20–300]` | **80 ms** `[0–720]` | 0 / 20 / **60** | 95 | `cat-F1-cv-noshrink.json` |

    **Holding debt 400 → 20 ms, against the raster host's 140.** One CSS line beats the entire
    fixed-raster subsystem fact 18 was built to evaluate, on that phase. `SUPPRESSED_SKIPS_LAYOUT`
    (`LayoutPane.tsx`), shipped on.

23. **CONFIRMED — everything left is the shrink search, and it is the *poll* plus broken seeding, not
    the transition-driven re-confirm.** Ablating the search on top of arm F takes the run to
    80 ms / 80 ms with live re-flowing DOM and real glyphs — close to fact 20's bitmap (40/20) without
    any raster at all. So the residual is entirely fact 12's known `idle` debt.

    Two attempts to close it by trusting the warm store both measured **flat** — 680 ms against arm F's
    700 ms, `idle` unmoved (`cat-H-trustwarm.json`, `cat-H2-contentkey.json`). The first failed for a
    reason worth recording on its own: the "has the content changed?" guard was a per-instance ref, and
    `useCrossfadeSlot` mounts a fresh slide instance every transition — **fact 16 for the third time**,
    after `buildQrGeometry` and the first `CatalogueBitmap`. Any per-mount memory in a slide is empty on
    exactly the pass that matters. The second fixed that by folding a content fingerprint into the store
    key, and was still flat.

    In-page counters (`window.__qaShrinkStats`, gated on `TRUST_WARM_SCALE`; posted by
    `shrinkStatsProbe.mts`) say why. Over 42 working passes on one catalogue pane: **9 fast-path hits,
    13 store misses, 21 poll passes, 290 probes — ~6.9 probes per pass.**

    - **The poll is half of all passes** and deliberately re-derives (it is the only trigger that can
      notice content *shrinking*, fact 13), so no store fast path can ever touch it.
    - **~6.9 probes per pass means seeding is barely working** — a seeded re-confirm is meant to cost
      three (`SEED_PROBE_MARGIN`). This is close to a full bisection every time.
    - **`storeSize` reached only 13 entries, climbing one at a time during the run**, i.e. written live
      rather than pre-warmed in bulk. `warmShrinkScales` is not usefully populating the store here.

    **This corrects §8 step 7**, which called the poll "a fraction of a fraction". That was measured
    before Arm A moved every pass into `idle`; the poll now *is* the idle debt. `TRUST_WARM_SCALE`
    ships **off** — it also narrows the store key, which can only reduce Arm B's own hit rate.

24. **CONFIRMED — two long-standing content bugs, both invisible to frame metrics.**

    - **Transit rows were permanently clipped.** `transitRowVariants`' `visible` pose carried
      `maxHeight: '4em'`, and Framer Motion leaves a resting pose applied as an inline style — so every
      settled row in 3+ column mode kept a 4em cap, which `.transit-slide__item`'s own
      `overflow: hidden` then enforced. Any row taller than that (a large `--slide-description-size`,
      or `showLineName` adding a second line) was cut off silently. Fixed by animating `height: 'auto'`
      (Framer measures and restores it) and moving `overflow: hidden` out of the stylesheet into the
      variants, so clipping lasts exactly as long as the animation.
    - **`REFLOW_HIDE_THRESHOLD` was too high to fire on real screens.** At `0.2` a pane had to reshape
      by 20% to hide at all; `Ny test`'s transit and weather panes reshape by less, stayed
      `stageStatic`, and re-flowed their lists live in front of the viewer during the glide. Lowered to
      `0.02` — affordable now that a slide declaring `data-slide-body` only fades its re-flowing list
      and keeps its chrome painted (`BODY_ONLY_REFLOW`, `LayoutPane.tsx`).

    Neither showed up in `debtByPhase`: the first is pure appearance, the second made panes *cheaper*
    by skipping the hide entirely. **A run being fast is not evidence it is correct** — the same trap
    as fact 21's blank-capture case.

25. **CONFIRMED — a Framer Motion element's inline `opacity` silently defeats a CSS class.** The
    body-only fade above is applied by class, but both bodies (`TransitSlide`'s list,
    `WeatherSlide`'s list) carry `SLIDE_LAYOUT_FADE_VARIANTS`, and Framer writes `opacity` as an
    **inline style** — which outranks any class selector. The first build shipped with the class
    present, correct, and completely inert: chrome painted, `--body-hidden` in the DOM, and no fade at
    all. Requires `!important`, or an unanimated wrapper to own the fade.

    The verification lesson is the reusable part: the first check asserted the class was *present* and
    passed. Only asserting the **computed opacity actually reached 0** caught it. For any
    class-driven visual change on a Framer-controlled element, assert the computed style, never the
    class — `QA/scratchpad/qa/body-split-check.mts` now does both.

26. **CONFIRMED — pre-rendered per-(pane, stage) bitmaps for the moving frames are a large net
    regression, and the reason generalises.** Built as specified in the 2026-08-17 plan and verified
    working end-to-end on desktop before measuring: `warmSlideBitmaps` captured **16 bitmaps across
    `Ny test`'s 4 stages**, correctly addressed by (screen, pane, stage, content), with
    `.slide-bitmap-layer` mounting during transitions and every image decoded. This is not a failed
    implementation; it is a working one that costs more than it saves.

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | hide-only (arm J — facts 22/24 shipped, bitmap off) | 180 ms `[20–420]` | 720 ms `[0–2280]` | 120 / 20 / 620 | 68 | `cat-J-bodysplit.json` |
    | **bitmaps on (arm K)** | **300 ms** `[20–3660]` | **1840 ms** `[0–6980]` | 740 / 340 / 700 | 65 | `cat-K-bitmap.json` |

    Two independent causes, both structural rather than tunable:

    - **The warm pass is ruinous on this hardware.** `Empty test` is 11 stages x 9 panes, i.e. up to 99
      `html-to-image` captures at `devicePixelRatio` 2, on 4 cores, **while the rotation is already
      playing**. Individual windows during the warm measured worst frames of **3620 ms, 3500 ms and
      3540 ms** — two orders of magnitude past a 20 ms budget, and far worse than the stall being
      fixed. `warmShrinkScales` survives the identical pattern only because resolving a scale is cheap
      next to rasterising a pane. §4's "live capture is dead" verdict extends further than it was
      written to: *boot-time* capture at this volume is also dead.
    - **There was nothing left to win.** Once fact 22 takes hidden content out of layout, `holding`
      debt is **20 ms** against the fixture's own floor of 0. A bitmap covering the moving frames has
      exactly that 20 ms of headroom. The residual ~600 ms is fact 23's shrink search in `idle`, which
      this design cannot touch **by construction** — it deliberately returns to live DOM at rest, and
      live DOM is what runs the search.

    Steady state after warming completed measured ~700–900 ms, i.e. **flat** against arm J under §2's
    own rule. **The general lesson: a raster only pays where the cost is paint. Facts 17 and 22 both
    show this pane system's cost is layout, and layout is removed more cheaply by not laying out.**

    The code is kept behind `SLIDE_BITMAP_ENABLED` (`slideBitmapStore.ts`), **off**, because the
    pipeline is correct and reusable if a future slide kind ever has genuinely expensive *paint*
    during motion: captured at the target box so a bitmap is drawn 1:1 (which is what makes fact 21's
    trap 4 unreachable), fingerprint published on the element and read back rather than derived twice,
    and `decode()` forced at warm time so fact 7's 545–598 ms never lands on a transition. Reviving it
    means first making the warm pass selective and far cheaper.

27. **CONFIRMED — the legibility-floor rework doubled the probes per pass and moved the debt not at all.**
    `useShrinkToFitFontScale.ts` was last written at 17:08 on 2026-08-17, i.e. **after** both arms in the
    handoff's decisive table (`cat-J` 16:37, `cat-K` 16:58), so neither was measured with the soft floor
    that ships today. Arm J was re-run on the current tree as **arm L**:

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | J — hard floor (16:37 build) | 180 ms | 720 ms | 120 / 20 / 620 | 68 | `cat-J-bodysplit.json` |
    | **L — soft floor (current tree)** | **180 ms** `[40–340]` | **720 ms** `[60–4020]` | 140 / 20 / 600 | 75 | `cat-L-baseline.json` |

    Identical. This **refutes a prediction made from probe counts alone**, recorded because the reasoning
    looked strong: simulating the search state machine (`fitsAt` is monotone in scale, so probe count is
    deterministic given seed and true scale) shows a below-floor pane costs **16 probes per working pass
    under the soft floor against 8 under the hard one**, and that the seed is *never probed at all* below
    the floor — `'full'` routes to `'seed'` only when `seed > MIN_LEGIBLE_SCALE`, so seeding,
    `shrinkScaleStore` and the whole warm pass are inert for exactly the catalogue case. All of that is
    true and none of it reached `debtByPhase`. **Probes per pass is therefore not the binding constraint
    on `idle` debt**, which invalidates §4 step 1's own rationale (though not necessarily the change: 16
    probes to re-derive a known answer is still waste, just not *this* waste). Note also that every
    counter behind fact 23's "~6.9 probes per pass" is gated on `TRUST_WARM_SCALE`, so those figures come
    from arm H2's *narrowed* store key, not from the shipping arm.

28. **CONFIRMED — making the boot warm selective does not rescue the bitmap arm; steady state is flat and
    the warm is still ruinous.** `warmSlideBitmaps` now captures only panes publishing
    `data-slide-reflows` (`SLIDE_REFLOW_ATTRIBUTE`), which is `Empty test`'s **9 captures instead of 99**.
    Measured against arm L on the same tree, same fixture, same session:

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | L — bitmap off | 180 ms `[40–340]` | 720 ms `[60–4020]` | 140 / 20 / 600 | 75 | `cat-L-baseline.json` |
    | **M — bitmap on, steady state** | 220 ms `[40–340]` | 740 ms `[20–1340]` | 120 / 20 / 620 | 231 | `cat-M-bitmap-selective.json` |
    | **M — during the warm pass** | 380 ms `[160–3920]` | **2110 ms** `[180–16760]` | 830 / 380 / 790 | 24 | same file, windows ≤24 |

    Steady state is flat under §2's rule. **The arm is verified live, not assumed** — `slideBitmapProbe`
    reported the store filling to 9 entries under the exact keys the panes look up, every
    `.slide-bitmap-layer` mounting with a decoded image at its captured device-pixel size, and scale 1
    at rest. So this is a working pipeline with nothing left to win (fact 26's second cause), not fact
    21's trap wearing success's clothes.

29. **CONFIRMED — one pane's capture costs 4.6–9.5 seconds on this device, and the cost is fixed
    overhead rather than pixel count.** Measured for the first time (`recordSlideBitmapTiming`, nine
    captures on `Empty test`):

    | pane box (CSS) | device pixels | `toBlob` | `decode()` | PNG bytes |
    |---|---|---:|---:|---:|
    | 480x540 | 960x1080 | 8844 ms | 49 ms | 203 KB |
    | 480x270 | 960x540 | 4792 ms | 63 ms | 101 KB |
    | 347x270 | 694x540 | 4675 ms | 48 ms | 91 KB |
    | **106x64** | **212x128** | **4704 ms** | 32 ms | **7 KB** |
    | 778x54 | 1556x108 | 4588 ms | 409 ms | 28 KB |

    Total 53.6 s for nine captures. Three consequences, all structural:

    - **Lowering `pixelRatio` cannot fix it.** A 212x128 capture is 1/85th the pixels of 960x1080 and
      costs 53% as much, so there is a floor of roughly **4.5 s per capture** independent of size. The
      "capture at dpr 1 during motion, upgrade to dpr 2 at rest" design is dead on this number.
    - **Capturing lazily during an idle dwell is also dead as stated.** A stage dwell on these fixtures is
      ~2.4 s; a single uninterruptible 4.6 s task does not fit in it.
    - **`decode()` is not the problem**, which retires fact 7 as the relevant cost here — 29–409 ms
      against 4.6–9.5 s.

    **RESOLVED, and it is not the fonts** (`capture-cost-bench.mts`, desktop, against live panes — the
    font hypothesis this paragraph originally recorded is refuted):

    | pane | elements | `toSvg` (clone + inline every computed style + serialise) | serialised SVG | `toBlob` (adds rasterise + PNG) | bare div, same box |
    |---|---:|---:|---:|---:|---:|
    | catalogue 480x270 | **350** | 242 ms | **3860 KB** | 302 ms | **9 ms** |
    | smaller reflowing pane 240x135 | 55 | 48 ms | 600 KB | 65 ms | 9 ms |

    **The capture is a DOM-serialisation cost, not an image cost.** `html-to-image` clones the subtree,
    reads *every* computed CSS property on *every* element and writes them back as inline style text, then
    serialises the result into an SVG `foreignObject` data URL which the browser must parse and lay out
    again to rasterise. For a 55-item catalogue that is 350 elements and a **3.8 MB** intermediate string.
    Decomposition:

    - **per element ~80%** — `toSvg` alone is 242 of `toBlob`'s 302 ms, and an empty div at the same box
      size is **9 ms**, so essentially none of it is pipeline overhead.
    - **per pixel ~20%** — `toBlob` minus `toSvg`; and `pixelRatio` 1 vs 2 measured 302 vs 313 ms, i.e.
      within noise for a 4x pixel change. This is why the TV's 212x128 capture cost the same as its
      960x1080 one: identical element count, identical 3.8 MB string.
    - **fonts ~0%** — 242 vs 225 ms (`toSvg`) and 302 vs 302 ms (`toBlob`) with and without the 69 KB of
      inlined woff2. `getFontEmbedCSS` itself is 35-60 ms, once per pass.

    Element count against SVG bytes is near-linear across the two panes (6.4x elements, 6.4x bytes), and
    the TV/desktop multiplier is ~15x (4 slow cores, plus parsing a multi-megabyte data URL), which lands
    242 ms → ~4.5 s.

    **So no tuning of this pipeline helps.** The levers are fewer elements (not available — every menu line
    is the point) or a capture mechanism that does not serialise the DOM at all. The one such primitive
    available on this device is `document.startViewTransition` (Chromium 111+, cleared on this WebView per
    fact 6), which snapshots in the compositor — no clone, no style inlining, no intermediate string. Note
    it only yields snapshots for the duration of one transition, so it can cover the **moving frames**
    (worth ~20 ms, per fact 26's second cause) and **cannot** be held as a resting representation. There is
    currently no way in this WebView to cheaply capture one pane and hold it indefinitely, which is the
    primitive a bitmap-at-rest design requires.

30. **CONFIRMED — the body-over-a-moving-box artefact is clean on every steady-state transition and
    real for the first ~5.6 s after a page load.** New instrument (`body-still-check.mts`) samples every
    pane's box together with its body's **effective** visibility once per animation frame, on
    `Ny test`, ~16 700 samples per 75 s run. Grouping consecutive moving frames into episodes:

    | episode start | phase | span | frames with a visible body |
    |---|---|---:|---:|
    | @4284, @16285, @28285, @40280, @52285, @64280 ms (every rotation) | `holding` | 300–319 ms | **0 of 24–29** |
    | @1103 ms | `idle` | 1104 ms / 2658 ms (two panes) | 200/218 and 416/533 |
    | @4390 ms | `idle` | 1255–1270 ms (both panes) | ~217/238 each |

    So the designed glide is fully covered — every `'holding'` episode, on all three bodies, across six
    rotations, had **zero** visible frames. What remains is `'idle'` box movement lasting **1.1–2.7 s**,
    concentrated entirely in the first ~5.6 s after load, which is neither the 300 ms grid glide nor the
    100 ms of it that lands past `'idle'`. **The shrink search is not the cause** — ablated as a control
    (`ABLATE_MEASUREMENT`), the episodes are unchanged (1100 ms / 1461 ms / 2666 ms, 1106 violating frames
    against 1045). Cause not yet identified; `gridTransition` being re-enabled exactly when
    `contentPhase` returns to `'idle'` (`SplitLayout.tsx:819`) is the obvious place to look next.

    Also measured here: **`BODY_REVEAL_ON_PANE_STILL` is a no-op** — releasing the body on a
    `ResizeObserver`-observed still box instead of the fixed `REFLOW_REVEAL_HOLD_SECONDS` timer measures
    1049 vs 1050 violating frames with identical episodes and an identical 78–98 ms release lag, because
    the timer is 100 ms and the settle window is 80 ms. Shipped off; kept for the late-finishing
    transition the measurement could not produce.

    **Two measurement lessons, both of which produced a wrong answer first.** Reading the body's *own*
    computed opacity reports a hidden pane as visible, because the whole-slot path writes
    `content-visibility: hidden` on an **ancestor** (leaving the descendant's computed values untouched)
    and the `'slide'` transition style holds opacity 1 in all three poses — the first run of this check
    reported 1347 violations including 173/173 on a pane that is in fact hidden throughout. Effective
    visibility needs all three of: does the body generate boxes at all, the product of ancestor
    opacities, and whether the body's rect still overlaps its pane. And see §10 for the
    `addInitScript` trap that made the very first run report **PASS** on zero samples.

31. **CONFIRMED — the bitmap as the pane's *resting* representation reaches the fixture floor, and the
    only thing left in its way is capture cost.** Configured at the user's request as a troubleshooting
    arm: every hide mechanism switched **off** (`REFLOW_HIDE_ENABLED`, `BODY_ONLY_REFLOW`,
    `SUPPRESSED_SKIPS_LAYOUT`, `BODY_REVEAL_ON_PANE_STILL`), the inert boot warm switched off
    (`WARM_SHRINK_SCALES_ENABLED`), and `SLIDE_BITMAP_AT_REST` on — so a pane with a capture shows it
    permanently, the live subtree goes `content-visibility: hidden` beneath it, and **its shrink hooks are
    switched off entirely**.

    | arm | worst | debt | e / h / i | n | run file |
    |---|---:|---:|---|---:|---|
    | L — baseline | 180 ms `[40–340]` | 720 ms `[60–4020]` | 140 / 20 / 600 | 75 | `cat-L-baseline.json` |
    | M — bitmap for the moving frames only | 220 ms `[40–340]` | 740 ms `[20–1340]` | 120 / 20 / 620 | 231 | `cat-M-bitmap-selective.json` |
    | **N — bitmap at rest, steady state** | **40 ms** `[20–80]` | **20 ms** `[0–120]` | **0 / 20 / 0** | 58 | `cat-N-bitmap-at-rest.json` |
    | N — during the warm pass | 270 ms `[20–3860]` | 1790 ms `[0–10780]` | 630 / 350 / 760 | 20 | same file, windows ≤20 |

    **−78% worst frame, −97% debt, ranges non-overlapping**, zero debt in `exiting` and `idle`, and the
    20 ms left in `holding` is the fixture's own quantum. This is the blank-fixture floor: the catalogue
    pane has become free. It independently reproduces fact 20's `cat-E-bitmap` (40 ms / 20 ms) on a
    different implementation, which is the strongest confirmation either has.

    It also settles *why* M was flat and N is not, and the answer is the one fact 26 gave by construction:
    a bitmap that returns to live DOM at rest cannot touch the `idle` debt, because live DOM is what runs
    the search. Switching the search off for a bitmap-backed pane is the entire win — not the picture
    covering the moving frames.

    **Two things are fixed on the display side, and both matter for how it reads.** The capture is per
    (pane, stage) so it draws **1:1** at rest — verified on the TV as a 212x128 device-pixel image in a
    106x64 CSS pane at `devicePixelRatio` 2, and on desktop as natural size exactly equal to pane box at
    every stage — so fact 21's trap 4 is unreachable. And the layer now takes the screen's own transition
    variants instead of scaling independently per axis: mid-transition its computed transform is a pure
    **translate**, so it slides and clips rather than squashing. The previous non-uniform stretch was
    visible on the TV as text being squished and stretched through every resize.

    **What remains is exactly one problem: the warm.** Ten captures cost **60.3 s** and produce a 3860 ms
    worst frame, once per page load, for the reason fact 29 identifies (DOM serialisation, not
    rasterisation). Two consequences worth stating plainly: at this per-capture cost nothing about *when*
    the captures run makes them affordable, and **the durable fix is to stop re-capturing per page load at
    all** — persist the PNGs server-side against their own (screen, pane, stage, content, viewport, dpr)
    key so a boot fetches a ~200 KB file and decodes it in ~50 ms instead of spending ~6 s rebuilding it.
    That is the same "let something that already knows the answer send it" idea as §11's scale-cache
    proposal, and the key already contains everything that would invalidate it.

    **Hazard, not yet hit because `Empty test` has no such pane:** with `SLIDE_BITMAP_AT_REST` on, *any*
    captured pane freezes, and the content fingerprint is built from slot **config**. A transit board's
    departures change every 15 s under an unchanged fingerprint, so on `Ny test` this arm would show a
    frozen departure board indefinitely. Before this configuration goes anywhere near a real screen it
    needs restricting to kinds whose content is genuinely config-derived (catalogue, event-month).

    **Confirmed by eye on the TV, twice** — "it didn't stutter at all eventually", and again after the
    static-pose fix below, "it still runs smooth". The "eventually" is the warm pass: for its first ~60 s
    the screen is *worse* than baseline, and only then does it reach the floor.

    **Two motion bugs this arm introduced, both found by eye and not by any metric**, recorded because
    they are the same class of mistake — a new layer that does not inherit a rule the layer it replaces
    already had:

    - **Non-uniform stretch.** Scaling independently per axis to track the box distorts a photograph of
      text and, on a `'slide'` screen, replaces the slide with a squash. Fixed by drawing at captured size
      and letting the *layer* take the screen's own transition poses.
    - **Ignoring `stageStatic`.** Driving the layer's pose from `contentPhase` alone made a pane whose box
      *and* content are both unchanged slide out and back on every advance — seen on `Empty test`'s 2→3,
      where the pane is 480x540 at both stages. `suppressEnter` (`(contentPhase !== 'idle' &&
      !stageStatic) || reflowRevealHold`) is the expression the live slot has always used, and its
      `!stageStatic` term is exactly what makes a static pane sit a transition out. The layer now uses it.

32. **CONFIRMED — under `BODY_ONLY_REFLOW` the *chrome* is the last thing still laying out through a
    glide, and freezing it costs nothing where a bitmap would cost seconds.**

    Fact 24's body-only hide takes a slide's re-flowing body out of layout during a resize and
    deliberately keeps its chrome painted, so a transit board's identity does not vanish and return. That
    leaves the chrome — a brand mark and a stop name — as the only live layout in the pane while the box
    animates, inside a `container-type: size` pane. So its `cqmin` type re-resolves and re-lays-out on
    **every frame of the glide**: fact 19's mechanism, landing on precisely the part fact 24 chose to keep
    visible. Reported from the TV as the stop name stuttering through a resize while the departures under
    it faded out cleanly — i.e. the body-only hide working exactly as designed, and exposing what it left
    behind.

    **The fix is fact 17's, not a bitmap** (`CHROME_FIXED_LAYOUT`, `LayoutPane.tsx`): for that window the
    content is pinned to the px box it had when the glide started and given its own `container-type: size`
    — so every `cqmin` inside resolves against a constant — and one `transform: scale()` tracks the pane.
    A transform is compositor-only, so the glide costs no layout at all, and the pin releases the instant
    the pane settles, at which point the real layout runs once at the real size.

    Three details that are load-bearing rather than incidental:

    - **The scale must be uniform, at `min(width / frozenWidth, height / frozenHeight)`.** That factor is
      not a compromise — `cqmin` *is* a percentage of the box's smaller dimension, so scaling by the min
      ratio reproduces exactly what re-resolving would have produced. A per-axis scale distorts glyphs,
      which is the same artefact the bitmap layer had to be corrected for (fact 31).
    - **It must be applied to the *inner* element, never the slot root.** The root paints the slot's own
      backdrop, and that backdrop has to keep filling the pane on both axes for the whole glide; a
      uniformly-scaled fixed box cannot, so the background stops covering the pane mid-glide and snaps
      back when the freeze releases. Observed on `Ny test`'s 1→2 as the border animating correctly while
      the transit backdrop lagged and jumped. `--layout-skipped` already carries a comment saying the same
      thing for the same reason; the first version of this rule ignored it.
    - **The frozen box comes from the `ResizeObserver`'s own `contentRect`, never
      `getBoundingClientRect()`.** Reading the box at freeze time would be a forced synchronous layout
      landing in the `'holding'` commit, the busiest commit in the transition (fact 16). For the same
      reason the scale is written as a custom property straight onto the element rather than through React
      state: it changes every frame, and re-rendering per frame would restore the cost being removed.

    **REFUTED THE SAME DAY, AND THE REFUTATION IS THE USEFUL PART. `CHROME_FIXED_LAYOUT` ships OFF.**
    Sampled per animation frame on `Ny test`'s 1→2 (`pane-backdrop-check.mts`), the transit pane grows
    **478 → 618 px wide at a constant 268 px height**, and the pinned content stays at 478 for the entire
    glide — because the uniform factor is `min(618/478, 268/268)` = **1.0**. Only one axis changed, so the
    scale is a no-op; the chrome sits at its old size inside a growing box, the exposed strip shows raw
    backdrop, and the whole thing snaps when the freeze releases. Reported from the TV as the border
    animating correctly while the pane's contents jumped at the end, which is precisely what the numbers
    show.

    **The generalisation is what to keep: a frozen box cannot fill a box whose aspect is changing.** A
    uniform scale only tracks proportional change, and a per-axis scale distorts glyphs (fact 31). So the
    two goals are irreconcilable — anything that stops laying out per frame stops filling the pane, and
    anything that fills the pane lays out per frame. **`QR_FIXED_RASTER` (fact 17) works only because a QR
    code is scale-invariant and square**; that is a property of the content, not a transferable technique,
    and this is the second time it has been assumed to generalise (the first was fact 20's catalogue
    bitmap, refuted on appearance).

    Which leaves exactly three ways to stop the chrome laying out per frame, all with a real cost: hide it
    (`content-visibility`, i.e. give up the identity `BODY_ONLY_REFLOW` exists to keep), photograph it
    (a bitmap, at fact 29's 4.6-9.5 s per capture), or accept the cost. **Accepted for now** — the chrome
    is a logo and one line of text, and no measurement has yet shown its per-frame relayout is worth
    anything. Getting that number is the honest prerequisite to spending anything else here.

33. **CONFIRMED — this fleet's WebView has no `subgrid`, so every subgrid layout in the codebase renders
    through its fallback, and one of those fallbacks does not align.** `subgrid` shipped in Chromium
    **117**; the TV is Chromium **116** (§1, re-confirmed from the capability probe). Every
    `grid-template-columns: subgrid` in `WeatherSlide.scss` and `TransitSlide.scss` is therefore an
    invalid value dropped at parse time, and the `@supports not (subgrid)` blocks at the bottom of those
    files are what actually renders on device.

    `WeatherSlide.scss`'s fallback used `auto` tracks, with a comment predicting they would "come out
    near-identical" because every row carries the same field structure. Measured on the TV, that is wrong
    and plainly visible: `auto` sizes each row's tracks to **its own** content, and the content genuinely
    differs per row — the leading card reads "Now" where the rest read a clock time, and each hour's
    weather symbol is a different SVG with a different intrinsic width. Every row placed its temperature
    at a slightly different x. Rows that cannot share tracks can only be aligned by giving them *equal*
    ones.

    **The general point matters more than the one fix:** a `subgrid` layout in this codebase is not what
    the kiosk runs, and its fallback is not automatically equivalent. `TransitSlide` has the same shape
    and the same `auto`-track fallback; it looks correct today only because its rows happen to carry
    near-identical content widths. Anything verified in a desktop browser has verified the subgrid path,
    not the shipped one — the same editor-versus-device divergence §11 describes for CSS pixel size,
    arriving through a different door.

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
| 7 | `useShrinkToFitFontScale` — search deferred off the transition, frame-sliced, seeded from a shared cross-mount store (`ARM_A_DEFERRED_SEARCH` / `ARM_B_SHARED_SCALE_STORE`) | `Screen 3` worst 320 → **80 ms** (−75%), debt 930 → **380 ms** (−59%); `Skjerm 1` flat | C |
| 8 | QR geometry — cross-mount memoisation (`CACHE_QR_GEOMETRY`) | `Skjerm 1` worst 700 → **440 ms** (−37%), debt 1110 → **720 ms** (−35%); isolated to the QR-mounting transition on `Ny test`: worst 220 → **140 ms** (−36%) | C |
| 9 | QR — fixed-size raster fitted by `transform: scale()`, raster size derived from the viewport (`QR_FIXED_RASTER`) | `Empty test` debt summed over the QR pane's resizing transitions **400 → 120 ms (−70%)**; whole run lands on the no-QR floor (worst 20 ms, debt 0) | C |
| 10 | **Self-hosted Google Fonts** — `scripts/fetch-google-fonts.mts` (`npm run fonts:fetch`) downloads all 999 families from `src/data/googleFonts.json` as woff2 into `public/fonts/`; `index.html` loads one generated stylesheet and `useGoogleFontLoader` was deleted with its three call sites | not a frame-cost fix — it makes the app **offline-capable** and unblocks the bitmap path: font-embed CSS 198 KB → **70 KB**, first capture 30–60 s+ → **5 s** on the TV | — |
| 11 | **`content-visibility: hidden` while content is hidden and the box is still moving** (`SUPPRESSED_SKIPS_LAYOUT`, `LayoutPane.tsx`) | `Empty test` + one catalogue pane: **holding debt 400 → 20 ms**, beating the fixed-raster host's 140 ms. See fact 22 | C |
| 12 | **Body-only reflow hide** — a slide declares its re-flowing part with `data-slide-body`; only that fades and leaves layout, chrome stays painted (`BODY_ONLY_REFLOW`). `REFLOW_HIDE_THRESHOLD` 0.2 → 0.02 so it actually fires | appearance/motion fix, frame-cost neutral (720 ms vs arm F's 700 ms, worst-case tail `[0–2280]` vs `[40–4140]`) — see fact 24 | C |
| 13 | **Never truncate** — `line-clamp` off the news headline/description, `nowrap`+ellipsis off weather's time/temp/value, resting `overflow: hidden` off transit and weather rows; shrink search floored at `MIN_LEGIBLE_SCALE = 0.5` with `useFitItemCount` dropping items below it | correctness/legibility only; no frame-cost change measured | — |

Fix 10's own sizing decisions, so they are not relitigated: the woff2 set is restricted to
`latin`/`latin-ext`/`vietnamese` subsets — without that restriction the CJK families alone
(`Noto Sans SC/JP/KR`, `Nanum*`, `M PLUS`) take it from 41 MB to hundreds of MB. `public/fonts` is
gitignored and fetched at build time by `build-installer.yml` and `build-with-apk.ps1`, matching how
the Node/Ollama installers are already handled; the installer ships them via its existing `..\public\*`
entry, and `public/fonts/LICENSES.md` is generated alongside because redistribution obliges it.
**Deliberately not used:** `github.com/google/fonts` — that repo is ~1.5 GB of TTF/OTF *sources* for
~1800 families, where the CSS API serves woff2 at 3–5x smaller and exactly the 999 families the picker
offers.

Fix 2 is the single largest win in the whole investigation and is why QR/news crossfades are no longer
the top cost. It addressed the **crossfade repaint**; the remaining QR cost was **mount-time path
rasterisation**, which fix 8 now closes (fact 16) — a different mechanism from fix 2, not a
continuation of it.

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

## 7. Code state

### 7.0 CURRENT CONFIGURATION — v0.2.77, 2026-08-17 (this supersedes §7.1 below)

> **Superseded in part, same day.** The bitmap arm below was measured, confirmed by eye, and then
> **switched back off** — the fixture moved on to a realistic weather/transit screen where the catalogue's
> two cost drivers (350 elements, and a menu that cannot fit above the legibility floor) do not exist. The
> flag tables in this section have been updated to the live state; the bitmap narrative is kept because
> facts 28-31 depend on it and it is the only measured account of what a resting bitmap actually does.
> The mechanism now carrying the resize case is fact 32's chrome freeze, not a bitmap.

**Where this stands: the kiosk no longer stutters on `Empty test`, confirmed by measurement and by eye.**
Steady state is 40 ms worst / 20 ms debt against a 180 ms / 720 ms baseline, zero debt in `exiting` and
`idle` (fact 31), and the user confirmed on the TV that "it didn't stutter at all eventually" and "it
still runs smooth". The remaining problems are the boot warm and two correctness items, all listed at the
end of this section.

The configuration that achieves it is **the bitmap as the pane's resting representation, with every
incremental hide mechanism switched off underneath it**. That is deliberate: those mechanisms exist to
make a *live* pane cheaper while its box moves, and a pane that is a picture with its shrink hooks
disabled has nothing left for them to do. They are switched off, never deleted, so any one of them can be
restored by flipping a single flag.

**Turned OFF, and why:**

| flag | file | was | why it is off now |
|---|---|---|---|
| `REFLOW_HIDE_ENABLED` | `SplitLayout.tsx:89` | `Boolean(1)` | Hid a re-flowing pane through a shape change. Subsumed: a bitmap-backed pane has no live re-flow to hide. Turning it off also returns unchanged-content panes to `staticLeafIds`, i.e. they sit transitions out entirely. |
| `SUPPRESSED_SKIPS_LAYOUT` | `LayoutPane.tsx:50` | `Boolean(1)` | Fact 22's win (`content-visibility: hidden` while hidden *and* moving; holding debt 400 → 20 ms). Subsumed and exceeded: `--bitmap-backed` now takes the live subtree out of layout **at all times**, not just through the glide. **Restore this first if the bitmap arm is ever turned off.** |
| `BODY_ONLY_REFLOW` | `LayoutPane.tsx:73` | `Boolean(1)` | Body-only hide for transit/weather (fact 24). Inert for a catalogue either way — it declares no `data-slide-body`. |
| `BODY_REVEAL_ON_PANE_STILL` | `LayoutPane.tsx:288` | `Boolean(0)` | Never shipped on: measured a no-op against the fixed timer (fact 30). |
| `WARM_SHRINK_SCALES_ENABLED` | `warmShrinkScales.ts:51` | (new gate) | 11 off-screen `SplitLayout` mounts per page load to seed `shrinkScaleStore`, which fact 27 shows moves neither worst frame nor debt — and whose seed a below-floor catalogue **never probes**, since `'full'` routes to `'seed'` only when `seed > MIN_LEGIBLE_SCALE`. For a catalogue the store is write-only. |

**Live flag state (updated after the bitmap arm was switched off):**

| flag | file | state and why |
|---|---|---|
| `SUPPRESSED_SKIPS_LAYOUT` | `LayoutPane.tsx` | Fact 22. Back **on** — restored the moment the bitmap arm was switched off, exactly as this section said it must be. |
| `BODY_ONLY_REFLOW` | `LayoutPane.tsx` | Fact 24. Back **on**; the body fades and leaves layout while the chrome stays painted. |
| `REFLOW_HIDE_ENABLED` | `SplitLayout.tsx` | Back **on**; without it an unchanged-content pane sits the transition out and re-flows live in front of the viewer. |
| `CHROME_FIXED_LAYOUT` | `LayoutPane.tsx` | **OFF** — fact 32, refuted: a frozen box cannot fill a box whose aspect is changing, so the chrome froze at its old width and snapped on release. |
| `WARM_ONLY_REFLOWING_PANES` | `warmSlideBitmaps.ts` | Kept on; inert while the bitmap is off. |
| `SLIDE_BITMAP_ENABLED` | `slideBitmapStore.ts` | **OFF.** Facts 28-31 measured what it does; a transit or weather pane cannot be frozen (their data changes under an unchanged fingerprint), and the warm costs 60 s per page load. |
| `SLIDE_BITMAP_AT_REST` | `LayoutPane.tsx` | On, but inert — gated behind the flag above. |
| `WARM_SHRINK_SCALES_ENABLED` | `warmShrinkScales.ts` | Still off (facts 27, 31). **Worth revisiting now:** it was inert only because a catalogue sits below `MIN_LEGIBLE_SCALE`, where the search never probes its seed. Weather and transit resolve around 0.8, above the floor, so the seeded path does run and a pre-warmed store would take a first pass from ~9 probes to 3. |

**Unchanged from before:** `ARM_A_DEFERRED_SEARCH` / `ARM_B_SHARED_SCALE_STORE` on
(`useShrinkToFitFontScale.ts:16,33`), `TRUST_WARM_SCALE` / `ABLATE_MEASUREMENT` off (`:106,50`),
`MIN_LEGIBLE_SCALE = 0.5` soft floor (`:212`), `REFLOW_HIDE_THRESHOLD = 0.02`
(`SplitLayout.tsx:118`), `CATALOGUE_AS_BITMAP` off (`CatalogueSlide.tsx:24`).

**Two display-side fixes that were needed to make it look right**, both found by eye on the TV and both
worth keeping if this arm survives:

1. **No non-uniform stretch.** The layer used to scale independently on each axis to track the box, which
   distorted every glyph and, on a `'slide'` screen, replaced the slide with a squash. It now draws at its
   captured size and clips, and the *layer* takes the screen's transition poses. Mid-transition its
   computed transform is a pure translate.
2. **Pose must follow `suppressEnter`, never `contentPhase`.** Driving it off the phase alone made a
   `stageStatic` pane slide out and back on every advance even when its box and content were both
   identical (observed on `Empty test`'s 2→3, where the pane is 480x540 at both stages). The live slot has
   always used `suppressEnter` — whose `!stageStatic` term is the entire point — and the layer now uses
   the same expression. A structurally-new pane additionally suppresses the layer's own entrance
   (`suppressEntrance`), so the picture does not slide in while the pane is clip-revealing around it.

**Open, in the order they matter:**

1. **The warm pass.** 10 captures cost **60.3 s** and produce a 3860 ms worst frame, once per page load
   (facts 28, 29, 31). Not tunable — the cost is DOM serialisation, so neither `pixelRatio` nor
   `skipFonts` touches it, and at ~6 s per capture nothing about *when* they run makes them fit in a
   ~2.4 s dwell. **The fix is to stop re-capturing per page load**: persist the PNGs server-side under
   their own (screen, pane, stage, content, viewport, dpr) key so a boot fetches ~200 KB and decodes in
   ~50 ms.
2. **A capture can be taken before the shrink search has settled.** `withOffscreenStage` waits a fixed
   ~1.6 s while the search is frame-sliced at one probe per frame and needs ~16 probes for below-floor
   content — on four cores mid-warm that is not always enough. A settled screencap of stage 11 shows the
   menu running off the bottom of its own pane, baked into the bitmap permanently. This is fact 21's
   trap 3 in a new form and is invisible to every frame metric. The warm must wait for the search to
   settle rather than for a duration.
3. **`SLIDE_BITMAP_AT_REST` freezes any captured pane**, and the content fingerprint is built from slot
   *config*. Transit departures change every 15 s under an unchanged fingerprint, so on `Ny test` this
   would show a frozen departure board. Restrict to config-derived kinds (catalogue, event-month) before
   this goes near a real screen.
4. **The warm passes are called with `screen` while the render uses `effectiveScreen`**
   (`ScreenDisplay.tsx:478` vs `:1218`). Identical with no draft, which is why nothing broke here; with a
   draft the warm would capture the published version and every lookup would miss.
5. **`Empty test` is deliberately left holding its catalogue**, not blanked, so arms L/M/N stay
   comparable. Restore with `emptytest-variant.mts blank` when done with it.

### 7.1 Code state as of this document

**Version 0.2.72**, working tree clean, everything below committed as of `35e5d38` (updated
2026-08-17 — items 6 and 7 are new since this section was last written):

1. **`useShrinkToFitFontScale` — seeded search + size-keyed scale cache.** Correct (verified against
   baseline: the overflow checker reports identical transients with and without it), −43% forced
   layouts, −22% measure time, no frame-cost regression. **It does not fix the stall.** Keep-or-revert
   is an open judgement call: it reduces continuous background CPU on a device that runs for weeks, at
   the cost of real complexity in a hook every pane depends on. Superseded as *the* stall fix by
   fact 12 (item 4 below); this remains as the seed source for A's search.

2. **QR codes — error-correction level H → M, plus rounded module corners.** New files
   `qrCodePath.ts` / `QrCodeSvg.tsx`; `QrCodeSlide` no longer uses `qrcode.react` (that library does
   not expose its module matrix); new dependency `qrcode-generator`. Measured **43% fewer modules**
   across the real codes on screen (9,732 → 5,508 total modules). **Now TV-verified (fact 10): as
   shipped it is a frame-cost no-op, because the rounding cancels the density win. Still not
   phone-scan-verified.**

3. **QR geometry — cross-mount memoisation.** `qrCodePath.ts`, behind `CACHE_QR_GEOMETRY`. See
   fact 16. **Shipped, on.** Independent of item 2 above — this caches the encode/rasterise result
   regardless of what level or corner radius produced it, so it applies unchanged to whichever way
   item 2 is eventually decided.

4. **`useShrinkToFitFontScale` — deferred, frame-sliced search + shared scale store.** Behind
   `ARM_A_DEFERRED_SEARCH` / `ARM_B_SHARED_SCALE_STORE`. See fact 12. **Shipped, both on.** This is
   the actual fix for §8 step 1 (the stall) — item 1 above is a seed source it consumes, not the fix
   itself.

5. **QR — fixed-size raster fitted by transform.** `QrCodeSlide.tsx`, behind `QR_FIXED_RASTER`, with
   the raster size derived per display by `rasterSizePx()`. See fact 17. **Shipped, on.** Independent
   of items 2 and 3: item 3 removes the *encode* cost at mount, this removes the *rasterisation* cost
   at resize, and both are independent of whatever level/corner radius item 2 settles on.

6. **Self-hosted Google Fonts.** See §5 fix 10. **Shipped, on** — not behind a flag, and not
   experimental. Note `public/fonts` is gitignored, so a fresh clone must run `npm run fonts:fetch`
   before the app renders with real fonts (and before any bitmap capture is meaningful).

7. **Catalogue-as-bitmap — EXPERIMENT, shipped OFF.** `src/features/screens/CatalogueBitmap.tsx` /
   `.scss` (capture, module-level `bitmapCache`, `fitIntoRaster`, `ensureFontEmbedCss`, `liveOnly`
   mode) plus `src/hooks/useRasterFitScale.ts` — the contain-fit `ResizeObserver` extracted from
   `QrCodeSlide`'s own private `useQrRasterScale` and now shared by both (QR passes a square raster).
   See facts 18–21. **Not shippable as it stands** because of fact 21's trap 4; see §8 step 9.

   Experiment flags, **all currently in their shipping state — never commit any as `Boolean(1)`, and
   never write one as a literal `true`** (§10):

   | flag | file | state |
   |---|---|---|
   | `CATALOGUE_AS_BITMAP` | `CatalogueSlide.tsx:24` | `Boolean(0)` |
   | `CATALOGUE_FIXED_LAYOUT_ONLY` | `CatalogueSlide.tsx:33` | `Boolean(0)` — only meaningful with the above on |
   | `ABLATE_MEASUREMENT` | `useShrinkToFitFontScale.ts:50` | `Boolean(0)` |
   | `REFLOW_HIDE_ENABLED` | `SplitLayout.tsx:89` | `Boolean(1)` — **pre-existing**, a motion fix from an earlier session, measured performance-neutral |

   **Full flag state as of v0.2.74** (verified in the tree, not from memory — see §10 on flag drift):

   | flag | file | state | why |
   |---|---|---|---|
   | `SUPPRESSED_SKIPS_LAYOUT` | `LayoutPane.tsx:50` | `Boolean(0)` | fact 22's win, **switched off for fact 31's arm** — the resting bitmap subsumes it (a bitmap-backed pane's subtree is out of layout at all times, not only while hidden). Restore it if the bitmap arm is turned off |
   | `BODY_ONLY_REFLOW` | `LayoutPane.tsx:73` | `Boolean(0)` | fact 24, appearance. Off for fact 31's arm; inert for a catalogue either way (no `data-slide-body`) |
   | `REFLOW_HIDE_ENABLED` | `SplitLayout.tsx:89` | `Boolean(0)` | off for fact 31's arm |
   | `BODY_REVEAL_ON_PANE_STILL` | `LayoutPane.tsx:288` | `Boolean(0)` | fact 30 — measured a no-op against the fixed timer |
   | `SLIDE_BITMAP_ENABLED` | `slideBitmapStore.ts:219` | `Boolean(1)` | fact 31 — on for the resting-bitmap arm |
   | `SLIDE_BITMAP_AT_REST` | `LayoutPane.tsx:335` | `Boolean(1)` | fact 31 — the bitmap is the resting representation, shrink hooks off beneath it |
   | `WARM_SHRINK_SCALES_ENABLED` | `warmShrinkScales.ts:51` | `Boolean(0)` | facts 27, 31 — 11 off-screen stage mounts per boot whose seed the catalogue search never probes |
   | `WARM_ONLY_REFLOWING_PANES` | `warmSlideBitmaps.ts:92` | `Boolean(1)` | fact 28 — a strict improvement whenever the bitmap is on, inert while it is off |
   | `TRUST_WARM_SCALE` | `useShrinkToFitFontScale.ts:106` | `Boolean(0)` | fact 23, measured flat twice; gates the probe counters |
   | `REFLOW_HIDE_THRESHOLD` | `SplitLayout.tsx:118` | `0.02` | fact 24 |

   Arm combinations: **bitmap** = `CATALOGUE_AS_BITMAP` on, `CATALOGUE_FIXED_LAYOUT_ONLY` off.
   **E3** (live DOM, pinned container) = both on.

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

### 2. Cross-mount memoisation for QR — **DONE 2026-08-17**

See fact 16. `Skjerm 1` whole-run: −37% worst / −35% debt. Isolated to the transition that actually
mounts a QR pane (`Ny test`, `3→4`): −36% worst / −12% debt, flat on the transition after — which is
the evidence the mechanism (fact 16's own trace of `SplitLayout.tsx`) is right: new content mounts
hidden, in the same commit as the geometry snap, one phase before it's ever revealed. That mount
timing is generic — any slide kind's own per-mount cost pays the same tax, not just QR's. Checked
against the other two candidates this session: catalogue's already has this exact fix
(`shrinkScaleStore`, step 1 below); news has no comparable expensive per-mount computation to cache.
The lever itself — cache or otherwise avoid whatever a slide does on mount, since mount always lands
on the transition's busiest commit — is worth checking against any *future* slide kind whose mount is
expensive, not just these three.

### 3. Fixed-raster + transform-scale for QR — **DONE 2026-08-17**

See fact 17. Debt over the resizing transitions **400 → 120 (−70%)**, landing at the no-QR floor.

### 4. Explore the same fixed-raster trick for the *other* pane contents — **catalogue MEASURED 2026-08-17**

**Status:** the catalogue half of this step is done and its result inverts what this step predicted.
See facts 18–21. A cached bitmap of a catalogue pane **reaches the empty-fixture floor** (worst 40 ms
/ debt 0 in all three phases) where the best live-DOM arm stops at 80 ms / 200 ms. The prediction
below that `CatalogueSlide` is a *wrong* candidate was right about **appearance** — fact 21's trap 4
is exactly the re-wrap objection, made concrete as fit scales down to 0.015 — and wrong about **cost**.
It also surfaced a second, non-shrink mechanism this step did not anticipate at all: `cqmin`
re-resolution through the animated container (fact 19). **`ImageSlide` and the embedded logos are
still unmeasured.** The open aspect-ratio problem is now step 9.

Fact 17's mechanism is not QR-specific. **Any** pane content re-rasterises when its box changes, and a
stage transition resizes many panes at once — so the same "lay it out at a fixed size, fit it with a
compositor transform" treatment is worth testing per slide kind. What makes QR the ideal first case
also tells you where this does and does not transfer:

- **Good candidates — appearance is scale-invariant.** A QR code, an image, a logo, a source mark all
  look *the same* at any size; only their pixel dimensions differ, so rasterising once and scaling is
  visually lossless (given the scale-down-only rule from fact 17). `ImageSlide` is the obvious next
  one to measure, and the embedded logos inside `TransitSlide`/`WeatherSlide`/`QrCodeSlide` after it.
- **Wrong candidates — content that must genuinely reflow.** `CatalogueSlide`, `TransitSlide`'s
  departure grid, `WeatherSlide`'s hour row, `EventMonthSlide`'s multi-column list and `NewsSlide`'s
  headline all *re-wrap* at a new size, and re-wrapping is the entire point of the shrink-to-fit
  system (fact 12). Scaling a rasterised text block instead would keep the old line breaks and defeat
  it. For these, the lever is the existing one — avoid re-measuring, not avoid re-laying-out.
- **Cheap way to find out where it is worth anything:** `Empty test` is now the instrument for this. It
  measures **exactly zero debt** on its own, so dropping a single pane of any one kind into it
  attributes that kind's own resize cost with no other noise, exactly as it did for QR here.

Worth doing before any of the motion-quality work below: if resize rasterisation is broadly expensive
across pane kinds, that changes the cost of *any* proposal that keeps content visible while a pane
resizes (see step 7).

### 5. Decide the QR corner radius, then phone-scan whatever ships

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

### 6. Settle the seeded-search change

Keep or revert (§7.1). Not a measurement question — it works, it just does not do the job it was
written for.

### 7. The 2-second safety poll — **largely closed by fact 8, keep only as CPU hygiene**

~57% of all shrink passes are `POLL_INTERVAL_MS = 2000` firing on unchanged panes, and raising it to
~10 s would cut those 5×. But V1a removed the poll *and* both observers outright and recovered **0% of
worst frame, ~16% of debt** — so the poll is a fraction of a fraction, and it is not a stall fix.

What remains is the original hygiene argument: fewer wakeups on a device that runs for weeks. That is
a product judgement about how fast the shrink self-corrects when the observers miss a change, not a
measurement question, and it should not be confused for performance work.

### 8. Only if steps 1–7 leave a real screen over budget: hide the stall behind a bitmap

Fully investigated and currently **shelved**, because fact 4 says a fix exists. If it is ever revived,
`document.startViewTransition` is the strongest option: it cleared both capability gates (fact 6),
needs no capture pipeline, no staleness handling, no delivery work, no decode cost and no APK rebuild.
Pre-captured stills are viable but pay the 545–598 ms decode (fact 7) and need per-stage delivery
(`buildNavigableSet` currently ships `previewImages[0]` only, at `'medium'`). Live capture is dead.

Note the cover would have to span `exiting → holding → idle` — roughly **0.9 s of frozen screen** on
every stage change, clock stopped and video paused — not the ~0.3 s the mount-only framing implied.

**Not to be confused with step 9.** This step is a *whole-screen* cover hiding the stall. Step 9 is a
*per-pane* raster that removes the cost rather than masking it, and it is measured to work
(facts 18–21). Nothing here is revived by that.

### 9. ~~Make the catalogue bitmap aspect-correct~~ — **CLOSED 2026-08-17, the whole direction is refuted**

**Solved and then obsoleted.** The aspect problem itself was solved: capturing per (pane, stage) at the
box the pane is about to occupy makes every bitmap 1:1, so nothing is ever fitted or letterboxed. But
with that built and working, fact 26 measures the approach as a **large net regression** (1840 ms
against 720 ms) for two reasons that no amount of aspect correctness addresses — the warm pass is
ruinous at this volume, and fact 22 had already removed the only cost a moving-frame bitmap could
reach. **Do not revive this without first re-reading fact 26.** The original text is kept below for the
reasoning it records.

#### Original framing (superseded)

Facts 18–21 leave one thing between the bitmap and shippability: **it is fitted, not re-wrapped**
(fact 21, trap 4), so a pane whose aspect differs from the captured raster's letterboxes at
correspondingly smaller type — down to a measured fit scale of **0.015** on `Empty test`'s most
extreme stage. Everything else about the arm is settled: it reaches the floor, and the user has
confirmed by eye that it does not stutter where E3 still does.

Directions, in rough order of promise. **Nothing here is measured yet.**

1. **Capture per aspect bucket.** Key `bitmapCache` on (content, aspect bucket) instead of
   (content, raster size), and capture one bitmap per aspect the screen's stages actually use.
   `computeLayoutGeometry` can enumerate every stage's rect for a pane up front, so the set is known
   and finite, and `warmShrinkScales.ts` (fact 12, arm B) already establishes the pattern of
   pre-rendering every stage off-screen at boot to fill a process-wide cache. Each stage's bitmap
   would then be correctly re-wrapped for its own shape. **Most promising.**
2. **Re-capture on aspect change, off the transition path.** Cheaper to build than (1) but pays a
   capture during `idle` — the same phase fact 12 relocated the shrink search into, which is not free.
3. **Accept letterboxing for panes near the raster's aspect, fall back to live DOM otherwise.** A
   hybrid; needs a threshold and doubles the code paths.

**Rejected as a direction:** freezing `cqmin` instead of rasterising at all (stop `--slide-*-size`
re-resolving for the ~300 ms the geometry glides, release on `idle`). It would keep live reflowing
DOM, real glyphs and the true pane shape with no aspect compromise, and on fact 19's mechanism it
should capture most of E3's win — but E3 *is* that ceiling, and the user has confirmed by eye that E3
still visibly stutters. Judged too demanding for the gain. Recorded so it is not re-proposed as new.

**Unmeasured / unfinished before any of this is quotable:**

- **The bitmap arm has not been re-measured since font embedding landed** (§5 fix 10). The
  40 ms / 20 ms figure predates it. Embedding is a one-time capture cost and should not move
  per-transition numbers, but that is an assumption, not a measurement.
- **The E3 arm has not been re-measured since `fitIntoRaster` landed**, and that changes the resolved
  type scale. Its 80 ms / 200 ms is not currently quotable.
- **No real-screen confirmation.** Everything in facts 18–21 is `Empty test`, which has 11 stages at
  extreme ratios and may amplify. Use **`Ny test`** (`screen-624ebb7c-…`, catalogue on `pane-1a58563b`
  at stage 3). A `ny-base.json` run was started and abandoned part-way — **treat that file as junk.**
- **Text legibility at kiosk distance has not been assessed** for a downscaled 960x540 raster. This is
  an eye judgement on the actual TV, not a measurement.

---

## 9. Tooling

**Current (regime C), in `QA/scratchpad/qa/`:**

| file | purpose |
|---|---|
| `frameSampler.mts` | the in-page rAF sampler + transition/identity sampler; `debtByPhase` lives here |
| `frame-collector.mts` | CORS-open sink on :4999; routes frame / capability / cover-probe payloads, and a `{ kind: 'debug' }` route for `bitmapProbe` |
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
| `split-warm-steady.mts` | splits one run file into its warm and steady halves at a given window index, and medians each. Necessary for any arm with a boot warm: a whole-run median mixes a 3920 ms warm frame with a flat steady state and reports neither (facts 26, 28) |
| `slideBitmapProbe.mts` + `tv-inject-slide-bitmap-probe.mts` | in-page probe for the **`SlideBitmapLayer`** pipeline — store size *and keys*, per-capture timings, and every mounted layer's own image state. Distinct from `bitmapProbe.mts`, which reads the older `CatalogueBitmap` DOM and reports `host: 'absent'` for a healthy run of this one. **Essential for any bitmap arm** (fact 21's traps) |
| `capture-cost-bench.mts` | decomposes one `html-to-image` capture against a live pane — `toSvg` vs `toBlob` (per-element vs per-pixel), `skipFonts` vs inlined woff2, `pixelRatio` 1 vs 2, and a bare div as the pipeline floor. Answers fact 29. **Needs a temporary `window.__qaH2I` hook in `warmSlideBitmaps.ts`** (`{ toBlob, toSvg, getFontEmbedCSS }`), since `html-to-image` is bundled and unreachable from an injected probe; the hook is deliberately not kept in the tree |
| `pane-backdrop-check.mts` | records, per animation frame, which element actually paints a pane's backdrop through a transition — every crossfade slot's computed background, effective opacity, transform, how much of it still falls inside the pane, and the inner element's own box. Written for "the background is the wrong colour / does not stretch", which no frame metric and no screencap can answer (a transition lasts ~0.7 s). It is what refuted fact 32 by showing the pane growing 478 → 618 px while the pinned content stayed at 478 |
| `body-still-check.mts` | the one question `body-split-check.mts` cannot answer: was a slide's body ever visible while its own pane box was actually **moving**? Samples box + *effective* visibility per animation frame and groups movement into episodes with the phase each started in. See fact 30 for why effective visibility needs three separate tests, and why reading the body's own computed opacity gives a wrong answer |
| `wait-frames.mts` | blocks until a run file holds N windows *from the current page load* — what to gate a run on rather than raw file length |
| `make-resize-screen.mts`, `make-extreme-screen.mts` | fixture builders |
| `emptytest-variant.mts` | swaps `Empty test`'s target pane between `blank` / `catalogue` / `cat-small` / `cat-mid` over the sync WebSocket — **no rebuild needed**, which makes content-size arms nearly free. `npx tsx QA/scratchpad/qa/emptytest-variant.mts blank` is what restores the fixture |
| `bitmapProbe.mts` + `tv-inject-bitmap-probe.mts` | in-page probe reporting capture status, fit scale, host box, bitmap dimensions, data-URL bytes and embedded-font-CSS bytes. **Essential for any bitmap arm** — fact 21's traps 3 and 4 make a failed, blank, truncated or letterboxed capture indistinguishable from a good one by frame numbers alone (it measures *better*) |

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

Verified against `server/data/admin-screens.json` on 2026-08-17.

| id | name | shape |
|---|---|---|
| ~~`1783715372380`~~ | ~~Screen 3 (verify)~~ | **GONE — no longer exists in the store** (verified 2026-08-17). This was *the shrink-cost fixture*, and facts 1, 2, 3, 8, 11, 12, 13 and 15 are all measured on it. Those numbers stand as history but **cannot be re-measured or extended without rebuilding the fixture**: 3 stages, 3 live panes + 3 orphans, 4 shrink-enabled (pane, stage) pairs — transit@1 and catalogue@3 x3 (fact 15). Nothing in the current store replaces it; `Ny test` is the closest. |
| `screen-8ec76ce7-…` | Skjerm 1 | 2 stages, 17 pane slots — news + qrcode + time, zero shrink-search kinds. **The QR/render fixture.** |
| `screen-624ebb7c-…` | Ny test | 4 stages, 6 panes — transit/weather/catalogue/image/news/qrcode, and it genuinely restructures its layout between stages. **The mixed-content fixture, and now the real-screen check for §8 step 9.** |
| `screen-4d546476-…` | Empty test | 11 stages of **pure geometry** — flat colour blocks being split, moved and resized. Measures **worst 20 ms / debt 0 ms** blank, so it is the zero-noise instrument for attributing any *single* pane kind's own cost (facts 17–21). **Currently NOT in its blank state** — `pane-165995c1-…` holds a `food-menu` catalogue from the fact 18 arms (verified 2026-08-17); restore with `emptytest-variant.mts blank`. Its other 8 slots are `image` panes with an empty `imageUrl`, i.e. flat colour. |
| `screen-extreme-anim-test` | EXTREME anim test | 9 stages, 38 pane slots (up to 25 live). Amplifier; not representative. |
| `screen-extreme-resize-test` | EXTREME 5×5 resize | 2 stages, 25 panes, pure resize. |
| `screen-7d782e64-…` | Testing some more | 3 stages, 3 panes. Not used by any measurement in this report. |
| `usage-test-panes-3` | [usage test] all panes (3) | 1 stage, 12 panes, no staging. Not used by any measurement in this report. |

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

**Added 2026-08-17 (later):**

- **A Playwright `addInitScript` given a *function* dies with `__name is not defined`.** `tsx`/esbuild
  wraps every inner function in its own name-preservation helper, which does not exist in the page, so
  the whole init script throws once and never runs. The failure is silent and the *result is green*: a
  checker whose sampler never ran reports zero samples and therefore zero violations. Pass
  `{ content: '<source string>' }` instead — the same reason the injected TV probes are template strings.
  Sanity-check the sample count of any in-page sampler before believing a pass.
- **A correctness checker can assert the wrong property and produce a confident wrong answer in either
  direction.** Fact 30's first run reported 1347 violations, 173/173 on a pane that is hidden throughout,
  because it read the body's own computed opacity while the actual hiding happens on an ancestor
  (`content-visibility: hidden`) or by translation (the `'slide'` style holds opacity 1 in every pose).
  §10's existing rule was "assert computed style, never class presence"; extend it to **assert the
  property that actually does the hiding, on the element that actually carries it.**
- **Flag state is part of an arm and drifts silently.** `useShrinkToFitFontScale.ts` was written at 17:08,
  after the 16:37 and 16:58 arms it was later compared against (fact 27). Record the mtime or the commit
  of every file whose flags an arm depends on, or re-run the baseline on the current tree — which is what
  arm L exists for.

**Added 2026-08-17:**

- **The collector's port 4999 must be verified free *and* the new collector verified started.** If the
  previous collector is still alive the new one dies with `EADDRINUSE` — and because the old one is
  still listening, the next arm's frames land in the **previous arm's file**. This happened and cost a
  run. Check `lsof -ti:4999` **after** starting, not just before.
- **A live collector rewrites its entire in-memory window array to its file on every POST.** Editing or
  splitting a run file while its collector still runs gets silently clobbered. Kill it first. Both this
  and the trap above are recoverable: `trimToLastLoad`'s own rule (`index` restarting marks a page
  load) lets a contaminated file be split back into its arms by hand.
- **`grep -c` exits non-zero when the count is 0**, which silently breaks `&&` chains — including the
  `grep -c qa-frame-sampler dist/index.html` build check above, whose *success* case is exactly the
  count being 0.
- **`adb exec-out screencap` frequently lands mid-transition**, where pane content is suppressed and
  the pane reads as blank — which looks exactly like a failed capture. Take a burst of 4–6 and pick a
  settled one; cross-check against `bitmapProbe` rather than trusting a single frame.
- **Never rebuild while a run is in progress.** The PWA's `registerType: 'autoUpdate'` service worker
  can reload the TV mid-run onto the new build. (Related to the arm-mixing trap above, but a separate
  cause with the same symptom.)

---

## 11. Editor / display parity — why what you author is not what the kiosk renders

Referenced from facts 31 and 33. **Nothing here is a performance finding**; it is recorded here because
every measurement in this report was taken on one of the two surfaces and is only valid for that one.

**Two independent causes. Fixing either alone leaves the other.**

### 11.1 The CSS pixel size differs, so every absolute length resolves to a different fraction of the screen

| surface | CSS viewport the slide tree lays out at |
|---|---|
| TV (`MiTV_AZFU0`, this fleet) | **960x540** at `devicePixelRatio` 2 (§1) |
| Dashboard preview / `ScreenCard` | **fixed 1920** long side (`REFERENCE_LONG_SIDE`, `screenPreviewGeometry.ts`), then transform-scaled down by `ScaledScreenPreview` |
| Fullscreen in-place editor (`/screens/editor/:id`) | **whatever the browser window is** — `ScreenDisplay.tsx` renders `SplitLayout` raw, with no reference size and no aspect lock |

Anything sized in `cqmin` is proportional and transfers exactly. Anything absolute does not, and is
**relatively twice as large on the TV** as at 1920:

- `CatalogueSlide`'s `minmax(max(160px, 14ch), 1fr)` — 160px is 16.7% of 960 but 8.3% of 1920, so the TV
  fits fewer columns, the content is taller, and the shrink search resolves a much lower scale.
- `EventMonthSlide`'s `column-width: max(320px, 26ch)` — same mechanism.
- `padding: var(--pane-padding, 2em)` and the `$spacing-unit`-based paddings — an explicit
  `--pane-padding` is `cqmin` and transfers; the **defaults** do not.
- Downstream of the scale: `gap: calc(0.75em * var(--fit-gap-scale, 1))` with `--fit-gap-scale = scale²`.
  At a resolved 0.28 that is x0.078 — spacing effectively vanishes. This is the "TV is missing padding
  that the editor shows" report, and it is a *consequence* of the size difference, not a separate bug.

This is already why `warmShrinkScales` renders at the live viewport rather than `referenceCanvasSize`,
and why `shrinkScaleStore`'s doc comment names those two px floors as the only reason its aspect-only key
is not perfectly scale-invariant.

### 11.2 The TV has no `subgrid`, so it renders a different code path entirely

Fact 33. `subgrid` shipped in Chromium 117; the TV is 116. Every `grid-template-columns: subgrid` in
`WeatherSlide.scss`/`TransitSlide.scss` is dropped at parse time and the `@supports not (subgrid)` block
at the bottom of each file is what actually renders on device. **A desktop browser verifies the subgrid
path — which the kiosk never runs.** The fallbacks are not automatically equivalent: the weather one used
`auto` tracks and did not align rows at all, against its own comment predicting it would.

### 11.3 Options, with what each actually costs

1. **Size-lock the editor to the target's CSS viewport.** Render `SplitLayout` at exactly the display's
   own CSS px (960x540 here) inside a wrapper that `transform: scale()`s it to fill the window —
   `ScaledScreenPreview`'s trick, with the reference size coming from the target device instead of a
   fixed 1920, and the scale allowed above 1. Verified as compatible with editing: `SplitLayoutDivider`
   and `PaneCornerHandle` both compute `(clientX - rect.left) / rect.width`, and pointer coords and
   `getBoundingClientRect` are both post-transform, so drag ratios are scale-invariant; `containerSize`
   comes from `ResizeObserver`'s pre-transform `contentRect`, which is what `FlatPaneLayer`'s percentage
   maths wants. Two known snags: `CLICK_MOVE_THRESHOLD` compares raw pixel distance and needs dividing by
   the scale, and the in-pane controls (`PaneEditButton`, `PaneSplitZones`, corner handles) render inside
   the scaled subtree and come out oversized at >1. **Does not fix 11.2.**
2. **Purge absolute px from slide layout CSS** (the two column floors, the `$spacing-unit`/`2em`
   paddings). Deepest fix: any viewport then previews any other faithfully with no emulation and no
   per-machine data, warming at 1920 becomes valid, and a resolved scale transfers across displays.
   Costs a visual migration of existing screens — column counts will change — so it needs eyes on the
   actual TV. **Does not fix 11.2.**
3. **Remove `subgrid`, or prove the fallbacks are pixel-equivalent.** Required for 11.2 regardless of
   which of the above is chosen. Removing it is the smaller ongoing burden than maintaining two layout
   paths of which only one is ever shipped.

### 11.4 Where a target viewport would come from

Nothing stores it. `previewAspectRatio` is a ratio only, and the size is not a constant across the fleet
(this stick is 960x540 at dpr 2; a browser on a 1080p monitor is 1920x1080 at dpr 1). Either the
companion reports `innerWidth`/`innerHeight`/`devicePixelRatio` in its pairing/heartbeat and the display
manager stores it per machine (accurate by construction, needs a companion change), or a per-screen
"target viewport" field defaulted to today's behaviour (cheap, no companion change).

### 11.5 The related idea fact 31 points at

Once a display knows its own viewport, it is also the only thing that knows its own resolved scales. A
**server-persisted scale cache** keyed by (screen, pane, stage, aspect, content fingerprint, viewport,
dpr), written by whichever display resolved it and served with the screen config, removes
`warmShrinkScales`' off-screen mounts entirely and makes cold boots start warm — with no fidelity
assumption, because the values come from a device with the right viewport. Four bytes per entry. The same
shape extends to bitmaps, but those are viewport- and dpr-specific megabytes, so scales first.
