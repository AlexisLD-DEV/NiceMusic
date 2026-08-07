import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        name: 'NiceMusic',
        short_name: 'NiceMusic',
        description: 'Votre musique, partout — remplaçant Deezer sans VPS',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        categories: ['music', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        screenshots: [
          {
            src: 'https://music.ledeunf.fr/preview-mobile.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow'
          },
          {
            src: 'https://music.ledeunf.fr/preview-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide'
          }
        ],
        shortcuts: [
          {
            name: 'Lecture',
            short_name: 'Lecture',
            description: 'Lire la musique',
            url: '/',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ],
        prefer_related_applications: false
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  server: {
    proxy: {
      // En dev : le frontend appelle le Worker local (pnpm worker:dev)
      '/api': 'http://localhost:8787'
    }
  }
})
