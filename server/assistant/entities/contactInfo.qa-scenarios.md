<!-- Moved here from QA/templates/qa-test-plan-template.md's old "Section G" (v7, added when the temporarily-closed flag shipped) on 2026-08-04, as part of splitting per-entity QA scenario banks out of the monolithic plan template — see QA/templates/project/qa-test-plan-project.md's own header and "Per-entity scenario files" table. IDs kept as originally assigned (G.1-G.5) for traceability with any prior report that already cites them. -->

# QA scenarios: `contactInfo` entity — temporarily-closed flag

Pulled into a cycle's own classification table (see `QA/templates/project/qa-test-plan-project.md`) whenever `ContactInfo.temporarilyClosed`/`temporarilyClosedReason` (`src/types/contactInfo.ts`) or `contactInfoEntity`'s handling of them (`server/assistant/entities/contactInfo.ts`) has changed since the last cycle that covered it. G.1–G.4 run on either provider now that the Claude schema-limit bug (see `qa-test-plan-project.md`'s "Known app-level findings") is fixed — G.5 specifically re-confirms the Claude path, since it's the scenario that would catch a regression if a future field addition pushes the schema's union count back over Claude's 16-property limit.

**As of 2026-08-04, this file has never been exercised in an actual QA cycle** — the flag shipped the same day this file was written.

| ID | Scenario | Example messages | Session |
| --- | --- | --- | --- |
| G.1 | Set the flag on with a reason via chat, confirm the review card shows both the toggle and reason changing, confirm it persists to `server/data/admin-contactInfo.json` after confirming. | "Vi er midlertidig stengt i dag for et privat arrangement, sett dette i kontaktinfo." (we're temporarily closed today for a private event) | Fresh |
| G.2 | With the flag on, ask a plain hours question and confirm the reply leads with the closure (and reason) rather than reciting the regular weekly hours as if nothing changed — this is the `lookupGuidance` read-side behavior, not just a write check. | "Når har dere åpent?" / "When are you open?" | Fresh |
| G.3 | Clear the flag via chat, confirm the review card shows it flipping back off and the reply to a following hours question reverts to the normal weekly schedule. | "Skru av midlertidig stengt i kontaktinfo." (turn off temporarily closed) | Fresh |
| G.4 | Manual UI check (not chat): toggle the flag and reason via Store settings → Contact info directly, confirm it persists across a reload, and confirm the reason input only appears while the toggle is checked (same conditional-field pattern as a weekday's own open/close inputs). | N/A — manual UI interaction, not a chat message | N/A |
| G.5 | Claude-provider regression check for the schema-union-count fix: run G.1's own scenario against Claude instead of the local provider, confirm `fill_fields_contactInfo` completes without a `400` schema error and the review card renders correctly. | "Sett kontaktinfo til midlertidig stengt, årsak: [any short reason]." | Fresh |
