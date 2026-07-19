# Wraps & Coffee — Admin Dashboard & Kiosk Display

The owner-facing admin dashboard and fullscreen kiosk/digital-signage display system for Wraps & Coffee, a cozy cafe serving wraps, baguettes, pizza, nacho plates, salads and a varied selection of coffee and drinks. The customer-facing marketing/ordering website is a separate project; this repo is just the owner's own tools: a login-gated dashboard for managing the menu, events, messages, orders and more, plus any number of fullscreen kiosk displays (`/screens/:screenId`) for extra monitors/TVs around the cafe.

Runs alongside an optional local server (`server/`) — a small Node/WebSocket process on the same network — that keeps every device (admin laptop, kiosk displays, a second admin's phone) in sync in real time, handles image uploads, and can optionally bridge to a separate public website's own database (see "Website integration" below). With that server unreachable, the app still works from each device's own browser storage, just without cross-device sync.

## Features

- **Owner admin dashboard** (`/admin`, `src/features/admin`) — real login (seeded `admin`/`1234` on first boot; see "Authentication" below), a sticky sidebar nav, and:
  - **Overview** — stat tiles (revenue, orders, top sellers, customers).
  - **Messages** — inbox for contact-form submissions (local, or pulled from the public website — see "Website integration"), markable as read.
  - **Products** — organized as catalogues (e.g. "Food menu", a separate "Merch" catalogue for non-food items) → each catalogue's own categories → each category's own products, all admin-created/renamed/deleted (delete asks for confirmation) and drag-reorderable. Bilingual (English/Norwegian) name/description, an optional image on both categories and products, per-item or category-default pricing, an optional percentage- or amount-off discount (shown struck-through alongside the new price, highlighted on the item), allergen checkboxes, availability toggle.
  - **Events** — full CRUD for cafe events (recurring, postponed, cancelled occurrences; registration on/off).
  - **Contact info** — phone/email/address/opening hours.
  - **Orders** — online orders placed on the public website, pulled down live via the Neon bridge; change status here and it reflects back on the website's own order-status page.
  - **Screens** — the digital signage manager described below.
  - **Extensions** — enable/configure two live-data screen-slot kinds (Ruter transit departures, Yr weather), based on the cafe's address in Contact info.
  - **Images** (admin/subadmin only) — every image currently stored on the local server, view-only.
  - **Settings** — interface language, which sidebar items this cafe's dashboard shows, and a "For developers" API reference page (see below).
- **Sidebar customization** (Settings → Sidebar items) — different cafes need different things; any section except Overview/Settings can be hidden from the sidebar entirely.
- **Screens (digital signage)** (`/screens/:screenId`, `src/features/screens` + `src/features/admin/screens`) — configure any number of fullscreen kiosk displays, each showing up to 4 independent content slots:
  - Per-slot content: a catalogue (pick which one, then which of its categories to show), one of several event views (an upcoming-events calendar list, a single upcoming event's own photo or details by ordinal position, or every event in the current month with optional price/description), a single centered image, a QR code linking to an admin-typed URL (drawn in a single flat color matched to the pane's own contrast, no white background box), real-time transit departures, an hourly weather forecast, a message board post, a short admin-authored announcement, or nothing — freely changed without ever losing a hidden slot's own settings.
  - Per-slot slideshow rotation on a shared, screen-wide timer, with a fade or slide transition; dragging a border or opening an editor pauses the rotation until "Play" is pressed again.
  - An explicit "number of slots" (1-4) and on-screen arrangement, independent of whether each slot has content yet.
  - Text-size controls at every level, editable either live on the display itself or from the admin dashboard's tabbed screen editor.
  - Background color/image per screen and per slot, and shared borders with an adjustable color.
  - **In-place editing on a dedicated editor URL** — each screen has its own `/screens/editor/:screenId` link (the "Editor" button, next to "Open," in the admin Screens list) that, for a logged-in admin session, offers the same editing toolbar as the dashboard's own screen editor directly on the live display (resizing/splitting/clearing panes, dropping an image onto one, appearance controls). The plain `/screens/:screenId` URL real kiosk deployments use (opened via "Open") is always fully read-only, even from a logged-in device, so a live kiosk can never be accidentally edited. A **Live editing** toggle in the editor's toolbar switches between writing straight to the published screen (the default) and staging changes privately as a draft — invisible to every other viewer — until an explicit **Publish** makes them live everywhere.
  - **Screen saver** — a shared daily start/end window that any screen opted in to goes solid black during.
- **Extensions** (`src/features/admin/extensions`, `server/extensions.ts`) — two live-data integrations, both derived from the cafe's address via the local server's `/extensions/*` proxy routes (Entur's geocoder + JourneyPlanner v3, and MET Norway's Locationforecast API): real-time bus/train departures from admin-chosen nearby stops, and an hourly weather forecast — each with an admin-configurable count/hours-ahead, and their own icon sets.
- **Website integration** (`server/neonBridge.ts`, `server/neonMappers.ts`) — an optional bridge to a separate public website's own Neon Postgres database: pushes admin-edited products, category prices, contact info and events up to it live (using that database's own `pg_notify` triggers plus a full reconciliation pass on every connect), and pulls contact messages and online orders back down into this dashboard. A developer API key, generated from Settings → For developers, is what the public website's own contact/order forms use to authenticate their submissions. See `NEON_DATABASE_URL` below to enable it.
- **For developers** (Settings → For developers) — reference documentation for the local server's own HTTP/WebSocket API (authentication, every synced data key, image uploads, the Extensions proxy, the Website integration), for anyone building a custom client against this cafe's own data.
- **Error notifications** — background/operational problems (e.g. the Website integration losing its connection) surface as a small box, top-right, across the whole admin dashboard; click it for the full detail.
- **Local LAN sync server** (`server/`) — optional Node/WebSocket process, run alongside the app: real multi-user login (`admin`/`subadmin`/`limited` roles, the latter scoped to specific dashboard sections), keeps every synced piece of admin data in sync across devices in real time, and handles image uploads with automatic `-small`/`-thumb` WebP compression.
- **Light / dark theme** that follows the OS preference by default, toggleable, and persisted.
- **Internationalization (i18n)** with English and Norwegian, easy to extend with more languages (`src/i18n`).
- **Offline resilience** via the PWA app-shell precache, so a kiosk display keeps working through a network drop — independent of, and unaffected by, the optional Website integration also being unreachable.

## Tech stack

- **[Vite](https://vitejs.dev/)** — dev server and build tooling.
- **[React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)** — UI and type safety.
- **[react-router-dom](https://reactrouter.com/)** — client-side routing.
- **[Sass](https://sass-lang.com/)** — component styling with theme variables (`src/styles`).
- **[Framer Motion](https://www.framer.com/motion/)** — animations (e.g. the `TranslatedText` fade transition, screen-display transitions).
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — precaches the built app so it can reload fully offline (used so screen displays keep working through a network drop; configured in `vite.config.ts`).
- **[ESLint](https://eslint.org/)** — linting.
- **[ws](https://github.com/websockets/ws)** — WebSocket server powering the optional local LAN sync server (`server/`), keeping the admin dashboard and kiosk displays in sync across devices.
- **[tsx](https://tsx.is/)** — runs the local server's TypeScript directly, with `tsx watch` for live-reload during `npm run dev`.
- **[concurrently](https://github.com/open-cli-tools/concurrently)** — runs the Vite dev/preview server and the local sync server together under one `npm run dev`/`npm run preview`.
- **[sharp](https://sharp.pixelplumbing.com/)** — server-side image compression for uploaded images (generates `-small`/`-thumb` WebP variants).
- **[pg](https://node-postgres.com/)** — direct Postgres client for the optional Neon bridge (`server/neonBridge.ts`), pushing/pulling business data (menu, events, contact info, messages, orders) to/from the public website's own database.
- **[qrcode.react](https://github.com/zpao/qrcode.react)** — renders the "QR code" screen-slot kind as an SVG, drawn in a single flat color with a transparent background.
- **[@dnd-kit](https://dndkit.com/)** — drag-and-drop reordering for the admin Products feature's catalogue/category/product lists (mouse and touch alike).
- **[bonjour-service](https://github.com/onlxltd/bonjour-service)** — advertises a friendly `<name>.local` mDNS hostname for this machine (Settings → Advanced's "Auto .local name" screen-address mode).
- **[simple-icons](https://simpleicons.org/)** — CC0-licensed official brand SVG marks, used for the real logos shown in the Extensions page's "Coming soon" integrations directory.

## Getting started

```sh
npm install
npm run dev      # start the Vite dev server + local sync server together
npm run build    # type-check and build for production
npm run preview  # preview the production build + local sync server together
npm run lint     # run eslint
```

The local server binds to all interfaces (`--host`), so it's reachable from other devices on the same network — open `http://<this machine's LAN IP>:5173` from a kiosk device or a second admin's phone.

Environment variables (all optional — the app works with none of them set):

| Variable | Default | Purpose |
| --- | --- | --- |
| `WS_PORT` | `4000` | Port the local sync server listens on. |
| `WEATHER_USER_AGENT` | a generic string | Identifies this app to MET Norway's weather API — set to include a real contact email as a courtesy to them. |
| `NEON_DATABASE_URL` | unset | Enables the Website integration (see above) — Neon's **unpooled** Postgres connection string. No tunnel or port-forwarding needed: the connection is entirely outbound, from this server to Neon's public endpoint. |

On first boot, the local server seeds one admin account (`admin` / `1234`) — change the password from the Users-management flow once you're set up.

## Project structure

```
server/             # Optional local LAN sync server (Node, run via tsx)
  index.ts          # HTTP + WebSocket entry point, routing, auth checks
  store.ts          # In-memory + on-disk state for every synced key, users, sessions, developer API key
  http.ts           # Small HTTP helpers (CORS, JSON body/response)
  uploads.ts        # Image upload/compression/serving
  extensions.ts     # Ruter/Yr proxy (transit departures, weather)
  neonBridge.ts      # Optional bridge to the public website's own Neon database
  neonMappers.ts     # Row <-> app-type mapping for the Neon bridge
  data/              # Gitignored: persisted state, uploaded images, users/sessions
src/
  components/        # Reusable UI components (see src/components/index.ts)
  data/               # Bundled seed data for each admin dataset (src/data/*.json)
  features/
    admin/            # Owner dashboard (/admin), one folder per sidebar section
      layout/         # AdminLayout, AdminDashboard, AdminSidebarNav
      extensions/      # Ruter/Yr integration setup
      settings/        # Language, sidebar visibility, "For developers" docs
      screens/          # ScreensView (list) + tabbed ScreenForm (per-slot settings)
      ...               # messages/ products/ events/ contact/ orders/ overview/ login/ imageLibrary/
    screens/            # Shared by the admin screen editor and the public kiosk display:
                        # SplitLayout, EventCalendarSlide/EventImageSlide/EventDetailsSlide/EventMonthSlide/ImageSlide/QrCodeSlide/TransitSlide/WeatherSlide,
                        # SlotContent, TextSizeEditor, GlobalTextSizeScaler, SlotEditor, ScreenToolbar
  hooks/               # Custom React hooks, one useLocalStorage-backed hook per admin dataset
  i18n/                # Language/translation setup (languages.json, useLanguage)
  lib/                 # Client-side integration code: localServer.ts (HTTP calls), syncClient.ts (WebSocket), errorNotifications.ts
  pages/               # Route-level views (ScreenDisplay.tsx — the public fullscreen kiosk display)
  styles/              # Global styles and theme tokens/variables
  types/               # Shared TypeScript types
  utils/               # Pure helper functions (event occurrence/date logic, screen layout math, etc.)
  main.tsx             # Entry point: providers and route definitions
```

## Credits

The admin dashboard's top navbar + cascading sidebar layout is adapted from [Kamilica's AgentFire admin CodePen](https://codepen.io/Kamilica/pen/XRbvaL) (structure only — colors/typography are this app's own theme).

The Integrations page's "activate" checkbox is adapted from a [Uiverse.io](https://uiverse.io/) checkbox by chase2k25 (structure/animation only — colors are this app's own theme).
