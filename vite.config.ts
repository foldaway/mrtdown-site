import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    reactRouter(),
    tailwindcss(),
    tsconfigPaths(),
    {
      name: 'react-intl',
      enforce: 'post',
      buildEnd() {
        console.log('Extracting i18n...');
        const out = execSync('npm run i18n:extract');
        console.log(out);
      },
    },
  ],
});
