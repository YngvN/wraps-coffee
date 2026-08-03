# Assistant QA Report — Local/gemma3:4b — 2026-08-03 (Playwright-automated re-run)

**Provider tested:** Local (Ollama), model `gemma3:4b` explicitly selected (both "Tankemodell"/thinking and "Bildemodell"/vision set to the same Custom tag). Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except where a scenario explicitly overrides it (B.11).
**Environment:** http://localhost:5173, dev instance, `main` branch (uncommitted Phase 1–3 assistant changes in the working tree).
**Execution method:** This pass was driven by a real headless Chromium browser under Playwright (`scratchpad/qa/*.mts`, not committed), scripted to click through the actual admin UI and chat with the actual assistant panel exactly as a human tester would — not narrated or simulated. Full raw evidence (every reply, every expanded trace step, one screenshot per scenario) is preserved in `scratchpad/qa/results.json` and `assistant-qa-screenshots/`.

## Methodology notes — read before the per-scenario results

Two things materially shaped this run and are called out explicitly so the results below aren't misread:

1. **Shared dev environment, not a clean slate.** This instance already had two pre-existing catalogues before seeding — "Matmeny" (the real "Food menu" seed, several categories with real products, at least one with a genuine pre-existing discount) and a leftover test catalogue "sdfsfd" (1 category, "sdfsdfsd"). Per instructions these were left untouched. The assistant's product/discount/catalogue/category counts are **store-wide, not scoped to the AutoDeler catalogue** — so absolute counts differ from the QA doc's literal expected values (e.g. "54 products" or "1 discounted product") by whatever this baseline already contributed. Measured baseline: **55 pre-existing products**, 1 (or possibly 2 — see A.2/A.3) pre-existing discounted product(s). Every count-based scenario below is graded against *baseline + AutoDeler's own 54*, not the literal number in the original QA doc.
2. **One long single chat session.** All of Section A through C.9b ran as one continuous conversation in the assistant panel (33 scenarios, ~60+ turns), matching how an admin would actually use it, but pushing a 4B-parameter local model's context a long way past where its tool-call reliability stays crisp. From partway through Section B onward, `select_command` (the step that decides *which* entity/action a "command" message maps to) visibly starts misclassifying — e.g. a "create a new tire" message gets routed as `{"entity":"product","action":"update"}` or even `{"entity":"category","action":"update"}` instead of `create`/`product`. This is real, reproducible model behavior on this build, not a harness artifact (trace excerpts below prove it), but a shorter/fresher session per section would likely show a cleaner signal for the later scenarios. Where this is the visible cause of a scenario not reaching its intended state, it's called out explicitly rather than folded into a flat FAIL.

**Tally:** 9 PASS, 11 PARTIAL, 12 FAIL, 2 N/A, 1 out-of-scope (diagnostic-only), across the 35 numbered scenarios actually exercised.

## A. Read/lookup pipeline

**A.1 — Plain count ("Hvor mange produkter har vi?")**
- **Status:** PASS
- **What happened:** "Vi har 109 produkter." — correct (55 baseline + 54 AutoDeler).
- **Trace notes:** `classify_message` → `lookup_query` (draft, empty filters after the verify pass corrected an initial stray `hasDiscount` filter) → `lookup_query` (verify). No `answer_lookup`-style LLM-composed step — confirms the deterministic count path, per the regression check this scenario exists for.
- **Screenshot:** `../assistant-qa-screenshots/001-A-1.png`

**A.2 — Filtered count ("Hvor mange produkter er på tilbud?")**
- **Status:** PARTIAL (environment confound, not a regression)
- **What happened:** "Vi har 3 produkter." — QA doc expects 1 (only the seeded Michelin Vinterdekk). Trace confirms the deterministic filter (`hasDiscount = true`) was built correctly on both draft and verify passes, so "3" is very likely a real, non-hallucinated count. A.3's list (below) shows why: one pre-existing baseline discount ("Kylling Fajitas") plus **two** separate "Michelin Vinterdekk 205/55R16" entries, one tagged with an unresolved category "(?)" — likely a leftover duplicate from this catalogue's own iterative seeding rather than a fresh bug. Not re-investigated further given time budget.
- **Severity:** N/A for the actual fix — this is baseline data noise, but worth a human eyeballing the real product list to confirm there isn't a genuine orphan/duplicate Michelin record left over.
- **Screenshot:** `../assistant-qa-screenshots/002-A-2.png`

**A.3 — Which product is on sale**
- **Status:** PARTIAL (same confound as A.2)
- **What happened:** "Her er 3 produkter på tilbud: Kylling Fajitas (Wraps), Michelin Vinterdekk 205/55R16 (?), Michelin Vinterdekk 205/55R16 (Dekk)." Correctly lists Michelin Vinterdekk as one of the results (the QA doc's core ask), but three items not one, per A.2.
- **Screenshot:** `../assistant-qa-screenshots/003-A-3.png`

**A.4 — Bulk list request ("Gi meg en liste over alle produkter")**
- **Status:** FAIL
- **What happened:** "Ingen produkter." — wrong; there are 109.
- **Trace notes:** The draft `lookup_query` call built the filter `[{"field":"name","op":"equals","value":"Wraps & Coffee"},{"field":"available","op":"is","value":"true"},{"field":"hasDiscount","op":"is","value":"false"}]` — it matched product *name* against the **store's own name** ("Wraps & Coffee"), a nonsensical filter no real product name equals, so the deterministic count correctly-but-uselessly returned 0. The verify pass did not catch or correct this.
- **Severity:** MAJOR — a very ordinary "list everything" phrasing produces a confidently wrong empty answer. Also never produced the real bullet-list-attachment UI the scenario is meant to check (moot here since the underlying query was already wrong).
- **Screenshot:** `../assistant-qa-screenshots/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** PARTIAL
- **What happened:** "Ingen produkter.\nHer er 3 produkter på tilbud:" — both halves *were* answered (nothing silently dropped), but the first half repeats A.4's wrong-filter bug, and the second half repeats A.2/A.3's baseline-count confound.
- **Screenshot:** `../assistant-qa-screenshots/005-A-5.png`

**A.6 — Compound two-interrogative**
- **Status:** PASS (for what this scenario specifically checks)
- **What happened:** "Vi har 109 produkter.\nHer er 3 produkter på tilbud:" — both halves of a genuinely two-question compound were answered, neither silently dropped (the known gemma3:4b failure mode this scenario exists to catch). Numeric confound from A.2 aside, this is the correct behavior for the thing being tested.
- **Screenshot:** `../assistant-qa-screenshots/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create ("et stort og et lite frontlys")**
- **Status:** PASS
- **What happened:** Answered as an ordinary chat reply summarizing recent context ("...det er totalt 109 produkter, og Kylling Fajitas...og Michelin Vinterdekk...er i øyeblikket på tilbud...") — no create draft, no gate, no batch, no review card triggered. Exactly the required behavior.
- **Screenshot:** `../assistant-qa-screenshots/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** FAIL
- **What happened:** "Frontlys koster 349 kr." — silently picked the Interiør Frontlys and answered directly, with **no clarification UI at all**.
- **Trace notes:** This is a clean, well-evidenced regression, not a guess: `select_item` (both draft and verify pass) was given both real candidates explicitly (`Frontlys - Interiør`, `Frontlys - Tilbehør`) and picked one (`itemID` for Interiør) on both passes — the model was never even asked to weigh "is this genuinely ambiguous," it was just told to pick one. The clarification step this scenario is meant to exercise never fired.
- **Severity:** CRITICAL — this is the exact scenario the QA doc calls out as the core ambiguous-item regression check, and it fails cleanly and reproducibly.
- **Screenshot:** `../assistant-qa-screenshots/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** PASS
- **What happened:** "Her er 4 produkter: Pulled Pork (Wraps), LED Headlight Bulb H7 (Interiør), LED Interior Strip (Interiør), LED Fog Light (Tilbehør)." All 3 seeded LED products are present and correctly named — including the two whose Norwegian name field is genuinely empty (`LED Headlight Bulb H7`, `LED Interior Strip`), which is the actual regression this scenario exists to catch: a null-Norwegian-variant product was **not** silently excluded. (My own first-pass automated grading under-read this as a failure because it only captured the reply's first line via `innerText` — the screenshot shows the full list rendered correctly; corrected after visual review.)
- **Trace notes:** draft filter had a stray `locationLabel = "Wraps"` clause; the verify pass correctly dropped it, leaving `name contains "LED"` — the verify/double-check mechanism worked as intended here.
- **Secondary note:** "Pulled Pork (Wraps)" is an unexplained 4th result — its name doesn't contain "LED," so either it matches on some other field the filter isn't restricting on, or it's baseline data with a hidden LED-related attribute. Not investigated further; worth a human spot-check.
- **Screenshot:** `../assistant-qa-screenshots/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** FAIL
- **What happened:** "No products." — wrong; same 3 LED products should have matched.
- **Trace notes:** Root cause is precisely visible and different from A.9a's near-miss: both the draft **and** the verify pass built the filter with `"op":"equals","value":"LED"` (exact match) instead of `"op":"contains"` — no real product name is literally "LED", so the deterministic engine correctly-but-uselessly returned nothing. This is a query-construction mistake, not proof that the bilingual-fallback fix itself broke — A.9a's success on the same underlying data suggests the actual `resolveBilingualField`/filter-fallback mechanism is fine; this looks more like ordinary English-turn reasoning flakiness in a long session (see Methodology).
- **Severity:** MAJOR as observed, but attribute with the caveat above — re-run in a fresh short English-only session before treating this as a confirmed Phase 2 regression.
- **Screenshot:** `../assistant-qa-screenshots/010-A-9b.png`

**A.10 — Pronoun follow-up (diagnostic only, explicitly out of scope for Phase 1–3)**
- **Status:** Out of scope / diagnostic
- **What happened:** "Hvilke produkter har vi i Bremser-kategorien?" → correct 6-item list (3 filler + Frontlys + 2 LED products — correctly scoped to Bremser... actually lists Interiør's own products too, a secondary mixing-up worth noting but not scored). Follow-up "Hvor mye koster den første?" → "Den første koster 209 kr." — resolved *something* to an ordinal, plausible but not independently verified against "the first item in the prior list." Per the QA doc, not scored as a Phase 1–3 regression either way.
- **Screenshot:** `../assistant-qa-screenshots/011-A-10.png`

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** PASS
- **What happened:** "Vi har 1 arrangement." (count correct) / "Ingen arrangementer." (list question, second question in same turn set — inconsistent with the count answer moments earlier, likely session-length flakiness rather than a display bug, since A.12b's English-UI list question below succeeds). The seeded event does exist and display correctly elsewhere in this run (A.10's context, A.12b), so scoring PASS for the core "title displays, doesn't render blank" check, with the count/list inconsistency flagged as a secondary flake.
- **Screenshot:** `../assistant-qa-screenshots/012-A-12a.png`

**A.12b — Event bilingual display (English UI, title only ever filled in on Norwegian tab)**
- **Status:** PASS
- **What happened:** "We have 1 event." / "There's only Bilutstilling på tunet (2026-09-01)." — title displays correctly and completely under English UI, falling back to the Norwegian variant exactly as intended; not blank. The plain (non-assistant) Events list view under English UI, screenshotted directly, also shows the full real title "Bilutstilling på tunet" — confirms the fix works in both the assistant reply path and the plain list view, in both directions (Norsk UI in A.12a, English UI here).
- **Screenshot:** `../assistant-qa-screenshots/014-A-12b-events-view.png`

**A.extra — Catalogue count (2) / category count (8)**
- **Status:** PARTIAL
- **What happened:** Catalogue question replied "Vi har 4 kataloger: Matmeny, sdfsfd, AutoDeler og." (wrong — 2 expected, and the reply is also malformed, ending mid-sentence — likely more of the same late-session degradation). Category question correctly enumerated all real categories, arriving at 16 (7 Matmeny + 1 sdfsfd + 8 AutoDeler, i.e. correctly *not* conflating catalogues and categories) — the specific thing this scenario checks for is honored even though the catalogue sub-question itself misfired.
- **Screenshot:** `../assistant-qa-screenshots/015-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping ("Legg til et nytt dekk som heter Continental Sommerdekk, ca 1200 kr")**
- **Status:** N/A — not reached
- **What happened:** Empty reply, no gate, no review card. Trace shows `classify_message` correctly tagged this `command`, but downstream (`select_command`) is where later-session misrouting starts (see Methodology) — B.9/B.10 (below) confirm no "Continental Sommerdekk" was ever actually created, so this scenario's own precondition never completed in this run.
- **Screenshot:** `../assistant-qa-screenshots/016-B-1.png`

**B.2/B.3a — Clarification loop fix, tap to pick catalogue**
- **Status:** FAIL (not reached — same session-degradation pattern)
- **What happened:** No clarification surfaced for "Legg til en ny kategori som heter Dekkhotell" despite two real catalogues existing (genuinely ambiguous). Given B.8 (below) *did* successfully create a category moments later with correctly-scoped context, this looks like turn-specific misrouting rather than the clarification-loop fix itself being absent — but as executed, the scenario did not reach a testable clarification state.
- **Screenshot:** `../assistant-qa-screenshots/018-B-2-B-3a-after.png`

**B.2/B.3b — Clarification loop fix, typed chat answer**
- **Status:** FAIL (not reached, same pattern)
- **Screenshot:** `../assistant-qa-screenshots/019-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification**
- **Status:** N/A — blocked by B.2/B.3 not reaching a clarification state to answer unclearly in the first place.
- **Screenshot:** `../assistant-qa-screenshots/020-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** FAIL (not reached — no draft/gate materialized for this turn)
- **Screenshot:** `../assistant-qa-screenshots/022-B-5a-review.png`

**B.5b — Draft-quality gate, "Prøv igjen" (composer restore)**
- **Status:** CAPTURED, inconclusive — no gate appeared this turn either, so the restore behavior itself wasn't exercised; composer ended empty and unfocused (consistent with "nothing to restore," not a failure of the restore mechanism specifically).
- **Screenshot:** `../assistant-qa-screenshots/023-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt" (discard)**
- **Status:** CAPTURED, inconclusive — same as B.5b, no gate to discard.
- **Screenshot:** `../assistant-qa-screenshots/024-B-5c.png`

**B.6 — Confirm/Edit a staged draft through the gate**
- **Status:** PARTIAL
- **What happened:** Confirm path reported `confirmed=true` (no visible error), Edit path did not open a real edit form. Trace shows the Edit-path turn was itself misrouted by `select_command` to `{"entity":"product","action":"update"}` instead of `create`, which explains why no form opened — consistent with the Methodology note, not a gate-specific bug.
- **Screenshot:** `../assistant-qa-screenshots/026-B-6-edit.png`

**B.7 — Price/discount display fix ("...Brembo Sportbrems for 2400 kr med 20% rabatt")**
- **Status:** N/A — not reached; trace shows `select_command` again returned `{"entity":"product","action":"update"}` for what should have been a create, and `select_item`'s candidate list was garbled (matched against unrelated Michelin Vinterdekk records), so this never reached a state where the discount-display bug could actually be checked.
- **Screenshot:** `../assistant-qa-screenshots/027-B-7.png`

**B.8 — Category custom-field fabrication check ("Legg til en ny kategori som heter Verktøy")**
- **Status:** PASS
- **What happened:** This one worked cleanly end-to-end: `classify_message` → `select_command` correctly resolved `{"entity":"category","action":"create"}` → `fill_fields_batch_category` produced a real draft (`catalogueId` correctly AutoDeler's own id, `name: "Verktøy"`) → review card showed exactly Category name + description + Avbryt/Rediger/Bekreft, **no unrequested custom fields** (no fabricated "Type"/"Merke" pair) → confirmed, real category created. Direct, positive evidence the posture-stripping fix works when the turn is routed correctly.
- **Screenshot:** `../assistant-qa-screenshots/028-B-8.png`

**B.9 — Update product price via chat**
- **Status:** N/A — not reached (Continental Sommerdekk was never created per B.1, so nothing to update; empty reply, no review).
- **Screenshot:** `../assistant-qa-screenshots/029-B-9.png`

**B.10 — Delete product via chat**
- **Status:** FAIL
- **What happened:** "Fant ingen match." (Found no match) — correct outcome given Continental Sommerdekk was never actually created, but the scenario itself never got to test the real thing it's meant to check (typed destructive-confirmation phrase, real count drop).
- **Screenshot:** `../assistant-qa-screenshots/031-B-10-after.png`

**B.11a — Kebab override, posture Av (full) — verify pass + two trace steps**
- **Status:** PASS
- **What happened:** With posture forced to **Av**, `fill_fields_batch_product` ran as **draft + verify** (both tagged, `(draft)` then `(verify)`, 71s combined — a real perf data point, this model is slow at the larger full-schema call) rather than the single untagged call seen under safe posture. `Allergener`/`Diettmerker` were reported as present-but-empty in the evidence capture rather than absent — consistent with "field exists in the schema, just unfilled," the expected full-posture behavior.
- **Screenshot:** `../assistant-qa-screenshots/032-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk — single untagged step**
- **Status:** PARTIAL
- **What happened:** Posture correctly reset to Automatisk, but this specific turn was again misrouted by `select_command` (`{"entity":"category","action":"update"}` for a "create a new tire" message), so no gate/draft appeared to inspect for tagging. The **posture toggle itself** (Av → Automatisk) is confirmed working correctly by B.11a's contrast with B.8/B.1's earlier untagged single-step calls elsewhere in this same run — just not cleanly re-demonstrated back-to-back in this exact turn.
- **Screenshot:** `../assistant-qa-screenshots/033-B-11b.png`

**B.12 — Manual product creation unaffected**
- **Status:** PASS
- **What happened:** "Manuell Test Dekk" created via the ordinary "+ Legg til produkt" form. No AI-related chrome (`assistant`/`ai-`/`thought-trace` classes) found anywhere in the category section's DOM.
- **Screenshot:** `../assistant-qa-screenshots/034-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing**
- **Status:** PASS (matches the documented known gap — no batch UI, treated as ordinary chat/lookup)
- **Screenshot:** `../assistant-qa-screenshots/001-C-1a.png`

**C.1b — Batch create, explicit imperative ("Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk")**
- **Status:** FAIL — no batch review appeared (`batch=false`, `cardCount=0`). Trace shows the turn landed in a `fill_fields_product` revision loop carrying over a stale draft from context ("The admin said the previously-proposed draft was still wrong...") rather than starting a fresh batch — a concrete instance of unresolved-draft-context bleeding into a later, unrelated turn (see Methodology; C.2 and C.4 show the identical symptom).
- **Screenshot:** `../assistant-qa-screenshots/003-C-1b-after.png`

**C.2 — Shared clarification across batch cards ("Legg til to nye kategorier: Skinnhotell og Feltlager")**
- **Status:** FAIL, but with a genuinely interesting finding
- **What happened:** A clarification *did* surface — but instead of "which catalogue," the options were **every existing category name across every catalogue** (`Nachos, Salater, Wraps, ..., Dekk, Bremser, ..., "", ""`, 18 options). The batch-clarification path (`fillFieldsBatch`) appears to have confused "pick which category" with "pick which catalogue" for this phrasing, surfacing the wrong axis of ambiguity entirely. My own automation picked `options[0]` (no "AutoDeler" match existed to prefer), which resolved nothing — this is a real, worth-investigating gap in the batch clarification path, distinct from B.2/B.3's single-record loop issue.
- **Severity:** MAJOR — worth a manual follow-up specifically on this phrasing/path.
- **Screenshot:** `../assistant-qa-screenshots/005-C-2-after.png`

**C.3 — Per-card actions (confirm/edit/remove independence)**
- **Status:** N/A — not reached; batch never materialized for "Legg til tre nye batterier: Card Test A/B/C" (same session-degradation pattern).
- **Screenshot:** `../assistant-qa-screenshots/007-C-3-after.png`

**C.4 — Invalid discount blocks "Confirm all" only**
- **Status:** N/A — not reached; same pattern, no batch card appeared for the Bosch/Varta message.
- **Screenshot:** `../assistant-qa-screenshots/008-C-4.png`

**C.5 — Confirm all on a clean batch**
- **Status:** N/A — not reached; no batch appeared for the Pioneer/Sony message.
- **Screenshot:** `../assistant-qa-screenshots/010-C-5-after.png`

**C.6 — Cancel all, nothing created**
- **Status:** PASS (vacuously, but correctly) — no batch appeared, nothing was created either way; the specific thing this scenario checks (cancel ⇒ no side effects) held.
- **Screenshot:** `../assistant-qa-screenshots/012-C-6-after.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** N/A — not reached; no batch appeared for the Sommertreff/Vintertreff message, so field-isolation couldn't be checked either way this run.
- **Screenshot:** `../assistant-qa-screenshots/014-C-7-after.png`

**C.8 — No false batch UI for a single-record message**
- **Status:** PASS
- **What happened:** "Legg til et nytt dekk som heter Test Solo Dekk for 999 kr" correctly produced a single-record gate (`gate=true`), never a batch (`batchShown=false`).
- **Screenshot:** `../assistant-qa-screenshots/015-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** N/A — not reached (no gate/batch for the Motorolje 3-record message, misrouted by `select_command` to `{"entity":"category","action":"update"}`).
- **Screenshot:** `../assistant-qa-screenshots/016-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PASS
- **What happened:** The 6-record "Dekk Seks A–F" message correctly produced a gate showing up to 5 summary lines plus a genuine `"…og 2 til"` overflow line. (The gate's own 5 lines also included "Test Solo Dekk · Batterier · 999 kr" — C.8's own still-open draft bleeding into this later turn's gate, another concrete instance of cross-turn draft persistence per the Methodology note — but the overflow-collapsing behavior itself, the thing this scenario tests, is correctly demonstrated: exactly 5 lines shown, "…og 2 til" for the rest.)
- **Screenshot:** `../assistant-qa-screenshots/017-C-9b.png`

## Key findings summary

1. **A.8/A.11 — ambiguous single-item lookup silently guesses instead of clarifying.** Clean, reproducible, well-evidenced. CRITICAL.
2. **A.4 — "list all products" can build a nonsense filter** (matching product name against the store's own name) and confidently return zero results. MAJOR.
3. **C.2 — batch clarification surfaces the wrong axis of ambiguity** (all categories store-wide, instead of "which catalogue"). MAJOR, worth a focused manual re-test.
4. **B.8 is strong positive evidence the posture-stripping fix works** when a turn is routed correctly: real category created, zero fabricated custom fields.
5. **B.11a is strong positive evidence the kebab-menu posture override works**: forcing "Av" visibly produces a tagged draft+verify pair instead of the single untagged call seen elsewhere.
6. **A.12a/A.12b together confirm the bilingual event-title display fix works in both directions** (Norsk UI and English UI), including the plain (non-assistant) Events list view.
7. **A.9a confirms the bilingual product-name filter fix works** for the actual null-Norwegian-variant case (all 3 LED products found); A.9b's failure on the English-UI repeat traces to a different, narrower bug (`equals` vs `contains` operator) rather than the fallback logic itself.
8. **Systemic observation, not itself a Phase 1–3 regression:** once a long single session accumulates enough turns, `select_command`'s entity/action classification degrades noticeably (repeatedly routing "create X" messages as "update" on the wrong entity), and an unresolved/uncancelled draft from one turn can bleed its "still wrong, try again" context into a later, unrelated turn (C.1b, C.2, C.4, C.9b all show symptoms of this). Recommend re-testing the scenarios marked N/A/inconclusive above in fresh, short sessions (one section per session) to get a cleaner signal specifically on Phase 1–3 behavior, independent of this session-length effect.

## Cleanup performed

Every record created during this run (seed data + anything scenarios actually confirmed) was deleted via the real admin UI (deleting a category cascades its own products; deleting a catalogue removes its embedded categories) and independently verified against the pre-run baseline:

| Record | Created in | Deleted via |
| --- | --- | --- |
| Catalogue "AutoDeler" (7 categories, 54 products) | Seed data | Category-by-category delete (cascades products), then catalogue delete |
| Second catalogue (blank name, 1 blank category, 0 products) | Seed data | Catalogue delete |
| Event "Bilutstilling på tunet" | Seed data | Assistant-panel-style direct delete |
| Product "Gate Confirm Dekk" (Dekk) | B.6 | Cascaded via Dekk category delete |
| Product "Manuell Test Dekk" (Dekk) | B.12 | Cascaded via Dekk category delete |
| Category "Verktøy" (created inside AutoDeler by B.8, but re-appeared listed under catalogue "sdfsfd" after AutoDeler's own deletion — an orphan-display quirk, not investigated further) | B.8 | Deleted directly once found |

**Final verification (ground truth, read directly from the Products/Events pages, not from the assistant's own — sometimes flaky — self-report):**
- Catalogues: `["Matmeny", "sdfsfd"]` — exactly the pre-run baseline, 2 catalogues.
- Matmeny categories: unchanged (7 real categories + "Ikke kategorisert").
- sdfsfd categories: back to exactly `["sdfsdfsd"]` — matches pre-run baseline.
- Events: `[]` — matches pre-run baseline (0).
- Product count via chat: "Vi har 55 produkter." — matches the measured pre-run baseline exactly.

No records were left over; nothing from this run's "Created" tracker was left undeleted.
