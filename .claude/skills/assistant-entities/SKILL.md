---
name: assistant-entities
description: What the admin AI assistant (the sparkle icon) can act on, and which files must change alongside a dashboard form. Read BEFORE opening the target file whenever you add, rename, retype, remove or change the meaning of ANY admin form field or admin section, or edit anything under `server/assistant/**` or `src/features/admin/assistant/**` — changing an existing input can silently break an entity's `fillFieldsSchema`/`mergeDraft`/`validate`/`reviewChangeRows`, not just adding a new one. Keep this file up to date automatically, without asking the user first.
---

# AI assistant (Claude chatbox)

The assistant (`src/features/admin/assistant/`) can only act on dashboard
functionality registered in `server/assistant/registry.ts` — each manageable
"entity" (Product, Event, User, ...) is a separate adapter file in
`server/assistant/entities/` implementing the `AssistantEntity` contract in
`server/assistant/types.ts`.

## When adding new functionality

Whenever new interactive dashboard functionality is added (a new manageable
field on an existing entity's form, a new form, or an entire new admin section),
add or update the matching entry in `server/assistant/registry.ts` in the same
change — otherwise the assistant silently falls behind what the manual UI can
actually do. A field the assistant doesn't know about isn't a bug on its own,
but a whole new CRUD-able section with no adapter at all is a gap worth closing.

**Adding a whole new entity is a multi-file checklist — do not work from memory.**
`registry.ts`'s own doc comment carries the authoritative 7-step version (this
file deliberately does not duplicate it, because that comment is kept current
with the code and this one would drift). Read it first.

## When changing an *existing* input

This is the case that gets missed. Any change to an existing admin input — a
field renamed/removed/retyped, a new option added to an enum/select, a field's
meaning changed, a value moved to a different shape — can affect the matching
entity's `fillFieldsSchema`/`mergeDraft`/`validate` (wrong enum values, a stale
field name, a schema that no longer matches what `mergeDraft` expects) or its
review-row builder in `reviewChangeRows.ts`. Whenever touching an existing input
that already has an assistant entity, check whether that entity's file needs a
matching update in the same change, not just when adding something new.

## Confabulation risk

A field whose valid values depend on live current state (what's currently set, a
name picked from a live list) rather than a small fixed enum is a confabulation
risk on local/weaker models — a local model has been confirmed fabricating a
value for exactly this kind of field even when the message never addressed it,
wrongly overwriting real data. Consider adding such fields to that entity's own
`confabulationRiskFields` (strips them from the schema under `'safe'`/local-default
posture) rather than assuming a nullable field is automatically safe to leave in.

## Invariant: the assistant never writes app data

Every one of its own routes (`/assistant/intent`, `/assistant/select-item`,
`/assistant/fill-fields`) only ever *proposes a draft*; the actual write always
goes through the same existing save/delete path the manual UI already uses (see
`server/assistant/types.ts`'s own module doc comment). Don't add a write inside
`server/assistant/*` to "simplify" a future entity — that would break this invariant.
