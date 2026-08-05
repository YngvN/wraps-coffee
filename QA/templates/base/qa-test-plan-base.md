<!-- Base template version: 1 (split out of the old monolithic qa-test-plan-template.md, v9, on 2026-08-04 — that file's project-specific detail moved to QA/templates/project/qa-test-plan-project.md and to per-entity server/assistant/entities/<entity>.qa-scenarios.md files; see that project template's own header for what moved where. This file holds only the methodology that would still make sense for a QA cycle on a different, unrelated project's own chat-driven admin assistant. If you're about to add something here that names a file path, a feature name, a specific provider pair, or a specific past bug, it almost certainly belongs in the project template instead — see this file's own "agnostic" self-check note at the bottom.) -->

# Base test plan: assistant QA test cycle

**Status:** Plan only — not executed. Do not run any Playwright/browser automation from a plan built on this template without asking first.
**Base template version:** 1

This file is the durable, project-agnostic half of a QA test plan. A real plan combines this with a project template (e.g. `QA/templates/project/qa-test-plan-project.md`) that supplies the concrete provider/model options, the seed fixture, the known-findings history, and any standing architectural scenario banks — this file never names any of those itself.

## Summary

*A short, scannable overview — a few bullets, written so someone can grasp the whole plan without reading the rest. Fill in before Methodology, not after.*

- **Model(s)/configuration under test:** [whatever this project's own capability roles are — fill in per the project template's own conventions]
- **Session policy:** [fresh-per-scenario (default) / continuous / mixed — one line on why]
- **Environment:** [reusing existing seed fixture / re-seeding from scratch — current baseline counts if known]
- **Scope:** [N scenarios from the source report; any scenarios added/dropped/changed and why]
- **What changed since the last run:** [model, methodology, environment — whatever's actually different this time]
- **Headline things to watch for:** [1-3 bullets — a known weak spot from a prior run worth specifically re-checking, a new risk this configuration introduces, etc.]

## Methodology

*The durable, reusable rules — copy these forward from the last plan unless something genuinely needs to change. Don't re-litigate these from scratch each time. A project template may add its own numbered rules after these; keep the numbering of this file's own rules stable so a reader can tell "core rule" from "project addition" at a glance.*

1. **Step 0 — ask before assuming anything.** Before researching or writing anything, ask about whatever this plan needs to know before it can be written — which configuration to test, whether to reuse or reset the environment, and any other cycle-specific choice that would waste a full cycle if guessed wrong. The project template lists the actual questions this project's own Step 0 needs; this rule is just the standing "ask, don't guess" posture.
2. **Session-classification principle.** A scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state — pronoun/reference resolution, reacting to the assistant's own last reply, answering a still-open clarification, correcting a just-proposed unconfirmed draft, per-item actions on an unconfirmed batch. A scenario that only needs a *real record to already exist* does not need a shared session — persisted app data outlives the session that created it. Classify every scenario against this principle by reading the source report's own text for it, not by guessing from the scenario's name.
3. **Retry-once rule — use the app's own retry affordance when one exists, fall back to a fresh session when it doesn't.** When a failure is specifically "the app reached a reviewable/draft state but its content looks wrong," retry via whatever in-app mechanism restores the original input for a real resend, in the same session — that's the faithful retry a real user would use. When the failure is that nothing ever reached a testable state at all (no review state, no clarification, no batch, an empty reply, a timeout), there's no button to click — the precondition itself never fired — so retry by starting a fresh session and resending the same input instead. Keep both attempts' notes in the report and only mark the scenario as failed-to-reach-that-state if the retry (whichever kind) also comes up empty.
4. **Diagnostic addendum (optional, doesn't affect grading).** After the fresh-per-scenario pass, optionally re-run a handful of read/lookup scenarios back-to-back in one continuous session, purely to check whether this configuration shows mid-session degradation a prior run may have documented. Label it clearly as not affecting any scenario's PASS/FAIL grade.
5. **Cleanup policy.** Keep the seed fixture in place at the end (don't tear it down) so a future re-test doesn't need to re-seed from scratch. Only clean up records individual scenarios created on top of it. Verify every "this was created" claim against real data (not the assistant's own self-report) before writing it into the cleanup table — a script's own "confirmed=true" flag can be a false positive if it only checked that a review panel existed, not that clicking confirm actually persisted.
6. **Retention policy.** Once a cycle's own report is finished, delete that cycle's own plan/prompt documents — **only the finished report persists** as the durable historical record; a plan is scaffolding for the run, not something a future reader needs once the report exists. Separately, once this run's report and its own screenshot folder are in place, delete the *previous* cycle's screenshot folder(s) too — keep only the most recent cycle's screenshots, to save disk space. Both of these will leave a few dead links in older, already-finalized reports (a screenshot path, or a "see the plan for full classification" pointer); that's an accepted tradeoff (the report text stands on its own) rather than an oversight.
7. **Harness-vs-reality cross-check.** An automated browser harness typically grades by reading the DOM (text content, element counts) — trust that as a first pass, not a final verdict. For any scenario the harness marks FAIL where other evidence (a trace, a log, a screenshot) shows the underlying pipeline actually fired correctly, check that evidence before writing the grade down. If it disagrees with the harness's own read, the other evidence is truth — DOM-reading scripts have real, specific blind spots (content in a sibling element, a label that changed, timing against a still-animating transition) that are easy to miss until they cause a false negative once.
8. **Root-cause consolidation, not just a symptom count.** When 2+ scenarios show the same underlying failure, don't report them as N separate findings — name the suspected single root cause in the Key Findings section and list every scenario ID that confirms it. This is what actually tells a reader whether follow-up work is one fix or several.
9. **Known-deferred-scenario carve-out.** Some scenarios test functionality that hasn't shipped yet as of this run's own baseline. List these explicitly (see "Known deferred scenarios" below) and grade them **N/A — pending [feature/phase]**, not FAIL — a report's tally should never make known future work look like a regression.
10. **Phase attribution.** If the project's own code is developed in labeled phases, tag each scenario in the classification table with which phase it tests. This is what lets a report answer "did anything *shipped* regress?" separately from "what's still pending?" as the phase list grows.
11. **Execution mode.** Headed (visible) browser, not headless — the point is to be able to watch it run.
12. **Cadence.** Event-driven — after a labeled phase of work lands, or when evaluating a new configuration worth benchmarking. Not a fixed schedule.

## Known deferred scenarios

*Scenarios in the source report's own list that test functionality not yet shipped as of this run's baseline. They still run for diagnostic value — worth knowing whether a not-yet-shipped feature is at least trending toward working — but are graded N/A-pending, not FAIL, in the final report.*

| ID | Pending on | Why it still runs |
| --- | --- | --- |
| [ID] | [feature/phase name] | [what diagnostic value it has anyway, if any — delete the row if it has none and should just be skipped] |

## Model & configuration

*What "configuration" means is project-specific (a single model, a provider + tag pair, a thinking/vision role split, a feature-flag combination, ...) — the project template defines the actual options; this section just fills in this cycle's own choice and confirms any capability constraint was checked, not assumed.*

- **Configuration under test:** [fill in per the project template's own conventions]
- **Capability constraints confirmed:** [any capability check this configuration needed before assuming it could serve every role this cycle needs — state the check and its result, don't just assume]
- **Scope note:** [does any scenario in this run's scenario list actually exercise a capability that's configuration-sensitive? If not, say so — the choice is configuration-only and doesn't affect scenario selection.]

## Environment setup (prerequisite, before any scenario runs)

- [Re-seed if the fixture doesn't currently exist — or confirm it does and skip.]
- [Re-measure the actual current baseline right after seeding/confirming — don't trust hardcoded numbers from a prior report; environment drift between runs is expected.]
- [Any unresolved artifact from a prior report worth checking before this run, so it isn't rediscovered mid-grading and mis-attributed to this configuration.]

## Full scenario classification

*One row per scenario ID from the source report, reused verbatim, plus any standing architectural scenario-bank rows the project template defines. Fresh vs. shared + a one-line reason citing the session-classification principle above. `Phase` is which shipped phase (or "pending") the scenario actually tests — leave the column out entirely if this project isn't using phase labels.*

| ID | Session | Reason | Phase |
| --- | --- | --- | --- |
| [ID] | Fresh / Shared (with which) | [one line] | [e.g. Phase 2 / pending] |

## Run order

*Any order is fine for plain "Fresh" scenarios. Call out explicitly:*
- Any genuine **data** dependency (not session) — e.g. an update/delete scenario needs an earlier create scenario's own record to actually exist; note the fallback if that create doesn't succeed this time (seed the target manually so the later scenario can still be graded on its own merits).
- Any ordering needed to read one scenario's result in light of another's (e.g. run the "does the fallback mechanism work at all" scenario before the "does it work in this other language/direction" one).
- Any scenario that needs a same-session prior turn to seed state (in-conversation memory, dialog focus, etc.) before its own real test message.

## Report format

Follow `QA/templates/base/qa-test-report-base.md` (plus any project-specific report additions the project template calls out). Same PASS/PARTIAL/FAIL/N/A/ERROR status vocabulary, trace notes, screenshot reference, key-findings summary, and cleanup table as prior reports, so results stay comparable across runs.

## Verification

- Every ID from the source report's own scenario list appears exactly once in the classification table above.
- The configuration decision, environment setup, and report-format sections are all filled in, not left as brackets.
- Any scenario testing not-yet-shipped functionality is listed under Known Deferred Scenarios, not silently left to fail the tally.
- Nothing in this plan tells anyone to execute Playwright/browser automation without asking first.

## Keeping this file agnostic

Before adding anything to this file, check: would a QA cycle for a *different* project's own chat-driven admin assistant be able to use it unmodified? If what you're adding names a specific file path, a specific feature/button name, a specific provider pair, or a specific past bug, it belongs in that project's own project template instead — this file should only ever grow by adding a genuinely new, project-independent rule.
