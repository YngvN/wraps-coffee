<!-- Moved here from QA/templates/qa-test-plan-template.md's old "Section J" (v9, added when the Display Manager and Orders entities shipped) on 2026-08-04, split per entity — see QA/templates/project/qa-test-plan-project.md's own header and "Per-entity scenario files" table. The orders-entity rows from the same old section live in this file's sibling, orders.qa-scenarios.md. IDs kept as originally assigned (J.1-J.3) for traceability with any prior report that already cites them. -->

# QA scenarios: `displayManager` entity

Pulled into a cycle's own classification table (see `QA/templates/project/qa-test-plan-project.md`) whenever `server/assistant/entities/displayManager.ts` or its client-side wiring has changed since the last cycle that covered it. J.2 is the third confirmed instance of the standing confabulation rule (see `qa-test-plan-project.md`'s "Known app-level findings") — a regression here means the rule itself needs re-examining, not just this one field.

**As of 2026-08-04, this file has never been exercised in an actual QA cycle** — the entity shipped the same day this file was written.

| ID | Scenario | Example messages | Regression flag | Session |
| --- | --- | --- | --- | --- |
| J.1 | Rename a display machine via chat, confirm the review shows the old label → the new one, and confirm it shows on the real Display Manager page after confirming. | "Gi skjermtilkoblingen \"[machine label]\" navnet \"[new name]\"." | | Fresh |
| J.2 | **Confabulation regression check.** Rename a machine via chat (naming only the machine, not any monitor/screen), then inspect the raw `fill_fields_displayManager` trace output directly to confirm `assignedScreenName` is `null`/absent on the local provider — never a fabricated reassignment. If this regresses, cross-check the real `assignedScreenID` before/after against `server/data/admin-displayMachines.json` (not just the rendered review) to confirm it's a genuine fabrication and not a display bug in the review row itself. | "Gi skjermtilkoblingen \"[machine label]\" navnet \"[new name]\"." (same message as J.1 — the point is confirming it does NOT also touch the screen assignment) | **High-severity if this regresses** — third confirmed instance of the confabulation rule. | Fresh |
| J.3 | Assign a screen to a monitor via chat on **Claude** (the local provider can't touch `assignedScreenName` at all post-fix — stripped from that provider's schema). Confirm the resulting assignment matches the named screen exactly, not a different one. | "Sett skjermen \"[screen name]\" på \"[monitor label]\"." | | Fresh |
