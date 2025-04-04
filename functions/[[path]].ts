import { createPagesFunctionHandler } from '@react-router/cloudflare';
import type { ServerBuild } from 'react-router';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - the server build file is generated by `remix vite:build`
// eslint-disable-next-line import/no-unresolved
import * as buildImport from '../build/server';
import { getLoadContext } from '../server/load-context';

const build = buildImport as unknown as ServerBuild;

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext,
} as {
  build: ServerBuild;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  getLoadContext: any;
});
