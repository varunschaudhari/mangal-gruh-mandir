import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `vite build --mode mobile` produces the bundle for the Capacitor apps (see MOBILE.md).
// Native apps ship their assets inside the APK/IPA, so the PWA service worker is skipped.
export default defineConfig(({ mode }) => ({
  // Build date, sent with crash reports (utils/errorReporter.js) to tell versions apart.
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    mode !== 'mobile' && VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,   // we register manually in main.jsx so we can catch SSL errors
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Mangal Grah Mandir Stock',
        short_name: 'MGM Stock',
        description: 'Stock Management System — Mangal Grah Mandir, Amalner',
        theme_color: '#FF8C00',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        // html is intentionally excluded — always fetch fresh so new chunk hashes in HTML are never stale
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  server: {
    port: 3000,
    // /shared (code used by both app and server) sits next to client/
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
}));
