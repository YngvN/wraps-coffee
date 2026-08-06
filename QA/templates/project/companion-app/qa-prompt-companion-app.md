<!-- Companion-app template version: 1 (extracted 2026-08-06 from the display-pairing QA cycle that shipped alongside ADHDisplay Companion + PIN pairing — see QA/Reports/qa-report-display-pairing-2026-08-06.md for the cycle this was distilled from. This is a sibling of QA/templates/project/qa-prompt-project.md, not a replacement — that file's own assistant-chatbox/model-comparison methodology (Step 0 model selection, session-continuity-for-conversational-memory, the Draft-Quality-Gate retry button) doesn't apply here; this feature is deterministic REST routes + a settings-style UI, not LLM output. -->

# Companion-app prompt: display pairing / ADHDisplay Companion QA test cycle

Use together with `QA/templates/project/companion-app/qa-test-plan-companion-app.md`. Covers the server-side PIN pairing flow (`POST /display-machines/pairing-heartbeat`, `POST /display-machines/:machineID/approve`, the `mobile`/`needsPairing` gate on `POST /display-machines/heartbeat`, the extended `GET /server-info`) and the Display Manager UI built on it (pairing-requests section, approve flow, QR pairing modal, `mobile` badge).

**When to run this cycle:** event-driven — whenever the pairing routes (`server/index.ts`'s "Display pairing" section), `DisplayManagerView.tsx`, `src/types/displayMachine.ts`'s `DisplayPairingRequest`, or `adhdisplay-companion/src/lib/pairing.ts`/`qr.ts` change. Not a fixed schedule.

Create a test plan for this cycle. **Do not execute any tests yet — only produce the plan** (ask before running any curl/fetch device-simulation calls *and* separately before any Playwright/browser automation — this project's own standing convention, see CLAUDE.md's Testing section).

## Step 0 — ask before assuming anything

Before doing any research or writing anything, ask (via `AskUserQuestion`, don't guess):

1. **Is `npm run dev` (or `preview`) already running?** If so, this cycle runs against the user's own already-live process (real data, not a disposable fixture) rather than starting a second one — starting a duplicate will fail on port conflicts anyway. If a live process is found unexpectedly (via `lsof -nP -iTCP:4000,4173,5173 -sTCP:LISTEN`) that the user didn't mention, say so explicitly before proceeding — don't silently treat it as yours.
2. **OK to test against real, live data?** `server/data/admin-displayMachines.json`/`admin-displayPairingRequests.json` aren't a disposable fixture like the assistant workflow's `AutoDeler` catalogue — they're the user's actual devices. Confirm the byte-identical-diff-afterward cleanup bar (see the plan template's own Methodology) is acceptable before touching anything.
3. **Should the real ADHDisplay Companion app be used, or curl/fetch-simulated?** As of this template's own writing, the Expo/React Native app can't run in a sandboxed agent environment (no simulator, no device, no Expo Go). Default: curl/fetch replaying exactly what `adhdisplay-companion/src/lib/pairing.ts` sends (see the plan template's own Device simulation section) — confirm this is still the case, or that a real device/simulator has since become available, before assuming the default.
4. **OK to temporarily shrink `PAIRING_PIN_TTL_MS`/`PAIRING_RATE_LIMIT_WINDOW_MS` in `server/index.ts` for fast expiry/rate-limit-recovery testing?** See the plan template's own Methodology for the exact technique (inline `QA-TEMP` marker, revert-and-diff at the end). Waiting out the real 10-minute values instead is the alternative if the user would rather not have `server/index.ts` edited mid-cycle, even temporarily and revertibly.

Don't proceed past this step without answers.

## What to reuse without re-deriving

- **Standing scenario bank:** `QA/templates/project/companion-app/qa-test-plan-companion-app.md`'s own scenario table (S1–S26 server-route, U1–U7 UI) — reuse IDs/phrasing verbatim from the most recent report in `QA/Reports/` matching `qa-report-display-pairing-*.md`, the same way the assistant workflow reuses its own prior report's scenario list.
- **Device-simulation technique, TTL/rate-limit shrink-and-revert technique, concurrency-probe technique, QR-decode technique, cleanup-via-synced-key-write technique:** all in the plan template's own Methodology — don't re-derive any of these from scratch.
- **Cleanup/verification bar:** byte-identical diff of `admin-displayMachines.json` against a pre-test snapshot, empty `admin-displayPairingRequests.json`, explicit session logout — same bar the source cycle held itself to.
- **Execution mode:** headed (visible) browser for the UI scenarios, matching this repo's own standing QA preference. Ask before running Playwright, and separately before running any curl/fetch device-simulation battery, per CLAUDE.md.

## Deliverable

Produce the plan by combining this file with `QA/templates/project/companion-app/qa-test-plan-companion-app.md`. Save it to `QA/Reports/qa-test-plan-companion-app-<date>.md`.

Once approved (and Playwright/curl execution separately approved), execute it and write the finished report to `QA/Reports/qa-report-display-pairing-<date>.md`, following the source cycle's own report shape (Summary/Methodology notes/per-scenario Request-Status-What-happened/Key findings/Cleanup table, PASS/PARTIAL/FAIL/N/A status vocabulary, every scenario ID unique and used exactly once — verify this before finishing, it wasn't true on the first pass of the source cycle and had to be corrected). Once that report is approved, delete this cycle's own plan document — only the finished report persists, per this repo's own standing QA retention policy.
