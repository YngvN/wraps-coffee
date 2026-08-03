# Prompt template: assistant QA test cycle

<!-- Template version: 2 (updated after the NorMistral test-cycle retrospective — added cadence guidance, deferred-scenario/phase awareness). -->

Copy everything below the line into a **new** Claude Code session to kick off the next assistant QA test cycle. This template exists so each new cycle starts from the accumulated methodology instead of re-deriving it — see `QA/templates/qa-test-plan-template.md` (v2) and `QA/templates/qa-test-report-template.md` (v2) for the documents this prompt asks Claude to produce.

**When to run this cycle:** event-driven — after a labeled phase of assistant work lands, or when evaluating a new model worth benchmarking for a supported tier. Not a fixed schedule.

---

Create a test plan for re-running the AI assistant QA pass (the sparkle-icon chatbox in the admin navbar — `server/assistant/` + `src/features/admin/assistant/`). **Do not execute any tests yet — only produce the plan** (ask before running any Playwright/browser automation, per this repo's CLAUDE.md).

## Step 0 — ask before assuming anything

Before doing any research or writing anything, ask me (use `AskUserQuestion`, don't just guess and proceed):

1. **Which model(s) to test this run** — provider (Local/Ollama vs Claude), and if Local: which tag for the thinking role, and which tag for the vision role (they don't have to match — check `ollama show <tag>` for `Capabilities` before assuming a thinking-role tag can double as the vision role; if it can't, ask whether the vision-dependent scenario should run against a real vision-capable model instead, or be marked out of scope).
2. **Whether to reuse the existing seed fixture** (check `QA/Reports/` for the most recent report describing it — e.g. an "AutoDeler" catalogue or whatever the current standard fixture is) if it still exists in the live dev instance, or re-seed from scratch if it's been cleaned up.
3. **Whether to include the diagnostic addendum** — a small re-run of a handful of Section A scenarios in one continuous session, purely to check whether this model shows session-length degradation. Optional, doesn't affect grading.

Don't proceed past this step without answers — these change materially between runs and guessing wrong wastes a full test cycle.

## What to reuse without re-deriving

- **Scenario list and IDs:** find the most recent report in `QA/Reports/` and reuse its own scenario IDs/phrasing verbatim — don't invent new wording for an existing scenario.
- **Session-classification principle:** a scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state (pronoun/reference resolution, reacting to the assistant's own last reply, answering a still-open clarification, correcting a just-proposed unconfirmed draft, per-card actions on an unconfirmed batch). A scenario that only needs a *real record to already exist* does not need a shared session — persisted app data outlives the session that created it. Go through the most recent report's own scenario text (not just a guess from the scenario's name) to classify each one — see that report's own "Key correction" section, if it has one, for examples of this principle catching a wrong initial guess.
- **Default session policy:** fresh session (the panel's own "New chat" button) immediately before each scenario, unless that scenario's own point is something that only exists within an ongoing conversation.
- **Retry-once rule:** if a draft actually reached the Draft-Quality Gate but looks low-quality, retry with the gate's own "Prøv igjen" button first (same session, restores the original message for a real resend — the faithful in-app retry). If nothing reached a testable state at all (no gate, no clarification, no batch, an empty reply, a timeout), there's no button for that — retry by starting a fresh session and resending the same message instead. Only record a scenario as failed-to-reach-that-state if the retry also comes up empty.
- **Cleanup policy:** keep the seed fixture in place at the end (don't tear it down) — only clean up records individual scenarios created on top of it. Verify every cleanup claim against real data (`server/data/*.json` or the admin UI), never trust the assistant's own self-report of what it created.
- **Screenshot retention:** once this run's own report and screenshot folder are in place, delete the *previous* test cycle's screenshot folder(s) — keep only the most recent test's screenshots, to save disk space. Older reports' own screenshot links will go dead; that's an accepted tradeoff, not an oversight. Never delete a prior cycle's report/plan/prompt `.md` files, only its image folder.
- **Harness-vs-reality cross-check:** the Playwright harness mostly grades by reading the DOM (`innerText`, element counts) — for any scenario it marks FAIL where the trace shows the underlying pipeline actually fired correctly, open the real screenshot before finalizing the grade. It's already been wrong once this way (a list that rendered correctly on screen but got missed by an `innerText` read of only the first line).
- **Root-cause consolidation:** when 2+ scenarios show the same underlying failure (e.g. records landing in the wrong catalogue across six different scenarios), don't report N separate findings — name the one suspected root cause and list every scenario ID confirming it, so a reader can tell whether follow-up is one fix or several.
- **Known-deferred-scenario carve-out:** if a scenario tests functionality that hasn't shipped yet as of this run's baseline, grade it N/A-pending-[feature], not FAIL — check the assistant code's own phase/plan comments and the most recent report's own "out of scope"/"diagnostic only" scenarios for what's still pending. If this project tags assistant work by phase, tag each scenario with which phase it tests, so the report can separate "something shipped regressed" from "this is still pending work."
- **Execution mode:** headed (visible) Chromium, not headless — the point is to be able to watch it run.
- **A known environment gotcha:** if this repo lives under an iCloud-Drive-synced folder (e.g. `~/Desktop`), heavy concurrent file writes into `QA/scratchpad/` during a long automated run can trigger iCloud to spin off a `"folder 2"` conflict-duplicate mid-run. This is sync noise, not data loss — don't panic-diagnose it as a script bug; verify by checking file mtimes and content before assuming anything broke.

## Deliverable

Produce the plan by copying the structure in `QA/templates/qa-test-plan-template.md` — Summary section above Methodology, full scenario classification table, run order, and a report-format section pointing at `QA/templates/qa-test-report-template.md`. Save it to `QA/Reports/qa-test-plan-<model>-<date>.md`.

Once I approve the plan (and separately approve actually running Playwright), execute it and write the finished report to `QA/Reports/assistant-qa-report-<model>-<date>.md` following `QA/templates/qa-test-report-template.md`.
