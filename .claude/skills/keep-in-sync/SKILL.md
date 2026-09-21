---
name: keep-in-sync
description: Two hand-maintained things that go stale silently — the local server's API docs page, and the automatic backup mirror. Read BEFORE opening the target file whenever you add or change an HTTP/WebSocket route in `server/index.ts`, add/remove a key in `src/types/sync.ts`'s `SYNCED_KEYS`, change the `/backups*` routes, or persist data in any new way (a new top-level directory, a different file location, a database) rather than through the existing `writeFileSync`-plus-`mirrorFile` call sites in `server/store.ts`/`server/uploads.ts`. Keep this file up to date automatically, without asking the user first.
---

# Local server API docs

- `src/features/admin/settings/DeveloperDocsView.tsx` (reachable from Settings →
  "For developers") documents the local server's own HTTP/WebSocket API **by hand**
  — it is not generated from the server code, so it goes stale silently.
- Whenever `server/index.ts` gains/changes an HTTP route, or `src/types/sync.ts`'s
  `SYNCED_KEYS` gains/removes a key, update `DeveloperDocsView.tsx` (and its i18n
  keys under `admin.settings.developerDocs.*` in **both** languages) in the same
  change — including a new `SYNCED_KEY_DOCS` entry for a new synced key.

# Backup

- `server/backup.ts` mirrors every write in `server/store.ts`/`server/uploads.ts`
  to a sibling `ADHDisplayBackup` folder (next to the app's own install folder)
  automatically, via each of those files' own calls to `mirrorFile`.
- If a future feature persists data some other way (a new top-level directory, a
  different file location, a database) instead of through those existing
  `writeFileSync`-plus-`mirrorFile` call sites, update `server/backup.ts`
  (`mirrorFile`, `createBackupZip`, `restoreBackupFromZip`, `restoreFromBackupFolder`)
  to cover it too — the whole point of this rule is that new data doesn't silently
  fall outside the backup.
- If a change would ever stop an older backup from restoring cleanly into a newer
  version of this app (or vice versa), bump `BACKUP_FORMAT_VERSION` in
  `server/backup.ts` and add an explicit migration/legacy fallback in
  `restoreBackupFromZip`/`restoreFromBackupFolder` rather than letting it fail silently.
- Keep `DeveloperDocsView.tsx`'s "Backup" card (and its i18n keys) in sync with any
  change to the `/backups*` routes, same as the API docs rule above.

`server/backup.ts`'s own header comments explain why it has zero imports from
`store.ts`/`uploads.ts` (circular import) and why the legacy `WrapsCoffeeBackup`
folder name is still read from — read those before restructuring it.
