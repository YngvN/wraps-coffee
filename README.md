# Wraps & Coffee

The website for Wraps & Coffee, a cozy cafe serving wraps, baguettes, pizza, nacho plates, salads and a varied selection of coffee and drinks. Built on a Vite + React + TypeScript template with routing, state management, a reusable component library, theming, and internationalization set up out of the box.

## Features

- **Home page** (`/`) with a full-bleed hero introduction, a "What's happening" section (`EventGallery`) previewing the next 5 upcoming events (sourced from `src/data/events.json`) — a titled column list on narrow screens, or a gallery on wide screens with a large picture that fades in to match whichever event is hovered or focused, and stays on the last one viewed — a full-screen "Good food that fills you up" section with a cross-fading carousel of customer reviews (`ReviewCarousel`, sourced from `src/data/reviews.json`) alongside a short summary and an "Order now" button, an Instagram post carousel (`InstagramCarousel`), and a "Find us" section with an OpenStreetMap embed of the cafe's location. The hero sits behind a transparent header; scrolling down animates the hero out of view and reveals the "Wraps & Coffee" name in the header, while the nav links stay fixed in a sticky pill.
- **Event details modal**: clicking an upcoming event on the Home page opens a modal (`EventDetailsModal`) with its image, date/time (including a "Postponed" badge for postponed events), description, price, capacity/spots filled, menu highlights, and — for events that require registration — an in-modal sign-up form (name and email) with a confirmation message on submit.
- **Menu page** (`/menu`) with the full menu, grouped into categories (salads, wraps, baguettes, pizza, nachos, coffee & drinks), each item with a name, description and price. Linking to `/menu#<category>` (e.g. from the Home page) scrolls to that category.
- **Events page** (`/events`) with a month/week calendar (`EventCalendar`, sourced from `src/data/events.json`) showing event titles per day — including every occurrence of recurring events — navigable by period with Today/Week/Month controls, plus a grid of upcoming-event tiles (image, category, status badge, date/time, description and price/capacity) below it. Calendar entries and tiles both open the shared `EventDetailsModal`.
- **Cafe theme** using the Wraps & Coffee colour palette (black, mustard, dark greyish-green, burgundy, lime green) with `Fredericka the Great` headings, `Pangolin` accents/sub-headings and `Quicksand` body text, in both light and dark mode (`src/styles`).
- **Vite + React + TypeScript** for fast dev/build tooling.
- **Routing** via `react-router-dom`, with routes defined in `main.tsx`.
- **State management** via Redux Toolkit (`react-redux`) and an Axios client, demonstrated by the `auth` feature (`authSlice.ts` / `authApi.ts`).
- **Reusable UI components** (`Button`, `Input`, `Card`, `Badge`, `Alert`, `Modal`, `EventCalendar`, `EventDetailsModal`, `EventGallery`, `ReviewCarousel`, `InstagramCarousel`, `Spinner`, `Checkbox`, `LocationMap`, and more) exported from `src/components`, with a live preview at the `/components` route.
- **Mock data** for the menu, cafe events, reviews and everything editable from the admin dashboard (products, category prices, messages, ratings, Instagram posts, contact info, screens, text size presets) lives in `src/data/*.json`, standing in for a future API — each seeds a `useLocalStorage`-backed hook in `src/hooks` so admin edits persist across reloads without a real backend. `src/utils/events.ts` computes event occurrences — the next occurrence of each event for previews, or every occurrence within a date range for the calendar — including recurring weekly events, postponed dates and cancelled occurrences; `src/utils/calendar.ts` provides the underlying month/week grid date math.
- **Light / dark theme** that follows the OS preference by default, can be toggled in the footer, and persists the choice (`src/hooks/useTheme.ts`, `ThemeToggle`).
- **Internationalization (i18n)** with English and Norwegian included, switchable via the `LanguageSwitcher` in the footer and easy to extend with more languages (`src/i18n`).
- **Footer** with company details (name, organization number, address), the cafe tagline, copyright, the language/theme controls, and a subtle link to the owner admin dashboard.
- **Owner admin dashboard** (`/admin`, `src/features/admin`) — a placeholder-login-gated (no real auth yet) area with a sticky sidebar nav for managing the site's own data, all backed by localStorage "placeholder databases" (see `src/hooks`) until a real API exists:
  - **Overview** — mock revenue/orders/customer stat tiles with sparkline trends and a top-sellers list.
  - **Messages** — inbox for contact-form submissions, markable as read.
  - **Products** — full menu CRUD, bilingual (English/Norwegian) name/description, per-item or category-default pricing, allergen checkboxes, availability toggle.
  - **Events** — full CRUD for cafe events (recurring, postponed, cancelled occurrences; registration on/off).
  - **Reviews & ratings** — edit the Home page's review carousel content and the platform rating numbers shown alongside it.
  - **Instagram** — manage which posts appear in the `InstagramCarousel`.
  - **Contact info** — edit the footer/contact details shown across the site.
  - **Orders** — placeholder view (no order-taking backend yet).
  - **Screens** — the digital signage manager described below.
- **Screens (digital signage)** (`/screens/:screenId`, `src/features/screens` + `src/features/admin/screens`) — configure any number of fullscreen kiosk displays (e.g. extra monitors/TVs) from the admin dashboard, each showing up to 4 independent content slots:
  - Per-slot content: a menu category, the upcoming-events list, a single centered image (logo, Instagram photo, etc. via URL), or nothing — freely changed, added to, or removed without ever losing a hidden slot's own settings.
  - Per-slot slideshow rotation (a slot can cycle through several slides in place) on a shared, screen-wide timer, with a fade or slide transition.
  - An explicit "number of slots" (1-4) and on-screen arrangement (side-by-side/stacked for 2, a featured pane + two small ones for 3, a 2x2 grid for 4), independent of whether each slot has content yet.
  - Text-size controls at every level — the whole screen, one slot, or a single slide's own override — editable either live on the display itself (`ScreenDisplay.tsx`, with "Restore previous"/"Reset" and a live percentage-based scaler) or fully from the admin dashboard's tabbed screen editor, so a screen can be configured entirely without ever opening it.
  - Background color per screen and per slot (a fixed brand-palette swatch picker, independent of the site's own light/dark theme; a slot's default is transparent, showing the screen's color through).
  - Live sync across same-browser tabs/windows via a `storage`-event-enhanced `useLocalStorage` (explicitly same-browser only, not a real backend) and offline resilience via the PWA app-shell precache, so a kiosk display keeps working through a network drop.

## Tech stack

- **[Vite](https://vitejs.dev/)** — dev server and build tooling.
- **[React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)** — UI and type safety.
- **[react-router-dom](https://reactrouter.com/)** — client-side routing.
- **[Redux Toolkit](https://redux-toolkit.js.org/) + [react-redux](https://react-redux.js.org/)** — global state management.
- **[Axios](https://axios-http.com/)** — HTTP client (`src/lib/axiosClient.ts`).
- **[Sass](https://sass-lang.com/)** — component styling with theme variables (`src/styles`).
- **[Framer Motion](https://www.framer.com/motion/)** — animations (e.g. the `TranslatedText` fade transition).
- **[Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/)** — OpenStreetMap embed showing the cafe's location (`LocationMap`).
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — precaches the built app so it can reload fully offline (used so screen displays keep working through a network drop; configured in `vite.config.ts`).
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
    reviews.json
    products.json
    categoryPrices.json
    messages.json
    ratings.json
    instagram.json
    contactInfo.json
    screens.json
    textSizePresets.json
  features/       # Domain-specific feature areas
    auth/
      AuthForm.tsx
      authSlice.ts
      authApi.ts
    admin/        # Owner dashboard (/admin), gated by a placeholder login
      layout/     # AdminLayout, AdminDashboard, sticky AdminSidebarNav
      login/
      overview/
      messages/
      products/
      events/
      reviews/    # reviews + platform ratings
      instagram/
      contact/
      orders/     # placeholder — no order-taking backend yet
      screens/    # ScreensView (list) + tabbed ScreenForm (per-slot settings)
    screens/      # Shared by the admin screen editor and the public display:
                  # SplitLayout, CategorySlide/EventsSlide/ImageSlide, SlotContent,
                  # TextSizeEditor, GlobalTextSizeScaler, SlotEditor, SlotFieldGroup,
                  # BackgroundColorPicker, FullscreenToggle, ScreenToolbar
  hooks/          # Custom React hooks, incl. one useLocalStorage-backed hook per admin dataset
  i18n/           # Language/translation setup (languages.json, useLanguage)
  lib/            # Integration clients (e.g. Axios)
  pages/          # Route-level views
    Home.tsx
    Menu.tsx
    Events.tsx
    Profile.tsx
    Components.tsx
    ScreenDisplay.tsx  # Public fullscreen kiosk display, /screens/:screenId
    ...
  styles/         # Global styles and theme tokens/variables
  utils/          # Pure helper functions (e.g. event occurrence/date logic, calendar grid math)
  App.tsx         # App shell: layout, nav, theme/language controls
  main.tsx        # Entry point: providers and route definitions
```
