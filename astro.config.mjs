import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dexterwenjieteo.github.io',
  output: 'static',
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
