<!-- Base template version: 1 (split out of the old monolithic qa-test-prompt-template.md, v2, on 2026-08-04 — the concrete Step 0 questions, the seed-fixture example, and the environment gotcha moved to QA/templates/project/qa-prompt-project.md, since those are specific to this project's own assistant/environment. This file holds only the shape a Step-0 kickoff prompt should have for any project's own chat-driven admin assistant.) -->

# Base prompt template: assistant QA test cycle

Copy this together with your project's own `QA/templates/project/qa-prompt-project.md` into a **new** Claude Code session to kick off the next assistant QA test cycle. This pair exists so each new cycle starts from the accumulated methodology instead of re-deriving it — see `QA/templates/base/qa-test-plan-base.md` + your project's own `qa-test-plan-project.md` for the documents this prompt asks Claude to produce.

**When to run this cycle:** event-driven — after a labeled phase of assistant work lands, or when evaluating a new configuration worth benchmarking. Not a fixed schedule.

---

Create a test plan for re-running the AI assistant QA pass. **Do not execute any tests yet — only produce the plan** (ask before running any Playwright/browser automation).

## Step 0 — ask before assuming anything

Before doing any research or writing anything, ask me (use `AskUserQuestion`, don't just guess and proceed) whatever this cycle needs to know before it can be planned — see your project's own prompt template for the specific questions this project's Step 0 always needs (which configuration to test, whether to reuse or reset the environment, and anything else that changes materially between runs). Don't proceed past this step without answers — guessing wrong wastes a full test cycle.

## What to reuse without re-deriving

- **Scenario list and IDs:** find the most recent report in `QA/Reports/` and reuse its own scenario IDs/phrasing verbatim — don't invent new wording for an existing scenario.
- **Session-classification principle:** a scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state (pronoun/reference resolution, reacting to the assistant's own last reply, answering a still-open clarification, correcting a just-proposed unconfirmed draft, per-item actions on an unconfirmed batch). A scenario that only needs a *real record to already exist* does not need a shared session — persisted app data outlives the session that created it. Go through the most recent report's own scenario text (not just a guess from the scenario's name) to classify each one — see that report's own "Key correction" section, if it has one, for examples of this principle catching a wrong initial guess.
- **Default session policy:** fresh session (whatever this app's own "start a new conversation" affordance is) immediately before each scenario, unless that scenario's own point is something that only exists within an ongoing conversation.
- **Retry-once rule:** if the app reached a reviewable/draft state but the result looks low-quality, retry with whatever in-app mechanism restores the original input for a real resend, in the same session — the faithful in-app retry. If nothing reached a testable state at all (no review state, no clarification, no batch, an empty reply, a timeout), there's no button for that — retry by starting a fresh session and resending the same input instead. Only record a scenario as failed-to-reach-that-state if the retry also comes up empty.
- **Cleanup policy:** keep the seed fixture in place at the end (don't tear it down) — only clean up records individual scenarios created on top of it. Verify every cleanup claim against real data, never trust the assistant's own self-report of what it created.
- **Retention policy:** once this cycle's own report is written and approved, delete this cycle's own plan/prompt documents — only the finished report persists as the historical record. Separately, once this run's own screenshot folder is in place, delete the *previous* test cycle's screenshot folder(s) — keep only the most recent test's screenshots, to save disk space. Both leave a few dead links in already-finalized older reports; that's an accepted tradeoff, not an oversight.
- **Harness-vs-reality cross-check:** an automated browser harness mostly grades by reading the DOM (text content, element counts) — for any scenario it marks FAIL where other evidence (trace/log/screenshot) shows the underlying pipeline actually fired correctly, check that evidence before finalizing the grade. Don't assume a DOM-read script has already caught everything a human glance would.
- **Root-cause consolidation:** when 2+ scenarios show the same underlying failure, don't report N separate findings — name the one suspected root cause and list every scenario ID confirming it, so a reader can tell whether follow-up is one fix or several.
- **Known-deferred-scenario carve-out:** if a scenario tests functionality that hasn't shipped yet as of this run's baseline, grade it N/A-pending-[feature], not FAIL — check the assistant code's own phase/plan comments and the most recent report's own "out of scope"/"diagnostic only" scenarios for what's still pending. If this project tags assistant work by phase, tag each scenario with which phase it tests, so the report can separate "something shipped regressed" from "this is still pending work."
- **Execution mode:** headed (visible) browser, not headless — the point is to be able to watch it run.
- **Known environment gotchas:** carry forward anything discovered in a prior run that will recur — see your project's own prompt template for what's actually still relevant.

## Deliverable

Produce the plan by combining `QA/templates/base/qa-test-plan-base.md` with your project's own `qa-test-plan-project.md` — Summary section above Methodology, full scenario classification table (source-report scenarios plus any standing architectural scenario banks your project template defines), run order, and a report-format section pointing at `QA/templates/base/qa-test-report-base.md` (plus any project-specific report additions). Save it to `QA/Reports/qa-test-plan-<configuration>-<date>.md`.

Once I approve the plan (and separately approve actually running Playwright), execute it and write the finished report to `QA/Reports/assistant-qa-report-<configuration>-<date>.md` following the report template. Once that report is written and approved, delete this cycle's own plan/prompt documents per the retention policy above.
