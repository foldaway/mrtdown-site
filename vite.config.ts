import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { getLoadContext } from './server/load-context';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { cloudflareDevProxy } from '@react-router/dev/vite/cloudflare';
import { execSync } from 'node:child_process';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    cloudflareDevProxy({
      getLoadContext,
    }),
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
