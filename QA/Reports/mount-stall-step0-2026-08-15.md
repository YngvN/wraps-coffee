# Mount stall — Step 0, P1, P2 and the V3 ablation

**Date:** 2026-08-15
**Plan:** `~/.claude/plans/fluffy-moseying-quill.md`
**Predecessor:** [geometry-pane-model-2026-08-15.md](./geometry-pane-model-2026-08-15.md)
**Device:** Xiaomi Mi TV Stick `MiTV_AZFU0`, Android 14, WebView **116.0.5845.195**, 4 cores,
display override 1920×1080 on a 3840×2160 panel, WebView viewport 960×540 @ DPR 2, 50 Hz.

---

## Headline

**Real screens stall, so the effort is justified** — but three of the assumptions the work was going to
be built on turned out to be wrong, and one of them was mine.

1. **Real cafe screens do stall.** `Screen 3 (verify)` — 6 panes, not a synthetic fixture — costs
   **240–400 ms worst frames** on the kiosk. The kill threshold was 60 ms.
2. **The cost is not one commit, it is three.** The predecessor report found 13 of 21 worst frames in
   `'holding'` and concluded "the mount is the whole cost". On a real screen only 5 of 23 land there;
   **12 land in `'exiting'` and 6 in `'idle'`**.
3. **There are two independent cost centres**, and no single lever covers both.
4. **The `trackShrink` own-goal hypothesis is refuted.** I stated it confidently before measuring. The
   gate is a substantial net *win*; reverting it makes dense transitions 50–70% worse.
5. **Path C is dead** on a desktop measurement alone. **Paths B and A-web both cleared their kill
   tests** — a painted cover layer holds perfectly through a 10 s main-thread block, and a fade that
   is *already running* completes through one.
6. **Path A is weakened by its own bonus measurement:** 545–598 ms to decode one 1920×1080 still on
   this hardware — comparable to the stall itself. B needs no bitmap and pays none of that.
7. **…and then the ablations made the whole question moot.** The static-content floor is ~0, and on a
   real screen **disabling shrink-to-fit alone removes 85–89% of the stall**. There is no irreducible
   cost to hide, so **the bitmap direction should be shelved and the shrink-to-fit search fixed
   instead.** The single most useful sentence in this report is that one.

---

## What was measured

| test | status | outcome |
|---|---|---|
| **Step 0** — does a real screen stall? | ✅ complete | Yes, badly. Effort justified. |
| **Step 0** — re-baseline EXTREME at HEAD | ✅ complete | Unchanged. `bca7337` confound closed. |
| **P1** — WebView capability | ✅ complete | Chrome 116 → View Transitions **yes**, LoAF **no**. |
| **V3** — `trackShrink` gate ablation | ✅ complete | Hypothesis refuted; gate is a net win. |
| **C-t1** — `html-to-image` cost | ✅ complete (desktop) | **Kills path C.** |
| **P2** — cover-layer survives a stall | ✅ complete | **Passes, both questions.** A-web and B cleared. |
| **A-t1** — full-screen decode cost | ✅ complete (bonus, on device) | **545–598 ms.** Serious constraint on path A. |
| **V5** — static-content floor | ✅ complete | **The floor is ~0.** Fires the "a fix exists" branch. |
| **V1** — shrink-to-fit disabled | ✅ complete (thin on Skjerm 1) | **−85% on a real screen.** The single biggest lever found. |
| **VQR** — QR rasterisation removed | ✅ complete | −38% worst frame on the QR-heavy screen. |

---

## Step 0 — the problem is real

Method: the existing in-page rAF sampler injected into `dist/index.html`, POSTing per-transition
windows to the local collector — the same instrument on desktop and TV, no `gfxinfo`, no CDP.
Medians over 5–9 samples per transition.

### The metric changed, and it had to

`worstMs` alone cannot resolve the effects here — the predecessor report says as much
("the run-to-run spread is wider than the difference between the two columns"). Added to
`FrameWindow`: **`debtByPhase`**, the total time over the 20 ms budget summed *per contentPhase*.
A sum is far more stable than a single maximum, and the per-phase split is what produced finding 2.

I initially scoped it to `'holding'` only, on the predecessor report's premise. The first TV run
disproved that premise, so it was widened to all phases — the holding-only version would have been
blind to most of the cost it existed to measure.

### `Screen 3 (verify)` — 6 panes, a real screen

| transition | destination stage | med worst | med holding debt | worst frame lands in |
|---|---|---|---|---|
| 1 → 2 | 1 event + 5 empty | 240 ms | 40 ms | **exiting 8/8** |
| 2 → 3 | 6 catalogue | 400 ms | 360 ms | holding 5/8, idle 3/8 |
| 3 → 1 | 4 transit + 2 image | 360 ms | 200 ms | **exiting 4/7, idle 3/7** |

### `Skjerm 1` — 17 panes, zero shrink-search kinds

| transition | med worst | med holding debt | worst frame lands in |
|---|---|---|---|
| 1 → 2 | 340 ms | 440 ms | **holding 9/9** |
| 2 → 1 | 340 ms | 420 ms | **holding 7/7** |

### `EXTREME anim test` — re-baselined at HEAD

| transition | panes in destination | med worst | med holding debt | worst phase |
|---|---|---|---|---|
| 4 → 5 | 9 | 860 ms | 1040 ms | holding 6/6 |
| 5 → 6 | **25** | **1580 ms** | 1740 ms | holding 5/5 |
| **6 → 7** | **1** | **1260 ms** | 140 ms | **exiting 5/5** |
| others (0–2 panes) | 0–2 | 40–160 ms | 20–320 ms | mixed |

**The `bca7337` confound is closed.** Old baseline was 920 / 1640 ms for 4→5 / 5→6; at HEAD it is
860 / 1580 ms — unchanged within spread. The predecessor report's headline numbers still describe
current code, and the data-polling commit did not move them.

---

## Two cost centres, not one

`Skjerm 1` has **zero** shrink-to-fit-search panes (news / qrcode / time only) and its entire cost sits
in `'holding'`. `Screen 3`'s light transitions have almost no `'holding'` cost and pay at the
`'exiting'` / `'idle'` boundaries instead. These cannot be the same phenomenon.

The cleanest separation is EXTREME `6 → 7`: it mounts **one** pane and costs **1260 ms**, entirely in
`'exiting'`. There is no mount to attribute that to — what is alive at that boundary is the *outgoing*
stage's 25 panes.

| | mounting 25 panes (5→6) | crossing a boundary with 25 panes alive (6→7) |
|---|---|---|
| cost | 1580 ms | 1260 ms |

**Consequences.** A shrink-to-fit fix does nothing for `Skjerm 1`. A bitmap scoped to `'holding'` does
nothing for `Screen 3`'s light transitions. And any cover has to span the whole
`exiting → holding → idle` sequence — roughly **0.9 s of frozen still**, not the ~0.3 s the
holding-only framing implied. That is a materially bigger ask of paths A and B than the plan assumed,
and it should be settled before B is spiked.

---

## V3 — the `trackShrink` hypothesis, refuted

**What I claimed before measuring:** `measureAndScale()` sits above the `trackResize` guard at
[useShrinkToFitFontScale.ts:154](../../src/hooks/useShrinkToFitFontScale.ts#L154), and `trackShrink`
([LayoutPane.tsx:372](../../src/features/screens/LayoutPane.tsx#L372)) is in the effect's dep array —
so each phase flip re-runs a full binary search on every shrink-enabled pane in one commit. With the
worst frames concentrating at exactly those two boundaries, I called it an own goal and promoted the
ablation ahead of P2.

**What the ablation says.** One-line patch, `trackShrink = true`, built and run identically:

| transition | V0 holding debt | V3 holding debt | V0 worst | V3 worst |
|---|---|---|---|---|
| EXTREME 4→5 (9 panes) | 1040 ms | **1760 ms** | 860 ms | 1040 ms |
| EXTREME 5→6 (25 panes) | 1740 ms | **2620 ms** | 1580 ms | 1740 ms |
| EXTREME 6→7 (exiting case) | 140 ms | 180 ms | 1260 ms | **1040 ms** |
| Screen 3 2→3 | 360 ms | **~640 ms** | 400 ms | ~380 ms |
| Screen 3 3→1 | 200 ms | **~520 ms** | 360 ms | ~550 ms |

The gate is a **clear net win**. Removing it makes the mount-heavy transitions 50–70% worse, because
every pane's `ResizeObserver` then fires on every tick of the geometry animation — precisely what the
gate was built to prevent.

The mechanism I described is real but small: the boundary re-run costs about **220 ms** of `6→7`'s
1260 ms (the only place V3 helped). That is ~17%, bought at the price of a 50–70% regression
elsewhere. **The plan's "revert the gate" decision branch does not fire.** The remaining ~1040 ms at
that boundary is ordinary React re-render, style recalc and exit animation across 25 panes — which
points at the plan's V5 "floor" ablation being the important one.

---

## P1 — WebView capability

Confirmed two ways: `dumpsys package com.android.webview` and the in-page probe.

| | TV (WebView 116) | Desktop (Chromium 151) |
|---|---|---|
| `document.startViewTransition` (needs 111) | ✅ | ✅ |
| `long-animation-frame` / LoAF (needs 123) | ❌ | ✅ |

- **Path B cleared its cheapest kill test** with 5 versions to spare.
- **No free on-device attribution.** LoAF would have replaced most of the plan's Step 1a counter
  patch; it is unavailable, so that hand-written patch is now mandatory rather than optional.
- Useful for A/B/C sizing: the WebView backing store is **1920×1080**, not the panel's 3840×2160
  (`wm size` reports `Physical 3840x2160 / Override 1920x1080`). A cover bitmap only ever needs to be
  1920×1080; generating at panel resolution would inflate decode cost and the A-t2 memory figure 4×.

---

## C-t1 — path C is dead

`html-to-image`'s `toBlob`, the same call [screenPreviewCapture.ts:83](../../src/features/screens/screenPreviewCapture.ts#L83)
makes, against a live kiosk render. Median of 5, **desktop** (10 cores):

| target | size | median |
|---|---|---|
| full screen root | 1920×1080 | **250 ms** |
| single pane | 958×538 | 10 ms |

The kill criterion was 200 ms *on the TV*. Desktop already exceeds it by 25%, and the TV runs
5–10× slower on every other measurement here — putting a live full-screen capture at roughly
**1.2–2.5 s, longer than the stall it would hide**. The plan permitted a desktop-only kill in exactly
this case. `html-to-image` serialises the DOM into an SVG `foreignObject` and rasterises it through an
`<img>`; there is no cheaper variant to fall back to, so this is final rather than a tuning problem.

Worth recording: a single pane is 10 ms against 250 ms for the root — capture cost is strongly
superlinear in area/complexity, so per-pane capture is ~5× cheaper in total than one root capture.
Not enough to save C, but relevant if path A ever revisits per-pane stills.

---

## P2 — the cover layer holds, and a running fade even advances

**The test.** Every in-page bitmap path (A-web, B, C) assumes a painted layer stays on screen while
the WebView's main thread is blocked. If it does not, all of them die in their in-page form and only
the native-overlay variant survives.

**Instrument.** The plan specified filming the panel with a phone, since `rAF` is blocked during the
interval being measured. `adb exec-out screencap` is strictly better: it reads SurfaceFlinger's
composited output from outside the WebView process, so it works through the block, needs no human, and
gives exact pixel values. A full-screen magenta→cyan gradient is the cover, so partial paint or tearing
would show as a broken gradient rather than an ambiguous colour shift, and the pure-overlay mean is a
known constant — **RGB (128, 115, 228)**.

### Question 1 (required) — does an already-painted layer survive? **Yes.**

Cover shown at full opacity, allowed to paint and settle 1.5 s, *then* the main thread blocked for a
measured 10 000 ms. Eleven consecutive screencaps fall inside the block:

```
t=20082ms  cover=100.0%  rgb=128,115,228
t=21043ms  cover=100.0%  rgb=128,115,228
   … 9 more, identical …
t=29339ms  cover=100.0%  rgb=128,115,228
```

**Byte-identical across every sample.** No blanking, no white flash, no tearing, no partial
composite. The layer is held by the compositor entirely independently of the stalled main thread.

### Question 2 (bonus) — does a *running* animation keep advancing? **Yes.**

Fade started, allowed a 2 s lead-in so the transition was committed and visibly progressing, then the
same 10 000 ms block. Samples taken during the block:

```
t=21729ms  cover= 33.6%  rgb=104, 84,119
t=23051ms  cover= 63.2%  rgb=109, 90,142
t=24361ms  cover= 82.7%  rgb=114, 96,164
t=25651ms  cover= 99.2%  rgb=119,103,186
t=26926ms  cover=100.0%  rgb=123,109,208
t=28203ms  cover=100.0%  rgb=128,115,228   <- fade complete, main thread still blocked
```

The blue channel climbs 119 → 142 → 164 → 186 → 208 → 228 in near-perfect linear steps and the fade
**runs to completion while the main thread is blocked**. The CSS opacity transition is genuinely
compositor-driven here.

### Question 3, which the first run answered by accident — arming order matters

The first attempt set `opacity = '1'` and blocked *in the same task*. Coverage stayed at 0% for the
whole block, and the fade only began once the block released. The style change is committed at the
next rendering opportunity, which a blocked main thread never reaches — **a crossfade armed
immediately before a stall never starts at all.**

That is a real design constraint, not a probe artifact:

> The cover must be painted, and any crossfade must already be running, **at least one rendering
> opportunity before** the stalling work begins. Given that, both survive the stall intact.

### Bonus: A-t1 decode cost, measured on device

The probe reports its own `img.decode()` for the 1920×1080 PNG across three runs: **575.6 ms,
545.2 ms, 598.2 ms.** (Includes fetching the file over WiFi from the Mac, so treat it as an upper
bound on decode alone — but the cover has to arrive somehow either way.)

This is a serious constraint on path A: **decoding a single full-screen still costs about as much as
the stall it is meant to hide.** Path A is only viable if stills are decoded and retained *ahead of
time*, never on the transition itself — which puts real weight on the plan's A-t2 memory test, since
holding a pre-decoded set resident is now mandatory rather than an optimisation.

Note the WebView backing store is 1920×1080, not the panel's 3840×2160 (`wm size` reports
`Physical 3840x2160 / Override 1920x1080`), so this is the right size to measure; generating at panel
resolution would have inflated it ~4×.

---

## The ablation ladder — and the conclusion that overturns the whole approach

Run after P2, on the same instrument. Each is a temporary source patch, reverted immediately.

### V5 — the static-content floor

Every slide kind replaced by one trivial static block at identical pane geometry, so what remains is
React reconciliation plus style/layout/paint of the pane boxes themselves.

| fixture / transition | baseline worst | **V5 worst** | baseline total debt | **V5 total debt** |
|---|---|---|---|---|
| **Screen 3** — all three transitions | 240–400 ms | **20 ms** | ~600 ms | **0 ms** |
| Skjerm 1 | ~350 ms | 80 ms | ~735 ms | 270 ms |
| EXTREME 4→5 (9 panes) | 860 ms | 80 ms | ~1040 ms | 80 ms |
| EXTREME 5→6 (25 panes) | 1580 ms | 220 ms | ~1740 ms | 320 ms |
| EXTREME 6→7 (the exiting case) | 1260 ms | 100 ms | — | 140 ms |

**The plan's decision gate said: floor ≥ 60% of the debt → no app-level fix exists, a cover is the
only answer. The floor is 0–14%.** On the real cafe screen it is *exactly zero* — no frame over
budget at all. Everything the geometry model was ever suspected of costs nothing.

This also resolves `6→7`'s unexplained ~1040 ms: it was never the phase machine, the unmount, or
React. It was 25 panes' worth of slide content re-rendering at the boundary.

### V1 — shrink-to-fit fully disabled

Both shrink hooks forced off; real slide content otherwise untouched.

| | baseline worst | **V1 worst** | baseline total debt | **V1 total debt** |
|---|---|---|---|---|
| Screen 3 1→2 | 240 ms | **40 ms** | ~230 ms | **40 ms** |
| Screen 3 2→3 | 400 ms | **60 ms** | ~780 ms | **100 ms** |
| Screen 3 3→1 | 360 ms | **40 ms** | ~900 ms | **100 ms** |
| Skjerm 1 (n=3 only — see caveat) | ~350 ms | 220 ms | ~735 ms | ~760 ms |

**On `Screen 3`, removing shrink-to-fit alone recovers 85–89% — nearly all the way to V5's floor.**

**This corrects the natural reading of V5.** V5 looked like "slide content is the whole cost", but a
static `<div>` also fits trivially, so `fitsAt(1)` returns true immediately and V5 silently removes
the binary search too. V1 separates them, and on a search-kind screen the dominant cost is the
**shrink-to-fit measurement of the content, not the content's own rendering.**

`Screen 3` is 4 transit + 6 catalogue + 1 event — every one of them a
`useShrinkToFitFontScale` kind. Those panes overflow, so each runs the full 8-iteration binary search,
each iteration a forced synchronous layout, times every pane, inside one commit.

**Caveat:** the Skjerm 1 V1 figure rests on **3 windows**, because the TV dropped off adb during the
re-run. It is consistent with the mechanism — Skjerm 1 has *zero* font-scale panes (news/qrcode/time
all use the transform-based hook) so V1 should do nothing there — but treat it as indicative only.

### VQR — QR rasterisation removed

`QRCodeSVG` replaced by a plain block. Same sampler, back-to-back runs on Skjerm 1:

| Skjerm 1 | worst (med) | exiting | holding | idle | total debt |
|---|---|---|---|---|---|
| baseline | ~355 ms | ~90 | ~425 | ~220 | **~735 ms** |
| QR removed | **~200 ms** | ~60 | ~360 | **~80** | **~500 ms** |

**Worst frame −44%, total debt −32%**, from one slide kind's rasterisation.

### The two cost centres, now precisely named

| screen type | dominant cost | evidence | fix |
|---|---|---|---|
| transit / weather / catalogue / event-month (`Screen 3`) | **the shrink-to-fit font binary search** | V1 −85–89% | cache or seed the search; batch the forced layouts |
| qrcode / news / time (`Skjerm 1`) | **slide component rendering, chiefly QR SVG rasterisation** | V1 no effect; VQR −32% | memoise QR output; check news image decode |

---

## Where this leaves the plan

**Do not build a cover.** A, B and C were all premised on an irreducible rendering cost worth hiding.
V5 shows there isn't one, and V1 shows that on the screen that actually prompted this, a single
subsystem accounts for ~85% of the stall.

| path | status |
|---|---|
| **Fix rather than hide** | **This is the answer.** V1 recovers 85–89% on a real screen from one change. |
| **C — live capture** | **Dead** (250 ms root capture on desktop alone). |
| **A — pre-captured stills** | **Shelve.** Cleared P2, but pays 545–598 ms decode per still and needs a whole delivery/staleness/memory design — to hide a cost that is now known to be removable. |
| **B — `startViewTransition`** | **Shelve, but keep on file.** Cleared P1 and P2 cleanly and costs nothing to hold in reserve. Worth revisiting only if the fixes below plateau above budget. |

**Recommended, in order:**

1. **Fix the shrink-to-fit font search.** Biggest single lever (−85% on `Screen 3`). Two candidate
   designs, and the choice needs one more measurement — the invocations × iterations counter from the
   plan's Step 1a, which was never run because V1 answered the bigger question first:
   - if most panes take the `fitsAt(1)` fast path, the cost is *N panes × 1 forced layout* and the fix
     is **batching** (read-all-then-write-all across panes, instead of interleaving per pane);
   - if panes routinely run the full 8 iterations, the fix is **seeding the search from the pane's
     last-known scale**, which should converge in 1–2 iterations for a pane whose size barely changed.
   Both are local to `useShrinkToFitFontScale`; neither touches the geometry model.
2. **Memoise QR rendering** ([QrCodeSlide.tsx](../../src/features/screens/QrCodeSlide.tsx)) — −32% on
   `Skjerm 1`, and unaffected by (1), so the two are additive on mixed screens.
3. **Re-measure both fixes against this report's baselines** on all three fixtures before deciding
   whether anything further is needed.
4. **Only if a real screen is still over budget after 1–3**, revisit B — carrying the P2 design
   constraint that whatever covers the stall must be painted, and any animation already running, one
   rendering opportunity *before* the stalling commit.

**The ~0.9 s cover-duration question is now moot** unless step 4 is ever reached.

---

## The attempted fix — and why it did not work (2026-08-16)

Following the recommendation above, the shrink-to-fit search was optimised and verified on the TV.
**It reduced the measured work substantially and did not improve the stall at all.** Recording this in
full, because the null result is more informative than the optimisation.

### What was built

`useShrinkToFitFontScale` now (a) seeds its search from the pane's last resolved scale, re-confirming
it in three probes instead of rediscovering it in nine, and (b) remembers resolved scales keyed by box
size, so a pane returning to a shape it has held before starts from the right answer. Convergence is
now a tolerance (`SCALE_TOLERANCE`, identical precision to the old fixed 8 iterations) rather than a
fixed count.

Desktop, `Screen 3`, 40 s:

| | before | after |
|---|---|---|
| forced layouts (font hook) | 756 | **~434** (−43%) |
| time in measure | 1075 ms | **841 ms** (−22%) |
| passes taking the cheap path | 0% | **67%** |

### What it did to the stall: nothing

| Screen 3 | baseline worst | seeded | size-cache |
|---|---|---|---|
| 1→2 | 240 ms | 280 ms | 240 ms |
| 2→3 | 400 ms | 400 ms | 360 ms |
| 3→1 | 360 ms | 300 ms | 380 ms |

EXTREME likewise: every transition within ±13%, including `5→6` (1580 → 1560 ms) and `6→7`
(1260 → 1280 ms). Two separate optimisations, two null results.

### Why — measured, not guessed

The desktop by-phase counters already contained the answer and it was missed at first: forced layouts
during `'holding'` went **167 → 166**. Every saving landed in `'idle'` and `'exiting'` — the safety
poll firing on panes whose box had not changed. The transition itself was untouched.

Instrumenting the size-cache confirmed the mechanism. During `'holding'` the cache *hits* 74% of the
time (only 3 distinct size keys exist), yet those passes still cost **7.5 forced layouts each**:

```
idle      passes=60  cacheHits=59 (98%)   forced=287   463ms
exiting   passes=20  cacheHits=20 (100%)  forced= 60    68ms
holding   passes=19  cacheHits=14 (74%)   forced=143   392ms
```

**A cache hit is not a cheap pass.** The key is the pane's *size*, but at a stage change its *content*
is different — so the remembered scale no longer fits, the three-probe confirm fails, and the full
search runs regardless. Seeding can only help when the answer is unchanged, which is precisely not
the case at a transition.

### The contradiction this leaves, and the experiment that resolves it

V1 — disabling both hooks outright — removed **85%** of `Screen 3`'s stall. Making the search 43%
cheaper removed **0%**. Those cannot both be about probe count, so V1 must have removed something
else. It disabled three things at once:

1. the search itself,
2. the `ResizeObserver` / `MutationObserver` / poll (all skipped under `enabled: false`),
3. the CSS custom-property writes — each of which invalidates style for the pane's whole subtree.

**Next experiment: bisect V1.** One variant keeping the measurement but dropping the observers, one
keeping the observers but making `measureAndScale` a no-op. Whichever recovers V1's win is the real
cost. Until that runs, *why* shrink-to-fit is expensive is unknown — only *that* it is.

### Status of the change

Kept in the working tree, uncommitted, at **0.2.66**. It is correct (verified against baseline: the
overflow checker reports the identical 15 transients on `Screen 3` and 12 on `EXTREME` with and
without it), it is a real reduction in continuous background CPU on a device that runs for weeks, and
it causes no frame-cost regression. **But it does not do the job it was written for**, and it adds
genuine complexity to a hook every pane depends on. Keeping or reverting it is a judgement call, not
a measurement.

---

## Reproducing

```bash
npm run build && npm run preview

# desktop baseline (any fixture)
QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/extreme-audit.mts 1783715372380 95000

# desktop C-t1
QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/desktop-capture-cost.mts

# TV — needs adb; mDNS auto-discovers after a prior pair, else `adb connect 192.168.0.33:5555`
npx tsx QA/scratchpad/qa/frame-collector.mts QA/scratchpad/qa/tv-out.json &
npx tsx QA/scratchpad/qa/tv-inject-sampler.mts http://192.168.0.213:4999   # sampler + P1 probe
npx tsx QA/scratchpad/qa/tv-set-screen.mts 1783715372380
adb shell am force-stop no.adhdisplay.companion && adb shell monkey -p no.adhdisplay.companion -c android.intent.category.LAUNCHER 1

# TV — P2 (injects itself, restarts the app, samples via screencap). Rebuild between modes.
npx tsx QA/scratchpad/qa/frame-collector.mts QA/scratchpad/qa/tv-p2.json &   # needed, or the probe's own report is lost
npx tsx QA/scratchpad/qa/tv-cover-probe.mts http://192.168.0.213:4999 hold   # required question
npx tsx QA/scratchpad/qa/tv-cover-probe.mts http://192.168.0.213:4999 fade   # bonus question
```

**adb note:** after a prior pair the TV normally re-appears over mDNS on its own. When it has slept,
the `_adb-tls-connect._tcp` service can disappear while the legacy port still works —
`adb connect 192.168.0.33:5555` recovers it. That can leave *two* transports for the same device, at
which point every `adb` call fails as ambiguous; `adb disconnect 192.168.0.33:5555` drops the
duplicate.

**State:** app source (`src/`, `server/`) is clean — every ablation patch (V1, V3, V5, VQR) is
reverted and `dist/` is rebuilt without any injection. All new/changed files are under
`QA/scratchpad/qa/`. Raw data in `QA/scratchpad/qa/tv-step0-*.json`, `tv-v1-*.json`, `tv-v3-*.json`,
`tv-v5-*.json`, `tv-vqr-*.json`, `tv-p2-*.json`.

**Writing an ablation patch:** use `Boolean(1)` rather than a literal `true` for an ablation flag.
A literal makes the original body unreachable, and TypeScript does not narrow discriminated unions in
unreachable code — so the untouched code below fails to typecheck and the build silently falls back to
the previous `dist`, measuring the wrong thing. That happened once here and produced a full run of
data that was actually the baseline.
