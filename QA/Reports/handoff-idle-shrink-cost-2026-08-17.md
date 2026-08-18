# Handoff — the remaining kiosk stutter is the shrink search, and how to kill it

> **PARTLY SUPERSEDED 2026-08-17 (later) — read the consolidated report's facts 27–30 before acting on
> anything below.** Four of this document's load-bearing claims have since been measured:
>
> - **§1's option A is much more expensive than assumed.** One pane's capture costs **4.6–9.5 s** on the
>   TV, is a fixed overhead rather than area-scaled, and therefore cannot be made affordable by a lower
>   `pixelRatio` *or* by capturing lazily during a ~2.4 s dwell (fact 29).
> - **§3's blocker 1 is fixed and it was not enough.** The warm is now selective (99 captures → 9 on
>   `Empty test`) and the bitmap arm still measures flat in steady state with 2110 ms of debt during the
>   warm (fact 28).
> - **§3's blocker 2 does not matter to `debtByPhase`.** The soft floor does double the probes per pass
>   (16 vs 8, simulated), and re-running arm J on the current tree as **arm L** gives an identical
>   180 ms / 720 ms (fact 27).
> - **`SLIDE_BITMAP_ENABLED` is back to `Boolean(0)`**, reconciling §2's flag table with fact 26.
>
> §5's guardrails, §6's device notes and §4's plan all still stand.

**Date:** 2026-08-17 (later than `handoff-catalogue-bitmap-2026-08-17.md`, which this supersedes)
**Read `QA/Reports/kiosk-performance-consolidated-2026-08-16.md` in full first.** It is current through
**fact 26** and already contains everything this session measured. §2 (three incompatible measurement
regimes — never mix them), §4 (refuted approaches), §9 (tooling), §10 (traps) are all load-bearing.

---

## 1. The one thing to understand before proposing anything

The user's goal is: **the kiosk should not visibly stutter.** Their preferred means is a pre-rendered
bitmap. Both halves of the stutter are now measured and only one is fixed.

| phase | what it is | status |
|---|---|---|
| `holding` — the box is animating | `cqmin` font sizes re-resolving per frame, re-flowing the whole slide | **FIXED** — 400ms → 20ms (fact 22, one CSS line) |
| `idle` — after it settles | the shrink-to-fit search re-deriving each pane's scale, forever | **OPEN — ~600ms, this is the whole remaining problem** |

**The decisive measurement, and the thing the user and I went back and forth on:**

| arm | worst | debt | e / h / i | what it does |
|---|---:|---:|---|---|
| `cat-E-bitmap.json` | **40ms** | **20ms** | 0 / 0 / 0 | bitmap **replaces live DOM permanently** |
| `cat-K-bitmap.json` | 300ms | 1840ms | 740 / 340 / 700 | bitmap **only during motion**, live DOM at rest |
| `cat-J-bodysplit.json` | 180ms | 720ms | 120 / 20 / 620 | no bitmap at all (current shipping behaviour) |

Same capture pipeline in both bitmap arms. **The only difference is whether real text comes back at
rest** — and that difference is the entire result, because live DOM is what runs the shrink search.

So a moving-frames-only bitmap *cannot* fix the idle cost by construction. There are exactly two ways
forward, and the user should choose knowingly:

- **A — make the bitmap the resting representation.** Reaches the floor (proven, 40/20). Costs: frozen
  glyphs at rest, re-capture whenever content changes, and the boot warm must be made far cheaper
  (see §3). The aspect-ratio objection that sank the *previous* attempt is **already solved** — capture
  per (pane, stage) at the box the pane will occupy, so every bitmap is drawn 1:1. That code exists and
  works.
- **B — fix the shrink search.** Keeps live re-flowing DOM and real glyphs. Target is
  `cat-F1-cv-noshrink.json` (**80ms / 80ms**, the search ablated outright), which is close to the
  bitmap's own floor. Plan in §4.

**Do not present these as "the bitmap doesn't work".** It works, and it reaches the floor. The question
is only whether frozen text at rest is acceptable.

---

## 2. Current state

**Version 0.2.73. Nothing is committed.** `npm run build`, `npm run lint`, `tsc` all clean.

Flags:

| flag | file | state | note |
|---|---|---|---|
| `SUPPRESSED_SKIPS_LAYOUT` | `LayoutPane.tsx` | `Boolean(1)` | the fact-22 win. Keep. |
| `BODY_ONLY_REFLOW` | `LayoutPane.tsx` | `Boolean(1)` | chrome stays painted through a resize |
| `REFLOW_HIDE_THRESHOLD` | `SplitLayout.tsx` | `0.02` | was `0.2`; at 0.2 the hide never fired on real screens |
| `SLIDE_BITMAP_ENABLED` | `slideBitmapStore.ts` | **`Boolean(1)`** | **turned on at the user's request, against measurement.** Fact 26 in the report still says "shipped off" — reconcile this. |
| `TRUST_WARM_SCALE` | `useShrinkToFitFontScale.ts` | `Boolean(0)` | measured flat twice; its instrumentation is still useful |
| `ABLATE_MEASUREMENT` | `useShrinkToFitFontScale.ts` | `Boolean(0)` | fact 8's V1b ablation |
| `CATALOGUE_AS_BITMAP` | `CatalogueSlide.tsx` | `Boolean(0)` | the *old* viewport-raster experiment, superseded by `SlideBitmapLayer` |

New this session: `slideBitmapStore.ts`, `warmSlideBitmaps.ts`, `SlideBitmapLayer.tsx`/`.scss`,
`useFitItemCount.ts`, plus QA scripts `body-split-check.mts`, `bitmap-warm-check.mts`,
`shrinkStatsProbe.mts`, `tv-inject-shrink-stats.mts`.

---

## 3. Known outstanding problems

1. **The boot warm is ruinous and must be fixed before option A is viable.** `warmSlideBitmaps`
   captures every pane of every stage — on `Empty test` that is 11 × 9 = up to 99 `html-to-image`
   captures at `devicePixelRatio` 2, on 4 cores, **while the rotation is already playing**. Measured
   worst frames of **3620ms, 3500ms, 3540ms** during it. The obvious first cut: only capture panes
   whose kind actually re-flows (`usesFontScale` — transit, weather, catalogue, event-month), which on
   `Empty test` is 1 pane instead of 9. Then consider `pixelRatio` and spreading captures across idle.
2. **A regression introduced late in this session, not yet fixed.** `MIN_LEGIBLE_SCALE = 0.5` was added
   as a hard floor and pinned every catalogue stage at 0.5 while overflowing by up to 2478px
   (`shrink-correctness.mts` caught it: 11 failing pairs). It is now a *soft* floor — the search tries
   `[0.5, 1]` then re-opens into `[0.01, 0.5]` — which fixed the overflow (11 → 4 failing pairs, the
   remaining 4 being `Empty test`'s degenerate sliver stages at the absolute 0.01 bound, same as before
   any change). **But it roughly doubled the probes per pass for below-floor content**, which is
   exactly the catalogue. Fix §4 step 1 first; it undoes this.
3. **`useFitItemCount` only covers weather and transit.** A catalogue cannot drop items (every menu line
   is the point), which is why the floor has to be soft for it.

---

## 4. Option B in detail — the idle fix

Root cause, measured with in-page counters (`window.__qaShrinkStats`, gated on `TRUST_WARM_SCALE`;
posted by `shrinkStatsProbe.mts`). Over 42 working passes on one catalogue pane: **9 fast-path hits,
13 store misses, 21 poll passes, 290 probes — ~6.9 probes per pass.** Every probe is a CSS write plus a
forced synchronous layout of the whole slide.

1. **Don't prove the obvious.** If a pane's seed is already below `MIN_LEGIBLE_SCALE`, open the bracket
   wide immediately instead of re-discovering that `[0.5, 1]` fails. No behaviour change; undoes
   problem 2 above. ~8 probes per pass on the catalogue case.
2. **Make the 2s poll a single probe.** The poll clears the unchanged-box early-out and re-derives from
   scratch — 21 of 42 passes. Its only real job is noticing content having *shrunk* so text can grow
   back (fact 13's failure mode). One probe answers that: "does it still fit a notch larger?" No →
   done. Yes → run the real search. **Tradeoff: a pane self-corrects slightly less eagerly.** The
   resize and mutation observers still trigger full searches, so this only affects content that
   changed without any DOM mutation or box change.
3. **Find out why seeding degrades to ~6.9 probes** when a seeded re-confirm is designed to cost 3
   (`SEED_PROBE_MARGIN`). Two suspects, both worth instrumenting before assuming: `warmShrinkScales`
   is not populating the store usefully (it reached only 13 entries, climbing one at a time during a
   run rather than filled in bulk at boot), and the size key changing every stage may mean the seed
   never matches. **Likely a straightforward bug rather than a tradeoff — do this before 2.**
4. **Then a pane whose box and content are both unchanged should do zero probes.** The early-out exists;
   the poll is what currently defeats it.

Target: `cat-F1-cv-noshrink.json`'s **80ms / 80ms**.

---

## 5. Guardrails — these have each already cost a run

- **Regime C only.** `debtByPhase` is the primary metric, not `worstMs`. ≥5 rotations, medians, and a
  change is real only if the median moves >30% with non-overlapping ranges.
- **Never read a raw run file** — always `summarize-frames.mts`. Gate run length with
  `wait-frames.mts`, never raw file length.
- **Check `lsof -ti:4999` *after* starting the collector**, not just before. A surviving collector
  silently lands the new arm's frames in the previous arm's file.
- **`grep -c qa-frame-sampler dist/index.html` must return 0 after every build**, or you are measuring
  the previous arm. Note `grep -c` exits non-zero on 0, which breaks `&&` chains.
- **Never rebuild while a run is in progress** — the PWA service worker can reload the TV mid-run.
- **Never write an experiment flag as a literal `true`.** Use `Boolean(1)`.
- **A fast run is not a correct run.** Two bugs this session were invisible to `debtByPhase`, one
  because it made panes *cheaper* by skipping work it should have done. Run
  `shrink-correctness.mts` (reports overflow, slack and resolved scale per pane/stage) alongside any
  frame measurement.
- **Assert computed style, never class presence.** A CSS class on a Framer Motion element is silently
  overridden by Framer's inline style — a fade shipped completely inert while every other symptom
  looked right (fact 25).
- **Anything cached per-slide must be cached across mounts.** `useCrossfadeSlot` mounts a fresh slide
  instance every transition, so per-instance memory is always empty on the pass that matters. This has
  now caused four separate bugs (facts 16, 21, 23, and the bitmap key mismatch).
- **Ask the user before running Playwright/browser automation** (project CLAUDE.md). They have
  authorised it for this work; re-confirm for anything new.

## 6. Device and fixtures

TV reachable over `adb` after a prior pair; `adb connect 192.168.0.33:5555` recovers it after sleep.
Collector origin used this session: `http://192.168.0.213:4999`.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

`Empty test` (`screen-4d546476-…`) is the zero-noise instrument — **restore it with
`npx tsx QA/scratchpad/qa/emptytest-variant.mts blank` when done**, and note the user may have placed a
catalogue on it by hand. `Ny test` (`screen-624ebb7c-…`) is the real-screen check (transit, weather,
catalogue, image, news, qrcode). **`Screen 3 (verify)` no longer exists** — facts 1, 2, 3, 8, 11, 12,
13, 15 were measured on it and cannot be re-run.
