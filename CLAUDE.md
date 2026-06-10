# Agent Instructions

## Documentation
- Document code with comments and JSDoc almost always — functions, components, hooks, types, and non-trivial logic should have a JSDoc block describing purpose, params, and return values.
- Keep comments accurate and up to date when changing code.

## Reuse before creating
- Before writing new code, check for existing reusable pieces and use/extend them instead of duplicating:
  - `src/components/` — shared UI components (see `src/components/index.ts` for the full list)
  - `src/hooks/` — reusable hooks
  - `src/utils/` — pure helper functions
  - `src/lib/` — integration clients (e.g. `axiosClient.ts`)
- If a new component is genuinely reusable, add it to `src/components/` and export it from `src/components/index.ts`, and add a preview to `src/pages/Components.tsx`.

## File structure
- Prefer splitting code into multiple small, focused files over one large file.
- Follow the existing project structure (`src/features/<feature>/`, `src/pages/`, `src/components/`, etc.) when placing new files.

## Styling
- New components should have a light mode / dark mode if applicable

## Internationalization (i18n)
- All user-facing text lives in `src/i18n/languages.json`, keyed by language code (e.g. `en`, `no`), each with a `label` and a nested `translations` object.
- Never hardcode user-facing strings in components. Add a key under `translations` for every language instead, and read it via `t('namespace.key')` from `useLanguage()` (`src/i18n`).
- Use `t('namespace.key', { var: value })` for strings with placeholders, written as `{{var}}` in `languages.json`.
- To add a new language, add a new top-level entry to `languages.json` with the same key structure as `en` — `LanguageCode` and the `LanguageSwitcher` pick this up automatically.
- Wrap new translation keys consistently across all languages so `t()` doesn't fall back to English unexpectedly.

## Tech stack
- Keep the `Tech Stack` section in `README.md` in sync with `package.json`.
- When a new package is installed and becomes part of the stack, add it to the `Tech Stack` list with a short description of what it's used for.
- When a package is uninstalled, remove its entry from the `Tech Stack` list.
- Unlike the rest of the README, this should be kept up to date automatically without asking the user first.

## README
- After implementing new functionality, check whether `README.md` (Features / Project structure / Getting started) should be updated to describe it.
- Don't update `README.md` automatically — ask the user whether they want it updated. Ask this as the last step, after the functionality itself is complete.