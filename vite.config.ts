import { execSync } from 'node:child_process';
import {
  type SentryTanstackStartOptions,
  sentryTanstackStart,
} from '@sentry/tanstackstart-react/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { DateTime } from 'luxon';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const sentryConfig: SentryTanstackStartOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {
    name: process.env.GIT_SHA ?? 'development',
  },
  telemetry: false,
  debug: true,
};

// https://vite.dev/config/
export default defineConfig((config) => {
  return {
    server: {
      port: 3000,
    },
    ssr: {
      noExternal: [
        '@heroicons/*',
        '@radix-ui/*',
        '@floating-ui/*',
        'posthog-js',
        '@posthog/react',
      ],
    },
    define: {
      __APP_BUILD_TIMESTAMP__: JSON.stringify(
        DateTime.now().setZone('Asia/Singapore').toISO(),
      ),
      __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? ''),
      __SENTRY_ENVIRONMENT__: JSON.stringify(process.env.TIER ?? 'development'),
      __SENTRY_RELEASE__: JSON.stringify(process.env.GIT_SHA ?? 'development'),
    },
    plugins: [
      tanstackStart({
        srcDirectory: 'app',
        router: {
          // Ignores files/folders containing 'components', 'hooks', or ending in '.test.tsx'
          routeFileIgnorePattern: '((components|hooks)|.test.tsx)',
        },
      }),
      tailwindcss(),
      viteReact(),
      tsconfigPaths(),
      nitro(),
      {
        name: 'react-intl',
        enforce: 'post',
        buildEnd() {
          console.log('Extracting i18n...');
          const out = execSync('npm run i18n:extract');
          console.log(out);
        },
      },
      sentryTanstackStart(sentryConfig),
    ],
  };
});
