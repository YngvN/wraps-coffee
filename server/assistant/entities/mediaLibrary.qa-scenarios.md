<!-- Moved here from QA/templates/qa-test-plan-template.md's old "Section I" (v8, added when the Media Library and Screen entities shipped) on 2026-08-04, split per entity — see QA/templates/project/qa-test-plan-project.md's own header and "Per-entity scenario files" table. The screen-entity rows from the same old section live in this file's sibling, screen.qa-scenarios.md. IDs kept as originally assigned (I.1, I.6) for traceability with any prior report that already cites them. -->

# QA scenarios: `mediaLibrary` entity

Pulled into a cycle's own classification table (see `QA/templates/project/qa-test-plan-project.md`) whenever `server/assistant/entities/mediaLibrary.ts` or its client-side wiring (`useAssistantFlow.ts`/`AssistantPanel.tsx`'s review-mount and destructive-delete branches, `reviewChangeRows.ts`'s `buildMediaLibraryChangeRows`) has changed since the last cycle that covered it.

**As of 2026-08-04, this file has never been exercised in an actual QA cycle** — the entity shipped the same day this file was written.

| ID | Scenario | Example messages | Session |
| --- | --- | --- | --- |
| I.1 | Rename a media file via chat, confirm the review shows the old filename/label → the new label, and confirm the new label shows on the real Media Library page after confirming. | "Gi filen [existing filename] merkelappen \"[new label]\"." | Fresh |
| I.6 | Delete a media file via chat, confirm the same typed-confirmation destructive flow every other deletable entity uses, and confirm the file is actually gone from the Media Library page after confirming. | "Slett mediefilen [filename]." | Fresh |
