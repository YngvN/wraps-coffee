# Test plan: re-run the assistant QA pass on normistral-it:7b, fresh-session-by-default

**Status:** Plan only — not executed. Do not run any Playwright/browser automation from this plan without asking first (per this repo's CLAUDE.md).

**Source scenarios:** `assistant-qa-report-claude-2026-08-02.md` (the Playwright-automated, single-continuous-session gemma3:4b run — A.1 through C.9b, 35 scenarios). Its sibling `assistant-qa-report-2026-08-02.md` is referenced only for methodology conventions (environment notes, cleanup discipline, report format) that still apply here.

**What changes from the source report:**
1. **Model:** `normistral-it:7b` replaces `gemma3:4b` as the Tankemodell (thinking model).
2. **Session policy:** a fresh chat session (the panel's own "New chat" button) is started immediately before each scenario by default, instead of one long continuous session — isolating per-scenario correctness from the session-length degradation the source report documented (`select_command` misclassifying and stale-draft context bleeding into unrelated later turns from partway through Section B onward).
3. **AutoDeler is kept after this run** (not deleted in cleanup), so a future re-test doesn't need to re-seed from scratch — a deliberate change from both prior reports' "restore to pre-run state" convention.
4. **Execution is headed, not headless** — a visible Chromium window throughout, so the run can be watched live.

---

## 1. Model & vision configuration

- **Tankemodell (thinking):** `marksverdhei/normistral-it:7b` — already pulled on this host (`ollama list` confirms it, 4.4 GB). Set via Settings → Integrations → Ollama card → Thinking model → **Custom** → paste the exact tag `marksverdhei/normistral-it:7b`.
- **Bildemodell (vision):** **left on `qwen2.5vl:3b`**, not switched to normistral. `ollama show marksverdhei/normistral-it:7b` reports `Capabilities: completion` only — no `vision` entry — confirming NorMistral (a Norwegian-tuned Mistral text model) cannot serve the vision role the way the source report's own gemma3:4b tag doubled for both roles. `qwen2.5vl:3b` is already installed and already offered as one of the Integrations vision preset tiers (Small/Medium/Large), so no new pull is needed.
- **Why this split is safe:** `resolveOllamaModel` (`server/assistant/ollamaClient.ts`) routes purely on whether a given call carries an image — vision calls always use the vision-role model, thinking calls always use the thinking-role model, independently, with no cross-talk. Confirmed in code, not assumed.
- **Scope note:** no scenario in A.1–C.9b actually exercises an image-attach flow, so this decision affects the *configuration* only — it doesn't add, remove, or reclassify any scenario.
- Set these once, globally (Integrations), and once more via the assistant panel's own kebab menu (provider = Local (Ollama), Thinking model = `marksverdhei/normistral-it:7b`, Vision model = `qwen2.5vl:3b`) at the very start of the run — both are `localStorage`-backed device settings, so they persist across every "New chat" reset for the rest of the run without needing to be reselected per scenario.

## 2. Environment setup (prerequisite, before any scenario runs)

The live dev instance currently has only the original "food-menu" catalogue (55 products, 2 active discounts, 0 events) — the `AutoDeler` seed catalogue every scenario in the source report depends on (Dekk/Bremser/Motorolje/Batterier/Lydanlegg/Interiør/Tilbehør categories, two same-named "Frontlys" products, three "LED …" products with blank Norwegian names, "Michelin Vinterdekk 205/55R16" at 20% discount, a blank second catalogue, and the event "Bilutstilling på tunet") was deleted in that report's own cleanup step and no longer exists.

1. **Re-seed AutoDeler** by re-running `QA/scratchpad/qa/seed.mts` (the exact script the source report used to build this fixture — no need to re-derive the data by hand).
2. **Re-measure the actual baseline right after seeding** — don't trust hardcoded numbers from either prior report, since the environment has visibly drifted (55 products / 2 discounts now vs. 54 / 1 in the original 2026-08-02 report). Expected ballpark once AutoDeler is back: ~109 products store-wide (55 existing + 54 AutoDeler), 3 active discounts (2 pre-existing food-menu discounts + AutoDeler's own Michelin Vinterdekk), 1 event, 2–3 catalogues depending on whether the blank one is counted. Treat this as a starting estimate to verify via the admin UI immediately before grading any count/list scenario in Section A, not as a number to trust blindly.
3. **Resolve the source report's own unexplained "Pulled Pork (Wraps)" 4th result** from A.9a's LED filter (a product with no "LED" in its name matched a `name contains "LED"` filter) via a quick admin-UI/data check once seeding is done. If it's a real, reproducible data condition (a stray tag, a description field, etc.), understand it ahead of time so it doesn't get mis-graded as a new normistral-specific hallucination.
4. **Do not delete AutoDeler at the end of this run.** Both prior reports tore their seed catalogues down as part of cleanup; this run keeps `AutoDeler` in place so a future re-test can skip re-seeding. Cleanup still applies to whatever individual *scenarios* create on top of that seed (see §6) — only the seed catalogue itself is exempt from the "restore to pre-run state" step.
5. **Run Playwright headed, not headless.** `QA/scratchpad/qa/harness.mts:80` currently hardcodes `chromium.launch({ headless: true })`. Change this to `headless: false` before running anything, so the browser window is visible throughout the pass. (Still requires asking before actually starting the run — this plan only prepares for that ask.)

## 3. What "fresh session" means, mechanically

"Fresh session" = calling `flow.newChat()` — the assistant panel's own "New chat" button — inside one continuously-running browser window. It is **not** a new browser instance and does not require relaunching Playwright between scenarios.

This distinction matters because `localStorage` (ingestion posture, per-chat model overrides, the conversation log) is scoped to the browser profile, not to the chat transcript — it survives every "New chat" click precisely because the browser session itself never ends. That's what makes the B.11a → B.11b posture round-trip work correctly without needing the two scenarios to share a chat session (see §5).

Two other things "New chat" does *not* affect, confirmed by reading the source: closing/reopening the assistant panel (the X button or the sparkle icon) only hides it visually — the component stays mounted and the transcript is untouched; navigating between admin pages doesn't reset it either. Only "New chat" (or a full page reload/logout) starts a genuinely empty transcript.

## 4. Retry-once rule

If a scenario's own precondition — a draft actually reaching the review form or the quality gate, a clarification actually surfacing, a batch actually staging — doesn't materialize on the first attempt, **retry once more in a fresh session** before recording the scenario as N/A. Keep both attempts' trace notes in the report (labeled attempt 1 / attempt 2). Only mark N/A if the retry also fails to reach a testable state. This replaces the source report's frequent "N/A — not reached (session-degradation pattern)" outcome, which was largely an artifact of the old long-session methodology this plan is specifically designed to eliminate — under fresh sessions, most of those should either pass, fail cleanly, or need at most one retry.

## 5. Key correction to the "which scenarios need a shared session" question

Going through the source report's actual scenario text (not just guessing from scenario names) narrows the shared-session need considerably from an initial hypothesis:

- **C.1b does *not* need to share a session with C.2/C.3/C.4/C.5/C.7/C.9a/C.9b.** Each of those stages **its own** new batch (C.2: "Skinnhotell og Feltlager" categories; C.3: "Card Test A/B/C" batteries; C.4: "Bosch/Varta"; C.5: "Pioneer/Sony"; C.7: "Sommertreff/Vintertreff" events; C.9a: "Motorolje" 3-record; C.9b: "Dekk Seks A–F" 6-record) — none of them reuse C.1b's batch. The underlying principle still holds (a batch's own unconfirmed cards *are* session-scoped state), but that scoping is entirely intra-scenario: create-then-act, all within one scenario's own single fresh session. C.9b's own documented bug in the source report — C.8's leftover unconfirmed draft bleeding into C.9b's gate purely because they shared one long session — is itself the evidence for why these should be fresh and separate rather than clustered.
- **The same logic applies to B.2/B.3a, B.2/B.3b, and B.4** (three separate attempts at triggering the same category of clarification, each needing its own freshly-asked ambiguous request, since a clarification can't be re-answered once it's been resolved) **and to B.5a/B.5b/B.5c and B.6's Confirm/Edit paths** (five separate freshly-staged drafts under the quality gate, since a draft is consumed once acted on).
- **B.11a → B.11b does not need a shared session either.** Ingestion posture is confirmed (via `AssistantPanel.tsx:226`, `useLocalStorage('admin.assistantIngestionPosture', ...)`) to be a persistent, device-level setting — it is not reset by "New chat" and doesn't need to be, so testing the toggle's revert to Automatisk in B.11b works correctly even in a brand-new session, as long as B.11a ran first in wall-clock order.

Net effect: **almost every scenario is independently fresh.** The only genuine *intra-scenario* multi-turn continuity is A.10's own two-turn pronoun follow-up. The only genuine *inter-scenario* constraint is a **data** dependency, not a session dependency: B.1's created product must exist before B.9 (update) and B.10 (delete) can target it.

## 6. Full scenario classification (A.1 – C.9b)

Every ID below is reused verbatim from the source report. "Fresh" means: click New chat, then run the scenario's own turn(s) in that one session, before moving to the next scenario.

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
| A.9a | Fresh | Bilingual LED filter, Norsk UI; persisted data only. Run before A.9b (see §7). |
| A.9b | Fresh | Bilingual LED filter, English UI; persisted data only, independent of A.9a's session (just needs the UI language switched). |
| A.10 | Fresh, own 2-turn continuity | The scenario's entire point is pronoun/ordinal resolution to the prior turn's own list — its two turns ("list Bremser products" → "how much is the first one?") must stay in the one fresh session they start in, but this scenario doesn't share with any other. |
| A.12a | Fresh | Event count/list under Norsk UI; persisted data only. |
| A.12b | Fresh | Event count/list under English UI; persisted data only, independent of A.12a. |
| A.extra | Fresh | Catalogue/category count; persisted data only. |

### Section B — Single-record ingestion

| ID | Session | Reason |
| --- | --- | --- |
| B.1 | Fresh | Single create request, no dependency on prior turns. Its own created product is a data (not session) dependency for B.9/B.10 — see §7. |
| B.2/B.3a | Fresh, own 2-turn continuity | Ask the ambiguous create request, then tap the clarification option that's still open — both must be in the same fresh session, but not shared with B.2/B.3b or B.4. |
| B.2/B.3b | Fresh, own 2-turn continuity (separate from B.2/B.3a) | Re-ask an equivalent ambiguous request, then answer by typing in chat — a clarification can't be re-answered once resolved, so this needs its own freshly-staged instance. |
| B.4 | Fresh, own 2-turn continuity (separate from both above) | Re-ask again, then give a deliberately unclear answer to the still-open clarification — same reasoning as B.2/B.3b. |
| B.5a | Fresh, own 2-turn continuity | Stage a low-confidence draft under Safe posture, then click "Se detaljer" on the still-open gate. |
| B.5b | Fresh, own 2-turn continuity (separate from B.5a) | Re-stage a fresh draft, then click "Prøv igjen" — the gate from B.5a is already dismissed/consumed. |
| B.5c | Fresh, own 2-turn continuity (separate from B.5a/b) | Re-stage a fresh draft, then click "Avbryt". |
| B.6 (Confirm path) | Fresh, own 2-turn continuity | Stage a fresh draft under the gate, then Confirm through it. |
| B.6 (Edit path) | Fresh, own 2-turn continuity (separate session from the Confirm path) | Stage a fresh draft under the gate, then Edit through it — the Confirm-path draft no longer exists once confirmed. |
| B.7 | Fresh | Single create request testing the price/discount display fix; no dependency on prior turns. |
| B.8 | Fresh | Single create request testing category custom-field fabrication; no dependency on prior turns. |
| B.9 | Fresh (data dependency, not session) | Needs the real product B.1 created to already exist — persisted app data, not chat memory. Run after B.1 in wall-clock order (see §7 fallback if B.1 doesn't actually create it). |
| B.10 | Fresh (data dependency, not session) | Deletes the same real record B.9 updated — run after B.9. |
| B.11a | Fresh | Force posture to Av via the kebab override, then stage a draft to observe the tagged draft+verify pair. |
| B.11b | Fresh (independent of B.11a's session) | Posture is a persistent device setting (`localStorage`), not session state, so reverting to Automatisk and re-testing works in a brand-new session — only needs to run after B.11a in wall-clock order. |
| B.12 | No chat session involved | Manual admin-form creation, entirely outside the assistant. |

### Section C — Batch ingestion

| ID | Session | Reason |
| --- | --- | --- |
| C.1a | Fresh | Natural non-imperative phrasing check; single turn, no dependency. |
| C.1b | Fresh | Explicit-imperative batch create; the source report's own failure here was caused by stale draft context bleeding in from an unrelated earlier turn in the same long session — a fresh session directly tests whether that goes away. |
| C.2 | Fresh, own 2-turn continuity | Stage its own ambiguous batch-create request, then engage with whatever clarification surfaces, same session. Not shared with C.1b. |
| C.3 | Fresh, own 2-turn continuity | Stage its own new batch, then exercise Confirm/Edit/Remove per card, same session. Not shared with C.1b. |
| C.4 | Fresh, own 2-turn continuity | Stage its own new batch (one card with an invalid discount), then check Confirm all is disabled while per-card actions still work, same session. |
| C.5 | Fresh, own 2-turn continuity | Stage its own clean batch, then click Confirm all, same session. |
| C.6 | Fresh, own 2-turn continuity | Stage its own batch, then click Cancel all, same session. |
| C.7 | Fresh, own 2-turn continuity | Stage its own events batch, then check for cross-record field contamination between its own cards, same session. |
| C.8 | Fresh | Single-record message; confirms no false batch UI appears. |
| C.9a | Fresh, own 2-turn continuity | Stage its own 3-record batch under Safe posture, then check the gate, same session. |
| C.9b | Fresh, own 2-turn continuity | Stage its own 6-record batch under Safe posture, then check the gate's "…og N til" overflow line — explicitly its own fresh session so C.8's leftover draft (the exact contamination the source report documented) cannot bleed in. |

## 7. Run order

Any order is fine for the scenarios tagged plain "Fresh" above — group them however is operationally convenient (e.g. straight through A → B → C). Two things must be respected regardless of grouping:

1. **B.1 before B.9 before B.10** (data dependency: B.9 updates the product B.1 creates, B.10 deletes it). If B.1's create doesn't actually go through under normistral (it failed under gemma3:4b in two different ways across the two prior runs), seed the target product manually via the ordinary admin form before running B.9/B.10, so those two scenarios can still be graded on update/delete mechanics rather than blocked by B.1's own creation-quality result.
2. **A.9a before A.9b.** A.9a establishes whether the bilingual-fallback filter mechanism works at all on this model; if A.9a itself fails, A.9b's result should be read in that light rather than graded as an independent English-UI-only regression.
3. **B.11a before B.11b**, to test the posture-override round-trip (Av → Automatisk) in the intended direction.

No other scenario has an ordering requirement — every one of the "own 2-turn continuity" rows above is fully self-contained (its own fresh session covers its own creation + follow-up action).

## 8. Diagnostic addendum (does not affect grading)

After the fresh-per-scenario pass, optionally run scenarios A.1–A.6 once more back-to-back in a single continuous session (mirroring the source report's original long-session methodology), purely to observe whether `normistral-it:7b` shows the same kind of mid-session tool-call misclassification degradation `gemma3:4b` did. This does **not** affect any scenario's PASS/PARTIAL/FAIL grading in §6 — it's a separate, clearly-labeled short section answering one question: does this model need the fresh-session policy as a permanent QA practice, or was that specific to gemma3:4b? Skip this section entirely if time is limited; it's a bonus data point, not a requirement.

## 9. Report format

Match both prior reports' format so results are directly comparable:

- **Per scenario:** Status (PASS/PARTIAL/FAIL/N/A), what happened, trace notes (which steps fired, what the model actually returned), screenshot reference.
- **Retry-once rule (§4):** when a retry happened, keep both attempts' trace notes, labeled attempt 1 / attempt 2.
- **Secondary observations:** a scenario may carry a secondary note distinct from its primary graded status — e.g. A.10 graded on pronoun resolution specifically, with any unrelated category-scoping issue visible in the same trace called out separately rather than silently folded into or ignored by the primary grade.
- **Cleanup table:** every record actually created by a *scenario* (not the AutoDeler seed itself, which is being kept per §2.4) — product/category/event name, which scenario created it, how it was deleted.
- **Final verification:** ground-truth counts read directly from the admin UI (not the assistant's own self-report) confirming the store is back to "food-menu baseline + intact AutoDeler seed" with no scenario-created leftovers.
