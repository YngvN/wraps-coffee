<!-- Moved here from QA/templates/qa-test-plan-template.md's old "Section J" (v9, added when the Display Manager and Orders entities shipped) on 2026-08-04, split per entity — see QA/templates/project/qa-test-plan-project.md's own header and "Per-entity scenario files" table. The displayManager-entity rows from the same old section live in this file's sibling, displayManager.qa-scenarios.md. IDs kept as originally assigned (J.4-J.7) for traceability with any prior report that already cites them. -->

# QA scenarios: `orders` entity

Pulled into a cycle's own classification table (see `QA/templates/project/qa-test-plan-project.md`) whenever `server/assistant/entities/orders.ts` or its client-side wiring has changed since the last cycle that covered it. J.3 (this file's J.4-J.6) covers the three-way order commit-path split (website/Wolt/Foodora) — the one place in this whole registry expansion where a wrong dispatch would silently push a status update to the wrong system (or none at all) while still looking successful in the chat UI.

**As of 2026-08-04, this file has never been exercised in an actual QA cycle** — the entity shipped the same day this file was written.

| ID | Scenario | Example messages | Session |
| --- | --- | --- | --- |
| J.4 | Change a **website** order's status via chat, confirm it persists to `admin.orders` (the plain synced-key path, no external push). | "Sett bestillingen til [customer name] til status [status]." | Fresh |
| J.5 | Change a **Wolt** order's status via chat, confirm the review resolves the right order (search by customer name/phone works even though the order's own `id` is an internal, not customer-facing, value), confirm the local `admin.woltOrders` entry updates optimistically, and confirm the real push attempt fires (`pushWoltOrderStatus` — expect it to fail cleanly with no real Wolt credentials configured in a dev environment; that's a correct, safe result, not a bug to chase). | "Sett bestillingen til [Wolt customer name] til status klar." | Fresh |
| J.6 | Change a **Foodora** order's status via chat — same shape as J.5, confirming the Foodora-specific push path fires instead of Wolt's. | "Sett bestillingen til [Foodora customer name] til status klar." | Fresh |
| J.7 | Manual UI check (not chat): confirm `orders.ts`'s own review has no typed-confirmation step (per the dead-`destructive`-field finding in `qa-test-plan-project.md`'s "Known app-level findings") — a status change should reach the normal single-click-confirm review, not a "type to confirm" prompt. This isn't a regression to fix if it holds; it's confirming the deliberate scope decision stayed in place. | N/A — confirming the *absence* of a UI element, not a chat message | N/A |
