<!-- Project template version: 1 (split out of the old monolithic qa-test-prompt-template.md, v2, on 2026-08-04 — see QA/templates/base/qa-prompt-base.md for the agnostic half this pairs with.) -->

# Project prompt additions: assistant QA test cycle — Wraps & Coffee

Use together with `QA/templates/base/qa-prompt-base.md`. This file supplies the specific Step-0 questions and environment detail that base file's own generic placeholders point back to.

## Step 0 — the specific questions this project always asks

1. **Which model(s) to test this run** — provider (Local/Ollama vs Claude), and if Local: which tag for the thinking role, and which tag for the vision role (they don't have to match — check `ollama show <tag>` for `Capabilities` before assuming a thinking-role tag can double as the vision role; if it can't, ask whether the vision-dependent scenario should run against a real vision-capable model instead, or be marked out of scope).
2. **Whether to reuse the existing seed fixture** — check `QA/Reports/` for the most recent report describing it (the standing fixture is `AutoDeler`, a car-parts catalogue, alongside the pre-existing `Matmeny`/food-menu catalogue) — reuse it if it still exists in the live dev instance, or re-seed from scratch if it's been cleaned up.
3. **Whether to include the diagnostic addendum** — a small re-run of a handful of Section A scenarios in one continuous session, purely to check whether this model shows session-length degradation. Optional, doesn't affect grading.

Don't proceed past this step without answers — these change materially between runs and guessing wrong wastes a full test cycle.

## Where this project's own harness/fixture live

- Harness script: `QA/scratchpad/qa/harness.mts` — see `qa-test-plan-project.md`'s own "Known harness state" section for what it already carries forward before writing anything new.
- Seed fixture: `AutoDeler` (see `qa-test-plan-project.md`'s own "Seed fixture convention").
- Known environment gotcha: this repo lives under an iCloud-Drive-synced folder — see `qa-test-plan-project.md`'s Methodology #15.

## Deliverable

Combine `QA/templates/base/qa-test-plan-base.md` with `QA/templates/project/qa-test-plan-project.md` (pull in Sections E/F/K and any relevant `server/assistant/entities/<entity>.qa-scenarios.md` files per that project template's own pointer table, if the cycle covers them). Save the result to `QA/Reports/qa-test-plan-<model>-<date>.md`.

Once approved (and Playwright execution separately approved), write the finished report to `QA/Reports/assistant-qa-report-<model>-<date>.md` following `QA/templates/base/qa-test-report-base.md`. Once that report is approved, delete this cycle's own plan/prompt documents per the base template's retention policy.
