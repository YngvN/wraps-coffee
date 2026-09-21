# Agent Instructions

## Always

- **English** in all code, comments and docs, even when the user writes Norwegian.
- **JSDoc** on functions, components, hooks, types and non-trivial logic. Keep existing comments true when you change the code they describe.
- **Reuse before creating.** Check `src/components/` (listed in `index.ts`), `src/hooks/`, `src/utils/` (pure helpers) and `src/lib/` (integration clients) first. A genuinely reusable new component goes in `src/components/`, is exported from `index.ts`, and gets a preview in `src/pages/Components.tsx`.
- **Small focused files**, placed per the existing structure (`src/features/<feature>/`, `src/pages/`, `src/components/`).
- **No hardcoded user-facing strings.** Add the key under `translations` for *every* language in `src/i18n/languages.json` and read it via `t('namespace.key')` from `useLanguage()`; placeholders are `{{var}}`, passed as `t('k', { var })`.
- **Styling:** light + dark mode; wrap `:hover` (and hover-mimicking `:focus-visible` transforms) in `@media (hover: hover)` so they don't stick after a tap; give anything clickable a pressed `:active` state via an inset `box-shadow`.
- **Ask first** before running Playwright or any browser automation against this app.
- **Plan only what was asked.** Related ideas the user didn't request go in a short suggestions list *after* the plan, never folded into it. If scope or intent is ambiguous, ask before editing, not after.
- Before reading more than ~3 files just to **locate, classify or summarise**, use the `local-delegation` skill. Not when you'll end up reading the file anyway.
- Labelling a `DashboardSection`: always `sectionNavId` (`src/utils/dashboardSection.ts`), never a local copy — its JSDoc explains why.

## On finishing any change

- **Bump the version.** Format is `0.x.n`; increment `n` only (`x` is manual, on request). All five must match, changed together: `package.json`, `installer/adhdisplay.iss` (`AppVersion`), `adhdisplay-companion/package.json`, `adhdisplay-companion/app.json` (`expo.version`), `installer/adhdisplay-companion.iss` (`AppVersion`).
- Package installed/uninstalled → add/remove its entry in `README.md`'s **Tech Stack** list with a one-line description. Do this automatically.
- As the **last** step, ask the user whether `README.md` (Features / Project structure / Getting started) should be updated. Never update it unasked — unlike everything else here and in the skills below, which is kept current automatically.

## Load the skill before touching these

| Working on | Load |
| --- | --- |
| Screens, panes, `ScreenConfig`, pane backgrounds/images, `SplitLayout`/`LayoutTree`/`LayoutPane` | `screens` |
| An admin view's deep links / query params / routes, or the global search index | `admin-deep-links` |
| **Any** admin form field (new *or* changed), or `server/assistant/**` | `assistant-entities` |
| `server/index.ts` routes, `SYNCED_KEYS`, the `/backups*` routes, or persisting data a new way | `keep-in-sync` |

Read the skill *before* opening the target file — each one exists because the
rule was missed at least once, and each lists files that don't look related.
