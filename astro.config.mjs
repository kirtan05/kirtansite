// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import learningGuard from './src/integrations/learning-guard.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://kirtanjain.com',

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: cloudflare({
    // Bindings are unavailable in `astro dev` unless the adapter runs the
    // platform proxy. Without this, every /learning page 503s locally.
    platformProxy: { enabled: true, configPath: './wrangler.jsonc' }
  }),

  integrations: [
    sitemap({
      // /learning is private. It must never appear in the sitemap, and the
      // sitemap is generated from prerendered routes — so this filter and the
      // build-time prerender guard below are two halves of the same defence.
      filter: (page) => !/^\/(learning|gree)(\/|$)/.test(new URL(page).pathname)
    }),
    learningGuard()
  ]
});
