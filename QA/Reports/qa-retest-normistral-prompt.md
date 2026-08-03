# Prompt: QA re-test plan — normistral-it:7b, fresh-session-by-default

Copy everything below the line into a new session to have it produce the test plan.

---

Create a test plan for re-running the AI assistant QA pass documented in `assistant-qa-report-claude-2026-08-02.md` (and its sibling `assistant-qa-report-2026-08-02.md`), against a different local model and under a different session-isolation policy. Do not execute any tests yet — only produce the plan (ask before running any Playwright/browser automation, per this repo's CLAUDE.md).

## What changes from the original report

1. **Model:** use `normistral-it:7b` as the Ollama "Tankemodell" (thinking model) instead of `gemma3:4b`. Check whether `normistral-it:7b` is actually a vision-capable tag before assuming it can also serve as "Bildemodell" (vision model) the way the original report reused one tag for both roles — NorMistral is a Norwegian-tuned Mistral text model, so it most likely has no vision capability. If it doesn't:
   - Decide explicitly (don't silently skip) whether the vision-dependent scenario (any image-attach flow) runs against whatever vision model is already configured (keeping `normistral-it:7b` only for the thinking role), or is marked out of scope for this pass. State the choice in the plan.
2. **Session policy — this is the main change.** The original report deliberately ran all ~35 scenarios as one long continuous chat session (see its own Methodology section) specifically to also surface session-length degradation. This new pass should instead **start a fresh chat session immediately before each scenario by default**, so the results measure per-scenario correctness independent of any session-length effect — except for scenarios whose entire point is to test something that only exists *within* an ongoing conversation, which must stay in one continuing session across their own sub-steps.

## How to classify "needs a shared session" vs. "fresh session is fine"

Use this principle, not a guess: a scenario needs to share a session with a prior one **only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state** — pronoun/reference resolution to something said earlier, the assistant reacting to its own last reply, answering a still-open clarification question, correcting a just-proposed (unconfirmed) draft, or per-card actions on a batch that hasn't been confirmed yet. A scenario that merely needs some *real record to already exist* (created by an earlier scenario, in any session) does **not** need a shared session — persisted app data (products, categories, events) outlives the chat session that created it; only the model's own conversational context and any not-yet-confirmed staged draft/batch/clarification are session-scoped.

Go through every scenario in the report (A.1–C.9b) and classify it against that principle. As a starting point based on the report's own descriptions, scenarios that look like they genuinely need a shared/continuing session include: A.10 (pronoun follow-up — explicitly a two-turn "list, then 'how much is the first one'"), B.2/B.3 → B.4 (a clarification must still be open to answer it unclearly), B.5a/b/c and B.6 (each needs its own freshly-staged draft immediately before it — likely 3–4 *separate* fresh sessions, one per button/path tested, not one shared session across all of them), B.11a → B.11b (only if testing the posture toggle's effect on the *very next* turn matters — otherwise the posture setting itself is a persistent per-device config, not session-scoped), C.1b → C.3/C.4/C.5/C.7 (a batch's own unconfirmed cards are chat-session state). Verify each of these against the actual report text rather than trusting this list blindly, and correct it where the report's own description implies otherwise.

## What the plan should contain

- The full scenario list (reuse the report's own IDs/phrasing — A.1 through C.9b — don't re-derive new wording), each tagged: fresh session / shared session (and with which prior scenario), plus a one-line reason citing the principle above.
- Grouped run order: batch the fresh-session scenarios in any convenient order; keep each shared-session cluster together and sequential.
- Carry over the original methodology's environment notes that still apply (shared dev instance, not a clean slate; baseline product/discount counts to grade against; cleanup-every-created-record-afterward requirement) — flag anywhere the fresh-session policy changes how baseline counts should be read (e.g. a scenario no longer needs to account for a prior scenario's own leftover mid-session state, since each fresh session starts from real, current app data anyway).
- Same output/report format as the original (status per scenario: PASS/PARTIAL/FAIL/N/A, trace notes, screenshot reference) so results are directly comparable to the original run.
