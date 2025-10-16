import { execSync } from 'node:child_process';
import { reactRouter } from '@react-router/dev/vite';
import {
  type SentryReactRouterBuildOptions,
  sentryReactRouter,
} from '@sentry/react-router';
import tailwindcss from '@tailwindcss/vite';
import { DateTime } from 'luxon';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const sentryConfig: SentryReactRouterBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA ?? 'development',
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
      noExternal: ['@heroicons/*', '@radix-ui/*', '@floating-ui/*'],
    },
    define: {
      __APP_BUILD_TIMESTAMP__: JSON.stringify(
        DateTime.now().setZone('Asia/Singapore').toISO(),
      ),
      __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? ''),
      __SENTRY_ENVIRONMENT__: JSON.stringify(
        process.env.VERCEL_ENV ?? 'development',
      ),
      __SENTRY_RELEASE__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_SHA ?? 'development',
      ),
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
      sentryReactRouter(sentryConfig, config),
    ],
  };
});
