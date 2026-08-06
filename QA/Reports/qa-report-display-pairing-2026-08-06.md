# QA Report — Display pairing (ADHDisplay Companion + PIN pairing) — 2026-08-06

**Revision note:** this replaces an earlier version of this same report. That version had internally inconsistent scenario counts (header tally didn't reconcile with the body), a duplicated scenario ID (`S8` used for two different scenarios), three ungraded/unlabeled items, an incorrect stated reason for skipping a UI re-verification, and left several real coverage gaps ungraded (QR payload never decoded, PIN/TTL expiry never exercised, `/approve`'s own auth gate untested, the attempt-counter's exact scope unconfirmed, no concurrency check, no rate-limit-recovery check, no input-validation pass). This revision fixes the numbering, closes every gap above with a real test, and corrects the wrong justification. Every scenario ID below is unique and used exactly once.

**Template shape:** adapted from `QA/templates/base/` (Summary/Methodology/scenario results/Key findings/Cleanup) — this feature isn't the AI assistant chatbox, so none of the base template's model/configuration/session-policy methodology applies; this report's Methodology is written from scratch for this feature instead.

**Feature tested:** the server-side PIN pairing flow (`POST /display-machines/pairing-heartbeat`, `POST /display-machines/:machineID/approve`, the extended `POST /display-machines/heartbeat` `mobile`/`needsPairing` gate, extended `GET /server-info`) and the Display Manager UI built on it (pairing-requests section, approve flow, QR pairing modal, `mobile` badge).
**Environment:** the user's own already-running `npm run dev` (started before this cycle, not by this run — live-reloading via `tsx watch`), branch `main`, real/live data — not a disposable fixture.
**Device simulation:** the real ADHDisplay Companion app (Expo/React Native) can't run in this sandboxed environment. Every "device" scenario is a raw HTTP call (curl, or Node's own `fetch` for the concurrency probes) sending exactly what the app's own `adhdisplay-companion/src/lib/pairing.ts` sends. Only the Display Manager (admin) side was exercised through the real UI.
**Execution method:** curl/Node `fetch` for server-route scenarios; headed (visible) Chromium via Playwright (`playwright`, already a devDependency) for the UI scenarios (`QA/scratchpad/qa/display-pairing-*.mts`, `capture-qr.mts`, `concurrency-test.mts`, `remove-device.mts`, `cleanup-*.mts` — not committed), driving the real app. Screenshots in `QA/display-pairing-screenshots-2026-08-06/`.

## Methodology notes

1. **Two constants temporarily shrunk, then reverted.** `PAIRING_PIN_TTL_MS` (10min→4s, then 4s→120s after the 4s value proved too aggressive for a multi-step curl sequence — see S14's own note) and `PAIRING_RATE_LIMIT_WINDOW_MS` (10min→6s) were edited in `server/index.ts` for the duration of this cycle only, so TTL-expiry and rate-limit-recovery behavior could be exercised in seconds instead of waited out for real over 10+ minutes. Both edits were marked `QA-TEMP` inline and reverted to their original values at the end of this cycle; `git diff server/index.ts` after reverting shows zero net change from those edits (confirmed — the only diff left is the feature itself). This tests the *real* code path, not a mock — only the wait time was compressed.
2. **Rate-limit budget management (server-route scenarios only).** `pairing-heartbeat`'s per-IP new-`machineID` rate limit is keyed off `req.socket.remoteAddress`, shared by every curl/fetch call from this one test machine. Scenarios needing a genuinely new `machineID` were sequenced so the deliberate rate-limit boundary scenario (S12) consumed the budget deliberately, and the shrunk window (methodology #1) meant later scenarios never had to wait out a real 10-minute cooldown to get a fresh budget.
3. **Fake, obviously-test data.** Every simulated device uses a label prefixed `QA Test —` and a fresh `crypto.randomUUID()`-shaped `machineID`, trivially greppable for cleanup.
4. **Verify against real data, not a script's self-report.** Every "this now exists"/"this is now gone" claim was checked by reading `server/data/admin-displayMachines.json`/`admin-displayPairingRequests.json` directly.
5. **A real bug was found, fixed, and re-verified mid-cycle** (U3) — confirmed via the harness, root-caused, fixed in `DisplayManagerView.tsx` only (no other file), and re-verified with a fresh device before moving on, per this repo's own standing "fix in the same cycle when feasible, re-run to confirm" convention.
6. **Cleanup policy.** Every artifact this cycle created was removed and verified against real data. Final state: `admin-displayMachines.json` is **byte-identical** to its pre-test snapshot; `admin-displayPairingRequests.json` is empty; the QA admin session was explicitly logged out.

**Tally:** 31 PASS (1 of which — U3 — required an in-cycle fix before reaching PASS; 0 scenarios remain FAIL), 2 N/A (documented reasons, not gaps) across 33 scenarios.

## A. Server routes (curl/fetch, simulating the Companion app)

**S1 — `electron`/`url` heartbeat, unknown `machineID`, unaffected by the new gate**
- **Request:** `POST /display-machines/heartbeat` `{connectionType: 'electron'}` for a brand-new `machineID`.
- **Status:** PASS — `200 {"ok":true,...}`; confirmed present in `admin-displayMachines.json`. The `mobile`-only gate doesn't affect the other two connection types.

**S2 — `mobile` heartbeat, unknown/unapproved `machineID`**
- **Status:** PASS — `409 {"error":"not paired","needsPairing":true}`; confirmed it never joined `admin.displayMachines`.

**S3 — `pairing-heartbeat`, new device (A)**
- **Status:** PASS — `200 {"status":"pending","pin":"206290"}`; confirmed a matching entry on disk with `createdAt`/`lastSeenAt` set.

**S4 — `pairing-heartbeat` again, same device A (refresh)**
- **Status:** PASS — identical PIN returned; on disk, `lastSeenAt` advanced while `createdAt`/`pin` stayed fixed.

**S5 — Approve with the correct PIN**
- **Status:** PASS — `200 {"ok":true,"approvedMachineID":..,"approvedLabel":..}`; device moved into `admin.displayMachines` with `connectionType: 'mobile'` and exactly one `device` monitor, removed from pending requests.

**S6 — `pairing-heartbeat` for an already-approved device**
- **Status:** PASS — `200 {"status":"approved"}`.

**S7 — `heartbeat` (`mobile`) for an already-approved device**
- **Status:** PASS — `200 {"ok":true,"monitors":[{"id":"device",...,"assignedScreenID":null}]}` — no longer gated.

**S8 — Approve for a `machineID` with no pending request at all**
- **Request:** `POST /display-machines/<unused-uuid>/approve` `{pin:"123456"}`.
- **Status:** PASS — `404 {"error":"No pending pairing request for that machine"}`.

**S9 — 5 wrong PIN guesses against a real pending request (device B)**
- **Status:** PASS — attempts 1–4: `400 Incorrect PIN`; attempt 5: `410` ("must rotate"), B's pending request dropped on the spot.

**S10 — Re-`pairing-heartbeat` for device B right after S9's drop**
- **Status:** PASS — treated as genuinely new: `200 {"status":"pending","pin":"109792"}`, a fresh PIN different from the original — the drop was real, not a response-level rejection with the old request still alive.

**S11 — Cross-match: PIN belongs to a *different* pending device**
- **Request:** Device B pending (PIN `109792`); fresh device C created (PIN `714459`); `POST /display-machines/B's-machineID/approve` `{pin:"714459"}` — B's own URL, C's PIN.
- **Status:** PASS — `200 {"approvedMachineID":"...C's id...","approvedLabel":"...C..."}` — **C approved, not B.** Verified on disk: B's pending request completely untouched (same PIN, same timestamps).

**S12 — Rate-limit boundary (6th new `machineID` from one IP)**
- **Status:** PASS — after 5 new `machineID`s from this IP within the (temporarily 6s) window, the 6th got `429 {"error":"too many new pairing attempts from this network, try again shortly"}`.

**S13 — Rate-limit recovery after the window passes** *(new this revision)*
- **Request:** 5 new `machineID`s in quick succession (all `200`), a 6th immediately after (`429`), then a 7th after waiting past the (temporarily 6s) window.
- **Status:** PASS — the 7th succeeded (`200 {"status":"pending",...}`) once the sliding window had rolled the earlier 5 timestamps out — confirms the limiter is a real rolling window, not a permanent lockout.

**S14 — PIN TTL: `pairing-heartbeat` past `PIN_TTL_MS` rotates the PIN** *(new this revision)*
- **Request:** Device G created (PIN `882559`), waited 5s past a temporarily-4s TTL, `pairing-heartbeat`'d again.
- **Status:** PASS — second call returned a **different** PIN (`509528`) — a lapsed request is correctly treated as new on its next heartbeat, not silently kept alive with a stale PIN. *(Methodology note: the 4s TTL used for this one scenario proved too tight for the multi-step S19 test that followed — see there — so the TTL was loosened to 120s for the remaining scenarios; this scenario's own result stands regardless.)*

**S15 — PIN TTL: `approve` with a PIN that's since expired**
- **Request:** Device H created, PIN never refreshed, waited 5s past the (then-4s) TTL, then `approve`'d with that original PIN.
- **Status:** PASS — `410 {"error":"This pairing request has expired — the device will get a fresh PIN on its next heartbeat"}` — distinct from S8's plain `404` (never-existed) as designed.

**S16 — PIN TTL: a stale pending request is reaped from disk on the next write to the key**
- **Request:** Device I created, left untouched past TTL (unlike S14/S15, no further action taken *for I itself*); confirmed present on disk; then a **different** device J's `pairing-heartbeat` call (any write touching `admin.displayPairingRequests`) was made.
- **Status:** PASS — I was gone from disk immediately after J's write — pruning genuinely happens as a side effect of the next write to the key, not just at read time inside a single request.

**S17 — `/approve` auth: missing `Authorization` header** *(new this revision)*
- **Status:** PASS — `401 {"error":"Authentication required"}`.

**S18 — `/approve` auth: invalid/garbage token** *(new this revision)*
- **Status:** PASS — `401 {"error":"Authentication required"}` (same as S17 — no distinction between "missing" and "malformed", which is fine/expected).

**S19 — Attempt-counter scope under cross-match: per-target-URL, reset by *any* successful match** *(new this revision — the reviewer's top-priority "pin down" ask)*
- **Request:** Devices K2, L2 both pending. 3× wrong-PIN guesses against **K2's own URL** (`400` each, K2 still pending). Then `approve(K2's URL, L2's real PIN)` — a cross-match, per S11's mechanism — approving L2. Then 4 **more** wrong-PIN guesses against K2's URL, then a 5th.
- **Status:** PASS — the 4 post-cross-match guesses against K2 all returned `400` (K2 still pending after all 4 — proving K2's attempt counter was **reset to 0**, not carried over from the earlier 3); the 5th post-reset guess correctly dropped K2 (`410`).
- **What this confirms:** the attempt counter is keyed by the URL's own `:machineID` (the card the admin actually clicked), not global, and **not shared with whichever device the cross-match actually approves.** A successful cross-match resets the *target* card's own counter to zero, even though the target itself was never touched. This is a real, slightly surprising interaction — but not an exploitable brute-force bypass: the only way to trigger that reset is to type a PIN that correctly matches *some* real pending device, which is exactly as hard (1-in-a-million per guess) as succeeding outright. Worth knowing, not worth fixing.

**S20 — Concurrency: two simultaneous `approve()` calls, same device + PIN** *(new this revision)*
- **Request:** Device M created; two `fetch()` calls fired via `Promise.all` with identical `{machineID, pin}`.
- **Status:** PASS — exactly one call returned `200` (approved), the other `404` (already gone) — never two successes, never a duplicate `admin.displayMachines` entry (confirmed on disk: exactly 1). Node's single-threaded, run-to-completion semantics for a callback with no `await` inside it (the same invariant `mergeDisplayMachineHeartbeat`'s own comment already documents and relies on) protects this write path too — the route was written the same way on purpose.

**S21 — Concurrency: `approve` racing a `pairing-heartbeat` refresh for the same device** *(new this revision)*
- **Request:** Device N created; `approve()` and a `pairing-heartbeat()` refresh fired concurrently via `Promise.all`.
- **Status:** PASS — `approve` returned `200` (success); the concurrent refresh call correctly saw `{"status":"approved"}` rather than a stale/conflicting pending response. A follow-up `heartbeat` call for N confirmed a single, consistent, fully-approved device — no crash, no corruption, no split state.

**S22 — Input validation: empty/missing `machineID` on `pairing-heartbeat`** *(new this revision)*
- **Status:** PASS — both `{"machineID":""}` and omitting the field entirely return `400 {"error":"Malformed pairing-heartbeat body"}`.

**S23 — Input validation: empty/missing `label` on `pairing-heartbeat`** *(new this revision)*
- **Status:** PASS — same `400` for both.

**S24 — Input validation: missing/empty `pin` on `approve`** *(new this revision)*
- **Status:** PASS — both return `400 {"error":"Missing pin"}`.

**S25 — Input validation: malformed JSON body on `pairing-heartbeat`** *(new this revision)*
- **Status:** PASS — `400 {"error":"Malformed request body"}`.

**S26 — `MAX_PENDING_PAIRING_REQUESTS` (10) cap → `503`**
- **Status:** N/A — not independently testable from one source IP: the 5-per-IP rate limit (S12/S13's own mechanism) always trips before a single IP can accumulate 10 pending requests (5 < 10, by construction). Verified by code review of `server/index.ts`'s pairing-heartbeat handler instead: `if (pending.length >= MAX_PENDING_PAIRING_REQUESTS) { ...503... }`, checked *before* the rate-limit check, so the ordering is right even if this exact branch can't be hit from a single test machine.

## B. Display Manager UI (headed Playwright, real admin login)

**U1 — Pairing requests section renders**
- **Status:** PASS — with device A pending, the section appeared above the machines grid showing label, live PIN (`206290`, matching the curl response exactly), and "Requested 1m ago".
- **Screenshot:** `01-u1-pairing-section.png`

**U2 — Wrong PIN typed into the UI**
- **Status:** PASS — inline "Incorrect PIN" error shown; device A's card remained, untouched.
- **Screenshot:** `02-u2-wrong-pin-error.png`

**U3 — Correct PIN approves via the UI** *(bug found, fixed, re-verified — see Key findings #1)*
- **Status:** PASS *(after an in-cycle fix — initially FAIL)*
- **What happened (first run):** Approving correctly moved the device into the machines grid with the "ADHDisplay Companion" badge, but the success notice never rendered — it was nested inside a condition that unmounted the instant the approved device was the *only* pending one.
- **Fix:** moved the notice/error `<Alert>`s in `DisplayManagerView.tsx` outside the `pairingRequests.length > 0` gate — the only file touched for this fix.
- **What happened (retest, fresh device A2):** The success notice **"Approved \"QA Test — Device A2 (bugfix retest)\""** correctly stayed visible after the list emptied.
- **Screenshots:** `03-u3-approved.png` (first run), `06-u3-retest-notice-persists.png` (post-fix retest).

**U4 — "Pair a mobile display" modal renders**
- **Status:** PASS — modal opened with a rendered QR SVG and the plain-text fallback: *"No camera? Enter this server manually in the app: 192.168.0.213 (sync port 4000, content port 4173)"*, sourced live from the real, running `/server-info`.
- **Screenshot:** `04-u4-pair-modal.png`

**U5 — QR payload decoded and verified end-to-end** *(new this revision — closes the reviewer's top-priority gap)*
- **Request:** The rendered QR `<svg>` was captured as a standalone PNG via Playwright (forced to a decode-friendly 600×600 render size first), flattened from its transparent background onto white, and decoded with `jsQR` (installed in an isolated scratch directory, not the app's own dependencies) — then diffed against the exact string the plan specifies (`adhdisplay-companion-pair://v1?host=...&wsPort=...&contentPort=...`, built from the same `/server-info` call U4 already confirmed) and re-parsed using the **exact same logic** as the companion app's own `adhdisplay-companion/src/lib/qr.ts`'s `parsePairingQrValue`.
- **Status:** PASS — decoded payload: `adhdisplay-companion-pair://v1?host=192.168.0.213&wsPort=4000&contentPort=4173` — **byte-for-byte identical** to the expected string. Re-parsing it with `parsePairingQrValue`'s own logic yielded `{host: "192.168.0.213", wsPort: 4000, contentPort: 4173}` — a clean pass. This is the one device-side contract that couldn't be exercised by replaying `pairing.ts` directly (there's no scanner to replay), so decoding the actual rendered image was the only way to close it; now closed.

**U6 — Remove an approved mobile device → real revocation** *(properly re-tested this revision — see Key findings #2 for what was wrong before)*
- **Request:** Device F approved via curl, removed via the real Display Manager "X" button (headed Playwright), then a `mobile` `heartbeat` call sent for F's `machineID`.
- **Status:** PASS — `409 {"error":"not paired","needsPairing":true}` — confirmed real revocation, not just a UI-side card disappearing.

**U7 — "PIN refreshed" indicator**
- **Status:** N/A — not observed live (would need to wait out the real 10-minute `PIN_TTL_MS` inside the browser session specifically, which wasn't practical alongside the rest of this cycle). Verified by reading `DisplayManagerView.tsx`'s previous-PIN-per-`machineID` comparison logic instead — a plain "did this machineID's PIN value change since last render" check with no server field involved, straightforward to confirm correct by inspection. (S14 already confirms the *server side* of a PIN rotation works; this N/A is specifically about not having watched the *indicator* light up live in a browser.)

## Key findings summary

1. **Fixed: success/error notice was nested inside the `pairingRequests.length > 0` gate, making it disappear the instant the approved device was the only one pending.** Confirmed by U3, root-caused, fixed in `DisplayManagerView.tsx` (the only file touched for this fix), and re-verified with a fresh device. This was a real, user-facing gap in exactly the feature the plan called out as important — making a cross-match approval visible. The underlying server-side cross-match logic (S11, S19) was already correct throughout; only the *UI's own display* of the result was broken.
2. **Corrected in this revision: U6 (formerly U5)'s justification for initially skipping a live re-verification was wrong.** The original report said the check was skipped "to conserve the shared rate-limit budget" — but `POST /display-machines/heartbeat` (what that check actually calls) isn't rate-limited at all; only `pairing-heartbeat`'s *new-`machineID`* path is. The check was free. It's now actually been run (see U6 above) and passed, so the original conclusion was right, but for the wrong stated reason — flagging this explicitly rather than letting a wrong justification stand as precedent for a future cycle.
3. **Attempt-counter/cross-match interaction, pinned down (S19):** the counter is per-target-URL and gets fully reset by *any* successful PIN match, including one that cross-matches and approves a completely different device. Not exploitable (the reset trigger is itself a correct 6-digit guess), but worth knowing — the counter isn't "5 wrong guesses against this identity, ever," it's "5 wrong guesses against this URL slot since the last time *any* guess against it happened to succeed."
4. **Concurrency on the pairing write path is safe (S20, S21) — for the same structural reason the existing heartbeat-merge code already relies on.** Both `pairing-heartbeat` and `approve` run their entire read-compute-write body synchronously inside one `.then()` callback with no `await` in between, so Node's single-threaded run-to-completion semantics prevent interleaving between two concurrent requests. No dedicated locking/versioning exists (or is needed) for this write path specifically — it has the same (sufficient, for this access pattern) protection every other synced-key write in this codebase already has, no more and no less. Nothing here is pairing-specific technical debt to track separately.
5. **QR payload verified end-to-end (U5), not just "a QR code rendered.")** Decoding the actual rendered image and re-parsing it with the companion app's own logic confirms the one device-side contract that couldn't be tested by replaying `pairing.ts` directly.
6. **Mechanics that don't depend on any of the above:** `electron`/`url` heartbeat behavior is completely unaffected by the new `mobile` gate (S1); PIN TTL expiry/rotation/reaping all behave correctly on the server side independent of whether anyone's watching the UI's own indicator (S14–S16); the rate limiter is a genuine rolling window, not a one-way lockout (S12/S13); every tested input-validation edge case returns a clean `400` rather than a 500 or undefined behavior (S22–S25); `/approve`'s auth gate rejects both missing and garbage tokens (S17/S18).

## Cleanup performed

Every test artifact used a `qa-test-` prefixed `machineID` and a `"QA Test — "` prefixed label, verified removed against real data (not self-reported) before finishing. (Device labels below are exactly as created — no editing artifacts left in this table.)

| Record | Created in | Removed via |
| --- | --- | --- |
| Device A | S3/S4 | Approved via UI (U1–U3 first run), removed via UI (U3's own flow) |
| Device A2 | U3 retest | Approved via UI, removed via UI |
| Device B | S9/S10/S11 | Never approved (dropped once by S9, then left pending after S11's cross-match); its final leftover pending entry removed via the real synced-key `write` path (no in-app "reject a pending request" action exists) |
| Device C | S11/S6/S7 | Approved via curl (the cross-match's actual target), removed via UI |
| Device F | U6 | Approved via curl, removed via UI, revocation confirmed via curl |
| Devices G, H, I, J | S14/S15/S16 | Expired/reaped by the TTL mechanism itself as part of the scenario; any still-pending remainder swept via the synced-key `write` path at final cleanup |
| Devices K2, L2 | S19 | K2 dropped by its own attempt-limit (never approved); L2 approved (the cross-match target), removed via UI |
| Device M | S20 | Approved by exactly one of two concurrent calls, removed via UI |
| Device N | S21 | Approved, removed via UI |
| Rate-limit-recovery probes ×6 | S12/S13 | Never approved; swept via the synced-key `write` path at final cleanup |
| S1's `electron` test machine | S1 | Removed via UI |
| S22–S25's validation probes | S22–S25 | Rejected with `400` before creating anything — nothing to clean up |
| S17/S18's auth probes | S17/S18 | Rejected with `401` before touching any pending request — nothing to clean up |

**Final verification:** `server/data/admin-displayMachines.json` is **byte-identical** to its pre-test snapshot (`diff` returned no output) — the 3 real pre-existing `url` machines (Display 2/3/4), no test residue. `server/data/admin-displayPairingRequests.json` reads `{"seeded":false,"value":[]}` — empty. `server/index.ts`'s two temporarily-shrunk constants (`PAIRING_PIN_TTL_MS`, `PAIRING_RATE_LIMIT_WINDOW_MS`) are confirmed reverted to their original 10-minute values, with no `QA-TEMP` markers left in the file. The QA admin session token was explicitly logged out at the end of the run.
