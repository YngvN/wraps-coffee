# Wraps & Coffee — Admin Dashboard & Kiosk Display

The owner-facing admin dashboard and fullscreen kiosk/digital-signage display system for Wraps & Coffee, a cozy cafe serving wraps, baguettes, pizza, nacho plates, salads and a varied selection of coffee and drinks. The customer-facing marketing/ordering website is a separate project; this repo is just the owner's own tools: a login-gated dashboard for managing the menu, events, messages, orders and more, plus any number of fullscreen kiosk displays (`/screens/:screenId`) for extra monitors/TVs around the cafe.

Runs alongside an optional local server (`server/`) — a small Node/WebSocket process on the same network — that keeps every device (admin laptop, kiosk displays, a second admin's phone) in sync in real time, handles image/video uploads (transcoding any uploaded video into a browser-safe, compressed MP4), and can optionally bridge to a separate public website's own database (see "Website integration" below). With that server unreachable, the app still works from each device's own browser storage, just without cross-device sync.

## Features

- **Owner admin dashboard** (`/admin`, `src/features/admin`) — real login (seeded `admin`/`1234` on first boot; see "Authentication" below), a sticky sidebar nav, and:
  - **Overview** — stat tiles (revenue, orders, top sellers, customers).
  - **Messages** — inbox for contact-form submissions (local, or pulled from the public website — see "Website integration"), markable as read.
  - **Products** — organized as catalogues (e.g. "Food menu", a separate "Merch" catalogue for non-food items) → each catalogue's own categories → each category's own products, all admin-created/renamed/deleted (delete asks for confirmation) and drag-reorderable. Bilingual (English/Norwegian) name/description, an optional image on both categories and products, per-item or category-default pricing, an optional percentage- or amount-off discount (shown struck-through alongside the new price, highlighted on the item), allergen checkboxes, availability toggle.
  - **Events** — full CRUD for cafe events (recurring, postponed, cancelled occurrences; registration on/off).
  - **Contact info** — phone/email/address/opening hours.
  - **Orders** — online orders placed on the public website (pulled down live via the Neon bridge), merged with any Wolt/Foodora delivery orders in the same list (see "Delivery platform integrations" below); change status here and it reflects back on the website's own order-status page, or the matching delivery platform's own order.
  - **Screens** — the digital signage manager described below.
  - **Extensions** — enable/configure live-data screen-slot kinds: Ruter transit departures and a Yr weather forecast (both based on the cafe's address in Contact info), rotating RSS headlines from a fixed set of Norwegian news outlets, plus the Wolt/Foodora delivery-order integrations described below.
  - **Media library** (admin/subadmin only) — every image/video currently stored on the local server: an "+ Add" button or drag-and-drop to upload (a video transcodes into a browser-safe MP4 in the background, tracked by a live progress bar that keeps going even if you navigate elsewhere, plus a top-navbar upload indicator), rename, delete, retry a failed video transcode, a used/free storage summary, and a fullscreen lightbox (arrow-key or on-screen prev/next navigation) for reviewing an item full-size.
  - **Settings** — interface language, which sidebar items this cafe's dashboard shows, a "For developers" API reference page, and (admin/subadmin only) a "Testing" page for switching individual integrations between their own development and production environments (see below).
- **Sidebar customization** (Settings → Sidebar items) — different cafes need different things; any section except Overview/Settings can be hidden from the sidebar entirely.
- **Screens (digital signage)** (`/screens/:screenId`, `src/features/screens` + `src/features/admin/screens`) — configure any number of fullscreen kiosk displays, each showing up to 4 independent content slots:
  - Per-slot content: a catalogue (pick which one, then which of its categories to show), one of several event views (an upcoming-events calendar list, a single upcoming event's own photo or details by ordinal position, or every event in the current month with optional price/description), a single centered image, a single video, a QR code (drawn in a single flat color matched to the pane's own contrast, no white background box) linking to either an admin-typed URL or a news source's own latest article — "Automatic" (the default) follows whichever headline a News pane elsewhere on the same screen is currently showing, or a specific source can be picked instead, either way with that source's own logo embedded in the code and the pane optionally themed to match, real-time transit departures, an hourly weather forecast, rotating RSS headlines from a chosen set of news sources (also themeable to the current headline's own source), a message board post, a short admin-authored announcement, or nothing — freely changed without ever losing a hidden slot's own settings.
  - **Video panes** — a video keeps playing uninterrupted through a stage transition, pane resize, or a pane's own identity changing underneath it (e.g. right after a split duplicates it into two panes at once, which then stay in sync with each other); per-pane options for muting/setting its volume, resizing its own pane to lock onto the video's aspect ratio (same "resize to fit" a single image already offers, draggable like any other pane border), advancing to the next stage automatically once it ends instead of looping, and restarting from 0 whenever the screen's stage rotation comes back around to stage 1. A display fully downloads a video (via the browser's own Cache API) ahead of when its stage actually needs it, rather than streaming it live each time.
  - Per-slot slideshow rotation on a shared, screen-wide timer, with a fade or slide transition; dragging a border or opening an editor pauses the rotation until "Play" is pressed again.
  - An explicit "number of slots" (1-4) and on-screen arrangement, independent of whether each slot has content yet.
  - Text-size controls at every level, editable either live on the display itself or from the admin dashboard's tabbed screen editor.
  - Background color/image per screen and per slot, and shared borders with an adjustable color.
  - **In-place editing on a dedicated editor URL** — each screen has its own `/screens/editor/:screenId` link (the "Editor" button, next to "Open," in the admin Screens list) that, for a logged-in admin session, offers the same editing toolbar as the dashboard's own screen editor directly on the live display (resizing/splitting/clearing panes, dropping an image onto one, appearance controls). The plain `/screens/:screenId` URL real kiosk deployments use (opened via "Open") is always fully read-only, even from a logged-in device, so a live kiosk can never be accidentally edited. A **Live editing** toggle in the editor's toolbar switches between writing straight to the published screen (the default) and staging changes privately as a draft — invisible to every other viewer — until an explicit **Publish** makes them live everywhere.
  - **Screen saver** — a shared daily start/end window that any screen opted in to goes solid black during.
- **Extensions** (`src/features/admin/extensions`, `server/extensions.ts`) — two live-data integrations derived from the cafe's address via the local server's `/extensions/*` proxy routes (Entur's geocoder + JourneyPlanner v3, and MET Norway's Locationforecast API): real-time bus/train departures from admin-chosen nearby stops, and an hourly weather forecast — each with an admin-configurable count/hours-ahead, and their own icon sets. A third, address-independent **News** integration (`server/news.ts`) lets the admin enable any of 7 seeded Norwegian outlets (NRK, VG, Aftenposten, Dagbladet, Nettavisen, Dagsavisen, Klar Tale); a News screen slot then rotates headlines from whichever of those are picked, and a QR code slot can link to one of those articles (see "Screens" above).
- **Delivery platform integrations** (the Wolt/Foodora cards on the Integrations page, `server/woltPoller.ts`/`server/woltAdapter.ts`, `server/foodoraPoller.ts`/`server/foodoraAdapter.ts`) — pulls delivery orders from Wolt's and Foodora's own POS Integration APIs into the same Orders view as website orders (each tagged with a small source badge), on a 30-second background poll plus a manual "Sync now," and pushes status changes made there back to whichever platform the order came from. Each platform's venue ID/API key is entered on its own Integrations card (admin/subadmin only); a "Use development environment" checkbox per platform (Settings → Testing) points its outbound calls at that platform's own sandbox host instead of production. Foodora's own base URL isn't confirmed yet — pending real partner API access — so only Wolt can reach a live endpoint today.
- **Website integration** (`server/neonBridge.ts`, `server/neonMappers.ts`) — an optional bridge to a separate public website's own Neon Postgres database: pushes admin-edited products, category prices, contact info and events up to it live (using that database's own `pg_notify` triggers plus a full reconciliation pass on every connect), and pulls contact messages and online orders back down into this dashboard. A developer API key, generated from Settings → For developers, is what the public website's own contact/order forms use to authenticate their submissions. See `NEON_DATABASE_URL` below to enable it.
- **For developers** (Settings → For developers) — reference documentation for the local server's own HTTP/WebSocket API (authentication, every synced data key, image/video uploads, the Extensions proxy, the delivery platform integrations, the Website integration), for anyone building a custom client against this cafe's own data.
- **Error notifications** — background/operational problems (e.g. the Website integration losing its connection) surface as a small box, top-right, across the whole admin dashboard; click it for the full detail.
- **Local LAN sync server** (`server/`) — optional Node/WebSocket process, run alongside the app: real multi-user login (`admin`/`subadmin`/`limited` roles, the latter scoped to specific dashboard sections), keeps every synced piece of admin data in sync across devices in real time, and handles image uploads with automatic `-small`/`-thumb` WebP compression, plus video uploads transcoded into a browser-safe MP4 with a poster frame.
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
- **[sharp](https://sharp.pixelplumbing.com/)** — server-side image compression for uploaded images (generates `-small`/`-thumb` WebP variants), and video poster-frame compression (`server/videoUploads.ts`).
- **[fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)** + **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)** + **[ffprobe-static](https://github.com/joshwnj/ffprobe-static)** — server-side video transcoding (`server/videoUploads.ts`): any uploaded video format is probed then transcoded to a browser-safe, compressed H.264/AAC MP4, with a poster frame extracted alongside it.
- **[file-type](https://github.com/sindresorhus/file-type)** — cheap magic-bytes pre-check on an uploaded video before the real (and more expensive) `ffprobe` gate.
- **[pg](https://node-postgres.com/)** — direct Postgres client for the optional Neon bridge (`server/neonBridge.ts`), pushing/pulling business data (menu, events, contact info, messages, orders) to/from the public website's own database.
- **[qrcode.react](https://github.com/zpao/qrcode.react)** — renders the "QR code" screen-slot kind as an SVG, drawn in a single flat color with a transparent background; embeds a news source's own logo in the code (with the surrounding modules excavated for scannability) when linked to a news article.
- **[rss-parser](https://github.com/rbren/rss-parser)** — fetches and normalizes RSS/Atom headlines server-side (`server/news.ts`) for the News integration, across several outlets' own differently-shaped feeds.
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
  uploads.ts        # Image upload/compression/serving, plus rename/storage-usage routes shared by videoUploads.ts
  videoUploads.ts   # Video upload -> ffmpeg transcode (browser-safe MP4) + poster frame, background queue, retry
  extensions.ts     # Ruter/Yr proxy (transit departures, weather)
  woltAdapter.ts     # Wolt's own POS Integration API calls (stubbed pending real partner docs)
  woltPoller.ts      # Background sync loop for Wolt delivery orders
  foodoraAdapter.ts  # Foodora's own POS Integration API calls (stubbed, no confirmed base URL yet)
  foodoraPoller.ts   # Background sync loop for Foodora delivery orders
  neonBridge.ts      # Optional bridge to the public website's own Neon database
  neonMappers.ts     # Row <-> app-type mapping for the Neon bridge
  data/              # Gitignored: persisted state, uploaded images/videos, users/sessions
src/
  components/        # Reusable UI components (see src/components/index.ts)
  data/               # Bundled seed data for each admin dataset (src/data/*.json)
  features/
    admin/            # Owner dashboard (/admin), one folder per sidebar section
      layout/         # AdminLayout, AdminDashboard, AdminSidebarNav
      extensions/      # Ruter/Yr integration setup, plus the Wolt/Foodora delivery-order cards
      settings/        # Language, sidebar visibility, "For developers" docs, Testing (dev/production environment per integration)
      screens/          # ScreensView (list) + tabbed ScreenForm (per-slot settings)
      mediaLibrary/     # MediaLibraryView (upload/rename/delete/storage summary) + MediaViewerModal (fullscreen lightbox)
      ...               # messages/ products/ events/ contact/ orders/ overview/ login/
    screens/            # Shared by the admin screen editor and the public kiosk display:
                        # SplitLayout, EventCalendarSlide/EventImageSlide/EventDetailsSlide/EventMonthSlide/ImageSlide/VideoSlide/QrCodeSlide/TransitSlide/WeatherSlide,
                        # SlotContent, TextSizeEditor, GlobalTextSizeScaler, SlotEditor, ScreenToolbar
  hooks/               # Custom React hooks, one useLocalStorage-backed hook per admin dataset
  i18n/                # Language/translation setup (languages.json, useLanguage)
  lib/                 # Client-side integration code: localServer.ts (HTTP calls), syncClient.ts (WebSocket), errorNotifications.ts, uploadManager.ts (page-navigation-independent upload tracking/progress)
  pages/               # Route-level views (ScreenDisplay.tsx — the public fullscreen kiosk display)
  styles/              # Global styles and theme tokens/variables
  types/               # Shared TypeScript types
  utils/               # Pure helper functions (event occurrence/date logic, screen layout math, etc.)
  main.tsx             # Entry point: providers and route definitions
```

## Known bugs

- **A pane's content sometimes still flashes/pulses on a pure resize** — a pane whose own content hasn't actually changed between two stages can occasionally replay its fade/slide transition anyway when only its *size* changes (e.g. a sibling pane's `resizeToFit` locking in, or a divider drag propagated forward across future stages via "keep for next steps too") — most visible as a brief background/video "pulse" instead of a smooth resize. `LayoutPane.tsx`'s crossfade (`useCrossfadeSlot`) is keyed on the resolved content's own value specifically to avoid this, but it isn't fully eliminated yet.
- **`resizeToFit` can leave dead space around the media in some arrangements** — an image/video pane's own aspect-ratio lock can only adjust an axis that actually has a divider governing it (see `paneResizableAxes` in `src/utils/screenLayout.ts`). A pane that spans the full height (or width) of the screen with nothing dividing that axis can only be resized along its *other* axis, so the media's own aspect ratio isn't always matched exactly — the pane's own background shows through as dead space on the unconstrained side.
- **Splitting panes can sometimes leave a shared border "locked" across a whole row/column** — after some sequences of splits, two or more panes' dividers can end up moving together (or simply refusing to move individually) instead of resizing just the one border being dragged, with no in-app way found yet to un-link them — deleting the affected panes and re-splitting from scratch is the only known workaround so far. Possibly related to `PaneCornerHandle`'s own "merged handle" behavior (`LayoutTree.tsx`), which deliberately moves two aligned dividers together once they coincide into a true "+" intersection, but this can turn up even where that doesn't look like the case.

## Credits

The admin dashboard's top navbar + cascading sidebar layout is adapted from [Kamilica's AgentFire admin CodePen](https://codepen.io/Kamilica/pen/XRbvaL) (structure only — colors/typography are this app's own theme).

The Integrations page's "activate" checkbox is adapted from a [Uiverse.io](https://uiverse.io/) checkbox by chase2k25 (structure/animation only — colors are this app's own theme).
