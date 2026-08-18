<!-- Cycle plan. Combines QA/templates/base/qa-test-plan-base.md (Base 1) + QA/templates/project/qa-test-plan-project.md (Project 1). Status: Plan only — not executed. Do not run Playwright/browser automation from this plan without asking first, and Playwright approval is separate from plan approval. -->

# Test plan: `screenPane` assistant entity — Local `qwen3:4b` — 2026-08-14

**Template version:** Base 1 + Project 1
**Status:** Plan only — not executed.

## Summary

- **Model(s)/configuration under test:** Local (Ollama) provider, thinking role `qwen3:4b`. No vision role — this bank has no image-attach scenario.
- **Session policy:** Mixed, fresh-per-scenario by default. SP.10, SP.21, SP.23, SP.25, SP.42 need a shared session (conversation memory or reacting to unconfirmed state) — see Full scenario classification.
- **Environment:** Isolated dev server on custom ports (`WS_PORT=4010`, vite `--port 5183`), reusing the real seed screens "Screen 2" and "Screen 3 (verify)" — this entity's candidates are real production panes, not a disposable `[test]`-prefixed fixture.
- **Scope:** 46 rows — SP.1–SP.19 (the 2026-08-14 pass, re-run against `qwen3:4b` only this time) plus SP.20–SP.44 (22 new scenarios, SP.43 split into 3 posture sub-rows), all now folded into `server/assistant/entities/screenPane.qa-scenarios.md`'s own table.
- **What changed since the last run:** Single model this cycle (`qwen3:4b` only, not paired with `qwen3:8b`); the scenario bank grew from 19 to 46 rows; two columns added to the bank's own table (**Model tier**; **Regression flag** now also marks SP.24/26/33/43 High).
- **Headline things to watch for:**
  - SP.9 and SP.11 are regression-flagged from real, previously-fixed bugs (candidate-matching punctuation, `normalizeSlot` field loss) — any failure there is high-priority, not a fresh diagnosis.
  - SP.24, SP.26, SP.33, SP.43 (new, marked High) are data-integrity/wrong-live-state risks, not UX gaps.
  - SP.1, SP.3, SP.13 are flagged **Tier-sensitive** — `qwen3:4b` is expected to diverge from `qwen3:8b`/Claude on leave-it-null-under-uncertainty behavior there. Worth an explicit note in the report even on a plain PASS, since this is a single-tier run with no sibling result to compare against yet.

## Methodology

*Base template's 12 rules + Project template's rules 13–17, merged into one list per the base template's own instruction.*

1. **Step 0 — ask before assuming anything.** Answered below.
2. **Session-classification principle.** A scenario needs a shared session only when it tests the model's own in-conversation memory or reacting to not-yet-confirmed UI state; a scenario that only needs a real record to exist does not. Applied in the classification table.
3. **Retry-once rule.** Use the app's own retry affordance ("Prøv igjen" on the Draft-Quality Gate) when a draft reached a reviewable state but looks wrong; fall back to a fresh session + resend when nothing reached a testable state at all.
4. **Diagnostic addendum.** Not requested this cycle — skipped (see Step 0).
5. **Cleanup policy.** Keep the seed screens in place; restore every touched pane to its exact original state (see Test data hygiene below) rather than tearing down the fixture itself.
6. **Retention policy.** Once this cycle's report is finished and approved, delete this plan document. Once this cycle's own screenshot folder is in place, delete the previous cycle's screenshot folder.
7. **Harness-vs-reality cross-check.** For any scenario the harness marks FAIL, check trace/screenshot evidence before trusting the DOM-read verdict.
8. **Root-cause consolidation.** When 2+ scenarios share a failure, name one suspected root cause in Key Findings rather than listing separate findings.
9. **Known-deferred-scenario carve-out.** None of this bank's scenarios test unshipped functionality — no deferred scenarios this cycle.
10. **Phase attribution.** Not used — this project doesn't label `screenPane` work in phases.
11. **Execution mode.** Headed (visible) browser, not headless.
12. **Cadence.** Event-driven — this cycle is triggered by the bank's own expansion (22 new scenarios) plus re-checking the two regression-flagged rows on a single clean tier.
13. **"Fresh session" mechanics.** Click the assistant panel's own "New chat" inside one continuously-running browser window — not relaunching Playwright/Chromium. `localStorage`-scoped settings (posture, model overrides) persist across "New chat" regardless.
14. **Reuse `QA/scratchpad/qa/harness.mts` as-is** before writing new scenario helpers — see Known harness state below.
15. **iCloud sync gotcha.** This repo lives under `~/Desktop` (iCloud-synced) — a heavy concurrent write burst into `QA/scratchpad/` can spin off a conflict-duplicate folder mid-run. Sync noise, not data loss; verify via mtimes before assuming a script bug.
16. **Concurrent-turn safety** doesn't apply this cycle — no Section E rows are in scope.
17. **Trace `checks[]` array** — not directly relevant to this entity-specific cycle (no Section K rows in scope), but still worth reading from the trace export for any scenario where a `postChecks/` verdict might explain unexpected behavior (e.g. SP.33's kind-switch fields).

## Known deferred scenarios

None — every scenario in this cycle's scope (SP.1–SP.44) tests already-shipped `screenPane` functionality.

## Step 0 — answered

1. **Model(s):** Local/Ollama, thinking role `qwen3:4b` only. No vision role needed (confirmed: no scenario in SP.1–44 references an uploaded image).
2. **Seed fixture:** Reuse the real seed screens "Screen 2" and "Screen 3 (verify)", as the 2026-08-14 pass did — not the `AutoDeler` fixture (that's for other entities).
3. **Diagnostic addendum:** Not requested — skipped.

## Model & configuration

- **Configuration under test:** Local (Ollama), thinking role `qwen3:4b`.
- **Capability constraints confirmed:** N/A — single-role model, no vision capability needed this cycle.
- **Scope note:** No scenario in SP.1–44 is configuration-sensitive beyond the model tier itself.

## Known harness state

*Carried forward from the project template — read before writing a new harness helper.*

- `login()` sets Norwegian UI by default; only switch to English explicitly for scenarios that need it (SP.27 needs both).
- `sendChat`'s trace capture reads the clipboard export (`captureLatestTraceViaClipboard`), capped at 500 chars/field.
- `reachBatchReview` checks the Draft-Quality Gate before batch-review cards.
- `closeModelMenu` waits for the transcript to reappear, not just for the click to resolve.
- None of these are specific to `screenPane`, but SP.16/SP.27's UI-language checks and SP.24's Draft-Quality-Gate interaction are exactly the paths these fixes cover.

## Environment setup

- Start an isolated dev server, not the default-port instance:
  - `WS_PORT=4010 npx tsx watch server/index.ts` (server)
  - `VITE_WS_PORT=4010 npx vite --host --port 5183` (client — `VITE_WS_PORT` must match `WS_PORT`; confirm at execution time that Vite actually picks up the shell-exported var, since no `.env` file sets it currently)
  - Harness: `QA_BASE_URL=http://localhost:5183`
- Confirm "Screen 2" and "Screen 3 (verify)" still exist with the same pane/stage layout as the 2026-08-14 pass — re-measure, don't trust that report's numbers.
- Confirm which real screen has exactly 3 stages (for SP.34) and which real screen/pane is single-stage (for SP.35) — read live, don't guess from the prior report.
- **Before touching anything:** take a same-day backup (Settings → Backup) of both screens' current state — this run's own restore baseline, not the 2026-08-14 backup.
- Confirm no admin-authored draft is already pending on either screen (would confound SP.12/SP.24's own draft-collision setup).
- No Claude API key is configured in this environment — Local/Ollama is the only testable provider; don't attempt to configure Claude.

## Full scenario classification

| ID | Session | Reason |
| --- | --- | --- |
| SP.1 | Fresh | Single-turn styling; Tier-sensitive |
| SP.2 | Fresh | Single-turn HTML |
| SP.3 | Fresh | Single-turn allowlist rejection; Tier-sensitive |
| SP.4 | Fresh | Single-turn HTML-tag rejection |
| SP.5 | Fresh | Toggle-off schema gate, single turn |
| SP.6 | Fresh | Single-turn, posture `full` |
| SP.7 | Fresh | Single-turn, posture `auto`/`safe` — regression-sensitive (finding #2) |
| SP.8 | Fresh | Single-turn, cross-screen ambiguity |
| SP.9 | Fresh | Punctuation-phrasing variants, each its own turn — regression-flagged (findings #1, #3) |
| SP.10 | Shared (own 2 turns) | Compares live-write vs. draft-staging path on one pane |
| SP.11 | Fresh | Single bundled message — regression-flagged (finding #4) |
| SP.12 | Fresh | Needs a seeded admin draft first (data precondition, not session) |
| SP.13 | Fresh | Multi-stage apply, single turn; Tier-sensitive |
| SP.14 | Fresh | Posture `full`, no value named |
| SP.15 | N/A | Reuses SP.3/SP.4 evidence — no separate run |
| SP.16 | Fresh | Edit-fallback UI check |
| SP.17 | N/A (code inspection) | Direct schema check, no model call |
| SP.18 | Fresh | Needs SP.6's staged content to exist first (data precondition) |
| SP.19 | Fresh | Stage-specific single turn |
| SP.20 | Fresh + manual mid-scenario edit | Manual edit in a second tab between candidate-list and pick — no conversation memory needed |
| SP.21 | **Shared** | Referent drift needs conversation memory across an unrelated intervening turn |
| SP.22 | Fresh | Single message, internal contradiction |
| SP.23 | **Shared** | Correction must follow a real confirm in the same conversation |
| SP.24 | Fresh | Needs a seeded admin draft first (same precondition as SP.12) |
| SP.25 | **Shared (own 2 turns)** | Two sequential assistant content changes to the same screen |
| SP.26 | Fresh | Single message, mixed styling + content |
| SP.27 | Fresh | Needs an existing content-commit scenario's output (e.g. SP.6/11/26); checked in both UI languages |
| SP.28 | Fresh | Admin-only CSS property, single turn |
| SP.29 | Fresh | Allowlisted-but-destructive property, single turn |
| SP.30 | Fresh | Custom-property rejection, single turn |
| SP.31 | Fresh | Needs a pane with existing `customCss` (reuse SP.1's output, or seed fresh) |
| SP.32 | Fresh | Placement-as-positioning, single turn |
| SP.33 | Fresh | Posture `full`, kind switch with orphaned/unset fields |
| SP.34 | Fresh | Needs the real 3-stage screen confirmed in Environment setup |
| SP.35 | Fresh | Needs the real single-stage screen/pane confirmed in Environment setup |
| SP.36 | Fresh | Needs a previously-pinned pane (reuse SP.13's result, or seed fresh) |
| SP.37 | Fresh | Routing negative: catalogue, not `paneSlots` |
| SP.38 | Fresh | Routing negative: display-machine, not pane |
| SP.39 | Fresh | Routing negative: screen-level field |
| SP.40 | Fresh | Wholesale request, one candidate/draft |
| SP.41 | Fresh | Restore decline, points at Settings → Backup |
| SP.42 | **Shared** | "Undo what you just did" needs a real prior action as its referent, same conversation |
| SP.43-safe | Fresh | Content-as-instruction, posture `safe` |
| SP.43-auto | Fresh | Content-as-instruction, posture `auto` |
| SP.43-full | Fresh | Content-as-instruction, posture `full` |
| SP.44 | Fresh | Field-name-shaped literal text, single turn |

## Run order

- SP.12 and SP.24 share the admin-authored-draft precondition — seed it once, run both back-to-back on that draft, then clear it before continuing so it doesn't confound later scenarios.
- SP.31 runs after SP.1 (or seeds its own `customCss` first) so there's something real to clear.
- SP.36 runs after SP.13 (or seeds a pinned pane first) so there's something real to un-pin.
- SP.18 and SP.27 read the result of an earlier content-commit scenario — run after SP.6 (or after SP.11/26), not in isolation.
- SP.34/SP.35 need the real stage-count check from Environment setup done first.
- SP.9's punctuation-phrasing variants, SP.43's three posture variants, and SP.21/SP.23/SP.25/SP.42's shared-session pairs are the only rows where internal ordering matters; everything else can run in any order.

## Test data hygiene (restore-to-original-state)

Same posture as the 2026-08-14 pass — this bank still has no disposable `[test]`-prefixed fixture, since `screenPane`'s candidates are real production panes:
- Diff every touched pane's content against the fresh same-day pre-run backup taken in Environment setup (not the 2026-08-14 backup).
- Clear every custom CSS/HTML and draft this run creates on "Screen 2" / "Screen 3 (verify)" — including anything SP.12/SP.24's seeded admin draft leaves behind if not already cleared mid-run.
- Cross-check clean (both screens byte-identical to the pre-run backup, no stray drafts) before ending the session — don't trust a script's own "cleaned up" self-report.

## Report format

Follow `QA/templates/base/qa-test-report-base.md`. Save the finished report to `QA/Reports/assistant-qa-report-screenPane-qwen3-4b-2026-08-14.md`. Once that report is approved: update `screenPane.qa-scenarios.md`'s own results table (fill in all 46 rows' **Result** cells) and its "As of ..." header in place, then delete this plan document per the retention policy.

## Verification

- Every ID SP.1–SP.44 (with SP.43's three posture sub-rows, 46 total) appears exactly once in the classification table. ✓
- SP.9 and SP.11 are explicitly called out as regression-flagged, not graded as fresh diagnoses. ✓
- SP.24/26/33/43 are marked High in the scenario bank itself (`screenPane.qa-scenarios.md`), not just in this plan. ✓ (done pre-execution)
- The Model-tier column exists in the scenario bank with SP.1/3/13 flagged. ✓ (done pre-execution)
- Environment setup uses `WS_PORT=4010`/`--port 5183`, not the default ports. ✓
- Nothing in this plan authorizes running Playwright/browser automation without asking first — that approval is separate from approving this plan. ✓
