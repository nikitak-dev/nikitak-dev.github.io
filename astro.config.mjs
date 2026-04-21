import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nikitak-dev.github.io',
  // base: '/' is the default — no base needed for username.github.io repo
  integrations: [sitemap()],
  vite: {
    server: {
      // Dev-only: proxy /webhook/* to n8n so the browser sees same-origin
      // (bypasses CORS — n8n webhook allowlist is prod-origin only).
      // Prod build is unaffected.
      proxy: {
        '/webhook': {
          target: 'https://n8n.nikitakdev.uk',
          changeOrigin: true,
          secure: true,
          headers: {
            // Force Origin the n8n allowlist already accepts, so n8n's
            // CORS reply is valid even though the browser does not check
            // (same-origin via proxy).
            Origin: 'https://nikitak-dev.github.io',
          },
        },
      },
    },
  },
});