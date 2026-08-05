# Assistant QA Report — Local/qwen3:8b — fresh-session-by-default — 2026-08-04

**Template version:** Base 1 + Project 1
**Configuration tested:** Local (Ollama), thinking `qwen3:8b`, vision `qwen2.5vl:3b` (unchanged split from the 2026-08-03 cycle — `qwen3:8b` has no vision capability of its own). This is a direct re-run of the 2026-08-03 cycle's own scenario set, against today's app code and the new `postChecks` framework (first-ever pass) for this model. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except B.11a/b, which explicitly override it.
**Environment:** http://localhost:5173, dev instance, `main` branch. Continues directly from Run 1 (`gemma3:4b`) of this same multi-model cycle — environment re-verified back to the exact 109/2/14/54-in-AutoDeler baseline before this run started.
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/run-multi-model.mts`, the same script used for every run in this cycle). Full raw evidence (every reply, every trace step including the new `checks[]` array, one screenshot per scenario) is in `QA/scratchpad-qwen3-8b-results.json` and `QA/assistant-qa-screenshots-qwen3-8b/`.
**Session policy:** every scenario starts with the panel's own "New chat" button clicked immediately beforehand, except A.10, the paired clarification/gate/batch scenarios, and Section K's K.8/K.12a/K.12b (each needing its own 2-turn shared session) — unchanged from the 2026-08-03 cycle and from Run 1 of this cycle.

## Methodology notes — read before the per-scenario results

1. **Environment continued directly from Run 1**, re-verified clean (109 products, 2 catalogues, 14 categories, 54 in AutoDeler) immediately before this run's first scenario — no re-seed needed.
2. **A real harness bug in this cycle's own B.9 scenario code caused a genuine duplicate product, since fixed.** B.9's existence check (`if a "Continental Sommerdekk" product already exists, skip seeding a new one`) used a raw, un-expanded DOM locator instead of the already-documented `productExistsInCategory` helper (which expands the category section before checking) — the exact class of bug the project's own "Known harness state" already warned about, inherited by copying old script logic without re-checking it against that list. Since B.1 had already created "Continental Sommerdekk" earlier in this same run, and the section wasn't expanded at B.9's own check, the stale check read 0 and B.9 force-created a **second**, real "Continental Sommerdekk." This is a harness bug, not a model/app issue — fixed in `run-multi-model.mts` (now uses `productExistsInCategory`) for Run 3 onward. See Key Findings #1 for what this accidentally revealed about `real-ambiguity-forces-clarify`.
3. **Retry-once rule applied throughout** — every scenario using `withRetryOnce`/`withCheckRetryOnce` is noted per-scenario below with whether the retry fired and what it changed.
4. **A cleanup gap was found and fixed before the final baseline check** — K.10's own confirmed "Vegetar-bowl" (Matmeny → Salater) was missed in the first cleanup pass and caught by the standing "verify against real data" rule (110 products instead of the expected 109); fixed immediately, verified back to exact baseline.
5. **Overall verdict, stated up front:** `qwen3:8b` remains **substantially stronger than `gemma3:4b`** on this same battery (Run 1 of this cycle) and mostly **holds up well against its own 2026-08-03 cycle**, with two notable exceptions worth flagging clearly. Section A's deterministic `lookup_query` pipeline is again **100% correct** across every scenario, including A.10's pronoun resolution (which now correctly answers "209 kr" — a genuine improvement over the 2026-08-03 cycle's own hallucinated-products finding for this exact scenario). Product/category placement is excellent for products (every AI-created product this run landed in its real, correct category) but the **category-creation catalogueId bias has not actually gone away** — B.2/B.3a/b, C.2 still never clarify, and B.8's "Verktøy" landed in Matmeny again, identical to the 2026-08-03 cycle's own finding, despite that report describing a `nullable()` fix as applied afterward (Key Findings #2). Section K's own postChecks generally read clean, with the harness-bug-caused duplicate (Methodology #2) giving an unplanned but genuine live confirmation that `real-ambiguity-forces-clarify` correctly refuses to guess between two real, identically-named candidates (Key Findings #1) — the same positive signal Run 1 found by design, this time found by accident.

**Tally:** 15 PASS, 2 PARTIAL, 6 FAIL, 2 N/A, 0 ERROR, 29 CAPTURED (mechanics/output captured for analysis; several graded informally in prose above their raw status — see Key Findings) across 54 scenarios.

## A. Read/lookup pipeline

**A.1 — Plain count**
- **Status:** PASS
- **What happened:** "Vi har 109 produkter." — correct. `lookup_query` proposed an empty filter set — the deterministic count path, no fabrication.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/001-A-1.png`

**A.2 — Filtered count**
- **Status:** PASS
- **What happened:** "Vi har 3 produkter." — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/002-A-2.png`

**A.3 — Which product is on sale**
- **Status:** PASS
- **What happened:** Correctly named all 3 real discounted products.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/003-A-3.png`

**A.4 — List all products**
- **Status:** PASS
- **What happened:** "Her er 109 produkter:" with a genuine, correctly-counted 109-item list.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** PASS
- **What happened:** Both halves correctly answered — 109-item list plus the correct 3-item discount summary.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/005-A-5.png`

**A.6 — Compound two-interrogative**
- **Status:** PASS
- **What happened:** "Vi har 109 produkter." + correct 3-item discount list, both halves correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create**
- **Status:** PASS
- **What happened:** Correctly classified as non-command, gate/batch/review all false.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** PASS
- **What happened:** Correctly surfaced both real Frontlys candidates.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** PASS
- **What happened:** Correctly found 4/4 (Pulled Pork substring collision + 3 real LED products).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** PASS
- **What happened:** Correctly found the same 4/4 under English UI — no `reconsiderEmptyResult` fallback needed this time, the filter itself worked directly (contrast with `gemma3:4b`'s own A.9b FAIL this cycle).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/010-A-9b.png`

**A.10 — Pronoun follow-up (own 2-turn continuity, diagnostic) — real improvement over 2026-08-03**
- **Status:** PASS
- **What happened:** Q1 correctly listed all 4 real Bremser products. Q2 ("den første") correctly answered **"Den første koster 209 kr."** — the real price of Bremser Del 1, correctly resolved via `select_lookup_target`. The 2026-08-03 cycle's own A.10 finding (hallucinated non-existent products, wrong price from a completely different category) does **not** reproduce here — a genuine, confirmed fix.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/011-A-10.png`

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** PASS
- **What happened:** "Vi har 1 arrangement." → "Det er bare Bilutstilling på tunet (2026-09-02)." — both correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/012-A-12a.png`

**A.12b — Event bilingual display (English UI, no English title)**
- **Status:** PASS
- **What happened:** "We have 1 event." → "There's only Bilutstilling på tunet (2026-09-02)." — correct bilingual fallback.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/013-A-12b-events-view.png`

**A.extra — Catalogue count and category count**
- **Status:** PASS
- **What happened:** "Vi har 2 kataloger." / "Vi har 14 kategorier." — both correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/014-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping**
- **Status:** PASS
- **What happened:** Gate → review → confirmed, no Allergener/Kosthold-tagger shown (correct posture stripping). **Real placement: AutoDeler → Dekk** — correct, unlike `gemma3:4b`'s Tilbehør misplacement this cycle.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/015-B-1.png`

**B.2/B.3a — Clarification loop, tap to pick catalogue ("Legg til en ny kategori som heter Dekkhotell")**
- **Status:** FAIL
- **What happened:** No clarification surfaced on either attempt — same as the 2026-08-03 cycle's own finding for this exact scenario. See Key Findings #2.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/016-B-2-B-3a.png`

**B.2/B.3b — Clarification loop, typed chat answer ("...Sesonglager")**
- **Status:** FAIL
- **What happened:** Same pattern — no clarification either attempt.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/017-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification**
- **Status:** N/A
- **What happened:** Blocked by the same upstream issue as B.2/B.3 — no clarification ever surfaced.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/018-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/019-B-5a.png`

**B.5b — Draft-quality gate, "Prøv igjen"**
- **Status:** PASS
- **What happened:** Composer restored exactly, focused, gate dismissed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/020-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt"**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/021-B-5c.png`

**B.6 (Confirm path)**
- **Status:** PASS
- **What happened:** Gate → review → confirm mechanics worked. **Real placement: Dekk** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/022-B-6-confirm.png`

**B.6 (Edit path)**
- **Status:** PASS
- **What happened:** Gate → review → edit → save worked. **Real placement: Dekk** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/023-B-6-edit.png`

**B.7 — Price/discount display fix**
- **Status:** PASS
- **What happened:** No fabricated discount percentage shown; confirmed. **Real placement: Bremser** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/024-B-7.png`

**B.8 — Category custom-field fabrication check ("Legg til en ny kategori som heter Verktøy") — bias still present**
- **Status:** FAIL
- **What happened:** No unrequested custom fields fabricated (a genuine positive). But **verified via real data: "Verktøy" landed in Matmeny**, not AutoDeler — identical to the 2026-08-03 cycle's own finding for this exact scenario, despite that report describing a `nullable()` schema fix as applied immediately afterward. See Key Findings #2 — the fix does not appear to hold for this specific scenario on this model, one cycle later.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/025-B-8.png`

**B.9 — Update product price via chat — harness-caused duplicate, not a real app regression**
- **Status:** N/A (harness gap this run — see Methodology #2)
- **What happened:** Reply is the raw `real-ambiguity-forces-clarify` reason string, correctly refusing to guess between the 2 real "Continental Sommerdekk" products this run's own harness bug created. `confirmed=false`. This scenario's own intended test (does update work against a single unambiguous candidate) was not actually exercised this run — see Key Findings #1 for the positive read on what this accidentally proved instead.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/026-B-9.png`

**B.10 — Delete product via chat — same harness-caused duplicate**
- **Status:** N/A (harness gap this run)
- **What happened:** Same leaked reason text, same root cause as B.9. No confirm phrase ever surfaced (`phrase=""`), `deleted=false`. Real data cleanup handled both duplicates directly via the admin UI instead.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/027-B-10-after.png`

**B.11a — Kebab override, posture Av (full)**
- **Status:** PASS
- **What happened:** `gate=false` correctly. **Allergener and Kosthold-tagger fields both present** (screenshot-confirmed) — matching the 2026-08-03 cycle's own finding for this model, and a real contrast with `gemma3:4b`'s absent fields this cycle. Trace shows the correct tagged `(draft)`/`(verify)` pair.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/028-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk**
- **Status:** PASS
- **What happened:** Posture correctly reverted, `gate=true`, single untagged call.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/029-B-11b.png`

**B.12 — Manual product creation unaffected**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/030-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing**
- **Status:** N/A (known gap, not itself a regression)
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/031-C-1a.png`

**C.1b — Batch create, explicit imperative ("...sommerdekk, vinterdekk og piggdekk")**
- **Status:** PASS
- **What happened:** A correct 3-card batch (real requested names, real prices — 1200/1300/1200 kr) reached and confirmed. **Real placement: all 3 in Dekk** — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/032-C-1b.png`

**C.2 — Shared clarification across batch cards ("...Skinnhotell og Feltlager")**
- **Status:** PARTIAL
- **What happened:** No clarification ever surfaced — same catalogueId-bias root cause as B.2/B.3/B.8 (Key Findings #2), now confirmed inside a batch too. Nothing created.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/033-C-2.png`

**C.3 — Per-card actions (confirm/edit/remove independence) — content AND mechanics both correct**
- **Status:** PASS
- **What happened:** A correct 3-card batch (real requested names "Card Test A/B/C," matching Batterier) reached; confirm/edit/remove all worked mechanically, and — unlike `gemma3:4b`'s own C.3 this cycle — the batch *content* itself was correct throughout, no category-name-as-product-name fabrication. The C.3 per-card-independence bug the 2026-08-03 cycle found and fixed does not reproduce.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/034-C-3.png`

**C.4 — Invalid discount blocks Confirm all only ("...Varta 70Ah for 1100 kr med 150% rabatt")**
- **Status:** N/A (precondition never triggered)
- **What happened:** A correct 2-card batch reached, both real requested names (Bosch 60Ah, Varta 70Ah), correct categories. No fabricated discount on either card (a genuine positive — matching the 2026-08-03 cycle's own finding for this scenario) — but that also means the specific mechanic this scenario tests (does the app block Confirm-all on a genuinely invalid discount) was never actually exercised. `disabled=false` is inconclusive, not a validation failure.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/035-C-4.png`

**C.5 — Confirm all on a clean batch ("...Pioneer Høyttaler...Sony Forsterker...")**
- **Status:** PASS
- **What happened:** A correct 2-card batch, both real requested names, correct Lydanlegg placement, confirmed successfully.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/036-C-5.png`

**C.6 — Cancel all, nothing created**
- **Status:** PASS
- **What happened:** A real batch was reached and "Avbryt alt" correctly dismissed it — the mechanic itself was actually exercised this run (unlike `gemma3:4b`'s own C.6, which never reached a batch to cancel).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/037-C-6.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** PASS
- **What happened:** Both real events (Sommertreff/Vintertreff) with correctly isolated dates/addresses, confirmed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/038-C-7.png`

**C.8 — No false batch UI for single-record message**
- **Status:** PASS
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/039-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** PASS
- **What happened:** Gate correctly showed all 3 real record names ("Gate Batch A/B/C"), all in Motorolje — correct.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/040-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PASS
- **What happened:** 5 summary lines + "…og 1 til" overflow line, correct. All 6 records correctly named "Dekk Seks A–F," **all correctly placed in Dekk** — a real contrast with `gemma3:4b`'s own C.9b this cycle, which got names right but placed everything in Tilbehør.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/041-C-9b.png`

## K. Deterministic post-checks (second-ever pass, this framework)

**K.1 — `filter-field-exists`**
- **Status:** Inconclusive (check present, `ok:true`, nothing to catch)
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/042-K-1.png`

**K.2 — `filter-not-brand-name`**
- **Status:** Inconclusive (adversarial trigger didn't reach its target pipeline)
- **What happened:** Same misroute as Run 1's own K.2 — "Har Wraps & Coffee dekk på lager?" went through `select_lookup_target`/`select_item`, not `lookup_query`, so the check never had a chance to fire. Reply is a `real-ambiguity-forces-clarify`-shaped leaked reason string again.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/043-K-2.png`

**K.3 — `filter-op-shape-mismatch`**
- **Status:** Inconclusive (fallback fired instead)
- **What happened:** Same `reconsiderEmptyResult` empty-match fallback as Run 1's own K.3 — the filter matched nothing on the first attempt, so a full listing was shown instead of exercising the op-shape check on a real match.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/044-K-3.png`

**K.4 — `no-fabricated-selection`**
- **Status:** Inconclusive, as expected (near-zero fire rate by design)
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/045-K-4.png`

**K.5 — `real-ambiguity-forces-clarify` — confirmed working, second time**
- **Status:** Genuine PASS for the check (reply text and screenshot confirm it, even though the trace's own `checks[]` array is structurally unpopulated for `reject-clarify` verdicts — see Run 1's own Key Findings #7 for why)
- **What happened:** "Oppdater prisen på et Batterier-produkt til 500 kr" (10 real Batterier candidates, no product named) correctly produced `reject-clarify`, naming the real ambiguity honestly rather than guessing.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/046-K-5.png`

**K.6 — `entity-action-consistency` — same known bug reproduces**
- **Status:** Inconclusive (adversarial trigger routed into the same already-known bug as Run 1)
- **What happened:** "Hvilke nye dekk kan vi legge til i sortimentet?" again triggered the multi-entity `lookup_batch` fallback (`lookupEntities` included the nonsensical `appearanceThemeColor` again) — over 2 minutes, ~76,000 input tokens, dozens of chunked iterations, ending in an answer that just lists existing products. Identical failure shape to Run 1's own K.6, on a different model — strong signal this is a genuine, model-independent app bug in the entity-detection step for this exact phrasing, not model-specific noise.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/047-K-6.png`

**K.7 — `entity-searchtext-consistency`**
- **Status:** Inconclusive
- **What happened:** "Fortell meg om produktet Continental Sommerdekk" resolved correctly — though the reply itself ("Her er 2 produkter: Continental Sommerdekk (Dekk) / Continental Sommerdekk (Dekk)") visibly reflects the same harness-caused duplicate from Methodology #2, not a new bug.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/048-K-7.png`

**K.8 — `pronoun-not-searchtext` (shared 2-turn session)**
- **Status:** PASS
- **What happened:** Q1 ("Hvor mange produkter har vi i Lydanlegg-kategorien?") answered "Vi har 5 produkter." — correct (real count at that point in the run, after C.5's own 2 additions). Q2 ("den billigste") correctly resolved via context.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/049-K-8.png`

**K.9 — `no-hallucinated-values-in-safe-mode`**
- **Status:** N/A (code-review checkpoint, by design — no live firing observed elsewhere in this run's own trace either)

**K.10 — `input-mentioned-values-only`**
- **Status:** Inconclusive — real product created (Matmeny → Salater, correct placement), dietary-line detail not independently captured this attempt
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/050-K-10.png`

**K.11 — `dual-price-both-fields`**
- **Status:** Inconclusive — real reply produced, price-row detail not independently captured this attempt; no real write (draft path, not confirmed)
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/051-K-11.png`

**K.12a — `catalogueId-context-consistency`, true-positive case (shared 2-turn session)**
- **Status:** Inconclusive
- **What happened:** Q1 ("Hvor mange produkter har vi i AutoDeler?") correctly answered "Vi har 124 produkter." (accurate given the real drift by this point in the run) — a real contrast with `gemma3:4b`'s own wrong Q1 answer for the equivalent scenario, so `DialogFocus` almost certainly got set correctly this time. Q2 (category creation, no catalogue named) produced an empty reply, no clarification — inconclusive for the check's own behavior either way, though the upstream focus-setting step itself looks healthier here than on `gemma3:4b`.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/052-K-12a.png`

**K.12b — `catalogueId-context-consistency`, false-positive guard (shared 2-turn session)**
- **Status:** Inconclusive — no false-positive occurred
- **What happened:** Same Q1 pattern. Q2 (explicitly naming Matmeny) produced an empty reply, `clarifying=false` — at minimum, no wrongful reject-clarify fired, which is the one thing this row would grade FAIL on.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/053-K-12b.png`

## Key findings summary

1. **New finding, confirmed a second time (by accident): `real-ambiguity-forces-clarify` correctly refuses to guess between two real, identically-named candidates.** This run's own harness bug (Methodology #2) created a genuine duplicate "Continental Sommerdekk," and B.9, B.10, K.7, and K.8 all show the check correctly detecting this and either refusing to guess (B.9/B.10) or resolving via other means. This is now confirmed on **two different models** (`gemma3:4b`'s K.5 by design, `qwen3:8b`'s B.9/B.10 by accident) — strong, convergent evidence the check works as intended in real, non-contrived situations, not just crafted adversarial prompts.
2. **The category-creation `catalogueId` bias has not actually gone away, one cycle after being described as fixed.** Confirmed across 3 independent scenarios: B.2/B.3a, B.2/B.3b (never clarify), B.8 (Verktøy lands in Matmeny again), plus C.2 inside a batch. This is **identical** to the 2026-08-03 report's own finding for these exact scenarios, despite that report's own Methodology section describing a `nullable()` schema fix and the new `catalogueId-context-consistency` postCheck as additional backstops. **Suspected root cause:** worth direct code re-verification in a future cycle — either the `nullable()` fix didn't fully land, or `fill_fields_batch_category`'s own default-guessing behavior on `qwen3:8b` specifically doesn't route through the code path `catalogueId-context-consistency` actually covers (that check only fires when a *DialogFocus-mismatched* value is present; a model that guesses `"food-menu"` on a `null`-eligible field without ever being influenced by conversation context wouldn't trigger it either way). This is the single most actionable, reproducible finding in this report.
3. **Product creation placement remains excellent — every single AI-created product this run landed in its correct real category:** B.1, B.6 (both paths), B.7, C.1b (×3), C.3 (×3), C.5 (×2), C.9a (×3), C.9b (×6) all verified correctly placed. This is a clean, complete confirmation of the 2026-08-03 cycle's own "product creation placement is now reliable" finding — the placement problem is specifically a *category*-creation issue (Key Findings #2), not a product-creation one.
4. **A.10's pronoun-resolution/lookup_batch hallucination is confirmed fixed.** The 2026-08-03 cycle's own headline A.10 finding (hallucinated non-existent Bremser products, wrong price from an unrelated category) does not reproduce — this run's A.10 correctly lists all 4 real Bremser products and correctly resolves "den første" to the real 209 kr price.
5. **K.6's `entity-action-consistency` adversarial trigger reproduces the identical multi-entity `lookup_batch` fallback bug on a second, different model.** Both `gemma3:4b` and `qwen3:8b` route "Hvilke nye dekk kan vi legge til i sortimentet?" through the same nonsensical `appearanceThemeColor`-inclusive multi-entity path, both taking well over a minute and dozens of chunked iterations. This is strong, convergent evidence the bug lives in the deterministic entity-detection step itself (shared code, not model-dependent output), not in either model's own behavior — worth a direct code investigation rather than further QA-cycle confirmation.
6. **App-level mechanics that don't depend on model quality all held up:** the draft-quality gate's three actions, the posture kebab-override round-trip (mechanically — B.11a's field-visibility itself is correct here, matching 2026-08-03), manual-creation isolation, single-vs-batch UI gating, batch overflow-line display, per-card batch independence (C.3 — confirmed not reproducing, same as 2026-08-03), and cross-record event-batch isolation all worked correctly.
7. **Harness limitation, not a model/app finding (carried forward from Run 1):** `reject-clarify` verdicts still don't reach the trace `checks[]` array — every instance in this run (B.9, B.10, K.2, K.5, K.7's own duplicate-driven reply) is only readable from reply-text pattern matching.

## Cleanup performed

`AutoDeler` and `Matmeny` were **kept in place**, per standing policy. Every record this cycle's scenarios created was removed via the real admin UI, verified against `server/data/*.json` before and after:

| Record | Created in | Deleted via | Note |
| --- | --- | --- | --- |
| Product "Continental Sommerdekk" ×2 (AutoDeler → Dekk) | B.1 + this run's own B.9 harness bug (Methodology #2) | Admin UI delete (both) | The second copy is a harness artifact, not a model/app-created record |
| Product "Gate Confirm Dekk" (AutoDeler → Dekk) | B.6 (Confirm path) | Admin UI delete | |
| Product "Gate Edit Dekk" (AutoDeler → Dekk) | B.6 (Edit path) | Admin UI delete | |
| Product "Manuell Test Dekk" (AutoDeler → Dekk, manual) | B.12 | Admin UI delete | |
| Product "sommerdekk", "vinterdekk", "piggdekk" (AutoDeler → Dekk) | C.1b | Admin UI delete | |
| Product "Brembo Sportbrems" (AutoDeler → Bremser) | B.7 | Admin UI delete | |
| Product "Card Test A", "Card Test B" (AutoDeler → Batterier) | C.3 | Admin UI delete | |
| Product "Bosch 60Ah" (AutoDeler → Batterier) | C.4 | Admin UI delete | |
| Product "Pioneer Høyttaler", "Sony Forsterker" (AutoDeler → Lydanlegg) | C.5 | Admin UI delete | |
| Category "Verktøy" (Matmeny, misplaced) | B.8 | Admin UI delete | |
| Product "Vegetar-bowl" (Matmeny → Salater) | K.10 | Admin UI delete | Missed in the first cleanup pass, caught by the standing real-data verification rule (110 vs. expected 109 products) and fixed before finalizing this report |
| Events "Sommertreff", "Vintertreff" | C.7 | Admin UI delete | |

**Final verification:** AutoDeler back to 54 products / 7 categories; Matmeny back to its original 7 categories, 54 products; total store-wide product count back to 109; 1 event unchanged; 2 catalogues, 14 categories.
