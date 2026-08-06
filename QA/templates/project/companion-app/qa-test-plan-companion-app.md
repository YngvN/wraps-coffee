<!-- Companion-app template version: 1 (extracted 2026-08-06 from QA/Reports/qa-report-display-pairing-2026-08-06.md, the display-pairing QA cycle that shipped alongside ADHDisplay Companion + PIN pairing — including its own revision history: the first pass of that report had an internally inconsistent tally, a duplicated scenario ID, and several real coverage gaps (QR payload never decoded, PIN/TTL expiry untested, /approve's auth gate untested, the attempt-counter's cross-match interaction unconfirmed, no concurrency check, no rate-limit-recovery check, no input-validation pass) that a review caught and a follow-up pass closed. This template exists so a future cycle starts from the corrected, complete version of that methodology, not the incomplete first pass. Sibling of QA/templates/project/qa-test-plan-project.md (the assistant-chatbox/model-comparison template) — that file's methodology doesn't apply here (no model/provider axis, no conversational-memory session policy); this file is deliberately self-contained rather than layered on QA/templates/base/qa-test-plan-base.md, since that base file's own rules (session-classification, retry-via-in-app-affordance, diagnostic addendum) are written for LLM-output testing and don't map cleanly onto deterministic REST routes + a settings-style UI. -->

# Companion-app test plan: display pairing / ADHDisplay Companion QA test cycle

**Companion-app template version:** 1
**Status:** Plan only — not executed. Do not run curl/fetch device-simulation calls or Playwright/browser automation from a plan built on this template without asking first (see `qa-prompt-companion-app.md`'s own Step 0).

**Source cycle:** `QA/Reports/qa-report-display-pairing-2026-08-06.md` — reuse its own scenario IDs/phrasing verbatim (or the most recent later report matching `qa-report-display-pairing-*.md`, if one exists) rather than re-deriving wording.

## Summary

*Fill in before Methodology, not after — a few bullets so someone can grasp the whole plan without reading the rest.*

- **Feature under test:** [pairing routes / Display Manager UI / both — state which, and whether this cycle is a full re-run or scoped to what changed]
- **What changed since the source cycle:** [the actual code diff motivating this run — a new route, a changed constant, a UI change, a bug fix worth re-verifying]
- **Device simulation:** curl/fetch replaying `adhdisplay-companion/src/lib/pairing.ts` (default — confirm still true per Step 0 question 3) / a real device or simulator, if one has become available since this template was written
- **Environment:** [already-running npm run dev, reused / freshly started for this cycle] — real, live data, not a disposable fixture
- **Scope:** [N scenarios reused from the source report; any added/dropped/changed and why — most cycles should be "re-run everything the changed code could plausibly affect," not the full 33-scenario battery every time]
- **Headline things to watch for:** [1-3 bullets — a known weak spot from the source cycle worth specifically re-checking, or a new risk the current change introduces]

## Methodology

*Numbered independently of `QA/templates/base/qa-test-plan-base.md` — this file is self-contained (see this file's own header for why the base template doesn't map cleanly onto this feature).*

1. **Step 0 — ask before assuming anything.** See `qa-prompt-companion-app.md` for the exact questions (dev server already running, OK to test against real data, device-simulation approach, OK to temporarily shrink TTL/rate-limit constants). Don't proceed without answers.
2. **Device simulation.** The real ADHDisplay Companion app (Expo/React Native) can't run in a sandboxed agent environment. Every "device" scenario is a raw HTTP call sending exactly what `adhdisplay-companion/src/lib/pairing.ts` sends — re-read that file first if it's changed since the source cycle, so the simulated calls stay faithful to the real client rather than drifting into testing an imagined contract. Only the Display Manager (admin) side is exercised through the real UI.
3. **Real data, not a disposable fixture.** Unlike the assistant workflow's `AutoDeler` seed catalogue, there is no standing pairing/companion-app fixture to reuse or reset — `server/data/admin-displayMachines.json` is the user's actual device list. Every scenario must use an obviously-fake, greppable identity (machineID prefixed `qa-test-`, label prefixed `QA Test — `) and be fully cleaned up and verified against real data before finishing, not just self-reported as cleaned up.
4. **Rate-limit budget management.** `pairing-heartbeat`'s per-IP new-`machineID` rate limit (5 per `PAIRING_RATE_LIMIT_WINDOW_MS`, keyed off `req.socket.remoteAddress`) is shared by every curl/fetch call from one test machine. Count how many scenarios in this run's own scope need a genuinely new `machineID` before starting, and sequence any scenario that's *specifically testing* the rate-limit boundary last within its own batch — or use technique #5 below to sidestep the budget entirely for a run covering many scenarios.
5. **Temporarily shrinking `PAIRING_PIN_TTL_MS`/`PAIRING_RATE_LIMIT_WINDOW_MS` for fast testing.** Real values are 10 minutes each — waiting them out for real is impractical for more than one or two expiry checks. Technique (confirmed working in the source cycle): edit both constants in `server/index.ts` inline with an explicit marker, e.g. `const PAIRING_PIN_TTL_MS = /* QA-TEMP <date>: was 10 * 60 * 1000, shrunk for fast expiry testing, MUST REVERT */ 120 * 1000` — `tsx watch` hot-reloads the change into the already-running dev server automatically. **Don't shrink the TTL more aggressively than the slowest multi-step scenario that depends on it can tolerate** — the source cycle's own first attempt used 4 seconds and a device expired mid-test (curl round-trips alone ate more than 4s across a several-step scenario), producing a false read that had to be re-run at 120 seconds instead. Aim for "clearly shorter than a real wait, comfortably longer than this cycle's own slowest scenario." Revert both constants to their real values at the end of the cycle, confirm no `QA-TEMP` marker remains (`grep -n "QA-TEMP" server/index.ts`), and confirm `git diff server/index.ts` shows zero net change from these two edits specifically (the feature's own real diff, if any, is separate and expected).
6. **Concurrency probes need `Promise.all` + `fetch`, not sequential curl calls.** Sequential curl calls (even run "at the same time" from separate terminal invocations) don't reliably land in the same event-loop tick. Use a small Node script firing two `fetch()` calls via `Promise.all` (see the source cycle's own `concurrency-test.mts`, not committed) to actually test whether two near-simultaneous requests race. Expected result for this codebase's pairing routes specifically: no race, because both `pairing-heartbeat` and `approve` run their entire read-compute-write body synchronously inside one `.then()` callback with no `await` in between — Node's single-threaded run-to-completion semantics prevent interleaving, the same invariant `mergeDisplayMachineHeartbeat`'s own comment in `server/index.ts` already documents and relies on for the plain heartbeat route. If a future change introduces an `await` inside either route's callback body, this invariant breaks silently — re-verify concurrency safety whenever either route's own code changes, not just when this template says to.
7. **QR payload decode technique.** The only device-side contract that can't be exercised by replaying `pairing.ts` directly is the QR code itself — there's no scanner to replay. Decode the actual rendered image: capture the `<svg>` via Playwright (force a large, e.g. 600×600, render size first via `element.setAttribute('width'/'height', ...)` — the modal's own CSS size is too small to decode reliably), screenshot it to a PNG, flatten any transparency onto white (the SVG uses `bgColor="transparent"`), then decode with `jsQR` + `pngjs` (both pure-JS, no native deps) installed in an **isolated scratch directory** (`npm init -y && npm install jsqr pngjs` somewhere outside the repo, e.g. the session's own scratchpad) — never add either as a real dependency of this app. Diff the decoded string against the exact payload built from a fresh `/server-info` call made around the same time, and re-parse it using the same logic as `adhdisplay-companion/src/lib/qr.ts`'s `parsePairingQrValue` (copy the parsing logic inline into the decode script rather than importing across the Expo/web boundary) to confirm the companion app's own parser would accept it.
8. **Cleanup for a still-pending request has no in-app UI action.** Display Manager's "Pairing requests" cards only ever offer "Approve" — there's no "reject"/"cancel" button. A pending test request left over at the end of a cycle (e.g. one deliberately dropped via 5 wrong-PIN attempts is already gone on its own, but one merely created-and-abandoned isn't) must be cleaned up via the real generic synced-key `write` path over the WebSocket — connect, send `hello` for `admin.displayPairingRequests`, read the snapshot, filter out every `qa-test-`-prefixed entry, send `write` with the filtered array and a real admin token (see the source cycle's own `cleanup-all-pending.mts`, not committed). **Never edit `server/data/admin-displayPairingRequests.json` directly while the server is running** — the server's own in-memory `store` Map would overwrite a direct file edit on its next unrelated write to that key, silently undoing the cleanup.
9. **Verify against real data, not a script's self-report.** Every "this now exists"/"this is now gone" claim must be checked by reading `server/data/admin-displayMachines.json`/`admin-displayPairingRequests.json` directly (`jq` is convenient), not by trusting a `200`/success toast alone.
10. **Execution mode.** Headed (visible) browser for UI scenarios, matching this repo's own standing QA preference — the point is to be able to watch it run.
11. **Cadence.** Event-driven — see this file's own header note on when to re-run. Not a fixed schedule.
12. **Scenario-ID discipline.** Before finishing the report, grep it for every `S<N>`/`U<N>` used and confirm each appears exactly once, with no gaps and no duplicates, and that the header tally's PASS/FAIL/N/A counts actually reconcile against the body. The source cycle's own first pass got this wrong (a duplicated ID, an unreconciled tally, three unlabeled items) and needed a full renumbering pass to fix — don't repeat that; check it as you write, not after.

## Environment setup (prerequisite, before any scenario runs)

- Confirm (don't assume) whether a dev server is already running: `lsof -nP -iTCP:4000,4173,5173 -sTCP:LISTEN`. If one is found that wasn't expected, say so before proceeding (see Step 0 question 1).
- Snapshot `server/data/admin-displayMachines.json` to a scratch location *before touching anything* — this is the byte-identical-diff baseline the cleanup verification checks against at the end.
- Confirm `server/data/admin-displayPairingRequests.json` is empty (or note its current real contents) before starting, so a leftover from a *previous* cycle isn't mistaken for this cycle's own residue.
- Log in for a real admin session token (`POST /login`) — needed for every `approve` call and any Display Manager UI scenario.

## Standing scenario bank — server routes (curl/fetch)

*Reuse verbatim when re-running unchanged behavior; only add/modify a row when the actual route logic it covers has changed. IDs below match the source cycle (`qa-report-display-pairing-2026-08-06.md`) — carry them forward as-is so cross-cycle comparison stays possible, the same way the assistant workflow's own source-report scenario IDs get reused.*

| ID | Scenario | What it verifies |
| --- | --- | --- |
| S1 | `electron`/`url` heartbeat, unknown `machineID` | Unaffected by the `mobile` gate — still joins with zero gate. |
| S2 | `mobile` heartbeat, unknown/unapproved `machineID` | `409 { needsPairing: true }`. |
| S3 | `pairing-heartbeat`, new device | `200 { status: 'pending', pin }`, new pending entry on disk. |
| S4 | `pairing-heartbeat` again, same device (refresh) | Same PIN, `lastSeenAt` advances, `createdAt` fixed. |
| S5 | Approve with the correct PIN | Device moves into `admin.displayMachines` (`connectionType: 'mobile'`, one `device` monitor), removed from pending. |
| S6 | `pairing-heartbeat` for an already-approved device | `200 { status: 'approved' }`. |
| S7 | `heartbeat` (`mobile`) for an already-approved device | `200 { ok: true, monitors }` — no longer gated. |
| S8 | Approve for a `machineID` with no pending request at all | `404`. |
| S9 | 5 wrong PIN guesses against a real pending request | 1–4: `400`; 5th: `410`, request dropped. |
| S10 | Re-`pairing-heartbeat` right after a drop | Treated as new — fresh, different PIN. |
| S11 | Cross-match: PIN belongs to a *different* pending request | That other request is approved instead; the targeted one is untouched. |
| S12 | Rate-limit boundary: 6th new `machineID` from one IP within the window | `429`. |
| S13 | Rate-limit recovery after the window passes | A new `machineID` succeeds again once the sliding window rolls the earlier ones out. |
| S14 | PIN TTL: `pairing-heartbeat` past TTL | Different PIN returned — treated as new. |
| S15 | PIN TTL: `approve` with an expired PIN | `410`, distinct from S8's `404`. |
| S16 | PIN TTL: a stale, untouched pending request | Reaped from disk on the *next write* to the key (not a timer) — trigger via a different device's own `pairing-heartbeat`. |
| S17 | `/approve` auth: missing `Authorization` header | `401`. |
| S18 | `/approve` auth: invalid/garbage token | `401`. |
| S19 | Attempt-counter scope under cross-match | Per-target-URL, not global; a successful cross-match resets the *target's* own counter to zero even though the target wasn't approved. Needs the 120s-TTL technique (#5) — this is the multi-step scenario that broke the source cycle's first, too-aggressive 4s shrink. |
| S20 | Concurrency: two simultaneous `approve()` calls, same device + PIN | Exactly one succeeds; no duplicate machine entry. |
| S21 | Concurrency: `approve` racing a `pairing-heartbeat` refresh | Consistent end state either way — no crash, no split state. |
| S22 | Input validation: empty/missing `machineID` on `pairing-heartbeat` | `400`. |
| S23 | Input validation: empty/missing `label` on `pairing-heartbeat` | `400`. |
| S24 | Input validation: missing/empty `pin` on `approve` | `400`. |
| S25 | Input validation: malformed JSON body | `400`. |
| S26 | `MAX_PENDING_PAIRING_REQUESTS` (10) cap → `503` | **Not independently testable from one source IP** — the 5-per-IP rate limit always trips first (5 < 10, by construction). Grade N/A, verify by code review of the `pending.length >= MAX_PENDING_PAIRING_REQUESTS` check's own ordering (before the rate-limit check) instead. Would need 3+ distinct source IPs to test live — out of scope for a single-test-machine cycle. |

## Standing scenario bank — Display Manager UI (headed Playwright)

| ID | Scenario | What it verifies |
| --- | --- | --- |
| U1 | Pairing requests section renders | Shows label, live PIN (matching the server's own response exactly), "requested Xm ago", for each pending device. |
| U2 | Wrong PIN typed into the UI | Inline error shown; card stays. |
| U3 | Correct PIN approves via the UI | Success notice names the approved label; card moves from pending list to the machines grid with the `mobile` badge. **Known past regression (fixed 2026-08-06):** the success/error `<Alert>`s were once nested inside `{pairingRequests.length > 0 && (...)}`, so approving the *only* pending device made the whole section — including the notice — vanish instantly. Re-check this specifically whenever `DisplayManagerView.tsx`'s pairing-section JSX changes: approve the *only* currently-pending device (not one of several) and confirm the notice is still visible after the list empties. |
| U4 | "Pair a mobile display" modal renders | QR SVG + plain-text host/ports fallback, sourced live from `/server-info`. |
| U5 | QR payload decoded and verified end-to-end | See Methodology #7 — decoded payload must byte-match the expected URI and parse successfully via `parsePairingQrValue`'s own logic. |
| U6 | Remove an approved mobile device → real revocation | Removing via the UI's own "X", then a `mobile` `heartbeat` for that `machineID`, returns `409 needsPairing` — **this check is free** (`POST /display-machines/heartbeat` is not rate-limited; only `pairing-heartbeat`'s *new-machineID* path is) and should never be skipped "to conserve rate-limit budget" — that reasoning was wrong once already in the source cycle's first pass. |
| U7 | "PIN refreshed" indicator | Real TTL is 10 minutes, impractical to watch live in a browser session even with the server-side TTL shrunk (the shrink doesn't speed up how long a human/script needs to sit watching a specific pixel change). Grade N/A by default; verify by code review of `DisplayManagerView.tsx`'s previous-PIN-per-`machineID` comparison logic instead. Only attempt a live watch if this specific indicator's own logic is what changed. |

## Run order

- S1–S13, S17–S18, S22–S25 have no ordering dependency on each other or on the UI scenarios — any order is fine.
- S14–S16 (TTL) should use the 120s-shrunk value (Methodology #5), not the more aggressive value the source cycle's first attempt tried — S14's own scenario can tolerate a shorter shrink in isolation, but S19 (which reuses the same shrunk constant later in the run) cannot, so shrink once, to a value both tolerate, rather than re-shrinking per scenario.
- S19 depends on S11's own cross-match mechanism already being understood/working — run after S11, not before.
- S20–S21 (concurrency) have no data dependency on anything else — run any time after Environment setup.
- U1–U3 need a pending device created via S3-equivalent first (interleave, don't run all server scenarios before touching the UI at all — the source cycle's own run order did this deliberately).
- U5 (QR decode) has no dependency on device state — the modal works regardless of what's currently pending/approved.
- U6 needs an already-approved device (from U3, or a fresh curl-only approval if U3's own device was already cleaned up).
- S12 and S13 (rate-limit boundary and recovery) should run after every other scenario needing a "genuinely new machineID" is already done, since S12 deliberately exhausts the budget — see Methodology #4, though technique #5 (shrinking the window) mostly obsoletes this ordering concern by letting the budget refill in seconds instead of minutes.

## Report format

Follow the source cycle's own report shape (`QA/Reports/qa-report-display-pairing-2026-08-06.md`): header Summary/Environment/Device-simulation/Execution-method block, numbered Methodology notes (state what was actually shrunk/reverted this run, not just that the technique exists), per-scenario **Request/Status/What-happened** (+ **Screenshot** for UI scenarios), Key findings summary (name a suspected root cause for anything confirmed by 2+ scenarios), and a Cleanup table verified against real data with an explicit final byte-diff/empty-file confirmation. Same PASS/PARTIAL/FAIL/N/A status vocabulary. Save to `QA/Reports/qa-report-display-pairing-<date>.md`.

## Verification (before calling the plan done)

- Every ID from the standing scenario bank that's actually in scope for this run appears exactly once in this plan's own run order / classification.
- The Summary section states what changed since the source cycle and why this run's scope is what it is (full re-run vs. targeted).
- Nothing in this plan tells anyone to execute curl/fetch or Playwright without asking first.
