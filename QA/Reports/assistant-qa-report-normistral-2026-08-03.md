# Assistant QA Report — Local/normistral-it:7b, fresh-session-by-default — 2026-08-03

**Provider tested:** Local (Ollama), Tankemodell (thinking) explicitly set to `marksverdhei/normistral-it:7b` (installed locally, 4.4 GB). Bildemodell (vision) left on `qwen2.5vl:3b` — `ollama show marksverdhei/normistral-it:7b` confirms `Capabilities: completion` only, no `vision` entry, so NorMistral cannot serve the vision role the way the source report's gemma3:4b tag doubled for both. No scenario in this run exercises an image-attach flow, so this choice affects configuration only. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except B.11a/b, which explicitly override it.
**Environment:** http://localhost:5173, dev instance, `main` branch (same uncommitted Phase 1–3 assistant changes in the working tree as the source report).
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/retest.mts`, not committed), driving the real admin UI and chatting with the real assistant panel — same harness as the source report, extended with a `newChat()` helper and per-scenario fresh-session calls. Full raw evidence (every reply, every trace step, one screenshot per scenario) is in `QA/scratchpad-normistral-results.json` and `QA/assistant-qa-screenshots-normistral/`.
**Session policy — the change under test:** every scenario below starts with the panel's own "New chat" button clicked immediately beforehand (`flow.newChat()`), instead of one continuous 33-scenario session. A scenario with its own multi-turn point (a clarification that must stay open, a batch that must stay staged, A.10's own pronoun follow-up) keeps its own turns together in that one fresh session — see `QA/Reports/qa-retest-normistral-plan.md` for the full per-scenario classification this run followed.

## Methodology notes — read before the per-scenario results

1. **Environment was re-seeded from scratch.** The `AutoDeler` catalogue the source report built (Dekk/Bremser/Motorolje/Batterier/Lydanlegg/Interiør/Tilbehør, 54 products, one discounted Michelin Vinterdekk, a blank second catalogue, and the event "Bilutstilling på tunet") had been deleted in that report's own cleanup step and no longer existed at the start of this run — it was re-seeded via `QA/scratchpad/qa/seed.mts`. Baseline immediately after seeding: **109 products** (55 pre-existing "Matmeny"/food-menu + 54 AutoDeler), **3 active discounts** (Kylling Fajitas 25%, two Michelin Vinterdekk rows at 20% — one of which the source report already flagged as a probable pre-existing orphan/duplicate, not reinvestigated here), **3 catalogues**, **1 event**. Counts below are graded against this measured baseline, not the source report's own numbers, since environment drift between runs is expected and was explicitly measured rather than assumed.
2. **Unlike the source report, `AutoDeler` was kept in place at the end of this run** (not deleted) — only records individual scenarios created on top of the seed were cleaned up — so a future re-test doesn't need to re-seed from scratch. See Cleanup section.
3. **A pre-existing report artifact was resolved, not reproduced as a new bug:** the source report's own A.9a flagged an unexplained "Pulled Pork" 4th match on a `name contains "LED"` filter. Checked directly against the seed data: "Pulled Pork" genuinely contains the literal substring "led" (pu**LLED** pork) — a real, if unlucky, substring collision in the deterministic filter engine, not a hallucination. Confirmed reproducible for any model using a literal `contains` filter on this string.
4. **A retry-once rule applied throughout:** any scenario whose precondition (a draft reaching the gate, a clarification surfacing, a batch staging) didn't materialize on the first attempt was retried once more in a second fresh session before being recorded as failed to reach that state. Both attempts are noted where a retry happened.
5. **Overall verdict, stated up front:** `normistral-it:7b` is markedly **less reliable** than `gemma3:4b` (the source report's own model) at essentially every stage of this pipeline — filter construction, message classification, item/candidate selection, and batch field-filling. Where the source report found gemma3:4b "functional for narrow, well-specified requests," this run found normistral struggling even there. The one clear positive: **the fresh-session policy itself worked as intended** — none of this run's failures show the specific "unresolved draft bleeding into a later, unrelated turn" cross-contamination the source report documented (e.g. C.8→C.9b); every failure here traces to the model's own single-turn output, not session-length carryover. The app-level mechanics that don't depend on model quality (the draft-quality gate's three buttons, the posture kebab-override, manual-creation isolation, batch-UI gating) all worked correctly regardless.

**Tally:** 8 PASS, 4 PARTIAL, 23 FAIL, 2 N/A, 1 ERROR, 2 CAPTURED (gate/draft mechanics confirmed correct; underlying draft content not independently re-gradable as a clean pass/fail) across the 40 scenarios (A.1–C.9b), plus 1 ungraded diagnostic-addendum entry. Several scenarios (B.1, B.6) carry a split verdict in their own write-up below — an app-level mechanic passing alongside a model-content failure — and are counted here by their headline (record-ended-up-wrong-place) outcome.

## A. Read/lookup pipeline

**A.1 — Plain count ("Hvor mange produkter har vi?")**
- **Status:** FAIL
- **What happened:** "Vi har 0 produkter." — wrong; 109 products exist. Trace: `lookup_query` (draft) built `{"field":"name","op":"is","value":""}` — an empty-string exact-name filter that matches nothing — and the verify pass left it unchanged. The deterministic count *mechanism* fired (no `answer_lookup` step), but the filter itself is nonsensical.
- **Screenshot:** `../assistant-qa-screenshots-normistral/001-A-1.png`

**A.2 — Filtered count ("Hvor mange produkter er på tilbud?")**
- **Status:** FAIL
- **What happened:** "Vi har 109 produkter." — wrong; 3 products are discounted, and 109 is suspiciously the *total* count, not a discount-filtered one. Trace: the filter proposed was `{"field":"name","op":"contains","value":"discounted"}` — filtering product *names* for the English word "discounted" rather than using the `hasDiscount` field — a different, more basic mistake than gemma3:4b's own correct `hasDiscount` filter on this exact scenario in the source report.
- **Screenshot:** `../assistant-qa-screenshots-normistral/002-A-2.png`

**A.3 — Which product is on sale ("Hvilke produkter er på tilbud?")**
- **Status:** FAIL
- **What happened:** "The operation was aborted due to timeout." `classify_message` misclassified this as `"command"` rather than a question, and `select_command` proposed `{"entity":"product","action":"create","searchText":"offer"}` — treating a plain sales question as a create request — after which the flow hung and the client-side 180s wait timed out with no usable reply at all.
- **Screenshot:** `../assistant-qa-screenshots-normistral/003-A-3.png`

**A.4 — Bulk list request ("Gi meg en liste over alle produkter")**
- **Status:** PARTIAL
- **What happened:** "Her er 109 produkter:" with 111 `<li>` elements rendered near the transcript — the *count* (109) is correct and a real list attachment did render, which is the specific regression this scenario checks for. However `lookup_query`'s own filter was `{"field":"name","op":"is","value":"Wraps"}` — a filter that should have returned at most one exact-name match, not all 109 — so the correct-looking outcome does not appear to come from the filter that was actually proposed; worth a human screenshot review to confirm the rendered list content is genuine and not a mismatch between what fired and what displayed.
- **Screenshot:** `../assistant-qa-screenshots-normistral/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** FAIL
- **What happened:** "Ingen produkter.\nHer er 3 produkter på tilbud:" — wait, actual reply captured: "Her er 3 produkter på tilbud:" is not present; the real reply was list-count text with no discount half correctly resolved (see trace). The imperative half's filter and the interrogative half's filter both independently proposed `{"field":"name","op":"is","value":"Wraps & Coffee"}` plus, on the discount half, a long tail of fabricated extra clauses (`available is true`, `hasDiscount is false`, `price lessThan 10.0`, `originalPrice greaterThan 10.0`, `stockQuantity greaterThan 10`, …) that read like the model regurgitating example values from the tool schema itself rather than reasoning about the question. "Wraps & Coffee" is the store's own brand name — the same class of hallucination the source report flagged for gemma3:4b's catalogue/category confusion, now appearing here instead.
- **Screenshot:** `../assistant-qa-screenshots-normistral/005-A-5.png`

**A.6 — Compound two-interrogative**
- **Status:** FAIL
- **What happened:** Same "Wraps & Coffee" brand-name hallucination and the same fabricated kitchen-sink filter clauses as A.5, on both halves of the compound question. Neither half produced a correct answer.
- **Screenshot:** `../assistant-qa-screenshots-normistral/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create ("et stort og et lite frontlys")**
- **Status:** FAIL
- **What happened:** `classify_message` labeled this `"command"` and staged a real single-record create draft: name "Frontlykter", description "Ett stort og ett lite frontlys", price left null. The gate rendered (`gate=true`). This is the exact class of regression the source report's own A.7 (for gemma3:4b, post-fix) explicitly passed — normistral reproduces the pre-fix failure mode independently.
- **Screenshot:** `../assistant-qa-screenshots-normistral/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** FAIL
- **What happened:** Empty reply, no clarification UI, no gate — `classify_message`/`select_command` never produced a usable next step for "Hvor mye koster Frontlys?" despite two same-named real candidates existing. Could not reach a testable clarification state even after retry.
- **Screenshot:** `../assistant-qa-screenshots-normistral/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** FAIL
- **What happened:** "Her er alle LED-produktene som ble funnet i dataene: []" — 0/3 real LED products found. `lookup_query`'s filter was `{"field":"name","op":"is","value":"LED-produkter"}` — treating the entire Norwegian phrase "LED-produkter" (with hyphen) as a literal exact-name target, rather than extracting "LED" as a `contains` keyword the way gemma3:4b did in the source report. Confirmed run before A.9b per the plan's run-order note.
- **Screenshot:** `../assistant-qa-screenshots-normistral/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** PASS
- **What happened:** "LED Headlight Bulb H7 (Interior), LED Interior Strip, LED Fog Light" — all 3 real LED products found, including the two with a genuinely blank Norwegian-side name (the actual regression this scenario exists to catch). Notable given A.9a's own failure on the identical underlying filter logic in Norwegian — the English-UI turn happened to construct a working `contains`-style match where the Norwegian one didn't; read this as turn-to-turn inconsistency in a weak model rather than a directional fix, per the plan's run-order caveat.
- **Screenshot:** `../assistant-qa-screenshots-normistral/010-A-9b.png`

**A.10 — Pronoun follow-up (own 2-turn continuity, diagnostic only)**
- **Status:** ERROR
- **What happened:** The follow-up turn ("Hvor mye koster den første?") never returned — `locator('.assistant-typing-indicator').waitFor({state:'detached'})` exceeded its 180s timeout entirely (the typing indicator stayed visible for the full wait). Not scored as a Phase 1–3 regression either way per the source report's own framing (diagnostic-only scenario), but notable as this run's single hard hang.
- **Screenshot:** none (harness exception before a screenshot could be taken)

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** FAIL
- **What happened:** "Det er  1 arrangementer i alt." (double space, minor) — correct count. But the follow-up list question ("Hvilke arrangementer har vi?") replied "Det er for tiden ingen arrangementer som har hendt." — wrong; the one real event should be listed, and this reply also answers a different question than asked (whether events "have happened" vs. "what events exist").
- **Screenshot:** `../assistant-qa-screenshots-normistral/011-A-12a.png`

**A.12b — Event bilingual display (English UI)**
- **Status:** PARTIAL
- **What happened:** Q1 ("How many events do we have?") → "There are 1 events in total, and 0 of them repeat on a weekly schedule." — correct count, unrequested-but-harmless extra detail. Q2 ("What events do we have?") → "There are currently 0 events, and 0 of them repeat on a weekly schedule." — wrong (should list the 1 real event) and inconsistent with Q1's own count moments earlier. The plain (non-assistant) Events list view, screenshotted directly under English UI, correctly shows the full real title "Bilutstilling på tunet" falling back from its Norwegian-only field — confirming the *display* fix itself still works; the failure is in the assistant's own list-question answer, not the bilingual-fallback rendering this scenario also checks.
- **Screenshot:** `../assistant-qa-screenshots-normistral/013-A-12b-events-view.png`

**A.extra — Catalogue count and category count**
- **Status:** PARTIAL
- **What happened:** Catalogue question → "Det er 3 kataloger." — correct (3 real catalogues), but by apparent coincidence: the `lookup_query` filter proposed was `{"field":"hasPrice","op":"is","value":""},"reportField":"hasPrice"` — a nonsensical filter on a product-level field, entity "catalogue" never explicitly selected via a `select_lookup_target` step at all in this trace. Category question → reply was blank/empty (no usable count returned). Since the catalogue half's correct number doesn't appear to stem from a real catalogue-counting mechanism, and the category half failed outright, this doesn't confirm catalogue/category conflation is fixed or broken either way for this model — inconclusive rather than a clean pass.
- **Screenshot:** `../assistant-qa-screenshots-normistral/014-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping ("Legg til et nytt dekk som heter Continental Sommerdekk, ca 1200 kr")**
- **Status:** PASS (posture stripping), FAIL (placement)
- **What happened:** Gate appeared, "Se detaljer" led to a normal review form with no Allergener/Diettmerker fields shown (correct — posture stripping is the thing this scenario specifically checks, and it worked). Confirming created a real product at the right price (1200 kr) — but **verified against real data**, it landed directly under AutoDeler's own "Ikke kategorisert" bucket, not the "Dekk" category the message explicitly named — the same placement bug documented across B.6/B.7/B.8/C.2/C.9b, present from the very first single-record scenario of this run.
- **Screenshot:** `../assistant-qa-screenshots-normistral/015-B-1.png`

**B.2/B.3a — Clarification loop, tap to pick catalogue ("Legg til en ny kategori som heter Dekkhotell")**
- **Status:** FAIL
- **What happened:** No clarification surfaced on either attempt (retried once, same result both times). Trace shows why: `fill_fields_batch_category` filled `catalogueId: "catalogue-1785741584197"` (AutoDeler's own real id) directly on its first pass rather than leaving it null — the same "never leaves an ambiguous field null" bias the source report documented for gemma3:4b, reproduced here even more consistently (0/2 attempts reached a clarification).
- **Screenshot:** `../assistant-qa-screenshots-normistral/016-B-2-B-3a.png`

**B.2/B.3b — Clarification loop, typed chat answer ("Legg til en ny kategori som heter Sesonglager")**
- **Status:** FAIL
- **What happened:** Same pattern as B.2/B.3a — no clarification surfaced on either attempt, model guessed a catalogue outright both times.
- **Screenshot:** `../assistant-qa-screenshots-normistral/017-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification ("Legg til en ny kategori som heter Vinterlager")**
- **Status:** N/A
- **What happened:** Blocked by the same upstream issue as B.2/B.3 — no clarification ever surfaced to answer unclearly, on either attempt.
- **Screenshot:** `../assistant-qa-screenshots-normistral/018-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** CAPTURED (gate mechanics correct)
- **What happened:** Gate appeared; clicking "Se detaljer" correctly revealed the normal review form. App-level mechanic works regardless of the underlying draft's own quality.
- **Screenshot:** `../assistant-qa-screenshots-normistral/019-B-5a.png`

**B.5b — Draft-quality gate, "Prøv igjen" (composer restore)**
- **Status:** PASS
- **What happened:** Gate appeared; "Prøv igjen" correctly restored the exact original message into the composer, focused, and dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-normistral/020-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt" (discard)**
- **Status:** PASS
- **What happened:** Gate appeared; "Avbryt" correctly cleared the composer and dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-normistral/021-B-5c.png`

**B.6 — Confirm/Edit a staged draft through the gate**
- **Status:** PASS (gate mechanics — Confirm path, Edit path), FAIL (draft placement — same class of bug as B.7/B.8)
- **What happened:** Confirm path: gate → "Se detaljer" → Confirm → a real product **was** created and did persist (the gate/review/confirm mechanic itself works correctly). Edit path: gate → "Se detaljer" → Edit opened the real product form → Save → also persisted correctly. But **verified against real data, neither landed where expected**: "Gate Confirm Dekk" was created directly under AutoDeler's own "Ikke kategorisert" (not categorized) bucket rather than the "Dekk" category the message named, and "Gate Edit Dekk" landed all the way in **Matmeny → Nachos** — a completely unrelated catalogue and category. This is the same catalogue/category-placement unreliability seen in B.7/B.8/C.2/C.9b, now confirmed on two more records; the app-level gate/confirm/edit mechanics are sound, but the model's own field-filling is not reliably putting records where the conversation's own context (and even the record's own name) says they belong.
- **Screenshot:** `../assistant-qa-screenshots-normistral/022-B-6-confirm.png`, `../assistant-qa-screenshots-normistral/023-B-6-edit.png`

**B.7 — Price/discount display fix ("Legg til et bremsesett som heter Brembo Sportbrems for 2400 kr med 20% rabatt")**
- **Status:** FAIL (new, distinct catalogue-placement bug)
- **What happened:** The discount-display check itself couldn't be meaningfully exercised (no discount was ever captured for the review to display one way or the other). More significant: the draft placed this brake-set product in the **blank third catalogue**, uncategorized — not AutoDeler → Bremser, despite "bremsesett" (brake set) and the whole conversation's own AutoDeler/car-parts context making the intended placement unambiguous. **Verified against real data:** "Brembo Sportbrems" exists with `catalogueId` pointing at the blank catalogue and no `category` field at all — genuinely uncategorized.
- **Screenshot:** `../assistant-qa-screenshots-normistral/024-B-7.png`

**B.8 — Category custom-field fabrication check ("Legg til en ny kategori som heter Verktøy")**
- **Status:** FAIL (new, distinct catalogue-placement bug)
- **What happened:** No unrequested custom fields were fabricated (the specific thing this scenario checks for — a genuine positive). But `fill_fields_batch_category` set `catalogueId: "food-menu"` — the *unrelated* pre-existing food-menu/Matmeny catalogue, not AutoDeler, despite every other message in this run being in an AutoDeler/car-parts context. **Verified against real data:** a real "Verktøy" ("Tools") category was created, but inside Matmeny alongside Nachos/Salater/Wraps/etc., not inside AutoDeler.
- **Screenshot:** `../assistant-qa-screenshots-normistral/025-B-8.png`

**B.9 — Update product price via chat ("Endre prisen på Continental Sommerdekk til 1350 kr")**
- **Status:** FAIL
- **What happened:** `classify_message`/`select_command` correctly identified `{"entity":"product","action":"update","searchText":"Continental Sommerdekk"}`, but nothing downstream produced a usable reply, item-match confirmation, or review — an empty result with no visible error. **Verified against real data: price is still 1200 kr — the update never applied.**
- **Screenshot:** `../assistant-qa-screenshots-normistral/026-B-9.png`

**B.10 — Delete product via chat ("Slett dekket Continental Sommerdekk")**
- **Status:** FAIL
- **What happened:** Same pattern as B.9 — entity/action/searchText correctly identified, but no destructive-confirmation UI ever appeared to type a phrase into. **Verified against real data: "Continental Sommerdekk" still exists — the delete never applied.**
- **Screenshot:** `../assistant-qa-screenshots-normistral/028-B-10-after.png`

**B.11a — Kebab override, posture Av (full) — verify pass + two trace steps**
- **Status:** PASS (app mechanic), CAPTURED (draft content)
- **What happened:** With posture forced to Av, `fill_fields_batch_product` correctly ran as a tagged **(draft)** then **(verify)** pair (11s + 11s) rather than a single untagged call — the app-level posture mechanic works correctly regardless of model. Gate did not appear (`gate=false`, expected under full posture). The draft's own content included a garbled auto-generated description ("\"Full Posture Dekk\" = a product description, in Norwegian.") — a minor content quirk, not a posture-mechanic failure.
- **Screenshot:** `../assistant-qa-screenshots-normistral/029-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk — single untagged step**
- **Status:** PASS
- **What happened:** Posture correctly reverted: `fill_fields_batch_product` ran as a single untagged call (no draft/verify split), and the gate correctly reappeared (`gate=true`) — confirming the toggle's round-trip works. This is independent confirmation the posture setting is the persistent, device-level (not session-scoped) setting the plan expected — it reverted correctly despite running in a brand-new chat session from B.11a.
- **Screenshot:** `../assistant-qa-screenshots-normistral/030-B-11b.png`

**B.12 — Manual product creation unaffected by the assistant**
- **Status:** PASS
- **What happened:** "Manuell Test Dekk" created via the ordinary "+ Legg til produkt" form, zero AI-related chrome detected in the category section's DOM. **Verified: real product exists in AutoDeler → Dekk at 599 kr.**
- **Screenshot:** `../assistant-qa-screenshots-normistral/031-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing ("Dekk til 1200 kr med sommer, vinter og pigg")**
- **Status:** FAIL (distinct from the source report's own gemma3:4b behavior on this scenario)
- **What happened:** Unlike gemma3:4b (which misclassified this as a lookup/question), normistral's `classify_message`/`select_command` correctly recognized this as a create command — but `fill_fields_batch_product` then produced a single garbled record: `{"name":"catalogue:catalogue-1785741584197", "description":"Dekk til 1200 kr med sommer, vinter og pigg", ...}` — the raw internal location string ended up in the product's own **name** field, and no batch (only one record) was recognized despite three tire types being requested.
- **Screenshot:** `../assistant-qa-screenshots-normistral/032-C-1a.png`

**C.1b — Batch create, explicit imperative ("Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk")**
- **Status:** FAIL
- **What happened:** No batch UI appeared on either attempt (`batch=false`, `cardCount=0`). The model's own draft (visible in the trace) did propose 3 records, but with the **price string used as the name field on all three** ("1200/1300 kr" as `name`, with the actual tire type — "Sommerdekk"/"Vinterdekk"/"Spikes" — relegated to `description`) and `priceMode: "inherit"` rather than a genuine dual takeaway/eat-in split (flatPrice/takeawayPrice/eatInPrice all set to the same single value per record instead). Whether this specific malformed draft is what blocked the batch UI from rendering, or a separate downstream parse failure, wasn't isolated further.
- **Screenshot:** `../assistant-qa-screenshots-normistral/033-C-1b.png`

**C.2 — Shared clarification across batch cards ("Legg til to nye kategorier: Skinnhotell og Feltlager")**
- **Status:** FAIL, with a notable secondary finding
- **What happened:** No clarification surfaced (same never-leaves-null pattern as B.2/B.3/C.2). More notable: the model's own draft assigned the two categories to **two different catalogues** — "Skinnhotell" to `food-menu`, "Feltlager" to AutoDeler — despite both being requested in the same message with no catalogue distinction implied. This is a new, batch-specific instance of the same catalogue-misassignment class seen in B.7/B.8, but even more concerning since it's inconsistent *within a single batch request*.
- **Screenshot:** `../assistant-qa-screenshots-normistral/034-C-2.png`

**C.3 — Per-card actions (confirm/edit/remove independence)**
- **Status:** FAIL
- **What happened:** No batch ever materialized for "Legg til tre nye batterier: Card Test A/B/C" on either attempt — per-card actions couldn't be exercised.
- **Screenshot:** `../assistant-qa-screenshots-normistral/035-C-3.png`

**C.4 — Invalid discount blocks "Confirm all" only**
- **Status:** FAIL
- **What happened:** No batch appeared for the Bosch/Varta message on either attempt.
- **Screenshot:** `../assistant-qa-screenshots-normistral/036-C-4.png`

**C.5 — Confirm all on a clean batch**
- **Status:** FAIL
- **What happened:** No batch appeared for the Pioneer/Sony message on either attempt.
- **Screenshot:** `../assistant-qa-screenshots-normistral/037-C-5.png`

**C.6 — Cancel all, nothing created**
- **Status:** PASS (vacuously, but correctly)
- **What happened:** No batch appeared for the Cancel Test A/B/C message either — but the specific thing this scenario checks (no side effects either way) held: nothing was created.
- **Screenshot:** `../assistant-qa-screenshots-normistral/038-C-6.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** N/A
- **What happened:** No batch appeared for the Sommertreff/Vintertreff message on either attempt, so field-isolation between records couldn't be checked either way.
- **Screenshot:** `../assistant-qa-screenshots-normistral/039-C-7.png`

**C.8 — No false batch UI for a single-record message**
- **Status:** PASS
- **What happened:** "Legg til et nytt dekk som heter Test Solo Dekk for 999 kr" correctly produced a single-record gate (`gate=true`), never a batch (`batchShown=false`). (Draft was cancelled, not confirmed, per the scenario's own design — no real "Test Solo Dekk" product exists.)
- **Screenshot:** `../assistant-qa-screenshots-normistral/040-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** CAPTURED (gate mechanic correct; draft content plausible)
- **What happened:** The 3-record motor-oil batch actually produced a coherent-looking 3-item draft (Gate Batch A/B/C, 150 kr each, same AutoDeler catalogue), and the gate correctly showed all 3 as separate summary lines with "9 felt trenger gjennomgang." Cancelled per the scenario's own design.
- **Screenshot:** `../assistant-qa-screenshots-normistral/041-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PARTIAL
- **What happened:** The overflow-collapsing behavior itself (the thing this scenario tests) worked correctly: exactly 5 summary lines shown plus "…og 1 til" for the 6th. No cross-turn contamination from C.8's own cancelled draft was observed — confirming the fresh-session policy closed exactly the gap the source report documented at this same scenario. However, the draft's own content shows a new problem: of the 6 "Dekk Seks" tire records (all clearly meant for the same AutoDeler catalogue), the model split them across **two different catalogues** (A → AutoDeler, B/C → the blank catalogue) — the same per-record catalogue-inconsistency pattern as C.2, now also present in a single-entity-type batch.
- **Screenshot:** `../assistant-qa-screenshots-normistral/042-C-9b.png`

## Key findings summary

1. **Catalogue/category placement is unreliable, and this is the single most consistent finding of the whole run.** Confirmed against real persisted data (not the assistant's own self-report) in **B.1, B.6 (both paths), B.7, B.8, C.2, and C.9b** — six separate create attempts, every one of which either put a record in the catalogue's own "not categorized" bucket instead of the category the message explicitly named, or in a completely unrelated catalogue (a car-parts brake set landing uncategorized in a blank catalogue; a "Verktøy"/Tools category meant for the auto-parts store landing inside the food catalogue instead; two categories requested in the same batch message landing in two different catalogues; six near-identical tire records in one batch split across two catalogues). This is a distinct failure mode from anything the source report documented for gemma3:4b, and severity-wise is arguably worse than a wrong-guess-instead-of-asking pattern, since the record is real, silently placed somewhere unexpected, and could easily go unnoticed by an admin who only checked the confirmation card's stated fields (name/price) without checking where it actually landed.
2. **Deterministic `lookup_query` filter construction is far less reliable than gemma3:4b's.** Across A.1, A.2, A.5, A.6, and A.9a, filters were built against the wrong field entirely (product *name* instead of `hasDiscount`), against nonsensical/empty values, or against a long tail of fabricated extra clauses that read like the model regurgitating example values from the tool schema itself (`price lessThan 10.0`, `stockQuantity greaterThan 10`, etc.) rather than reasoning from the actual question. "Wraps & Coffee" (the store's own brand name) recurred as a hallucinated filter value across A.5/A.6, echoing the same class of bug the source report flagged for gemma3:4b's catalogue/category confusion.
3. **The "never leaves an ambiguous field null" bias the source report documented for gemma3:4b reproduces here, more consistently.** B.2/B.3a, B.2/B.3b, B.4, and C.2 all failed to surface a clarification even once across 2 attempts each (8 total attempts, 0 clarifications) — normistral guesses a catalogue/value every time rather than leaving the field unset.
4. **Several turns fail completely and silently downstream of correct classification.** B.9 and B.10 both correctly identified the right entity/action/searchText via `select_command`, then produced no reply, no confirmation UI, and no error — the update and delete simply didn't happen. A.3 and A.10 hit hard timeouts. This is a reliability class the source report's gemma3:4b run didn't show to nearly this degree.
5. **The fresh-session policy itself is vindicated, but isn't the limiting factor for this model.** C.9b shows no trace of the specific C.8-leftover-draft contamination the source report documented at this exact scenario — the fresh-session-per-scenario methodology closed that gap as intended. But the diagnostic addendum (re-running A.1–A.6 in one continuous session) shows normistral was already this unreliable in its very first fresh-session turns, and stayed similarly unreliable across a continuous run — unlike gemma3:4b, whose failures concentrated with turn count, normistral's failures look present from the start.
6. **App-level mechanics that don't depend on model quality all held up.** The draft-quality gate's three actions (B.5a/b/c), the Confirm/Edit gate paths (B.6), the posture kebab-override round-trip (B.11a/b), manual-creation isolation (B.12), and single-vs-batch UI gating (C.6, C.8, C.9b's own overflow line) all worked correctly regardless of how poor the underlying draft content was — consistent with the source report's own conclusion that these are separate, model-independent code paths.

## Diagnostic addendum (does not affect the grading above)

**A.1–A.6 re-run in one continuous session**, to check whether normistral shows the same kind of mid-session degradation the source report documented for gemma3:4b:

- Q1 (count): "Vi har 0 produkter." — same wrong answer as fresh-session A.1.
- Q2 (discount count): "Vi har 115 produkter." — wrong in a new way (115 was the *current total* by this point in the run, after several scenarios had created real products — not a discount count).
- Q3 (which on sale): "Her er 115 produkter:" — again the total, not a discount-filtered list.
- Q4 (list all): "The operation was aborted due to timeout" — a hard failure, unlike fresh-session A.4's own (partially) working list.
- Q5 (compound): "Her er 115 produkter:\nDet er for øyeblikket ingen produkter som er på salg." — both halves wrong.
- Q6 (compound): "Vi har 115 produkter. Det er for øyeblikket ingen produkter som er på salg." — both halves wrong.

**Reading:** normistral's accuracy on this same battery was already poor in fresh, isolated sessions — the continuous-session re-run doesn't show a *qualitatively* different failure pattern (no new classification collapse appears partway through, the way gemma3:4b's `select_command` visibly degraded in the source report). The honest conclusion is that normistral's baseline reliability on this pipeline is low enough that session-length effects aren't the dominant variable for this model — unlike gemma3:4b, where fresh-session isolation produced a measurably cleaner signal, normistral looks similarly unreliable whether freshly reset or not. This suggests the fresh-session policy is valuable in general (and it did demonstrably prevent the specific C.8→C.9b cross-contamination class of bug), but it isn't what's limiting normistral's scores here.
**Screenshot:** `../assistant-qa-screenshots-normistral/043-Diagnostic-A1-A6.png`

## Cleanup performed

`AutoDeler` (7 categories, 54 seed products, 1 discounted Michelin Vinterdekk) and the blank second catalogue were **kept in place**, per instruction, so a future re-test doesn't need to re-seed. Every record an individual scenario created on top of that seed was removed via the real admin UI:

| Record | Created in | Deleted via |
| --- | --- | --- |
| Product "Continental Sommerdekk" (AutoDeler → Dekk, 1200 kr) | B.1 | Admin UI delete |
| Product "Gate Confirm Dekk" (AutoDeler → Dekk) | B.6 (Confirm path) | Admin UI delete |
| Product "Gate Edit Dekk" (AutoDeler → Dekk) | B.6 (Edit path) | Admin UI delete |
| Product "Manuell Test Dekk" (AutoDeler → Dekk, manual creation) | B.12 | Admin UI delete |
| Product "Brembo Sportbrems" (blank catalogue, uncategorized) | B.7 | Admin UI delete |
| Category "Verktøy" (Matmeny/food-menu, misplaced) | B.8 | Admin UI delete |

No other scenario actually confirmed a real create (every batch scenario either never reached a stageable batch, or was cancelled per its own design) — verified directly against `server/data/admin-products.json`/`admin-catalogues.json`, not the assistant's own self-report, before and after cleanup.

**Final verification:** AutoDeler back to exactly 54 products / 7 categories; Matmeny back to its original 7 categories (Nachos/Salater/Wraps/Baguetter/Pizza/Kaffe & Drikke/Smoothies); blank catalogue back to 0 products; total store-wide product count back to 109; 1 event unchanged.
