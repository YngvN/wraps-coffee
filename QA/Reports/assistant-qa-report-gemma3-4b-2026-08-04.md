# Assistant QA Report — Local/gemma3:4b — fresh-session-by-default — 2026-08-04

**Template version:** Base 1 + Project 1
**Configuration tested:** Local (Ollama), `gemma3:4b` for **both** thinking and vision roles (no split needed — `gemma3:4b` has native `vision` capability, unlike `qwen3:8b`). `ollama show gemma3:4b` confirms `Capabilities: completion, vision` — **no declared `tools` capability**. This is `gemma3:4b`'s first QA pass since the original 2026-08-02 baseline cycle, run here against today's fixed app code and the new `postChecks` framework for the first time. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except B.11a/b, which explicitly override it.
**Environment:** http://localhost:5173, dev instance, `main` branch. `server/data/` is gitignored (no git history for it) — see the Cleanup section below for a real incident and recovery that happened mid-cycle.
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/run-multi-model.mts`, not committed — a generalized, env-var-driven successor to the qwen3:8b cycle's own `retest-qwen3-8b.mts`, reused for all three runs of this multi-model cycle). Full raw evidence (every reply, every trace step including the new `checks[]` array, one screenshot per scenario) is in `QA/scratchpad-gemma3-4b-results.json` and `QA/assistant-qa-screenshots-gemma3-4b/`.
**Session policy:** every scenario starts with the panel's own "New chat" button clicked immediately beforehand, except A.10, the paired clarification/gate/batch scenarios, and Section K's K.8/K.12a/K.12b (each needing its own 2-turn shared session to seed real `DialogFocus`) — same policy as prior cycles.

## Methodology notes — read before the per-scenario results

1. **Environment was reused, not re-seeded.** `AutoDeler` confirmed present at the start (54 products/7 categories), baseline re-measured fresh: 109 products store-wide, 2 catalogues, 14 categories, 3 discounts, 1 event — matching the 2026-08-03 report's own final numbers exactly.
2. **Two real harness bugs were found and fixed mid-run**, not model/app issues — both now folded into `QA/templates/project/qa-test-plan-project.md`'s own "Known harness state" so the next cycle inherits them:
   - **`closeModelMenu` animation-timing race.** Returning immediately after clicking the model menu's "back" button (instead of waiting for the transcript view to actually remount, ~250ms `AnimatePresence` exit animation) let the very next scenario's own `newChat()` open-check land mid-transition, misread the still-open panel as closed, and click the sparkle toggle — which actually closed it. This alternated real send-button timeouts with successful scenarios on every other run before being caught and fixed.
   - **Batch-detection regression from copying the pre-fix script.** `run-multi-model.mts` was adapted from `retest-qwen3-8b.mts`, but that file's own C-section scenarios still checked `isBatchReviewVisible` directly instead of the gate-aware `reachBatchReview` helper the qwen3:8b cycle's own template notes already documented as the fix — the fix had never actually been folded back into the base script it lived in. This produced a false `batch=false` reading across all of C.1b/C.2/C.3/C.4/C.5/C.6/C.7 on the first attempt; fixed and the whole run redone from a clean environment before any of this report's own numbers were taken.
3. **Retry-once rule applied throughout** — every scenario using `withRetryOnce`/`withCheckRetryOnce` is noted per-scenario below with whether the retry fired and what it changed.
4. **A real cleanup-script bug caused genuine data loss mid-cycle, since recovered.** Section C's own batch-fill fabricated category names as product names (see Key Findings #2) — the cleanup script's own `deleteProductInCategory(page, 'Batterier', 'Batterier')` call (matching category name and product name being identical, since that's literally what the model fabricated) landed on the category's own delete button instead of the single garbage product row, deleting the **entire** Batterier (9 products) and Lydanlegg (3 products) categories, not just the one garbage item each. `server/data/` is gitignored and the live backup mirror only reflects current state (no versioning), so the original product data (names beyond what A.9b's own evidence happened to capture, and all original prices) could not be recovered. Per the user's own explicit direction (AutoDeler is a disposable QA fixture, not production data), both categories were reconstructed with their real original names (recovered from this run's own A.9b evidence, captured before the deletion) and placeholder prices. Verified back to the exact 109/2/14 baseline afterward. Flagged here in full rather than silently absorbed into the numbers.
5. **Overall verdict, stated up front:** `gemma3:4b` is a **real, substantial regression** relative to `qwen3:8b`'s own 2026-08-03 cycle on the deterministic `lookup_query` pipeline specifically — the single biggest and most consolidatable finding this run is that plain, unfiltered "how many X do we have" questions are frequently and severely wrong (Key Findings #1), a failure mode the qwen3:8b cycle explicitly reported as **100% reliable**. This is very likely connected to `gemma3:4b`'s own missing `tools` capability tag, flagged as a risk before this run started. Category/catalogue placement for AI-created records is also markedly worse and, unlike the qwen3:8b cycle's "reliable placement" finding, **inconsistent rather than a single wrong default** — the same kind of message landed in Tilbehør, Verktøy, or nowhere at all across different scenarios in this one run (Key Findings #3). Batch/multi-record creation is the weakest area by far, frequently fabricating category names as product names outright (Key Findings #2) or failing to reach a testable state at all. Against this, the app-level mechanics (gate buttons, posture toggle, manual-creation isolation, single-vs-batch UI gating) held up regardless of model quality, exactly as they did in every prior cycle — and the new `postChecks` framework's `real-ambiguity-forces-clarify` check demonstrably caught a real fabricated selection live, in-cycle, on its very first QA pass (Key Findings #5) — a genuine, headline positive for the new framework, alongside a real gap it exposed in how a `reject-clarify` verdict is presented to the admin (Key Findings #6).

**Tally:** 13 PASS, 1 PARTIAL, 12 FAIL, 2 N/A, 0 ERROR, 26 CAPTURED (mechanics/output captured for analysis; several graded informally in prose above their raw status where the DOM-level status alone would be misleading — see Key Findings) across 54 scenarios.

## A. Read/lookup pipeline

**A.1 — Plain count ("Hvor mange produkter har vi?")**
- **Status:** FAIL
- **What happened:** "Vi har 3 produkter." — severely wrong (real count: 109). Trace shows `lookup_query` fabricated an entirely unprompted filter, `{"field":"hasDiscount","op":"is","value":"true"}`, on a question naming no filter criteria at all — all three new `lookupQuery` postChecks (`filter-field-exists`/`filter-not-brand-name`/`filter-op-shape-mismatch`) read `ok:true`, since a real field, non-brand value, correct op shape don't catch "should there be a filter here at all." See Key Findings #1.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/001-A-1.png`

**A.2 — Filtered count ("Hvor mange produkter er på tilbud?")**
- **Status:** PASS
- **What happened:** "Vi har 3 produkter." — correct (3 real active discounts), though coincidentally the same number as A.1's own wrong answer.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/002-A-2.png`

**A.3 — Which product is on sale**
- **Status:** PASS
- **What happened:** Correctly named all 3 real discounted products (Kylling Fajitas, both Michelin Vinterdekk rows — the second being the known pre-existing duplicate, not a new hallucination).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/003-A-3.png`

**A.4 — List all products (bullet attachment)**
- **Status:** PARTIAL
- **What happened:** "Her er 106 produkter:" with a real 106-item list — a genuine list, not a hallucinated sentence, but undercounts the real 109 by 3. Same root cause family as A.1 (Key Findings #1), though milder here.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** PARTIAL
- **What happened:** Correctly split into both halves — the 106-count list (same undercount as A.4) plus a correct 3-item discount list, both halves genuinely answered, neither silently dropped.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/005-A-5.png`

**A.6 — Compound two-interrogative**
- **Status:** PARTIAL
- **What happened:** "Vi har 106 produkter." (same undercount) + correct 3-item discount list. Same pattern as A.5.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create**
- **Status:** PASS
- **What happened:** Correctly answered with a generic help offer, no gate/batch/review triggered.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** PASS
- **What happened:** Correctly surfaced both real candidates ("Frontlys - Interiør", "Frontlys - Tilbehør") — never silently guessed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** PASS
- **What happened:** Correctly found 4/4 real matches (Pulled Pork — the known substring collision, LED Headlight Bulb H7, LED Interior Strip, LED Fog Light).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** FAIL (harness's own naive substring check read PASS — see below)
- **What happened:** The reply literally opens "Found none — here are 109 products instead:" followed by a dump of all 109 real products — the `reconsiderEmptyResult` fallback (new 2026-08-04) fired because the model's own English-UI filter attempt matched **zero** products, not because the filter worked. My own harness's `.includes()` check against the 3 expected LED names read "3/3 found," but that's an artifact of literally every product being listed, not a working bilingual filter. Graded FAIL for the actual mechanism being tested, per the harness-vs-reality rule — this is exactly the kind of naive-check false positive that rule exists to catch, just in the opposite direction from the qwen3:8b cycle's own instance of it. A genuine, real asymmetry: the identical filter concept worked cleanly in Norsk (A.9a) but failed outright in English for this model.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/010-A-9b.png`

**A.10 — Pronoun follow-up (own 2-turn continuity, diagnostic) — real app-UX finding**
- **Status:** CAPTURED (diagnostic; see Key Findings #6)
- **What happened:** Q1 ("Hvilke produkter har vi i Bremser-kategorien?") correctly listed all 4 real Bremser products — no hallucination, unlike the qwen3:8b cycle's own A.10 finding. Q2 ("Hvor mye koster den første?") produced a reply whose entire text is the new `real-ambiguity-forces-clarify` postCheck's own internal `reason` string verbatim: `Selected "category-1785698944060-1785698945682" from 2 candidates, but none of their labels appear anywhere in the message — no real textual grounding for this pick.` — the check correctly caught a fabricated/malformed itemID (a genuine positive), but the resulting `PostCheckClarificationRequired` error surfaces as raw internal debug text directly in the chat transcript, not admin-appropriate copy. See Key Findings #6.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/011-A-10.png`

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** FAIL
- **What happened:** Q1 "Vi har 0 arrangementer." — wrong (real count: 1). Q2 self-corrected via the same `reconsiderEmptyResult` fallback ("Fant ingen — her er 1 arrangementer i stedet: Bilutstilling på tunet") and landed on the right answer, but Q1's own plain count is a clean instance of Key Findings #1.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/012-A-12a.png`

**A.12b — Event bilingual display (English UI, no English title)**
- **Status:** PARTIAL
- **What happened:** Q1 "We have 1 event." — correct this time (inconsistent with the Norsk Q1 above, on the exact same underlying data). Q2 "No events." — wrong, and this time the fallback did **not** rescue it (the real events list view itself, checked directly, shows "Bilutstilling på tunet" present and correctly titled — a UI-level confirmation, not an assistant one).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/013-A-12b-events-view.png`

**A.extra — Catalogue count and category count**
- **Status:** FAIL
- **What happened:** "Vi har 0 kataloger." — wrong (real: 2); trace shows a fabricated `categoryCount equals 1` filter. "Vi har én kategori, nemlig Dekk (AutoDeler)." — wrong (real: 14); trace shows the model's first attempt fabricated `catalogueName equals "Wraps & Coffee"` (correctly caught by `filter-not-brand-name`, `ok:false`, `reject-retry`), and the **retry** then fabricated a second, different bogus filter (`hasCustomFields is true`) that happens to match exactly 1 real category (Dekk, the only one with a custom field) — a clean second, independent confirmation of Key Findings #1's root cause, and a good illustration of the check correctly closing one specific hole while the broader problem re-manifested a different way.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/014-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping**
- **Status:** PARTIAL
- **What happened:** Gate → review → confirmed correctly, no Allergener/Kosthold-tagger fields shown (correct posture stripping). **Real placement: AutoDeler → Tilbehør**, not Dekk — see Key Findings #3.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/015-B-1.png`

**B.2/B.3a — Clarification loop, tap to pick catalogue ("Legg til en ny kategori som heter Dekkhotell")**
- **Status:** FAIL
- **What happened:** No clarification surfaced on either attempt (retried once, still empty) — same category-catalogueId-ambiguity shape the qwen3:8b cycle's own `nullable()` fix targeted, now failing differently on `gemma3:4b`: nothing was ever staged/confirmed (verified: no "Dekkhotell" category exists in real data either way).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/016-B-2-B-3a.png`

**B.2/B.3b — Clarification loop, typed chat answer ("Legg til en ny kategori som heter Sesonglager")**
- **Status:** FAIL
- **What happened:** Same pattern — no clarification on either attempt, nothing created.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/017-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification ("Legg til en ny kategori som heter Vinterlager")**
- **Status:** N/A
- **What happened:** Blocked by the same upstream issue as B.2/B.3 — no clarification ever surfaced to answer unclearly.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/018-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** PASS
- **What happened:** Gate appeared; "Se detaljer" correctly revealed the normal review form.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/019-B-5a.png`

**B.5b — Draft-quality gate, "Prøv igjen"**
- **Status:** PASS
- **What happened:** Gate appeared; "Prøv igjen" correctly restored the exact original message into the composer, focused, dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/020-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt"**
- **Status:** PASS
- **What happened:** Gate appeared; "Avbryt" correctly cleared the composer and dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/021-B-5c.png`

**B.6 (Confirm path)**
- **Status:** PARTIAL
- **What happened:** Gate → review → confirm mechanics all worked (PASS on the mechanics). **Real placement: Tilbehør**, not Dekk — same placement issue as B.1 (Key Findings #3).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/022-B-6-confirm.png`

**B.6 (Edit path)**
- **Status:** PARTIAL
- **What happened:** Gate → review → edit → save mechanics all worked. **Real placement: Tilbehør**, not Dekk — same issue.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/023-B-6-edit.png`

**B.7 — Price/discount display fix ("Legg til et bremsesett som heter Brembo Sportbrems for 2400 kr med 20% rabatt")**
- **Status:** FAIL
- **What happened:** Nothing was ever staged — empty reply, no gate, `confirmed=false`. Trace shows the root cause directly: `select_command` classified this as `action: "update"` instead of `"create"` (`{"entity":"product","action":"update","searchText":"Brembo Sportbrems"}`) — since no such product exists yet, the downstream update-target search found nothing and the turn silently produced nothing. The new `entity-action-consistency` check ran (`ok:true`) but only guards the *opposite* misclassification (create-when-should-be-lookup) — this create-vs-update confusion isn't covered by any current check. Same failure shape as the source report's own C.1a finding, now confirmed on a genuinely different model too.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/024-B-7.png`

**B.8 — Category custom-field fabrication check ("Legg til en ny kategori som heter Verktøy")**
- **Status:** PASS
- **What happened:** No unrequested custom fields fabricated (review text shows a clean, minimal category form). Confirmed. **Real placement: AutoDeler** (correct catalogue) — notably *better* than the qwen3:8b cycle's own result for this exact scenario, which landed in Matmeny.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/025-B-8.png`

**B.9 — Update product price via chat ("Endre prisen på Continental Sommerdekk til 1350 kr") — real confabulation finding**
- **Status:** PARTIAL
- **What happened:** Price row correctly showed real old→new values (1200 kr → 1350 kr). But the review also shows a validation warning, `«Dekkdimensjon» har en verdi av feil type` (Dekkdimensjon has a value of the wrong type), and a field row proposing to set the `Dekkdimensjon` custom field (Dekk's own real tire-dimension field) to the literal string `"Dekkdimensjon"` — the field's own label, not a real value — despite the message only ever asking for a price change. A genuine, novel confabulation instance in the same family as the standing confabulation rule, on a field not currently in `confabulationRiskFields`. The app's own validation correctly flagged it as wrong-typed rather than silently accepting it — a real partial safety net, but the model shouldn't have touched this field at all.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/026-B-9.png`

**B.10 — Delete product via chat ("Slett dekket Continental Sommerdekk") — self-report contradicted by real data**
- **Status:** FAIL
- **What happened:** A real confirm phrase was read from the UI ("Continental Sommerdekk - Dekk" — note the phrase itself says "Dekk" even though the product's real category was Tilbehør, a further placement-inconsistency signal) and typed/clicked through, self-reporting `deleted=true`. **Verified against real data: the product still existed** after this scenario completed. Same self-report/reality mismatch pattern the standing methodology already warns about — confirmed twice independently in this run (this scenario, and the aborted first run attempt hitting the identical mismatch).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/027-B-10-after.png`

**B.11a — Kebab override, posture Av (full) — real finding, differs from qwen3:8b**
- **Status:** PARTIAL
- **What happened:** Trace correctly shows a tagged `(draft)` then `(verify)` pair (mechanically correct for full posture). `gate=false` correctly. But **verified via screenshot: the Allergener and Kosthold-tagger fields are entirely absent** from the review card, not merely present-but-empty as the qwen3:8b cycle found for this same scenario — a real, screenshot-confirmed difference, not a harness label mismatch. The same screenshot also shows the review card's own `Kategori` field reading **"Verktøy"** (the just-created empty category from B.8's own session) — a third distinct wrong placement for a "Legg til et nytt dekk" message within this single run, alongside Tilbehør (B.1/B.6) — see Key Findings #3. Cancelled, not confirmed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/028-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk**
- **Status:** PASS
- **What happened:** Posture correctly reverted: single untagged `fill_fields_batch_product` call, gate correctly reappeared (`gate=true`) — the toggle round-trip works correctly regardless of the model behind it.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/029-B-11b.png`

**B.12 — Manual product creation unaffected by the assistant**
- **Status:** PASS
- **What happened:** "Manuell Test Dekk" created via the ordinary form, zero AI-related chrome detected, correctly placed in Dekk (confirming the *category itself* is fine — it's specifically the AI's own resolution that's unreliable).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/030-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing**
- **Status:** N/A (known gap, not itself a regression)
- **What happened:** No batch surfaced — consistent with the known "misclassified as lookup" gap already documented for this exact phrasing style across every prior cycle.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/031-C-1a.png`

**C.1b — Batch create, explicit imperative ("Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk")**
- **Status:** FAIL
- **What happened:** Never reached a valid 3-card batch on either attempt (gate-aware `reachBatchReview` used correctly this time) — `batch=false`, `cardCount=0` both attempts. A genuine failure to produce a multi-record draft at all for this exact phrasing, distinct from the "wrong content" failures seen elsewhere in this section.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/032-C-1b.png`

**C.2 — Shared clarification across batch cards ("Legg til to nye kategorier: Skinnhotell og Feltlager")**
- **Status:** PARTIAL
- **What happened:** No clarification ever surfaced on either attempt — same catalogueId-ambiguity shape as B.2/B.3, now inside a batch too. Nothing created.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/033-C-2.png`

**C.3 — Per-card actions (confirm/edit/remove independence) — mechanics PASS, content severely wrong**
- **Status:** PARTIAL (mechanics only — see Key Findings #2)
- **What happened:** A 4-card batch was reached (`batch=true count=4`) and confirm/edit/remove all worked mechanically (`confirmOk`/`editOk`/`removeOk` all true) — the C.3-specific "per-card independence" bug the qwen3:8b cycle found and fixed does **not** reproduce here; confirming one card correctly left the others staged. But the batch's own *content* was never the requested "Card Test A/B/C for Batterier" at all — it fabricated cards named after real category names instead (confirmed via real data: the confirm+edit steps created real products literally named **"Batterier"** and **"Lydanlegg"**, not "Card Test A/B"). See Key Findings #2. Both fabricated products were part of what the cleanup incident (Methodology #4) then accidentally over-deleted and had to be reconstructed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/034-C-3.png`

**C.4 — Invalid discount blocks Confirm all only ("...Varta 70Ah for 1100 kr med 150% rabatt")**
- **Status:** FAIL
- **What happened:** A 4-card batch was reached, but **none** of the cards were "Bosch 60Ah"/"Varta 70Ah" as requested — the real summaries show cards named "Batterier", "Lydanlegg", "Bremser", and a fourth, all using real category names as product names (same root cause as C.3 — see Key Findings #2). Since no card was ever named "Bosch", the scenario's own specific mechanic (does an invalid discount block Confirm-all) was never actually exercised — `disabled=false` is inconclusive, not a validation failure, but the batch content itself is a clear FAIL independent of that.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/035-C-4.png`

**C.5 — Confirm all on a clean batch ("...Pioneer Høyttaler for 800 kr og Sony Forsterker for 950 kr")**
- **Status:** FAIL
- **What happened:** Never reached a valid batch on either attempt — `batch=false`, nothing created.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/036-C-5.png`

**C.6 — Cancel all, nothing created**
- **Status:** PASS (by default — precondition never triggered)
- **What happened:** Never reached a valid batch on either attempt, so nothing to cancel — graded PASS since the scenario's own invariant ("no products should exist either way") trivially holds, but the "Avbryt alt" mechanic itself was not actually exercised this run.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/037-C-6.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** PASS
- **What happened:** A real 2-card event batch was reached with the correct titles, dates, and addresses (Sommertreff/Vintertreff, each card's own fields correctly isolated, no cross-record bleed) — confirmed via the real summaries text. Confirmed via "Bekreft alle"; both real events verified created correctly and later cleaned up. Notably, event-batch content was correct where product-batch content (C.3/C.4) was not — the fabrication problem in Key Findings #2 appears specific to product batches, not batches in general.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/038-C-7.png`

**C.8 — No false batch UI for single-record message**
- **Status:** PASS
- **What happened:** Correctly produced a single-record gate (`gate=true`), never a batch (`batchShown=false`).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/039-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** PARTIAL
- **What happened:** Gate reached, but the gate text shows only **one** summary line ("Motorolje / Motor Oil · Motorolje · 150 kr") for a 3-record request — both a record-count shortfall and the same category-name-as-product-name fabrication as C.3/C.4 (Key Findings #2), inside the gate summary this time. Cancelled, not confirmed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/040-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PARTIAL
- **What happened:** Gate correctly showed 5 summary lines plus "…og 1 til" for the 6th record (overflow-line mechanic works correctly) — but every line reads **"Tilbehør"** as the category (e.g. "Dekk Seks A · Tilbehør · 100 kr"), not Dekk, for a batch of tire products — a batch-scale confirmation of the same Tilbehør-misplacement pattern from B.1/B.6 (Key Findings #3), this time with correctly-preserved product names (unlike C.3/C.4/C.9a). Cancelled, not confirmed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/041-C-9b.png`

## K. Deterministic post-checks (first-ever pass, this framework)

**K.1 — `filter-field-exists`**
- **Status:** Inconclusive (check present, `ok:true`, no fabricated field name proposed this attempt)
- **What happened:** Reply correctly answered the discount question (3 real items). The check ran cleanly with nothing to catch. Not a confirmed-working result on its own — see A.1's own trace for a *different* filter-fabrication class this check family doesn't cover at all (Key Findings #1).
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/042-K-1.png`

**K.2 — `filter-not-brand-name`**
- **Status:** Inconclusive (adversarial trigger didn't reach its target pipeline)
- **What happened:** "Har Wraps & Coffee dekk på lager?" got routed through `select_command`/`select_item` (an item-resolution path) rather than `lookup_query` — the reply is again a raw leaked `real-ambiguity-forces-clarify` reason string (same pattern as A.10/K.5), meaning this specific trigger message never actually exercised `filter-not-brand-name` at all. The row needs a different trigger phrasing in a future cycle to reliably hit the intended pipeline.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/043-K-2.png`

**K.3 — `filter-op-shape-mismatch`**
- **Status:** Inconclusive (fallback fired instead)
- **What happened:** "Hvilke produkter har 'sport' i navnet?" triggered the same `reconsiderEmptyResult` empty-match fallback as A.9b/A.12a/A.extra — the filter attempt matched nothing, so the app listed all 115 products instead (baseline had drifted to 115 by this point in the run from earlier scenario creates) rather than exercising the op-shape check on a real match.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/044-K-3.png`

**K.4 — `no-fabricated-selection`**
- **Status:** Inconclusive, as expected — this check's own doc comment predicts a near-zero fire rate (the schema enum already structurally blocks it); an empty reply here (no real write attempted) is the realistic outcome, not evidence the row failed to probe anything.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/045-K-4.png`

**K.5 — `real-ambiguity-forces-clarify` — confirmed working live**
- **Status:** Genuine PASS for the check itself (my own `extractChecks` trace-array parser reads empty here — see the note below, but the actual reply text and screenshot confirm the check fired and resolved correctly)
- **What happened:** "Oppdater prisen på et Batterier-produkt til 500 kr" (names no specific product, 10 real Batterier candidates at the time) produced exactly the intended `reject-clarify` behavior: `Selected "category-...-af1f3c28-..." from 10 candidates, but none of their labels appear anywhere in the message — no real textual grounding for this pick.` — confirmed via screenshot. **Methodology correction:** when a `reject-clarify` verdict fires, the whole HTTP request throws before a normal trace-carrying response is ever returned to the client (per `framework.ts`'s own design — falls through to a plain `400 { error }`), so the `checks[]` array this harness reads via the clipboard export is never populated for this specific verdict type. The check's firing is only inferable from the reply text matching its own known reason-message shape, not from the trace. This is a real, structural limitation of Section K's own harness design for `reject-clarify` rows specifically (K.2, K.5, A.10 all hit it) — worth fixing in a future cycle by threading the pre-throw trace through the error response, or accepting text-pattern matching as the permanent method for this verdict type.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/046-K-5.png`

**K.6 — `entity-action-consistency`**
- **Status:** Inconclusive (adversarial trigger routed into an unrelated, already-known bug instead)
- **What happened:** "Hvilke nye dekk kan vi legge til i sortimentet?" was correctly classified `messageType: "question"` (never reached `select_command`/the create-misclassification path at all), but `select_lookup_target` then proposed three entities including **`appearanceThemeColor`** — a nonsensical third entity — triggering the multi-entity `lookup_batch` fallback path (the same "2+ entities detected falls through to the unreliable path" root cause the qwen3:8b cycle already documented), which took over 2 minutes and ~76,000 input tokens per attempt before settling on an answer that just listed recently-created test products. The row's own intended check was never reached; this scenario instead reproduces a known, separate bug.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/047-K-6.png`

**K.7 — `entity-searchtext-consistency`**
- **Status:** Inconclusive
- **What happened:** "Fortell meg om produktet Continental Sommerdekk" resolved to a real (if Tilbehør-placed) product correctly; the specific `searchText`-set-but-`lookupEntities`-empty failure mode this check targets didn't reproduce on this attempt.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/048-K-7.png`

**K.8 — `pronoun-not-searchtext` (shared 2-turn session)**
- **Status:** FAIL (unrelated to the check itself)
- **What happened:** Q1 ("Hvor mange produkter har vi i Lydanlegg-kategorien?") answered "Vi har 4 produkter." — itself a Key-Findings-#1-style plain/filtered count question, real Lydanlegg count at the time was 3 (pre-reconstruction), so this is off by one, consistent with the broader count-reliability problem rather than a Lydanlegg-specific issue. Q2 ("Hva koster den billigste?") returned a completely **empty** reply — the turn produced nothing at all, so the check's own resolution (auto-fix vs. correctly-already-resolved) can't be assessed either way this attempt.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/049-K-8.png`

**K.9 — `no-hallucinated-values-in-safe-mode`**
- **Status:** N/A (code-review checkpoint, not a live scenario — by design)
- **What happened:** Not adversarially triggerable via chat under current code. No other scenario in this run's own trace showed this check firing live, so no regression to flag.

**K.10 — `input-mentioned-values-only`**
- **Status:** Inconclusive — real product created, dietary line not independently readable from the captured review text this attempt
- **What happened:** "Legg til en ny salat som heter Vegetar-bowl, vegansk, 129 kr" produced a confirmed real product (Matmeny → Salater, correct placement) — an empty top-line reply and a review-text capture that didn't include the dietary-tags row in what was extracted, so whether an unmentioned tag (e.g. "vegetarian") got fabricated alongside "vegan" isn't confirmed either way from this attempt's own evidence. Cleaned up along with the rest.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/050-K-10.png`

**K.11 — `dual-price-both-fields`**
- **Status:** Inconclusive
- **What happened:** "Iskaffe koster 45 kr, men er dyrere om du sitter og drikker den her" produced a real reply ("Kald kaffe over is med et skvett melk koster 55 kr ved spisebordet") describing a dual-price scenario in prose, but the review's own price rows weren't captured in the evidence this attempt, so whether `priceMode: 'dual'` actually landed with only one field filled (the failure this check targets) isn't independently confirmed. Draft cancelled either way, per design — no real write.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/051-K-11.png`

**K.12a — `catalogueId-context-consistency`, true-positive case (shared 2-turn session)**
- **Status:** Inconclusive
- **What happened:** Q1 ("Hvor mange produkter har vi i AutoDeler?") itself answered wrong ("Vi har 0 produkter" — another Key Findings #1 instance), which may have affected whether real `DialogFocus` actually got set on AutoDeler for Q2 to test against. Q2 (category creation, no catalogue named) produced an empty reply with no clarification — inconclusive for the check's own behavior either way.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/052-K-12a.png`

**K.12b — `catalogueId-context-consistency`, false-positive guard (shared 2-turn session)**
- **Status:** Inconclusive (same Q1 issue as K.12a)
- **What happened:** Same Q1 wrong-count issue. Q2 (explicitly naming Matmeny) produced an empty reply, `clarifying=false` — at minimum, **no false-positive reject-clarify occurred** (which would have been a clear FAIL per this row's own design), so the specific thing this row exists to guard against did not happen, even though the positive "did it correctly resolve to Matmeny" half isn't independently confirmed.
- **Screenshot:** `../assistant-qa-screenshots-gemma3-4b/053-K-12b.png`

## Key findings summary

1. **Plain, unfiltered count/list questions are frequently and severely wrong — the single biggest, most consolidatable finding this run.** Confirmed across 7 independent scenarios: A.1 (3 vs. real 109), A.4/A.5/A.6 (106 vs. 109, milder), A.12a-Q1 (0 vs. 1 event), A.12b-Q2 ("no events" vs. 1), A.extra-Q1 (0 vs. 2 catalogues), A.extra-Q2 (1 vs. 14 categories, across two independently-fabricated filters on retry). **Root cause (confirmed via trace):** `lookup_query` fabricates an entirely unprompted filter clause on questions that name no filter criteria at all — e.g. `hasDiscount:true` for a plain product-count question, `categoryCount equals 1` for a plain catalogue-count question. None of today's three new `lookupQuery` postChecks (`filter-field-exists`/`filter-not-brand-name`/`filter-op-shape-mismatch`) catch this, since the fabricated filter uses a real field, a non-brand value, and a plausible op shape — they validate a proposed filter's *shape*, not whether a filter should exist at all. `filter-not-brand-name` did correctly catch one instance of this pattern that happened to collide with the brand name (A.extra's first attempt), but the retry immediately fabricated a different bogus filter instead, confirming the underlying problem is broader than that one check's own scope. This is very likely connected to `gemma3:4b`'s own missing `tools` capability (flagged as a risk before this run started) — a direct, sharp contrast with the qwen3:8b cycle's own **100%-correct** result on this exact pipeline, including plain empty-filter counts.
2. **Batch/multi-record product creation frequently fabricates category names as product names outright — a severe, distinct failure from simple field-omission.** Confirmed across 3 scenarios: C.3 (created real products literally named "Batterier" and "Lydanlegg" instead of "Card Test A/B"), C.4 (all 4 batch cards named after categories, none matching "Bosch"/"Varta"), C.9a (gate summary shows "Motorolje" instead of "Gate Batch A/B/C", and only 1 line for a 3-record request). Notably does **not** reproduce on event batches (C.7) or on one tire batch that got names right but category wrong (C.9b) — the fabrication appears specific to product batches. This directly caused the mid-cycle cleanup incident (Methodology #4) when a cleanup script targeting the fabricated "Batterier"/"Lydanlegg" products by name collided with their own category names.
3. **AI-driven category/catalogue placement for tire ("Dekk") products is unreliable and, unlike prior cycles' findings, inconsistent rather than a single wrong default.** The same or near-identical "Legg til et nytt dekk..." message landed in three different wrong places across this one run: Tilbehør (B.1, B.6 Confirm, B.6 Edit, C.9b's whole batch), Verktøy (B.11a — the just-created empty category from an unrelated earlier scenario), and never-placed-at-all (B.7, C.1b). The one correctly-and-consistently-placed category creation this run (B.8's "Verktøy" → AutoDeler) is notably *better* than the qwen3:8b cycle's own result for that exact scenario (which landed in Matmeny) — placement quality is not uniformly worse than qwen3:8b, just far less consistent. **Suspected root cause:** distinct from the already-fixed `catalogueId` "food-menu" default bias (a single, deterministic wrong default) — this looks more like `gemma3:4b` picking up whatever category happens to be salient in its own recent context (Verktøy, just created moments earlier) or defaulting inconsistently, not a fixed enum-ordering bug. Worth its own root-cause investigation in a future cycle rather than assuming the existing fix covers it.
4. **Self-reported success is unreliable and must be verified against real data — confirmed twice this run, independently.** B.10 (delete via chat) read a real confirm phrase, clicked through it, and self-reported `deleted=true` — the product was still present in real data both times this was checked (once in the aborted first run attempt, once in this final one). Consistent with the standing methodology's own core rule; worth escalating from a one-off caveat to something worth its own scenario if a future cycle wants to isolate it.
5. **New finding: the `real-ambiguity-forces-clarify` postCheck genuinely works, confirmed live on its very first QA pass.** K.5's adversarial trigger (an update naming a category with 10 real candidates but no specific product) produced exactly its intended `reject-clarify` behavior, screenshot-confirmed. A.10's Q2 independently reproduced the same check firing correctly on a completely different, non-adversarial message — real, spontaneous evidence the check catches genuine fabrication in normal use, not just a contrived trigger.
6. **New finding: a `reject-clarify` verdict surfaces as raw internal debug text to the admin, not a graceful message.** Confirmed 3 times (A.10, K.2's misrouted trigger, K.5) — every instance shows the postCheck's own internal `reason` string (referencing internal candidate IDs like `category-1785698944060-1785698945682`) rendered directly in the chat transcript. This matches the framework's own documented design ("falls through to a plain 400, which the chat UI already renders as an inline error — no new route wiring needed to surface honestly") — technically working as designed, not a bug, but the actual text is not appropriate for an end admin to read. Worth a follow-up: either compose an admin-friendly generic message for this verdict type specifically, or accept the current text as an internal/debug-only tradeoff and document it as such.
7. **Harness limitation, not a model/app finding: `reject-clarify` verdicts don't reach the trace `checks[]` array at all.** The whole HTTP request throws before a normal response (carrying the trace) is returned, so this harness can only infer a `reject-clarify` firing from reply-text pattern matching, never from `checks[]`. Affects K.2, K.5, and any other `reject-clarify`-shaped row — a future cycle should either thread the pre-throw trace into the error response, or standardize on text-matching for this verdict type explicitly rather than treating an empty `checks[]` array as inconclusive by default.
8. **App-level mechanics that don't depend on model quality all held up:** the draft-quality gate's three actions (B.5a/b/c), the posture kebab-override round-trip (B.11a/b — mechanically; see Key Findings #3 for the placement/field-visibility issues found *within* it), manual-creation isolation (B.12), single-vs-batch UI gating (C.8), the batch overflow-line display (C.9b — mechanically), per-card batch independence (C.3 — the qwen3:8b cycle's own C.3 bug does **not** reproduce here), and cross-record event-batch isolation (C.7) all worked correctly regardless of the underlying draft's own content quality.

## Cleanup performed

`AutoDeler` (7 categories) and `Matmeny`'s own 7 categories were **kept in place**, per standing policy. Every record this cycle's scenarios created on top of them was removed via the real admin UI, verified directly against `server/data/*.json` before and after — not any script's own self-report:

| Record | Created in | Deleted via | Note |
| --- | --- | --- | --- |
| Product "Continental Sommerdekk" (AutoDeler → **Tilbehør**, 1200→1350 kr) | B.1/B.9 | Admin UI delete | B.10's own "deleted=true" self-report was false; still present until this cleanup pass |
| Product "Gate Confirm Dekk" (AutoDeler → Tilbehør) | B.6 (Confirm path) | Admin UI delete | |
| Product "Gate Edit Dekk" (AutoDeler → Tilbehør) | B.6 (Edit path) | Admin UI delete | |
| Product "Manuell Test Dekk" (AutoDeler → Dekk, manual creation) | B.12 | Admin UI delete | |
| Category "Verktøy" (AutoDeler) | B.8 | Admin UI delete | |
| Product "Vegetar-bowl" (Matmeny → Salater, 129 kr) | K.10 | Admin UI delete | |
| Events "Sommertreff", "Vintertreff" | C.7 | Admin UI delete | |

**Incident:** a cleanup script targeting two real leftover products fabricated by C.3/C.4's own batch fill — literally named "Batterier" and "Lydanlegg", identical to their own category names — used `deleteProductInCategory(page, 'Batterier', 'Batterier')`/`(..., 'Lydanlegg', 'Lydanlegg')`. Because the category-section-scoping helper and the individual product-row locator share the same DOM structure/class when the searched text matches the category's own header, this deleted the **entire** Batterier (9 products) and Lydanlegg (3 products) categories instead of the single fabricated product in each. `server/data/` is gitignored (no git history) and the live `WrapsCoffeeBackup` mirror only reflects current state with no versioning — the original product data could not be recovered through any available channel. Per the user's explicit direction (AutoDeler is a disposable QA fixture), both categories were reconstructed: the real original product names (Batterier Del 1–9, Lydanlegg Del 1–3) were recovered from this same run's own A.9b evidence (a full store listing captured *before* the deletion happened); prices are new placeholders in the same style as the surviving "Del N" categories, not the original values.

**Final verification:** AutoDeler back to 54 products / 7 categories (Batterier: 9, Lydanlegg: 3, both reconstructed as above); Matmeny back to its original 7 categories, 54 products, untouched throughout; total store-wide product count back to 109; 1 event unchanged; 2 catalogues, 14 categories.
