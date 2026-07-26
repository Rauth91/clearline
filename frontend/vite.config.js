import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      minify: false,
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png',
        '_redirects',
      ],
      manifest: {
        name: 'ClearLine',
        short_name: 'ClearLine',
        description: 'Field VoIP ops console — surveys, design, go-live',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#07080a',
        background_color: '#020509',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell: HTML, JS/CSS chunks, fonts, icons
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webp}'],
        // Hard refresh offline on any path → SPA shell (hash routes stay client-side)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        mode: 'development',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
