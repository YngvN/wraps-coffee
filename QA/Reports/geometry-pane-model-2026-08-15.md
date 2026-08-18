# Geometry-driven pane layout — before/after

**Date:** 2026-08-15
**Plan:** `~/.claude/plans/when-a-screen-has-fuzzy-phoenix.md`
**Flag as shipped:** `ENABLE_FLAT_PANE_LAYOUT = false` — see [Verdict](#verdict).

---

## Headline

The refactor works and does what the plan said it would: pane DOM identity now survives a
restructure, and every transition that previously snapped now animates, with no per-shape special
cases. Both are verified on desktop.

**But the kiosk performance gate is unverified**, and that is why the flag ships off. The Android TV
numbers that cleared Phase 0 were taken against a build whose resize animation I later found to be
**partly inert** — clip-and-reveal cannot depict a *shrinking* pane at all (see
[The clip-and-reveal defect](#the-clip-and-reveal-defect)). Fixing it replaced the cheap mechanism
with real `left/top/width/height` animation for resizes, which is the expensive path the plan was
trying to avoid. The TV became unavailable before I could re-measure the corrected build. So the
numbers that said "this is affordable on the kiosk" describe code that no longer exists.

Per the standing instruction — if the numbers are ambiguous, ship it off and say the gate is
unverified — that is what I have done.

---

## What changed

Landed and **active regardless of the flag**:

| Change | File |
|---|---|
| Shrink-to-fit `ResizeObserver`s gated on `contentPhase === 'idle'` (plan opt. 3) | `LayoutPane.tsx` |
| `PANE_GROWTH_DURATION_SECONDS` 0.5s → 0.3s (plan opt. 5) | `paneGrowthMotion.ts` |
| Skip animating a divider that moves < 2% of the screen (plan opt. 5) | `SplitLayout.tsx`, `LayoutTree.tsx` |
| `data-content-phase` / `data-stage` on `.split-layout`, for the QA samplers | `SplitLayout.tsx` |
| **Gap-accumulation fix** — grid tracks now take their share of `100% − gap` (`gapAwareTracks`), and the border line sits on the corrected track edge | `screenLayout.ts`, `LayoutTree.tsx`, `SplitBorderLine.tsx` |

### The gap-accumulation bug

Found by inspection after the fact, in the **nested (shipping) path** — not introduced by this work,
and not something the plan's own metrics would ever have caught, since they only measured movement
*during* transitions and this is wrong at rest.

Every `.layout-tree__split` sized its two tracks as `${share}% ${100 - share}%`, which sums to 100%,
and then added `gap: 4px` on top. So every split overflowed its own container by exactly its gap.
Individually invisible (`overflow: hidden` clips it) but it compounds with nesting depth: the last
pane in each chain is pushed off the screen edge and clipped by 4px per level, and the border lines
drift off the true seam by the same accumulation.

Measured on the fixture at 1920×1080, before → after:

| stage 3 | painted before | painted after |
|---|---|---|
| alpha | 0 → 640 | 0 → 638.7 |
| bravo | 644 → 1284 | 642.7 → 1279.3 |
| charlie | 1288 → **1928** (8px off-screen) | 1283.3 → **1920** |

At the 3×3 stage both the last column *and* the last row ran 8px past the edge. Every stage now ends
exactly on 1920/1080 with each border sitting precisely in its gap. The audit is unchanged otherwise
(`snap`, `ident`, frame cost all identical), confirming this is a pure correctness fix.

One knock-on worth knowing: a divider drag now maps a ratio to a track edge that is up to half a gap
(2px) away from `ratio%`. That is below `SplitLayoutDivider`'s own 4px click threshold and far below
perceptual relevance, but it means painted geometry and `computeLayoutGeometry`'s gap-free geometry
differ by ≤2px per level by design — which is exactly the distinction the plan's `computePaintedGeometry`
was meant to model, and which the flat path avoids entirely by having no gap at all.

Landed **behind `ENABLE_FLAT_PANE_LAYOUT`** (off):

| Change | File |
|---|---|
| Flat pane layer — one absolutely-positioned `<LayoutPane key={leafId}>` per leaf at its `computeLayoutGeometry` rect | `FlatPaneLayer.tsx` (new) |
| Per-pane change classification + start poses (`unchanged` / `move` / `resize` / `enter`) | `paneRectMotion.ts` (new) |
| Borders drawn once from `geometry.dividers`, gliding from the boundary they came from | `FlatBorderLayer.tsx` (new) |
| `rect` / `rectMotion` / `rectTransition` props; Framer Motion stood down when `rect` is set | `LayoutPane.tsx` |
| `span` prop — straddle a boundary instead of filling a `gap` | `SplitBorderLine.tsx` |

The nested-grid path is untouched and remains the fallback. **Every editing surface still uses it**
(the flat path is gated on `!onResizeDivider`), because the draggable dividers and corner handles have
not been re-homed onto the flat layer. Only the read-only kiosk render and the admin grid thumbnail
take the flat path.

---

## Audit: BEFORE and AFTER

Fixture: **"EXTREME anim test"** (`screen-extreme-anim-test`), 9 stages / 38 panes / all 12 content
kinds. Run on the **read-only kiosk route** (`/screens/:id?unattended=1`) — the same URL the TV
companion loads, and the only surface the flat path takes over. Desktop, 1920×1080, 60 Hz.
Harness: `QA/scratchpad/qa/extreme-audit.mts`.

### Metric changes — read this before comparing to earlier numbers

The old `snap=NNNNpx` figure is **not comparable** to what follows, and I changed it for two reasons:

1. **It measured layout boxes, not what you see.** The flat path animates `clip-path` for entering
   panes, and `getBoundingClientRect` ignores clipping, so a correctly-animating pane read as a hard
   snap. The sampler now applies each element's computed `clip-path` inset.
2. **It was duration-dependent.** A fixed 60 ms sampling window means something different against a
   0.5 s animation than against a 0.3 s one, so shortening the duration would have moved the number
   without anything actually changing.

`snap` is now **the worst pane's fraction of its total move completed in the first 80 ms after the
geometry commit**. ~100% = it jumped the whole way in one frame. ~30% = it is easing (an ease-in-out
80 ms into a 300 ms animation covers ≈30% of the distance, so **30% is the "healthy" reading, not
0%**). `(NNNpx)` is that pane's total travel, for context — a fraction of a tiny move is noise, so
panes moving < 24 px are excluded.

`brdr` is now **the worst |border line − the pane edge it should sit on|** through the transition,
which means the same thing under both architectures. The old check read `grid-template-columns` off
each border's parent, which does not exist in the flat path.

`ident` is new: how many panes present on **both** sides of a transition kept the same DOM element.

### BEFORE — nested grid (`ENABLE_FLAT_PANE_LAYOUT = false`)

| transition | snap | brdr | frames | worst | >16.7ms | ident |
|---|---|---|---|---|---|---|
| 1 → 2 | 30% of 960px | 2.0px | 143 | 31 ms | 1 | **0/1 kept** |
| 2 → 3 | 58% of 320px | 2.0px | 145 | 20 ms | 1 | **1/2 kept** |
| 3 → 4 | **100% of 860px** | 2.0px | 144 | 20 ms | 3 | **1/3 kept** |
| 4 → 5 | — (no shared panes) | 2.0px | 136 | 130 ms | 3 | n/a |
| 5 → 6 | — (no shared panes) | 2.0px | 135 | 160 ms | 4 | n/a |
| 6 → 7 | — (no shared panes) | 2.0px | 145 | 80 ms | 2 | n/a |
| 7 → 8 | **100% of 1296px** | 2.0px | 146 | 19 ms | 1 | **1/2 kept** |
| 8 → 9 | **100% of 2692px** | 2.0px | 144 | 11 ms | 0 | **0/1 kept** |
| 9 → 1 | — (no shared panes) | 0.0px | 145 | 11 ms | 0 | n/a |

### AFTER — flat pane layer (`ENABLE_FLAT_PANE_LAYOUT = true`)

| transition | snap | brdr | frames | worst | >16.7ms | ident |
|---|---|---|---|---|---|---|
| 1 → 2 | 30% of 960px | 0.0px | 144 | 12 ms | 0 | **1/1 kept** |
| 2 → 3 | 29% of 320px | 0.0px | 144 | 21 ms | 2 | **2/2 kept** |
| 3 → 4 | **30% of 860px** | 0.0px | 144 | 28 ms | 2 | **3/3 kept** |
| 4 → 5 | — (no shared panes) | 320px ⚠ | 139 | 121 ms | 4 | n/a |
| 5 → 6 | — (no shared panes) | 128px ⚠ | 135 | 141 ms | 5 | n/a |
| 6 → 7 | — (no shared panes) | 0.0px | 146 | 100 ms | 2 | n/a |
| 7 → 8 | **30% of 3768px** | 180px ⚠ | 144 | 12 ms | 0 | **2/2 kept** |
| 8 → 9 | **30% of 2688px** | 0.0px | 144 | 12 ms | 0 | **1/1 kept** |
| 9 → 1 | — (no shared panes) | 0.0px | 145 | 12 ms | 0 | n/a |

**What this says.** The three transitions the plan named (`3→4`, `7→8`, `8→9`) go from a full-distance
jump to a properly eased glide. Every pane that exists on both sides of a transition now keeps its DOM
element — 0/1, 1/2, 1/3, 1/2, 0/1 becomes 1/1, 2/2, 3/3, 2/2, 1/1. Frame cost is flat-to-better on
desktop. The `brdr` regressions are discussed under [What's still broken](#whats-still-broken).

`4→5`, `5→6`, `6→7`, `9→1` show `—` because those stages share **no pane ids at all** (the fixture's
3×3 and 5×5 grids use their own id space), so there is no pane whose movement could be measured and
no identity that could be preserved. That is a property of the fixture, not a result.

### Second fixture: the 25-pane pure resize

Because of that gap, the main fixture cannot exercise the expensive case: a pane that **persists and
resizes**, paying for both a position and a size change, times every pane on screen. I built
`screen-extreme-resize-test` ("EXTREME 5×5 resize", `QA/scratchpad/qa/make-resize-screen.mts`) — two
stages, the same 25 panes in the same 5×5 shape, every ratio shifted between them.

| path | snap | brdr | worst frame | >16.7 ms | ident |
|---|---|---|---|---|---|
| nested grid | 68–73% of ~500px | 2.0px | 50–89 ms | 11–15 | 25/25 kept |
| flat layer | **22–30% of ~600px** | **0.0px** | 50–90 ms | 7–10 | 25/25 kept |

Same frame cost, materially better motion: the nested path's worst pane still lands ~70% of its
travel in the first 80 ms, the flat path eases the whole way. (Identity is preserved on both here —
this fixture never changes the tree's *shape*, so the nested path has nothing to remount.)

---

## Frame cost

### Desktop (in-page `requestAnimationFrame` sampler, 60 Hz, 16.7 ms budget)

In the audit tables above. Summary: the flat path is equal or better on every transition of the main
fixture, and equal on the 25-pane resize fixture.

### Android TV — Xiaomi Mi TV Stick `MiTV_AZFU0`, Android 14, **50 Hz (20 ms budget)**

**Measurement method: the same in-page `requestAnimationFrame` sampler as desktop**, injected into
the built `dist/index.html` and POSTing each transition window to a local collector
(`frameSampler.mts` → `tv-inject-sampler.mts` → `frame-collector.mts`).

I did **not** use CDP: the TV runs a **release** build, `webviewDebuggingEnabled={__DEV__}` is false,
and no `devtools_remote` socket exists — confirmed, not assumed. I also did not use `gfxinfo` as the
primary metric: it reported ~41 frames in 10 s for this app because the WebView composites on its own
thread, so host-process frame stats undercount browser frames by roughly an order of magnitude and are
not comparable to anything. Using one identical in-page instrument on both devices is what makes the
desktop and TV columns mean the same thing. **Note the TV panel is 50 Hz, so `>16.7ms` counts every
single frame there and is useless; `>20ms` and `>33ms` are the meaningful columns.**

Median of 3–10 samples per transition, main fixture:

| transition | BASELINE mean / worst / >33 | + opt. 3 & 5 mean / worst / >33 |
|---|---|---|
| 1 → 2 | 31.3 / 140 / 10 | 27.3 / 120 / 9 |
| 2 → 3 | 31.8 / 120 / 10 | 27.5 / 100 / 9 |
| 3 → 4 | 26.2 / 160 / 10 | 25.5 / 140 / 10 |
| 4 → 5 | 64.9 / 920 / 14 | 89.3 / 890 / 13 |
| 5 → 6 | 138.3 / 1640 / 16 | 153.1 / 1620 / 11 |
| 6 → 7 | 49.4 / 960 / 11 | 50.9 / 1260 / 14 |
| 7 → 8 | 23.8 / 140 / 4 | 27.6 / 160 / 7 |
| 8 → 9 | 22.0 / 60 / 5 | 21.4 / 50 / 5 |
| 9 → 1 | 20.3 / 40 / 1 | 20.3 / 40 / 1 |

**Optimizations 3 and 5 are worth about 10% on the light transitions and nothing measurable on the
heavy ones.** They are not a regression, but they are not the win the plan hoped for either. I am
reporting that plainly rather than rounding it up: on the dense stages the run-to-run spread is wider
than the difference between the two columns.

**The most useful thing the TV run produced is not a comparison at all.** Today's *snap* design
already costs **920–1640 ms worst frames** on the 3×3 and 5×5 stages. Instrumenting where inside the
window the worst frame lands showed **13 of 21** worst frames occur during `'holding'` — the commit
that changes the geometry and mounts the new panes — not during any animation. The dominant cost of a
dense stage transition on this hardware is React mounting 25 panes of live content. Neither
architecture addresses that, and it dwarfs whatever the geometry animation costs.

### The TV numbers that are now void

I also measured the flat path on the TV, and it looked good — 25-pane resize at 94 ms mean vs 115 ms
for the nested path; the main fixture equal-or-better throughout. **Do not trust those numbers.** They
were taken against the clip-and-reveal build, in which shrinking panes were not animating at all, so
the flat path was being credited for work it was not doing. The corrected build animates
`left/top/width/height` for resizes, and I could not re-measure it. The raw data is kept in
`QA/scratchpad/qa/tv-frames-*.json` for reference, but the `spike` / `resize-flat` / `after` files
should be read as "measurements of a build that was wrong", not as evidence.

---

## Pane DOM identity — the remount fix

**Yes, identity now survives a restructure.** Verified in `transitionSamplerSource`
(`frameSampler.mts`): at the start of every transition each mounted pane element gets a unique token
written onto the element itself; after the geometry commit, every pane id present on both sides is
checked for whether it still carries its own token. A remounted element cannot carry one forward — a
`WeakSet` would not work here because the check runs in a separate evaluation.

Results on the main fixture (`ident` column above): nested **0/1, 1/2, 1/3, 1/2, 0/1** kept → flat
**1/1, 2/2, 3/3, 2/2, 1/1** kept. Zero remounts across every transition with shared panes. This
confirms the plan's diagnosis exactly: `LayoutTree`'s element type flips between `<LayoutPane>` and a
split `<div>` at a given tree position and the recursion carries no keys across depths, so React was
tearing down whole subtrees — taking `<video>` playback, scroll offsets, `useCrossfadeSlot` state and
the applied shrink-to-fit transform with them.

Caveat: this is DOM-element identity, which is the mechanism behind all of those. I did **not**
separately verify a video pane continuing playback across a restructure.

---

## Judgement calls

**The clip-and-reveal defect.** Plan optimization 1 — lay content out once at its destination size,
animate `clip-path` + `transform` — cannot work for a **shrinking** pane, and not as a matter of
tuning. The pane's box is already at the smaller destination size, so there is nothing outside it left
to reveal; every inset needed to depict its older, larger footprint is negative and clamps to zero,
yielding an identity pose. Measured: shrinking panes took their new size in a single frame while the
border between them glided correctly, which reads worse than either a clean snap or a clean glide, and
showed up as `brdr` errors of 300–960 px. I took the fallback the brief pre-authorised — real
`left/top/width/height` animation for resizes — and kept the cheap mechanisms exactly where they *are*
sufficient: a pure move is still a compositor-only `translate3d`, and an entering pane still uses the
existing `clip-path` grow-in. This is the single most consequential deviation from the plan and it is
what invalidated the Phase 0 numbers.

**A second, subtler bug the same investigation surfaced:** CSS cannot interpolate *to the absence of a
property*. Releasing a pane from `clip-path: inset(0% 100% 0% 0%)` to no `clip-path` jumps in one
frame with the transition silently doing nothing. The flat path now writes an explicit rest pose
(`inset(0% 0% 0% 0%)`, `translate3d(0,0,0)`, `opacity: 1`). Framer Motion had to be stood down
entirely when `rect` is set for the same reason — an `animate` value always beats `style`, so even a
constant `{ opacity: 1 }` erased a start pose that needed to begin at `opacity: 0`.

**Gap-aware geometry (plan step 1) was not built, deliberately.** The plan called for a
`computePaintedGeometry` returning per-edge insets so panes tile around the 4 px `gap` the nested
grids add. The flat path has no `gap` at all: panes tile exactly and the border straddles the shared
boundary, drawn on top. Turning borders off, or grouping a split, then needs nothing beyond not
drawing the line — the panes already meet exactly where they should. This removes a whole module and
its `paneSlots`/`stage`/`showSlotBorders` API expansion. The cost is that a 4 px line now overlays
2 px of each neighbour's content instead of sitting in a reserved gap; at pane padding levels this is
not visible, and coverage measures 99.8–100% at every stage.

**Density threshold: `MAX_ANIMATED_PANES = 32`, not the plan's guessed 8.** The plan asked for a value
from measurement. Measurement says there is no pane count at which animating is worse than not
animating — at 25 panes all resizing, the flat path matched the nested path's frame cost on desktop
while animating far better. So a low cap would only throw away working animation on a guess. 32 is a
bound on the *unmeasured* rather than a tuned optimum: it sits just above the largest arrangement
actually tested, so anything bigger falls back to the snap rather than extrapolating.

**The flat path is read-only only.** It is gated on `!onResizeDivider`, so every editing surface keeps
the nested grid. Re-homing the draggable dividers and corner handles (each currently measured against
its own immediate grid container) is real work and is not needed for the kiosk, which is the
constrained device this whole model exists for. This halves the risk surface. It also means the plan's
step-5 "manual editor pass on the flat path" was not applicable — I verified instead that the editor
is *unaffected*.

**Exiting panes get no special handling on the flat path.** A pane in the old tree but not the new one
is dropped immediately rather than collapsing. During a stage transition `contentPhase` is `'holding'`,
so all pane content and backdrops are already suppressed — the pane is showing nothing but
`--screen-bg`, against a screen painting the same `--screen-bg`. Collapsing it would be invisible.
Editor-driven deletions still get the existing `ExitingPaneGhost`, which is rendered by `SplitLayout`
outside the flat layer and works unchanged.

**Version bumped 0.2.64 → 0.2.65** across all five files.

---

## What's still broken, unverified, or risky

1. **The kiosk performance gate is unverified.** The headline issue. The flag ships off. Re-run
   `tv-inject-sampler.mts` + `frame-collector.mts` against the corrected build before turning it on.
2. **`brdr` regressions on three transitions** (`4→5` 320 px, `5→6` 128 px, `7→8` 180 px, against
   2.0 px on the nested path). For `4→5` and `5→6` I believe this is a metric artifact rather than a
   defect: those stages share no panes, so every pane is *entering* with a `clip-path` grow-in, and
   the metric compares the border against the pane's partially-revealed visible edge — the border is
   correctly at the boundary, the pane just hasn't grown into it yet. During `'holding'` all content
   is blank, so nothing of this is actually on screen. **`7→8` I could not explain**: both panes and
   border animate the same distance over the same duration with the same easing and should track. It
   is a real unexplained 180 px transient and I ran out of device time to chase it.
3. **Optimizations 3 and 5 are near-noise on the TV.** They were meant to be safe standalone wins;
   they are safe, but the win is ~10% on light transitions and unmeasurable on heavy ones.
4. **The real bottleneck is untouched.** 920–1640 ms worst frames on dense stages, dominated by
   mounting 25 panes of live content during `'holding'`. Neither architecture helps. If dense-stage
   transitions on the kiosk are the actual complaint, this is where the work is — not in the
   geometry model.
5. **Resize animation cost is now higher than the plan's design intent.** Every frame of a resize
   re-resolves `cqmin` and re-breaks text inside each `container-type: size` pane. On desktop this
   measured free; on the TV it is unknown. This is the specific thing the flag is gating.
6. **Not verified:** video playback continuity across a restructure; `captureMode` (screen preview
   capture) against the flat path; the admin grid thumbnail against the flat path; anything on a
   touch device.
7. **Fixture added to the store:** `screen-extreme-resize-test` ("EXTREME 5×5 resize"). Delete it from
   the Screens admin if unwanted; `make-resize-screen.mts` recreates it.

---

## Reproducing

```bash
# desktop audit, either path (flip ENABLE_FLAT_PANE_LAYOUT and re-run)
npx tsx QA/scratchpad/qa/extreme-audit.mts                              # main fixture
npx tsx QA/scratchpad/qa/extreme-audit.mts screen-extreme-resize-test 45000

# fallback path still interactive
npx tsx QA/scratchpad/qa/editor-smoke.mts

# flat path renders correctly at every stage
npx tsx QA/scratchpad/qa/flat-render-check.mts

# kiosk measurement (needs the TV paired and `npm run build && npm run preview`)
npx tsx QA/scratchpad/qa/frame-collector.mts QA/scratchpad/qa/tv-frames-new.json &
npx tsx QA/scratchpad/qa/tv-inject-sampler.mts http://<mac-lan-ip>:4999
npx tsx QA/scratchpad/qa/tv-set-screen.mts screen-extreme-anim-test
adb shell am force-stop no.adhdisplay.companion && adb shell monkey -p no.adhdisplay.companion -c android.intent.category.LAUNCHER 1
```
