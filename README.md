# vite-template

A template for Vite + React + TypeScript projects, with routing, state management, a reusable component library, theming, and internationalization set up out of the box.

## Features

- **Vite + React + TypeScript** for fast dev/build tooling.
- **Routing** via `react-router-dom`, with routes defined in `main.tsx`.
- **State management** via Redux Toolkit (`react-redux`) and an Axios client, demonstrated by the `auth` feature (`authSlice.ts` / `authApi.ts`).
- **Reusable UI components** (`Button`, `Input`, `Card`, `Badge`, `Alert`, `Modal`, `Spinner`, `Checkbox`, and more) exported from `src/components`, with a live preview at the `/components` route.
- **Light / dark theme** that follows the OS preference by default, can be toggled in the header, and persists the choice (`src/hooks/useTheme.ts`, `ThemeToggle`).
- **Internationalization (i18n)** with English and Norwegian included, switchable via the `LanguageSwitcher` and easy to extend with more languages (`src/i18n`).

## Tech stack

- **[Vite](https://vitejs.dev/)** — dev server and build tooling.
- **[React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)** — UI and type safety.
- **[react-router-dom](https://reactrouter.com/)** — client-side routing.
- **[Redux Toolkit](https://redux-toolkit.js.org/) + [react-redux](https://react-redux.js.org/)** — global state management.
- **[Axios](https://axios-http.com/)** — HTTP client (`src/lib/axiosClient.ts`).
- **[Sass](https://sass-lang.com/)** — component styling with theme variables (`src/styles`).
- **[Framer Motion](https://www.framer.com/motion/)** — animations (e.g. the `TranslatedText` fade transition).
- **[ESLint](https://eslint.org/)** — linting.

## Getting started

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm run lint     # run eslint
```

## Project structure

```
public/           # Static files served as-is
src/
  app/            # Redux store and typed hooks
  assets/         # Images/icons that aren't served directly
  components/     # Reusable UI components (see src/components/index.ts)
  features/       # Domain-specific feature areas (e.g. authentication)
    auth/
      AuthForm.tsx
      authSlice.ts
      authApi.ts
  hooks/          # Custom React hooks
  i18n/           # Language/translation setup (languages.json, useLanguage)
  lib/            # Integration clients (e.g. Axios)
  pages/          # Route-level views
    Home.tsx
    Profile.tsx
    Components.tsx
    ...
  styles/         # Global styles and theme tokens/variables
  App.tsx         # App shell: layout, nav, theme/language controls
  main.tsx        # Entry point: providers and route definitions
```
