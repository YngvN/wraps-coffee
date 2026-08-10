# Pane-resize-stutter diagnostic report

Generated 2026-08-10T12:54:29.760Z.

## Same-hook curve (as-is / textblock / emptycatalogue)

| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Paint+composite ms (median) | Forced sync layout? | TV jank % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.4% | 548 | 9.85ms | 0.53ms | — | yes | — |  |
| chromium | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.7% | 548 | 14.62ms | 0.53ms | — | no | — |  |
| chromium | emptycatalogue | grid-template-columns, grid-template-rows | 3 | catalogue x2 (0-1 items) + time | 0.0% | 30 | 7.23ms | 2.84ms | — | no | — |  |
| chromium | textblock | grid-template-columns, grid-template-rows | 3 | catalogue x2 (short names, no descriptions) + time | 0.0% | 115 | 8.82ms | 0.25ms | — | no | — |  |
| firefox | as-is | grid-template-columns, grid-template-rows | 3 | catalogue x2 (real data) + time | 0.4% | — | — | — | — | — | — |  |
| firefox | emptycatalogue | grid-template-columns, grid-template-rows | 3 | catalogue x2 (0-1 items) + time | 0.0% | — | — | — | — | — | — |  |
| firefox | textblock | grid-template-columns, grid-template-rows | 3 | catalogue x2 (short names, no descriptions) + time | 0.0% | — | — | — | — | — | — |  |

## Floor measurement (emptied)

A DIFFERENT hook (`useShrinkToFitScale`, not `useShrinkToFitFontScale`) is active here, not just less content on the same one — this is the cost of the CSS grid-track transition itself with trivial content, not a fourth point on the curve above. A lower count here than `emptycatalogue` is expected, not an anomaly.

| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Paint+composite ms (median) | Forced sync layout? | TV jank % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | emptied | grid-template-columns, grid-template-rows | 3 | none x2 + time | 0.0% | 30 | 1.72ms | 0.66ms | — | no | — |  |

## Real-world worst case (human)

Mirrors the real "Human testing" screen that surfaced this stutter visibly — a per-stage `catalogue`-category swap crossfades between two different resolved contents that both trigger `useShrinkToFitFontScale` concurrently, in both crossfade slots at once, which the other scenarios above structurally never exercise (their content never changes, only geometry). Compare this section's before/after (across the fix's two commits, or against a checkout of the commit before either) rather than against the curve above — it's a different scenario, not a further point on that curve. The Paint+composite column matters more here than elsewhere: this scenario also has `showSlotBorders` and a per-stage `backgroundColor` change, both paint costs the layout-debounce fix doesn't target — a smaller-than-expected `layoutCountMedian` improvement alongside an unchanged paint figure would mean the fix worked as intended and the remainder is a separate, unaddressed paint cost, not a failed fix.

| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Paint+composite ms (median) | Forced sync layout? | TV jank % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | human | grid-template-columns, grid-template-rows | 3 | slide transition, 3 stages, per-stage catalogue-category swap (dual-slot concurrent font-scale) + time, borders on | 2.0% | 770 | 11.49ms | 0.19ms | 6.01ms | no | — | build=before |
| chromium | human | grid-template-columns, grid-template-rows | 3 | slide transition, 3 stages, per-stage catalogue-category swap (dual-slot concurrent font-scale) + time, borders on | 0.1% | 30 | 9.73ms | 4.78ms | 4.81ms | no | — | build=after |
| firefox | human | grid-template-columns, grid-template-rows | 3 | slide transition, 3 stages, per-stage catalogue-category swap (dual-slot concurrent font-scale) + time, borders on | 0.4% | — | — | — | — | — | — | build=after |
| firefox | human | grid-template-columns, grid-template-rows | 3 | slide transition, 3 stages, per-stage catalogue-category swap (dual-slot concurrent font-scale) + time, borders on | 0.4% | — | — | — | — | — | — | build=before |

> **Note on "Forced sync layout?"**: this column comes from matching JS call-stack function names captured alongside `Layout`/`UpdateLayoutTree` trace events against the suspect hook's own function names (`fitsAt`, `measureAndScale`, etc. — see `lib/traceParse.ts`, at `event.args.beginData.stackTrace`). Against a `vite preview` production build those names are minified, so this reads "no" there even where it applies — it reads "yes" (empirically confirmed, not just suspected) once the same capture is run against an unminified `vite dev` build. Absence of "yes" on a minified-build row is a tooling limitation, not evidence against P2.3.
