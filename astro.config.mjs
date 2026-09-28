// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://magnetaros.com',
  integrations: [sitemap()],
  vite: {
    build: {
      // The field's three.js chunk is about 900 kB (244 kB gzip) after tree-shaking
      // and is loaded on demand by the hero, after the page script. Allow it, and
      // warn if any chunk grows past it.
      chunkSizeWarningLimit: 1000,
    },
  },
});
