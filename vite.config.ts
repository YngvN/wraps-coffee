import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // A screen link normally addresses this dev server by its mDNS name
    // (`<store name>-screen.local`, derived per-store in `deriveMdnsName` —
    // see `server/mdns.ts`) rather than a raw LAN IP, so it keeps working
    // across router/computer restarts (see the README's "Getting started").
    // Vite's dev server otherwise rejects any request whose `Host` header
    // isn't in this list — the leading dot allows every such hostname, not
    // just today's store name, which would otherwise break the moment the
    // store's own name (and therefore its mDNS name) changes.
    allowedHosts: ['.local'],
  },
  plugins: [
    react(),
    // Precaches the built app shell (JS/CSS/HTML/icons) so an already-visited
    // screen display can reload and keep working with zero internet — the
    // price/menu/event data it shows already lives in the browser's own
    // localStorage, not a network call, so once the app itself can boot up
    // offline there's nothing else standing in the way of a full offline
    // reload. Only affects production builds (`vite build` + serving
    // `dist/`); the dev server is unaffected.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Store Dashboard',
        short_name: 'Store Dashboard',
        description: 'Admin dashboard and kiosk screen displays for a store/business.',
        theme_color: '#dfa93e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Deliberately does **not** include `woff2`. The self-hosted font set
        // (public/fonts, see scripts/fetch-google-fonts.mts) is ~36 MB across
        // ~2000 files, and precaching it would make every service-worker
        // install download the entire Google Fonts catalogue up front to serve
        // the two or three faces a given screen actually uses. The generated
        // stylesheet is matched by `css` above and precached, which is what
        // lets the runtime rule below resolve the handful of files that matter.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Raised from the default 2 MB: the generated google-fonts.css is a
        // single ~800 KB entry covering all 999 families, and the default limit
        // would silently drop it from the precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Replaces two rules that pointed at fonts.googleapis.com and
            // fonts.gstatic.com. Nothing requests those any more — fonts are
            // served same-origin from the local server (see index.html) — so
            // those rules had become dead configuration. This one caches each
            // woff2 the first time a screen actually renders with it, which
            // spreads the cost across only the faces in use instead of paying
            // for all 2000 up front, and then survives a local-server restart.
            urlPattern: ({ url }) => url.pathname.startsWith('/fonts/files/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'self-hosted-fonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
