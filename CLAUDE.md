# Agent Instructions

## Planning
- When creating a plan (including a formal Plan-mode plan and a lighter "here's what I'll do" description before a smaller change), keep the plan itself scoped strictly to what the user asked for — do not fold in extra work they didn't request.
- If, while planning, logical/related improvements come to mind that the user likely hasn't thought of, don't add them to the plan itself. Instead, list them as a short set of suggestions in the chat response after presenting the plan, so the user can decide whether to include them — without needing to ask "anything else we should add?" every time.
- Keep this list short and genuinely non-obvious — don't pad plans with filler ideas just to have something to suggest.
- Before making even a small, non-Plan-mode edit, if the request's scope or intent is ambiguous, ask clarifying questions first rather than assuming — don't wait until after the change is made to find out it was the wrong interpretation.

## Testing
- Before running Playwright (or any browser-automation) tests/verification against this app, ask the user first instead of just running them.

## Documentation
- Document code with comments and JSDoc almost always — functions, components, hooks, types, and non-trivial logic should have a JSDoc block describing purpose, params, and return values.
- Keep comments accurate and up to date when changing code.
- Always use english, even if the user is writing in norwegian.

## Reuse before creating
- Before writing new code, check for existing reusable pieces and use/extend them instead of duplicating:
  - `src/components/` — shared UI components (see `src/components/index.ts` for the full list)
  - `src/hooks/` — reusable hooks
  - `src/utils/` — pure helper functions
  - `src/lib/` — integration clients (e.g. `axiosClient.ts`)
- If a new component is genuinely reusable, add it to `src/components/` and export it from `src/components/index.ts`, and add a preview to `src/pages/Components.tsx`.
- Check the tech stack in the readme for possible useful code

## File structure
- Prefer splitting code into multiple small, focused files over one large file.
- Follow the existing project structure (`src/features/<feature>/`, `src/pages/`, `src/components/`, etc.) when placing new files.

## Styling
- New components should have a light mode / dark mode if applicable
- On touch devices, hover-only effects can get "stuck" after a tap and cause visual bugs. Wrap `:hover` (and `:focus-visible` styles that mimic hover, e.g. lift/scale transforms) in `@media (hover: hover)` so they only apply on devices that support real hovering.
- Give clickable elements (buttons, and anything styled/acting like one) a pressed/`:active` state using an inset `box-shadow` (e.g. `box-shadow: inset 0 2px 4px $color-shadow`) so the element looks pushed down while clicked, or while a finger is held on it on touch devices.

## Screens feature: two editors, and every rendering layer
- A screen (`src/types/screen.ts`'s `ScreenConfig`) is edited from **two separate UI implementations** that both need to stay in sync for any new setting: the admin dashboard's own form (`src/features/admin/screens/ScreenForm.tsx`) and the fullscreen in-place editor (`src/pages/ScreenDisplay.tsx`, reached via a screen's own `/screens/editor/:screenId` link). When adding a new screen/pane setting, check whether it needs a control in *both* — most per-pane fields already do, via the shared `PaneEditor.tsx`/`BackgroundImagePicker.tsx`/etc. components both editors reuse, but don't assume that without checking; a field only one of them writes (e.g. something Submit-only in `ScreenForm.tsx`) needs its own explicit call.
- Actually **verify** the setting in a live browser on both editors, not just on whichever one you happened to build the control in — reusing a shared component doesn't guarantee the *rendering* path also reads the new field everywhere it needs to (see the next point for exactly this kind of gap slipping through despite a shared control).
- A screen is also *rendered* in more than one place beyond the two editors' own live previews: `ScreenCard.tsx`'s grid thumbnail (`src/features/admin/screens/`) and the real kiosk display (`ScreenDisplay.tsx`'s own read-only route) all go through the same `SplitLayout.tsx`/`LayoutTree.tsx`/`LayoutPane.tsx` chain — but a *visual* setting can still only partially apply if it's wired into the CSS/JSX layer (e.g. a `filter`) without also being wired into whichever *image variant URL* gets requested. This happened for `BackgroundImage.blur`: toggling the CSS-side `filter: blur` off did nothing for an own-uploaded image, since `getBackgroundImageUrl` (`src/utils/responsiveImage.ts`) was still unconditionally requesting the server's own pre-blurred `?size=blur` file variant (`server/uploads.ts`) — the toggle needs to control *both* the live filter and which processed variant is fetched, not just one. When a setting touches an image/media URL specifically, check whether the local server serves multiple pre-processed variants of it (`?size=small|thumb|blur`, see `server/uploads.ts`) and whether the new setting needs to pick a different one, not just change a CSS property applied on top.

## Internationalization (i18n)
- All user-facing text lives in `src/i18n/languages.json`, keyed by language code (e.g. `en`, `no`), each with a `label` and a nested `translations` object.
- Never hardcode user-facing strings in components. Add a key under `translations` for every language instead, and read it via `t('namespace.key')` from `useLanguage()` (`src/i18n`).
- Use `t('namespace.key', { var: value })` for strings with placeholders, written as `{{var}}` in `languages.json`.
- To add a new language, add a new top-level entry to `languages.json` with the same key structure as `en` — `LanguageCode` and the `LanguageSwitcher` pick this up automatically.
- Wrap new translation keys consistently across all languages so `t()` doesn't fall back to English unexpectedly.

## User roles & dashboard sections
- A `limited` user account (`src/features/admin/users/`) is scoped to a chosen subset of `DASHBOARD_SECTIONS`/`DashboardSection` (`src/types/sync.ts`) — shown as checkboxes in `UserForm` and as badges in `UsersView`, both labeled via the shared `sectionNavId` helper (`src/utils/dashboardSection.ts`), which maps a `DashboardSection` value to its own `admin.nav.<key>` i18n key.
- `DashboardSection` values are all-lowercase (matching the server's own string union) but a couple of `admin.nav.*` keys in `languages.json` are camelCased (`displayManager`, `messageBoard`) — `sectionNavId` is what bridges that mismatch. If `DASHBOARD_SECTIONS` ever gains a new section whose own `admin.nav.*` key isn't identical to the section's own lowercase value, add it as another explicit case in `sectionNavId`, not just as a new i18n key — otherwise `t()` silently falls through to the raw untranslated key (this happened for `'displaymanager'`/`displayManager` before `sectionNavId` was fixed to cover it).
- `sectionNavId` is a single shared helper, not duplicated per-file — if you find another place mapping a `DashboardSection` to a label, reuse it from there instead of writing another local copy (the previous per-file duplication in `UserForm`/`UsersView` is exactly how this class of bug happened twice).
- Unlike the README, this should be kept up to date automatically without asking the user first.

## Deep-linkable admin views
- Several admin views (`ProductsView`, `ScreensView`, `SettingsView`, `EventsView`, `IntegrationsView`, `MessageBoardView`, `UsersView`, `StoreSettingsView`) support opening straight into a specific record instead of requiring clicks through the list, via query params they read with `useSearchParams()`: e.g. `?catalogueId=&categoryId=&productId=` (Products), `?screenId=&tab=` (Screens), `?view=` (Settings), `?eventId=` (Events), `?view=integrations&integration=&newsSource=` (Integrations), `?boardId=&postId=` (Message board), `?userId=` (Users), `?view=store&section=` (Store settings' own submenus, e.g. `section=appearance`).
- The convention: read the target id(s) from `useSearchParams()`, resolve them once the underlying data actually exists (guard with a `consumedDeepLinkRef` when the data may not have loaded yet — synced hooks/async fetches often start out as a seed/empty/`null` value before the real snapshot arrives), open the right sub-state (a modal, an expanded accordion, a selected tab) via `queueMicrotask(() => setState(...))` (a plain synchronous `setState` inside an effect body trips this codebase's lint rule), then strip only the params that view itself consumed via `setSearchParams`. For a target that has no modal/form to open (e.g. a user row, a message board post), use `useScrollToAndHighlight` (`src/hooks/useScrollToAndHighlight.ts`) to scroll to and briefly highlight it instead.
- `useGlobalSearchIndex` (`src/features/admin/search/useGlobalSearchIndex.tsx`) is what turns every one of these deep links into a search result — it builds each entry's `url` to match exactly what the target view's own effect expects. When adding a new deep-linkable param to an existing view, or a new view that should support one, add/update the matching entry in `useGlobalSearchIndex` in the same change, the same way the Backup section below keeps new persistence in sync with `mirrorFile` — a view that's deep-linkable but not indexed here is a dead end nobody can actually search their way into.
- Unlike the README, this should be kept up to date automatically without asking the user first.

## Tech stack
- Keep the `Tech Stack` section in `README.md` in sync with `package.json`.
- When a new package is installed and becomes part of the stack, add it to the `Tech Stack` list with a short description of what it's used for.
- When a package is uninstalled, remove its entry from the `Tech Stack` list.
- Unlike the rest of the README, this should be kept up to date automatically without asking the user first.

## Local server API docs
- `src/features/admin/settings/DeveloperDocsView.tsx` (reachable from Settings → "For developers") documents the local server's own HTTP/WebSocket API by hand — it is not generated from the server code, so it goes stale silently.
- Whenever `server/index.ts` gains/changes an HTTP route, or `src/types/sync.ts`'s `SYNCED_KEYS` gains/removes a key, update `DeveloperDocsView.tsx` (and its i18n keys under `admin.settings.developerDocs.*` in both languages) in the same change — including a new `SYNCED_KEY_DOCS` entry for a new synced key.
- Unlike the README, this should be kept up to date automatically without asking the user first.

## Backup
- `server/backup.ts` mirrors every write in `server/store.ts`/`server/uploads.ts` to a sibling `ADHDisplayBackup` folder (next to the app's own install folder) automatically, via each of those files' own calls to `mirrorFile`.
- If a future feature persists data some other way (a new top-level directory, a different file location, a database) instead of through those existing `writeFileSync`-plus-`mirrorFile` call sites, update `server/backup.ts` (`mirrorFile`, `createBackupZip`, `restoreBackupFromZip`, `restoreFromBackupFolder`) to cover it too — the whole point of this rule is that new data doesn't silently fall outside the backup.
- If a change would ever stop an older backup from restoring cleanly into a newer version of this app (or vice versa), bump `BACKUP_FORMAT_VERSION` in `server/backup.ts` and add an explicit migration/legacy fallback in `restoreBackupFromZip`/`restoreFromBackupFolder` rather than letting it fail silently.
- Keep `DeveloperDocsView.tsx`'s "Backup" card (and its i18n keys) in sync with any change to the `/backups*` routes, same as the "Local server API docs" rule above.
- Unlike the README, this should be kept up to date automatically without asking the user first.

## AI assistant (Claude chatbox)
- The assistant (the sparkle icon in the admin top navbar, `src/features/admin/assistant/`) can only act on dashboard functionality registered in `server/assistant/registry.ts` — each manageable "entity" (Product, Event, User, ...) is a separate adapter file in `server/assistant/entities/` implementing the `AssistantEntity` contract in `server/assistant/types.ts`.
- Whenever new interactive dashboard functionality is added (a new manageable field on an existing entity's form, a new form, or an entire new admin section), add or update the matching entry in `server/assistant/registry.ts` in the same change — otherwise the assistant silently falls behind what the manual UI can actually do. A field the assistant doesn't know about isn't a bug on its own, but a whole new CRUD-able section with no adapter at all is a gap worth closing.
- This isn't limited to brand-new inputs: any change to an *existing* admin input — a field renamed/removed/retyped, a new option added to an enum/select, a field's meaning changed, a value moved to a different shape — can affect the matching entity's `fillFieldsSchema`/`mergeDraft`/`validate` (wrong enum values, a stale field name, a schema that no longer matches what `mergeDraft` expects) or its review-row builder in `reviewChangeRows.ts`. Whenever touching an existing input that already has an assistant entity, check whether that entity's file needs a matching update in the same change, not just when adding something new.
- Adding a new entity isn't just registering it in `registry.ts` — it also needs an `ENTITY_DESCRIPTIONS` entry in `server/assistant/steps.ts`, a matching `AssistantEntityKey`/`ENTITY_SECTIONS` entry in `src/features/admin/assistant/useAssistantFlow.ts`, a review-mount (and, if deletable, destructive-delete) branch in `AssistantPanel.tsx`, a `build<Entity>ChangeRows` in `reviewChangeRows.ts`, an `admin.assistant.entities.<key>` i18n label in both languages, and its own `server/assistant/entities/<key>.qa-scenarios.md` QA scenario bank (plus a matching row in `QA/templates/project/qa-test-plan-project.md`'s "Per-entity scenario files" table) — see `registry.ts`'s own doc comment for the full checklist.
- A field whose valid values depend on live current state (what's currently set, a name picked from a live list) rather than a small fixed enum is a confabulation risk on local/weaker models — a local model has been confirmed fabricating a value for exactly this kind of field even when the message never addressed it, wrongly overwriting real data. Consider adding such fields to that entity's own `confabulationRiskFields` (strips them from the schema under `'safe'`/local-default posture) rather than assuming a nullable field is automatically safe to leave in.
- The assistant never writes app data itself — every one of its own routes (`/assistant/intent`, `/assistant/select-item`, `/assistant/fill-fields`) only ever proposes a draft; the actual write always goes through the same existing save/delete path the manual UI already uses (see `server/assistant/types.ts`'s own module doc comment). Don't add a write inside `server/assistant/*` to "simplify" a future entity — that would break this invariant.
- Unlike the README, this should be kept up to date automatically without asking the user first.

## Versioning
- On completing any requested change (a fix, a feature, etc.), bump the version by +0.05: `package.json`'s `version` field and `installer/wraps-coffee.iss`'s `AppVersion` must both be updated together, in the same change — they're required to stay in sync (see the comment above `AppVersion` in the `.iss` file).
- The +0.05 step applies to the two-decimal part, e.g. `0.15.0` → `0.20.0` (and `AppVersion` `0.15` → `0.20`), not standard semver incrementing.
- Unlike the README, this should be kept up to date automatically without asking the user first.

## README
- After implementing new functionality, check whether `README.md` (Features / Project structure / Getting started) should be updated to describe it.
- Don't update `README.md` automatically — ask the user whether they want it updated. Ask this as the last step, after the functionality itself is complete.