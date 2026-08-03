# Assistant QA Report — 2026-08-02
**Provider(s) tested:** Local (Ollama), model `gemma3:4b` — Claude/cloud pass skipped for this run per request.
**Environment:** http://localhost:5173 (pre-existing dev instance the user already had running, `main` branch)

**⚠️ Important caveat:** the user was actively developing this exact assistant feature in their own editor throughout this run, alongside this QA session, using the same live dev server (hot-reloaded via Vite/tsx watch). Mid-run they committed a batch of their own in-progress changes (`cc216e6 "ai testewr"`) touching `server/assistant/steps.ts`, `server/index.ts`, `reviewChangeRows.ts`, `useAssistantFlow.ts`, `AssistantPanel.tsx`, and — notably — **adding the entire `AssistantBatchReview.tsx`/`.scss` batch-review UI as new files**, which did not exist at all at the start of this run. Because of hot-reload, earlier scenarios in this report (particularly section A, tested first) may have run against an earlier/incomplete state of the assistant code than later scenarios (particularly section C's batch tests) — the two are not necessarily testing the same code snapshot. Treat FAIL findings from early in the run with that in mind; a re-run against a settled commit would be more conclusive for section A specifically.

## Summary

**CRITICAL findings:**
- **Read/lookup pipeline is unreliable on gemma3:4b for anything beyond a simple filtered count.** Plain counts, bulk lists, compound questions, name-keyword filters, and non-product-entity lists frequently hallucinate outright (A.1: "we have 1 product" when there are 54; A.4: replied "Te" to "list all products"; A.10: four different list-shaped questions all failed) rather than falling back to the deterministic `lookup_query` path the app is designed around.
- **A recurring hallucinated search text ("Chicken Fajitas") appears across multiple unrelated questions** (A.3, A.5, A.9) whenever `select_lookup_target` is uncertain, sending the flow into single-item disambiguation instead of an actual list/filter — a reproducible model bias worth flagging to whoever tunes gemma3:4b's prompting.
- **A.7: a plain descriptive phrase with no create intent ("den store og lille kylling wrap") was misclassified as a create command**, staging a real draft with a fabricated price and wrong dietary tag that an admin could accidentally confirm.
- **A.12: catalogue and category are conflated outright** — "how many catalogues" returned the category list mislabeled as catalogues, built on a filter referencing a hallucinated catalogue name.
- **B.1: a fabricated allergen ("Cashew nuts") was shown with zero warning styling** — indistinguishable from a literally-stated fact — for a food-safety-relevant field the confidence-marker system exists specifically to flag.
- **Price-row display bug is app-level, not model-dependent** (`reviewChangeRows.ts`'s `worstConfidence` doesn't account for which price mode is active): a correctly-captured flat price shows as "Fill this in" and blocks one-tap Confirm on create, on what's likely the most common create shape. Confirmed via reading the real product form (Edit) that the underlying data was actually correct.
- **C.1: the QA prompt's own suggested batch-create phrasing ("Wraps for 149/159 med...") completely fails** — misclassified as a question, zero records staged — only an explicit "legg til" verb worked.
- **C.7: cross-record field contamination in batch mode** — one event's category ("Live music") leaked into an unrelated sibling record ("Quiz Night") in the same batch.

**Verdict:** Local/gemma3:4b is functional for narrow, well-specified requests (single-item lookups, filtered counts, fully-specified single-record creates/updates/deletes, catalogue/event creates) but is unreliable for anything involving lists, compound questions, or ambiguous phrasing — it tends to hallucinate a confident, plausible-sounding wrong answer rather than surface uncertainty. Two real app-level bugs were also found independent of model quality: the Price-row confidence display, and batch cross-record field bleed. UI mechanics that don't depend on LLM output quality (confirm/edit/cancel flows, destructive-delete confirmation phrase, batch per-card actions, provider/model settings, mobile layout) worked correctly throughout.

**Scenario tally** (counting each lettered/numbered sub-scenario once; N/A scenarios excluded): **21 PASS, 6 PARTIAL, 14 FAIL, 1 N/A** across sections A–E — see the detailed breakdown below for exactly which.

**Ground truth seed data used:** catalogue "Food menu" → categories Nachos(9), Salads(4), Wraps(13), Baguettes(9), Pizza(3), Coffee & Drinks(13), Smoothies(3) = **54 products total**; "Chicken Fajitas" (in Wraps) has an active discount (149/159 kr → 112/119 kr); one event created for this run, "Live jazz kveld" (15.08.2026, category "Musikk").

## Results by section (A–E)

### A. Read/lookup pipeline

**A.1 — Plain count ("Hvor mange produkter har vi?")**
- **Status:** FAIL
- **What happened:** Assistant replied "Vi har ett produkt." (— "We have one product") — factually wrong; the real count is 54. Reply is also in Swedish ("ett" rather than Norwegian "ett/én"), suggesting the small model drifted language mid-answer.
- **Trace notes:** No `lookup_query` step at all (contradicts the prompt's expectation of a deterministic `lookup_query` step and no `answer_lookup`-style step). Actual sequence: `classify_message` → `select_lookup_target` (produced `searchText: "antal produkter"`, a garbled/Swedish-tinged query) → `answer_lookup_item` (called twice, once as a "double-check" verification pass) — i.e. the plain-count case fell through to an LLM-composed answer instead of a deterministic count lookup, and the LLM then hallucinated "one".
- **Severity:** CRITICAL — data integrity of an answer (hallucinated fact), and the deterministic-shortcut pipeline the prompt describes (`lookup_query`, no LLM call for a plain count) does not appear to be firing at all for gemma3:4b on this phrasing.

**A.2 — Filtered count ("Hvor mange produkter er på tilbud?")**
- **Status:** PASS
- **What happened:** Reply: "There's only Chicken Fajitas (Wraps) on sale." — correct (Chicken Fajitas is the only discounted product). Reply language is English, matching the dashboard's interface-language setting (English), which is correct per spec (assistant replies in the admin's own dashboard language, not necessarily the question's language).
- **Trace notes:** `classify_message` → `select_lookup_target` → `lookup_query` (draft) → `lookup_query` (verify pass, unchanged). No `answer_lookup`-style step — matches the deterministic-shortcut expectation, unlike A.1.

**A.3 — Filtered list, single match ("Hvilke produkter er på tilbud?")**
- **Status:** PARTIAL
- **What happened:** Reply: "Kylling Fajitas er på tilbud." — a single correct sentence naming the one discounted product, no list rendered, matching the spec's single-match behavior on the surface.
- **Trace notes:** The reasoning path that got there is wrong: `select_lookup_target` did not produce a discount filter — it output `searchText: "Chicken Fajitas"` (a specific product name that appears nowhere in the user's question), sending the flow into the named-item disambiguation path (`select_item`, picking between two real same-named candidates: "Chicken Fajitas" in Wraps vs. in Nachos) rather than the filtered-list path A.2 used. It happened to land on the discounted one and answer correctly, but this reasoning would very likely fail to enumerate 2+ discounted products correctly, since it isn't actually running a discount filter at all — it fabricated a specific product name out of a general question.
- **Severity:** MAJOR — correct output by coincidence, wrong/fragile reasoning path; a fact was effectively invented (the specific product name) even though the final answer checked out.

**A.4 — Bulk list request ("Gi meg en liste over alle produkter")**
- **Status:** FAIL
- **What happened:** Assistant replied with the single word "Te" ("Tea") — a nonsensical, completely unrelated one-word hallucination. No bullet list rendered at all.
- **Trace notes:** `classify_message` → `select_lookup_target` (searchText: "Alle produkter") → `answer_lookup_item` → `answer_lookup_item` (verify pass, repeated the same garbage). No `lookup_query` step fired — same deterministic-shortcut miss as A.1 — and the "double-check" verification pass did not catch or correct the nonsensical output, it just re-confirmed it.
- **Screenshot:** `../assistant-qa-screenshots/A4.png`
- **Severity:** CRITICAL — total hallucination on a basic, common request; the deterministic list/lookup path that should handle this reliably (per the prompt's own expectations) is not engaging for gemma3:4b on bulk-list phrasing.

**A.5 — Compound question, imperative + interrogative ("Gi meg en liste over alle produkter og vis meg hvem som er på tilbud")**
- **Status:** FAIL
- **What happened:** Reply: "Produktene er Kylling Fajitas. Kylling Fajitas er på tilbud." Neither half was answered correctly — no real all-products list (only names the one discounted item as if it were the entire catalogue), and the compound question was never split into two lookups.
- **Trace notes:** No evidence of `compoundSplit` producing two separate lookups. `select_lookup_target` again fabricated `searchText: "Chicken Fajitas"` (third time this exact hallucinated search text has appeared across A.3/A.5, despite neither question naming that product), sending it down the single-item disambiguation path instead of a list. The first-pass answer was actually about *price* ("koster 112 kr..."), which the verify pass then silently rewrote into a completely different claim ("Produktene er...") — i.e. the self-verification step changed the answer's content without any new information, which is itself concerning (the "double-check" step appears to regenerate rather than verify).
- **Severity:** CRITICAL — compound-question handling did not engage, and one specific hallucinated product name ("Chicken Fajitas" search text) is recurring across unrelated prompts, suggesting the model is anchoring on something in its own context/system prompt rather than the actual user text.

**A.6 — Compound question, two interrogatives ("Hvor mange produkter har vi og hvem er på tilbud?")**
- **Status:** FAIL
- **What happened:** Reply: "There's only Chicken Fajitas (Wraps) on sale." — only answers the second half (who's on sale); the first half ("how many products") is silently dropped entirely, no count given.
- **Trace notes:** This time `select_lookup_target` correctly produced `searchText: null` and `lookup_query` correctly ran a `hasDiscount` filter (no `answer_lookup` step, no hallucinated product name this time) — the discount half's *mechanics* were correct — but the pipeline only ever ran a single lookup for the whole compound message, so the count half was never queried at all.
- **Severity:** MAJOR — no hallucination this time, but confirms compound two-interrogative questions are not split into multiple lookups; one full half of the question is silently dropped rather than erroring or asking for clarification.

**A.7 — Non-question compound-looking phrase, must NOT be split ("den store og lille kylling wrap")**
- **Status:** FAIL
- **What happened:** Instead of being treated as one normal (ambiguous/incomplete) message, `classify_message` labeled it `"command"` and the flow staged a full **create-product draft** — a fabricated new product "the large and small chicken wrap", flat price 13.95, `outOfStock: true`, tagged `vegetarian` (for a chicken item), in category Wraps. Nothing in the message asked to create anything.
- **Trace notes:** `classify_message` → `select_command` (`action: "create"`) → `fill_fields_batch_product` (draft + verify pass, unchanged). The confidence-marker UI itself rendered correctly on this draft (Name/Description/Category/Dietary tags/etc. shown with the orange "inferred" warning treatment, Price/Discount shown as "Fill this in") — that part of the UI is working — but the underlying classification of the message as a create command is the bug.
- **Screenshot:** `../assistant-qa-screenshots/A7.png`
- **Severity:** CRITICAL — data integrity risk: a message that was never a create request produced a real staged draft with fabricated field values (invented price, wrong dietary tag) that an admin could accidentally confirm.

**A.8 — Single-item question ("Hvor mye koster Chicken Tandoori?")**
- **Status:** PASS
- **What happened:** Reply: "Kylling Tandoori koster 159 kr". Chicken Tandoori uses the Wraps category's default price (149 kr takeaway / 159 kr eat-in, confirmed in the real record) — the assistant's 159 kr matches the eat-in price. Correct fact, though it only surfaced one of the two prices without noting the takeaway/eat-in split (minor incompleteness, not an error).

**A.9 — Filter by name keyword, not category ("vis meg alle kylling-produkter")**
- **Status:** FAIL
- **What happened:** Reply: "Kylling Fajitas" — only names one product, when the real Wraps category alone has at least 7 chicken items (Chicken, Chicken Fajitas ×2, Chicken & Feta, Chicken Tzatziki, Chicken Tandoori, Chicken Curry, Chicken Aioli), several more likely in Nachos/Baguettes. No list rendered, no other chicken products mentioned.
- **Trace notes:** Identical failure pattern to A.3/A.5: `select_lookup_target` again fabricated `searchText: "Chicken Fajitas"` verbatim and fell into the single-item `select_item` disambiguation path instead of a name-keyword filter/list. This exact hallucinated search text ("Chicken Fajitas") has now appeared for three unrelated prompts (A.3, A.5, A.9) that never named that product — a real, reproducible bias worth flagging to whoever tunes the prompt/tool-schema for this model.
- **Severity:** CRITICAL — the scenario's specific concern (name-keyword filtering must not silently under-return) is confirmed broken, and the recurring hallucinated product name suggests a systemic prompting issue for gemma3:4b rather than one-off noise.

**A.10 — Pronoun follow-up (blocked upstream)**
- **Status:** FAIL
- **What happened:** Could not properly test pronoun resolution because no multi-item list question could be gotten to actually list its matches first (a prerequisite for "hvor mye koster den første?" to mean anything). Four different list-shaped questions were tried as setup: "Hvilke produkter har vi i Salater/Salads-kategorien?" → wrong entity picked (`categoryCustomField` instead of `product`) → "I don't have information to answer that."; "Vis meg produktene i Pizza" (3 real products) → "No products."; "Hvilke produkter inneholder gluten?" (most wraps are tagged `G` for gluten, visually confirmed) → "Ingen av produktene inneholder gluten." (wrong — none is false). In every attempt, `.assistant-list-attachment` (the real bullet-list UI) never rendered even once across this entire section, despite several scenarios (A.4, A.5, A.9, A.10 setup attempts) that should have 2+ results.
- **Trace notes:** Wrong-entity selection (`categoryCustomField`) is a new distinct failure mode from the "Chicken Fajitas" hallucination seen elsewhere. Not able to reach the actual pronoun-follow-up step.
- **Severity:** CRITICAL — this is really evidence of a broader, more serious problem than "pronoun follow-up doesn't work": the multi-result list/filter pipeline itself essentially never produces a correct multi-item answer or renders the list UI for gemma3:4b across this whole run so far.

**A.11 — Ambiguous item name ("Hvor mye koster Chicken Fajitas?", 2 real matches: Wraps and Nachos)**
- **Status:** FAIL
- **What happened:** Answered directly with "112 kr" (the Wraps version's discounted price) — no clarification question appeared at all (`hasConfirmItem: false`, no `clarifyingLookupItem` UI), even though two real, differently-priced products share this exact name.
- **Trace notes:** `select_item` was given both real candidates (`wraps-chickenFajitasWrap`, `nachos-chickenFajitasNachos`) and silently picked one itself (verify pass kept the same pick) rather than the app surfacing the pick-one clarification list the UI code (`AssistantPanel.tsx`'s `clarifyingLookupItem` state, confirmed present via `select:AssistantPanel` source read) supports. The admin is never told there even was a second "Chicken Fajitas".
- **Severity:** MAJOR — the correct UI flow for this exists and is presumably reachable in other cases, but did not trigger here; an admin asking a generic product-name question gets a confident, unflagged answer that may be about the wrong one of two same-named items.

**A.12 — Non-product entities: category, catalogue, event**

*Category count ("Hvor mange kategorier har vi?")*
- **Status:** PASS
- **What happened:** Reply: "Der er otte kategorier: Nachos (Food menu), Salads (Food menu), Wraps (Food menu), Baguettes (Food menu), Pizza (Food menu), Coffee & Drinks (Food menu), Smoothies (Food menu) og ()." — correct: 7 named categories in "Food menu" plus one real, blank-named category in the store's second (unnamed) catalogue = 8 total, confirmed by manually inspecting that second catalogue. Correctly included the easy-to-miss blank-named edge case. Minor: "Der er" is Danish, not Norwegian "Det er" — small language drift, not a factual error.

*Catalogue count ("Hvor mange kataloger har vi?"), asked in a fresh chat*
- **Status:** FAIL
- **What happened:** Reply was near-identical to the category-count answer above — lists the 7 categories + blank one as if they were "8 kataloger" (catalogues), when the store only has **2** real catalogues ("Food menu" and one unnamed one).
- **Trace notes:** `select_lookup_target` picked `lookupEntities: ["category"]` instead of `["catalogue"]` for "kataloger" — a direct catalogue/category word-confusion. The resulting `lookup_query` filter was also nonsensical (`catalogueName equals "Wraps & Coffee"` — the store's own brand name, not a real catalogue — combined with `hasCustomFields is true`), which happened to still return all 8 categories.
- **Severity:** CRITICAL — catalogue and category are two distinct, important entities in this app, and this small model conflates them outright, producing a confidently wrong count and a filter built on a hallucinated catalogue name.

*Event count ("Hvor mange arrangementer har vi?")*
- **Status:** PASS
- **What happened:** Reply: "Der er ét arrangement." — correct (exactly one event exists, "Live jazz kveld"). Trace: `classify_message` → `select_lookup_target` (`lookupEntities: ["event"]`, correct entity) → `lookup_query` (empty filters, `reportField: "status"`) → verify pass unchanged. No hallucinated entity confusion this time.

*Event list ("Hvilke arrangementer har vi?")*
- **Status:** FAIL
- **What happened:** Reply: "No events." — wrong; one real event exists. Consistent with the broader pattern seen all through this section: "how many" (count) questions tend to route correctly through `lookup_query`, while "which ones" (list) questions on the same entity are far more likely to fail outright.
- **Severity:** MAJOR — same systemic list-pipeline weakness as A.4/A.9/A.10, now confirmed non-product-specific (also affects events).

### B. Single-record ingestion (create/update/delete via chat)

**B.1 — Create with confidence markers ("Legg til en ny kaffe, iced latte, ca 55 kr")**
- **Status:** PARTIAL
- **What happened:** A staged review card appeared with `Confirm` correctly disabled (Price required and unset). Name ("Iced Latte") and Description rendered normally (not flagged), Category ("Coffee & Drinks") correctly shown with the orange "inferred" warning (not stated in the message), Available/Out of stock/Track stock/Stock quantity also correctly inferred-flagged. Two real problems: (1) **Price** was left as "Fill this in" even though the message literally stated "ca 55 kr" — the price should have been populated (at minimum as an inferred ~55, given "ca" signals approximation) rather than left completely blank; (2) **Allergens: Cashew nuts** was fabricated out of nothing (the message never mentions nuts or any allergen) and rendered with **no warning styling at all** — same plain treatment as the literally-stated Name field, meaning the one field most likely to matter for a real customer's safety is both hallucinated and dishonestly presented as certain.
- **Screenshot:** `../assistant-qa-screenshots/B1.png`
- **Severity:** CRITICAL — a fabricated allergen claim shown with full confidence (no warning marker) is a real-world safety-relevant hallucination that the confidence-marker system exists specifically to catch, and didn't.

**B.2/B.3/B.4 — Clarifying question (tap / chat fallback / unclear answer)**
- **Status:** FAIL (could not exercise as designed)
- **What happened:** Tried three different maximally-ambiguous create requests to force the "which category?"/"which catalogue?" clarifying question: "Legg til et nytt produkt som heter Test Special" (no category hint), "Legg til et nytt produkt" (no name or category), and "Legg til en ny kategori som heter Drikke" (2 real catalogues exist, genuinely ambiguous). In all three, gemma3:4b always guessed a value itself (Category: "Pizza", then "Nachos"; the category-create case didn't even surface a catalogue field) rather than leaving the field unset — read `server/assistant/entities/product.ts`'s `clarifiableFields` (and `category.ts`'s equivalent) confirms this is by design: the clarifying question is only asked when the model leaves `location`/`catalogueId` `null`, treating any model-set value (even a low-confidence guess) as a deliberate answer, not an unresolved one. Since gemma3:4b essentially never leaves these fields null, the clarification UI (confirmed present and correctly wired in code) could not be reached in this run, meaning B.2 (tap), B.3 (chat fallback), and B.4 (unclear chat answer) could not be tested end-to-end.
- **Bonus finding:** The category-create draft also fabricated two entirely unrequested **custom fields** ("Type (select)", "Merke (text)") that nothing in "Legg til en ny kategori som heter Drikke" asked for.
- **Screenshot:** `../assistant-qa-screenshots/B2.png`
- **Severity:** MAJOR — not a crash or data-loss bug, but a real gap: the clarification safety net that the rest of this spec (and the app's own design comments) relies on effectively never engages for the Local/gemma3:4b tier, because the model overconfidently fills in a guess instead of admitting uncertainty. Whoever tunes this model's prompting should know the null-detection this depends on doesn't hold for gemma3:4b in practice.

**Correction to B.1 / cross-cutting finding — Price row always shows "Fill this in" for a flat-priced create, even when the price was correctly captured**
- **Status:** FAIL
- **What happened:** B.1 and B.5 both showed Price as "Fill this in" in the review card even though B.5's message explicitly stated "pris 39 kr". Opening **Edit** on the B.5 draft (see B.6 below) proved the real underlying value *was* captured correctly — the real product form's Price section opened with the flat-price radio selected and "39" filled in. So the model got the price right; the review card's own display was lying about it.
- **Root cause (read from source, not just observed):** `reviewChangeRows.ts`'s Price row confidence is `worstConfidence(fieldConfidence, 'priceMode', 'flatPrice', 'takeawayPrice', 'eatInPrice')`, and `worstConfidence` returns `'unknown'` if *any* of those four keys is `'unknown'` — with no allowance for which price mode is actually active. When `priceMode: "flat"` (the normal case for a single flat price), `takeawayPrice`/`eatInPrice` are legitimately `null` (unused in flat mode) and `inferFieldConfidence` correctly reports `null` as `'unknown'` — but since they're irrelevant in flat mode, that `'unknown'` still drags the *whole row* down to "Fill this in" regardless of `flatPrice` itself being a solid `'verbatim'` match. This is **not model-dependent** — it's a deterministic client-side bug in `src/features/admin/assistant/reviewChangeRows.ts` that would reproduce identically on Claude.
- **Severity:** CRITICAL — this makes the review card wrongly claim a required field is missing (blocking one-tap Confirm) on what is likely the single most common create shape (a flat-priced product with the price stated in the message), forcing the admin into Edit/manual re-entry for information the assistant already extracted correctly.

**B.5/B.6 — Confirm a staged draft / Edit before confirming**
- **Status:** PARTIAL
- **What happened:** Because of the Price-row display bug above, `Confirm` was greyed out on every otherwise-clean flat-priced create tried in this run, so a direct chat-side Confirm could not be exercised end-to-end. Used **Edit** instead (B.6): the real product form opened embedded in the panel, correctly pre-filled (Category "Smoothies", Name/Description "QA Test Drink", Price flat/39 — confirming the underlying data was right all along), saved from there, and the real record "QA Test Drink · 39 kr" now exists under Food menu → Smoothies (verified in the Products list, screenshot below). So B.6 (Edit → real form → saves directly) works correctly; B.5 (direct chat Confirm) could not be verified due to the blocking display bug.
- **Screenshot:** `../assistant-qa-screenshots/B5_created.png`
- **Severity:** MAJOR (compounds the CRITICAL price-row bug above by blocking the primary confirm path it's supposed to protect).

**B.7 — Cancel a staged draft, verify nothing created**
- **Status:** PASS
- **What happened:** Re-checked the real Products list after cancelling the B.1 ("Iced Latte") and B.2 ("Test Special", "Drikke" category) drafts earlier — none of those exist. Coffee & Drinks still has exactly its original 13 real items (Espresso, Long Black, Red Eye, Americano, Macchiato, Cortado, Cappuccino, Café Latte, Chai Latte, Mocha, Ice Café, Flat White, Tea), no "Iced Latte"; no "Drikke" category anywhere. Cancel correctly discards with no side effects.

**B.8 — Create via chat for catalogue and event (not just product)**
- **Status:** PASS
- **What happened:** Catalogue: "Legg til en ny katalog som heter QA Test Catalogue" staged a clean draft (Confirm enabled, unlike product's price-blocked case — catalogue default price is genuinely optional) and confirming created a real "QA Test Catalogue" row in Products. Event: "Legg til et nytt arrangement som heter QA Test Event, 20.09.2026 kl 19:00 til 22:00, adresse Testgata 5" staged a draft with all the stated fields correct (Title, Start/End time, Location address all verbatim; Date correctly parsed to 2026-09-20 despite being mislabeled "inferred" in the confidence column — the same literal-text-match limitation as elsewhere, not a data error), Confirm enabled despite Capacity/Price left as "Fill this in" (both genuinely optional for an event), and confirming created a real "QA Test Event" row (20.09.2026 · 19:00 · Scheduled) in Events. Both verified via screenshots.
- **Screenshot:** `../assistant-qa-screenshots/B8_catalogue.png`, `../assistant-qa-screenshots/B8_event.png`

**B.9 — Update via chat ("Endre prisen på QA Test Drink til 45 kr")**
- **Status:** PARTIAL
- **What happened:** Correctly surfaced an item-match confirmation ("QA Test Drink - Smoothies", Yes/No), and after confirming the match, the price row displayed "39 kr→Fill this in" (same price-row confidence bug as B.1/B.5, now confirmed to affect the **update** path too) — yet Confirm was *not* disabled here (unlike create, presumably because an update treats an unset field as "no change" rather than a hard requirement). Confirming it actually applied correctly: the real "QA Test Drink" now shows 45 kr in the Products list, and no other product was touched.
- **Screenshot:** `../assistant-qa-screenshots/B9.png`, `../assistant-qa-screenshots/B9_result.png`
- **Severity:** MAJOR — the update itself is correct (right record, right new value, nothing else changed), but the misleading "Fill this in" display on an update could easily make an admin think their requested change silently failed and either re-submit it or bail out, even though it actually worked.

**B.10 — Delete via chat ("Slett produktet QA Test Drink")**
- **Status:** PASS
- **What happened:** Correct item-match confirmation first ("QA Test Drink - Smoothies", Yes/No), then the destructive-confirmation UI required typing the exact phrase "QA Test Drink - Smoothies" before Confirm became enabled (verified disabled beforehand). After typing it and confirming, the product was actually deleted — Smoothies category count dropped from 4 back to 3, and the other three real smoothies (Orange Strawberry & Banana, Orange Blueberry & Raspberry, Orange Tzatziki & Pesto) were untouched.
- **Screenshot:** `../assistant-qa-screenshots/B10.png`, `../assistant-qa-screenshots/B10_result.png`

**B.11 — Manual creation unaffected by the assistant**
- **Status:** PASS
- **What happened:** The event created manually via "+ Add event" at the very start of this run (to seed baseline data, see Summary) went through the ordinary admin form with zero AI-related chrome — no confidence markers, no assistant styling, a plain required-field validation ("Vennligst fyll ut dette feltet.") on Category/Location address. Manual creation is unaffected by the assistant's presence.

### C. Batch (multi-record) ingestion

**C.1 — Multi-record create ("Wraps for 149/159 med kylling, tunfisk og vegetar")**
- **Status:** FAIL (first attempt), PASS on retry with an explicit imperative
- **What happened:** The prompt's own exact suggested phrasing (no imperative verb, just "Wraps for 149/159 med kylling, tunfisk og vegetar") was misclassified entirely as a `"question"` and produced a single hallucinated one-line non-answer ("Fajitakrydret bønneblanding.") — no batch UI, no records staged at all. Screenshot: `../assistant-qa-screenshots/C1_fail1.png`. Rephrased with an explicit "Legg til tre nye wraps for 149/159 kr: kylling, tunfisk og vegetar" and got a correct **3-card batch** ("3 records ready to review"), Name/Category correctly per-card (Chicken Wrap/Tuna Wrap/Vegetar Wrap, all category "Wraps"), `Cancel all`/`Confirm all` present.
- **Recurring bugs also present in the batch case:** Price showed "Fill this in" on all 3 cards (same review-display bug as B.1/B.5/B.9); opening Edit on one card showed the real underlying price *was* captured, but only as a flat **149** — the dual "149/159" (takeaway/eat-in) format was not parsed into two prices, silently dropping the 159 eat-in figure. **Allergens: Cashew nuts** was fabricated on all 3 cards again (same hallucination as B.1), including on the Vegetarian wrap.
- **Trace notes:** First attempt: `classify_message` → `select_lookup_target` → `answer_lookup_item` ×2 (no batch/command path engaged at all).
- **Screenshot:** `../assistant-qa-screenshots/C1_fail1.png`, `../assistant-qa-screenshots/C1.png`, `../assistant-qa-screenshots/C1_edit1b.png`
- **Severity:** CRITICAL — the exact phrasing the prompt itself suggests for this scenario completely fails to trigger batch (or any create) handling on gemma3:4b; only works with an explicit "legg til" verb. The dropped eat-in price and fabricated allergen are the same classes of bug already flagged in section B, now confirmed to reproduce per-card in a batch too.

**C.2 — Shared clarification across cards**
- **Status:** N/A — not reachable
- **What happened:** Category was already unambiguous in the working C.1 retry (guessed "Wraps" correctly for all 3, matching the same never-leaves-null behavior documented in B.2/B.3/B.4), so no shared clarifying question ever appeared to resolve.

**C.3 — Per-card actions (Confirm one / Edit one / Remove one)**
- **Status:** PASS
- **What happened:** On the 3-card batch: confirmed the "Chicken Wrap" card individually — it was created immediately and removed from the batch view, leaving the other 2 staged. Opened Edit on "Tuna Wrap", filled in the real price (149) since the review card again wrongly showed it as unset, saved — it committed and was removed from the batch view. Clicked Remove on the last card, "Vegetar Wrap" — discarded with no confirmation needed, batch view emptied. Verified in the real Products list: "Chicken Wrap" and "Tuna Wrap" both exist (149 kr each, distinct rows/stock controls), no "Vegetar Wrap" anywhere — each per-card action affected only its own card.
- **Screenshot:** `../assistant-qa-screenshots/C3_result.png`

**C.4 — A card with a real validation problem disables "Confirm all" only**
- **Status:** PASS
- **What happened:** "Legg til to nye pizzaer: Margherita for 120 kr, og Diavola for 130 kr med 150% rabatt" (Diavola with an impossible 150% discount) staged 2 cards. `Confirm all` was correctly **disabled**, with an explanatory hint present as the button's `title` tooltip ("Fix the issues on every record below before confirming all at once.") — each card's own individual `Confirm`/`Edit` remained enabled and unaffected, exactly as specified.
- **Bonus finding:** Margherita — which was never asked to have any discount — got a fabricated "15%" discount (yet another instance of the same unprompted-hallucination pattern as the "Cashew nuts" allergen bug, this time on a numeric field with real business-logic consequences).
- **Screenshot:** `../assistant-qa-screenshots/C4.png`
- **Minor:** the "explanatory hint" is a hover-only `title` attribute, not visible on-screen text — technically present but easy to miss, worth a MINOR note.

**C.5 — Confirm all on a clean batch → distinct ids**
- **Status:** PASS (covered by C.3)
- **What happened:** Not tested as a literal "Confirm all" click (C.3's per-card testing achieved the same coverage), but the two records created via C.1/C.3 ("Chicken Wrap", "Tuna Wrap") both show up as fully distinct, independently editable rows in the real Products list with their own stock/edit/delete controls — no duplicate-id symptoms (e.g. one edit affecting both, or a shared row) observed.

**C.6 — Cancel all**
- **Status:** PASS
- **What happened:** Clicked `Cancel all` on the C.4 two-card batch (Margherita/Diavola). Both discarded — Pizza category count stayed at 3 (unchanged) in the real Products list, confirmed via screenshot.
- **Screenshot:** `../assistant-qa-screenshots/C6_result.png`

**C.7 — Batch create for non-product entities (event, category)**
- **Status:** FAIL
- **What happened:** *Events*: "Legg til to nye arrangementer: Quiz Night 10.10.2026 kl 19-21 adresse Testgata 1, og Live Music 15.10.2026 kl 20-23 adresse Testgata 2" correctly staged 2 cards with per-record Title/Date/Start/End/Location all correct — **except Category, which was "Live music" on *both* cards**, including "Quiz Night" (whose own category should never have been influenced by the second event's title). A real field-value leaked from one batch record into an unrelated one. *Categories*: "Legg til to nye kategorier i Food menu: Desserter og Vin" staged 2 category cards with correctly-translated names (Desserts/Wine, appropriately flagged "inferred" since translated not verbatim) but **both fabricated an unrequested "Type (select)" custom field** — same hallucinated-custom-field bug as B.2, now confirmed to reproduce in a batch too.
- **Trace notes:** N/A (cancelled both batches rather than creating test clutter, per the plan's cleanup-at-end approach — the point of this scenario, cross-record field bleed and fabricated fields, was already clearly demonstrated).
- **Screenshot:** `../assistant-qa-screenshots/C7_events.png`, `../assistant-qa-screenshots/C7_categories.png`
- **Severity:** CRITICAL — cross-record field contamination (one record's title/category bleeding into a sibling record in the same batch) is a real data-integrity risk specific to batch mode that doesn't show up in single-record creates.

**C.8 — No false batch UI for a single-record message**
- **Status:** PASS
- **What happened:** "Legg til en ny pizza som heter QA Solo Pizza for 99 kr" rendered as an ordinary single-card review (`Cancel`/`Edit`/`Confirm` only) — no `Confirm all`/`Cancel all`, no batch card count text. Cancelled without creating anything.

### D. Provider / model settings

**D.1 — Chatbox settings (kebab menu): provider selector and Claude model dropdown**
- **Status:** PASS
- **What happened:** The kebab ("AI model for this chat") menu's provider dropdown (Default from settings / Claude / Local (Ollama)) works correctly: selecting "Claude" updated the panel header to "Claude Sonnet 4.5" and revealed a Claude sub-model dropdown ("Default (from settings)"); switching back to "Local (Ollama)" restored the header to "Local (gemma3:4b)" and revealed separate Thinking-model/Vision-model dropdowns (both "Default (from settings)", i.e. deferring to the global Ollama config already set to gemma3:4b in Integrations).
- **Screenshot:** `../assistant-qa-screenshots/D1.png`, `../assistant-qa-screenshots/D1_claude.png`, `../assistant-qa-screenshots/D1_local.png`

**D.2 — Explicitly select gemma3:4b for Local**
- **Status:** PASS
- **What happened:** Already configured before this run started (Settings → Integrations → Ollama card had Thinking model set to "Custom… gemma3:4b"); confirmed via the trace's own `model` field reading `gemma3:4b` on literally every tool-call step across the whole run (dozens of examples throughout sections A–C). Vision-model dropdown only offers Small/Medium/Large presets (mapping to `qwen2.5vl:3b`/etc.), not gemma3:4b as a named option — expected, since gemma3:4b was configured as the Thinking model only, per the prompt's own conditional instruction.

**D.3 — Full A/B/C re-run on gemma3:4b**
- **Status:** PASS (by construction)
- **What happened:** This entire run's sections A, B, and C above were conducted exclusively against Local/gemma3:4b (Claude was only touched briefly in D.1 to verify the selector itself, then switched back) — satisfying the "full coverage, not spot-check" requirement.

**D.4 — Ollama model manager: installed list, add, delete**
- **Status:** PASS
- **What happened:** `gemma3:4b` confirmed listed as installed (3.1 GB) in Settings → Integrations' Ollama card throughout the run. Exercised add/delete with a genuinely new, disposable model (`qwen2.5:0.5b`, ~380 MB) rather than touching any of the 5 models already present on this host before the run started (those looked like the user's own pre-existing setup, not test data) — pulled it via "Add a model", confirmed it appeared in the list at 379.4 MB (cross-checked with `ollama list` at the CLI), then deleted it via its row's "Delete" button and confirmed it was gone (`ollama list` again). `gemma3:4b` itself was never touched.
- **Bug found in my own QA tooling, not the app:** the Delete button triggers a native `window.confirm()` dialog; my first attempt (before I'd registered a Playwright dialog handler) crashed the whole browser session outright (`ProtocolError: Page.handleJavaScriptDialog: No dialog is showing`), requiring a full browser relaunch and re-login. Not an app bug — flagging only because it's a sharp edge worth knowing about for any future automated testing against this same Delete control.
- **Screenshot:** `../assistant-qa-screenshots/D4_pulling6.png` (after add), `../assistant-qa-screenshots/D4_afterdelete2.png`/CLI cross-check (after delete)

### E. UI regressions

**E.1 — Narrow/mobile viewport navbar shortcuts**
- **Status:** PASS
- **What happened:** At 390×844, the top navbar correctly shows the hamburger menu, sparkle (Assistant), search, overview grid, notifications, and mail icons.
- **Screenshot:** `../assistant-qa-screenshots/E1.png`

**E.2 — Empty chat: "new chat" button hides, log button slides toward close**
- **Status:** PARTIAL
- **What happened:** Confirmed via DOM inspection that with an empty chat, the header only shows "AI model for this chat", "Conversation history", and "Close" — no "New chat" button — correct hide behavior. Could not verify the "smooth slide" animation itself (a Framer Motion width/position transition) through static screenshots/DOM checks; this would need frame-by-frame video capture, out of scope for this tooling.
- **Screenshot:** `../assistant-qa-screenshots/E2.png`

**E.3 — Mobile: opening the left sidebar closes the assistant panel**
- **Status:** PASS
- **What happened:** At 390×844 with the assistant panel open, clicking the hamburger menu (open sidebar) correctly closed the assistant panel (`.assistant-panel` count went from 1 to 0).
- **Screenshot:** `../assistant-qa-screenshots/E3.png`

**E.4 — Conversation log back button**
- **Status:** PASS
- **What happened:** Opening "Conversation history" then clicking "Back" correctly returned to the live chat composer view.
- **Observation (not a failure):** The log showed "No past conversations yet." despite dozens of substantive conversations earlier in this run — conversations appear to only get archived to the log under some condition (e.g. panel fully closing, not just "New chat") that this run's rapid cycling never triggered. Worth a manual look if conversation history is expected to always retain recent chats.
- **Screenshot:** `../assistant-qa-screenshots/E4_log.png`

**E.5 — Copy conversation action**
- **Status:** PASS
- **What happened:** Clicked "Copy conversation to clipboard" from the kebab menu after a real exchange — no `console.error`/`pageerror` appeared afterward (the specific regression this scenario guards against). Could not independently verify the actual clipboard contents: reading it back via `navigator.clipboard.readText()` hung indefinitely on a native clipboard-permission prompt in the automated browser, which I aborted rather than risk destabilizing the session again.

**E.6 — List question → "dem"/"them" follow-up**
- **Status:** PARTIAL
- **What happened:** After "Hvilke produkter er på tilbud?" → "Kylling Fajitas er på tilbud.", asked "Er dem tilgjengelige på menyen?" (Are they available on the menu?). Context resolution itself worked correctly — `select_lookup_target` resolved "dem" to `searchText: "Kylling Fajitas"`, correctly carrying the referent over from the prior turn rather than a dead-end "not sure what you mean". However, the final reply was **"Kylling Fajitas er på tilbud."** again — an exact repeat of the previous turn's unrelated answer (about being on sale), not an answer to the actual new question asked (whether it's available on the menu).
- **Severity:** MAJOR — context/referent tracking works, but the model doesn't seem to actually process the new question's own content once a referent is resolved, effectively echoing the last answer instead of answering.

## Cleanup performed

Every record actually created during this run (i.e. confirmed, not just staged/cancelled) was deleted by the end — the dev dataset is back to its pre-run state:

| Record | Created in | Deleted via |
| --- | --- | --- |
| Event "Live jazz kveld" (15.08.2026) — baseline seed data for section A, created manually | Pre-run seeding | Assistant chat delete (typed confirmation) |
| Product "QA Test Drink" (Smoothies, 39→45 kr) | B.5/B.6 (create), B.9 (update) | B.10 (assistant chat delete, as part of the scenario itself) |
| Catalogue "QA Test Catalogue" | B.8 | Assistant chat delete (typed confirmation) |
| Event "QA Test Event" (20.09.2026) | B.8 | Assistant chat delete (typed confirmation) |
| Product "Chicken Wrap" (Wraps, 149 kr) | C.1/C.3 | Manual admin UI delete |
| Product "Tuna Wrap" (Wraps, 149 kr) | C.1/C.3 | Assistant chat delete (typed confirmation) |
| Ollama model `qwen2.5:0.5b` (~380 MB) | D.4 | Model manager's own Delete control |

Drafts that were only staged and then Cancelled (never actually created, so nothing to clean up): "Iced Latte" (B.1), "Test Special" product + "Drikke" category (B.2), Margherita/Diavola pizzas (C.4/C.6), Quiz Night/Live Music events + Desserts/Wine categories (C.7), "QA Solo Pizza" (C.8).

Final state verified by screenshot: Products back to 2 catalogues ("Food menu" with its original 7 categories/54 products, plus the original unnamed catalogue), Events list empty, `gemma3:4b` and the 5 pre-existing Ollama models untouched.
