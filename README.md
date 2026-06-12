# Wraps & Coffee

The website for Wraps & Coffee, a cozy cafe serving wraps, baguettes, pizza, nacho plates, salads and a varied selection of coffee and drinks. Built on a Vite + React + TypeScript template with routing, state management, a reusable component library, theming, and internationalization set up out of the box.

## Features

- **Home page** (`/`) with a full-bleed hero introduction featuring the next upcoming event (with image, sourced from `src/data/events.json`) — on wide screens this expands into a gallery showing the next 3 upcoming events, with a large picture that swaps to match whichever event is hovered — a preview of the menu offering (salads, wraps, baguettes, pizza, nacho plates, coffee & drinks) linking to the full menu, and a "Find us" section with an OpenStreetMap embed of the cafe's location. The hero sits behind a transparent header; scrolling down animates the hero out of view and reveals the "Wraps & Coffee" name in the header, while the nav links stay fixed in a sticky pill.
- **Event details modal**: clicking an upcoming event on the Home page opens a modal (`EventDetailsModal`) with its image, date/time (including a "Postponed" badge for postponed events), description, price, capacity/spots filled, menu highlights, and — for events that require registration — an in-modal sign-up form (name and email) with a confirmation message on submit.
- **Menu page** (`/menu`) with the full menu, grouped into categories (salads, wraps, baguettes, pizza, nachos, coffee & drinks), each item with a name, description and price. Linking to `/menu#<category>` (e.g. from the Home page) scrolls to that category.
- **Events page** (`/events`) listing recurring events at the cafe (poetry night, movie nights, live acoustic sessions, coffee tastings).
- **Cafe theme** using the Wraps & Coffee colour palette (black, mustard, dark greyish-green, burgundy, lime green) with `DynaPuff` headings, `Pangolin` accents/sub-headings and `Quicksand` body text, in both light and dark mode (`src/styles`).
- **Vite + React + TypeScript** for fast dev/build tooling.
- **Routing** via `react-router-dom`, with routes defined in `main.tsx`.
- **State management** via Redux Toolkit (`react-redux`) and an Axios client, demonstrated by the `auth` feature (`authSlice.ts` / `authApi.ts`).
- **Reusable UI components** (`Button`, `Input`, `Card`, `Badge`, `Alert`, `Modal`, `EventDetailsModal`, `Spinner`, `Checkbox`, `LocationMap`, and more) exported from `src/components`, with a live preview at the `/components` route.
- **Mock data** for the menu and cafe events lives in `src/data/menu.json` and `src/data/events.json`, standing in for a future API. `src/utils/events.ts` computes the next occurrence of each event, including recurring weekly events, postponed dates and cancelled occurrences.
- **Light / dark theme** that follows the OS preference by default, can be toggled in the footer, and persists the choice (`src/hooks/useTheme.ts`, `ThemeToggle`).
- **Internationalization (i18n)** with English and Norwegian included, switchable via the `LanguageSwitcher` in the footer and easy to extend with more languages (`src/i18n`).
- **Footer** with company details (name, organization number, address), the cafe tagline, copyright, and the language/theme controls.

## Tech stack

- **[Vite](https://vitejs.dev/)** — dev server and build tooling.
- **[React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)** — UI and type safety.
- **[react-router-dom](https://reactrouter.com/)** — client-side routing.
- **[Redux Toolkit](https://redux-toolkit.js.org/) + [react-redux](https://react-redux.js.org/)** — global state management.
- **[Axios](https://axios-http.com/)** — HTTP client (`src/lib/axiosClient.ts`).
- **[Sass](https://sass-lang.com/)** — component styling with theme variables (`src/styles`).
- **[Framer Motion](https://www.framer.com/motion/)** — animations (e.g. the `TranslatedText` fade transition).
- **[Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/)** — OpenStreetMap embed showing the cafe's location (`LocationMap`).
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
  data/           # Mock data standing in for a future API
    menu.json
    events.json
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
    Menu.tsx
    Events.tsx
    Profile.tsx
    Components.tsx
    ...
  styles/         # Global styles and theme tokens/variables
  utils/          # Pure helper functions (e.g. event occurrence/date logic)
  App.tsx         # App shell: layout, nav, theme/language controls
  main.tsx        # Entry point: providers and route definitions
```
