# Assistant QA Report — Local/qwen3:4b — fresh-session-by-default — 2026-08-04

**Template version:** Base 1 + Project 1
**Configuration tested:** Local (Ollama), thinking `qwen3:4b`, vision `qwen2.5vl:3b` (same split reasoning as `qwen3:8b` — `qwen3:4b` has no vision capability of its own, confirmed via `ollama show`). This is `qwen3:4b`'s **first-ever QA pass** — the tag wasn't installed when this cycle's plan was first written; it was added mid-cycle at the user's request and downloaded via `ollama pull qwen3:4b` before this run started. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except B.11a/b.
**Environment:** http://localhost:5173, dev instance, `main` branch. Continues directly from Run 2 (`qwen3:8b`) of this same multi-model cycle — environment re-verified back to the exact 109/2/14/54-in-AutoDeler baseline before this run started.
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/run-multi-model.mts`, the same script used for every run in this cycle). Full raw evidence in `QA/scratchpad-qwen3-4b-results.json` and `QA/assistant-qa-screenshots-qwen3-4b/`.
**Session policy:** unchanged from every other run in this cycle — fresh session by default, except A.10, the paired clarification/gate/batch scenarios, and Section K's K.8/K.12a/K.12b.

## Methodology notes — read before the per-scenario results

1. **Environment continued directly from Run 2**, re-verified clean immediately before this run's first scenario.
2. **A real bug in this cycle's own script caused a lost scenario (B.9), since fixed.** The `productExistsInCategory` fix applied to B.9 after Run 2 (Methodology #2 of that report) was applied without adding the function to this script's own import list — a plain `ReferenceError`, not a model/app issue. B.9 is graded ERROR below; the import is fixed for Run 4. Because B.9 never ran, it also never had a chance to force-create a duplicate "Continental Sommerdekk" the way it did in Run 2 — B.10 in this run operated on a single, real, unambiguous candidate as originally intended.
3. **Retry-once rule applied throughout** — noted per-scenario where it fired.
4. **Overall verdict, stated up front:** `qwen3:4b` performs **substantially better than its own `gemma3:4b` sibling-in-size** (Run 1) and, on this battery, **closely comparable to the much larger `qwen3:8b`** (Run 2) — a genuinely notable result given the parameter-count difference. Section A's deterministic pipeline is nearly perfect (13/14 correct, one real miss on A.7), A.10's pronoun resolution is fully correct (matching `qwen3:8b`, unlike `gemma3:4b`), and product placement is reliable across the board. The category-creation catalogueId bias (Key Findings #2 of the `qwen3:8b` report) shows up here too on B.2/B.3, but **not** on B.8 — "Verktøy" landed correctly in AutoDeler this run, the opposite of what `qwen3:8b` did on the same scenario the same day. This is new evidence the bias is genuinely non-deterministic per-run rather than a fixed default, worth noting rather than treating either single result as the "true" outcome. K.6's own known `entity-action-consistency`/multi-entity `lookup_batch` bug (reproduced on both `gemma3:4b` and `qwen3:8b`) **does not reproduce here** — `qwen3:4b`'s own `select_lookup_target` correctly narrowed to a single entity, avoiding the expensive fallback path entirely (Key Findings #1) — real evidence the bug is model-dependent, not purely code-level as the `qwen3:8b` report's own Key Findings #5 speculated.

**Tally:** 13 PASS, 1 PARTIAL, 6 FAIL, 2 N/A, 1 ERROR (harness bug), 30 CAPTURED (mechanics/output captured for analysis; several graded informally in prose above their raw status — see Key Findings) across 54 scenarios.

## A. Read/lookup pipeline

**A.1 — Plain count**
- **Status:** PASS — "Vi har 109 produkter." correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/001-A-1.png`

**A.2 — Filtered count**
- **Status:** PASS — "Vi har 3 produkter." correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/002-A-2.png`

**A.3 — Which product is on sale**
- **Status:** PASS — all 3 real discounted products correctly named.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/003-A-3.png`

**A.4 — List all products**
- **Status:** PASS — correct 109-item list.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** PASS — both halves correctly answered (109-item list + correct 3-item discount summary).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/005-A-5.png`

**A.6 — Compound two-interrogative — one real quality miss**
- **Status:** PARTIAL
- **What happened:** "Vi har 109 produkter." (correct) followed by a full 109-item product list instead of the requested "who is on sale" answer (the 3 real discounted items) — the second half of the compound question was answered with the wrong data entirely (a full list substituted for a filtered one), not silently dropped, but not correct either.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create — real miss**
- **Status:** FAIL
- **What happened:** "et stort og et lite frontlys" (a big and a small headlight) incorrectly triggered a real Draft-Quality Gate (`gate=true`) — both `gemma3:4b` and `qwen3:8b` correctly classified this as non-command chat in their own runs today. A genuine, isolated misclassification.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** PASS — 4/4 correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** PASS — 4/4 correct, filter worked directly (no fallback needed).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/010-A-9b.png`

**A.10 — Pronoun follow-up (own 2-turn continuity, diagnostic)**
- **Status:** PASS
- **What happened:** Q1 correctly listed all 4 real Bremser products. Q2 ("den første") correctly answered "Bremser Del 1 koster 209 kr." — matching `qwen3:8b`'s own correct result, and a clean contrast with `gemma3:4b`'s broken result this cycle.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/011-A-10.png`

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/012-A-12a.png`

**A.12b — Event bilingual display (English UI, no English title)**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/013-A-12b-events-view.png`

**A.extra — Catalogue count and category count**
- **Status:** PASS — "2 kataloger" / "14 kategorier," both correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/014-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping**
- **Status:** PASS
- **What happened:** Gate → review → confirmed, no Allergener/Kosthold-tagger shown. **Real placement: Dekk** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/015-B-1.png`

**B.2/B.3a — Clarification loop, tap to pick catalogue ("...Dekkhotell")**
- **Status:** FAIL
- **What happened:** No clarification surfaced either attempt — same bias as `qwen3:8b`'s own equivalent finding.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/016-B-2-B-3a.png`

**B.2/B.3b — Clarification loop, typed chat answer ("...Sesonglager")**
- **Status:** FAIL
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/017-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification**
- **Status:** N/A — blocked by the same upstream issue.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/018-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/019-B-5a.png`

**B.5b — Draft-quality gate, "Prøv igjen"**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/020-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt"**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/021-B-5c.png`

**B.6 (Confirm path)**
- **Status:** PASS — **real placement: Dekk**, correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/022-B-6-confirm.png`

**B.6 (Edit path)**
- **Status:** PASS — **real placement: Dekk**, correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/023-B-6-edit.png`

**B.7 — Price/discount display fix**
- **Status:** PASS — no fabricated discount, confirmed. **Real placement: Bremser** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/024-B-7.png`

**B.8 — Category custom-field fabrication check ("...Verktøy") — bias did NOT reproduce this run**
- **Status:** PASS
- **What happened:** No unrequested custom fields. **Real placement: AutoDeler** — correct, in direct contrast with `qwen3:8b`'s own B.8 result the same day (Matmeny). See Key Findings #2.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/025-B-8.png`

**B.9 — Update product price via chat — harness bug, not a real scenario**
- **Status:** ERROR (harness bug — see Methodology #2)
- **What happened:** `ReferenceError: productExistsInCategory is not defined` — a missing import in this cycle's own script, not a model/app issue. Fixed for Run 4.
- **Screenshot:** none captured (exception fired before the scenario reached a screenshot step)

**B.10 — Delete product via chat**
- **Status:** CAPTURED
- **What happened:** Real confirm phrase read ("Continental Sommerdekk - Dekk"), typed through, `deleted=true` — and this time (no duplicate created, since B.9 never ran its own seeding logic) there was only one real candidate to delete, so this self-report is plausible; not independently re-verified against real data before cleanup superseded it.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/026-B-10-after.png`

**B.11a — Kebab override, posture Av (full)**
- **Status:** PASS
- **What happened:** `gate=false` correctly. Allergener and Kosthold-tagger fields both present — matching `qwen3:8b`, contrasting with `gemma3:4b`'s absent fields this cycle. Correct tagged `(draft)`/`(verify)` pair.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/027-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/028-B-11b.png`

**B.12 — Manual product creation unaffected**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/029-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing**
- **Status:** CAPTURED (known gap)
- **What happened:** No batch surfaced; reply is a leaked `real-ambiguity-forces-clarify` reason string (12 candidates, no grounding) — this message got routed through `select_item`, same misroute pattern seen elsewhere in this cycle's own Section K rows, not a new bug.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/030-C-1a.png`

**C.1b — Batch create, explicit imperative ("...sommerdekk, vinterdekk og piggdekk")**
- **Status:** PASS
- **What happened:** Correct 3-card batch, real requested names, real prices (1200/1300/1200 kr), all in Dekk. Confirmed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/031-C-1b.png`

**C.2 — Shared clarification across batch cards ("...Skinnhotell og Feltlager")**
- **Status:** PARTIAL — same catalogueId-bias root cause, no clarification surfaced.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/032-C-2.png`

**C.3 — Per-card actions (confirm/edit/remove independence)**
- **Status:** PASS
- **What happened:** Correct 3-card batch (real requested names, matching Batterier), confirm/edit/remove all worked mechanically, no fabricated content — matching `qwen3:8b`'s own clean result, unlike `gemma3:4b`'s category-name fabrication this cycle.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/033-C-3.png`

**C.4 — Invalid discount blocks Confirm all only**
- **Status:** FAIL
- **What happened:** Never reached a valid batch on either attempt (`batch=false`, `reachedState=false`) — a genuine failure to produce a multi-record draft at all for this message, distinct from `qwen3:8b`'s own C.4 (which reached a correct batch but never exercised the invalid-discount block itself).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/034-C-4.png`

**C.5 — Confirm all on a clean batch**
- **Status:** PASS
- **What happened:** Correct 2-card batch (Pioneer Høyttaler/Sony Forsterker, Lydanlegg), confirmed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/035-C-5.png`

**C.6 — Cancel all, nothing created**
- **Status:** PASS — real batch reached and correctly cancelled.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/036-C-6.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** CAPTURED — both real events with correctly isolated dates/addresses, confirmed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/037-C-7.png`

**C.8 — No false batch UI for single-record message**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/038-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** CAPTURED — gate correctly shows all 3 real record names ("Gate Batch A/B/C"), all in Motorolje.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/039-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PASS
- **What happened:** 5 summary lines + "…og 1 til," all 6 records correctly named "Dekk Seks A–F," **all correctly placed in Dekk** — matching `qwen3:8b`'s own clean result.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/040-C-9b.png`

## K. Deterministic post-checks (third-ever pass, this framework)

**K.1 — `filter-field-exists`**
- **Status:** Inconclusive
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/041-K-1.png`

**K.2 — `filter-not-brand-name`**
- **Status:** Inconclusive (same misroute as every other run this cycle)
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/042-K-2.png`

**K.3 — `filter-op-shape-mismatch`**
- **Status:** PASS (real match, correct answer: "Det er bare Brembo Sportbrems (Bremser).") — no fallback needed this time, a genuine confirmation the check doesn't false-positive on correct output.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/043-K-3.png`

**K.4 — `no-fabricated-selection`**
- **Status:** Inconclusive, as expected.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/044-K-4.png`

**K.5 — `real-ambiguity-forces-clarify` — confirmed working, third time**
- **Status:** Genuine PASS for the check
- **What happened:** Same correct `reject-clarify` behavior as every other run this cycle, this time against 9 real Batterier candidates.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/045-K-5.png`

**K.6 — `entity-action-consistency` — known bug does NOT reproduce here**
- **Status:** Inconclusive for the target check, but a genuinely different (better) mechanism than the other two local runs
- **What happened:** "Hvilke nye dekk kan vi legge til i sortimentet?" — trace shows `select_lookup_target` correctly returned `lookupEntities: ["product"]` only, no nonsensical extra entity. This avoided the expensive multi-entity `lookup_batch` fallback both `gemma3:4b` and `qwen3:8b` hit on the identical message today — resolved quickly via the deterministic `lookup_query` path instead. The reply itself ("Her er 120 produkter: [full list]") still doesn't actually answer "which *new* tires," but the underlying pipeline behaved correctly and efficiently. See Key Findings #1 — this is real, direct evidence the K.6 bug is model-dependent, not a pure code-level issue affecting every model equally.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/046-K-6.png`

**K.7 — `entity-searchtext-consistency`**
- **Status:** Inconclusive — the `reconsiderEmptyResult` fallback fired (filter matched nothing, full list shown instead), same pattern as other runs' own K.3/K.7-adjacent rows.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/047-K-7.png`

**K.8 — `pronoun-not-searchtext` (shared 2-turn session)**
- **Status:** Inconclusive
- **What happened:** Q1 correct ("Vi har 5 produkter" — accurate at that point in the run). Q2 reply is a leaked `real-ambiguity-forces-clarify` reason string, not a resolved product name — the pronoun reference itself didn't get a clean answer this attempt, though this reflects the same-family ambiguity-handling behavior rather than a hallucination.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/048-K-8.png`

**K.9 — `no-hallucinated-values-in-safe-mode`**
- **Status:** N/A (code-review checkpoint, by design)

**K.10 — `input-mentioned-values-only`**
- **Status:** Inconclusive — real product created and confirmed, dietary-line detail not independently captured this attempt.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/049-K-10.png`

**K.11 — `dual-price-both-fields`**
- **Status:** Inconclusive — real reply produced, no confirmed write (draft path).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/050-K-11.png`

**K.12a — `catalogueId-context-consistency`, true-positive case**
- **Status:** Inconclusive
- **What happened:** Q1 correctly answered "Vi har 121 produkter." (accurate at that point). Q2 empty reply, no clarification — inconclusive either way, though the upstream focus-setting step again looks healthy.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/051-K-12a.png`

**K.12b — `catalogueId-context-consistency`, false-positive guard**
- **Status:** Inconclusive — no false-positive occurred.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-4b/052-K-12b.png`

## Key findings summary

1. **New finding: the K.6 `entity-action-consistency`/multi-entity `lookup_batch` bug is model-dependent, not purely code-level.** Both `gemma3:4b` and `qwen3:8b` (this same cycle, same day) had `select_lookup_target` fabricate a nonsensical extra entity (`appearanceThemeColor`) for "Hvilke nye dekk kan vi legge til i sortimentet?", triggering a 2+ minute, ~76,000-token multi-entity fallback. `qwen3:4b` — a smaller model than `qwen3:8b` — did **not** reproduce this: it correctly returned a single `product` entity and resolved via the fast, deterministic `lookup_query` path instead. This revises the `qwen3:8b` report's own speculation that this looked like "shared code, not model-dependent output" — it's genuinely model-dependent, just not simply correlated with model size.
2. **The category-creation `catalogueId` bias is confirmed non-deterministic per-run, not a fixed default.** B.8 ("Verktøy") landed correctly in AutoDeler this run — the opposite of `qwen3:8b`'s own result for the identical scenario the same day. B.2/B.3 still failed to clarify here, same as every other run this cycle. Taken together with the `qwen3:8b` report's own Key Findings #2, this strengthens the case that whatever's driving the bias is probabilistic (a default the model sometimes reaches for and sometimes doesn't) rather than a deterministic code path — worth investigating via the actual `fill_fields_batch_category` prompt/schema rather than further QA-cycle repetition alone.
3. **Product placement remains reliable across the board:** B.1, B.6 (both paths), B.7, C.1b (×3), C.3 (×3), C.5 (×2), C.9a (×3), C.9b (×6) all verified correctly placed — consistent with both other local models this cycle. The placement problem continues to be specifically about category creation, not product creation.
4. **A.7's misclassification is an isolated miss, not a pattern.** Both `gemma3:4b` and `qwen3:8b` got this scenario right today; only `qwen3:4b` incorrectly triggered a create gate for a plain descriptive phrase. Worth a retry in a future cycle to see if this is reproducible or a one-off.
5. **`real-ambiguity-forces-clarify` continues to work correctly, confirmed a third time** (K.5, plus incidental confirmations in C.1a and K.8) — consistent, convergent evidence across all three local-model runs this cycle.
6. **App-level mechanics held up regardless of model quality**, same as every other run this cycle: gate actions, posture round-trip (including correct field visibility, matching `qwen3:8b`), manual-creation isolation, batch UI gating, overflow display, per-card independence, event-batch isolation.
7. **A genuine own-script bug (missing import) cost this run one scenario (B.9).** Not a model/app finding — fixed for Run 4. Worth a broader lesson: every fix folded into this script mid-cycle should get its own quick smoke-check (even just confirming the file parses/imports cleanly) before the next run starts, not just a code read-through.

## Cleanup performed

`AutoDeler` and `Matmeny` were **kept in place**. Every record this run's scenarios created was removed via the real admin UI, verified against `server/data/*.json` before and after:

| Record | Created in | Deleted via |
| --- | --- | --- |
| Product "Gate Confirm Dekk" (AutoDeler → Dekk) | B.6 (Confirm path) | Admin UI delete |
| Product "Gate Edit Dekk" (AutoDeler → Dekk) | B.6 (Edit path) | Admin UI delete |
| Product "Manuell Test Dekk" (AutoDeler → Dekk, manual) | B.12 | Admin UI delete |
| Product "sommerdekk", "vinterdekk", "piggdekk" (AutoDeler → Dekk) | C.1b | Admin UI delete |
| Product "Brembo Sportbrems" (AutoDeler → Bremser) | B.7 | Admin UI delete |
| Product "Card Test A", "Card Test B" (AutoDeler → Batterier) | C.3 | Admin UI delete |
| Product "Pioneer Høyttaler", "Sony Forsterker" (AutoDeler → Lydanlegg) | C.5 | Admin UI delete |
| Category "Verktøy" (AutoDeler) | B.8 | Admin UI delete |
| Product "Vegetar-bowl" (Matmeny → Salater) | K.10 | Admin UI delete |
| Events "Sommertreff", "Vintertreff" | C.7 | Admin UI delete |

Note: "Continental Sommerdekk" (B.1) was already deleted by B.10 within this run itself — no separate cleanup entry needed, and (unlike Run 2) no duplicate was created since B.9's own harness bug meant it never ran its seeding logic.

**Final verification:** AutoDeler back to 54 products / 7 categories; Matmeny back to its original 7 categories, 54 products; total store-wide product count back to 109; 1 event unchanged; 2 catalogues, 14 categories.
