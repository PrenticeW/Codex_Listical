import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA app shell (docs/offline-sync-plan.md, Phase 3). Precaches the
    // built JS/CSS and serves index.html for navigations, so the site
    // cold-loads with no connection; plannerOffline's IndexedDB layer then
    // hydrates the System page's data. Supabase requests are NOT cached —
    // cross-origin calls get no runtime caching unless listed here, which is
    // exactly right: data freshness is owned by the storage modules, never
    // the service worker.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon-pastel-pink.svg',
        'favicon-pastel-pink-32.png',
        'favicon-pastel-pink-16.png',
        'apple-touch-icon-pastel-pink.png',
      ],
      manifest: {
        name: 'Tacular',
        short_name: 'Tacular',
        description:
          'Tacular is a 12 week cycle planning tool for creative practitioners.',
        theme_color: '#F9D3E1',
        background_color: '#F9D3E1',
        display: 'standalone',
        icons: [
          {
            src: '/favicon-pastel-pink-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon-pastel-pink-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/favicon-pastel-pink-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA navigations fall back to the cached shell — but never the API
        // routes.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts stylesheet (index.html loads Mulish from here).
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-styles' },
          },
          {
            // The font binaries themselves — immutable, cache hard.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174
  },
  preview: {
    host: '0.0.0.0',
    port: 5174
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
