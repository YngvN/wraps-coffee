# Test plan: re-run the assistant QA pass on qwen3:8b, fresh-session-by-default

**Status:** Plan only — not executed. Do not run any Playwright/browser automation from this plan without asking first (per this repo's CLAUDE.md).
**Template version:** 2

**Source scenarios:** `assistant-qa-report-normistral-2026-08-03.md` (40 scenarios, A.1–C.9b, fresh-session-by-default methodology) — reused verbatim. Its own companion plan `qa-retest-normistral-plan.md` supplies the full per-scenario classification reused below unchanged, since session classification depends on scenario semantics, not model choice.

## Summary

- **Model(s) under test:** Local (Ollama) — thinking role `qwen3:8b` (installed, 5.2 GB, `completion`/`tools`/`thinking` capabilities), vision role `qwen2.5vl:3b` (installed, `completion`/`vision` capabilities — unchanged from the last two cycles, since `qwen3:8b` has no vision capability of its own).
- **Session policy:** Fresh session (panel's own "New chat") immediately before each scenario, as the last cycle validated — the only exceptions are scenarios whose own point is in-conversation continuity (A.10; the paired clarification/gate/batch scenarios), same as before.
- **Environment:** Reusing the existing `AutoDeler` seed fixture (confirmed present, 54 products / 7 categories) — no re-seed needed. Baseline re-measured fresh for this run rather than trusted from the prior report (see Environment setup — catalogue count has drifted from 3 to 2 since the last cycle).
- **Scope:** All 40 scenarios from the source report (A.1–C.9b), reused verbatim, plus the optional diagnostic addendum (A.1–A.6 in one continuous session).
- **What changed since the last run:** Model swap only — `qwen3:8b` replaces `marksverdhei/normistral-it:7b` as the thinking model. Vision model, session policy, seed fixture, and scenario list are all unchanged from the normistral cycle. Environment has drifted slightly (catalogue count 2 vs. 3 previously; see below).
- **Headline things to watch for:**
  - Catalogue/category placement reliability — the normistral run's single most consistent finding was records landing in the wrong catalogue/category (confirmed in 6 separate scenarios: B.1, B.6×2, B.7, B.8, C.2, C.9b). Worth specifically re-checking whether `qwen3:8b`'s larger size and explicit "thinking" capability improves this.
  - Whether `qwen3:8b`'s "thinking" capability (extended reasoning before tool calls) changes latency enough to affect the two scenarios that hard-timed-out under normistral (A.3, A.10).
  - Whether the "never leaves an ambiguous field null" bias (0/8 clarification attempts surfaced anything under normistral, across B.2/B.3a, B.2/B.3b, B.4, C.2) persists.

## Methodology

*Carried forward unchanged from `qa-retest-normistral-plan.md` — durable rules, not re-derived.*

1. **What "fresh session" means mechanically.** Calling the panel's own "New chat" button (`flow.newChat()`) inside one continuously-running browser window — not relaunching Playwright/Chromium between scenarios. `localStorage`-backed settings (ingestion posture, per-chat model overrides, conversation log) are scoped to the browser profile, not the chat transcript, so they persist across "New chat" clicks. This was confirmed against `AssistantPanel.tsx`'s own state declarations in the prior cycle and the assistant's session-handling code hasn't changed since (working tree is clean for `server/`/`src/`).
2. **Session-classification principle.** A scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state (pronoun/reference resolution, reacting to the assistant's own last reply, answering a still-open clarification, correcting a just-proposed unconfirmed draft, per-card actions on an unconfirmed batch). A scenario that only needs a *real record to already exist* does not need a shared session.
3. **Retry-once rule.** If a draft actually reached the Draft-Quality Gate but looks low-quality, retry with the gate's own "Prøv igjen" button first (same session, faithful in-app retry). If nothing reached a testable state at all (no gate, no clarification, no batch, an empty reply, a timeout), retry by starting a fresh session and resending the same message instead. Only mark a scenario failed-to-reach-that-state if the retry also comes up empty.
4. **Diagnostic addendum (optional, doesn't affect grading).** After the fresh-per-scenario pass, re-run A.1–A.6 back-to-back in one continuous session, purely to check whether `qwen3:8b` shows the kind of mid-session degradation `gemma3:4b` showed (and `normistral-it:7b` notably did *not* — its failures were present from the start regardless of session length). Labeled clearly as not affecting any scenario's grade.
5. **Cleanup policy.** Keep `AutoDeler` in place at the end (don't tear it down). Only clean up records individual scenarios create on top of it. Verify every cleanup claim against real data (`server/data/admin-products.json`/`admin-catalogues.json`) or the admin UI, never the assistant's own self-report.
6. **Screenshot retention.** Once this run's report and screenshot folder (`QA/assistant-qa-screenshots-qwen3-8b/`) are in place, delete `QA/assistant-qa-screenshots-normistral/` (the previous cycle's folder) — keep only the newest. Never delete prior report/plan/prompt `.md` files.
7. **Harness-vs-reality cross-check.** The Playwright harness grades most scenarios via DOM/`innerText` reads. For any FAIL where the trace shows the pipeline itself fired correctly, open the real screenshot before finalizing the grade — it's already been wrong once this way.
8. **Root-cause consolidation.** When 2+ scenarios show the same underlying failure, name the one suspected root cause and list every confirming scenario ID, rather than reporting N separate findings.
9. **Known-deferred-scenario carve-out.** N/A here — no scenario in this 40-item list tests unshipped functionality, and no phase-labeling system exists in `server/assistant/*` to check against (confirmed via search — no "Phase N" comments found). The Known Deferred Scenarios section and Phase column are both omitted below.
10. **Execution mode.** Headed (visible) Chromium, not headless. `QA/scratchpad/qa/harness.mts` was already flipped to `headless: false` for the normistral cycle — confirm it's still set that way before this run.
11. **Known environment gotchas carried forward:**
    - iCloud Drive sync conflict-duplication: a `QA/scratchpad 2/` folder already exists (created 2026-08-03 09:59, mirroring `QA/scratchpad/qa/`) from the prior cycle's heavy concurrent writes — this is sync noise, not data loss. If a fresh duplicate appears mid-run, verify via file mtimes/content before assuming a script bug; it is not evidence of anything breaking.
    - The literal substring collision in the deterministic filter engine ("Pulled Pork" matching a `name contains "LED"` filter, because "pu**LL**ED pork") is real and reproducible for any model using a literal `contains` filter — already root-caused in the normistral cycle, not a new bug if it recurs.
    - The duplicate/orphan Michelin Vinterdekk 20%-discount row (one under `category-1785698944060`, a category ID that no longer matches AutoDeler's own current Dekk category `category-1785741586954`) is a pre-existing data oddity flagged but not reinvestigated across two prior cycles — don't attribute it to this model if it surfaces again.

## Model & vision configuration

- **Thinking model:** `qwen3:8b` — installed (5.2 GB, pulled recently). `ollama show qwen3:8b` confirms `Capabilities: completion, tools, thinking`. Set via Settings → Integrations → Ollama card → Thinking model → Custom → `qwen3:8b` (the server default in `server/data/ollama-config.json` is already this value, but the assistant panel's own kebab menu is a separate `localStorage` device setting — set it explicitly at the start of the run too).
- **Vision model:** `qwen2.5vl:3b` — unchanged from the last two cycles. `ollama show qwen2.5vl:3b` confirms `Capabilities: completion, vision` (no `thinking`). `qwen3:8b` has no vision capability of its own, so the split is required, same reasoning as the normistral cycle.
- **Scope note:** No scenario in A.1–C.9b exercises an image-attach flow — this choice is configuration-only, doesn't add/remove/reclassify any scenario.
- Set both once, globally, at the very start of the run via the assistant panel's own kebab menu — both persist across every "New chat" reset for the rest of the run.

## Environment setup (prerequisite, before any scenario runs)

- **AutoDeler seed fixture: confirmed present, no re-seed needed.** `catalogue-1785741584197` ("AutoDeler") with all 7 categories (Dekk/Bremser/Motorolje/Batterier/Lydanlegg/Interiør/Tilbehør) intact in current data.
- **Baseline re-measured fresh for this run (2026-08-03), not trusted from the prior report:**
  - **109 products** store-wide (55 food-menu + 54 AutoDeler) — matches the normistral report's own final-verification count exactly, no drift here.
  - **3 active discounts** (Kylling Fajitas 25%; two Michelin Vinterdekk rows at 20%, one being the known pre-existing orphan/duplicate above) — unchanged from last cycle.
  - **2 catalogues** (food-menu, AutoDeler) — **drifted from 3 last cycle**: the blank third catalogue the normistral report's own final verification described as "back to 0 products" no longer exists at all. A.extra (catalogue count) should be graded against **2**, not 3 — verify directly in the admin UI immediately before grading, don't assume either number.
  - **1 event** ("Bilutstilling på tunet") — unchanged.
- **Working tree is clean** for `server/`/`src/` assistant code (confirmed via `git status` — only QA template files and pending screenshot-folder deletions are locally modified) — no in-progress dev-work caveat needed this cycle, unlike the very first 2026-08-02 report.
- **Playwright headed mode:** confirm `QA/scratchpad/qa/harness.mts` still has `headless: false` (flipped for the normistral cycle) before starting.
- **Screenshot retention prerequisite:** once this run's own screenshots exist, delete `QA/assistant-qa-screenshots-normistral/` per the retention policy (the original `QA/assistant-qa-screenshots/` from the first two cycles already shows as deleted in `git status`, so that step is already done).

## Full scenario classification

*Reused verbatim from `qa-retest-normistral-plan.md` §6 — session classification is scenario-semantic, not model-dependent, so nothing changes here for the `qwen3:8b` swap.*

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
| A.10 | Fresh, own 2-turn continuity | The scenario's entire point is pronoun/ordinal resolution to the prior turn's own list — its two turns must stay in the one fresh session they start in, but doesn't share with any other scenario. |
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
| C.1b | Fresh | Explicit-imperative batch create; tests whether stale-draft context bleed (documented in the original long-session report) is gone under fresh sessions. |
| C.2 | Fresh, own 2-turn continuity | Stage its own ambiguous batch-create request, then engage with whatever clarification surfaces. Not shared with C.1b. |
| C.3 | Fresh, own 2-turn continuity | Stage its own new batch, then exercise Confirm/Edit/Remove per card. |
| C.4 | Fresh, own 2-turn continuity | Stage its own new batch (one card with an invalid discount), then check Confirm all is disabled while per-card actions still work. |
| C.5 | Fresh, own 2-turn continuity | Stage its own clean batch, then click Confirm all. |
| C.6 | Fresh, own 2-turn continuity | Stage its own batch, then click Cancel all. |
| C.7 | Fresh, own 2-turn continuity | Stage its own events batch, then check for cross-record field contamination between its own cards. |
| C.8 | Fresh | Single-record message; confirms no false batch UI appears. |
| C.9a | Fresh, own 2-turn continuity | Stage its own 3-record batch under Safe posture, then check the gate. |
| C.9b | Fresh, own 2-turn continuity | Stage its own 6-record batch under Safe posture, then check the gate's "…og N til" overflow line — explicitly its own fresh session so C.8's leftover draft cannot bleed in. |

## Run order

1. **B.1 before B.9 before B.10** (data dependency). If B.1's create doesn't actually go through, seed the target product manually via the ordinary admin form so B.9/B.10 can still be graded on update/delete mechanics.
2. **A.9a before A.9b.** A.9a establishes whether the bilingual-fallback filter mechanism works at all; read A.9b's result in that light if A.9a fails.
3. **B.11a before B.11b**, to test the posture-override round-trip (Av → Automatisk) in the intended direction.

No other scenario has an ordering requirement.

## Report format

Follow `QA/templates/qa-test-report-template.md`. Same PASS/PARTIAL/FAIL/N/A/ERROR/CAPTURED status vocabulary, trace notes, screenshot reference, key-findings summary (with root-cause consolidation), and cleanup table as the last two cycles, so results stay directly comparable — in particular against the normistral cycle's own tally (8 PASS, 4 PARTIAL, 23 FAIL, 2 N/A, 1 ERROR, 2 CAPTURED across 40 scenarios) and the original gemma3:4b baseline (9 PASS, 11 PARTIAL, 12 FAIL, 2 N/A, 1 out-of-scope across 35 scenarios).

## Verification

- Every ID from `assistant-qa-report-normistral-2026-08-03.md`'s scenario list (40 total, A.1–C.9b) appears exactly once in the classification table above.
- The model/vision decision, environment setup, and report-format sections are all filled in, not left as brackets.
- No known-deferred scenarios exist in this list, so that section is correctly omitted rather than left as a stub.
- Nothing in this plan tells anyone to execute Playwright/browser automation without asking first.

## When to run this cycle

Event-driven — this run specifically benchmarks `qwen3:8b` as a candidate thinking-model tier now that it's installed, comparable against the `gemma3:4b` baseline and the `normistral-it:7b` cycle.
