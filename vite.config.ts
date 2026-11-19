/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Relativ base gjør at samme bygg virker både på Netlify (rot) og GitHub Pages (/repo-navn/).
export default defineConfig({
  base: process.env.BASE_PATH || './',
  define: {
    __APP_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '1.0.0'} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`),
  },
  build: {
    // iPadOS 16.6 = Safari 16.6
    target: ['es2020', 'safari16'],
  },
  plugins: [
    svelte(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,webmanifest,ico}'],
      },
      manifest: {
        name: 'Tekstbok',
        short_name: 'Tekstbok',
        description: 'Sangtekster på scenen – fungerer uten nett',
        lang: 'no',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#111111',
        background_color: '#111111',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
