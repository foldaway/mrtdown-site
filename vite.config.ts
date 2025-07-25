import { execSync } from 'node:child_process';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  ssr: {
    noExternal: ['@heroicons/*', '@radix-ui/*', '@floating-ui/*'],
  },
  plugins: [
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
