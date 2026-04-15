import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nikitak-dev.github.io',
  // base: '/' is the default — no base needed for username.github.io repo
  integrations: [sitemap()],
});