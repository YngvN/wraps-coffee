# Test plan: [what's being tested — e.g. "re-run the assistant QA pass on &lt;model&gt;, fresh-session-by-default"]

**Status:** Plan only — not executed. Do not run any Playwright/browser automation from this plan without asking first (per this repo's CLAUDE.md).

**Source scenarios:** `[most recent report in QA/Reports/]` — reuse its own scenario IDs/phrasing verbatim, don't re-derive wording.

## Summary

*A short, scannable overview — a few bullets, written so someone can grasp the whole plan without reading the rest. Fill in before Methodology, not after.*

- **Model(s) under test:** [provider; thinking-role tag; vision-role tag if different, and why]
- **Session policy:** [fresh-per-scenario (default) / continuous / mixed — one line on why]
- **Environment:** [reusing existing seed fixture / re-seeding from scratch — current baseline counts if known]
- **Scope:** [N scenarios from the source report; any scenarios added/dropped/changed and why]
- **What changed since the last run:** [model, methodology, environment — whatever's actually different this time]
- **Headline things to watch for:** [1-3 bullets — a known weak spot from a prior run worth specifically re-checking, a new risk this model/config introduces, etc.]

## Methodology

*The durable, reusable rules — copy these forward from the last plan unless something genuinely needs to change. Don't re-litigate these from scratch each time.*

1. **What "fresh session" means mechanically.** "Fresh session" = calling the panel's own "New chat" button inside one continuously-running browser window — not relaunching Playwright/Chromium between scenarios. `localStorage`-backed settings (ingestion posture, per-chat model overrides, conversation log) are scoped to the browser profile, not the chat transcript, so they persist across "New chat" clicks. Confirm this is still true by re-reading `useLocalStorage`/`AssistantPanel`'s own state declarations if the assistant code has changed materially since the last run.
2. **Session-classification principle.** A scenario needs a shared/continuing session only when what's being tested is the model's own in-conversation memory or the chat UI's own not-yet-confirmed state — pronoun/reference resolution, reacting to the assistant's own last reply, answering a still-open clarification, correcting a just-proposed unconfirmed draft, per-card actions on an unconfirmed batch. A scenario that only needs a *real record to already exist* does not need a shared session — persisted app data outlives the session that created it. Classify every scenario against this principle by reading the source report's own text for it, not by guessing from the scenario's name — a batch/clarification/gate scenario usually stages *its own* fresh state rather than reusing a prior scenario's.
3. **Retry-once rule — use the app's own retry affordance when one exists, fall back to a fresh session when it doesn't.** There is exactly one in-app retry mechanism today: the Draft-Quality Gate's "Prøv igjen" button (`AssistantDraftQualityGate.tsx`, shown only under Safe/Automatisk posture once a draft has actually reached the gate) — it restores the original message into the composer, in the *same* session, for a real resend. When the failure is specifically "a draft reached the gate but its content looks wrong/low-quality," retry with that button first — it's the faithful, same-session retry a real admin would use. When the failure is that nothing ever reached a testable state at all (no gate, no clarification, no batch, an empty reply, a timeout), there's no button to click — the precondition itself never fired — so retry by starting a fresh session and resending the same message instead. Either way, keep both attempts' notes in the report and only mark the scenario as failed-to-reach-that-state if the retry (whichever kind) also comes up empty.
4. **Diagnostic addendum (optional, doesn't affect grading).** After the fresh-per-scenario pass, optionally re-run a handful of Section A scenarios back-to-back in one continuous session, purely to check whether this model shows the kind of mid-session tool-call degradation a prior run may have documented for a different model. Label it clearly as not affecting any scenario's PASS/FAIL grade.
5. **Cleanup policy.** Keep the seed fixture in place at the end (don't tear it down) so a future re-test doesn't need to re-seed from scratch. Only clean up records individual scenarios created on top of it. Verify every "this was created" claim against real data (`server/data/*.json` or the admin UI) before writing it into the cleanup table — a script's own "confirmed=true" flag can be a false positive if it only checked that a review panel existed, not that clicking Confirm actually persisted (a disabled button click is a silent no-op).
6. **Execution mode.** Headed (visible) Chromium, not headless.
7. **Known environment gotchas** — carry forward anything discovered in a prior run that will recur: [e.g. iCloud Drive sync conflict-duplicating `QA/scratchpad/` mid-run under heavy concurrent writes — sync noise, not data loss, don't panic-diagnose as a script bug; a stray substring-collision false-positive in a name-`contains` filter; etc. Delete this bracket and list what's actually still relevant.]

## Model & vision configuration

- **Thinking model:** `[exact installed tag]`, set via Integrations' "Custom" field (or preset tier if one exists for it).
- **Vision model:** `[exact installed tag]` — confirm capability first: `ollama show <tag>` should list `vision` under Capabilities before assuming a tag can serve this role. If the thinking-role tag can't also serve vision, decide explicitly (state the choice here, don't silently skip) whether the vision-dependent scenario runs against a different real vision-capable model, or is marked out of scope.
- **Scope note:** [does any scenario in this run's scenario list actually exercise an image-attach flow? If not, say so — the vision choice is configuration-only and doesn't affect scenario selection.]

## Environment setup (prerequisite, before any scenario runs)

- [Re-seed via `QA/scratchpad/qa/seed.mts` if the fixture doesn't currently exist — or confirm it does and skip.]
- [Re-measure the actual current baseline right after seeding/confirming — don't trust hardcoded numbers from a prior report; environment drift between runs is expected.]
- [Any unresolved artifact from a prior report worth checking before this run, so it isn't rediscovered mid-grading and mis-attributed to this model.]

## Full scenario classification

*One row per scenario ID from the source report, reused verbatim. Fresh vs. shared + a one-line reason citing the principle above.*

| ID | Session | Reason |
| --- | --- | --- |
| [ID] | Fresh / Shared (with which) | [one line] |

## Run order

*Any order is fine for plain "Fresh" scenarios. Call out explicitly:*
- Any genuine **data** dependency (not session) — e.g. an update/delete scenario needs an earlier create scenario's own record to actually exist; note the fallback if that create doesn't succeed this time (seed the target manually so the later scenario can still be graded on its own merits).
- Any ordering needed to read one scenario's result in light of another's (e.g. run the "does the fallback mechanism work at all" scenario before the "does it work in this other language/direction" one).

## Report format

Follow `QA/templates/qa-test-report-template.md`. Same PASS/PARTIAL/FAIL/N/A/ERROR status vocabulary, trace notes, screenshot reference, key-findings summary, and cleanup table as prior reports, so results stay comparable across runs.

## Verification

- Every ID from the source report's own scenario list appears exactly once in the classification table above.
- The model/vision decision, environment setup, and report-format sections are all filled in, not left as brackets.
- Nothing in this plan tells anyone to execute Playwright/browser automation without asking first.
