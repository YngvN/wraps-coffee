# Review and test: register compliance (Phases 0–5)

Paste everything below the line into a fresh Claude Code session opened in this repo.

---

You are reviewing and testing the café register's compliance work. It is meant to make the
register a declarable *kassasystem* under kassasystemlova and kassasystemforskrifta.

- **Scope:** the uncommitted working tree on `main`, on top of commit `3b5c670`.
  - Run `git status` and `git diff 3b5c670 --stat` to see it.
  - Phases 6–7 in the plan (`~/.claude/plans/warm-shimmying-marshmallow.md`) are not built. Grade anything that needs them as **N/A (pending phase 6/7)**, not FAIL.
- **Your job:** find real defects and prove each one with a probe. Write a report.
- **Do not fix anything.** When the report is written, list the fixes you propose and wait for my go-ahead.

## Ground rules (from CLAUDE.md and standing preferences)

- **Never test against the real server or its data.** Use a scratch copy only (see "Test environment").
- **Ask me before any Playwright or other browser automation.** Driving the Android tablet with `adb` is fine once I say it's on.
- **Don't commit, push or bump versions.** This is a review.
- Before reading more than ~3 files just to locate or summarise something, load the `local-delegation` skill. Load it anyway at the start, since this prompt depends on it.
- Load the `keep-in-sync`, `admin-deep-links` and `assistant-entities` skills before judging those areas. They list files that don't look related.

## Delegation (local-delegation skill, applied to this review)

Load the skill first and follow its rules. Concretely:

1. **Session start:** run `bash ~/delegation-kit/session-start.sh`.
   - If decode is below ~25 tok/s, tell me the number right away, then keep going.
   - Ledger tracking is opt-in: ask me once whether to enable it, and never enable it silently. `qreview.sh` passes `--ledger`, so ask before its first use.
2. **Kit check:** run `bash ~/delegation-kit/kit-check.sh .` before using any kit script.
   - `review-project.sh` is still addressed to another project (it walks `src/**/*.js` and a `TYPES.md`). **Don't use it.** Use step 4 instead.
   - `qreview.sh` writes `bench/out/` into the current directory. Run it from the scratch copy, never from the repo.
3. **Per-module second reader (qwen-27b):** `bash ~/delegation-kit/qreview.sh <file>` on each module below, with `REVIEW_TEMPERATURE=0.2`.
   - Files over ~12 KB are reviewed in parts, never whole: `server/saft/export.ts` (14 KB) and `server/journal/journal.ts` (11.8 KB).
   - **Tier 1, the legal core. Review every file:**
     - `server/journal/*.ts` and `server/saft/*.ts`
     - `server/register/{sessions,access,signInRoutes,receiptRoutes,receipts,returns,returnRoutes,cartEventRoutes,reports,reportRoutes,training,saleJournal,drawer,drawerRoute,routes,orders}.ts`
     - `src/lib/receipt/legalReceipt.ts`, `reportLayout.ts`, `src/lib/vat.ts`, `src/lib/osloTime.ts`
   - **Tier 2:** `src/features/screens/register/*` hooks (`useRegisterSession`, `useRegisterReceipts`, `useJournaledCart`) and `server/backup.ts`'s `restoreDataDir`.
4. **Cross-boundary review:** this finds disagreements between two modules that are each correct on their own, which no per-file review sees.
   - Run `python3 ~/.claude/scripts/query_lm.py --model qwen-27b --temperature 0.2 --files a,b,c "<instruction>"`, with **at most 6 files** per call and **the instruction first**.
   - Ask only for places where the files disagree about a shape, unit, sign or invariant.
   - Pairs worth running:
     - the journal writer and its readers: `journal.ts` + `saleJournal.ts` + `reports.ts` + `saft/export.ts` (in parts) + `src/types/journal.ts`
     - money signs and units: `returns.ts` + `saft/report.ts` + `saft/export.ts` + `legalReceipt.ts` + `vat.ts`
     - session and client: `sessions.ts` + `access.ts` + `src/lib/registerHttp.ts` + `useRegisterSession.ts`
     - training: `training.ts` + `routes.ts` + `reports.ts` + `RegisterSlide.tsx`
5. **Every model finding must be confirmed by running something** (a unit test, a curl, a journal read, an `xmllint` run, a tablet action) before it goes in the report. Re-reading the file and agreeing doesn't count.
   - Severity numbers from the model are unreliable, so set severity yourself.
   - Dismiss style or convention objections without comment.
6. **When something fails:**
   - Measure first (which function, how often, which input).
   - Then run `bash ~/delegation-kit/diagnose.sh "<symptom + measured facts>" <files>`, sending the failing test along with the module.
   - Give facts, not your theory.
   - If a model call fails or hangs, say so, do that task yourself, and don't retry.
7. **Concurrency:** at most one 27B call plus one minicpm call at a time, and never two on the box. Thinking stays off.

## Test environment (isolated)

- **Scratch copy:** make one of the working tree in your scratchpad (`rsync -a --exclude node_modules --exclude adhdisplay-companion`, then `npm ci`).
  - Give it seed data: a store, products with long generated ids, and categories.
  - Never use the real `server/data`. See memory "Isolated test server".
- **Server:** `env -u NEON_DATABASE_URL WS_PORT=4100 npx tsx server/index.ts`. HTTP and WS both use port 4100.
  - Set `CONTENT_PORT` to the preview port.
  - Its mDNS name may clash with the real server. The resulting "Service name is already in use" message is harmless.
- **Build and preview:** `VITE_WS_PORT=4100 npx vite build`, then `npx vite preview --host --port 4273 --strictPort`.
- **Printer:** a fake ESC/POS printer on TCP 9101 that appends every job to a log file. If none exists, write a ~15-line `node:net` server. Add it in admin as a network printer at `127.0.0.1:9101`, or at the Mac's LAN IP for the tablet.
- **Test staff:** Kari, PIN 1111 (staff); Ola, PIN 2222 (manager). The admin login is `admin` / `1234`.
- **Tablet:**
  - Ask me to turn it on, then run `export ANDROID_SERIAL=<ip:port>` (ask me for the current port).
  - The package is `no.adhdisplay.companion`. Force-stop and relaunch it **twice** to load a new bundle.
  - The screen is 3000×1920. Screenshot coordinates must be scaled to that before `input tap`.
- **Company details:** fill in Settings → Store settings → Company details with a real-format org number (e.g. `974761076`). Receipts, X/Z and SAF-T refuse to run without them, and that refusal is itself a test.

## What to test

Grade each as PASS / FAIL / N/A.

- **Where the evidence comes from:**
  - receipt text: the printer log;
  - money and chain facts: the journal files in `server/data/journal/*.jsonl`;
  - what the user sees: tablet screenshots.
- **Verify every claim against the data**, not against the UI's own message.

### Phase 0: foundations
- Receipts, X/Z, SAF-T and checkout are refused while company details are missing, and the checkout refusal is `legalDetailsMissing`.
- **VAT:** 15 % takeaway and 25 % eat-in for `food`, always 25 % for `standard`, and correct rounding in øre on mixed carts. Check the receipt totals by hand.
- Each tablet gets a stable register number, and it survives a server restart.
- **Timestamps are Oslo time** even when the server runs with `TZ=UTC`. Restart the scratch server with `TZ=UTC`, make a sale, and compare.

### Phase 1: journal, signing, staff and sessions
- **Hash chain:** back up the scratch server's journal directory, then edit one byte in one entry and verify. Then delete one line and verify again. Both must be reported (JournalHealth card, or `POST /register/admin/journal/verify`), and a server restart must flag it too. Restore the backup afterwards.
- **Independent signature check** with `openssl`:
  1. Fetch `GET /register/admin/public-key`.
  2. Rebuild the signed string `prevSig;transDate;transTime;nr;transAmntIn;transAmntEx` for the first two cash transactions of one register. The first `prevSig` is `0`.
  3. Run `openssl dgst -sha1 -verify`.
  - This checks the signing format without trusting our own verifier.
- **Signed types:** only `sale`, `return` and `trainingSale` are signed. `copy` and `proForma` are numbered but unsigned.
- **Sign-in:**
  - A PIN is needed once per Oslo day per register, and after that a name tap is enough.
  - Five wrong PINs lock the account.
  - The server caps the session idle time at 10 minutes, whatever the tablet sends.
  - Sign-in, name switch and logout are all journaled.
- **Idle behaviour on the tablet:** logout after the "Logg ut etter" setting (default 2 min), with the cart kept and the takeover journaled. The screensaver comes on after 15 min.
  - The kanban has its own screensaver, and a new order closes it with the chime.
- **Closed edit paths:**
  - A WS write to `admin.registerOrders` is rejected.
  - Cancelling a register order is refused on both the kanban route and the admin route.
  - Fulfilment moves still work.
- **Price changes:** a price edited in admin is journaled, with the actor.
- **Backup:** restoring an older backup never shortens or replaces the journal or the signing keys (`restoreDataDir`).

### Phase 2: legal receipts
- **Sales receipt fields:** legal name, org number + MVA, address, date/time, register, cashier, receipt number, lines, VAT per rate, total and payment.
- **Receipt numbers** have no gaps and are never reused across a server restart.
- **Copy:** the first copy prints "KOPI" in large type. A second copy is refused server-side (try it with curl too), and the history shows "Kopi skrevet ut".
- **Pro forma:** prints "Foreløpig kvittering – IKKE KVITTERING FOR KJØP", is numbered and journaled, and isn't signed.
- **Legal headers are always Norwegian**, even with English receipts.
- **Automatic printing:** every completed sale prints a receipt automatically.

### Phase 3: returns, voids and corrections
- **Returns:**
  - A return needs a manager.
  - It can't exceed what's left of the sale: try over-returning in two steps.
  - Amounts and VAT are negative, and the receipt links to the original receipt number.
  - Stock comes back for products that track it.
  - A cash return opens the drawer with reason `return`.
- **Voids and corrections:** removing a line or lowering a quantity is journaled as a line correction. Clearing a non-empty cart is journaled as a void with its amount.
- **Returns vs. training:** a return is refused while training mode is on.

### Phase 4: cash and X/Z
- **Float:** the float prompt appears at the first sign-in of the day and is journaled.
- **X report:** it has every § 2-8-2 field and changes nothing (run two in a row).
- **Z report:**
  - It covers only the period since the last Z.
  - Z numbers run on per register.
  - The cash count records the difference.
  - It is refused while training is on and while a payment intent is pending.
  - A Z reprint is marked as a copy.
- **Drawer sensor:**
  - With `drawerSensor` on and a status reply of "open", checkout is refused with `drawerOpen`.
  - If the fake printer can't answer `DLE EOT 1`, grade this N/A and say so.
  - Manual drawer openings are journaled.

### Phase 5: training mode, SAF-T and system description
- **Training mode:**
  - A banner is on screen.
  - Receipts print "Treningskvittering" in their own number series.
  - Sales create no order and no kanban card, and don't touch stock.
  - The paid dialog says "Øvingssalg" and has no print button.
  - X/Z count training sales separately.
  - The on/off switches are journaled.
- **SAF-T export:**
  - Export `GET /register/admin/saft?from=…&to=…` over the whole scratch period and validate it with `xmllint --noout --schema server/saft/Norwegian_SAF-T_Cash_Register_Schema_v_1.00.xsd`.
  - Also export with `&register=1` only.
  - Also export a period that contains an X or Z with no sales.
  - Check that `artID` values are ≤35 characters and shortened identically everywhere they appear.
  - Transaction and event counts must match the journal (count types in the JSONL yourself).
- **System description:** read `docs/kassasystem/systembeskrivelse.md` against the code.
  - Every function it claims must exist, and every refusal it describes must happen.
  - It must list what's deliberately missing (delivery receipts).
  - The supplier row is still blank on purpose. Note it, but don't grade it as a defect.

### Cross-cutting
- **i18n:** every key in `src/i18n/languages.json` exists in both `en` and `no`. Check with a script, not by eye.
- **Checks and conventions:**
  - Run `npx tsc -b`, `npm run lint`, and `node --import tsx --test $(git ls-files -co --exclude-standard '*.test.ts')`. Report the counts.
  - The five version files match.
  - `DeveloperDocsView` / `RegisterDeveloperDocs` list every new `/register/*` route (keep-in-sync).
  - New admin cards are reachable through global search and deep links (admin-deep-links).
- **Styling:** light and dark mode on the new sheets. Hover is inside `@media (hover: hover)`. Clickable elements have an `:active` inset shadow.

### Also committed this session in 3b5c670 (smoke only)
- Scan button with the barcode icon.
- Dual-camera scanning (back 1× plus front), with no camera-switch button.
- Pure black dark mode on the kanban and the register.
- Category label on product cards in "Alle", and category headers when sorting by Meny.
- `installer/linux/install.sh` runs `fonts:fetch`.

## Report

Write the report to `QA/Reports/<date>-register-compliance/report.md`, with screenshots in the same folder. Structure:

1. **Summary:** one short paragraph, then a count table of PASS / FAIL / N/A per phase.
2. **Confirmed defects**, most severe first. For each:
   - the file and line;
   - what's wrong;
   - how you proved it (the command and its output);
   - which legal requirement it touches, if any;
   - who found it: you or the 27B.
   - If several failures share one root cause, name the cause once.
3. **Model findings dismissed**, one line each with the reason. This makes the second reader's precision visible.
4. **N/A and pending**, including anything that needs hardware or a later phase.
5. **Proposed fixes:** a list, with no edits made. Then ask me which to apply.

Clean up when done:
- Stop the scratch servers and the printer simulator.
- Ask me before pointing the tablet back at the real server (`192.168.0.213:4000`) and running `adb shell svc power stayon false`.
