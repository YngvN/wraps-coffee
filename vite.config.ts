import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
