# Assistant QA Report — Local/qwen3:8b, fresh-session-by-default — 2026-08-03

**Template version:** 3 (bumped post-run — see Methodology note #6a for the harness fixes this cycle's own findings prompted)
**Provider tested:** Local (Ollama), Tankemodell (thinking) explicitly set to `qwen3:8b` (installed locally, 5.2 GB — `ollama show` confirms `Capabilities: completion, tools, thinking`). Bildemodell (vision) left on `qwen2.5vl:3b`, unchanged from the last two cycles — `qwen3:8b` has no `vision` capability of its own, so the split is required. No scenario in this run exercises an image-attach flow, so this choice affects configuration only. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except B.11a/b, which explicitly override it.
**Environment:** http://localhost:5173, dev instance, `main` branch. Working tree was clean for `server/`/`src/` at the start of this run (only QA template files and pending screenshot-folder deletions showed as locally modified) — no in-progress-dev-work caveat needed this cycle.
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/retest-qwen3-8b.mts`, adapted from the normistral cycle's own harness; not committed), driving the real admin UI and chatting with the real assistant panel. Full raw evidence (every reply, every trace step, one screenshot per scenario) is in `QA/scratchpad-qwen3-8b-results.json` and `QA/assistant-qa-screenshots-qwen3-8b/`.
**Session policy:** every scenario below starts with the panel's own "New chat" button clicked immediately beforehand, except scenarios with their own documented multi-turn continuity (A.10; the paired clarification/gate/batch scenarios in B/C) — same policy as the normistral cycle, reused verbatim from `QA/Reports/qa-test-plan-qwen3-8b-2026-08-03.md`.

## Methodology notes — read before the per-scenario results

1. **Environment was reused, not re-seeded.** `AutoDeler` (54 products / 7 categories: Dekk/Bremser/Motorolje/Batterier/Lydanlegg/Interiør/Tilbehør) was confirmed intact at the start of this run — no re-seed needed. Baseline re-measured fresh rather than trusted from the prior report: **109 products** (55 food-menu + 54 AutoDeler), **3 active discounts** (Kylling Fajitas 25%, two Michelin Vinterdekk rows at 20% — one a known pre-existing orphan/duplicate, not reinvestigated), **1 event**. One genuine environment drift since the normistral cycle: **catalogue count is now 2, not 3** — the blank third catalogue that cycle's own final verification described no longer exists at all. A.extra was graded against 2, matching what the assistant itself reported.
2. **`AutoDeler` was kept in place at the end of this run**, per standing policy — only records individual scenarios created on top of it were cleaned up. See Cleanup section.
3. **A significant harness bug was discovered and fixed mid-run.** The original pass found `batch=false` for C.1b and C.3–C.7 (6 scenarios), which would have read as a near-total batch-pipeline failure. A screenshot cross-check (per the harness-vs-reality rule) showed the model had actually staged valid, well-formed multi-record drafts every single time — they were sitting behind the **Draft-Quality Gate** ("Se detaljer"/"Prøv igjen"/"Avbryt"), which the inherited scenario code never checked for or clicked through before testing for the batch-card UI specifically. A supplementary script (`retest-qwen3-8b-batchfix.mts`) reran all six with a gate-aware check (open the gate if present, then check for batch cards), which is what the results below reflect. This is a harness fix, not a model or app finding — flagged here so the next cycle's own harness inherits the gate-aware version rather than reintroducing the same false negative.
4. **A second harness false-negative was found and corrected via screenshot, not rerun.** A.9a/A.9b's own automated `found` check searched only the plain-text `reply` string for the 3 expected LED product names and reported 0/3 both times. The actual screenshots show all 3 real LED products (plus the known "Pulled Pork" substring-collision artifact) correctly rendered in a separate list block below the reply text — the same rendering pattern already known from A.4. Graded PASS from the screenshot, not the harness's own automated check.
5. **Retry-once rule applied throughout.** Any scenario whose precondition (a draft reaching the gate, a clarification surfacing, a batch staging) didn't materialize on the first attempt was retried once more in a fresh session before being recorded as failed to reach that state.
6. **B.9/B.10 were re-tested a second time, duplicate-free, to isolate a confound.** The original B.9 accidentally created a **second** "Continental Sommerdekk" (a harness bug: its own "already exists" check ran before the Dekk category section was expanded in the DOM, so it read as absent and force-created a duplicate via the manual admin form) — that duplicate-creation bug is real and is described accurately here. A supplementary script collapsed the duplicate back to one, then resent both messages fresh; both attempts again produced an empty `reply` with no review/destructive-confirm text captured by the harness.
6a. **Correction (post-run): B.9/B.10 are not a bug.** Both screenshots (`027-B-9.png`, `028-B-10-after.png`) show a real, working "Er dette den riktige?" (Is this correct?) confirmation prompt — `Continental Sommerdekk - Dekk` / `Ja` / `Nei, vis andre` — that this run's own test script never checked for (`isClarificationVisible`/`.assistant-panel__confirm-item` was never called after `sendChat` for these two scenarios) or clicked through. The pipeline was never silent; the harness just never interacted with the intermediate confirmation step `update`/`delete` always require (even with a single unambiguous candidate), unlike `create`, which skips item-selection/confirmation entirely. The per-scenario write-ups below and the tally have been corrected from FAIL to N/A accordingly. A client-side fix was applied anyway (skip that confirmation tap when there's exactly one unambiguous candidate, for parity with `create`) — see `useAssistantFlow.ts`'s `startOperation`.
6b. **All four harness gaps found this cycle (#3, #4, #6/6a, plus a slow/click-fragile trace-capture mechanism) were folded into `QA/scratchpad/qa/harness.mts` itself after this run**, not left as one-off supplementary scripts: `login()` now defaults the dashboard to Norsk itself (a fresh browser context otherwise defaults to English, which is what actually caused this cycle's own cleanup script to fail three times in a row before being diagnosed); a new `reachBatchReview()` helper opens the gate before checking for batch cards; a new `productExistsInCategory()` helper expands the category section before checking existence; `sendChat`'s own trace capture now reads the panel's admin-only "Copy conversation to clipboard" export instead of clicking through every collapsible trace step (built from React state, so it's immune to expand/collapse timing and needs one click instead of N); and `sendChat`'s own `reply` now includes the sibling `.assistant-list-attachment` element. A future cycle's own harness should additionally check `isClarificationVisible` after any `update`/`delete` `sendChat` call, now that Fix 4 above means only a genuinely ambiguous case still surfaces that prompt. The next cycle's plan should reuse this harness as-is rather than re-deriving any of this — see `QA/templates/qa-test-plan-template.md`'s own Methodology #13–15.
7. **Overall verdict, stated up front:** `qwen3:8b` is a **substantial, clear improvement** over both `gemma3:4b` (the original baseline) and `marksverdhei/normistral-it:7b` (the previous cycle). The deterministic `lookup_query` pipeline (plain counts, discount filters, bilingual name-`contains` filters, compound questions) was **100% correct** across every scenario that exercises it (A.1–A.9b, A.12a/b, A.extra) — a first for this QA history. **Product creation placement is now reliable** — every scenario that created a product (B.1, B.6×2, B.7, C.1b, C.3, C.4, C.5, C.9a/b) landed in the correct catalogue/category, in sharp contrast to both prior models' near-universal misplacement. Two real, reproducible issues remain, isolated cleanly: (a) **category creation** specifically (not product creation) still has a hard bias toward guessing `food-menu` and never asks — 5/5 category-creation scenarios confirm this; (b) a separate **category-membership lookup pipeline** (`lookup_batch`, used for "what's in category X" questions) is unreliable and hallucinated non-existent products in A.10, unlike the rock-solid `lookup_query` path used elsewhere. A genuine app-level bug was also found in batch per-card independence (C.3): confirming one card discards the other unconfirmed cards instead of leaving them independently actionable — reproduced twice. (B.9/B.10's "silent stall" — originally reported as a third app bug here — was corrected post-run to a harness gap, not a real issue; see #6a.)

**Tally:** 30 PASS, 0 PARTIAL, 7 FAIL, 4 N/A, 0 ERROR across 41 scenarios (A.1–C.9b, same set as the source/normistral reports; note the prior report's own tally stated "40" — likely counting B.6's two sub-paths as one line item, since the classification table itself already lists them separately). A.10 is diagnostic-only per the plan but is included in the tally (as FAIL) per the same convention the normistral report used. Plus 1 ungraded diagnostic-addendum entry (does not affect the tally).

**Correction (post-run):** B.9/B.10 were originally tallied as FAIL ("silent stall — real app bug") — a follow-up screenshot check found this was wrong. Both moved to N/A below; see Methodology note #6a and the per-scenario write-ups.

## A. Read/lookup pipeline

**A.1 — Plain count ("Hvor mange produkter har vi?")**
- **Status:** PASS
- **What happened:** "Vi har 109 produkter." — correct. Trace: `lookup_query` proposed `{"filters":[],"reportField":null}` — the deterministic empty-filter count path, no `answer_lookup` involved.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/001-A-1.png`

**A.2 — Filtered count ("Hvor mange produkter er på tilbud?")**
- **Status:** PASS
- **What happened:** "Vi har 3 produkter." — correct (3 real active discounts). Trace: `lookup_query` correctly proposed `{"field":"hasDiscount","op":"is","value":"true"}` — the right structured field, not a name-text guess.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/002-A-2.png`

**A.3 — Which product is on sale ("Hvilke produkter er på tilbud?")**
- **Status:** PASS
- **What happened:** "De produkter som er på tilbud er Kylling Fajitas Chicken Fajitas, Michelin Vinterdekk 205/55R16 og Michelin Vinterdekk 205/55R16." — correctly names all 3 real discounted products (the two Michelin rows are the known pre-existing duplicate, not a new hallucination). `hasDiscount` filter + `reportField:"name"`, grounded via `answer_lookup` against real data.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/003-A-3.png`

**A.4 — List all products (bullet attachment)**
- **Status:** PASS
- **What happened:** "Her er 109 produkter:" with a real 111-`<li>` list rendered below (small DOM overcount from surrounding chrome, not a data error) — correct count and a genuine list, not a hallucinated run-on sentence.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/004-A-4.png`

**A.5 — Compound imperative+interrogative**
- **Status:** PASS
- **What happened:** Correctly split into two sub-queries via compound-split and answered both: "Her er 109 produkter:" (list half, correct) and "Det er tre varer på tilbud: Kylling Fajitas (Wraps), Michelin Vinterdekk 205/55R16 (?) og Michelin Vinterdekk 205/55R16 (Dekk)" (discount half, correct — all 3 real discounted items named).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/005-A-5.png`

**A.6 — Compound two-interrogative**
- **Status:** PASS
- **What happened:** "Vi har 109 produkter. De følgende produktene er på tilbud: Kylling Fajitas (Wraps), Michelin Vinterdekk 205/55R16 (?) og Michelin Vinterdekk 205/55R16 (Dekk)." — both halves correct, same compound-split mechanism as A.5.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/006-A-6.png`

**A.7 — Non-question phrase must NOT trigger a create ("et stort og et lite frontlys")**
- **Status:** PASS
- **What happened:** "Det ser ut som du har et stort og et lite frontlys. Hva kan jeg hjelpe med?" — correctly classified as non-command. gate=false, batch=false, singleReview=false (all correctly false).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/007-A-7.png`

**A.8/A.11 — Ambiguous "Frontlys" must clarify**
- **Status:** PASS
- **What happened:** Correctly surfaced a clarification listing both real candidates: "Frontlys - Interiør" and "Frontlys - Tilbehør" — never silently guessed.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/008-A-8-A-11.png`

**A.9a — Bilingual filter, LED products (Norsk UI)**
- **Status:** PASS
- **What happened:** `lookup_query` correctly proposed `{"field":"name","op":"contains","value":"LED"}` (a real `contains` keyword extraction, not a literal-phrase match). The harness's own automated check reported "found 0/3" because it only searched the plain-text `reply` ("Her er 4 produkter:"), but the actual rendered list (screenshot) shows all 4 real matches: **Pulled Pork** (the known, previously-root-caused substring collision — "pu**LL**ED pork"), **LED Headlight Bulb H7**, **LED Interior Strip**, **LED Fog Light** — including the two genuinely blank-Norwegian-name products this scenario exists to check. Graded from the screenshot per the harness-vs-reality rule.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/009-A-9a.png`

**A.9b — Bilingual filter, LED products (English UI)**
- **Status:** PASS
- **What happened:** Same filter and same correct 4/4 result under English UI ("Here are 4 products:" — Pulled Pork, LED Headlight Bulb H7, LED Interior Strip, LED Fog Light, all rendered in the list). Confirms the bilingual null-name fallback works in both directions.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/010-A-9b.png`

**A.10 — Pronoun follow-up (own 2-turn continuity, diagnostic) — real regression found**
- **Status:** FAIL
- **What happened:** This scenario uses a *different* pipeline than A.1–A.9b: `lookup_batch` (an iterative, chunked category-membership scan — "Går gjennom en gruppe med data") rather than the deterministic `lookup_query` field filter. Q1 ("Hvilke produkter har vi i Bremser-kategorien?") oscillated through dozens of batch iterations before settling on a reply that **hallucinates four non-existent products** ("Bremser Del 5" through "Bremser Del 8") and **wrongly attributes 6 real Dekk-category products** (Michelin Vinterdekk 205/55R16, Dekk Del 4–8) to the Bremser category. Verified against real data: Bremser genuinely contains only 5 products (Bremser Del 1–4 at 209/219/229/239 kr, plus Brembo Sportbrems). Q2 ("Hvor mye koster den første?") correctly resolved the *reference* to "Bremser Del 1" via `select_lookup_target`, but the downstream `select_item` candidate search then returned two **Michelin Vinterdekk** entries as candidates (not Bremser Del 1 at all) and answered "1199 kr" — Michelin's own discounted price, not Bremser Del 1's real 209 kr. This is a genuine, real-data-verified failure distinct from the lookup_query pipeline's excellent performance elsewhere in Section A — see Key Findings #3.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/011-A-10.png`

**A.12a — Event bilingual display (Norsk UI)**
- **Status:** PASS
- **What happened:** "Vi har 1 arrangement." (correct) → "Det er bare Bilutstilling på tunet (2026-09-02)." (correct — the one real event, correctly listed).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/012-A-12a.png`

**A.12b — Event bilingual display (English UI, no English title)**
- **Status:** PASS
- **What happened:** "We have 1 event." → "There's only Bilutstilling på tunet (2026-09-02)." — correct count and correct bilingual-fallback title, matching the real Events list view (also screenshotted, showing the same fallback title rendered directly in the admin UI).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/014-A-12b-events-view.png`

**A.extra — Catalogue count and category count**
- **Status:** PASS
- **What happened:** "Vi har 2 kataloger." — correct (verified: exactly 2 real catalogues, food-menu and AutoDeler; the environment has drifted to 2 since the normistral cycle's own 3). "Vi har 14 kategorier." — correct at the time this ran (7 food-menu + 7 AutoDeler = 14, before B.8 later added a 15th). No catalogue/category conflation this cycle.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/015-A-extra.png`

## B. Single-record ingestion

**B.1 — Confidence markers / posture stripping ("Legg til et nytt dekk som heter Continental Sommerdekk, ca 1200 kr")**
- **Status:** PASS
- **What happened:** Gate appeared; "Se detaljer" → normal review form with no Allergener/Diettmerker fields shown (correct posture stripping under Automatisk). Confirmed → real product created at 1200 kr, **verified placed correctly in AutoDeler → Dekk** — a first-time correct placement for this exact scenario across all three model cycles.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/016-B-1.png`

**B.2/B.3a — Clarification loop, tap to pick catalogue ("Legg til en ny kategori som heter Dekkhotell")**
- **Status:** FAIL
- **What happened:** No clarification surfaced on either attempt. Trace: `fill_fields_batch_category` proposed `catalogueId: "food-menu"` on the first pass both times — never leaves the field null despite the entire conversation's own AutoDeler/car-parts context. Same root cause as B.2/B.3b, B.4, B.8, C.2 — see Key Findings #1.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/017-B-2-B-3a.png`

**B.2/B.3b — Clarification loop, typed chat answer ("Legg til en ny kategori som heter Sesonglager")**
- **Status:** FAIL
- **What happened:** Identical pattern — `catalogueId: "food-menu"` guessed both attempts, no clarification.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/018-B-2-B-3b.png`

**B.4 — Unclear chat answer to clarification ("Legg til en ny kategori som heter Vinterlager")**
- **Status:** N/A
- **What happened:** Blocked by the same upstream issue — no clarification ever surfaced to answer unclearly, on either attempt. `catalogueId: "food-menu"` guessed both times.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/019-B-4.png`

**B.5a — Draft-quality gate, "Se detaljer"**
- **Status:** PASS
- **What happened:** Gate appeared; "Se detaljer" correctly revealed the normal review form.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/020-B-5a.png`

**B.5b — Draft-quality gate, "Prøv igjen" (composer restore)**
- **Status:** PASS
- **What happened:** Gate appeared; "Prøv igjen" correctly restored the exact original message into the composer, focused, and dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/021-B-5b.png`

**B.5c — Draft-quality gate, "Avbryt" (discard)**
- **Status:** PASS
- **What happened:** Gate appeared; "Avbryt" correctly cleared the composer and dismissed the gate.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/022-B-5c.png`

**B.6 (Confirm path) — Confirm a staged draft through the gate**
- **Status:** PASS
- **What happened:** Gate → "Se detaljer" → Confirm → real product "Gate Confirm Dekk" created and **verified correctly placed in AutoDeler → Dekk** (not the "Ikke kategorisert" bucket both prior models landed in for this exact scenario).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/023-B-6-confirm.png`

**B.6 (Edit path) — Edit a staged draft through the gate**
- **Status:** PASS
- **What happened:** Gate → "Se detaljer" → Edit → real product form opened → Save → real product "Gate Edit Dekk" created and **verified correctly placed in AutoDeler → Dekk** (the normistral cycle's own Edit-path record for this scenario landed all the way in Matmeny → Nachos; that misplacement did not reproduce here).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/024-B-6-edit.png`

**B.7 — Price/discount display fix ("Legg til et bremsesett som heter Brembo Sportbrems for 2400 kr med 20% rabatt")**
- **Status:** PASS
- **What happened:** Review text shows no discount row populated with a fabricated percentage (correctly left unset — "20% rabatt" was not carried into a real `discount` field). **Verified against real data:** "Brembo Sportbrems" was created with `category: category-1785741602245` — AutoDeler's own real **Bremser** category, correctly placed (distinct improvement over both prior cycles, which placed this exact product uncategorized in a blank catalogue).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/025-B-7.png`

**B.8 — Category custom-field fabrication check ("Legg til en ny kategori som heter Verktøy")**
- **Status:** FAIL
- **What happened:** No unrequested custom fields were fabricated (a genuine positive — the specific thing this scenario checks for). But `fill_fields_batch_category` set `catalogueId: "food-menu"` again. **Verified against real data:** "Verktøy" was created inside Matmeny (alongside Nachos/Salater/Wraps/etc.), not AutoDeler — same root cause as B.2/B.3a/b, B.4, C.2.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/026-B-8.png`

**B.9 — Update product price via chat ("Endre prisen på Continental Sommerdekk til 1350 kr") — corrected: not a bug**
- **Status:** N/A (harness gap — the scenario's own intent was never actually tested)
- **What happened:** `classify_message`/`select_command`/`select_item` all correctly resolved to `{"entity":"product","action":"update"}` and the right `itemID`. **Correction (post-run):** the harness's own `reply`/review-text checks came back empty, which the original write-up read as a silent stall — but the screenshot shows a real, working "Er dette den riktige?" confirmation prompt (`Continental Sommerdekk - Dekk` / `Ja` / `Nei, vis andre`) that the test script never checked for or clicked. Re-testing with the accidental duplicate candidate removed first produced the identical (correct) confirmation prompt, not a stall — the "identical result" in the original write-up was itself evidence of a working, deterministic confirmation step, not a repro of a bug. Whether the price update itself works once that tap happens was never actually exercised this run. A client-side fix (skip this tap entirely when there's exactly one unambiguous candidate) was applied post-run regardless, since `create` needs no equivalent step — see the report's own Methodology note #6a.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/027-B-9.png`

**B.10 — Delete product via chat ("Slett dekket Continental Sommerdekk") — corrected: not a bug**
- **Status:** N/A (harness gap — the scenario's own intent was never actually tested)
- **What happened:** Same pattern and same correction as B.9 — `classify_message`/`select_command`/`select_item` all correctly resolved, and the screenshot shows the same working "Er dette den riktige?" confirmation prompt the test script never interacted with. The product was ultimately removed via the ordinary admin-UI cleanup step instead of via chat, since the chat-driven delete was never actually carried through this prompt during the run.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/028-B-10-after.png`

**B.11a — Kebab override, posture Av (full) — verify pass + two trace steps**
- **Status:** PASS
- **What happened:** With posture forced to Av, `fill_fields_batch_product` correctly ran as a tagged **(draft)** then **(verify)** pair rather than a single untagged call. Gate did not appear (`gate=false`, correct for full posture). Review form showed **both** Allergener and Kosthold-tagger fields (the harness's own automated check looked for a "Diettmerker" label that no longer exists in this build — the real field is labeled "Kosthold-tagger" — a harness label mismatch, not a bug; both fields were correctly present, just empty since the model didn't propose a value for either).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/030-B-11a.png`

**B.11b — Kebab override, posture back to Automatisk — single untagged step**
- **Status:** PASS
- **What happened:** Posture correctly reverted: `fill_fields_batch_product` ran as a single untagged call, and the gate correctly reappeared (`gate=true`) — confirming the toggle's round-trip works, and that posture is the persistent device-level setting it's meant to be (round-tripped correctly across a brand-new chat session).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/031-B-11b.png`

**B.12 — Manual product creation unaffected by the assistant**
- **Status:** PASS
- **What happened:** "Manuell Test Dekk" created via the ordinary "+ Legg til produkt" form, zero AI-related chrome detected. **Verified: real product existed in AutoDeler → Dekk at 599 kr**, correctly placed (as any manual creation should be).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/032-B-12.png`

## C. Batch (multi-record) ingestion

**C.1a — Batch phrasing gap, natural non-imperative phrasing ("Dekk til 1200 kr med sommer, vinter og pigg")**
- **Status:** FAIL
- **What happened:** `classify_message` correctly said "command", but `select_command` proposed `{"entity":"product","action":"update"}` — the wrong action (should be `create`) — with the entire phrase misused as a search string. A genuine model misclassification, not a harness gap (confirmed via direct trace inspection).
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/033-C-1a.png`

**C.1b — Batch create, explicit imperative ("Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk") — gate-fix rerun**
- **Status:** PASS
- **What happened:** Original attempt read as `batch=false` — a harness gap (see Methodology #3). Rerun opened the gate ("12 felt trenger gjennomgang") via "Se detaljer" and found a correct, well-formed 3-card batch: sommerdekk (1200 kr), vinterdekk (1300 kr), piggdekk (1200 kr) — no fabricated fields, sensible price-to-name mapping given the ambiguous "1200/1300 kr" phrasing. Confirmed via "Bekreft alle"; **verified all 3 real products created correctly in AutoDeler → Dekk.**
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/001-C-1b-gatefix.png`

**C.2 — Shared clarification across batch cards ("Legg til to nye kategorier: Skinnhotell og Feltlager")**
- **Status:** FAIL
- **What happened:** No clarification ever surfaced — the batch cards rendered directly (no gate this time; unlike the product-batch scenarios, this one didn't need "Se detaljer"). `fill_fields_batch_category` assigned **both** "Skinnhotell" and "Feltlager" to `catalogueId: "food-menu"` — same root-cause bias as every other category-creation scenario this run, now confirmed inside a batch too. Draft was left unconfirmed (not created), per the scenario's own clarification-focused design.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/035-C-2.png`

**C.3 — Per-card actions (confirm/edit/remove independence) — real app bug found**
- **Status:** FAIL
- **What happened:** Gate-fix rerun reached a genuine 3-card batch (Card Test A/B/C, Batterier). Confirming card 0 ("Bekreft") succeeded and created the real product — but **all 3 cards then vanished from the batch UI, not just the confirmed one** (0 remained where 2 should have stayed staged), so the subsequent "Rediger" (edit) click on the next card timed out waiting for a button on a batch that no longer existed. Re-ran in an isolated retry with a fresh 3-card batch (Retry Card A/B/C) to rule out a one-off timing glitch: **identical result** — confirming card 0 again collapsed the whole batch to 0 cards. **Verified against real data: only the one explicitly-confirmed card (per attempt) was ever actually created** — the others were silently discarded, not created and not left available, directly contradicting the "per-card independence" this scenario exists to test. This is a real, reproduced-twice app bug, distinct from the bulk "Bekreft alle"/"Avbryt alt" actions (C.1b/C.5/C.6/C.7), which correctly act on the whole batch at once and worked fine.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/036-C-3.png` (harness gap discovery), retry evidence in `002-C-3-retry-*.png`

**C.4 — Invalid discount blocks Confirm all only ("...Varta 70Ah for 1100 kr med 150% rabatt")**
- **Status:** N/A (precondition never triggered)
- **What happened:** Gate-fix rerun reached a real 2-card batch. The model did **not** fabricate a 150% (or any) discount for Varta — a genuine positive — but that also means no card ever actually carried an out-of-range discount value for the app's own "Confirm all" validation to block. `disabled=false` is therefore inconclusive rather than a validation failure: the specific mechanic this scenario means to test (does the app block Confirm-all on a genuinely invalid discount) was never actually exercised this cycle.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/002-C-4-gatefix.png`

**C.5 — Confirm all on a clean batch ("...Pioneer Høyttaler for 800 kr og Sony Forsterker for 950 kr")**
- **Status:** PASS
- **What happened:** Gate-fix rerun reached a clean 2-card batch, both records correct. "Bekreft alle" correctly confirmed both; **verified both real products created correctly in AutoDeler → Lydanlegg.**
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/003-C-5-gatefix.png`

**C.6 — Cancel all, nothing created ("...Cancel Test A/B/C...")**
- **Status:** PASS
- **What happened:** Gate-fix rerun reached a real 3-card batch; "Avbryt alt" correctly dismissed it. **Verified: no Cancel Test products exist in real data.**
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/004-C-6-gatefix.png`

**C.7 — Cross-record contamination check (events batch)**
- **Status:** PASS
- **What happened:** Gate-fix rerun reached a real 2-card event batch: Sommertreff (2026-06-10, Torget 1) and Vintertreff (2026-12-15, Torget 2) — each card's own date and address stayed correctly isolated, no cross-record bleed. Confirmed via "Bekreft alle"; **verified both real events created correctly with their own distinct dates/addresses.**
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/005-C-7-gatefix.png`

**C.8 — No false batch UI for single-record message**
- **Status:** PASS
- **What happened:** "Legg til et nytt dekk som heter Test Solo Dekk for 999 kr" correctly produced a single-record gate (`gate=true`), never a batch (`batchShown=false`). Draft cancelled per the scenario's own design — no real "Test Solo Dekk" product exists.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/041-C-8.png`

**C.9a — Draft-quality gate, batch (3 records)**
- **Status:** PASS
- **What happened:** The 3-record motor-oil batch produced a coherent draft (Gate Batch A/B/C, 150 kr each, AutoDeler), and the gate correctly showed all 3 as separate summary lines with "12 felt trenger gjennomgang." Cancelled per the scenario's own design.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/042-C-9a.png`

**C.9b — Draft-quality gate, batch overflow (6+ records)**
- **Status:** PASS
- **What happened:** Overflow-collapsing behavior worked correctly: exactly 5 summary lines shown plus "…og 1 til" for the 6th real tire record. No cross-turn contamination from C.8's own cancelled draft (the exact bug this scenario exists to catch, first documented in the original gemma3:4b report) — confirming the fresh-session policy continues to close that gap.
- **Screenshot:** `../assistant-qa-screenshots-qwen3-8b/043-C-9b.png`

## Key findings summary

1. **Category creation (not product creation) still has a hard, consistent bias toward guessing "food-menu" and never asks — confirmed across 5 independent scenarios: B.2/B.3a, B.2/B.3b, B.4, B.8, C.2.** Every single one of `fill_fields_batch_category`'s proposals this run set `catalogueId: "food-menu"` on the first pass, with zero exceptions, regardless of how unambiguously the conversation's own context (an entire session of AutoDeler/car-parts messages) implied AutoDeler. **Root cause (confirmed via code review, fixed post-run):** unlike every other field in the same schema, `category.ts`'s `catalogueId` was a plain required `enum`, not wrapped in the `nullable()` helper `product.ts`'s equivalent `location` field already uses — the model was structurally forbidden from ever leaving it unset, so it always emitted the first/most prominent enum entry. Fixed by wrapping it in `nullable()` with matching guidance text (`server/assistant/entities/category.ts`).
2. **A separate category-membership lookup pipeline (`lookup_batch`) is unreliable and hallucinates, in sharp contrast to the deterministic `lookup_query` pipeline used everywhere else in Section A.** A.10's "what's in category X" question triggered dozens of chunked lookup iterations before producing a reply that invented 4 non-existent products and wrongly attributed 6 real Dekk-category products to Bremser; the same trace's own pronoun follow-up then resolved to a completely wrong item (Michelin Vinterdekk instead of Bremser Del 1) for its price answer. **Root cause (confirmed via code review, fixed post-run):** the keyword-based entity prefilter (`steps.ts`) matched *both* `product` ("produkter") and `category` ("kategorien" substring-matching "kategori") for this message, and 2 detected entities fails the single-entity gate that routes to the reliable `lookup_query` engine — falling through to the unreliable batch-scan path for both entities instead, even though `product.ts` already exposes a `locationLabel` filter field that could answer this deterministically. Fixed by narrowing to `product` alone when it's detected alongside a pure location-container entity (`category`/`catalogue`).
3. **A real, reproduced-twice app bug in batch per-card independence (C.3):** confirming a single card in a multi-card batch discards the *other* unconfirmed cards instead of leaving them staged for independent action — verified against real data twice (once via the gate-fix rerun, once via an isolated clean retry). This directly breaks the "per-card actions" contract the batch review UI is meant to provide, though the bulk "Bekreft alle"/"Avbryt alt" actions (which act on the whole batch deliberately) continue to work correctly. **Root cause (confirmed via code review, fixed post-run):** an effect resetting the dismissed-gate flag was keyed on the whole `flow.state` object, so a same-status partial update (one card confirmed) re-triggered it and snapped the view back to the aggregate gate — the underlying batch data was never actually lost, only hidden behind the wrong view. Fixed by narrowing the effect's dependency to `flow.state.status` alone (`AssistantPanel.tsx`).
4. **B.9/B.10's "silent stall" was not a bug — corrected post-run via screenshot.** The original write-up read an empty harness-captured `reply`/review-text as a stalled pipeline; both screenshots actually show a real, working "Er dette den riktige?" confirmation prompt the test script never checked for. Downgraded from FAIL to N/A (the scenarios' own intent was never actually exercised). A small client-side improvement was still applied at the user's request: skip that confirmation tap entirely when `select_item` resolves with exactly one unambiguous candidate, for parity with `create` (which needs no equivalent step) — see `useAssistantFlow.ts`'s `startOperation`.
5. **Three harness gaps were found and fixed mid-run, not model/app issues:** (a) C.1b and C.3–C.7 originally checked only for the batch-card UI without first opening the Draft-Quality Gate that six real drafts were sitting behind — fixed via a gate-aware rerun; (b) A.9a/A.9b's automated name-matching check searched only the plain-text reply, missing that real product names render in a separate DOM list block — resolved via direct screenshot inspection; (c) B.9/B.10's own checks never looked for the confirmation prompt described in #4 above. All three are flagged so the next cycle's harness carries the fixes forward.
6. **App-level mechanics that don't depend on model quality all held up:** the draft-quality gate's three actions (B.5a/b/c), the Confirm/Edit gate paths (B.6), the posture kebab-override round-trip (B.11a/b), manual-creation isolation (B.12), single-vs-batch UI gating (C.8), the batch overflow-line display (C.9b), and the bulk Bekreft-alle/Avbryt-alt batch actions (C.1b/C.5/C.6/C.7) all worked correctly regardless of the underlying draft's own quality.
7. **Headline positive, not a defect:** the deterministic `lookup_query` field-filter pipeline was **100% correct** across every scenario that exercises it (A.1–A.9b, A.12a/b, A.extra) — plain counts, discount filters, bilingual `contains` filters on names with blank Norwegian variants, and compound two-part questions all resolved correctly. This is a first across all three model cycles tested to date.

## Diagnostic addendum (does not affect the grading above)

**A.1–A.6 re-run in one continuous session**, to check whether `qwen3:8b` shows the kind of mid-session degradation `gemma3:4b` showed (and `normistral-it:7b` did not):

- Q1 (count): "Vi har 115 produkter." — correct at that point in the run (109 baseline + 6 real products created by earlier scenarios by then; verified against the actual product count at that moment).
- Q2 (discount count): "Vi har 3 produkter." — correct.
- Q3 (which on sale): "De produkter som er på tilbud er Kylling Fajitas Chicken Fajitas, Michelin Vinterdekk 205/55R16 og Michelin Vinterdekk 205/55R16." — correct, same 3 real discounted items as the fresh-session A.3.
- Q4 (list all): "Her er 115 produkter:" — correct count, consistent with a real list attachment.
- Q5 (compound): "Her er 115 produkter:\nDet er tre varer på tilbud: Kylling Fajitas (Wraps), Michelin Vinterdekk 205/55R16 (?) og Michelin Vinterdekk 205/55R16 (Dekk)." — both halves correct.
- Q6 (compound): "Vi har 115 produkter. De følgende produktene er på tilbud: Kylling Fajitas (Wraps), Michelin Vinterdekk 205/55R16 (?) og Michelin Vinterdekk 205/55R16 (Dekk)." — both halves correct.

**Reading:** No degradation observed at all — every answer in this continuous 6-turn session was as accurate as its fresh-session counterpart above. This is a clean contrast with the original `gemma3:4b` report (which documented `select_command` visibly misclassifying from partway through Section B onward in one long session) and consistent with the `normistral-it:7b` cycle's own finding that session length wasn't the dominant variable for that model either. For `qwen3:8b`, the deterministic `lookup_query` pipeline's reliability appears to hold regardless of session length — the model/app issues found in this cycle (category-catalogue guessing, C.3's batch-collapse bug, A.10's `lookup_batch` hallucination) are all independent of turn count, reproducing identically in single-turn, fresh-session scenarios.
**Screenshot:** `../assistant-qa-screenshots-qwen3-8b/044-Diagnostic-A1-A6.png`

## Cleanup performed

`AutoDeler` (7 categories, 54 seed products) was **kept in place**, per standing policy, so a future re-test doesn't need to re-seed. Every record this cycle's scenarios created on top of it (including the accidental duplicate from a harness bug, and everything created by the gate-fix/retry supplementary scripts) was removed via the real admin UI:

| Record | Created in | Deleted via |
| --- | --- | --- |
| Product "Continental Sommerdekk" (AutoDeler → Dekk, 1200 kr) | B.1 | Admin UI delete |
| Product "Gate Confirm Dekk" (AutoDeler → Dekk) | B.6 (Confirm path) | Admin UI delete |
| Product "Gate Edit Dekk" (AutoDeler → Dekk) | B.6 (Edit path) | Admin UI delete |
| Product "Manuell Test Dekk" (AutoDeler → Dekk, manual creation) | B.12 | Admin UI delete |
| Product "sommerdekk" (AutoDeler → Dekk, 1200 kr) | C.1b (gate-fix rerun) | Admin UI delete |
| Product "vinterdekk" (AutoDeler → Dekk, 1300 kr) | C.1b (gate-fix rerun) | Admin UI delete |
| Product "piggdekk" (AutoDeler → Dekk, 1200 kr) | C.1b (gate-fix rerun) | Admin UI delete |
| Product "Brembo Sportbrems" (AutoDeler → Bremser) | B.7 | Admin UI delete |
| Product "Card Test A" (AutoDeler → Batterier, 500 kr) | C.3 (gate-fix rerun, confirmed before the batch-collapse bug fired) | Admin UI delete |
| Product "Bosch 60Ah" (AutoDeler → Batterier, 900 kr) | C.4 (gate-fix rerun) | Admin UI delete |
| Product "Retry Card A" (AutoDeler → Batterier, 500 kr) | C.3 isolated retry | Admin UI delete |
| Product "Pioneer Høyttaler" (AutoDeler → Lydanlegg, 800 kr) | C.5 (gate-fix rerun) | Admin UI delete |
| Product "Sony Forsterker" (AutoDeler → Lydanlegg, 950 kr) | C.5 (gate-fix rerun) | Admin UI delete |
| Category "Verktøy" (Matmeny/food-menu, misplaced) | B.8 | Admin UI delete |
| Event "Sommertreff" | C.7 (gate-fix rerun) | Admin UI delete |
| Event "Vintertreff" | C.7 (gate-fix rerun) | Admin UI delete |

No other scenario actually confirmed a real create (B.2/B.3a/b, B.4, C.2's category batch, and C.1a never reached a stageable/confirmable state; B.5a/b/c, B.11a/b, C.8, C.9a/b were cancelled per their own design) — verified directly against `server/data/admin-products.json`/`admin-catalogues.json`/`admin-events.json`, not any script's own self-report, both before and after cleanup.

**Final verification:** AutoDeler back to exactly 54 products / 7 categories; Matmeny back to its original 7 categories (Nachos/Salater/Wraps/Baguetter/Pizza/Kaffe & Drikke/Smoothies); total store-wide product count back to 109; 1 event unchanged ("Bilutstilling på tunet"); 2 catalogues (matching this run's own measured starting baseline).
