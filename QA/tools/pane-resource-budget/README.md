# Pane resource budget tester

A real, re-runnable check (not just design-time care) for the per-pane custom CSS/HTML feature's own
resource footprint — see the implementation plan's "Resource budget tester" section for the full design
rationale. Unlike `diagnostics/pane-resize-stutter/`, this directory is meant to be **kept and re-run**,
not deleted once one investigation is done — pull it back out whenever `customCss`/`customHtml`'s own
render path (`PaneVisual.tsx`, `usePaneCustomContent.ts`, `paneCustomCss.ts`/`paneCustomHtml.ts`) changes
in a way that could plausibly move its resource footprint.

⚠️ **Per this repo's CLAUDE.md, get explicit confirmation before running `run.ts` against a live app
instance** — it drives real browser automation and writes real synced state (a
`[pane-resource-budget]`-prefixed screen; `run.ts` backs up `admin-screens.json` first via
`backupSyncedKeyFile`, and `--remove` cleans the seeded screens back out). This mirrors
`diagnostics/pane-resize-stutter/scripts/02-run-browser-trace.ts`'s own established precedent for this
exact class of tool — not a new rule invented for this one.

## What it measures, and why each one

- **DOM node count** (`Memory.getDOMCounters()`) — `customHtml` injects real DOM directly; this is the
  most direct signal for "how much extra markup did this pane add".
- **JS heap size** (`Performance.getMetrics()`'s `JSHeapUsedSize`/`JSHeapTotalSize`) — the shrink-to-fit
  hooks' own `MutationObserver`+`ResizeObserver`+poll triad (confirmed real in `useShrinkToFitScale.ts`)
  is exactly the kind of machinery that can leak or churn under a pane that keeps mutating.
- **Sustained-idle heap/DOM growth over several minutes of active stage rotation** — not a one-time
  snapshot. This is a 24/7 kiosk display; `run.ts` samples repeatedly (default: every 15s over a 3-minute
  run) and reports the delta between the first and last sample, not an average across the whole window
  (which would smear an early leak into a long, mostly-flat curve).
- **Frame-drop percentage during stage transitions** (`lib/rafDeltaCapture.ts`, ported as-is from
  `diagnostics/pane-resize-stutter/lib/rafDeltaCapture.ts`) — a heavy `customHtml` subtree, or CSS that
  forces expensive repaints, could visibly stutter the crossfade.
- **Total JSON payload size for a whole screen** (`lib/payloadSize.ts`, no browser needed) — the hard
  per-field `MAX_PANE_CUSTOM_CSS_LENGTH`/`MAX_PANE_CUSTOM_HTML_LENGTH` caps already bound one pane's own
  worst case, but not what a whole screen with several such panes looks like at once (the sync payload
  every connected admin/kiosk client receives on every write to that screen).

## Two seeded scenarios

- **`baseline`** (`lib/buildScenarioScreens.ts`'s `buildBaselineScreen`) — 3 plain panes (2x catalogue +
  1x clock), single stage, no custom CSS/HTML at all. What a normal, real-world screen looks like today
  — every worst-case number should be read as a delta *against this*, not against zero.
- **`worstcase`** (`buildWorstCaseScreen`) — 6 panes, 2 actively-rotating stages (5s each, so natural
  rotation alone triggers repeated transitions with no manual triggering needed), every pane carrying
  both a `customCss` and a `customHtml` block padded to just under their own length caps (alternating
  `customHtmlPlacement` so both code paths are exercised).

Both are seeded with the id prefix `pane-resource-budget-` (`lib/seedClient.ts`'s `BUDGET_ID_PREFIX`) so
they're always identifiable and sweepable independent of any real screen.

## Usage

```sh
# Both scenarios, 3-minute sustained capture each (default)
npx tsx QA/tools/pane-resource-budget/run.ts --scenario=both

# One scenario, longer capture, visible browser window
npx tsx QA/tools/pane-resource-budget/run.ts --scenario=worstcase --durationMs=300000 --headed

# Point at a non-default dev server (matches this repo's own custom-port convention)
npx tsx QA/tools/pane-resource-budget/run.ts --wsPort=4010 --contentPort=5183

# Clean up the seeded screens afterward
npx tsx QA/tools/pane-resource-budget/run.ts --remove
```

Results are written to `results/<timestamp>.json` (one array of `BudgetCaptureResult`, see `types.ts`)
and a summary is printed to the console, including a worst-case-vs-baseline delta when both scenarios ran
in the same invocation.

## Proving the tool actually catches something

Per the plan's own verification step: before trusting a "clean" result from this tool, confirm it
actually flags a deliberately pathological case. The real `customCss`/`customHtml` allowlist (see
`paneCustomCss.ts`/`paneCustomHtml.ts`) deliberately forecloses genuinely self-mutating or animating
content — no `<script>`, no `animation`/`transition` CSS properties, no `@keyframes` — so a truly
self-mutating blob isn't reachable through the sanitized surface by design (a reassuring property in its
own right, not a limitation of this tool). The `worstcase` scenario's own DOM-heavy, near-max-length
`customCss`/`customHtml` across 6 actively-rotating panes is the realistic worst case actually reachable
through that allowlist, and is what this tool's own baseline-vs-worstcase delta is meant to catch.

## Reused patterns, not shared code

`lib/rafDeltaCapture.ts` and the CDP session-setup pattern in `lib/cdpMemoryMetrics.ts` are ported (not
imported) from `diagnostics/pane-resize-stutter/lib/`, and `lib/seedClient.ts` is likewise ported from
that directory's own file of the same name (with its own `BUDGET_ID_PREFIX` instead of
`DIAG_ID_PREFIX`) — that directory is explicitly throwaway/safe-to-delete for its own stutter
investigation, so this tool (meant to be kept) carries its own copies rather than depending on a
directory liable to disappear out from under it.
