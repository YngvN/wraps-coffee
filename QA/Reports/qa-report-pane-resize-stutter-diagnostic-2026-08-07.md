# Pane-resize-stutter diagnostic report

Generated 2026-08-07T15:00:04.371Z.

## Summary

**Root cause, confirmed with code-level certainty**: `src/hooks/useShrinkToFitFontScale.ts`'s `fitsAt()` — a style write followed by an immediate `scrollHeight` read, forcing one synchronous `Layout` reflow per call — accounts for **92% of all `Layout` events** during a stage transition on the `as-is` scenario (504 of 548, measured against an unminified `vite dev` build with readable stack traces; the trace's own JS call stack shows `fitsAt → measureAndScale → Layout` directly, not an inference). The CSS `grid-template-columns`/`rows` transition itself (`SplitLayout.tsx:490`) is NOT the problem — the `emptied` floor measurement (a different, cheap hook, trivial content) produces only 30 `Layout` events across the same transition, a ~18x smaller number.

**The cost is invocation frequency, not search depth.** Clustering the `fitsAt` calls by invocation shows 74% of individual `measureAndScale` calls are a single call — the `fitsAt(1)` fast path succeeding immediately, not the full 8-iteration binary search. The `as-is` variant isn't expensive because the search runs deep; it's expensive because the measurement is triggered far more often than once per rendered frame per pane (empirically ~10x more than a naive "one `ResizeObserver` delivery per animation frame" model predicts). This reframes where a fix should look: the calling/scheduling condition around `measureAndScale`, not the binary search itself.

**Same-hook curve (P2.2 decomposition), corrected counts**: `as-is` 548 Layout events / 593 style-recalc events per transition → `textblock` 115 / 179 → `emptycatalogue` 30 / 94, monotonic with how much the content actually needs to shrink. `emptied` (30 Layout / 154 recalc) is a floor measurement on a different hook, not a fourth point on this curve.

**Two real bugs were found and fixed in this diagnostic tooling itself while verifying the above** (not in the app under test): `lib/traceParse.ts` was reading JS stack traces from `event.args.data.stackTrace`, but Chrome actually puts them at `event.args.beginData.stackTrace` — this made the "forced sync layout?" heuristic silently return "no" unconditionally, on every build, not just minified ones as first assumed. Separately, `Layout` and `UpdateLayoutTree` were both being counted as "Layout" events, when `UpdateLayoutTree` is actually Chrome's current name for the style-recalculation step — this silently roughly doubled every layout-count/duration number in the first pass of this report (e.g. `as-is` originally read 1,140/1,141, not the corrected 548). Both are fixed in the tooling; all numbers above are post-fix.

**`ResizeObserver` loop check**: watched the console for 16s across multiple transitions with zero `ResizeObserver loop completed with undelivered notifications` warnings. Precise claim: **no such warning was observed** — this rules out the loud, depth-limit-exceeded variant of that failure mode, but a callback that resizes its own observed box and defers re-delivery to the next frame produces no warning at all and is consistent with everything measured here. Not ruled out; just not the specific loud case.

**TV hardware gate**: the connected TV's active WebView is Chromium 147.0.7727.137 (`dumpsys webviewupdate`), well past the version where `grid-template-columns`/`rows` transitions became interpolable — the TV branch of this investigation is a legitimate frame-timing question on this hardware, not a visual-parity one.

**Deliberately deferred, not investigated further in this pass**: the exact mechanism behind the ~10x-per-frame invocation rate needs source instrumentation to pin down, and sits at the boundary where diagnosis becomes fix design — the mechanism that causes the over-firing is likely the same thing a fix has to change, so it's cheaper to scope that as its own pass (with a fix design attached) than to instrument now and re-derive this context later. One framing worth carrying into that pass: the target pane geometry is known at the moment a transition starts — every `fitsAt` measurement computed against an *intermediate* animated width is discarded work. Whatever the invocation mechanism turns out to be, that observation likely survives it.

Firefox (rAF-delta only, 3 of 4 variants — all near-zero drop%, consistent with Gecko absorbing the same underlying cost rather than differing in mechanism) and Electron P3 were captured/scoped as planned but not pursued further once the mechanism-level finding above made them second-order.

## Same-hook curve (as-is / textblock / emptycatalogue)

| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Forced sync layout? | TV jank % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.4% | 548 | 9.85ms | 0.53ms | yes | — |  |
| chromium | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.7% | 548 | 14.62ms | 0.53ms | no | — |  |
| chromium | emptycatalogue | grid-template-columns, grid-template-rows | 3 | catalogue x2 (0-1 items) + time | 0.0% | 30 | 7.23ms | 2.84ms | no | — |  |
| chromium | textblock | grid-template-columns, grid-template-rows | 3 | catalogue x2 (short names, no descriptions) + time | 0.0% | 115 | 8.82ms | 0.25ms | no | — |  |
| firefox | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.4% | — | — | — | — | — |  |
| firefox | emptycatalogue | grid-template-columns, grid-template-rows | 3 | catalogue x2 (0-1 items) + time | 0.0% | — | — | — | — | — |  |
| firefox | textblock | grid-template-columns, grid-template-rows | 3 | catalogue x2 (short names, no descriptions) + time | 0.0% | — | — | — | — | — |  |

## Floor measurement (emptied)

A DIFFERENT hook (`useShrinkToFitScale`, not `useShrinkToFitFontScale`) is active here, not just less content on the same one — this is the cost of the CSS grid-track transition itself with trivial content, not a fourth point on the curve above. A lower count here than `emptycatalogue` is expected, not an anomaly.

| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Forced sync layout? | TV jank % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | emptied | grid-template-columns, grid-template-rows | 3 | none x2 + time | 0.0% | 30 | 1.72ms | 0.66ms | no | — |  |

> **Note on "Forced sync layout?"**: this column comes from matching JS call-stack function names captured alongside `Layout`/`UpdateLayoutTree` trace events against the suspect hook's own function names (`fitsAt`, `measureAndScale`, etc. — see `lib/traceParse.ts`, at `event.args.beginData.stackTrace`). Against a `vite preview` production build those names are minified, so this reads "no" there even where it applies — it reads "yes" (empirically confirmed, not just suspected) once the same capture is run against an unminified `vite dev` build. Absence of "yes" on a minified-build row is a tooling limitation, not evidence against P2.3.
