# Test plan: 4-model comparison run (gemma3:4b → qwen3:8b → qwen3:4b → Claude Sonnet), fresh-session-by-default, plus first coverage of the new postChecks framework

**Status:** Plan only — not executed. Do not run any Playwright/browser automation from this plan without asking first (per this repo's CLAUDE.md).
**Template version:** Base 1 + Project 1 (`QA/templates/base/qa-test-plan-base.md` + `QA/templates/project/qa-test-plan-project.md`)

**Source scenarios:** `assistant-qa-report-qwen3-8b-2026-08-03.md` (41 scenarios, A.1–C.9b, fresh-session-by-default methodology) — reused verbatim. Its own classification (session/reason) is reused unchanged from the retired `qa-test-plan-qwen3-8b-2026-08-03.md`, since session classification depends on scenario semantics, not model choice.

**Same one battery, run three times.** This cycle runs the identical scenario set (A.1–C.9b + Section K) once per model/provider configuration below, **strictly sequentially** — each run is executed to completion and its own report written and saved *before* the configuration is switched to the next model. This is a load-bearing rule, not a scheduling nicety: it keeps each run's own environment baseline clean of another run's leftovers, and each report's own "how did this compare" verdict is written against a report that already exists, not a run still in flight. See "Execution sequence" below for the exact order and per-run deliverables.

## Summary

- **Model(s) under test — four sequential runs** (`qwen3:4b` added mid-cycle, after Run 2 completed, at the user's request — needed `ollama pull qwen3:4b` first, since it wasn't installed):
  1. Local (Ollama) `gemma3:4b` for **both** thinking and vision roles (installed, `completion`/`vision` capabilities — no separate vision model needed this run, unlike the other two; see Model & Configuration for the "no declared `tools` capability, but previously used successfully as this app's original baseline thinking model" caveat).
  2. Local (Ollama) — thinking role `qwen3:8b` (`completion`/`tools`/`thinking`), vision role `qwen2.5vl:3b` (`completion`/`vision`) — unchanged from the 2026-08-03 cycle's own split.
  3. Local (Ollama) — thinking role `qwen3:4b` (`completion`/`tools`/`thinking`, confirmed via `ollama show` — no vision), vision role `qwen2.5vl:3b` (same split reasoning as `qwen3:8b`). A smaller sibling of `qwen3:8b` — first QA pass for this specific tag.
  4. Claude — `claude-sonnet-4-5` (single model covers both roles natively, no split needed).
- **Session policy:** Fresh session (panel's own "New chat") immediately before each scenario, same exceptions as before (A.10; the paired clarification/gate/batch scenarios) — plus two *new* shared-session scenarios this cycle needs (K.8, K.12a/K.12b — see Section K), each needing a same-session prior lookup turn to seed real `DialogFocus` before its own actual test message. Applies identically within each of the three runs.
- **Environment:** Reusing the existing `AutoDeler` seed fixture across all three runs — re-measure the live baseline before **each** run starts (not just once), and clean up every scenario-created record before the next run begins, so run 2 and run 3 each start from the same clean baseline run 1 did. See Environment Setup and Execution Sequence below.
- **Scope (per run, same battery all three times):** All 41 IDs from the 2026-08-03 report (A.1–C.9b, reused verbatim) + new **Section K** (13 rows covering all 12 postChecks in `server/assistant/postChecks/registry.ts` — one check needs two adversarial variants, see K.12a/K.12b). The diagnostic addendum is **excluded** this cycle, for all three runs. Sections E/F (concurrent-turn safety, lookup disambiguation) and the six per-entity scenario banks (contactInfo/settings/mediaLibrary/screen/displayManager/orders — all shipped 2026-08-04, never yet run) are **out of scope for this cycle** — see the suggestion after this plan for why, not folded in silently.
- **What changed since the last run:**
  - This is the first cycle to run the same battery across multiple model tiers in one plan, specifically to produce a direct three-way comparison — `gemma3:4b` (the original baseline, last tested 2026-08-02), `qwen3:8b` (the immediately prior cycle, 2026-08-03), and Claude Sonnet (not yet tested against this exact 41+13-scenario battery).
  - Local's generative verify-pass on `lookupQuery`/`answerLookup`/`selectItem` was **removed** (kept only for `lookupBatch`) in favor of the new deterministic `server/assistant/postChecks/` framework (commit `c5707c4`, 2026-08-04) — Section K exists specifically to give that framework its first-ever QA pass, on all three configurations.
  - The four real bugs the 2026-08-03 report found on `qwen3:8b` — the category `catalogueId` "food-menu" bias (B.2/B.3a/b, B.4, B.8, C.2), the `lookup_batch` hallucination/pronoun-misresolution (A.10), the batch per-card collapse bug (C.3), and the B.9/B.10 "silent stall" (corrected post-run to a harness gap, not a real bug) — all have fixes already applied at the app level, so they apply to all three runs, not just the `qwen3:8b` one.
  - Every trace entry now carries a `checks: [{name, ok, reason?, action?, attempt}]` array (Methodology #17) — read it directly for Section K instead of only inferring from screenshots.
  - The QA templates themselves were restructured today into a base/project split, with per-entity scenario banks moved to `server/assistant/entities/<entity>.qa-scenarios.md` files — this plan is the first one built on the new structure, and the first to need a multi-run structure the base/project templates don't yet have a named pattern for (see the suggestion after this plan).
- **Headline things to watch for:**
  - How does the three-way comparison actually look — does `qwen3:8b` clearly outperform `gemma3:4b` (as the 2026-08-03 report predicted going in), and does Claude clearly outperform both local models, or are there specific scenario categories where that ordering doesn't hold?
  - Does removing local's generative verify-pass on `lookupQuery`/`selectItem`/`answerLookup` regress anything in Section A that the new deterministic postChecks don't actually cover — check this on **both** local runs, since it's a local-provider-only change (Claude's own `useVerifyPass` stayed all-`true`).
  - Do the four specific 2026-08-03 findings (found on `qwen3:8b`) come back clean on `qwen3:8b` again, and were they ever actually present on `gemma3:4b`/Claude to begin with (the original 2026-08-02 `gemma3:4b` report predates some of these fixes, so this may be that config's own first clean look at them)?
  - Section K is this framework's first-ever QA pass on any configuration — a check that never fires on its own adversarial trigger is a real finding (the check may be broken, or the trigger didn't reproduce the failure mode on that particular model), not a silent pass. Retry once per the standing retry rule before concluding either way, and say plainly in each report which outcome it was — a check that fails to fire on the weak local model but does fire correctly on Claude is itself informative, not a contradiction.

## Execution sequence

*The controlling structure for this cycle — four full passes through the same battery, run back-to-back, each finished (through its own written and saved report) before the next one's configuration is set. `qwen3:4b` was added mid-cycle (after Run 2 completed) — a smaller sibling of `qwen3:8b`, needed downloading via `ollama pull qwen3:4b` before Run 3 could start.*

| Run | Configuration | Deliverable report | Depends on |
| --- | --- | --- | --- |
| 1 | `gemma3:4b` (thinking + vision, same model both roles) | `QA/Reports/assistant-qa-report-gemma3-4b-2026-08-04.md` | Environment Setup completed fresh |
| 2 | `qwen3:8b` (thinking) + `qwen2.5vl:3b` (vision) | `QA/Reports/assistant-qa-report-qwen3-8b-2026-08-04.md` | Run 1's report written and saved; environment re-verified clean (Run 1's own scenario-created records removed, `AutoDeler` fixture intact) before Run 2's first scenario |
| 3 | `qwen3:4b` (thinking) + `qwen2.5vl:3b` (vision — no vision capability of its own, same split reasoning as `qwen3:8b`) | `QA/Reports/assistant-qa-report-qwen3-4b-2026-08-04.md` | Run 2's report written and saved; environment re-verified clean before Run 3's first scenario |
| 4 | `claude-sonnet-4-5` (single model, both roles) | `QA/Reports/assistant-qa-report-claude-sonnet-4-5-2026-08-04.md` | Run 3's report written and saved; environment re-verified clean before Run 4's first scenario |

**Per-run procedure (repeat four times):**
1. Set the model/provider configuration for this run (Settings → Integrations, or the panel's own kebab menu per-chat override — set it globally at the start of the run, same as prior single-model cycles).
2. Confirm/re-measure the live environment baseline (Environment Setup below) — this matters more here than in a single-model cycle, since a baseline drifted by the *previous* run's own leftover cleanup gap would silently corrupt this run's own grading.
3. Execute the full battery (A.1–C.9b + K.1–K.12b) per the classification table and run order below, exactly as a single-model cycle would.
4. Write and save this run's own report, following `QA/templates/base/qa-test-report-base.md`, to the filename in the table above.
5. Clean up every record this run's own scenarios created (keep `AutoDeler` itself in place) — verified against real data, same as the standing cleanup policy, so Run N+1 starts from the same clean baseline Run N did.
6. Only then move to the next run's own configuration switch (step 1 again, next row).

Do not interleave — don't run a scenario from Run 2 before Run 1's own report is written, and don't switch the model configuration mid-battery. If a run's execution needs to pause partway through (context limits, an unexpected blocker), resume that same run to completion before starting the next one's configuration switch, rather than skipping ahead.

## Methodology

*Merged from `QA/templates/base/qa-test-plan-base.md` (rules 1–12) and `QA/templates/project/qa-test-plan-project.md` (rules 13–17, "Known harness state," "Known app-level findings") into one numbered list, per the project template's own instruction not to present these as two separate lists.*

1. **Step 0 — ask before assuming anything.** Answered this cycle via `AskUserQuestion` (seed fixture, diagnostic addendum, postChecks scope) plus a direct follow-up instruction to extend the original single-model plan into three sequential runs: `gemma3:4b` → `qwen3:8b` → `claude-sonnet-4-5`, one report each, written in order. Seed fixture = reuse `AutoDeler` across all three runs; diagnostic addendum = skip, all three runs; postChecks scope = dedicated new Section K (not folded into existing IDs), run against all three configurations.
2. **Session-classification principle.** A scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state. A scenario that only needs a *real record to already exist* does not need a shared session.
3. **Retry-once rule.** Use the app's own in-app retry (e.g. the Draft-Quality Gate's "Prøv igjen") when a draft actually reached a reviewable state but looks wrong; fall back to a fresh session + resend when nothing reached a testable state at all. Only mark a scenario failed-to-reach-that-state if the retry also comes up empty.
4. **Diagnostic addendum.** Excluded this cycle (per Step 0 answer).
5. **Cleanup policy.** Keep `AutoDeler` in place at the end. Only clean up records individual scenarios created on top of it. Verify every cleanup claim against real data (`server/data/*.json` or the admin UI), never the assistant's own self-report.
6. **Retention policy.** Once **all three** of this cycle's reports are approved, delete this plan (and any prompt document) — only the three finished reports persist; don't delete the plan after just the first or second report, since it's still driving the remaining run(s). Once this cycle's own three new screenshot folders exist (`QA/assistant-qa-screenshots-gemma3-4b/`, `-qwen3-8b/`, `-claude-sonnet-4-5/`), delete `QA/assistant-qa-screenshots-qwen3-8b/` from the *previous* cycle (2026-08-03, now superseded) — the three new folders are three distinct configurations within this same cycle, not sequential re-tests of each other, so keep all three rather than only the newest.
7. **Harness-vs-reality cross-check.** For any FAIL where the trace/`checks[]` shows the underlying pipeline actually fired correctly, open the real screenshot before finalizing the grade.
8. **Root-cause consolidation.** When 2+ scenarios show the same underlying failure, name the one suspected root cause and list every confirming scenario ID, rather than reporting N separate findings.
9. **Known-deferred-scenario carve-out.** None apply to A–C or Section K this cycle — all tested functionality has shipped as of this run's baseline.
10. **Phase attribution.** Not used for A–C (no phase-labeling system existed when those scenarios were written — confirmed in the 2026-08-03 plan). Section K rows are tagged "Shipped (postChecks framework, commit `c5707c4`)" in the project template.
11. **Execution mode.** Headed (visible) Chromium, not headless. Confirm `QA/scratchpad/qa/harness.mts` still has `headless: false` before starting.
12. **Cadence.** Event-driven — this cycle specifically re-verifies four fixed bugs and gives the new postChecks framework its first-ever pass.
13. **What "fresh session" means mechanically.** Calling the panel's own "New chat" button inside one continuously-running browser window. `localStorage`-backed settings (posture, per-chat model overrides, conversation log) persist across "New chat" clicks — re-confirm against `AssistantPanel.tsx`'s own state declarations if this has changed materially since 2026-08-03 (it has changed today — `flaggedChecks`/`conversationId` plumbing was added — re-verify session-scoping still holds for the new fields too).
14. **Reuse `QA/scratchpad/qa/harness.mts` as-is** before writing new scenario helpers — see "Known harness state" below.
15. **Known environment gotcha.** This repo lives under an iCloud-Drive-synced folder — heavy concurrent writes into `QA/scratchpad/` during a long run can spin off a `"folder 2"` conflict-duplicate. Sync noise, not data loss.
16. **Concurrent-turn safety needs `sendChatConcurrent`.** Not applicable this cycle (Section E out of scope), noted for completeness since the rule numbering carries forward regardless.
17. **Trace `checks[]` array.** Read it directly (via `captureLatestTraceViaClipboard`) for every Section K scenario. A check `name` absent from the array for a step that should have run it is itself a finding — the check didn't fire at all — not the same as `ok:true`.

### Known harness state

*From `qa-test-plan-project.md` — read before writing a new harness helper:*
- `login()` defaults the dashboard to Norsk itself.
- `sendChat`'s trace capture reads the "Copy conversation to clipboard" export (`captureLatestTraceViaClipboard`), not DOM click-throughs — this is also what exposes the new `checks[]` array cleanly (built from React state).
- `sendChat`'s `reply` also captures the sibling `.assistant-list-attachment` element.
- `productExistsInCategory` expands the category section before checking.
- `reachBatchReview` checks for the Draft-Quality Gate first, before checking for batch-review cards.
- `closeModelMenu` now waits for the transcript to actually reappear before returning, closing a real animation-timing race caught mid-run (see the project template's own "Known harness state" for the full explanation) — the model-menu view's 250ms exit animation was racing against the next scenario's own open-check, causing an already-open panel to get wrongly toggled closed on every other scenario.

### Known app-level findings being re-verified this cycle

*From `qa-test-plan-project.md` — see that file for the full list; these four are the ones this cycle specifically re-checks:*
1. Chat-driven update/delete via search (B.9/B.10) — previously found to be a harness gap (a real confirmation prompt the test script never clicked), not a stall. Re-verify the confirmation-skip fix (`useAssistantFlow.ts`'s `startOperation`) now correctly skips the tap entirely for an unambiguous candidate.
2. Batch per-card collapse (C.3) — fixed via narrowing an effect's dependency to `flow.state.status` (`AssistantPanel.tsx`). Re-verify confirming one card leaves the others staged.
3. Category `catalogueId` "food-menu" bias (B.2/B.3a/b, B.4, B.8, C.2) — fixed via `nullable()` on `category.ts`'s schema. Re-verify the model now either leaves it null (triggering a normal clarification) or correctly resolves it from context — and separately, K.12a/K.12b exercise the *new* `catalogueId-context-consistency` postCheck backstop on top of that fix.
4. `lookup_batch` hallucination + pronoun-misresolution (A.10) — fixed via narrowing entity-prefilter detection. Re-verify A.10 no longer hallucinates non-existent products or misattributes real ones.

## Known deferred scenarios

None — all tested functionality (A–C, Section K) has shipped as of this run's baseline.

## Model & configuration

**Run 1 — `gemma3:4b`:**
- **Configuration under test:** Local (Ollama), `gemma3:4b` for both thinking and vision roles.
- **Capability constraints confirmed:** `ollama show gemma3:4b` → `Capabilities: completion, vision` — no declared `tools` capability. This is a real gap against the app's structured tool-calling pipeline in principle, but `gemma3:4b` is this app's own **original QA baseline** (`assistant-qa-report-2026-08-02.md`, referenced repeatedly in later reports as "the original baseline") — it was already used successfully as the thinking-role model in that cycle, so this is a previously-validated configuration, not a new capability risk to re-litigate. If tool-calling behaves visibly worse/differently than it did in that first cycle, note that explicitly in the report rather than assuming parity.
- **Scope note:** `gemma3:4b`'s own `vision` capability means no separate vision-role model is needed this run (unlike Run 2) — simpler configuration, one model for both roles.

**Run 2 — `qwen3:8b` / `qwen2.5vl:3b`:**
- **Configuration under test:** Local (Ollama) — thinking `qwen3:8b`, vision `qwen2.5vl:3b`.
- **Capability constraints confirmed:** `ollama show qwen3:8b` → `Capabilities: completion, tools, thinking` (no vision). `ollama show qwen2.5vl:3b` → `Capabilities: completion, vision` (no tools/thinking) — the split is required, not optional. Unchanged from the 2026-08-03 cycle.

**Run 3 — `qwen3:4b` / `qwen2.5vl:3b`** (added mid-cycle, after Run 2 completed, at the user's request):
- **Configuration under test:** Local (Ollama) — thinking `qwen3:4b`, vision `qwen2.5vl:3b`.
- **Capability constraints confirmed:** `ollama show qwen3:4b` → `Capabilities: completion, tools, thinking` (no vision) — confirmed only after downloading it (`ollama pull qwen3:4b`), since it wasn't installed when this plan was first written. Same split reasoning as `qwen3:8b`.

**Run 4 — `claude-sonnet-4-5`:**
- **Configuration under test:** Claude, `claude-sonnet-4-5` — single model, both thinking and vision roles natively.
- **Capability constraints confirmed:** N/A — Claude's own capability tiers don't have this app's Ollama-specific thinking/vision role split; `useVerifyPass` stays `true` across every step for every Claude tier (see `steps.ts`'s `ASSISTANT_MODEL_CAPABILITIES`), unlike the local provider's now-partial verify-pass.

**Scope note (all four runs):** No scenario in A.1–C.9b or Section K exercises an image-attach flow — the vision-role choice is configuration-only for every run, including Run 1 where it's not even a separate model.

## Environment setup (prerequisite, before **each** run — repeat for all four runs)

- Confirm `AutoDeler` still exists in the live dev instance (7 categories: Dekk/Bremser/Motorolje/Batterier/Lydanlegg/Interiør/Tilbehør) — the 2026-08-03 report left it in place at 54 products / 7 categories, but re-confirm rather than trust that number for Run 1, and re-confirm before every subsequent run that the *previous run's own* cleanup step actually landed (a missed cleanup item would otherwise silently inflate the next run's own baseline counts and invalidate its grading against earlier runs/the historical reports — this actually happened once in this cycle: Run 2 missed cleaning up K.10's own "Vegetar-bowl," caught by this exact re-measurement step before Run 3 started).
- Re-measure the live baseline immediately before **each** run's own first scenario: total product count, active discount count, catalogue count, category count, event count. The 2026-08-03 report's own final-verification numbers (109 products store-wide, 3 discounts, 2 catalogues, 15 categories after B.8's leftover — should be back to 14 post-cleanup, 1 event) are Run 1's own reference point; every later run should re-measure against the *actual* state left behind by the run immediately before it, not against these original numbers repeatedly.
- Confirm `QA/scratchpad/qa/harness.mts` still has `headless: false` (once, at the start of Run 1 — this doesn't change between runs).
- Confirm the dashboard's ingestion posture ("Ekstra forsiktig modus") is on **Automatisk** by default at the start of each run, per standing convention, except where a scenario (B.11a/b) explicitly overrides it within that run.

## Full scenario classification

*One battery, executed identically three times (once per run in the Execution Sequence above) — the session/reason classification below doesn't change per model, only the configuration executing it does.*

### Section A — Read/lookup pipeline

| ID | Session | Reason |
| --- | --- | --- |
| A.1 | Fresh | Plain count against current persisted data only. |
| A.2 | Fresh | Filtered count against current persisted data only. |
| A.3 | Fresh | Which-product-on-sale list against current persisted data only. |
| A.4 | Fresh | Bulk list request against current persisted data only. |
| A.5 | Fresh | Compound imperative+interrogative, single turn, no prior context needed. |
| A.6 | Fresh | Compound two-interrogative, single turn, no prior context needed. |
| A.7 | Fresh | Tests that a non-command phrase does *not* trigger a create — independent of any other scenario's context. |
| A.8/A.11 | Fresh | Ambiguous-name clarification check; needs two real same-named products to exist (persisted data), not a shared session. |
| A.9a | Fresh | Bilingual LED filter, Norsk UI; persisted data only. Run before A.9b. |
| A.9b | Fresh | Bilingual LED filter, English UI; persisted data only, independent of A.9a's session. |
| A.10 | Fresh, own 2-turn continuity | The scenario's entire point is pronoun/ordinal resolution to the prior turn's own list — its two turns must stay in the one fresh session they start in. |
| A.12a | Fresh | Event count/list under Norsk UI; persisted data only. |
| A.12b | Fresh | Event count/list under English UI; persisted data only, independent of A.12a. |
| A.extra | Fresh | Catalogue/category count; persisted data only. |

### Section B — Single-record ingestion

| ID | Session | Reason |
| --- | --- | --- |
| B.1 | Fresh | Single create request, no dependency on prior turns. Its own created product is a data (not session) dependency for B.9/B.10. |
| B.2/B.3a | Fresh, own 2-turn continuity | Ask the ambiguous create request, then tap the still-open clarification option — not shared with B.2/B.3b or B.4. |
| B.2/B.3b | Fresh, own 2-turn continuity (separate) | Re-ask an equivalent ambiguous request, then answer by typing in chat. |
| B.4 | Fresh, own 2-turn continuity (separate) | Re-ask again, then give a deliberately unclear answer to the still-open clarification. |
| B.5a | Fresh, own 2-turn continuity | Stage a low-confidence draft under Safe posture, then click "Se detaljer" on the still-open gate. |
| B.5b | Fresh, own 2-turn continuity (separate) | Re-stage a fresh draft, then click "Prøv igjen." |
| B.5c | Fresh, own 2-turn continuity (separate) | Re-stage a fresh draft, then click "Avbryt." |
| B.6 (Confirm path) | Fresh, own 2-turn continuity | Stage a fresh draft under the gate, then Confirm through it. |
| B.6 (Edit path) | Fresh, own 2-turn continuity (separate) | Stage a fresh draft under the gate, then Edit through it. |
| B.7 | Fresh | Single create request testing the price/discount display fix; no dependency on prior turns. |
| B.8 | Fresh | Single create request testing category custom-field fabrication; no dependency on prior turns. |
| B.9 | Fresh (data dependency, not session) | Needs the real product B.1 created to already exist. Run after B.1; if B.1's create doesn't land, seed the target product manually first. |
| B.10 | Fresh (data dependency, not session) | Deletes the same real record B.9 updated — run after B.9. |
| B.11a | Fresh | Force posture to Av via the kebab override, then stage a draft to observe the tagged draft+verify pair. |
| B.11b | Fresh (independent of B.11a's session) | Posture is a persistent device setting, not session state — only needs to run after B.11a in wall-clock order. |
| B.12 | No chat session involved | Manual admin-form creation, entirely outside the assistant. |

### Section C — Batch ingestion

| ID | Session | Reason |
| --- | --- | --- |
| C.1a | Fresh | Natural non-imperative phrasing check; single turn, no dependency. |
| C.1b | Fresh | Explicit-imperative batch create; tests whether stale-draft context bleed is gone under fresh sessions. |
| C.2 | Fresh, own 2-turn continuity | Stage its own ambiguous batch-create request, then engage with whatever clarification surfaces. Not shared with C.1b. |
| C.3 | Fresh, own 2-turn continuity | Stage its own new batch, then exercise Confirm/Edit/Remove per card. |
| C.4 | Fresh, own 2-turn continuity | Stage its own new batch (one card with an invalid discount), then check Confirm all is disabled while per-card actions still work. |
| C.5 | Fresh, own 2-turn continuity | Stage its own clean batch, then click Confirm all. |
| C.6 | Fresh, own 2-turn continuity | Stage its own batch, then click Cancel all. |
| C.7 | Fresh, own 2-turn continuity | Stage its own events batch, then check for cross-record field contamination between its own cards. |
| C.8 | Fresh | Single-record message; confirms no false batch UI appears. |
| C.9a | Fresh, own 2-turn continuity | Stage its own 3-record batch under Safe posture, then check the gate. |
| C.9b | Fresh, own 2-turn continuity | Stage its own 6-record batch under Safe posture, then check the gate's "…og N til" overflow line — explicitly its own fresh session so C.8's leftover draft cannot bleed in. |

### Section K — Deterministic post-checks (new this cycle)

*Reused verbatim from `QA/templates/project/qa-test-plan-project.md`'s own Section K table — see that file for the full check-by-check design rationale, expected verdicts, and caveats. Reproduced here in classification-table form:*

| ID | Session | Reason |
| --- | --- | --- |
| K.1 | Fresh | `filter-field-exists` adversarial trigger; single turn, no prior context needed. |
| K.2 | Fresh | `filter-not-brand-name` adversarial trigger; single turn. |
| K.3 | Fresh | `filter-op-shape-mismatch` adversarial trigger; single turn. |
| K.4 | Fresh | `no-fabricated-selection` adversarial trigger; single turn. |
| K.5 | Fresh | `real-ambiguity-forces-clarify` adversarial trigger; needs real multi-candidate data (persisted), not a shared session. |
| K.6 | Fresh | `entity-action-consistency` adversarial trigger; single turn. |
| K.7 | Fresh | `entity-searchtext-consistency` adversarial trigger; single turn. |
| K.8 | **Shared, own 2-turn continuity** | `pronoun-not-searchtext` needs Turn 1 to establish real `DialogFocus` before Turn 2's pronoun reference can be meaningfully tested — same shape as A.10. |
| K.9 | N/A (code review) | `no-hallucinated-values-in-safe-mode` is not adversarially triggerable via chat under current code — see the project template's own caveat on this row. |
| K.10 | Fresh | `input-mentioned-values-only` adversarial trigger; single turn. |
| K.11 | Fresh | `dual-price-both-fields` adversarial trigger; single turn. |
| K.12a | **Shared, own 2-turn continuity** | `catalogueId-context-consistency` true-positive case needs Turn 1's own `DialogFocus` before Turn 2's category-creation message. |
| K.12b | **Shared, own 2-turn continuity** (independent of K.12a's session, or reuse it — see Run order) | `catalogueId-context-consistency` false-positive guard — same shape as K.12a but Turn 2 explicitly names a different, correct catalogue. |

## Run order

1. **B.1 before B.9 before B.10** (data dependency). If B.1's create doesn't actually go through, seed the target product manually via the ordinary admin form so B.9/B.10 can still be graded on update/delete mechanics.
2. **A.9a before A.9b.** A.9a establishes whether the bilingual-fallback filter mechanism works at all; read A.9b's result in that light if A.9a fails.
3. **B.11a before B.11b**, to test the posture-override round-trip (Av → Automatisk) in the intended direction.
4. **K.12a and K.12b can share one session's own Turn 1** (the AutoDeler-focus-setting lookup) if run back-to-back — K.12a's Turn 2, then K.12b's Turn 2, both reading off the same established focus — or each can run its own independent Turn 1 in separate fresh sessions. Either is valid; note which was actually used in the report, since it affects how directly the two results can be compared.
5. No other scenario (A–C or K) has an ordering requirement.

## Report format

**Four separate reports, one per run** (see Execution Sequence for filenames) — not one combined report. Each follows `QA/templates/base/qa-test-report-base.md` independently: same PASS/PARTIAL/FAIL/N/A/ERROR/CAPTURED status vocabulary, trace notes, screenshot reference, key-findings summary (with root-cause consolidation), and cleanup table as prior cycles. Each report's own "Overall verdict" (report template item #6) should name what it's comparing against:
- **Run 1's report** (`gemma3:4b`) compares against the original `assistant-qa-report-2026-08-02.md` baseline — same model, but against today's fixed app code and the new Section K.
- **Run 2's report** (`qwen3:8b`) compares against both the 2026-08-03 `qwen3:8b` report (same model, prior app code) *and* this cycle's own Run 1 report (different model, same app code) — two different, both-valid comparison axes, worth keeping separate rather than blended into one verdict.
- **Run 3's report** (`qwen3:4b`) compares against this cycle's own Run 1 (`gemma3:4b`, a similarly small local model) and Run 2 (`qwen3:8b`, the larger sibling of the same model family) — first-ever QA pass for this specific tag, no prior report to compare against directly.
- **Run 4's report** (Claude Sonnet) compares against this cycle's own Run 3, and against `assistant-qa-report-claude-2026-08-02.md` if that report's own scenario set overlaps meaningfully with this one.

For Section K specifically, in every report, additionally state per check: adversarial row fired as designed / fired differently than expected / never fired (with the retry noted) — don't compress this into a plain PASS/FAIL only, since "never fired" and "fired and resolved correctly" are different findings a plain PASS would conflate. A check behaving differently across the four configurations (e.g. firing reliably on the weak local models but never needing to on Claude) is itself worth a line in Run 4's own report.

## Verification

- Every ID from `assistant-qa-report-qwen3-8b-2026-08-03.md`'s scenario list (41 total, A.1–C.9b) appears exactly once in the classification table above.
- Every one of the 12 postChecks in `server/assistant/postChecks/registry.ts`'s `CHECK_ENABLED` has exactly one adversarial row in Section K (`catalogueId-context-consistency` has two, K.12a/K.12b, by design).
- The model/configuration decision, environment setup, and report-format sections are all filled in for all four runs, not left as brackets.
- No known-deferred scenarios exist in this list, so that section is correctly left empty rather than a stub.
- **All four reports are written, in order** — no run's own report is started before the previous run's is saved.
- Nothing in this plan tells anyone to execute Playwright/browser automation without asking first.

## When to run this cycle

Event-driven — this run specifically produces a direct three-way comparison (`gemma3:4b` vs. `qwen3:8b` vs. Claude Sonnet) against the identical, current battery, re-verifies four bugs the 2026-08-03 cycle found and fixed on all three configurations, and gives the brand-new postChecks framework (shipped the same day as this plan) its first-ever QA pass on all three.
